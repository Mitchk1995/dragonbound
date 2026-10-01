import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { BASES } from '../data/items';
import { chamferBox, prism, rockBlock } from './blocks';
import { applyFinish, studioEnv } from './env';
import { ModelKit, PAL, type V3 } from './kit';

/*
 * Materials, quest items and trinkets: the small models behind their inventory icons and ground
 * drops. Each ore is its own shape and colour so a full inventory reads at a glance:
 *   copper  warm brown rock with two copper nuggets and a fleck of green verdigris
 *   tin     grey rock studded with small silvery-white crystals
 *   iron    a squarish rust-red lump with gunmetal nodules
 *   coal    a cluster of glossy black chunks
 *   emberite dark basalt with glowing orange crystal spikes
 * Bars are proper ingots: a trapezoid block, sloped sides and a bevelled top, in a forged-metal
 * finish. Uncut gems are raw crystals, a different habit per stone: a double-pointed sapphire, square
 * emerald columns, a cluster of ruby points.
 */

const cache = new Map<string, THREE.BufferGeometry>();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * An ingot: bottom w × d on y = 0, the sides sloping in by `slope` to the top, whose edges are
 * bevelled by `bevel`. Convex, so every face stays flat and crisp.
 */
export function ingot(w: number, d: number, h: number, slope: number, bevel: number) {
  const key = `ing${w},${d},${h},${slope},${bevel}`;
  let g = cache.get(key);
  if (!g) {
    const pts: THREE.Vector3[] = [];
    const tw = w / 2 - slope, td = d / 2 - slope;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(V((sx * w) / 2, 0, (sz * d) / 2));
      // The top rim (where the slope meets the bevel) and the flat top, inset by the bevel.
      pts.push(V(sx * tw, h - bevel, sz * td));
      pts.push(V(sx * (tw - bevel), h, sz * (td - bevel)));
    }
    g = new ConvexGeometry(pts);
    cache.set(key, g);
  }
  return g;
}

/** A crystal with a point at both ends (sapphire): a hexagonal column with pyramid tips, along Y. */
function bipyramid(r: number, body: number, tip: number) {
  const key = `bp${r},${body},${tip}`;
  let g = cache.get(key);
  if (!g) {
    const pts: THREE.Vector3[] = [V(0, body / 2 + tip, 0), V(0, -body / 2 - tip, 0)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      for (const y of [-body / 2, body / 2]) pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    g = new ConvexGeometry(pts);
    cache.set(key, g);
  }
  return g;
}

/**
 * A single-terminated crystal point (ruby, tin): a hexagonal column standing on a flat base with a
 * six-faced pyramid tip, slightly irregular so it reads as grown, not cut. Along Y, base at y = 0.
 */
function crystalPoint(r: number, body: number, tip: number, seed = 0) {
  const key = `cp${r},${body},${tip},${seed}`;
  let g = cache.get(key);
  if (!g) {
    const pts: THREE.Vector3[] = [V(0.12 * r * Math.sin(seed), body + tip, 0.12 * r * Math.cos(seed))];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + seed;
      const rr = r * (0.85 + 0.3 * (((i * 7 + seed * 13) % 5) / 5));
      pts.push(V(Math.cos(a) * rr, 0, Math.sin(a) * rr), V(Math.cos(a) * rr * 0.92, body, Math.sin(a) * rr * 0.92));
    }
    g = new ConvexGeometry(pts);
    cache.set(key, g);
  }
  return g;
}

type Kit = ModelKit;

/** A mesh with the kit's material for `color`; returns the mesh so its material can be finished. */
const put = (k: Kit, g: THREE.Group, geo: THREE.BufferGeometry, color: number, pos: V3, rot?: V3, emissive = 0, intensity = 1) =>
  k.mesh(g, geo, color, pos, rot, emissive, intensity);

/** Gem-like shine: studio reflections without turning the surface into metal. */
function glassy(m: THREE.Mesh, intensity = 0.9) {
  const mat = m.material as THREE.MeshStandardMaterial;
  mat.metalness = 0.05;
  mat.roughness = 0.22;
  mat.envMap = studioEnv();
  mat.envMapIntensity = intensity;
}

/** Forged metal: the same finish as the gear. */
function forged(m: THREE.Mesh, roughness?: number) {
  applyFinish(m.material as THREE.Material, 'metal');
  if (roughness !== undefined) (m.material as THREE.MeshStandardMaterial).roughness = roughness;
}

