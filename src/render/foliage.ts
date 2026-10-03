import * as THREE from 'three';
import { shareResource } from './resources';
import { clamp, mulberry32, type Rng } from '../core/rng';
import { addPatch } from './surface';
import { fbm, SIZE, tileNoise } from './textures';

/**
 * Grown trees' surfaces (treeGrowth.ts): a painted leaf atlas, a painted bark texture, and the
 * bark and leaf materials that use them, both swaying in the wind.
 *
 * - Leaves: sprays of lobed oak leaves on a twig, painted at startup into an alpha-cut atlas: each
 *   leaf in its own tone between a deep blue-green and a warm light green, lit on one half of its
 *   midrib, darker at its stalk, with a pale midrib and a soft shadow on the leaves under it. The
 *   colours are multipliers (the instance colour gives the species its green, gold or red), and its
 *   mipmaps keep the leaves' coverage, so a crown never thins out at a distance.
 * - Bark: deep vertical fissures wandering and meeting round long plates, broken across here and
 *   there, each plate its own tone, moss in patches. The bark shader maps it along every limb from
 *   its bark frame (two projections square to the limb, blended by the surface's facing), so the
 *   fissures follow each limb and run on through every fork without a seam.
 */

/** The world's wind clock (worldView.ts advances it). */
export interface WindClock {
  uWindT: { value: number };
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ─── Leaf atlas ─────────────────────────────────────────────────────────────

/** Leaf sprays in the atlas: a grid of SPRAY_CELLS × SPRAY_CELLS cells, one spray in each. */
export const SPRAY_CELLS = 2;

/** Atlas size (px). */
export const LEAF_ATLAS = 512;
const CELL = LEAF_ATLAS / SPRAY_CELLS;

/** A leaf: its stalk's foot (cell px, y up), heading (radians), length and width (px), tone (0 deep .. 1 light). */
interface Leaf {
  x: number;
  y: number;
  a: number;
  len: number;
  wid: number;
  tone: number;
}

/** Deep and light leaf colours (multipliers of the instance colour), and the twig's. */
const DEEP = [0.36, 0.47, 0.5], LIGHT = [0.95, 0.98, 0.66], TWIG = [0.5, 0.4, 0.34];
/** Light falls on the sprays from the upper left. */
const LIGHT_DIR = [-0.6, 0.8];

/**
 * Half-width of an oak leaf (as a share of its width) at u along its midrib (0 stalk .. 1 tip):
 * widest past the middle, four broad rounded lobes a side with deep sinuses between them (the two
 * sides' lobes alternate), a short stalk and a rounded tip.
 */
export function oakLeafHalfWidth(u: number, left: boolean) {
  if (u <= 0 || u >= 1) return 0;
  const stalk = smooth(0.02, 0.12, u);
  const body = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.7);
  const lobe = 1 - 0.5 * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * 2 * (4 * u + (left ? 0.1 : 0.6))), 2) * smooth(0.08, 0.2, u) * (1 - smooth(0.88, 0.99, u));
  return 0.5 * Math.max(u < 0.14 ? 0.07 : 0, body * lobe * stalk);
}

/**
 * The leaves and twigs of one spray, the way an oak carries them: its leaves crowd in rosettes at
 * the ends of its shoots. A bending twig with four short side shoots, each ending in a rosette of
 * five or six leaves fanning outward (never a full star), a larger rosette at the twig's tip with
 * lighter young leaves, and a leaf or two low on the twig. Leaves are listed from the foot of the
 * spray up, so the higher ones lie over the lower.
 */
