import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { addPatch, type SurfaceSpace } from './surface';
import { fbm, SIZE, tileNoise, worley, type Gen } from './textures';

/**
 * Painted rock: one look for every rock surface in the world (cave walls, cliffs, boulders, the
 * slabs stacked at the wall foot, ore rocks, the keep's floating islets). Colour only: no bump,
 * no normal changes. The pattern is projected triplanar in world (or object) space from the flat
 * face normal, with V along world up on side faces, so it never stretches on tall faces and the
 * strata stay level across neighbouring rocks.
 *
 * The rock atlas carries four patterns (0.5 = the base colour):
 * - R side faces: stacked strata, each band split into blocks by vertical joints, a dark gap
 *   between bands, a pale lip along each band's top and a shadow tucked under the band above,
 *   one tone per block and the odd diagonal fracture;
 * - G ledge tops: broken flat slabs with their own tones and dark cracks between;
 * - B grain: speckle (pale and dark flecks) over a fine mottle;
 * - A a broad blotch (warm ochre vs cool grey drift).
 */

/** World units per atlas tile at scale 1 (rock scale 1/ROCK_TILE). */
export const ROCK_TILE = 4;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (a: number, b: number, seed: number) => {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (seed * 83492791), 0x5bd1e995);
  h ^= h >>> 15;
  return ((Math.imul(h, 0x27d4eb2d) ^ (h >>> 13)) >>> 0) / 4294967296;
};
const steps = (v: number, n: number, soft = 0.4) => {
  const s = Math.max(0, Math.min(0.9999, v)) * n, f = Math.floor(s);
  return (f + smooth(0.5 - soft / 2, 0.5 + soft / 2, s - f)) / n;
};

/** Split `total` into runs of `min`..`max` (the last run absorbs the rest). */
function runs(rng: () => number, total: number, min: number, max: number) {
  const out: number[] = [0];
  let at = 0;
  for (;;) {
    const l = min + rng() * (max - min);
    if (total - (at + l) < min * 0.8) break;
    at += l;
    out.push(at);
  }
  return out;
}

/** Index of the run containing `v` in sorted `edges` over [0, total), and the distances to its ends. */
function runAt(edges: number[], total: number, v: number) {
  let b = 0;
  while (b + 1 < edges.length && edges[b + 1] <= v) b++;
  const end = b + 1 < edges.length ? edges[b + 1] : total;
  return { b, from: v - edges[b], to: end - v, len: end - edges[b] };
}

/** R: strata of stacked blocks (V = up). */
function strataBlocks(seed: number): Gen {
  const rng = mulberry32(seed);
  const bands = runs(rng, SIZE, 20, 46);
  const joints = bands.map(() => ({ off: Math.floor(rng() * SIZE), edges: runs(rng, SIZE, 38, 104) }));
  const warp = fbm(seed + 1, 2, 3), jwob = tileNoise(seed + 2, 8, 16), mott = fbm(seed + 3, 6, 3), frac = worley(seed + 4, 5), fracMask = fbm(seed + 5, 3, 2);
  return (x, y) => {
    const yy = (((y + (warp(x, y) - 0.5) * 34) % SIZE) + SIZE) % SIZE;
    const band = runAt(bands, SIZE, yy);
    const J = joints[band.b];
    const xx = (((x + J.off + (jwob(x, y) - 0.5) * 8) % SIZE) + SIZE) % SIZE;
    const blk = runAt(J.edges, SIZE, xx);
    let v = 0.5 + (hash(band.b, 0, seed) - 0.5) * 0.3 + (hash(band.b, blk.b, seed + 9) - 0.5) * 0.16;
    v += (steps(mott(x, y), 4) - 0.5) * 0.12;
    // Pale lip along the band's top, a soft shadow tucked under the band above.
    v += 0.13 * (1 - smooth(2, 6, band.to));
    v -= 0.1 * (1 - smooth(2, 10, band.from));
    // Fractures: thin diagonal cracks in patches.
    const [f1, f2] = frac(x, y);
    if (f2 - f1 < 1.4 && fracMask(x, y) > 0.56) v -= 0.16;
    // Dark gaps between bands and between blocks.
    const gap = Math.min(1 - smooth(0.6, 2.2, Math.min(band.from, band.to)), 1);
    const joint = 1 - smooth(0.6, 2.0, Math.min(blk.from, blk.to));
    return Math.max(0.06, v - Math.max(gap * 0.36, joint * 0.3));
  };
}

