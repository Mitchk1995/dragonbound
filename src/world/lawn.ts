import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { addPatch } from '../render/surface';
import { noiseTexture } from '../render/textures';
import { Cell, Ground, Lawn, type ZoneLayout } from './layout';
import { strandField } from './strands';
import { isRelief, smoothNoise } from './terrain';

/**
 * A full grass carpet over every lawn cell (layout.lawn): shell layers lifted off the terrain, each
 * cut by a dense field of tapering blades in the fragment shader (about a hundred to a cell on a
 * clipped lawn), dark at the root and light at the tip, swaying with the wind. Each shell traces the
 * view ray down to the next, so a blade reads as one solid blade even from low down. Blades vary in
 * height, lean and hue; clipped castle lawns are short with soft mower stripes, private gardens
 * (Lawn.Garden) are scattered with daisies and clover, and the grass grows longer and darker at
 * the foot of hedges, beds and statues; meadows grow taller. The carpet ends exactly on the lawn's
 * own cells (a straight, square edge against paving; a true circle where the layout cuts one), and
 * far away it settles into one layer painted with the blades' own grain.
 */

/** Blade height per lawn kind, in world units. */
const HEIGHT: Record<number, number> = { [Lawn.Meadow]: 0.24, [Lawn.Clipped]: 0.04, [Lawn.Garden]: 0.07 };
/** Shells per graphics preset. */
export const LAWN_SHELLS = { high: 8, medium: 6, low: 4 } as const;
const MAX_SHELLS = 8;
/** Height (0..1 of the blades) of the lowest shell. */
const LOWEST = 0.08;
/** Chunk size in cells (each chunk frustum-culls on its own). */
const CHUNK = 32;
/** Beyond this distance from the camera the blades settle into one flat layer. */
const FADE: [number, number] = [52, 72];

/**
 * Shell heights 0..1 shared by every lawn of a kind; only the first `count` are drawn. Meadows
 * (seen only from the high gameplay camera, and covering whole screens) draw half as many.
 */
const shells = [0, 1].map(() => ({ attr: new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHELLS), 1), count: MAX_SHELLS }));
const [CLIPPED, MEADOW] = shells;
/** Gap between neighbouring shells (0..1 of the blades) on clipped lawns and in meadows. */
const SPACING = { value: new THREE.Vector2() };

/** Draw `n` shells on clipped lawns (the graphics preset's count), half as many in meadows. */
export function setLawnShells(n: number) {
  CLIPPED.count = Math.max(3, Math.min(MAX_SHELLS, n));
  MEADOW.count = Math.max(3, CLIPPED.count - 4);
  for (const set of shells) {
    const a = set.attr.array as Float32Array;
    // Top shell first (the blades' upper layers hide what is under them before it is shaded),
    // down to the lowest at LOWEST (the ground under the lawn is the carpet's dark root layer).
    for (let i = 0; i < MAX_SHELLS; i++) a[i] = i < set.count ? LOWEST + (1 - LOWEST) * (1 - i / (set.count - 1)) : 1;
    set.attr.needsUpdate = true;
  }
  SPACING.value.set((1 - LOWEST) / (CLIPPED.count - 1), (1 - LOWEST) / (MEADOW.count - 1));
}
setLawnShells(MAX_SHELLS);

/**
 * Build the lawn of a zone, or nothing when the layout has none. `heightAt` is the terrain's
 * height query; `wind` the shared wind clock uniform (the tufts and trees sway with the same one).
 */
