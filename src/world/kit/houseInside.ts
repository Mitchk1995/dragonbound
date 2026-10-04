import type { KitBuild } from './build';
import { fillEl, shutterEl, slabEl, stoneEl } from './elements';
import { barrelEl, benchEl, bedEl, breadEl, candleEl, chestEl, counterEl, fireEl, lampEl, OVEN_MOUTH, ovenDomeEl, ovenMouthEl, potEl, railEl, rugEl, sackEl, shelvesEl, signBracketEl, signEl, stairEl, stoolEl, tableEl, wardrobeEl, windowBoxEl } from './elementsRoom';
import { C, DOOR, FRAMES, H, HOUSE, STAIR } from './bakery';
import { STEP_U } from './scale';
import type { Plant } from './shapes/plants';
import { course, rows, type Course } from './walls';

/**
 * The house's insides and its street front: the flagstone floor, the stair, the bread oven, the shop's
 * counter and shelves, the family's room upstairs; outside, the door's steps, the window boxes and
 * shutters, the street lamp, the hanging sign and two potted shrubs.
 */
export function furnish(b: KitBuild) {
  // The oven first: the floor's flags are laid round what stands on the floor.
  oven(b);
  stair(b);
  rows(b, HOUSE.x0 + 1, HOUSE.z0 + 1, HOUSE.x1 - 1, HOUSE.z1 - 1, H.plinth, (n, d) => slabEl(n, d), (pos) => FLAG_TONES[pos % FLAG_TONES.length], 'g.floor', 'x', [3, 2, 4, 1], 2);
  shop(b);
  room(b);
  street(b);
}

/** The flags' tones: a few greys and buffs of the same stone. */
const FLAG_TONES = [C.flags, 0xa99f8a, 0xbab09a, 0xa39782];

// ─── The stair ──────────────────────────────────────────────────────────────

/** A riser: a step and a half (27 cm); the treads a cell deep. */
export const RISE = 1.5;
/** The top of the stair's tread at column x: the first a riser over the floor, each one a riser higher. */
export const treadTop = (x: number) => H.walk + RISE * (x - STAIR.foot + 1);

/**
 * A straight flight along the back wall, climbing east from a landing in the north-west corner to the
 * upper floor: fourteen oak treads four cells wide, a step and a half up and a cell on each, the space
 * under them closed by the cut string on their open side, a rail of turned balusters over them.
 */
function stair(b: KitBuild) {
  const n = STAIR.top - STAIR.foot, railH = 5;
  // The rail runs up to where the floor's trimmer takes over as the guard beside the flight.
  let railed = 0;
  while (railed < n && treadTop(STAIR.foot + railed) + railH <= H.wallTop) railed++;
  b.place(stairEl(n, STAIR.z1 - STAIR.z0, RISE * STEP_U, railed, railH * STEP_U), STAIR.foot, H.walk, STAIR.z0, C.boards, { part: 'g.in' });
}

// ─── The oven ───────────────────────────────────────────────────────────────

/** The bread oven in the north-east corner, its arched mouth facing the room (south). */
export const OVEN = { x: 18, z0: 1, z1: 5, floor: 10, clay: 0xa8714b } as const;

/**
 * A baker's oven in the corner: a stone base two courses tall, on it a low clay dome over the baking
 * chamber, its mouth toward the room in a stone front with a ring of brick voussoirs, a fire burning
 * in it, and a clay flue from the dome's back turning into the east wall to the stack outside.
 */
function oven(b: KitBuild) {
  const { x, z0, z1, floor } = OVEN, w = HOUSE.x1 - 1 - x, part = 'g.in', S = z1 - 1;
  const bond = (k: number): Course => ({ sizes: [2, 3, 1], piece: (n) => stoneEl(n), color: C.stone, part, rot: 0, cost: (n) => (n === 1 ? 1.5 : 0), parity: k % 2 });
  // The base: two courses of stone across its front, rubble behind under a capping of slabs.
  for (const k of [0, 1]) course(b, { axis: 'x', at: S, from: x, to: x + w }, H.walk + 3 * k, bond(k));
  b.place(fillEl(w, S - z0, floor - H.walk - 0.5), x, H.walk, z0, C.stone, { part });
  b.place(slabEl(w, S - z0, 0.5), x, floor - 0.5, z0, C.flags, { part });
  // The dome and its flue, the mouth before it, the fire in the mouth.
  b.place(ovenDomeEl(0x6e4a37), x, floor, z0, OVEN.clay, { part });
  const mx = x + (w - OVEN_MOUTH.w) / 2;
  b.place(ovenMouthEl(0x9a4b33), mx, floor, S, C.stone, { part });
  b.place(fireEl(2, 1, 18), mx + 1, floor, S, C.timber, { part });
}

