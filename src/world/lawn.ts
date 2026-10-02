import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { addPatch } from '../render/surface';
import { noiseTexture } from '../render/textures';
import { Ground, Lawn, type ZoneLayout } from './layout';

/**
 * A full grass carpet over every lawn cell (layout.lawn): shell layers lifted off the terrain, each
 * cut by a dense field of tapering blades in the fragment shader (about a hundred to a cell on a
 * clipped lawn), dark at the root and light at the tip, swaying with the wind. Each shell traces the
 * view ray down to the next, so a blade reads as one solid blade even from low down. Clipped castle lawns are short with mower
 * stripes; meadows grow taller. The carpet ends cleanly on the lawn's own outline (paths, beds,
 * water), and far away it settles into one flat layer in the lawn's average colour.
 */

/** Blade height per lawn kind, in world units. */
const HEIGHT: Record<number, number> = { [Lawn.Meadow]: 0.24, [Lawn.Clipped]: 0.14 };
/** Shells per graphics preset. */
export const LAWN_SHELLS = { high: 8, medium: 6, low: 4 } as const;
const MAX_SHELLS = 8;
/** Height (0..1 of the blades) of the lowest shell. */
const LOWEST = 0.08;
/** Chunk size in cells (each chunk frustum-culls on its own). */
const CHUNK = 32;
/** Beyond this distance from the camera the blades settle into one flat layer. */
const FADE: [number, number] = [46, 62];

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
  const kind = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? 0 : lawn[z * w + x]);
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
        uniform float uWindT;
        uniform vec2 uLawnFade;
        varying float vShell;
        varying vec3 vLawn;
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
        // solid blade instead of a stack of thin slivers.
        float lawnBlade(vec2 p, float s, float tall, vec3 lean0, vec2 seg, float gap, out float tint) {
          vec2 id = floor(p), f = fract(p);
          vec3 r = lawnHash(id);
          float hb = (0.55 + 0.45 * r.z) * tall;
          tint = r.x;
          if (s > hb) return -1.0;
          float t = s / max(hb, 1e-3);
          // Flat, narrow blades, each turned its own way, curving over as they rise and narrowing
          // to a point near the tip.
          vec2 c = 0.5 + (r.xy - 0.5) * 0.5 + ((r.yz - 0.5) * lean0.z + lean0.xy) * t * t;
          vec2 dir = normalize(fract(r.zx * 7.31) - 0.5 + 1e-3);
          vec2 o = f - c, side = vec2(-dir.y, dir.x);
          float rad = (1.0 - t * t * t) * (0.7 + 0.2 * r.y);
          // The first (highest) point along the ray inside the blade gives the height seen there.
          for (int k = 0; k < 2; k++) {
            float u = float(k) * 0.5;
            vec2 ok = o + seg * u;
            if (length(vec2(dot(ok, dir), dot(ok, side) * 2.6)) * 2.0 < rad) return clamp((s - gap * u) / max(hb, 1e-3), 0.0, 1.0);
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
          // Fine blades on clipped lawns (about a hundred to a cell), coarser in meadows.
          float bladeScale = clipped ? 10.0 : 7.5;
          vec2 p1 = wp * bladeScale;
          // How small a blade is on screen: tiny blades shimmer, so the far lawn settles into its
          // average colour and loses its upper shells.
          vec2 fw = fwidth(p1);
          float lod = max(smoothstep(0.35, 0.9, sqrt(fw.x * fw.y)), 1.0 - vLawn.z);
          float weight = vLawn.x;
          // The lawn's outline: halfway between a lawn corner and a bare one (corners are cut, so
          // the edge rounds off instead of stepping along the cell grid).
          if (weight < 0.5) discard;
          bool lowest = vShell < ${(LOWEST + 0.01).toFixed(3)};
          if (!lowest && vShell > 1.0 - lod) discard;
          float stripe = clipped ? mod(floor(wp.x * 0.5), 2.0) * 2.0 - 1.0 : 0.0;
          // Blades shorten toward the edge, so the carpet thins out softly against paving, and
          // drift a little taller and shorter across the lawn.
          float n2 = texture2D(uLawnNoise, wp * 0.13 + vec2(0.41, 0.17)).r;
          float tall = (0.6 + 0.4 * smoothstep(0.5, 0.8, weight)) * (0.82 + 0.36 * n2);
          // Clipped lawns stand up straight (leaning with the mower's stripe); meadow grass flops.
          vec3 lean0 = clipped ? vec3(stripe * 0.12, 0.04, 0.2) : vec3(0.0, 0.1, 0.9);
          float gap = clipped ? uLawnGap.x : uLawnGap.y;
          vec3 ray = vLawnPos - cameraPosition;
          vec2 run = ray.xz / max(abs(ray.y), 0.2 * length(ray.xz)) * gap * vLawn.y;
          float tint;
          float t = lawnBlade(p1, vShell, tall, lean0, run * bladeScale, gap, tint);
          // The lowest shell closes up into one layer far away (tiny blades would shimmer) and
          // along the lawn's border, where it is the dark root of the carpet right up to a crisp edge.
          if (t < 0.0 && !(lowest && (weight < 0.999 || lawnHash(gl_FragCoord.xy).x < lod))) discard;
          // Colour: dark root to a light tip, drifting between a warmer and a cooler green.
          float n1 = texture2D(uLawnNoise, wp * 0.031).r;
          vec3 tip = uLawnTip * mix(vec3(1.07, 1.02, 0.78), vec3(0.88, 1.0, 1.04), smoothstep(0.3, 0.7, n1));
          tip *= 0.9 + 0.2 * n2 + (tint - 0.5) * 0.16;
          vec3 col = mix(uLawnRoot, tip, pow(clamp(t, 0.0, 1.0), 0.85));
          // The far lawn (one layer): the carpet's average, root and blades together.
          if (lowest) col = mix(col, mix(uLawnRoot, tip, 0.45), lod);
          // Mower stripes on clipped lawns; broad lighter and darker drifts across meadows.
          col *= clipped ? 1.0 + 0.06 * stripe : 0.84 + 0.32 * smoothstep(0.2, 0.8, n1);
          diffuseColor.rgb = col;
        }`,
      );
  } });

  // Lawn weight at every grid corner: the share of lawn among its four cells (the carpet's border
  // is where it crosses one half). Softened once with its neighbours so a curved border (the
  // fountain plaza) runs smoothly across the cells instead of stepping along them; no corner
  // changes side, so no strip of lawn is lost and no straight border moves. A round border the
  // layout asks for (lawnCut) is exact.
  const VW = w + 1;
  const raw = new Float32Array(VW * (h + 1));
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    raw[z * VW + x] = ((kind(x - 1, z - 1) ? 1 : 0) + (kind(x, z - 1) ? 1 : 0) + (kind(x - 1, z) ? 1 : 0) + (kind(x, z) ? 1 : 0)) / 4;
  }
  const weight = new Float32Array(raw.length);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    let sum = 0, n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx > w || zz > h) continue;
      const k = (dx ? 1 : 2) * (dz ? 1 : 2);
      sum += raw[zz * VW + xx] * k;
      n += k;
    }
    const r = raw[z * VW + x], b = sum / n;
    let wt = r >= 0.5 ? Math.max(b, 0.5) : Math.min(b, 0.49);
    // Cut back from a disc: the border crosses one half exactly on its circle.
    for (const c of layout.lawnCut ?? []) wt = Math.min(wt, Math.max(0, Math.min(1, 0.5 + (Math.hypot(x - c.x, z - c.z) - c.r) * 0.5)));
    weight[z * VW + x] = wt;
  }

  const meshes: THREE.InstancedMesh[] = [];
  const ident = new THREE.Matrix4();
  for (let cz = 0; cz < h; cz += CHUNK) for (let cx = 0; cx < w; cx += CHUNK) {
    const x1 = Math.min(w, cx + CHUNK), z1 = Math.min(h, cz + CHUNK);
    const CW = x1 - cx + 1;
    const vid = new Map<number, number>();
    const pos: number[] = [], attr: number[] = [], index: number[] = [];
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
      vid.set(key, v);
      return v;
    };
    for (let z = cz; z < z1; z++) for (let x = cx; x < x1; x++) {
      if (!kind(x, z)) continue;
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