function spray(rng: Rng) {
  const bend = (rng() - 0.5) * 60;
  const main: [number, number][] = [[CELL / 2, 1], [CELL / 2 + bend * 0.2, CELL * 0.22], [CELL / 2 + bend * 0.6, CELL * 0.45], [CELL / 2 + bend, CELL * 0.64]];
  const twigs: [number, number][][] = [main];
  const on = (t: number): [number, number] => {
    const f = clamp(t, 0, 1) * (main.length - 1), i = Math.min(main.length - 2, Math.floor(f)), k = f - i;
    return [main[i][0] + (main[i + 1][0] - main[i][0]) * k, main[i][1] + (main[i + 1][1] - main[i][1]) * k];
  };
  const heading = (t: number) => {
    const [x0, y0] = on(t - 0.03), [x1, y1] = on(t + 0.03);
    return Math.atan2(y1 - y0, x1 - x0);
  };
  const leaves: (Leaf & { order: number })[] = [];
  const leaf = (x: number, y: number, a: number, len: number, tone: number) =>
    leaves.push({ x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, a, len, wid: len * (0.5 + rng() * 0.08), tone: clamp(tone, 0, 1), order: y + rng() * 6 });
  /** A rosette of n leaves fanning outward round a shoot's heading a, the middle ones longest. */
  const rosette = (x: number, y: number, a: number, n: number, size: number, tone: number) => {
    for (let i = 0; i < n; i++) {
      const off = ((i / (n - 1)) - 0.5) * 2.5 + (rng() - 0.5) * 0.3;
      leaf(x, y, a + off, CELL * size * (0.17 + 0.06 * Math.cos(off)) * (0.88 + rng() * 0.24), tone + (rng() - 0.5) * 0.4);
    }
  };
  let side = rng() < 0.5 ? 1 : -1;
  for (const t of [0.24, 0.33]) {
    const [x, y] = on(t + rng() * 0.03);
    leaf(x, y, heading(t) + side * (0.6 + rng() * 0.4), CELL * (0.15 + rng() * 0.03), 0.2 + rng() * 0.35);
    side = -side;
  }
  for (const [t, sd] of [[0.38, side], [0.52, -side], [0.66, side], [0.8, -side]]) {
    const tt = t + rng() * 0.05, [x, y] = on(tt), a = heading(tt) + sd * (0.65 + rng() * 0.35), l = CELL * (0.1 + rng() * 0.06);
    const end: [number, number] = [x + Math.cos(a) * l, y + Math.sin(a) * l];
    twigs.push([[x, y], end]);
    rosette(end[0], end[1], a, 5 + Math.floor(rng() * 2), 0.82 + rng() * 0.12, 0.25 + rng() * 0.4);
  }
  const tip = main[main.length - 1];
  rosette(tip[0], tip[1], heading(1), 6 + Math.floor(rng() * 2), 1, 0.55 + rng() * 0.3);
  leaves.sort((p, q) => p.order - q.order);
  return { twigs, leaves };
}

/**
 * Paint the leaf atlas into premultiplied RGBA floats (LEAF_ATLAS², rows bottom-up): one spray per
 * cell, each from its own seed.
 */
