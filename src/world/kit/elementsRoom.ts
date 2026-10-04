import * as THREE from 'three';
import { boxClaim, type Box, type Claim } from './claims';
import { def, footprint, type ElementDef, type Look, type Part } from './elements';
import { arc, box, cylinder, join, prism, ring, turned, type Mesh3, type Turn, type V2 } from './mesh';
import { CELL_U, half, PLAY, STEP_U } from './scale';
import { barrel, bed, bench, candle, chest, cob, counter, flame, longLoaf, rug, sack, shelves, stool, table, wardrobe } from './shapes/furniture';
import { lampPost, lantern, pot, signBoard, signBracket, windowBox } from './shapes/details';
import { plantCards, type Plant } from './shapes/plants';
import { archFront } from './shapes/masonry';

/**
 * The kit's furnishings and street pieces: furniture, bread, the stair and its rails, the oven's fire,
 * the lamp, the sign, window boxes and pots. Each is placed like any other piece.
 */

const part = (mesh: () => Mesh3, look: Look, extra: Partial<Part> = {}): Part => ({ mesh, look, ...extra });
/** A box claim round a footprint's middle, `r` U each way and `hU` tall. */
const round = (r: number, hU: number, y0 = 0): Claim => boxClaim(-r, y0, -r, r, hU, r);

/** Fixed colours of furnishings' own materials. */
export const FURNISH = {
  iron: 0x34322f, bread: 0xc58a46, crust: 0x9c5c2c, linen: 0xe9e1cd, blanket: 0x56677e, wool: 0x8e4436, border: 0xab8a55,
  sack: 0xd5c49c, earth: 0x4a3626, wax: 0xf0e6c8, soot: 0x2c2420, lampGlow: 0xffd27a,
  flameGlow: 0xff6c1e, flameCore: 0xffbf4a, ember: 0xd2400e, charred: 0x2b1d14,
} as const;

// ─── Furniture ──────────────────────────────────────────────────────────────

export const counterEl = (w: number, h: number) => def({
  id: `counter${w}x${h}`, name: `Shop counter ${w} long`, w, d: 2, h, kind: 'detail',
  claims: [boxClaim(-half(w) - 1.2, 0, -half(2) - 1.2, half(w) + 1.2, h * STEP_U, half(2) + 1.2)],
  parts: [part(() => counter(w, h * STEP_U), 'oak', { grain: 'auto' })],
});

export const tableEl = (w: number, d: number, h: number) => def({
  id: `table${w}x${d}x${h}`, name: `Table ${w} × ${d}`, w, d, h, kind: 'detail', parts: [part(() => table(w, d, h * STEP_U), 'oak')],
});

export const stoolEl = (h: number) => def({ id: `stool${h}`, name: 'Stool', w: 1, d: 1, h, kind: 'detail', claims: [round(9.4, h * STEP_U)], parts: [part(() => stool(h * STEP_U), 'oak', { grain: 'y' })] });

export const benchEl = (w: number, h: number) => def({ id: `bench${w}x${h}`, name: `Bench ${w} long`, w, d: 1, h, kind: 'detail', parts: [part(() => bench(w, h * STEP_U), 'oak', { grain: 'x' })] });

export const barrelEl = () => def({
  id: 'barrel', name: 'Barrel', w: 2, d: 2, h: 5, kind: 'detail', claims: [round(17.4, 40)],
  parts: [part(() => barrel(17, 40)[0], 'oak', { grain: 'y' }), part(() => barrel(17, 40)[1], 'iron', { color: FURNISH.iron })],
});

export const sackEl = () => def({ id: 'sack', name: 'Sack of flour', w: 1, d: 1, h: 3.5, kind: 'detail', claims: [round(9.6, 28)], parts: [part(() => sack(9.5, 28), 'cloth')] });

