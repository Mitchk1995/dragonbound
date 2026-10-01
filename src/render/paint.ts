import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { addPatch, type SurfaceSpace } from './surface';
import { applyRock } from './rock';
import { fbm, SIZE, tileNoise, worley, type Gen } from './textures';

/**
 * Hand-painted albedo (colour only: no bump, no normal changes), in the spirit of WoW and
 * Torchlight: flat painted tones in soft steps, painted mortar and seams, lighter top edges,
 * warm lights and cool darks. Patterns are large and calm so they read as painted detail from
 * the top-down camera, never as noise.
 *
 * Everything is generated at startup into two RGBA atlases (one pattern per channel), so every
 * painted material binds one texture and makes one fetch: box projection picks the face's
 * dominant axis, with the texture's V always along world/object up on side faces, so courses,
 * strata and plank seams never flip direction between faces.
 *
 * Reusable: `applyPaint(material, kind, space)` works on any MeshStandardMaterial; 'object' space
 * keeps the pattern fixed to a model as it moves (characters, props), 'world' lines it up across
 * instances (rocks, walls).
 */

export type PaintKind = 'masonry' | 'rock' | 'wood' | 'shingle' | 'bone' | 'hide' | 'plaster' | 'soft' | 'bark' | 'leaves' | 'needles' | 'foliage';

interface PaintParams {
  atlas: 0 | 1 | 2;
  channel: 0 | 1 | 2 | 3;
  /** Pattern repeats per unit (one tile = 1 / scale units). */
  scale: number;
  /** How strongly the paint lightens/darkens the base colour (0..1). */
  amount: number;
}