export function paintLeafAtlas() {
  const W = LEAF_ATLAS, img = new Float32Array(W * W * 4);
  const over = (i: number, r: number, g: number, b: number, a: number) => {
    const k = 1 - a;
    img[i] = r * a + img[i] * k;
    img[i + 1] = g * a + img[i + 1] * k;
    img[i + 2] = b * a + img[i + 2] * k;
    img[i + 3] = a + img[i + 3] * k;
  };
  for (let cell = 0; cell < SPRAY_CELLS * SPRAY_CELLS; cell++) {
    const ox = (cell % SPRAY_CELLS) * CELL, oy = Math.floor(cell / SPRAY_CELLS) * CELL;
    const rng = mulberry32(9001 + cell * 37);
    const { twigs, leaves } = spray(rng);
    const px = (x: number, y: number) => ((oy + y) * W + ox + x) * 4;
    // Twigs: tapering strokes under the leaves.
    for (const t of twigs) {
      for (let s = 0; s < t.length - 1; s++) {
        const [x0, y0] = t[s], [x1, y1] = t[s + 1], w0 = t === twigs[0] ? 3.2 - s * 0.7 : 1.6;
        for (let y = Math.max(0, Math.floor(Math.min(y0, y1) - 4)); y < Math.min(CELL, Math.ceil(Math.max(y0, y1) + 4)); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(x0, x1) - 4)); x < Math.min(CELL, Math.ceil(Math.max(x0, x1) + 4)); x++) {
            const dx = x1 - x0, dy = y1 - y0, f = clamp(((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / (dx * dx + dy * dy), 0, 1);
            const d = Math.hypot(x + 0.5 - x0 - dx * f, y + 0.5 - y0 - dy * f), half = Math.max(0.8, w0 * (1 - f * 0.3)) / 2;
            const cov = clamp(half - d + 0.5, 0, 1);
            if (cov > 0) over(px(x, y), TWIG[0] * (0.85 + 0.3 * f), TWIG[1] * (0.85 + 0.3 * f), TWIG[2] * (0.85 + 0.3 * f), cov);
          }
        }
      }
    }
    // Leaves, each first dropping a soft shadow on what lies under it.
    for (const lf of leaves) {
      const dx = Math.cos(lf.a), dy = Math.sin(lf.a);
      const lit = Math.sign(-dy * LIGHT_DIR[0] + dx * LIGHT_DIR[1]) || 1;
      const reachX = Math.abs(dx) * lf.len + Math.abs(dy) * lf.wid * 0.5 + 4, reachY = Math.abs(dy) * lf.len + Math.abs(dx) * lf.wid * 0.5 + 4;
      const cx = lf.x + dx * lf.len * 0.5, cy = lf.y + dy * lf.len * 0.5;
      const x0 = Math.max(0, Math.floor(cx - reachX * 0.5 - 4)), x1 = Math.min(CELL, Math.ceil(cx + reachX * 0.5 + 6));
      const y0 = Math.max(0, Math.floor(cy - reachY * 0.5 - 6)), y1 = Math.min(CELL, Math.ceil(cy + reachY * 0.5 + 4));
      /** Signed distance (px, positive inside) to the leaf's outline at a point, and its place along and across the midrib. */
      const shape = (x: number, y: number) => {
        const rx = x - lf.x, ry = y - lf.y;
        const u = (rx * dx + ry * dy) / lf.len, v = dx * ry - dy * rx;
        // (Off the ends of the midrib there is no leaf at all, not a hairline.)
        return { d: u <= 0 || u >= 1 ? -9 : oakLeafHalfWidth(u, v > 0) * lf.wid - Math.abs(v), u, v };
      };
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const s = shape(x + 0.5 - 3, y + 0.5 + 4);
        const i = px(x, y);
        if (s.d > -2.5 && img[i + 3] > 0) {
          const k = 1 - 0.28 * smooth(-2.5, 2.5, s.d);
          img[i] *= k;
          img[i + 1] *= k;
          img[i + 2] *= k;
        }
      }
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const s = shape(x + 0.5, y + 0.5);
        const cov = clamp(s.d / 1.3 + 0.5, 0, 1);
        if (cov <= 0) continue;
        // The half of the leaf facing the light, its stalk darker, a pale midrib, a darker rim.
        let shade = (s.v * lit > 0 ? 1.07 : 0.86) * (0.86 + 0.18 * clamp(s.u, 0, 1));
        if (s.d < 1.8) shade *= 0.93;
        if (Math.abs(s.v) < 0.9 && s.u > 0.05 && s.u < 0.9) shade *= 1.12;
        shade = Math.round(shade * 8) / 8 * 0.6 + shade * 0.4;
        const t = lf.tone;
        over(px(x, y), (DEEP[0] + (LIGHT[0] - DEEP[0]) * t) * shade, (DEEP[1] + (LIGHT[1] - DEEP[1]) * t) * shade, (DEEP[2] + (LIGHT[2] - DEEP[2]) * t) * shade, cov);
      }
    }
  }
  return img;
}

/**
 * Mip levels of a premultiplied RGBA float image (square, a power of two) as straight-alpha bytes.
 * Colour bleeds out into the clear texels (no dark fringe where a leaf's edge is filtered), and each
 * level's alpha is scaled so as many texels pass the alpha test as at full size.
 */
