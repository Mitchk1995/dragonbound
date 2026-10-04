import * as THREE from 'three';
import type { Game } from '../game';
import { KitBuild } from '../world/kit/build';
import { ELEMENTS, slabEl } from '../world/kit/elements';
import { C } from '../world/kit/house';
import { CELL } from '../world/kit/scale';
import { KitView } from '../world/kit/view';
import { rows } from '../world/kit/walls';

type Free = (n: string, eye: THREE.Vector3, look: THREE.Vector3, fov?: number) => Promise<void>;

/** A house's footprint with its steps and pots (cells), and the gaps between houses: an alley between backs, a street between fronts. */
const W = 25, D = 21, GAP = 3, ALLEY = 3, STREET = 12;

/**
 * Each house of the street in colours of its own, as a real street's would be: its roof, timbers,
 * stone, door and shutters each one of these (its plaster stays, since braced panels carry their own).
 */
const SCHEME: Record<number, number[]> = {
  [C.roof]: [C.roof, 0x7c4a3c, 0x94593f, 0x84503f],
  [C.ridge]: [C.ridge, 0x6b4034, 0x834b37, 0x764236],
  [C.timber]: [C.timber, 0x4a3426, 0x6a4a31, 0x553a2a],
  [C.stone]: [C.stone, 0xd2c3a5, 0xe0cfa9, 0xcbbc9d],
  [C.door]: [C.door, 0x4e5d49, 0x6b4a33, 0x56506a],
  [C.shutter]: [C.shutter, 0x5d6f86, 0x8a6a45, 0x7b4c3b],
};
/** The colour a piece of colour `c` takes in house `k` of the street (each part of the scheme picked on its own). */
export const houseColour = (c: number, k: number) => {
  const list = SCHEME[c];
  return list ? list[(k * 5 + (c % 7) * (k >> 1)) % list.length] : c;
};

/**
 * A test lot for a street of sixteen houses: the island has no open ground that large (its meadows
 * are wooded), so the lot is paved flat out over the sky beside it. Four rows of four, alternate rows
 * turned round, so two streets each have houses facing each other across them, the rows backing on
 * to each other across an alley between. Returns the lot's corner (world), the sixteen placements
 * (metres from the corner) and the paving, a floor of the kit's own flags laid in rows.
 */
export function testLot(g: Game, plot: THREE.Vector3) {
  const corner = new THREE.Vector3(g.zone.layout.w + 40, plot.y, plot.z - 30);
  const copies: THREE.Matrix4[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const south = r % 2 === 0, pair = Math.floor(r / 2);
    const z0 = pair * (2 * D + STREET + ALLEY) + (south ? 0 : D + STREET + 3);
    const m = new THREE.Matrix4().makeTranslation(c * (W + GAP) * CELL, 0, z0 * CELL);
    // (Turned round about its middle: its front faces north, across the street.)
    if (!south) m.multiply(new THREE.Matrix4().makeTranslation((W * CELL) / 2, 0, 9 * CELL)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().makeTranslation((-W * CELL) / 2, 0, -9 * CELL));
    copies.push(m);
  }
  const paving = new KitBuild(), x1 = 4 * (W + GAP) + 4, z1 = 2 * (2 * D + STREET + ALLEY) + 4;
  rows(paving, -6, -6, x1, z1, -1, (n, d) => slabEl(n, d), (pos) => [C.flags, 0xa99f8a, 0xbab09a, 0xa39782][((pos % 4) + 4) % 4], 'lot', 'x', [4, 3, 2], 2);
  return { corner, copies, paving, middle: new THREE.Vector3((2 * (W + GAP) - GAP / 2) * CELL, 0, (D + STREET / 2) * CELL) };
}

/**
 * Every piece of the kit made so far in rows on the house's plot (the house lifted away), each in a
 * plain light colour, seen from above the street.
 */
export async function kitGallery(g: Game, origin: THREE.Vector3, free: Free) {
  const b = new KitBuild(), W = 60;
  let x = 0, row = 0, end = 0;
  for (const e of Object.values(ELEMENTS)) {
    if (e.kind === 'fill') continue;
    const lo = [Math.min(...e.claims.map((q) => q.box[0])) / 20 + e.w / 2, Math.min(...e.claims.map((q) => q.box[2])) / 20 + e.d / 2];
    const hi = [Math.max(...e.claims.map((q) => q.box[3])) / 20 + e.w / 2, Math.max(...e.claims.map((q) => q.box[5])) / 20 + e.d / 2];
    let px = Math.ceil(x - lo[0]);
    if (px + hi[0] > W) {
      x = 0;
      row = Math.ceil(end) + 1;
      px = Math.ceil(-lo[0]);
    }
    const pz = Math.ceil(row - lo[1]);
    b.place(e, px, 0, pz, 0xd8cbb0);
    x = px + hi[0] + 1;
    end = Math.max(end, pz + hi[1]);
  }
  const v = new KitView(b);
  v.group.position.set(origin.x - 10 * CELL, origin.y, origin.z - 10 * CELL);
  g.scene.add(v.group);
  const c = v.group.position, mid = new THREE.Vector3(c.x + (W / 2) * CELL, c.y, c.z + (end / 2) * CELL);
  try {
    await free('gallery', mid.clone().add(new THREE.Vector3(0, 24, 20)), mid, 50);
  } finally {
    v.dispose();
  }
}
