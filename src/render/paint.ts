import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { addPatch, type SurfaceSpace } from './surface';
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

export type PaintKind = 'masonry' | 'rock' | 'wood' | 'shingle' | 'bone' | 'hide' | 'plaster' | 'soft' | 'bark' | 'leaves' | 'needles';

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
    // Overlapping leaf clumps: each lit from the upper left and shaded to a dark lower rim, tucked
    // under the clumps above, with a few painted leaf dabs. Big enough to read from the camera.
    const dabs = worley(592, 14), blot = fbm(593, 3, 2);
    return clumps(591, 4, (c, x, y) => {
      const [f1] = dabs(x, y);
      const dab = f1 < 3.5 ? (c.light > 0.55 ? 0.08 : -0.06) : 0;
      return posterize(0.3 + c.light * 0.36 + (c.tone - 0.5) * 0.16 - c.rim * 0.16 - c.tuck * 0.2 + dab + (blot(x, y) - 0.5) * 0.06, 5);
    });
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

/**
 * Jittered round clumps, n × n per tile, where the higher clump overlaps the lower one (V is up on
 * side faces), shaded by `shade`. Tiles seamlessly.
 */
function clumps(seed: number, n: number, shade: (c: Clump, x: number, y: number) => number): Gen {
  const cell = SIZE / n, R = cell * 0.9, rng = mulberry32(seed);
  const pts = Array.from({ length: n * n }, (_, i) => ({ x: ((i % n) + 0.15 + rng() * 0.7) * cell, y: (Math.floor(i / n) + 0.15 + rng() * 0.7) * cell, t: rng(), r: R * (0.95 + rng() * 0.2) }));
  const wrap = (i: number) => ((i % n) + n) % n;
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5, cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    const near: { ox: number; oy: number; d: number; t: number; r: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = wrap(cx + dx), gy = wrap(cy + dy), p = pts[gy * n + gx];
      const ox = p.x + (cx + dx - gx) * cell, oy = p.y + (cy + dy - gy) * cell;
      near.push({ ox, oy, d: Math.hypot(px - ox, py - oy), t: p.t, r: p.r });
    }
    let hit: (typeof near)[number] | null = null;
    for (const c of near) if (c.d < c.r && (!hit || c.oy > hit.oy)) hit = c;
    if (!hit) return 0.3;
    let above = Infinity;
    for (const c of near) if (c.oy > hit.oy) above = Math.min(above, c.d - c.r);
    const lx = (px - hit.ox) / hit.r, ly = (py - hit.oy) / hit.r, d = hit.d / hit.r;
    return shade({
      light: Math.max(0, Math.min(1, 0.5 + ly * 0.55 - lx * 0.3)),
      rim: smooth(0.72, 0.98, d) * (ly < 0.2 ? 1 : 0.45),
      tuck: 1 - smooth(0, cell * 0.12, above),
      d, ly, tone: hit.t,
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