/** Bread laid out on a shelf or a counter: `n` loaves along x, round cobs and long loaves by turns. */
export const breadEl = (n: number) => def({
  id: `bread${n}`, name: `${n} loaves`, w: n, d: 1, h: 1, kind: 'detail',
  claims: [boxClaim(-half(n), 0, -9, half(n), STEP_U, 9)],
  parts: [part(() => {
    const out: Mesh3[] = [];
    for (let i = 0; i < n; i++) {
      const x = -half(n) + 10 + i * CELL_U;
      out.push((i % 2 ? longLoaf(16, 5.6).moved(new THREE.Matrix4().makeRotationY(0.25).setPosition(x, 0, 0)) : cob(8).moved(new THREE.Matrix4().makeTranslation(x, 0, 0))).tag(i + 1));
    }
    return join(...out);
  }, 'clay', { color: FURNISH.bread })],
});

export const candleEl = () => def({
  id: 'candle', name: 'Candle in a dish', w: 1, d: 1, h: 1.5, kind: 'detail', claims: [round(3.6, 12)],
  parts: [part(() => candle()[0], 'plaster', { color: FURNISH.wax }), part(() => candle()[1], 'iron', { color: FURNISH.iron }), part(() => flame(1.1, 3.6).moved(new THREE.Matrix4().makeTranslation(0, 6.9, 0)), 'glow', { color: FURNISH.flameGlow })],
});

export const bedEl = (w: number, d: number) => def({
  id: `bed${w}x${d}`, name: 'Bed', w, d, h: 4.5, kind: 'detail',
  parts: [part(() => bed(w, d)[0], 'oak'), part(() => bed(w, d)[1], 'cloth', { color: FURNISH.linen }), part(() => bed(w, d)[2], 'cloth', { color: FURNISH.blanket })],
});

export const chestEl = (w: number) => def({
  id: `chest${w}`, name: 'Chest', w, d: 1, h: 3, kind: 'detail', claims: [boxClaim(-half(w) + 1, 0, -8.3, half(w) - 1, 24, 8.3)],
  parts: [part(() => chest(w, 24)[0], 'oak', { grain: 'x' }), part(() => chest(w, 24)[1], 'iron', { color: FURNISH.iron })],
});

export const wardrobeEl = (w: number, h: number) => def({
  id: `wardrobe${w}x${h}`, name: 'Wardrobe', w, d: 1, h, kind: 'detail',
  claims: [boxClaim(-half(w) - 0.6, 0, -9, half(w) + 0.6, h * STEP_U, 9.6)], parts: [part(() => wardrobe(w, h * STEP_U), 'oak', { grain: 'y' })],
});

export const rugEl = (w: number, d: number) => def({
  id: `rug${w}x${d}`, name: 'Rug', w, d, h: 0.5, kind: 'detail',
  parts: [part(() => rug(w, d)[0], 'cloth', { color: FURNISH.wool }), part(() => rug(w, d)[1], 'cloth', { color: FURNISH.border })],
});

/** Shelves against a wall, their boards (all but the top one) stocked with bread. */
export const shelvesEl = (w: number, h: number, n: number) => def({
  id: `shelves${w}x${h}x${n}`, name: 'Shelves of bread', w, d: 1, h, kind: 'detail',
  parts: [part(() => shelves(w, h * STEP_U, n), 'oak', { grain: 'x' }), part(() => {
    const out: Mesh3[] = [];
    for (let k = 0; k + 1 < n; k++) {
      const y = 4 + ((h * STEP_U - 6) * k) / (n - 1) + 2, count = w * 2 - 1;
      for (let i = 0; i < count; i++) {
        const x = -half(w) + 10 + ((2 * half(w) - 20) * i) / (count - 1), s = (k * 7 + i * 3) % 4;
        out.push((s === 1 ? longLoaf(12, 4.4).moved(new THREE.Matrix4().makeRotationY(1.35).setPosition(x, y, -1)) : cob(6.2 + s * 0.4).moved(new THREE.Matrix4().makeTranslation(x, y, (s % 2) * 2 - 1))).tag(k * 20 + i + 1));
      }
    }
    return join(...out);
  }, 'clay', { color: FURNISH.bread })],
});

/** A plank top laid on supports: a shelf board, a landing. */