/**
 * Tileable cellular noise that also names the two nearest cells, so a crack can run along only
 * some of the borders (closed cells everywhere read as laid paving, not rock).
 */
function cells2(seed: number, n: number) {
  const rng = mulberry32(seed), cell = SIZE / n;
  const pts = Array.from({ length: n * n }, (_, i) => [((i % n) + 0.1 + rng() * 0.8) * cell, (Math.floor(i / n) + 0.1 + rng() * 0.8) * cell]);
  return (x: number, y: number) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let f1 = 1e9, f2 = 1e9, a = 0, b = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = (cx + dx + n) % n, gy = (cy + dy + n) % n, k = gy * n + gx;
      const d = Math.hypot(x - (pts[k][0] + (cx + dx - gx) * cell), y - (pts[k][1] + (cy + dy - gy) * cell));
      if (d < f1) {
        f2 = f1;
        b = a;
        f1 = d;
        a = k;
      } else if (d < f2) {
        f2 = d;
        b = k;
      }
    }
    return { f1, f2, a, b };
  };
}

/** G: ledge tops, broad weathered slabs split by a few long, broken cracks. */
function ledgeTops(seed: number): Gen {
  const big = cells2(seed, 4), small = cells2(seed + 7, 9), warp = fbm(seed + 4, 4, 2), warp2 = fbm(seed + 5, 4, 2);
  const mott = fbm(seed + 1, 5, 3), blot = fbm(seed + 6, 2, 3), chips = worley(seed + 2, 22), chipMask = fbm(seed + 3, 3, 2);
  return (x, y) => {
    // Wobbly borders: look the cells up at a warped point.
    const wx = x + (warp(x, y) - 0.5) * 22, wy = y + (warp2(x, y) - 0.5) * 22;
    const B = big(wx, wy), S = small(wx, wy);
    let v = 0.5 + (hash(B.a, 1, seed) - 0.5) * 0.2 + (steps(mott(x, y), 4) - 0.5) * 0.14 + (steps(blot(x, y), 3) - 0.5) * 0.12;
    const [c1] = chips(x, y);
    if (c1 < 2.2 && chipMask(x, y) > 0.52) v += 0.1;
    // Main cracks along most big borders, fine ones along only a few small borders.
    const edgeB = hash(Math.min(B.a, B.b), Math.max(B.a, B.b), seed + 3) < 0.7 ? 1 - smooth(0.7, 2.2, B.f2 - B.f1) : 0;
    const edgeS = hash(Math.min(S.a, S.b), Math.max(S.a, S.b), seed + 5) < 0.3 ? 1 - smooth(0.4, 1.3, S.f2 - S.f1) : 0;
    v += 0.05 * (1 - smooth(2, 6, B.f2 - B.f1)) * (edgeB > 0 ? 1 : 0);
    return Math.max(0.08, v - Math.max(edgeB * 0.3, edgeS * 0.16));
  };
}

/** B: grain, pale and dark flecks over a fine mottle. */
function grain(seed: number): Gen {
  const flecks = worley(seed, 36), fine = fbm(seed + 1, 16, 2), mask = fbm(seed + 2, 4, 2);
  return (x, y) => {
    const [f1, , id] = flecks(x, y);
    let v = 0.5 + (fine(x, y) - 0.5) * 0.35;
    if (f1 < 1.7 && mask(x, y) > 0.42) v += id > 0.55 ? 0.3 : -0.3;
    return v;
  };
}

let atlas: THREE.DataTexture | null = null;

