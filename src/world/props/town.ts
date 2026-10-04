import * as THREE from 'three';
import { hash01, octagon, taper, wedge } from '../../render/blocks';
import { ModelKit, PAL, type V3 } from '../../render/kit';
import { shareResource } from '../../render/resources';
import { type Builder, cb, chunk, flame, light, masonry, q, spread, vOf } from './core';
import { BASE, BRICK, BRICK_D, BRICK_L, COAL, DARK, DRESS, IRON, IRON_L, LAMP_NAVY, PLOT_MARK, RUSTY, RUSTY_L, STONE, STONE_D, STONE_L, WOOD, WOOD_D, WOOD_L } from './palette';
import { PLANT } from './plants';

// The town's props: the bank and shop counters, plot markers, stalls, lamps, herb beds, and the Emberforge's furnace and Great Anvil.

// ─── The Great Anvil ────────────────────────────────────────────────────────

/** Height of the anvil's face above its feet. */
const ANVIL_FACE = 0.6;

/**
 * A closed solid lofted through rings of points (every ring the same length, each listed in the
 * same turning order around the axis), capped at both ends: flat-shaded and wound outward.
 */
function loft(rings: V3[][]) {
  const pos: number[] = [];
  const tri = (a: V3, b: V3, c: V3) => pos.push(...a, ...b, ...c);
  const mid = (r: V3[]): V3 => [0, 1, 2].map((i) => r.reduce((s, p) => s + p[i], 0) / r.length) as V3;
  const n = rings[0].length;
  for (let i = 0; i + 1 < rings.length; i++) {
    const p = rings[i], q = rings[i + 1];
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      tri(p[j], p[k], q[k]);
      tri(p[j], q[k], q[j]);
    }
  }
  const a = rings[0], b = rings[rings.length - 1], ca = mid(a), cz = mid(b);
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    tri(ca, a[k], a[j]);
    tri(cz, b[j], b[k]);
  }
  // Wind outward: flip every triangle if the enclosed volume came out negative.
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz2] = pos.slice(i, i + 9);
    vol += ax * (by * cz2 - bz * cy) - ay * (bx * cz2 - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let c = 0; c < 3; c++) [pos[i + 3 + c], pos[i + 6 + c]] = [pos[i + 6 + c], pos[i + 3 + c]];
  return pos;
}

