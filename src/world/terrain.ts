import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { applyGround } from '../render/surface';
import { noiseTexture } from '../render/textures';
import { Cell, Fluid, Ground, type ZoneLayout } from './layout';

/**
 * Terrain for a zone: one continuous height grid (vertices at cell corners) split into
 * - flat ground: everything walkable and its gentle shore slopes (never dissolved), and
 * - relief: cliffs, plateaus and cave rock rising out of the same grid (dissolves around the
 *   hero like trees do, so a cliff never hides them);
 * plus animated water/lava surfaces over Fluid cells. Units stand at y = 0 on walkable cells;
 * raised terrain only ever rises on cells that block movement.
 */

/** Default relief height per blocking cell type (plateaus/walls can override via layout.elev). */
const CLIFF_H = 3.2;
const CAVE_WALL_H = 3.6;
/** Fluid beds sink below the surface; the surface sits at WATER_Y. */
const BED_Y = -1.0;
export const WATER_Y = -0.28;

const SPLAT: Record<number, number> = {
  [Ground.Dirt]: 0, [Ground.Path]: 0, [Ground.Camp]: 0, [Ground.Grass]: 1,
  [Ground.Arena]: 2, [Ground.Stone]: 2, [Ground.Cave]: 3, [Ground.Scorch]: 3,
};