export function buildLawn(layout: ZoneLayout, theme: ZoneTheme, heightAt: (x: number, z: number) => number, wind: { uWindT: { value: number } }): THREE.Object3D[] {
  const lawn = layout.lawn;
  if (!lawn) return [];
  const { w, h } = layout;
  const VW = w + 1;
  // Along a road the carpet runs out over the road's edge cells and is cut back exactly along the
  // road's true edge (strands.ts), and along a stream or pool it stops just short of the waterline;
  // so those edges curve with the road or the water instead of stepping along the cells.
  const sf = strandField(layout);
  const edge = new Uint8Array(w * h);
  if (sf) for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = z * w + x;
    if (lawn[i] || layout.cells[i] !== Cell.Ground || layout.fluid[i]) continue;
    const near = [z * VW + x, z * VW + x + 1, (z + 1) * VW + x, (z + 1) * VW + x + 1].some((v) => sf.path[v] > -0.9 && sf.path[v] < 0.9);
    if (!near) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= w || zz >= h || !lawn[zz * w + xx]) continue;
      edge[i] = lawn[zz * w + xx];
      break;
    }
  }
  const kind = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? 0 : lawn[z * w + x] || edge[z * w + x]);
  const pal = theme.ground[Ground.Grass] ?? [0x5a7a3a, 0x6a8a44];
  const mid = new THREE.Color(pal[0]).lerp(new THREE.Color(pal[1]), 0.5);
  const uniforms = {
    ...wind,
    uLawnRoot: { value: mid.clone().multiplyScalar(0.36).offsetHSL(0, 0.04, 0) },
    uLawnTip: { value: mid.clone().multiplyScalar(1.28).offsetHSL(0.0, 0.02, 0.02) },
    uLawnNoise: { value: noiseTexture() },
    uLawnFade: { value: new THREE.Vector2(...FADE) },
    uLawnGap: SPACING,
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  addPatch(mat, { key: 'lawn1', apply: (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aShell;
        attribute vec2 aLawn;
        attribute vec2 aLawnX;
        uniform float uWindT;
        uniform vec2 uLawnFade;
        varying float vShell;
        varying vec3 vLawn;
        varying vec2 vLawnX;
        varying vec3 vLawnPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // Far away only the bottom layer stays (the upper shells fold down onto it).
          float fade = 1.0 - smoothstep(uLawnFade.x, uLawnFade.y, distance(position.xz, cameraPosition.xz));
          float lift = aShell * aLawn.y * fade;
          float sway = sin(uWindT * 1.7 + position.x * 0.45 + position.z * 0.3) + 0.5 * sin(uWindT * 2.9 + position.z * 0.8);
          transformed.y += 0.012 + lift;
          transformed.xz += vec2(0.3, 0.18) * sway * aShell * aShell * aLawn.y * fade;
          vShell = aShell;
          vLawn = vec3(aLawn, fade);
          vLawnX = aLawnX;
          vLawnPos = vec3(position.x, position.y + 0.012 + lift, position.z);
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uLawnRoot;
        uniform vec3 uLawnTip;
        uniform sampler2D uLawnNoise;
        varying float vShell;
        varying vec3 vLawn;
        varying vec2 vLawnX;
        varying vec3 vLawnPos;
        uniform vec2 uLawnGap;
        vec3 lawnHash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          q += dot(q, q.yzx + 33.33);
          return fract((q.xxy + q.yzz) * q.zyx);
        }
        // One field of jittered blades at grid scale p: is this shell inside a blade? Each blade
        // has its own height, thickness and lean, and tapers to a point at its tip. Returns the
        // height along the blade (0 root .. 1 tip) where covered, else -1; tint gets its shade.
        // seg: how far the view ray runs across the gap down to the next shell (grid units); the
        // blade is tested along it, so from a low camera the slices of a blade join up into one
        // solid blade instead of a stack of thin slivers. thin: how many times longer than wide.
        float lawnBlade(vec2 p, float s, float tall, vec3 lean0, vec2 seg, float gap, float thin, out float tint) {
          vec2 id = floor(p), f = fract(p);
          vec3 r = lawnHash(id);
          float hb = (0.55 + 0.45 * r.z) * tall;
          tint = r.x;
          if (s > hb) return -1.0;
          float t = s / max(hb, 1e-3);
          // Flat, narrow blades, each turned its own way, curving over as they rise and narrowing
          // to a point near the tip.
          vec2 c = 0.5 + (r.xy - 0.5) * 0.78 + ((r.yz - 0.5) * lean0.z + lean0.xy) * t * t;
          vec2 dir = normalize(fract(r.zx * 7.31) - 0.5 + 1e-3);
          vec2 o = f - c, side = vec2(-dir.y, dir.x);
          float rad = (1.0 - t * t * t) * (0.7 + 0.2 * r.y);
          // The first (highest) point along the ray inside the blade gives the height seen there.
          for (int k = 0; k < 2; k++) {
            float u = float(k) * 0.5;
            vec2 ok = o + seg * u;
            if (length(vec2(dot(ok, dir), dot(ok, side) * thin)) * 2.0 < rad) return clamp((s - gap * u) / max(hb, 1e-3), 0.0, 1.0);
          }
          return -1.0;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wp = vLawnPos.xz;
          bool clipped = vLawn.y < 0.2;
          // Fine blades on clipped lawns (several hundred to a cell, mown short into a dense turf);
          // in meadows longer, slender blades, two interleaved fields of them so the sward stays full.
          float bladeScale = clipped ? 40.0 : 8.5;
          vec2 p1 = wp * bladeScale;
          // How small a blade is on screen (the narrow side of a pixel's footprint on the ground, so
          // a lawn seen low across keeps its blades): tiny blades shimmer, so the far lawn settles
          // into one layer and loses its upper shells.
          vec2 ddx = dFdx(p1), ddy = dFdy(p1);
          float minor = abs(ddx.x * ddy.y - ddx.y * ddy.x) / max(max(length(ddx), length(ddy)), 1e-4);
          float lod = max(smoothstep(0.35, 0.9, minor), 1.0 - vLawn.z);
          // vLawn.x: the lawn's outline where the layout cuts a circle from it (else 1); the carpet
          // otherwise covers exactly its own cells. vLawnX: x the share of garden lawn (daisies and
          // clover), y how close a hedge, bed or statue stands (the grass grows long at its foot).
          if (vLawn.x < 0.5) discard;
          bool lowest = vShell < ${(LOWEST + 0.01).toFixed(3)};
          if (!lowest && vShell > 1.0 - lod) discard;
          // Soft mower stripes two cells wide, north to south.
          float stripe = clipped ? clamp(sin(wp.x * 1.5708) * 2.5, -1.0, 1.0) : 0.0;
          float n2 = texture2D(uLawnNoise, wp * 0.13 + vec2(0.41, 0.17)).r;
          float foot = vLawnX.y;
          float tall = (0.82 + 0.36 * n2) * (1.0 + (clipped ? 0.1 : 0.45) * foot);
          // Clipped lawns stand up straight (leaning a little with the mower's stripe); meadow grass flops.
          vec3 lean0 = clipped ? vec3(stripe * 0.06, 0.04, 0.32) : vec3(0.0, 0.1, 0.9);
          float gap = clipped ? uLawnGap.x : uLawnGap.y;
          vec3 ray = vLawnPos - cameraPosition;
          vec2 run = ray.xz / max(abs(ray.y), 0.2 * length(ray.xz)) * gap * vLawn.y;
          float tint;
          float t = lawnBlade(p1, vShell, tall, lean0, run * bladeScale, gap, clipped ? 2.6 : 4.2, tint);
          // (The second field only where the first leaves a gap: the shell shows one blade either way.)
          if (!clipped && t < 0.0) t = lawnBlade(p1 + vec2(37.5, 11.5), vShell, tall, lean0, run * bladeScale, gap, 4.2, tint);
          // Daisies and clover in the private gardens: round white heads with gold eyes at the tips
          // of the grass, low trefoil leaves under it.
          vec3 bloom = vec3(-1.0);
          if (vLawnX.x > 0.5 && lod < 0.6) {
            vec2 q = wp * 2.4, qi = floor(q), qf = fract(q);
            vec3 h = lawnHash(qi + 17.0);
            if (h.z < 0.16) {
              float d = length(qf - (0.25 + 0.5 * h.xy));
              if (vShell > 0.82 && d < 0.16) bloom = d < 0.06 ? vec3(0.95, 0.78, 0.25) : vec3(0.96, 0.95, 0.9);
            } else if (h.z > 0.8 && vShell < 0.45) {
              vec2 o = qf - (0.25 + 0.5 * h.yx);
              float a = atan(o.y, o.x), rr = length(o);
              if (rr < 0.17 * (0.65 + 0.35 * abs(cos(a * 1.5)))) bloom = uLawnRoot * 2.1 * vec3(0.92, 1.05, 0.9);
            }
          }
          // The lowest shell closes up into one layer far away (tiny blades would shimmer) and
          // along the lawn's border, where it is the dark root of the carpet right up to the edge.
          if (t < 0.0 && bloom.x < 0.0 && !lowest) discard;
          // Colour: dark root to a light tip, drifting between a warmer and a cooler green, each
          // blade its own shade and hue.
          float n1 = texture2D(uLawnNoise, wp * 0.031).r;
          vec3 tip = uLawnTip * mix(vec3(1.07, 1.02, 0.78), vec3(0.88, 1.0, 1.04), smoothstep(0.3, 0.7, n1));
          tip *= 0.86 + 0.28 * n2 + (tint - 0.5) * 0.26;
          tip *= mix(vec3(1.06, 1.02, 0.86), vec3(0.9, 1.0, 1.06), fract(tint * 7.13));
          tip *= 1.0 - 0.22 * foot;
          // (Mown turf is close and even: its blades shade from a lighter root, so it reads as one
          // velvet surface, not tufts.)
          vec3 col = mix(clipped ? mix(uLawnRoot, tip, 0.45) : uLawnRoot, tip, pow(clamp(t, 0.0, 1.0), 0.85));
          // The far lawn (one layer): the carpet's average painted with the grain of its blades
          // (two scales of mipmapped noise), never one flat green.
          if (lowest && t < 0.0) {
            float g1 = texture2D(uLawnNoise, wp * 0.9 + vec2(0.3, 0.7)).r, g2 = texture2D(uLawnNoise, wp * 0.27).r;
            col = mix(uLawnRoot * (0.9 + 0.2 * g1), mix(uLawnRoot, tip, 0.42 + 0.3 * (g1 - 0.5) + 0.2 * (g2 - 0.5)), lod);
          }
          if (bloom.x >= 0.0) col = bloom;
          // Mower stripes on clipped lawns; broad lighter and darker drifts across meadows.
          col *= clipped ? 1.0 + 0.2 * stripe : 0.84 + 0.32 * smoothstep(0.2, 0.8, n1);
          diffuseColor.rgb = col;
        }`,
      );
  } });

  // The carpet covers exactly the lawn's own cells (its mesh is built from them), so its edge is
  // straight and square against paving and beds. At every grid corner: the outline where the
  // layout cuts a disc from the lawn (its border crosses one half exactly on the circle, else 1),
  // the share of garden lawn, and whether a hedge, bed or statue stands on one of its cells (the
  // grass grows long at its foot).
  const weight = new Float32Array(VW * (h + 1)), garden = new Float32Array(VW * (h + 1)), foot = new Float32Array(VW * (h + 1));
  const blocked = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && layout.cells[z * w + x] === Cell.Blocked && !!kind(x, z);
  // On the island of levels (the castle's rock), where the turf meets rock or the island's edge it
  // thins out short of it along a wandering line (a few tens of centimetres here, more than a metre
  // there), never on the cells' square steps.
  const brink = layout.level ? brinkDistance(layout, theme) : null, wander = smoothNoise(91);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    let wt = brink ? Math.max(0, Math.min(1, 0.5 + (brink[z * VW + x] - 0.3 - 1.1 * wander(x * 0.3, z * 0.3)) * 1.6)) : 1;
    for (const c of layout.lawnCut ?? []) wt = Math.min(wt, Math.max(0, Math.min(1, 0.5 + (Math.hypot(x - c.x, z - c.z) - c.r) * 0.5)));
    if (sf) {
      const v = z * VW + x;
      wt = Math.min(wt, Math.max(0, Math.min(1, 0.5 + sf.path[v] * 1.2)), Math.max(0, Math.min(1, 0.5 + (sf.wet[v] - 0.35) * 1.2)));
    }
    weight[z * VW + x] = wt;
    let gd = 0, ft = 0;
    for (const [ax, az] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
      if (kind(ax, az) === Lawn.Garden) gd += 0.25;
      if (blocked(ax, az)) ft = 1;
    }
    garden[z * VW + x] = gd;
    foot[z * VW + x] = ft;
  }

  const meshes: THREE.InstancedMesh[] = [];
  const ident = new THREE.Matrix4();
  for (let cz = 0; cz < h; cz += CHUNK) for (let cx = 0; cx < w; cx += CHUNK) {
    const x1 = Math.min(w, cx + CHUNK), z1 = Math.min(h, cz + CHUNK);
    const CW = x1 - cx + 1;
    const vid = new Map<number, number>();
    const pos: number[] = [], attr: number[] = [], extra: number[] = [], index: number[] = [];
    let clipped = false;
    const vert = (x: number, z: number) => {
      const key = (z - cz) * CW + (x - cx);
      let v = vid.get(key);
      if (v !== undefined) return v;
      let ht = 0, kinds = 0;
      for (const [ax, az] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
        const k = kind(ax, az);
        if (k) {
          ht += HEIGHT[k];
          kinds++;
        }
      }
      v = pos.length / 3;
      pos.push(x, heightAt(x, z), z);
      attr.push(weight[z * VW + x], kinds ? ht / kinds : 0);
      extra.push(garden[z * VW + x], foot[z * VW + x]);
      vid.set(key, v);
      return v;
    };
    for (let z = cz; z < z1; z++) for (let x = cx; x < x1; x++) {
      if (!kind(x, z)) continue;
      // No carpet on a cell that is really a slope between levels (it would stand up as a wall of grass).
      const hs = [heightAt(x, z), heightAt(x + 1, z), heightAt(x, z + 1), heightAt(x + 1, z + 1)];
      if (Math.max(...hs) - Math.min(...hs) > 0.9) continue;
      if (kind(x, z) === Lawn.Clipped) clipped = true;
      const a = vert(x, z), b = vert(x + 1, z), c = vert(x + 1, z + 1), d = vert(x, z + 1);
      // The terrain's own diagonals, so the carpet lies exactly on the ground.
      index.push(...((x + z) & 1 ? [a, d, b, b, d, c] : [a, d, c, a, c, b]));
    }
    if (!index.length) continue;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('aLawn', new THREE.Float32BufferAttribute(attr, 2));
    geo.setAttribute('aLawnX', new THREE.Float32BufferAttribute(extra, 2));
    const set = clipped ? CLIPPED : MEADOW;
    geo.setAttribute('aShell', set.attr);
    geo.setIndex(index);
    geo.computeBoundingSphere();
    geo.boundingSphere!.radius += 0.4;
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_SHELLS);
    for (let i = 0; i < MAX_SHELLS; i++) mesh.setMatrixAt(i, ident);
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'lawn';
    mesh.onBeforeRender = () => (mesh.count = set.count);
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * The distance (in metres, along the grid) from every grid corner to the nearest corner of a cell of
 * rock or of the void beyond the land's edge, out to a few metres (beyond that, far).
 */
function brinkDistance(layout: ZoneLayout, theme: ZoneTheme) {
  const { w, h } = layout, VW = w + 1, d = new Float32Array(VW * (h + 1)).fill(8);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const c = layout.cells[z * w + x];
    if (c === Cell.Void || isRelief(c, theme)) for (const v of [z * VW + x, z * VW + x + 1, (z + 1) * VW + x, (z + 1) * VW + x + 1]) d[v] = 0;
  }
  const relax = (k: number, j: number, c: number) => {
    if (d[j] + c < d[k]) d[k] = d[j] + c;
  };
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const k = z * VW + x;
    if (x > 0) relax(k, k - 1, 1);
    if (z > 0) {
      relax(k, k - VW, 1);
      if (x > 0) relax(k, k - VW - 1, Math.SQRT2);
      if (x < w) relax(k, k - VW + 1, Math.SQRT2);
    }
  }
  for (let z = h; z >= 0; z--) for (let x = w; x >= 0; x--) {
    const k = z * VW + x;
    if (x < w) relax(k, k + 1, 1);
    if (z < h) {
      relax(k, k + VW, 1);
      if (x < w) relax(k, k + VW + 1, Math.SQRT2);
      if (x > 0) relax(k, k + VW - 1, Math.SQRT2);
    }
  }
  return d;
}