function geoOf(pos: number[]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A chamfered rectangle ring (8 points) through `at(u, v)`, half sizes hu × hv, chamfer c. */
function rectRing(hu: number, hv: number, c: number, at: (u: number, v: number) => V3): V3[] {
  return [[hu, -hv + c], [hu, hv - c], [hu - c, hv], [-hu + c, hv], [-hu, hv - c], [-hu, -hv + c], [-hu + c, -hv], [hu - c, -hv]].map(([u, v]) => at(u, v));
}

/**
 * The anvil's iron, feet on y = 0, horn toward +X, front +Z: [the iron, its flat face, the marks on
 * it (the hardy hole, and the crack when `cracked`)]. The stand (lofted up through its feet, waist
 * and throat) and the body (lofted from the heel to the horn's point) are welded into one mesh.
 */
const anvilCache = new Map<boolean, THREE.BufferGeometry[]>();
function anvilIron(cracked: boolean) {
  const hit = anvilCache.get(cracked);
  if (hit) return hit;
  const F = ANVIL_FACE, X0 = -0.04;
  // The stand, bottom to top: [y, half length, half width]. Its top ring is buried in the body.
  const stand: [number, number, number][] = [[0, 0.38, 0.2], [0.06, 0.38, 0.2], [0.085, 0.31, 0.16], [0.2, 0.21, 0.075], [0.3, 0.22, 0.08], [0.4, 0.35, 0.11], [0.5, 0.48, 0.13]];
  const iron = loft(stand.map(([y, hx, hz]) => rectRing(hx, hz, Math.min(hx, hz) * 0.35, (u, v) => [X0 + u, y, v])));
  // The body, heel to horn: [x, underside, top, half width]. Square in section along the face; from
  // the horn's root on, a flat top over a keel narrowing to the point.
  const body: [number, number, number, number][] = [[-0.62, 0.46, F - 0.01, 0.13], [-0.6, 0.44, F, 0.14], [0.4, 0.44, F, 0.14], [0.42, 0.44, F, 0.14], [0.42, 0.44, F - 0.035, 0.14]];
  const horn: [number, number, number, number][] = cracked
    ? [[0.47, 0.42, F - 0.035, 0.13], [0.6, 0.45, F - 0.04, 0.105]]
    : [[0.47, 0.42, F - 0.035, 0.13], [0.62, 0.45, F - 0.04, 0.1], [0.78, 0.49, F - 0.045, 0.06], [0.92, 0.525, F - 0.05, 0.022], [0.98, 0.54, F - 0.055, 0.004]];
  const rings: V3[][] = body.map(([x, yb, yt, hz]) => rectRing(hz, (yt - yb) / 2, 0.025, (u, v) => [x, (yt + yb) / 2 + v, u]));
  for (const [x, yb, yt, hz] of horn) {
    const h = yt - yb, c = Math.min(0.025, hz * 0.3);
    rings.push([[x, yt - c, hz], [x, yt - h * 0.6, hz * 0.7], [x, yb, hz * 0.06], [x, yb, -hz * 0.06], [x, yt - h * 0.6, -hz * 0.7], [x, yt - c, -hz], [x, yt, -hz + c], [x, yt, hz - c]]);
  }
  // Snapped off: the break is ragged, each point of the last ring torn to its own length.
  if (cracked) rings.push(rings[rings.length - 1].map(([x, y, z], i) => [x + 0.02 + hash01(41, i) * 0.06, y, z * 0.9]));
  const bodyPos = loft(rings);
  // The face: the body's level top, split off to take its own colour.
  const face: number[] = [], rest: number[] = [];
  for (let i = 0; i < bodyPos.length; i += 9) {
    const t = bodyPos.slice(i, i + 9);
    const level = Math.abs(t[1] - F) < 1e-4 && Math.abs(t[4] - F) < 1e-4 && Math.abs(t[7] - F) < 1e-4;
    (level ? face : rest).push(...t);
  }
  // The marks, a hair above the iron: the hardy hole by the heel, and on the old anvil a crack
  // across the face and down the front flank.
  const marks: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3) => marks.push(...a, ...b, ...c, ...a, ...c, ...d);
  const y = F + 0.004;
  quad([-0.54, y, -0.04], [-0.54, y, 0.04], [-0.46, y, 0.04], [-0.46, y, -0.04]);
  if (cracked) {
    const w = 0.012;
    const across: [number, number][] = [[-0.06, -0.14], [-0.03, -0.07], [-0.07, 0], [-0.04, 0.07], [-0.08, 0.144]];
    for (let i = 0; i + 1 < across.length; i++) {
      const [x0, z0] = across[i], [x1, z1] = across[i + 1];
      quad([x0 - w, y, z0], [x1 - w, y, z1], [x1 + w, y, z1], [x0 + w, y, z0]);
    }
    const z = 0.144;
    const down: [number, number][] = [[-0.08, F], [-0.05, F - 0.06], [-0.09, F - 0.11], [-0.06, 0.45]];
    for (let i = 0; i + 1 < down.length; i++) {
      const [x0, y0] = down[i], [x1, y1] = down[i + 1];
      quad([x0 - w, y0, z], [x0 + w, y0, z], [x1 + w, y1, z], [x1 - w, y1, z]);
    }
  }
  const out = [geoOf([...iron, ...rest]), geoOf(face), geoOf(marks)];
  anvilCache.set(cracked, out.map(shareResource));
  return out;
}

/** A tree stump, `h` tall, its base flaring into roots and its bark in ridges. */
function anvilStump(seed: number, h: number) {
  const ring = (y: number, r: number): V3[] =>
    Array.from({ length: 14 }, (_, j) => {
      const a = (j / 14) * Math.PI * 2, rr = r * (j % 2 ? 0.95 : 1) * (0.98 + hash01(seed, j) * 0.05);
      return [Math.cos(a) * rr, y, -Math.sin(a) * rr];
    });
  return geoOf(loft([ring(0, 0.58), ring(0.08, 0.52), ring(h * 0.45, 0.49), ring(h, 0.48)]));
}

/**
 * The castle's lamp post: a stepped stone base, a navy-lacquered post with a gold collar, a lantern
 * of warm glass in a navy cage under a little hipped hood, a gold ball finial on top.
 */