/** Smooth 2D value noise in 0..1 (bilinear-smoothstep over a hashed lattice). */
export function smoothNoise(seed: number) {
  const hash = (x: number, z: number) => {
    let hh = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
    hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
    return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, z: number) => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = sm(x - x0), fz = sm(z - z0);
    const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

export interface Terrain {
  meshes: THREE.Mesh[];
  /** The relief mesh (cliffs/cave rock), if any: callers make it occludable. */
  relief: THREE.Mesh | null;
  /** Terrain height at a world point (bilinear over the vertex grid). */
  heightAt(x: number, z: number): number;
  /** Animated surfaces to tick each frame. */
  tick(t: number): void;
}

/** True for cells whose terrain rises (they block movement anyway). */
export function isRelief(cell: number, theme: ZoneTheme) {
  return cell === Cell.Cliff || (cell === Cell.Wall && theme.wall === 'cave');
}

export function buildTerrain(layout: ZoneLayout, theme: ZoneTheme, seed: number): Terrain {
  const { w, h } = layout;
  const VW = w + 1;
  const vi = (x: number, z: number) => z * VW + x;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? Cell.Void : layout.cells[z * w + x]);
  const noise = smoothNoise(seed + 3);
  const nV = VW * (h + 1);
  const pos = new Float32Array(nV * 3), col = new Float32Array(nV * 3), splat = new Float32Array(nV * 4);
  const count = new Float32Array(nV), raisedN = new Float32Array(nV), raisedH = new Float32Array(nV), fluidN = new Float32Array(nV);
  const c = new THREE.Color(), c2 = new THREE.Color(), cliffC = new THREE.Color();
  const cliffShades = theme.cliff ?? (theme.wall === 'cave' ? [0x4e4238, 0x3e342c] : [0x7a6e62, 0x5e544a]);

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = at(x, z);
      if (cell === Cell.Void) continue;
      const i = z * w + x;
      const g = layout.ground[i] as Ground;
      const shades = theme.ground[g] ?? theme.ground[Ground.Dirt] ?? [0x6e6048, 0x5a5040];
      // Large-scale colour drift (per-cell randomness reads as pixels).
      c.setHex(shades[0]).lerp(c2.setHex(shades[1]), noise(x * 0.09, z * 0.09));
      const relief = isRelief(cell, theme);
      const mesaTop = relief && cell === Cell.Cliff && theme.mesaTop !== undefined;
      if (mesaTop) {
        const top = theme.ground[theme.mesaTop!] ?? shades;
        c.setHex(top[0]).lerp(c2.setHex(top[1]), noise(x * 0.09, z * 0.09));
      } else if (relief) c.copy(cliffC.setHex(cliffShades[0]).lerp(c2.setHex(cliffShades[1]), noise(x * 0.21 + 50, z * 0.21)));
      const bed = layout.fluid[i] !== Fluid.None && cell !== Cell.Ground;
      // Under water the bed is dark silt/rock, never the paving or grass of the land around it.
      if (bed) c.multiplyScalar(0.5);
      const ch = bed ? 3 : mesaTop ? (theme.splat?.[theme.mesaTop!] ?? SPLAT[theme.mesaTop!] ?? 1) : relief ? 3 : (theme.splat?.[g] ?? SPLAT[g] ?? 0);
      const elev = relief ? (layout.elev[i] || (cell === Cell.Wall ? CAVE_WALL_H : CLIFF_H)) : 0;
      const fluid = layout.fluid[i] !== Fluid.None;
      for (const [xx, zz] of [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]]) {
        const k = vi(xx, zz);
        col[k * 3] += c.r;
        col[k * 3 + 1] += c.g;
        col[k * 3 + 2] += c.b;
        splat[k * 4 + ch] += 1;
        if (relief) {
          raisedN[k]++;
          raisedH[k] += elev;
        }
        if (fluid) fluidN[k]++;
        count[k]++;
      }
    }
  }
  /** Distance from a grid vertex to the nearest dry (non-fluid, non-void) cell, searched out to 5. */
  const distToLand = (vx: number, vz: number) => {
    let best = 5;
    for (let z = Math.max(0, vz - 5); z < Math.min(h, vz + 5); z++) {
      for (let x = Math.max(0, vx - 5); x < Math.min(w, vx + 5); x++) {
        const i = z * w + x;
        if (layout.fluid[i] || layout.cells[i] === Cell.Void) continue;
        const dx = Math.max(x - vx, 0, vx - (x + 1)), dz = Math.max(z - vz, 0, vz - (z + 1));
        best = Math.min(best, Math.hypot(dx, dz));
      }
    }
    return best;
  };
  const fullRelief = (k: number) => count[k] > 0 && raisedN[k] === count[k];
  /** Chamfer distance (in vertices) from every vertex to the nearest seed vertex. */
  const distField = (seed: (k: number) => boolean) => {
    const d = new Float32Array(nV).fill(1e6);
    for (let k = 0; k < nV; k++) if (seed(k)) d[k] = 0;
    const relax = (k: number, j: number, c: number) => {
      if (d[j] + c < d[k]) d[k] = d[j] + c;
    };
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      if (x > 0) relax(k, k - 1, 1);
      if (z > 0) {
        relax(k, k - VW, 1);
        if (x > 0) relax(k, k - VW - 1, 1.414);
        if (x < w) relax(k, k - VW + 1, 1.414);
      }
    }
    for (let z = h; z >= 0; z--) for (let x = w; x >= 0; x--) {
      const k = vi(x, z);
      if (x < w) relax(k, k + 1, 1);
      if (z < h) {
        relax(k, k + VW, 1);
        if (x < w) relax(k, k + VW + 1, 1.414);
        if (x > 0) relax(k, k + VW - 1, 1.414);
      }
    }
    return d;
  };
  const sstep = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Cave walls climb away from the floor into darkness instead of stopping at one flat plateau.
  // Walls on the camera side (+z) of open floor stay low, so they never hide the cavern.
  const rise = new Float32Array(nV);
  if (theme.wallRise) {
    const open = distField((k) => !fullRelief(k));
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      if (!open[k]) continue;
      let north = Infinity;
      for (let s2 = 1; s2 <= 10 && z - s2 >= 0; s2++) if (open[vi(x, z - s2)] === 0) {
        north = s2;
        break;
      }
      const want = theme.wallRise * sstep(0.6, 4.5, open[k]) * (0.7 + noise(x * 0.23 + 5, z * 0.23) * 0.6);
      rise[k] = Math.min(want, Math.max(0, north - 1.5) * 1.1);
    }
  }
  // Ambient occlusion in caves: floor darkens toward the foot of the walls.
  if ((theme.topShade ?? 1) < 1) {
    const near = distField((k) => raisedN[k] > 0);
    for (let k = 0; k < nV; k++) {
      if (fullRelief(k)) continue;
      const f = 0.68 + 0.32 * sstep(0, 3.5, near[k]);
      for (let j = 0; j < 3; j++) col[k * 3 + j] *= f;
    }
  }
  const hgt = new Float32Array(nV);
  for (let z = 0; z <= h; z++) {
    for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      const n = count[k] || 1;
      // A third, slow tone on top of the per-ground colour pair (breaks up large floors).
      const tone = 0.86 + 0.14 * noise(x * 0.035 + 70, z * 0.035);
      for (let j = 0; j < 3; j++) col[k * 3 + j] = (col[k * 3 + j] / n) * tone;
      let y = (noise(x * 0.15, z * 0.15) - 0.5) * 0.06 + (noise(x * 0.5 + 40, z * 0.5) - 0.5) * 0.03;
      if (fullRelief(k)) {
        // Fully inside relief: rugged top (noise breaks up the flat mesa look).
        const top = raisedH[k] / raisedN[k];
        y = top * (0.85 + noise(x * 0.35 + 9, z * 0.35) * 0.3) + (noise(x * 1.3, z * 1.3) - 0.5) * 0.5 + rise[k];
      } else if (count[k] && fluidN[k] === count[k]) {
        // Under water: a long shallow shelf that deepens toward the middle, with noise shoals, so
        // the lighter shallows show. Lava keeps a steep bank (it is opaque; depth drives its crust).
        const dLand = distToLand(x, z);
        const lava = layout.fluid[Math.min(h - 1, z) * w + Math.min(w - 1, x)] === Fluid.Lava;
        const shoal = lava ? 0 : (noise(x * 0.12 + 31, z * 0.12) - 0.5) * 0.5;
        y = Math.max(BED_Y, Math.min(WATER_Y - 0.16, WATER_Y - 0.1 - dLand * (lava ? 0.32 : 0.13) + shoal)) + (noise(x * 0.4, z * 0.4) - 0.5) * 0.12;
      } else if (fluidN[k] > 0) {
        // Waterline: some shore corners just above the surface, some just below, so the visible
        // edge (where the bank meets the water) wanders instead of following the cell grid.
        y = WATER_Y + (noise(x * 0.7 + 17, z * 0.7) - 0.5) * 0.36;
      }
      hgt[k] = y;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
    }
  }

  // Round off the shoreline: relax heights around the waterline a few times so the bank/water
  // intersection curves instead of stepping along cell edges. Only near fluid, never relief.
  const shore = new Uint8Array(nV);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const k = vi(x, z);
    if (fluidN[k] > 0 && raisedN[k] === 0) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx <= w && zz <= h && raisedN[vi(xx, zz)] === 0) shore[vi(xx, zz)] = 1;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = hgt.slice();
    for (let z = 1; z < h; z++) for (let x = 1; x < w; x++) {
      const k = vi(x, z);
      if (!shore[k]) continue;
      next[k] = hgt[k] * 0.4 + (hgt[vi(x - 1, z)] + hgt[vi(x + 1, z)] + hgt[vi(x, z - 1)] + hgt[vi(x, z + 1)]) * 0.15;
    }
    hgt.set(next);
  }
  for (let k = 0; k < nV; k++) pos[k * 3 + 1] = hgt[k];

  const flat: number[] = [], rough: number[] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (at(x, z) === Cell.Void) continue;
      const a = vi(x, z), b = vi(x + 1, z), cc = vi(x + 1, z + 1), d = vi(x, z + 1);
      const tris = (x + z) & 1 ? [a, d, b, b, d, cc] : [a, d, cc, a, cc, b];
      // A triangle is relief if any corner is raised (so cliff faces dissolve as one piece).
      for (let t = 0; t < 6; t += 3) {
        const tri = tris.slice(t, t + 3);
        (tri.some((v) => hgt[v] > 0.6) ? rough : flat).push(...tri);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
  geo.setIndex([...flat, ...rough]);
  geo.computeVertexNormals();
  const make = (index: number[], name: string) => {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'color', 'aSplat']) g.setAttribute(k, geo.getAttribute(k));
    g.setIndex(index);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    applyGround(mat, theme.lava ?? 0, theme.topShade ?? 1, theme.cliff?.[0] ?? null, theme.topRange);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    // Towering cave walls would throw the whole floor into sun shadow (there is no sun
    // underground anyway): only open-air relief casts shadows.
    mesh.castShadow = name === 'relief' && !theme.wallRise;
    mesh.name = name;
    return mesh;
  };
  const meshes = [make(flat, 'ground')];
  const relief = rough.length ? make(rough, 'relief') : null;
  if (relief) meshes.push(relief);

  // Fluids: one surface mesh per kind over its cells (plus a one-cell skirt so it meets the shore).
  const ticks: ((t: number) => void)[] = [];
  for (const kind of [Fluid.Water, Fluid.Lava]) {
    // Fluid cells plus a one-cell skirt under the banks: the visible shoreline is then where the
    // sloping bank rises through the surface, not the edge of the mesh.
    const mark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (layout.fluid[i] !== kind) continue;
      const x0 = i % w, z0 = Math.floor(i / w);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = x0 + dx, z = z0 + dz;
        if (x < 0 || z < 0 || x >= w || z >= h) continue;
        const j = z * w + x;
        if (layout.fluid[j] === kind || (!isRelief(layout.cells[j], theme) && layout.cells[j] !== Cell.Void)) mark[j] = 1;
      }
    }
    const cells: number[] = [];
    for (let i = 0; i < w * h; i++) if (mark[i]) cells.push(i);
    if (!cells.length) continue;
    const fp: number[] = [], depth: number[] = [];
    for (const i of cells) {
      const x = i % w, z = Math.floor(i / w);
      // Counter-clockwise seen from above (normal +Y), or the surface is culled.
      for (const [dx, dz] of [[0, 0], [1, 1], [1, 0], [0, 0], [0, 1], [1, 1]]) {
        const vx = x + dx, vz = z + dz;
        fp.push(vx, WATER_Y, vz);
        depth.push(WATER_Y - hgt[vi(vx, vz)]);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    fg.computeVertexNormals();
    const { mesh, tick } = fluidSurface(fg, kind, theme);
    meshes.push(mesh);
    ticks.push(tick);
  }

  const heightAt = (x: number, z: number) => {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(x))), z0 = Math.max(0, Math.min(h - 1, Math.floor(z)));
    const fx = Math.max(0, Math.min(1, x - x0)), fz = Math.max(0, Math.min(1, z - z0));
    const a = hgt[vi(x0, z0)], b = hgt[vi(x0 + 1, z0)], cc = hgt[vi(x0, z0 + 1)], d = hgt[vi(x0 + 1, z0 + 1)];
    return a + (b - a) * fx + (cc - a) * fz + (a - b - cc + d) * fx * fz;
  };
  return { meshes, relief, heightAt, tick: (t) => ticks.forEach((f) => f(t)) };
}