// ─── The stair and its rails ────────────────────────────────────────────────

/** A turned baluster from y0 to y1 at (x, z). */
const baluster = (x: number, z: number, y0: number, y1: number) => {
  const h = y1 - y0;
  return cylinder(1.3, h, 0.3, 7, [x, y0, z]).add(cylinder(2, h * 0.16, 0.4, 7, [x, y0 + h * 0.12, z]));
};

/**
 * A straight flight of `n` steps `w` cells wide, each a cell of going (along x) and `riseU` up, climbing
 * toward +x from its foot at −x: each step's tread and riser, the cut string closing the space under
 * the steps on the open side (+z), its top stepping with the treads; over the first `railed` steps a
 * newel at the foot, a turned baluster on each tread and a handrail `railU` over the treads rising with
 * the flight (its segments cut plumb at each step's edges, so they meet flush).
 */
export function stairEl(n: number, w: number, riseU: number, railed: number, railU: number): ElementDef {
  const X = n * (CELL_U / 2), Z = half(w), rz = Z - 2.6;
  const x0 = (i: number) => -X + i * CELL_U, top = (i: number) => (i + 1) * riseU, mid = (i: number) => x0(i) + CELL_U / 2;
  const claims: Claim[] = [];
  for (let i = 0; i < n; i++) claims.push(boxClaim(x0(i) + (i ? 0 : PLAY), 0, -Z, x0(i + 1) - (i + 1 < n ? 0 : PLAY), top(i), Z));
  const rail = (i: number) => {
    const y = top(i) + railU, lo = -riseU / 2 - 1.6, hi = riseU / 2 + 1.8;
    return { box: [x0(i), y + lo, rz - 1.9, x0(i + 1), y + hi, rz + 1.9] as Box, bottom: { axis: 'x' as const, at0: y + lo, at1: y + lo + riseU }, top: { axis: 'x' as const, at0: y + hi - riseU, at1: y + hi } };
  };
  for (let i = 0; i < railed; i++) claims.push(boxClaim(mid(i) - 2.2, top(i), rz - 2.2, mid(i) + 2.2, top(i) + railU - 0.6, rz + 2.2), rail(i));
  return def({
    id: `stair${n}x${w}_${riseU}_${railed}_${railU}`, name: `Stair of ${n} steps`, w: n, d: w, h: (top(n - 1) + railU) / STEP_U, kind: 'detail', claims,
    parts: [
      part(() => join(...Array.from({ length: n }, (_, i) => join(
        box(x0(i) + (i ? 0.1 : PLAY), top(i) - 2.4, -Z, x0(i + 1) - (i + 1 < n ? 0.1 : PLAY), top(i), Z, 0.5).tag(i * 3 + 1),
        box(x0(i) + (i ? 0.1 : PLAY), top(i) - riseU, -Z, x0(i) + 2.3, top(i) - 2.4, Z - 2.4, 0.4).tag(i * 3 + 2),
      ))), 'oak', { grain: 'z' }),
      part(() => join(...Array.from({ length: n }, (_, i) => box(x0(i) + (i ? 0.1 : PLAY), 0, Z - 2.4, x0(i + 1) - (i + 1 < n ? 0.1 : PLAY), top(i) - 2.4, Z, 0.5).tag(i * 3 + 3))), 'oak', { grain: 'y' }),
      part(() => join(...Array.from({ length: railed }, (_, i) => {
        const y = top(i) + railU, r = rail(i);
        const hand = prism(ring([[x0(i), r.bottom.at0], [x0(i + 1), r.bottom.at1], [x0(i + 1), r.top.at1], [x0(i), r.top.at0]], 0.6), [], 3.6, 0.6, 'z', [0, 0, rz])[0];
        return join(baluster(mid(i), rz, top(i), y - 0.6), hand).tag(100 + i);
      })), 'oak', { grain: 'x' }),
    ],
  });
}