/** The rock atlas (built once). */
export function rockAtlas(): THREE.DataTexture {
  if (atlas) return atlas;
  const gens: Gen[] = [strataBlocks(901), ledgeTops(911), grain(921)];
  const blot = fbm(931, 2, 3);
  const data = new Uint8Array(SIZE * SIZE * 4);
  const raw = new Float32Array(SIZE * SIZE);
  let lo = 1, hi = 0;
  for (let i = 0; i < raw.length; i++) {
    raw[i] = blot(i % SIZE, Math.floor(i / SIZE));
    lo = Math.min(lo, raw[i]);
    hi = Math.max(hi, raw[i]);
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(1, gens[c](x, y))) * 255;
    data[i + 3] = ((raw[y * SIZE + x] - lo) / (hi - lo)) * 255;
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = 'rock';
  atlas = tex;
  return tex;
}

/**
 * GLSL: `vec3 rockPaint(vec3 base, vec3 p, vec3 n, float k)` paints rock of colour `base` at
 * position `p` with flat face normal `n`, strength `k` (0 = untouched). Needs `uRockTex` and
 * `uRockScale`. Four fetches: a slow one for drift, then one per projection plane.
 */
export const ROCK_GLSL = `
  uniform sampler2D uRockTex;
  uniform float uRockScale;
  // The flat face normal from screen derivatives of a position, guarded: a face seen exactly
  // edge-on has no area on screen, and a NaN here would bloom across the whole frame.
  vec3 rockFaceN(vec3 p) {
    vec3 c = cross(dFdx(p), dFdy(p));
    float l2 = dot(c, c);
    return l2 > 1e-24 ? c * inversesqrt(l2) : vec3(0.0, 1.0, 0.0);
  }
  vec3 rockPaint(vec3 base, vec3 p, vec3 n, float k) {
    vec3 an = abs(n);
    vec3 w = pow(an, vec3(10.0)) + 1e-4;
    w /= (w.x + w.y + w.z);
    vec3 q = p * uRockScale;
    // Slow drift: shifts the strata up and down along the wall and warms or cools the rock, so
    // the tile never repeats visibly on a long face.
    float drift = texture2D(uRockTex, (q.xz + q.y * 0.3) * 0.17 + vec2(0.29, 0.53)).a;
    float vy = q.y + (drift - 0.5) * 0.45;
    vec4 tx = texture2D(uRockTex, vec2(q.z, vy));
    vec4 tz = texture2D(uRockTex, vec2(q.x + 0.37, vy));
    vec4 ty = texture2D(uRockTex, q.xz + vec2(0.61, 0.13));
    float pat = tx.r * w.x + tz.r * w.z + ty.g * w.y;
    float gr = tx.b * w.x + tz.b * w.z + ty.b * w.y;
    float blot = mix(tx.a * w.x + tz.a * w.z + ty.a * w.y, drift, 0.5);
    vec3 c = base * (0.42 + 1.16 * pat);
    c *= 0.84 + 0.32 * gr;
    c *= mix(vec3(0.9, 0.95, 1.07), vec3(1.1, 1.0, 0.86), smoothstep(0.25, 0.75, blot));
    // Ledge tops catch the light, overhangs sit in shade.
    c *= 1.0 + 0.16 * n.y;
    return mix(base, c, k);
  }`;

/**
 * Paint a MeshStandardMaterial as rock (replaces any painted surface in the same slot). `space`
 * 'world' lines the strata up across instances; 'object' keeps them fixed to a moving prop.
 */
export function applyRock(mat: THREE.Material, space: SurfaceSpace = 'world', scaleMul = 1) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const uniforms = { uRockTex: { value: rockAtlas() }, uRockScale: { value: scaleMul / ROCK_TILE } };
  addPatch(mat, {
    key: `rock:${space}`,
    slot: 'surface',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      const vert = space === 'world'
        ? `{
            vec4 rw = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              rw = instanceMatrix * rw;
            #endif
            vRockPos = (modelMatrix * rw).xyz;
          }`
        : 'vRockPos = transformed;';
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
        .replace('#include <project_vertex>', `#include <project_vertex>\n${vert}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vRockPos;\n${ROCK_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // The flat face normal in the projection's own space (hard facets, crisp pattern per face).
            vec3 rn = rockFaceN(vRockPos);
            diffuseColor.rgb = rockPaint(diffuseColor.rgb, vRockPos, rn, 1.0);
          }`,
        );
    },
  });
}