function ore(k: Kit, g: THREE.Group, id: string, color: number) {
  switch (id) {
    case 'copper_ore': {
      put(k, g, rockBlock(11, 0.46, 0.3, 0.38), 0x6e5c4c, [0, 0, 0], [0, 0.3, 0]);
      for (const [p, s, seed] of [[[-0.06, 0.24, 0.1], 0.2, 3], [[0.12, 0.2, 0.02], 0.15, 5]] as [V3, number, number][]) {
        const n = put(k, g, rockBlock(seed, s, s * 0.8, s), color, p, [0.4, seed, 0.2]);
        barFinish(n, 0.45);
      }
      put(k, g, rockBlock(8, 0.1, 0.07, 0.09), 0x4fb09a, [0.13, 0.17, 0.13], [0.3, 1, 0]);
      break;
    }
    case 'tin_ore': {
      // A grey rock studded with small silvery-white tin crystals catching the light.
      put(k, g, rockBlock(21, 0.46, 0.3, 0.38), 0x6b6d74, [0, 0, 0], [0, -0.4, 0]);
      for (const [p, r, h, seed, rot] of [
        [[-0.06, 0.19, 0.08], 0.07, 0.18, 1, [0.45, 0, 0.35]],
        [[0.09, 0.2, 0.05], 0.06, 0.15, 2, [0.3, 0, -0.5]],
        [[0.02, 0.23, -0.07], 0.055, 0.14, 3, [-0.35, 0, 0.1]],
        [[0.15, 0.12, 0.13], 0.04, 0.09, 4, [0.7, 0, -0.8]],
        [[-0.15, 0.13, -0.02], 0.045, 0.1, 5, [0.1, 0, 0.9]],
      ] as [V3, number, number, number, V3][]) {
        const c = put(k, g, crystalPoint(r, h, r * 1.3, seed), 0xe2e7ee, p, rot);
        forged(c, 0.22);
        (c.material as THREE.MeshStandardMaterial).metalness = 0.6;
      }
      break;
    }
    case 'iron_ore': {
      put(k, g, chamferBox(0.38, 0.3, 0.34, 0.07), color, [0, 0.15, 0], [0, 0.35, 0]);
      for (const [p, s, seed] of [[[0.07, 0.26, 0.06], 0.15, 61], [[-0.11, 0.22, 0.1], 0.11, 63]] as [V3, number, number][]) {
        const n = put(k, g, rockBlock(seed, s, s * 0.7, s), 0x50545c, p, [0.2, seed, 0.1]);
        forged(n, 0.5);
      }
      break;
    }
    case 'coal': {
      for (const [p, s, seed, r] of [[[0, 0, 0], 0.32, 31, 0.2], [[0.17, 0, 0.1], 0.2, 33, 1.1], [[-0.14, 0, 0.12], 0.17, 35, 2.2]] as [V3, number, number, number][]) {
        const c = put(k, g, rockBlock(seed, s, s * 0.85, s * 0.9), s > 0.3 ? 0x28262a : 0x323036, p, [0, r, 0]);
        glassy(c, 0.5);
      }
      break;
    }
    case 'emberite_ore': {
      // Basalt light enough to read in the slot, so the glowing crystals sit on a visible rock.
      // A faint warm self-glow (the rock is still hot) lifts the faces the icon light misses.
      put(k, g, rockBlock(41, 0.46, 0.22, 0.38), 0x7a665c, [0, 0, 0], [0, 0.2, 0], 0x5a2410, 0.5);
      for (const [p, w, h, r] of [[[-0.03, 0.14, 0], 0.11, 0.36, [0.15, 0, 0.2]], [[0.1, 0.13, 0.06], 0.08, 0.24, [0.3, 0.4, -0.45]], [[-0.13, 0.12, 0.08], 0.07, 0.18, [0.4, 0, 0.55]]] as [V3, number, number, V3][]) {
        put(k, g, prism(w, h, 0.35), color, p, r, color, 1.3);
      }
      break;
    }
    default:
      put(k, g, rockBlock(51, 0.42, 0.28, 0.36), 0x5a5048, [0, 0, 0]);
      put(k, g, rockBlock(53, 0.16, 0.12, 0.14), color, [0.02, 0.22, 0.06], [0.3, 0.5, 0], color, 0.25);
  }
}

/** Ingot proportions: chunky enough to fill a slot, with sides that clearly slope in. */
const INGOT: [number, number, number, number, number] = [0.46, 0.26, 0.19, 0.055, 0.03];

/** A forged bar that still shows its colour (full metal reads as the grey studio, not bronze or iron). */
function barFinish(m: THREE.Mesh, roughness: number) {
  forged(m, roughness);
  const mat = m.material as THREE.MeshStandardMaterial;
  mat.metalness = 0.55;
}

function bar(k: Kit, g: THREE.Group, id: string, color: number) {
  if (id === 'ember_bar') {
    // Blackened dragon-forged metal with the ember still glowing through a channel in the top.
    // Blackened metal warmed from within, so its shaded faces still read in the slot.
    barFinish(put(k, g, ingot(...INGOT), 0x6a5e62, [0, 0, 0], undefined, 0x4a1c0c, 0.45), 0.42);
    put(k, g, chamferBox(0.26, 0.02, 0.07, 0.008), color, [0, INGOT[2] - 0.004, 0], undefined, color, 1.6);
    return;
  }
  barFinish(put(k, g, ingot(...INGOT), color, [0, 0, 0]), id === 'steel_bar' ? 0.26 : id === 'iron_bar' ? 0.5 : 0.36);
}