export const PAINTS: Record<PaintKind, PaintParams> = {
  masonry: { atlas: 0, channel: 0, scale: 0.5, amount: 0.34 },
  rock: { atlas: 0, channel: 1, scale: 0.33, amount: 0.3 },
  wood: { atlas: 0, channel: 2, scale: 0.8, amount: 0.3 },
  shingle: { atlas: 0, channel: 3, scale: 0.55, amount: 0.34 },
  bone: { atlas: 1, channel: 0, scale: 1.2, amount: 0.3 },
  hide: { atlas: 1, channel: 1, scale: 0.7, amount: 0.24 },
  plaster: { atlas: 1, channel: 2, scale: 0.5, amount: 0.2 },
  soft: { atlas: 1, channel: 3, scale: 0.6, amount: 0.18 },
  bark: { atlas: 2, channel: 0, scale: 1.0, amount: 0.4 },
  leaves: { atlas: 2, channel: 1, scale: 0.5, amount: 0.48 },
  needles: { atlas: 2, channel: 2, scale: 0.6, amount: 0.46 },
  foliage: { atlas: 2, channel: 3, scale: 0.42, amount: 0.5 },
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Quantise into `steps` flat tones with soft transitions: the painted look. */
export const posterize = (v: number, steps = 5, soft = 0.4) => {
  const s = Math.max(0, Math.min(0.9999, v)) * steps, f = Math.floor(s);
  return (f + smooth(0.5 - soft / 2, 0.5 + soft / 2, s - f)) / steps;
};

const hash = (a: number, b: number, seed: number) => {
  let h = Math.imul(a * 73856093 ^ b * 19349663 ^ seed * 83492791, 0x5bd1e995);
  h ^= h >>> 15;
  return ((Math.imul(h, 0x27d4eb2d) ^ (h >>> 13)) >>> 0) / 4294967296;
};

/**
 * Painted generators: (x, y) in texels (y = up on side faces) → value 0..1, 0.5 = base colour.
 * All tile seamlessly on the SIZE × SIZE torus.
 */
export const PAINTERS: Record<PaintKind, () => Gen> = {
  masonry: () => {
    // Four courses per tile, blocks of varied length in running bond, painted mortar, a lighter
    // top edge on each block and a soft shadow under it.
    const rows = 4, rowH = SIZE / rows, rng = mulberry32(501);
    const layout = Array.from({ length: rows }, () => {
      const off = Math.floor(rng() * SIZE), edges: number[] = [];
      for (let x = 0; x < SIZE;) {
        let l = 48 + Math.floor(rng() * 4) * 16;
        if (SIZE - x - l < 40) l = SIZE - x;
        edges.push(x);
        x += l;
      }
      return { off, edges };
    });
    const blotch = fbm(502, 4, 3), fine = fbm(503, 16, 2);
    return (x, y) => {
      const r = Math.floor(y / rowH), fy = y - r * rowH;
      const { off, edges } = layout[r];
      const xx = (x + off) % SIZE;
      let b = 0;
      while (b + 1 < edges.length && edges[b + 1] <= xx) b++;
      const x1 = b + 1 < edges.length ? edges[b + 1] : SIZE;
      const joint = Math.min(xx - edges[b], x1 - xx);
      const inside = smooth(1.5, 4, joint) * smooth(1.5, 4, Math.min(fy, rowH - fy));
      let v = 0.47 + (hash(r, b, 7) - 0.5) * 0.24 + posterize(blotch(x, y), 4) * 0.2 - 0.1 + (fine(x, y) - 0.5) * 0.05;
      v += 0.11 * smooth(rowH - 14, rowH - 5, fy) - 0.07 * (1 - smooth(4, 14, fy));
      return 0.17 + (v - 0.17) * inside;
    };
  },
  rock: () => {
    // Painted strata: soft horizontal bands that wander, in flat tones, with pale chips.
    const warp = fbm(511, 2, 3), bands = tileNoise(512, 2, 12), blotch = fbm(513, 3, 3), chips = worley(514, 7);
    return (x, y) => {
      const b = bands(x, y + (warp(x, y) - 0.5) * 60);
      const [f1] = chips(x, y);
      const chip = f1 < 5 && blotch(x + 90, y) > 0.56 ? 0.08 : 0;
      return posterize(0.25 + b * 0.45 + blotch(x, y) * 0.25, 5) + chip;
    };
  },
  wood: () => {
    // Planks (seams every 32 texels) with soft grain streaks along them and per-plank tone.
    const grain = tileNoise(521, 48, 3), soft = fbm(522, 3, 3);
    return (x, y) => {
      const p = Math.floor(x / 32), fx = x - p * 32;
      const seam = smooth(0.8, 2.6, Math.min(fx, 32 - fx));
      const v = 0.5 + (hash(p, 0, 9) - 0.5) * 0.18 + (posterize(grain(x, y), 4) - 0.5) * 0.2 + (soft(x, y) - 0.5) * 0.12;
      return 0.2 + (v - 0.2) * seam;
    };
  },
  shingle: () => {
    // Rows of tiles in running bond, each with its own tone, lit in the middle, dark joints.
    const rows = 8, rowH = SIZE / rows, tileW = 32, soft = fbm(531, 3, 3);
    return (x, y) => {
      const r = Math.floor(y / rowH), fy = y - r * rowH;
      const xx = (x + (r % 2) * (tileW / 2)) % SIZE, t = Math.floor(xx / tileW), fx = xx - t * tileW;
      const joint = smooth(0.8, 2.5, Math.min(fx, tileW - fx)) * smooth(1, 3, Math.min(fy, rowH - fy));
      const v = 0.46 + (hash(r, t, 11) - 0.5) * 0.26 + 0.1 * (1 - Math.abs(fy - rowH / 2) / (rowH / 2)) + (soft(x, y) - 0.5) * 0.12;
      return 0.18 + (v - 0.18) * joint;
    };
  },
  bone: () => {
    // Clean bone with painted grime pooling in patches.
    const grime = fbm(541, 3, 3), fine = fbm(542, 8, 2);
    return (x, y) => 0.62 - posterize(grime(x, y), 4) * 0.3 - (fine(x, y) - 0.5) * 0.08;
  },
  hide: () => {
    const blot = fbm(551, 4, 3), stitch = tileNoise(552, 24, 2);
    return (x, y) => posterize(0.3 + blot(x, y) * 0.45, 4) + (stitch(x, y) - 0.5) * 0.06;
  },
  plaster: () => {
    const stain = fbm(561, 3, 3), fine = fbm(562, 12, 2);
    return (x, y) => 0.58 - posterize(stain(x, y), 4) * 0.2 + (fine(x, y) - 0.5) * 0.05;
  },
  soft: () => {
    const blot = fbm(571, 3, 3);
    return (x, y) => posterize(0.25 + blot(x, y) * 0.5, 5);
  },
  bark: () => {
    // Vertical bark plates: dark grooves between lighter ridges, broken up along their length.
    const strips = tileNoise(581, 6, 2), breaks = tileNoise(582, 12, 4), blot = fbm(583, 3, 2);
    return (x, y) => {
      const s = strips(x, y) * 0.75 + breaks(x, y) * 0.25;
      const groove = smooth(0.42, 0.26, s), ridge = smooth(0.58, 0.74, s);
      return 0.52 - groove * 0.3 + ridge * 0.14 + (blot(x, y) - 0.5) * 0.1;
    };
  },
  leaves: () => {
    // Leaf clusters of mixed sizes (a few big masses, many small sprigs), each an irregular lobed
    // blob turned its own way and lit from a slightly different side, tucked under whichever
    // cluster lies over it, with a few painted leaf dabs. No row order, so no fish-scale repeat.
    const dabs = worley(592, 14), blot = fbm(593, 3, 2);
    return clumps(591, 4, (c, x, y) => {
      const [f1] = dabs(x, y);
      const dab = f1 < 3.5 ? (c.light > 0.55 ? 0.08 : -0.06) : 0;
      return posterize(0.3 + c.light * 0.36 + (c.tone - 0.5) * 0.2 - c.rim * 0.15 - c.tuck * 0.2 + dab + (blot(x, y) - 0.5) * 0.08, 5);
    }, { size: [0.6, 1.35], lobes: 0.07, stretch: 0.3, turn: 0.6, order: 0.8 });
  },
  needles: () => {
    // Pine: tiers of needle tufts hanging over the ones below, streaked along the needles, pale
    // tips along each tuft's lower edge and a dark shadow under the tier above.
    const streak = tileNoise(602, 40, 3), blot = fbm(603, 3, 2);
    return clumps(601, 6, (c, x, y) => {
      const tip = smooth(0.6, 0.82, c.d) * (c.ly < 0 ? 1 : 0) * (1 - c.rim);
      return posterize(0.3 + c.light * 0.3 + (c.tone - 0.5) * 0.1 + tip * 0.12 - c.rim * 0.2 - c.tuck * 0.24 + (streak(x, y) - 0.5) * 0.16 + (blot(x, y) - 0.5) * 0.06, 5);
    });
  },
  foliage: () => {
    // Leaf masses for block canopies: many small scalloped leaf clusters, each lit from its upper
    // side with a pale leaf dab or two, tucked under its neighbours with only a soft shade (no
    // hard outline, so a large flat face reads as foliage, not paving), over a slow light/dark
    // drift so no two blocks look stamped.
    const dabs = worley(612, 22), drift = fbm(613, 2, 2), blot = fbm(614, 5, 2);
    return clumps(611, 8, (c, x, y) => {
      const [f1] = dabs(x, y);
      const dab = f1 < 2.6 ? (c.light > 0.5 ? 0.1 : -0.05) : 0;
      return posterize(0.31 + c.light * 0.36 + (c.tone - 0.5) * 0.2 - c.rim * 0.08 - c.tuck * 0.15 + dab + (drift(x, y) - 0.5) * 0.24 + (blot(x, y) - 0.5) * 0.06, 6);
    }, { size: [0.7, 1.25], lobes: 0.14, stretch: 0.25, turn: 0.7, order: 0.9 });
  },
};

interface Clump {
  /** 0..1: lit toward the clump's upper left. */
  light: number;
  /** Dark band along the clump's lower (free) edge. */
  rim: number;
  /** Shadow cast by the clump above. */
  tuck: number;
  /** Distance from the clump centre as a share of its radius, and height within it (-1..1). */
  d: number;
  ly: number;
  /** Per-clump random tone. */
  tone: number;
}

interface ClumpStyle {
  /** Radius range, as a share of the grid cell (default 0.95..1.15: even clumps). */
  size?: [number, number];
  /** Lobed outline: how far the rim wanders in and out (0 = round). */
  lobes?: number;
  /** Up to this much longer along a random axis (0 = round). */
  stretch?: number;
  /** Up to this much (radians) each clump's light direction turns either way. */
  turn?: number;
  /** Stacking order jitter, in cells (0 = strictly the higher clump on top). */
  order?: number;
}

/**
 * Jittered clumps, n × n per tile, where the higher clump overlaps the lower one (V is up on side
 * faces), shaded by `shade`. `style` varies their size, outline, orientation, lighting and
 * stacking so they need not form regular rows. Tiles seamlessly.
 */
function clumps(seed: number, n: number, shade: (c: Clump, x: number, y: number) => number, style: ClumpStyle = {}): Gen {
  const cell = SIZE / n, rng = mulberry32(seed);
  const [s0, s1] = style.size ?? [0.95 * 0.9, 1.15 * 0.9];
  const lobes = style.lobes ?? 0, stretch = style.stretch ?? 0, turn = style.turn ?? 0, order = style.order ?? 0;
  const styled = style.size !== undefined;
  const pts = Array.from({ length: n * n }, (_, i) => {
    const x = ((i % n) + 0.15 + rng() * 0.7) * cell, y = (Math.floor(i / n) + 0.15 + rng() * 0.7) * cell, t = rng();
    // Styled: skewed toward small, a few big masses among many smaller sprigs.
    const sz = s0 + (s1 - s0) * (styled ? Math.pow(rng(), 1.6) : rng());
    const ax = styled ? rng() * Math.PI : 0, turnA = styled ? (rng() - 0.5) * 2 * turn : 0;
    return {
      x, y, t, r: cell * sz,
      ca: Math.cos(ax), sa: Math.sin(ax), k: 1 + (styled ? rng() : 0) * stretch, lc: Math.cos(turnA), ls: Math.sin(turnA),
      pri: styled ? (rng() - 0.5) * order * cell : 0, lobeN: styled ? 6 + Math.floor(rng() * 4) : 0, lobeP: styled ? rng() * 6.283 : 0,
    };
  });
  type P = (typeof pts)[number];
  const wrap = (i: number) => ((i % n) + n) % n;
  const reach = Math.ceil(s1 * (1 + stretch) * (1 + lobes) + 0.9);
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5, cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    const near: { ox: number; oy: number; d: number; p: P; ux: number; uy: number }[] = [];
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const gx = wrap(cx + dx), gy = wrap(cy + dy), p = pts[gy * n + gx];
      const ox = p.x + (cx + dx - gx) * cell, oy = p.y + (cy + dy - gy) * cell;
      // Distance in the clump's own frame (stretched along its axis), rim pushed in and out by lobes.
      const rx = px - ox, ry = py - oy;
      const u = (rx * p.ca + ry * p.sa) / p.k, v = -rx * p.sa + ry * p.ca;
      // Scalloped: a row of rounded leaf tips round the rim.
      const lobe = 1 + lobes * (Math.abs(Math.sin(Math.atan2(v, u) * p.lobeN * 0.5 + p.lobeP)) * 2 - 1);
      near.push({ ox, oy, d: Math.hypot(u, v) / lobe, p, ux: rx, uy: ry });
    }
    let hit: (typeof near)[number] | null = null;
    for (const c of near) if (c.d < c.p.r && (!hit || c.oy + c.p.pri > hit.oy + hit.p.pri)) hit = c;
    if (!hit) return 0.3;
    let above = Infinity;
    for (const c of near) if (c.oy + c.p.pri > hit.oy + hit.p.pri) above = Math.min(above, c.d - c.p.r);
    const r = hit.p.r, d = hit.d / r;
    // Light from the upper left, turned per clump.
    const lx0 = hit.ux / r, ly0 = hit.uy / r;
    const lx = lx0 * hit.p.lc - ly0 * hit.p.ls, ly = lx0 * hit.p.ls + ly0 * hit.p.lc;
    return shade({
      light: Math.max(0, Math.min(1, 0.5 + ly * 0.55 - lx * 0.3)),
      rim: smooth(0.72, 0.98, d) * (ly < 0.2 ? 1 : 0.45),
      tuck: 1 - smooth(0, cell * 0.12, above),
      d, ly, tone: hit.p.t,
    }, x, y);
  };
}