export function coverageMips(img: Float32Array, size: number) {
  const levels: { data: Uint8Array; width: number; height: number }[] = [];
  const cut = 0.5;
  // Straight colour, bled into the clear texels from their neighbours, the rest the mean leaf colour.
  let n = size, rgba = new Float32Array(img.length);
  let mean = [0, 0, 0], wsum = 0;
  for (let i = 0; i < img.length; i += 4) {
    const a = img[i + 3];
    rgba[i + 3] = a;
    if (a > 1e-4) for (let c = 0; c < 3; c++) rgba[i + c] = img[i + c] / a;
    if (a > 0.5) {
      for (let c = 0; c < 3; c++) mean[c] += rgba[i + c];
      wsum++;
    }
  }
  mean = mean.map((m) => m / Math.max(1, wsum));
  let filled = new Uint8Array(n * n).map((_, i) => (img[i * 4 + 3] > 1e-4 ? 1 : 0));
  for (let pass = 0; pass < 6; pass++) {
    const next = filled.slice();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (filled[i]) continue;
      let cnt = 0, r = 0, g = 0, b = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n || !filled[yy * n + xx]) continue;
        const j = (yy * n + xx) * 4;
        r += rgba[j];
        g += rgba[j + 1];
        b += rgba[j + 2];
        cnt++;
      }
      if (!cnt) continue;
      rgba[i * 4] = r / cnt;
      rgba[i * 4 + 1] = g / cnt;
      rgba[i * 4 + 2] = b / cnt;
      next[i] = 1;
    }
    filled = next;
  }
  filled.forEach((f, i) => {
    if (!f) for (let c = 0; c < 3; c++) rgba[i * 4 + c] = mean[c];
  });
  const passing = (a: Float32Array, k: number) => {
    let p = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] * k >= cut) p++;
    return p / (a.length / 4);
  };
  const target = passing(rgba, 1);
  for (;;) {
    let k = 1;
    if (n !== size) {
      let lo = 0.5, hi = 8;
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2;
        if (passing(rgba, mid) < target) lo = mid;
        else hi = mid;
      }
      k = hi;
    }
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(clamp(rgba[i + c], 0, 1) * 255);
      data[i + 3] = Math.round(clamp(rgba[i + 3] * k, 0, 1) * 255);
    }
    levels.push({ data, width: n, height: n });
    if (n === 1) break;
    // Down a level: colour averaged by alpha (the bled colour where all four are clear).
    const m = n / 2, down = new Float32Array(m * m * 4);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      let r = 0, g = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const j = ((y * 2 + oy) * n + x * 2 + ox) * 4, w = rgba[j + 3];
        r += rgba[j] * w;
        g += rgba[j + 1] * w;
        b += rgba[j + 2] * w;
        a += w;
        r0 += rgba[j] / 4;
        g0 += rgba[j + 1] / 4;
        b0 += rgba[j + 2] / 4;
      }
      const i = (y * m + x) * 4;
      down.set(a > 1e-4 ? [r / a, g / a, b / a, a / 4] : [r0, g0, b0, 0], i);
    }
    rgba = down;
    n = m;
  }
  return levels;
}

let leafTex: THREE.DataTexture | null = null;

/** The painted leaf atlas (built once, shared by every grown tree). */
export function leafAtlas() {
  if (leafTex) return leafTex;
  const mips = coverageMips(paintLeafAtlas(), LEAF_ATLAS);
  const tex = new THREE.DataTexture(mips[0].data, LEAF_ATLAS, LEAF_ATLAS, THREE.RGBAFormat);
  tex.mipmaps = mips;
  tex.generateMipmaps = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tex.name = 'leaves';
  leafTex = shareResource(tex);
  return tex;
}

// ─── Bark ───────────────────────────────────────────────────────────────────

/**
 * Bark plates: tileable cells stretched up the tile (vertical distance counts `squash` as much),
 * returning the distances to the nearest two cell points and the nearest cell's own random value.
 */
function plates(seed: number, nx: number, ny: number, squash: number) {
  const rng = mulberry32(seed), cw = SIZE / nx, ch = SIZE / ny;
  const pts = Array.from({ length: nx * ny }, (_, i) => [((i % nx) + 0.15 + rng() * 0.7) * cw, (Math.floor(i / nx) + rng()) * ch, rng()]);
  const wrap = (i: number, n: number) => ((i % n) + n) % n;
  return (x: number, y: number) => {
    const cx = Math.floor(x / cw), cy = Math.floor(y / ch);
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const gx = wrap(cx + dx, nx), gy = wrap(cy + dy, ny), p = pts[gy * nx + gx];
      const d = Math.hypot(x - p[0] - (cx + dx - gx) * cw, (y - p[1] - (cy + dy - gy) * ch) * squash);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = p[2];
      } else if (d < f2) f2 = d;
    }
    return [f1, f2, id] as const;
  };
}