function gem(k: Kit, g: THREE.Group, id: string, color: number) {
  switch (id) {
    case 'uncut_sapphire': {
      glassy(put(k, g, bipyramid(0.1, 0.22, 0.1), color, [0, 0.14, 0], [0, 0, 0.9], color, 0.3));
      glassy(put(k, g, bipyramid(0.055, 0.12, 0.06), color, [0.11, 0.1, 0.08], [0.5, 0, -0.6], color, 0.3));
      break;
    }
    case 'uncut_emerald': {
      glassy(put(k, g, chamferBox(0.16, 0.3, 0.16, 0.04), color, [-0.02, 0.15, 0], [0, 0.4, 0.2], color, 0.3));
      glassy(put(k, g, chamferBox(0.09, 0.17, 0.09, 0.025), color, [0.1, 0.09, 0.06], [0, 0.2, -0.5], color, 0.3));
      break;
    }
    case 'uncut_ruby': {
      // A raw cluster: three crystal points of different sizes growing out of one base at splayed angles.
      for (const [p, r, h, seed, rot] of [
        [[0, 0.02, 0], 0.085, 0.26, 0.3, [0, 0, 0.15]],
        [[-0.08, 0.02, 0.04], 0.06, 0.17, 1.7, [0.25, 0, 0.7]],
        [[0.08, 0.02, 0.05], 0.055, 0.14, 2.9, [0.35, 0, -0.65]],
        [[0.02, 0.02, -0.08], 0.045, 0.1, 4.1, [-0.6, 0, -0.1]],
      ] as [V3, number, number, number, V3][]) {
        glassy(put(k, g, crystalPoint(r, h, r * 1.4, seed), color, p, rot, color, 0.35));
      }
      break;
    }
    default:
      glassy(put(k, g, prism(0.16, 0.3, 0.3), color, [0, 0, 0], undefined, color, 0.3));
  }
}

function torus(r: number, tube: number, seg = 10) {
  const key = `to${r},${tube},${seg}`;
  let g = cache.get(key);
  if (!g) {
    g = new THREE.TorusGeometry(r, tube, 5, seg);
    cache.set(key, g);
  }
  return g;
}

/** A standing band in the item's metal with its stone set on top (palette trim). */
function ring(k: Kit, g: THREE.Group, id: string, color: number) {
  const pal = BASES[id]?.palette;
  forged(put(k, g, torus(0.13, 0.035, 10), pal?.main ?? PAL.gold, [0, 0.16, 0]), 0.3);
  put(k, g, chamferBox(0.1, 0.05, 0.1, 0.02), pal?.dark ?? 0x6a4020, [0, 0.3, 0]);
  glassy(put(k, g, bipyramid(0.05, 0.02, 0.04), pal?.trim ?? color, [0, 0.35, 0], undefined, pal?.trim ?? color, 0.4));
}

/**
 * A pendant hanging from its necklace loop, built facing +Z (the icon shows it face-on): a carved fang
 * pointing down under a leather wrap (bone), a stone diamond in a gold bezel (jade). The loop stands in
 * the same plane, above the pendant.
 */
function amulet(k: Kit, g: THREE.Group, id: string, color: number) {
  const pal = BASES[id]?.palette;
  const trim = pal?.trim ?? PAL.gold;
  const loop = put(k, g, torus(0.15, 0.016, 14), trim, [0, 0.31, 0]);
  if (id === 'bone_amulet') {
    put(k, g, prism(0.11, 0.3, 0.55), color, [0, 0.13, 0], [0, 0, Math.PI]);
    put(k, g, chamferBox(0.14, 0.05, 0.14, 0.015), pal?.dark ?? 0x5a3a22, [0, 0.14, 0]);
    return;
  }
  forged(loop, 0.35);
  forged(put(k, g, chamferBox(0.2, 0.2, 0.05, 0.05), trim, [0, 0.02, 0], [0, 0, Math.PI / 4]), 0.35);
  glassy(put(k, g, chamferBox(0.15, 0.15, 0.07, 0.04), color, [0, 0.02, 0.012], [0, 0, Math.PI / 4], color, 0.25));
}

/** The model for a material, quest item or trinket (`kind` from its base; `id` picks the variant). */
export function buildMaterialModel(kind: string, color: number, id = ''): THREE.Group {
  const k = new ModelKit();
  const g = new THREE.Group();
  switch (kind) {
    case 'ore':
      ore(k, g, id, color);
      break;
    case 'bar':
      bar(k, g, id, color);
      break;
    case 'gem':
      gem(k, g, id, color);
      break;
    case 'fragment':
      k.box(g, [0.3, 0.06, 0.24], [0, 0.04, 0], 0x3a2a24, [0, 0.4, 0]);
      k.box(g, [0.14, 0.02, 0.1], [0, 0.08, 0], color, [0, 0.4, 0], color, 1.5);
      break;
    case 'key':
      k.box(g, [0.5, 0.06, 0.08], [0.05, 0.05, 0], 0x4a2a1a);
      k.cyl(g, 0.12, 0.12, 0.06, [-0.24, 0.05, 0], color, undefined, 8, color);
      k.box(g, [0.06, 0.06, 0.14], [0.26, 0.05, 0.06], 0x4a2a1a);
      break;
    case 'amulet':
      amulet(k, g, id, color);
      break;
    case 'ring':
      ring(k, g, id, color);
      break;
  }
  return g;
}