/** A rail along the edge of a floor over a drop, `w` cells long, `hU` tall: posts at its ends, balusters, a handrail; at the front (+z) of its cells. */
export const railEl = (w: number, hU: number) => {
  const z = half(1) - 2.2;
  return def({
    id: `rail${w}x${hU}`, name: `Rail ${w} long`, w, d: 1, h: hU / STEP_U, kind: 'detail',
    claims: [boxClaim(-half(w), 0, z - 2.4, half(w), hU, z + 2.4)],
    parts: [part(() => {
      const out: Mesh3[] = [box(-half(w), 0, z - 2.4, -half(w) + 4.8, hU, z + 2.4, 0.6), box(half(w) - 4.8, 0, z - 2.4, half(w), hU, z + 2.4, 0.6)];
      out.push(box(-half(w) + 4.8, hU - 3.4, z - 2, half(w) - 4.8, hU, z + 2, 0.6), box(-half(w) + 4.8, 0, z - 1.6, half(w) - 4.8, 2.2, z + 1.6, 0.4));
      const n = w * 2;
      for (let i = 1; i < n; i++) out.push(baluster(-half(w) + (2 * half(w) * i) / n, z, 2.2, hU - 3.4));
      return join(...out.map((m, i) => m.tag(i + 1)));
    }, 'oak', { grain: 'y' })],
  });
};

// ─── The oven ───────────────────────────────────────────────────────────────

/** The oven's mouth: a stone front `w` cells wide and `h` steps tall round an arched opening (U across, where it springs, its brick ring's depth). */
export const OVEN_MOUTH = { w: 4, h: 5, mouth: 40, spring: 8, ring: 6 } as const;

/**
 * The bread oven's mouth: a front of stone round an arched opening with a ring of brick voussoirs,
 * black with soot inside, where the fire is laid. It stands against the oven's dome.
 */
export function ovenMouthEl(brick: number): ElementDef {
  const { w, h, mouth, spring, ring: rd } = OVEN_MOUTH, H = h * STEP_U, W = half(w), r0 = mouth / 2, hd = half(1);
  const intrados = (x: number) => spring + Math.sqrt(Math.max(0, r0 * r0 - x * x));
  // (Over the opening the claims step down the arch's underside, leaving the opening itself free for the fire.)
  const bands: [number, number][] = [[-r0, -13], [-13, -7], [-7, 7], [7, 13], [13, r0]];
  const back: V2[] = [[-r0, 0], [r0, 0], ...arc(0, spring, r0, r0, 0, Math.PI, 14)];
  return def({
    id: `ovenMouth${w}x${h}`, name: 'Oven mouth', w, d: 1, h, kind: 'detail',
    claims: [boxClaim(-W, 0, -hd, -r0, H, hd), boxClaim(r0, 0, -hd, W, H, hd), ...bands.map(([a, b]) => boxClaim(a, intrados(Math.max(Math.abs(a), Math.abs(b))), -hd, b, H, hd)),
      boxClaim(-r0, 0, -hd, r0, spring + r0, -hd + 1.4)],
    parts: [
      part(() => archFront(w, mouth, spring, rd, H)[0], 'stone'),
      part(() => archFront(w, mouth, spring, rd, H)[1], 'clay', { color: brick }),
      part(() => prism(ring(back, 0), [], 1.4, 0, 'z', [0, 0, -hd + 0.7])[0], 'clay', { color: FURNISH.soot }),
    ],
  });
}

/** The oven's dome over its chamber, `w` × `d` cells and `hU` tall, and the flue from its back to the wall at its +x end. */
export const OVEN_DOME = { w: 6, d: 3, hU: 52, flue: [30, -10] as const, flueTop: 80, r: 6.5 } as const;

/**
 * The bread oven's dome: a low dome of clay daubed over the baking chamber, standing on the oven's
 * base, its mouth's front set against it; a clay flue rising from its back and turning into the wall.
 */