/**
 * The bark texture's channels (tileable, SIZE², V up the limb): R the plates' height (0 in a
 * furrow, 1 on a plate's crown), G each plate's tone, B the moss. An oak's bark: furrows running
 * up the limb, leaning and wandering (their ridges now and then merging across one), the ridges
 * between them broken into long staggered plates, each its own tone, with fine striations.
 */
export function paintBark() {
  const RIDGES = 9;
  const warp = fbm(803, 3, 2), wobble = fbm(809, 12, 2), merge = fbm(810, 4, 2), striae = tileNoise(804, 48, 6);
  const cells = plates(801, 9, 3, 0.2), tone = fbm(806, 4, 3), moss = fbm(808, 3, 3);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    // (The wander tiles, so the whole number of ridges across keeps the texture seamless.)
    const u = x + (warp(x, y) - 0.5) * 44 + (wobble(x, y) - 0.5) * 14;
    const ridge = 0.5 + 0.5 * Math.cos((u / SIZE) * RIDGES * Math.PI * 2);
    const furrow = (1 - smooth(0.05, 0.36, ridge)) * (1 - smooth(0.58, 0.72, merge(x, y)));
    // Plates: the ridges broken across where the stretched cells meet, staggered from ridge to ridge.
    const [f1, f2, id] = cells(u, y);
    const split = 1 - smooth(0.5, 2.4, f2 - f1);
    const h = clamp(0.3 + 0.55 * smooth(0.2, 0.9, ridge) + (striae(x, y) - 0.5) * 0.2 - furrow * 0.6 - split * 0.4, 0, 1);
    const t = clamp(0.5 + (id - 0.5) * 0.7 + (tone(x, y) - 0.5) * 0.6, 0, 1);
    const m = smooth(0.52, 0.66, moss(x, y)) * smooth(0.25, 0.6, h);
    const i = (y * SIZE + x) * 4;
    data[i] = h * 255;
    data[i + 1] = (Math.round(t * 5) / 5 * 0.7 + t * 0.3) * 255;
    data[i + 2] = m * 255;
    data[i + 3] = 255;
  }
  return data;
}

let barkTex: THREE.DataTexture | null = null;