function royalLamp(k: ModelKit, g: THREE.Object3D) {
  cb(k, g, [0.46, 0.22, 0.46], [0, 0.11, 0], BASE, undefined, 0.05);
  cb(k, g, [0.32, 0.2, 0.32], [0, 0.3, 0], DRESS, undefined, 0.04);
  k.cyl(g, 0.06, 0.08, 2.2, [0, 1.5, 0], LAMP_NAVY, undefined, 8);
  k.cyl(g, 0.1, 0.1, 0.08, [0, 2.42, 0], PAL.gold, undefined, 8);
  cb(k, g, [0.42, 0.06, 0.42], [0, 2.49, 0], LAMP_NAVY, undefined, 0.02);
  k.box(g, [0.32, 0.4, 0.32], [0, 2.72, 0], 0xffcf86, undefined, 0xffa038, 1.45);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.05, 0.44, 0.05], [dx * 0.17, 2.72, dz * 0.17], LAMP_NAVY);
  k.mesh(g, taper(0.5, 0.5, 0.1, 0.1, 0.22), LAMP_NAVY, [0, 3.04, 0]);
  k.mesh(g, new THREE.OctahedronGeometry(0.08, 1), PAL.gold, [0, 3.22, 0]);
}
export const TOWN_PROPS: Record<string, Builder> = {
  bank: (k, g) => {
    // The bank counter: a panelled stone counter with a dark oak top and an iron teller grille with
    // three windows, a ledger, coin stacks and a set of scales. Customers stand on the +Z side.
    const W = 6;
    cb(k, g, [W + 0.2, 0.2, 1.2], [0, 0.1, 0], STONE_D, undefined, 0.04);
    cb(k, g, [W, 0.92, 1.0], [0, 0.66, 0], STONE, undefined, 0.04);
    for (let i = 0; i < 4; i++) cb(k, g, [1.18, 0.56, 0.06], [-2.1 + i * 1.4, 0.64, 0.51], STONE_L, undefined, 0.03);
    cb(k, g, [W + 0.3, 0.12, 1.24], [0, 1.18, 0], WOOD_D, undefined, 0.03);
    // Grille: stout posts, a top rail and bars, open over the three teller windows.
    for (const x of [-3, -1, 1, 3]) cb(k, g, [0.2, 1.5, 0.2], [x, 1.99, -0.3], WOOD_D, undefined, 0.03);
    cb(k, g, [W + 0.2, 0.2, 0.26], [0, 2.8, -0.3], WOOD_D, undefined, 0.03);
    for (let x = -2.8; x <= 2.81; x += 0.25) {
      const inWindow = [-2, 0, 2].some((c) => Math.abs(x - c) < 0.45);
      if (Math.abs(Math.abs(x) - 1) < 0.12 || Math.abs(Math.abs(x) - 3) < 0.12) continue;
      k.box(g, [0.05, inWindow ? 0.62 : 1.5, 0.05], [x, inWindow ? 2.39 : 1.99, -0.3], IRON);
    }
    for (const c of [-2, 0, 2]) cb(k, g, [0.95, 0.08, 0.4], [c, 1.28, -0.2], WOOD_L, undefined, 0.02);
    // Ledger (open), coin stacks and scales on the counter.
    for (const e of [-1, 1]) k.box(g, [0.3, 0.05, 0.4], [-0.6 + e * 0.16, 1.27, 0.2], 0xe8dcc0, [0, 0, e * 0.06]);
    k.box(g, [0.02, 0.06, 0.4], [-0.6, 1.27, 0.2], 0x6a2020);
    for (const [x, n] of [[0.5, 3], [0.8, 2], [2.3, 4], [-2.4, 2]] as [number, number][]) {
      for (let i = 0; i < n; i++) k.mesh(g, octagon(0.11, 0.05), PAL.gold, [x, 1.27 + i * 0.05, 0.25], [0, 0, Math.PI / 2], 0x5a3a00, 0.3);
    }
    cb(k, g, [0.08, 0.5, 0.08], [1.5, 1.49, 0.1], PAL.gold, undefined, 0.02);
    k.box(g, [0.7, 0.04, 0.04], [1.5, 1.72, 0.1], PAL.gold);
    for (const e of [-1, 1]) k.mesh(g, taper(0.22, 0.22, 0.12, 0.12, 0.06), PAL.gold, [1.5 + e * 0.32, 1.45, 0.1]);
  },
  shop: (k, g) => {
    // The Quartermaster's counter: a panelled oak counter with the day's wares laid out on it.
    const W = 5;
    cb(k, g, [W, 1.0, 1.0], [0, 0.5, 0], WOOD, undefined, 0.04);
    for (let i = 0; i < 4; i++) cb(k, g, [1.0, 0.6, 0.06], [-1.8 + i * 1.2, 0.5, 0.51], WOOD_L, undefined, 0.02);
    cb(k, g, [W + 0.2, 0.12, 1.16], [0, 1.06, 0], WOOD_D, undefined, 0.03);
    // Potions, a folded cloak, a sword on a cloth, a coin purse and a hand bell.
    for (const [x, c] of [[-2.0, 0xd03a3a], [-1.75, 0xd03a3a], [-1.5, 0x3a6ad0]] as [number, number][]) {
      k.box(g, [0.16, 0.26, 0.16], [x, 1.25, 0.1], c, undefined, c, 0.5);
      k.box(g, [0.07, 0.08, 0.07], [x, 1.42, 0.1], 0xe8dcc0);
    }
    cb(k, g, [0.7, 0.14, 0.5], [-0.6, 1.19, 0.05], 0x3a5a8a, undefined, 0.04);
    k.box(g, [1.3, 0.02, 0.4], [0.7, 1.13, 0.1], 0x7a2020);
    cb(k, g, [1.1, 0.04, 0.1], [0.7, 1.17, 0.1], IRON_L, undefined, 0.01);
    cb(k, g, [0.08, 0.06, 0.36], [0.1, 1.17, 0.1], PAL.gold, undefined, 0.01);
    cb(k, g, [0.3, 0.26, 0.3], [1.8, 1.25, 0.05], PAL.leather, undefined, 0.08);
    k.mesh(g, taper(0.2, 0.2, 0.08, 0.08, 0.18), PAL.gold, [2.25, 1.21, 0.25]);
  },
  ruin: (k, g, id) => {
    // A plot marker by the building's door: a cornerstone and a post with a hanging sign in the
    // building's colour. Restored, a lantern is lit on the post.
    const mark = PLOT_MARK[id as string] ?? 0xffc870;
    cb(k, g, [0.9, 0.5, 0.9], [0, 0.25, 0], STONE_D, undefined, 0.06);
    cb(k, g, [0.2, 2.5, 0.2], [0, 1.5, 0], WOOD_D, undefined, 0.03);
    cb(k, g, [1.0, 0.12, 0.12], [0.42, 2.6, 0], WOOD_D, undefined, 0.02);
    for (const x of [0.2, 0.7]) k.box(g, [0.03, 0.34, 0.03], [x, 2.4, 0], IRON);
    cb(k, g, [0.95, 0.66, 0.08], [0.45, 1.95, 0], 0x3a2a1e, undefined, 0.02);
    k.mesh(g, octagon(0.22, 0.06), mark, [0.45, 1.95, 0.06], [0, Math.PI / 2, 0], mark, 0.7);
    const lamp = new THREE.Group();
    g.add(lamp);
    cb(k, lamp, [0.28, 0.36, 0.28], [-0.05, 2.25, 0.2], IRON, undefined, 0.03);
    k.box(lamp, [0.2, 0.26, 0.2], [-0.05, 2.25, 0.2], 0xffd080, undefined, 0xffb040, 2);
    return { obj: g, setState: (s) => (lamp.visible = s === 'restored') };
  },
  stall: (k, g, v) => {
    // A market stall: counter, four posts and a striped awning (colours vary).
    const [a, b] = [[0xe8dcc0, 0xa03030], [0xe8dcc0, 0x3a6a9a], [0xe8dcc0, 0x4a7a3a]][(v ?? 0) % 3];
    cb(k, g, [3.0, 0.9, 1.1], [0, 0.45, 0.35], PAL.wood, undefined, 0.04);
    cb(k, g, [3.1, 0.1, 1.2], [0, 0.93, 0.35], WOOD_L, undefined, 0.02);
    for (const [x, z] of [[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.95], [1.4, 0.95]]) cb(k, g, [0.14, 2.5, 0.14], [x, 1.25, z], WOOD_D, undefined, 0.02);
    for (let i = 0; i < 6; i++) k.box(g, [0.5, 0.08, 2.1], [-1.25 + i * 0.5, 2.55, 0.2], i % 2 ? a : b, [0.16, 0, 0]);
    for (let i = 0; i < 5; i++) chunk(k, g, 200 + i + (v ?? 0) * 7, [0.28, 0.22, 0.26], [-1.0 + i * 0.5, 0.98, 0.3], [0xc8a040, 0x8a4a2a, 0x6a8a3a, 0xa03030][i % 4], i);
    cb(k, g, [0.6, 0.6, 0.6], [-1.1, 0.3, -1.0], WOOD_L, [0, 0.3, 0], 0.04);
  },
  lamp_post: (k, g) => {
    // A lit lamp post without its own light (the keep has only a few real lights).
    royalLamp(k, g);
  },
  barrels: (k, g) => {
    for (const [x, z, s] of [[0, 0, 1], [0.72, 0.2, 0.9], [0.3, 0.72, 0.85]] as [number, number, number][]) {
      cb(k, g, [q(0.66 * s), q(0.9 * s), q(0.66 * s)], [x, 0.45 * s, z], WOOD, undefined, 0.19 * s);
      for (const y of [0.18, 0.72]) cb(k, g, [q(0.69 * s), 0.06, q(0.69 * s)], [x, y * s, z], IRON, undefined, 0.19 * s);
    }
  },
  /**
   * A raised timber bed 3 long of one crop in two neat rows (`v`): 0 cabbages, 1 lettuces, 2
   * carrots, 3 leeks, 4 red cabbages, 5 lavender.
   */
  herb_bed: (k, g, arg) => {
    const v = vOf(arg) % 6;
    cb(k, g, [3.0, 0.4, 1.3], [0, 0.2, 0], WOOD_D, undefined, 0.04);
    k.box(g, [2.8, 0.06, 1.1], [0, 0.4, 0], 0x3a2a1e);
    const soil = new THREE.Group();
    soil.position.y = 0.43;
    g.add(soil);
    const step = v === 2 || v === 3 ? 0.32 : 0.52;
    spread(3.0, step, 0.32).forEach((x, i) => {
      for (const z of [-0.27, 0.27]) {
        const seed = i * 1.37 + z * 3, xx = x + (z > 0 ? step / 2 : 0);
        if (xx > 1.25) continue;
        if (v === 0 || v === 4) PLANT.cabbage(k, soil, xx, z, seed, v === 4);
        else if (v === 1) PLANT.lettuce(k, soil, xx, z, seed);
        else if (v === 2) PLANT.carrot(k, soil, xx, z, seed);
        else if (v === 3) PLANT.leek(k, soil, xx, z, seed);
        else PLANT.lavender(k, soil, xx, z, seed);
      }
    });
  },
  lamp: (k, g) => {
    royalLamp(k, g);
    return { obj: g, light: light(g, 0xffb060, 6, 9, 2.7) };
  },
  furnace: (k, g) => {
    // A square brick forge: stone plinth, running-bond brick body with a glowing arched mouth, a
    // tapering hood and chimney, bellows on one side and a coal heap on the other.
    cb(k, g, [2.7, 0.3, 2.3], [0, 0.15, 0], STONE_D, undefined, 0.06);
    k.box(g, [2.1, 1.7, 1.7], [0, 1.15, 0], BRICK_D);
    const brick = [BRICK, BRICK_L, BRICK_D];
    masonry(k, g, { x: 0, z: 0.86, rot: 0, len: 2.4, y0: 0.3, rows: 5, rowH: 0.34, thick: 0.28, seed: 21, shades: brick, unit: 0.6, hole: { u: 0, w: 1.0, h: 1.3 } });
    masonry(k, g, { x: 0, z: -0.86, rot: 0, len: 2.4, y0: 0.3, rows: 5, rowH: 0.34, thick: 0.28, seed: 22, shades: brick, unit: 0.6 });
    for (const sx of [-1, 1]) masonry(k, g, { x: sx * 1.06, z: 0, rot: Math.PI / 2, len: 1.44, y0: 0.3, rows: 5, rowH: 0.34, thick: 0.28, seed: 23 + sx, shades: brick, unit: 0.6 });
    // Mouth: a dark firebox with glowing coals under a stone lintel.
    k.box(g, [0.9, 0.95, 0.5], [0, 0.8, 0.78], DARK);
    k.box(g, [0.8, 0.14, 0.4], [0, 0.4, 0.82], PAL.fire, undefined, PAL.fire, 2.2);
    cb(k, g, [1.3, 0.3, 0.4], [0, 1.45, 0.92], STONE, undefined, 0.05);
    cb(k, g, [2.6, 0.2, 2.1], [0, 2.1, 0], STONE, undefined, 0.05);
    k.mesh(g, taper(2.2, 1.8, 1.0, 0.9, 0.8, 0, -0.2), BRICK_D, [0, 2.6, 0]);
    cb(k, g, [0.85, 1.5, 0.8], [0, 3.75, -0.2], BRICK, undefined, 0.04);
    cb(k, g, [1.05, 0.22, 1.0], [0, 4.55, -0.2], STONE_D, undefined, 0.04);
    k.box(g, [0.55, 0.05, 0.5], [0, 4.67, -0.2], 0x2a0c04, undefined, 0xff5a1a, 0.9);
    // Bellows on a stand (right) and a coal heap (left).
    cb(k, g, [0.5, 0.5, 0.6], [1.6, 0.25, 0.1], WOOD_D, undefined, 0.03);
    k.mesh(g, wedge(0.9, 0.34, 0.6), PAL.leather, [1.6, 0.68, 0.1], [0, Math.PI / 2, 0.1]);
    k.box(g, [0.5, 0.08, 0.08], [1.25, 0.72, 0.1], IRON);
    for (let i = 0; i < 6; i++) chunk(k, g, 30 + i, [0.34, 0.26, 0.3], [-1.55 + (i % 3) * 0.2, 0.3 + Math.floor(i / 3) * 0.15, 0.2 - (i % 2) * 0.35], COAL, i);
    return (() => {
      const f = flame(k, g, 0, 0.45, 0.82, 0.75);
      const l = light(g, 0xff7a30, 10, 8, 1);
      l.position.set(0, 1, 1.8);
      return { obj: g, light: l, tick: (t: number) => { f(t); l.intensity = 9 + Math.sin(t * 11) * 1.5; } };
    })();
  },
  anvil: (k, g) => {
    // The Great Anvil (concept: docs/concepts/anvil.jpg): one forged solid on a single tree stump, nothing under the
    // stump. The iron is one mesh (anvilIron): wide feet, a narrow waist, the body flaring out of it
    // with a square heel and the hardy hole, one long flat face, a small step down and the horn, flat
    // on top and keeled beneath, tapering to its point. Before 'Reforge the Great Anvil' it is
    // rust-brown, cracked across the face and down the flank, the horn snapped off short, on an old
    // grey stump. Reforged: dark iron with a polished face and a bar at working heat on it, on a new
    // stump bound with an iron band, the hammer leaning against it.
    const cracked = new THREE.Group(), reforged = new THREE.Group();
    g.add(cracked, reforged);
    reforged.visible = false;
    const top = 0.64; // the stump's top: the anvil's feet stand here
    k.mesh(cracked, anvilStump(3, top), 0x5a4a3a, [0, 0, 0]);
    k.mesh(reforged, anvilStump(7, top), WOOD_L, [0, 0, 0]);
    const [cIron, cFace, cMarks] = anvilIron(true);
    k.mesh(cracked, cIron, RUSTY, [0, top, 0]);
    k.mesh(cracked, cFace, RUSTY_L, [0, top, 0]);
    k.mesh(cracked, cMarks, DARK, [0, top, 0]);
    const [rIron, rFace, rMarks] = anvilIron(false);
    k.mesh(reforged, rIron, IRON, [0, top, 0]);
    k.mesh(reforged, rFace, IRON_L, [0, top, 0]);
    k.mesh(reforged, rMarks, DARK, [0, top, 0]);
    // The new stump's iron band, with two rivets facing the smith.
    k.cyl(reforged, 0.53, 0.53, 0.09, [0, 0.32, 0], IRON, undefined, 14);
    for (const a of [-0.45, 0.45]) cb(k, reforged, [0.06, 0.06, 0.04], [Math.sin(a) * 0.54, 0.32, Math.cos(a) * 0.54], IRON, [0, a, Math.PI / 4], 0.01);
    // A bar at working heat on the face; the hammer leaning on the stump, ready.
    cb(k, reforged, [0.42, 0.06, 0.1], [0.02, top + ANVIL_FACE + 0.03, 0.02], 0xffb050, [0, 0.12, 0], 0.01, PAL.fire, 2.4);
    cb(k, reforged, [0.06, 0.66, 0.06], [0.52, 0.34, 0.3], WOOD_L, [0, 0, 0.35], 0.01);
    cb(k, reforged, [0.14, 0.14, 0.26], [0.63, 0.08, 0.3], IRON, [0, 0, 0.35], 0.02);
    return {
      obj: g,
      setState: (s) => {
        reforged.visible = s === 'restored';
        cracked.visible = s !== 'restored';
      },
    };
  },
};