// ─── The shop ───────────────────────────────────────────────────────────────

function shop(b: KitBuild) {
  const g = H.walk, part = 'g.in';
  // The counter between the customers and the baker at the oven, its top laid with bread.
  b.place(counterEl(8, 5.5), 13, g, 9, C.boards, { part });
  for (const [x, n] of [[14, 3], [18, 2]] as const) b.place(breadEl(n), x, g + 5.5, 10, C.boards, { part });
  // Shelves of bread on the east wall behind it.
  b.place(shelvesEl(4, 11, 4), 23, g, 5, C.boards, { rot: 3, part });
  // Flour and a barrel in the corner by the east window; a table, a bench and a stool for customers by the west window.
  for (const [x, z] of [[22, 15], [23, 15], [23, 14]]) b.place(sackEl(), x, g, z, C.boards, { part });
  b.place(barrelEl(), 20, g, 14, C.boards, { part });
  b.place(tableEl(3, 2, 5), 3, g, 10, C.boards, { part });
  b.place(benchEl(3, 2.5), 3, g, 12, C.boards, { part });
  b.place(stoolEl(2.5), 6, g, 10, C.boards, { part });
  b.place(candleEl(), 4, g + 5, 10, C.boards, { part });
}

// ─── The family's room ──────────────────────────────────────────────────────

function room(b: KitBuild) {
  const u = H.upperWalk, part = 'u.in';
  // The rail round the stairwell: along its open side, and across its west end.
  for (let x = STAIR.well[0]; x < STAIR.well[1]; x += 7) b.place(railEl(Math.min(7, STAIR.well[1] - x), 5 * STEP_U), x, u, STAIR.well[3], C.timber, { rot: 2, part });
  b.place(railEl(STAIR.well[3] - STAIR.well[2], 5 * STEP_U), STAIR.well[0] - 1, u, STAIR.well[2], C.timber, { rot: 1, part });
  // The bed by the west wall with a chest at its foot, a wardrobe on the east wall.
  b.place(bedEl(6, 4), 1, u, 12, C.boards, { part });
  b.place(chestEl(3), 7, u, 13, C.boards, { rot: 3, part });
  b.place(wardrobeEl(3, 12), 23, u, 6, C.boards, { rot: 3, part });
  // A table by the front windows with a candle, two stools, on a rug.
  b.place(rugEl(8, 6), 11, u, 8, C.boards, { part });
  b.place(tableEl(4, 2, 5), 13, u + 0.5, 11, C.boards, { part });
  b.place(candleEl(), 15, u + 5.5, 11, C.boards, { part });
  for (const [x, z] of [[12, 11], [17, 12]]) b.place(stoolEl(2.5), x, u + 0.5, z, C.boards, { part });
}

// ─── The street front ───────────────────────────────────────────────────────

function street(b: KitBuild) {
  const part = 'outside', S = HOUSE.z1;
  // Three steps up to the threshold, each a long stone a step's rise and a cell's going, wider than the door.
  for (let i = 0; i < 3; i++) b.place(slabEl(DOOR.w + 2, 3 - i, 1), DOOR.x - 1, i, S, C.step, { part });
  // Window boxes under the upper front windows, shutters beside the two outer ones.
  const blooms: Plant[][] = [['poppies', 'buttercups'], ['cornflowers', 'poppies'], ['buttercups', 'cornflowers']];
  FRAMES.S.bays.filter((bay) => bay.kind === 'window').forEach((bay, i) => {
    b.place(windowBoxEl(bay.to - bay.from, blooms[i]), bay.from, H.upWindow - 1, S - 1, C.boards, { part: 'uS.box' });
    if (bay.to - bay.from === 2) for (const x of [bay.from - 1, bay.to]) b.place(shutterEl(H.upHead - H.upWindow), x, H.upWindow, S - 1, C.shutter, { part: 'uS' });
  });
  // The street lamp left of the steps; the baker's sign hung from its bracket right of the door.
  b.place(lampEl(), DOOR.x - 3, 0, S + 1, C.iron, { part });
  b.place(signBracketEl(), 17, H.walk + 12, S - 1, C.iron, { part: 'gS' });
  b.place(signEl(), 16, H.walk + 9, S + 1, C.boards, { part: 'gS' });
  // Potted shrubs at the house's front corners.
  for (const x of [HOUSE.x0, HOUSE.x1 - 2]) b.place(potEl(), x, 0, S + 1, C.roof, { part });
}