/** The painted bark texture (built once, shared). */
export function barkTexture() {
  if (barkTex) return barkTex;
  const tex = new THREE.DataTexture(paintBark(), SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = 'bark';
  barkTex = shareResource(tex);
  return tex;
}

// ─── Materials ──────────────────────────────────────────────────────────────

/**
 * GLSL: how far the wind carries a point with a sway weight `w` (0 still .. about 1.5 at the
 * twigs). The whole tree leans slowly with the gusts; each bough rocks on its own phase, set by
 * where it is in the crown; every tree has its own phase from where it stands.
 */
const SWAY_GLSL = `
  uniform float uWindT;
  vec3 treeSway(vec3 at, float w) {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
    #endif
    float ph = uWindT * 0.9 + ip.x * 0.31 + ip.z * 0.23;
    float gust = 0.6 + 0.4 * sin(uWindT * 0.37 + ip.x * 0.05 + ip.z * 0.03);
    float lean = (sin(ph) * 0.65 + sin(ph * 2.17 + 1.3) * 0.35) * gust;
    float bough = sin(uWindT * 1.9 + dot(at, vec3(0.61, 0.37, 0.53)) + ip.z * 0.7) * gust;
    return vec3(lean * 0.07 + bough * 0.05, bough * 0.03, lean * 0.04 + bough * 0.045) * w;
  }`;

/** Bark texture repeats per metre (one tile is about 0.85 m of bark: plates a hand wide). */
const BARK_SCALE = 1.15;

/**
 * Turn a scenery material into a grown tree's bark: smooth shading over the wood's painted shade
 * (vertex colour), the bark texture mapped along every limb from its bark frame (see the file
 * comment) and painted in deep fissures, warm grey-brown plates lit along their crowns and moss
 * on the limbs' upper sides and round the damp foot; limbs and branches sway with their weight.
 */
export function grownBark(mat: THREE.MeshStandardMaterial, wind: WindClock) {
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.95;
  mat.color.setRGB(1, 1, 1);
  const uniforms = { uBarkTex: { value: barkTexture() }, uBarkScale: { value: BARK_SCALE } };
  addPatch(mat, {
    key: 'grown-bark',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms, wind);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aBarkA;
          attribute vec4 aBarkB;
          attribute vec2 aWood;
          varying vec3 vBarkN;
          varying vec3 vBarkT;
          varying vec3 vBarkNrm;
          varying vec4 vBarkRV;
          ${SWAY_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vBarkN = aBarkA.xyz;
          vBarkT = aBarkB.xyz;
          vBarkNrm = objectNormal;
          vBarkRV = vec4(aBarkA.w, aBarkB.w, position.y, aWood.y);
          transformed += treeSway(position, aWood.x);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uBarkTex;
          uniform float uBarkScale;
          varying vec3 vBarkN;
          varying vec3 vBarkT;
          varying vec3 vBarkNrm;
          varying vec4 vBarkRV;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 n = normalize(vBarkNrm), t = normalize(vBarkT);
            vec3 fa = normalize(vBarkN - t * dot(vBarkN, t)), fb = cross(t, fa);
            float ca = dot(n, fa), cb = dot(n, fb);
            // Two projections square to the limb, each where it sees the bark face on.
            float wa = pow(abs(cb), 4.0), wb = pow(abs(ca), 4.0);
            vec4 bk = (texture2D(uBarkTex, vec2(vBarkRV.x * ca, vBarkRV.y) * uBarkScale) * wa
              + texture2D(uBarkTex, vec2(vBarkRV.x * cb, vBarkRV.y) * uBarkScale) * wb) / (wa + wb + 1e-4);
            vec3 plate = mix(vec3(0.2, 0.172, 0.15), vec3(0.31, 0.27, 0.225), bk.g);
            vec3 bark = mix(vec3(0.09, 0.077, 0.066), plate, smoothstep(0.14, 0.42, bk.r));
            bark *= 0.92 + 0.2 * smoothstep(0.6, 0.95, bk.r);
            // Young branches are smoother, and the bark gathers into an even wrinkled collar where a
            // branch leaves its parent: the plates fade into an even, darker bark.
            bark = mix(vec3(0.15, 0.13, 0.115), bark, (0.3 + 0.7 * smoothstep(0.025, 0.16, vBarkRV.x)) * vBarkRV.w);
            float moss = bk.b * clamp(smoothstep(0.2, 0.85, n.y) + (1.0 - smoothstep(0.1, 1.3, vBarkRV.z)) * 0.8, 0.0, 1.0);
            bark = mix(bark, vec3(0.25, 0.33, 0.13), moss * 0.8);
            diffuseColor.rgb *= bark * 1.6;
          }`);
    },
  });
}

/** Leaves are this much brighter than the atlas's multipliers (it keeps headroom for its light leaves). */
const LEAF_GAIN = 1.3;

/**
 * Turn a scenery material into a grown tree's leaves: the painted atlas, alpha-cut (soft-edged
 * with multisampling), both faces lit by the crown's normals (never darkened as back faces), the
 * instance colour and the crown's painted shade over it; each card rides its twig in the wind and
 * flutters at its far edge.
 */
export function grownLeaves(mat: THREE.MeshStandardMaterial, wind: WindClock) {
  mat.map = leafAtlas();
  mat.alphaTest = 0.5;
  mat.side = THREE.DoubleSide;
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.85;
  mat.color.setScalar(LEAF_GAIN);
  addPatch(mat, {
    key: 'grown-leaves',
    apply(shader) {
      Object.assign(shader.uniforms, wind);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aWind;
          attribute float aFlutter;
          ${SWAY_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed += treeSway(aWind.xyz, aWind.w);
          transformed += objectNormal * sin(uWindT * 6.3 + dot(aWind.xyz, vec3(12.9, 7.3, 9.1))) * 0.05 * aFlutter * aWind.w;`);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif`,
      );
    },
  });
}