/**
 * Stylised animated liquids.
 * - Water: depth-tinted over a long shelf (shallows show), two layers of drifting ripples in the
 *   normal, a sky reflection tinted from the zone's sky and background (stronger at grazing
 *   angles, broken up by the ripples), glints on ripple crests, soft caustics in the shallows and
 *   a foam line where the bed meets the surface.
 * - Lava: cooled black crust plates drifting slowly, with glowing seams that widen toward the
 *   hot, deep middle; open molten patches churn in the deepest spots. Emission stays moderate so
 *   bloom shows seams, not a blown-out disc.
 */
function fluidSurface(geo: THREE.BufferGeometry, kind: Fluid, theme: ZoneTheme) {
  const lava = kind === Fluid.Lava;
  const skyHigh = new THREE.Color(theme.hemi[0]).multiplyScalar(0.75);
  const skyLow = new THREE.Color(theme.bg).lerp(new THREE.Color(theme.hemi[0]), 0.25);
  const uniforms = {
    uTime: { value: 0 },
    uNoise: { value: noiseTexture() },
    uShallow: { value: new THREE.Color(lava ? 0xff6a10 : (theme.water?.[0] ?? 0x3f8fa8)) },
    uDeep: { value: new THREE.Color(lava ? 0x5a0c02 : (theme.water?.[1] ?? 0x123a52)) },
    uSkyHigh: { value: skyHigh },
    uSkyLow: { value: skyLow },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: lava ? 0.55 : 0.1, metalness: 0,
    transparent: !lava, opacity: lava ? 1 : 0.86, depthWrite: lava,
  });
  const common = `
    uniform float uTime;
    uniform sampler2D uNoise;
    uniform vec3 uShallow;
    uniform vec3 uDeep;
    uniform vec3 uSkyHigh;
    uniform vec3 uSkyLow;
    varying float vDepth;
    varying vec3 vFluidPos;
    float fluidN(vec2 p) { return texture2D(uNoise, p).r; }
    vec2 fluidGrad(vec2 p, float e) { float c = fluidN(p); return vec2(fluidN(p + vec2(e, 0.0)) - c, fluidN(p + vec2(0.0, e)) - c) / e; }
    vec2 lavaHash(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
    // Cellular noise: x = distance to nearest cell, y = to second nearest, z = nearest cell id.
    vec3 lavaCells(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float f1 = 8.0, f2 = 8.0, id = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 h = lavaHash(i + o);
        float d = length(o + 0.15 + h * 0.7 - f);
        if (d < f1) { f2 = f1; f1 = d; id = h.x; } else if (d < f2) f2 = d;
      }
      return vec3(f1, f2, id);
    }`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec3 vFluidPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDepth = aDepth;\nvFluidPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${common}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 fp = vFluidPos.xz;
        vec2 q1 = fp * 0.07 + vec2(uTime * 0.011, uTime * 0.006);
        vec2 q2 = fp * 0.23 - vec2(uTime * 0.021, -uTime * 0.014);
        float n1 = fluidN(q1), n2 = fluidN(q2);
        float ripple = n1 * 0.6 + n2 * 0.4;
        ${lava
          ? `// Crust plates drift and slowly deform; seams widen with depth (heat).
             vec2 warp = vec2(fluidN(fp * 0.05 + uTime * 0.004), fluidN(fp * 0.05 + 0.5 - uTime * 0.003)) - 0.5;
             vec3 cells = lavaCells(fp * 0.45 + warp * 1.4 + vec2(uTime * 0.014, uTime * 0.009));
             float heat = smoothstep(0.02, 0.6, vDepth + (n1 - 0.5) * 0.2);
             float gap = cells.y - cells.x;
             float seam = 1.0 - smoothstep(0.015, 0.035 + heat * 0.075, gap);
             float glowNear = 1.0 - smoothstep(0.0, 0.2 + heat * 0.2, gap);
             float molten = smoothstep(0.82, 0.98, heat * 0.45 + n2 * 0.65);
             vec3 crust = vec3(0.06, 0.045, 0.042) * (0.75 + cells.z * 0.5);
             crust = mix(crust, vec3(0.22, 0.05, 0.015), glowNear * heat * 0.7);
             diffuseColor.rgb = mix(crust, vec3(0.3, 0.08, 0.02), max(seam, molten));`
          : `float deep = smoothstep(0.02, 0.62, vDepth + (ripple - 0.5) * 0.12);
             diffuseColor.rgb = mix(uShallow, uDeep, deep);
             // Soft caustics dance on the shallow bed.
             float ca = fluidN(fp * 0.31 + vec2(uTime * 0.035, 0.0)), cb = fluidN(fp * 0.27 + vec2(0.37, 0.61) - vec2(0.0, uTime * 0.03));
             float caus = pow(clamp(1.0 - abs(ca - cb) * 3.2, 0.0, 1.0), 5.0);
             diffuseColor.rgb += vec3(0.55, 0.7, 0.62) * caus * (1.0 - deep) * 0.1;
             float foam = smoothstep(0.08, 0.0, vDepth + (n2 - 0.5) * 0.06) * (0.55 + 0.45 * n1);
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.88, 0.9), foam * 0.45);
             diffuseColor.a = mix(0.7, 0.95, deep) + foam * 0.15;`}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 g = fluidGrad(q1, 0.01) * ${lava ? '0.0' : '0.005'} + fluidGrad(q2, 0.01) * ${lava ? '0.002' : '0.0045'};
          vec3 gv = (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz;
          normal = normalize(normal - gv + dot(gv, normal) * normal);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${lava
          ? `vec3 hot = mix(vec3(1.2, 0.3, 0.04), vec3(1.5, 0.6, 0.12), heat);
             float pulse = 0.85 + 0.15 * sin(uTime * 1.3 + fp.x * 0.3 + fp.y * 0.2);
             totalEmissiveRadiance += max(hot * seam, vec3(1.25, 0.34, 0.05) * molten * (0.6 + 0.3 * n2)) * pulse;
             totalEmissiveRadiance += vec3(0.3, 0.05, 0.005) * glowNear * heat * 0.35;`
          : `// Sky reflection: the reflected ray picks a colour from a sky gradient, so ripples
             // show as moving light and dark bands; stronger toward grazing angles.
             vec3 vdir = normalize(vViewPosition);
             float ndv = clamp(dot(vdir, normal), 0.0, 1.0);
             vec3 rw = (vec4(reflect(-vdir, normal), 0.0) * viewMatrix).xyz;
             vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(-0.1, 0.9, rw.y) * (0.75 + 0.25 * smoothstep(0.3, -0.6, rw.z)));
             float fres = 0.12 + 0.88 * pow(1.0 - ndv, 4.0);
             totalEmissiveRadiance += sky * fres * 0.9;
             // Glints: only on ripple crests, and only where a crest tilts toward a bright sky patch.
             float glint = pow(max(dot(normalize(rw), normalize(vec3(0.5, 0.72, -0.48))), 0.0), 900.0) * smoothstep(0.8, 0.95, n2);
             totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * glint * 0.5;`}`,
      );
  };
  mat.customProgramCacheKey = () => (lava ? 'fluid2-lava' : 'fluid2-water');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = lava ? 'lava' : 'water';
  mesh.receiveShadow = !lava;
  mesh.renderOrder = 1;
  return { mesh, tick: (t: number) => (uniforms.uTime.value = t) };
}