export function ovenDomeEl(flue: number): ElementDef {
  const { w, d, hU, flue: [fx, fz], flueTop, r } = OVEN_DOME, X = half(w), Z = half(d);
  const prof: Turn[] = [{ r: 0, y: 0 }, { r: 1, y: 0 }, { r: 0.99, y: 0.15, smooth: true }, { r: 0.94, y: 0.36, smooth: true }, { r: 0.82, y: 0.58, smooth: true }, { r: 0.62, y: 0.78, smooth: true }, { r: 0.34, y: 0.93, smooth: true }, { r: 0, y: 1 }];
  const pipeY = flueTop - r;
  return def({
    id: `ovenDome${w}x${d}`, name: 'Oven dome', w, d, h: flueTop / STEP_U, kind: 'detail',
    claims: [boxClaim(-X, 0, -Z, X, hU, Z), boxClaim(fx - r - 0.1, hU * 0.6, fz - r - 0.1, fx + r + 0.1, flueTop, fz + r + 0.1), boxClaim(fx, pipeY - r - 0.1, fz - r - 0.1, X, flueTop, fz + r + 0.1)],
    parts: [
      part(() => turned(prof.map((p) => ({ ...p, r: p.r * X, y: p.y * hU })), 22, [0, 0, 0], [1, Z / X]), 'clay'),
      part(() => join(
        cylinder(r, flueTop - hU * 0.6, 0.6, 12, [fx, hU * 0.6, fz]),
        cylinder(r, X - fx, 0.6, 12).moved(new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(fx, pipeY, fz)),
      ), 'clay', { color: flue }),
    ],
  });
}

// ─── The oven's fire ────────────────────────────────────────────────────────

/** A log `len` long and `r` thick lying at (x, y, z) (its middle), turned `yaw` about the vertical. */
const log = (x: number, y: number, z: number, len: number, r: number, yaw: number) => cylinder(r, len, 0.6, 9).moved(
  new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, -len / 2, 0)),
);

/** Tongues of flame standing at (x, y, z): [x, z, r, hU, lean, yaw], each flattened across the fire. */
const tongues = (y: number, list: number[][]) =>
  join(...list.map(([x, z, r, hU, lean, yaw]) => flame(r, hU, lean, yaw, 0.6).moved(new THREE.Matrix4().makeTranslation(x, y, z))));

/**
 * A fire of split logs in an oven's mouth, `w` × `d` cells and `hU` tall: charred logs crossed on a
 * bed of glowing embers, tongues of flame licking up from among them, yellow low down where they
 * burn hottest and orange where they reach.
 */
export const fireEl = (w: number, d: number, hU: number) => def({
  id: `fire${w}x${d}x${hU}`, name: 'Fire', w, d, h: hU / STEP_U, kind: 'detail', claims: [boxClaim(-half(w) + 7, 0, -half(d) + 2.5, half(w) - 7, hU, half(d) - 2.5)],
  parts: [
    part(() => join(...[[-2, 2.6, -1.5, 0.3], [2, 2.6, 1.5, -0.35], [0, 6.8, 0, 1.3]].map(([x, y, z, a], i) => log(x, y, z, i === 2 ? 11 : 19, 2.5, a).tag(i + 1))), 'oak', { color: FURNISH.charred, grain: 'box' }),
    part(() => join(
      box(-half(w) + 9, 0, -half(d) + 4, half(w) - 9, 0.7, half(d) - 4, 0.3),
      ...[[-9, -2.5, 2, 1.1], [-5.5, 3, 1.7, 1.4], [-1.5, -3.6, 2.1, 1], [3, 3.2, 2.3, 1.3], [7, -2.4, 1.8, 1.2], [9.2, 2.6, 1.5, 0.9], [0.5, 0.4, 2.4, 1.5], [-7.5, 0.4, 1.6, 1.2]]
        .map(([x, z, s, h], i) => box(-s, 0, -s * 0.7, s, h, s * 0.7, 0.45).moved(new THREE.Matrix4().makeRotationY(i * 0.83).setPosition(x, 0.4, z))),
    ), 'glow', { color: FURNISH.ember }),
    // (The hot yellow tongues stand in front of the taller orange ones, so they show as the fire's heart.)
    part(() => tongues(1.2, [[-6.5, -1.2, 3.4, hU - 6, 2.4, 0.2], [-2, -1.6, 3.8, hU - 3, -1.8, 0], [2.8, -1, 3.6, hU - 4.5, 2.2, 0.3], [7, -1.4, 3, hU - 8, -2.2, 0]]), 'glow', { color: FURNISH.flameGlow }),
    part(() => tongues(1, [[-4, 2.4, 2.4, 7.5, 1.2, 0], [0.8, 2.8, 2.7, 9, -1.1, 0], [5, 2.4, 2.2, 6.5, 1, 0]]), 'glow', { color: FURNISH.flameCore }),
  ],
});