const atlases: (THREE.DataTexture | null)[] = [null, null, null];

export const isPaintKind = (k: string): k is PaintKind => k in PAINTS;

/** A painted atlas (built once, up to four patterns per texture, one per channel). */
export function paintAtlas(atlas: 0 | 1 | 2): THREE.DataTexture {
  const hit = atlases[atlas];
  if (hit) return hit;
  const kinds = (Object.keys(PAINTS) as PaintKind[]).filter((k) => PAINTS[k].atlas === atlas);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (const k of kinds) {
    const gen = PAINTERS[k](), c = PAINTS[k].channel;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) data[(y * SIZE + x) * 4 + c] = Math.max(0, Math.min(1, gen(x, y))) * 255;
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = `paint${atlas}`;
  atlases[atlas] = tex;
  return tex;
}

/** GLSL: warm lights and cool darks, scaled by how strongly the paint applies. */
export const PAINT_TINT = 'mix(vec3(1.0), mix(vec3(0.94, 0.97, 1.06), vec3(1.05, 1.01, 0.93), paintV), uPaintAmt * 1.6)';

/**
 * Paint a material. Box projection: top/bottom faces take (x, z), side faces take (z or x, y),
 * so the texture's V always runs up the side of a model.
 */
export function applyPaint(mat: THREE.Material, kind: PaintKind, space: SurfaceSpace = 'object', scaleMul = 1) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  // Every rock surface shares one richer painted rock (strata blocks, cracks, grain, drift).
  if (kind === 'rock') return applyRock(mat, space, scaleMul);
  const p = PAINTS[kind];
  const ch = new THREE.Vector4(0, 0, 0, 0).setComponent(p.channel, 1);
  const uniforms = {
    uPaintTex: { value: paintAtlas(p.atlas) },
    uPaintCh: { value: ch },
    uPaintScale: { value: p.scale * scaleMul },
    uPaintAmt: { value: p.amount },
  };
  addPatch(mat, {
    key: `paint:${space}`,
    slot: 'surface',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      const vert = space === 'world'
        ? `{
            vec4 pw = vec4(transformed, 1.0);
            mat3 pm = mat3(modelMatrix);
            #ifdef USE_INSTANCING
              pw = instanceMatrix * pw;
              pm = pm * mat3(instanceMatrix);
            #endif
            vPaintPos = (modelMatrix * pw).xyz;
            vPaintNrm = pm * objectNormal;
          }`
        : 'vPaintPos = transformed; vPaintNrm = objectNormal;';
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;\nvarying vec3 vPaintNrm;')
        .replace('#include <project_vertex>', `#include <project_vertex>\n${vert}`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vPaintPos;
          varying vec3 vPaintNrm;
          uniform sampler2D uPaintTex;
          uniform vec4 uPaintCh;
          uniform float uPaintScale;
          uniform float uPaintAmt;
          float paintSample() {
            vec3 n = abs(vPaintNrm);
            vec3 q = vPaintPos * uPaintScale;
            vec2 uv = n.y >= max(n.x, n.z) ? q.xz : (n.x > n.z ? q.zy : q.xy);
            return dot(texture2D(uPaintTex, uv), uPaintCh);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float paintV = paintSample();
            diffuseColor.rgb *= clamp(1.0 + (paintV - 0.5) * 2.0 * uPaintAmt, 0.0, 2.0) * ${PAINT_TINT};
          }`,
        );
    },
  });
}