// ─── The street ─────────────────────────────────────────────────────────────

export const LAMP_H = 160;
export const lampEl = () => def({
  id: 'lamp', name: 'Street lamp', w: 1, d: 1, h: (LAMP_H + 33) / STEP_U, kind: 'detail', claims: [round(9.2, LAMP_H + 33)],
  parts: [
    part(() => lampPost(LAMP_H), 'iron'),
    part(() => lantern()[0].moved(new THREE.Matrix4().makeTranslation(0, LAMP_H, 0)), 'iron'),
    part(() => lantern()[1].moved(new THREE.Matrix4().makeTranslation(0, LAMP_H, 0)), 'glow', { color: FURNISH.lampGlow }),
  ],
});

export const signBracketEl = () => def({
  id: 'signBracket', name: 'Sign bracket', w: 1, d: 1, h: 4, kind: 'detail',
  claims: [boxClaim(-4.5, 4, half(1), 4.5, 30, 30), boxClaim(-4.5, 23.4, 30, 4.5, 30, 45.6), boxClaim(-32, 19, 37.4, 32, 27.8, 42.6)],
  parts: [part(signBracket, 'iron')],
});

export const signEl = () => def({
  id: 'sign', name: 'Baker\'s sign', w: 3, d: 1, h: 6, kind: 'detail', claims: [boxClaim(-30, 3, -2.2, 30, 43, 7)],
  parts: [part(() => signBoard()[0], 'oak', { grain: 'x' }), part(() => signBoard()[1], 'clay', { color: FURNISH.bread })],
});

/** A window box `w` cells long hung on a wall's face, planted with clumps of the flowers given, a little greenery between. */
export function windowBoxEl(w: number, blooms: Plant[]): ElementDef {
  const z = half(1) + 5.2, n = w * 2;
  return def({
    id: `windowBox${w}_${blooms.join('_')}`, name: 'Window box', w, d: 1, h: 2, kind: 'detail',
    claims: [boxClaim(-half(w), -5, half(1), half(w), 30, half(1) + 10)],
    parts: [
      part(() => windowBox(w)[0].moved(new THREE.Matrix4().makeTranslation(0, 0, half(1))), 'oak', { grain: 'x' }),
      part(() => windowBox(w)[1].moved(new THREE.Matrix4().makeTranslation(0, 0, half(1))), 'cloth', { color: FURNISH.earth }),
      part(() => join(...Array.from({ length: n }, (_, i) => {
        const x = -half(w) + 6 + (i * (2 * half(w) - 12)) / (n - 1), kind = i % 3 === 2 ? 'bush' : blooms[i % blooms.length];
        return plantCards(kind, x, 5.6, z, kind === 'bush' ? 11 : 12, kind === 'bush' ? 12 : 18 + (i % 2) * 4, 3, i * 0.7, 0.72);
      })), 'card'),
    ],
  });
}

/** A clay pot two cells across with a leafy shrub in it. */
export const potEl = () => def({
  id: 'pot', name: 'Potted shrub', w: 2, d: 2, h: 7, kind: 'detail', claims: [round(19.5, 56)],
  parts: [part(() => pot(14, 20), 'clay'), part(() => cylinder(11.6, 1, 0, 16, [0, 17.4, 0]), 'cloth', { color: FURNISH.earth }), part(() => plantCards('bush', 0, 16.5, 0, 36, 38, 4, 0.3), 'card')],
});
