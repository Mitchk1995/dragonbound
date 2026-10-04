import type { BrickBuild } from './build';
import { brickId } from './elements';
import type { BrickColor } from './palette';
import { C, DOOR, H, HOUSE, inWell, STAIR, UPPER_WINDOWS } from './house';
import { boards, course, masonryBricks, plainBricks, type Course } from './walls';

/**
 * The house's insides and its street front: the stair, the bakehouse hearth, the shop's counter and
 * shelves, the family's room upstairs, the floors; outside, the door's steps, the window boxes'
 * flowers, the street lamp, the hanging sign and two potted plants.
 */
export function furnish(b: BrickBuild) {
  stair(b);
  hearth(b);
  shop(b);
  checker(b, HOUSE.x0 + 1, HOUSE.z0 + 1, HOUSE.x1 - 1, HOUSE.z1 - 1, H.ground, ['tan', 'darkTan'], 'g.floor');
  room(b);
  street(b);
}

const plain = (color: BrickColor | number, part: string, h = 3): Course => ({
  sizes: [6, 4, 3, 2, 8, 1], id: h === 3 ? plainBricks : (n) => brickId('plate', 1, n), color, part, h, rot: 0, cost: (n) => (n === 1 ? 1 : 0),
});

/**
 * Builds a run of stepped columns along x (rows `zs`, from x0 to x1 exclusive) up from plate y0 to
 * each column's `top`: whole bricks bonded along the run as far as each column takes them, plates
 * over them, a tile on top. Across several rows the plates and tiles span the rows, column by column.
 */
function stepped(b: BrickBuild, x0: number, x1: number, zs: number[], y0: number, top: (x: number) => number, body: BrickColor, cap: BrickColor, part: string) {
  const bricksTo = (x: number) => y0 + 3 * Math.floor((top(x) - 1 - y0) / 3);
  const maxTop = Math.max(...Array.from({ length: x1 - x0 }, (_, i) => top(x0 + i)));
  const across = zs.length > 1;
  for (let y = y0; y < maxTop; y++) {
    // Bricks: on whole-brick levels, along each row over the columns that take one here.
    if ((y - y0) % 3 === 0) for (const z of zs) for (const run of runsWhere(x0, x1, (x) => bricksTo(x) > y)) course(b, { axis: 'x', at: z, from: run[0], to: run[1] }, y, plain(body, part));
    // Plates and the tile on top, where a column's bricks have stopped.
    for (const run of runsWhere(x0, x1, (x) => bricksTo(x) <= y && y < top(x))) {
      const tile = (x: number) => y === top(x) - 1;
      for (let x = run[0]; x < run[1]; x++) {
        if (!b.free(x, zs[0], y, y + 1)) continue;
        if (across) b.place(brickId(tile(x) ? 'tile' : 'plate', 1, zs.length), x, y, zs[0], tile(x) ? cap : body, { rot: 1, part });
      }
      if (!across) {
        // (Along a single row, plates and tiles of one height join up into longer pieces.)
        for (const sub of runsWhere(run[0], run[1], (x) => !tile(x))) course(b, { axis: 'x', at: zs[0], from: sub[0], to: sub[1] }, y, plain(body, part, 1));
        for (const sub of runsWhere(run[0], run[1], tile)) course(b, { axis: 'x', at: zs[0], from: sub[0], to: sub[1] }, y, { ...plain(cap, part, 1), id: (n) => brickId('tile', 1, n) });
      }
    }
  }
}

/** The runs [from, to) of x in [x0, x1) where `ok` holds. */
function runsWhere(x0: number, x1: number, ok: (x: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let x = x0; x < x1; x++) {
    if (!ok(x)) continue;
    const s = x;
    while (x < x1 && ok(x)) x++;
    out.push([s, x]);
  }
  return out;
}

// ─── The stair ──────────────────────────────────────────────────────────────

/** The top of the stair's tread at column x: a step of two plates and a stud's going each. */
export const treadTop = (x: number) => H.groundWalk + 2 * (STAIR.foot - x);

/**
 * A straight flight along the back wall, climbing west from a landing by the east wall to the upper
 * floor: ten treads four studs wide, two plates up and a stud on each, tiles on top, on a body of
 * bonded bricks; on its open side a stepped parapet of bricks with a tiled cap, a brick above each
 * tread, until it meets the upper floor.
 */
function stair(b: BrickBuild) {
  const zs: number[] = [];
  for (let z = STAIR.z0; z < STAIR.z1; z++) zs.push(z);
  stepped(b, STAIR.top, STAIR.foot, zs, H.ground, treadTop, 'reddishBrown', 'mediumNougat', 'g.in');
  stepped(b, STAIR.top, STAIR.foot, [STAIR.rail], H.ground, (x) => Math.min(treadTop(x) + 6, H.upperPlate), 'reddishBrown', 'darkTan', 'g.in');
}

// ─── The hearth ─────────────────────────────────────────────────────────────

/** The bakehouse hearth against the east wall: stone piers, an arch, a fire of logs, a breast up to the ceiling. */
export const HEARTH = { x: 20, z0: 9, z1: 15 } as const;

function hearth(b: BrickBuild) {
  const { x, z0, z1 } = HEARTH, part = 'g.in';
  // Piers each side, three studs deep; behind the arch's legs they carry on up to the breast.
  for (const z of [z0, z1 - 1]) {
    for (const y of [H.ground, H.ground + 3]) b.place('brick1x3', x, y, z, C.hearth, { part });
    for (const y of [H.ground + 6, H.ground + 9]) b.place('brick1x2', x + 1, y, z, C.hearth, { part });
  }
  b.place('plate2x4', x + 1, H.ground, z0 + 1, C.hearth, { rot: 1, part });
  b.place('tile1x4', x, H.ground, z0 + 1, C.hearth, { rot: 1, part });
  for (const z of [z0 + 2, z0 + 3]) b.place('log1x2', x + 1, H.ground + 1, z, 'reddishBrown', { part });
  for (const [fx, fz] of [[x + 1, z0 + 2], [x + 2, z0 + 3], [x + 2, z0 + 2]]) b.place('flame1x1', fx, H.ground + 4, fz, 'black', { part });
  b.place('arch1x6x2', x, H.ground + 6, z0, C.hearth, { rot: 3, part });
  // Over the arch a course of masonry, then the hood steps back to the wall in two rows of slopes.
  const y = H.ground + 12;
  course(b, { axis: 'z', at: x, from: z0, to: z1 }, y, { sizes: [4, 2, 1], id: masonryBricks, color: C.hearth, part, rot: 3, cost: (n) => (n === 1 ? 2 : 0) });
  for (const xx of [x + 1, x + 2]) course(b, { axis: 'z', at: xx, from: z0, to: z1 }, y, { ...plain(C.hearth, part), rot: 1 });
  b.place(`slope45_2x${z1 - z0}`, x, y + 3, z0, C.hearth, { rot: 3, part });
  b.place(`brick1x${z1 - z0}`, x + 2, y + 3, z0, C.hearth, { rot: 1, part });
  b.place(`slope45_2x${z1 - z0}`, x + 1, y + 6, z0, C.hearth, { rot: 3, part });
}

// ─── The shop ───────────────────────────────────────────────────────────────

function shop(b: BrickBuild) {
  const g = H.ground, part = 'g.in';
  // The counter: two courses of 2 × N bricks, a tan top with the day's bread on it and a candle.
  b.place('brick2x6', 2, g, 10, 'reddishBrown', { part });
  b.place('brick2x4', 2, g + 3, 10, 'reddishBrown', { part });
  b.place('brick2x2', 6, g + 3, 10, 'reddishBrown', { part });
  b.place('plate2x6', 2, g + 6, 10, 'tan', { part });
  b.place('roundTile2x2', 2, g + 7, 10, 'nougat', { part });
  for (const [x, z] of [[4, 10], [5, 11], [5, 10]]) b.place('roundTile1x1', x, g + 7, z, 'mediumNougat', { part });
  b.place('round1x1', 7, g + 7, 11, 'white', { part });
  b.place('flame1x1', 7, g + 10, 11, 'black', { part });
  // Shelves on the west wall: posts of 1 × 1 bricks with a board across them every two courses.
  for (let y = g, k = 0; k < 3; k++, y += 7) {
    for (const z of [2, 7]) for (const yy of [y, y + 3]) b.place('brick1x1', 1, yy, z, 'reddishBrown', { part });
    b.place('plate1x6', 1, y + 6, 2, 'reddishBrown', { rot: 1, part });
  }
  const jars: [number, number, BrickColor, string][] = [[11, 3, 'white', 'round1x1'], [11, 4, 'mediumNougat', 'roundTile1x1'], [11, 5, 'sandGreen', 'round1x1'], [11, 6, 'nougat', 'roundTile1x1'],
    [18, 3, 'tan', 'round1x1'], [18, 5, 'darkOrange', 'roundPlate1x1'], [18, 6, 'white', 'round1x1']];
  for (const [y, z, color, id] of jars) b.place(id, 1, y, z, color, { part });
  // Sacks of flour by the west wall, a table and two stools for customers, a barrel by the hearth.
  for (const z of [13, 15]) {
    b.place('round2x2', 1, g, z, 'tan', { part });
    b.place('roundTile2x2', 1, g + 3, z, 'tan', { part });
  }
  for (const [x, z] of [[15, 13], [18, 13], [15, 14], [18, 14]]) {
    b.place('round1x1', x, g, z, 'reddishBrown', { part });
    b.place('roundPlate1x1', x, g + 3, z, 'reddishBrown', { part });
  }
  b.place('plate2x4', 15, g + 4, 13, 'reddishBrown', { part });
  b.place('tile2x4', 15, g + 5, 13, 'mediumNougat', { part });
  for (const x of [15, 17]) {
    b.place('round2x2', x, g, 15, 'reddishBrown', { part });
    b.place('roundTile2x2', x, g + 3, 15, 'darkTan', { part });
  }
  b.place('round2x2', 21, g, 15, 'reddishBrown', { part });
  b.place('roundPlate2x2', 21, g + 3, 15, 'darkGrey', { part });
  b.place('round2x2', 21, g + 4, 15, 'reddishBrown', { part });
  b.place('roundTile2x2', 21, g + 7, 15, 'darkTan', { part });
}

/** A floor of 2 × 2 tiles in two colours, chequered; cells already taken are worked round with smaller tiles. */
function checker(b: BrickBuild, x0: number, z0: number, x1: number, z1: number, y: number, colors: [BrickColor, BrickColor], part: string) {
  for (let z = z0; z < z1; z += 2) for (let x = x0; x < x1; x += 2) {
    const color = colors[((x - x0) / 2 + (z - z0) / 2) % 2];
    const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]].filter(([cx, cz]) => cx < x1 && cz < z1 && b.free(cx, cz, y, y + 1));
    if (cells.length === 4) b.place('tile2x2', x, y, z, color, { part });
    else for (const [cx, cz] of cells) b.place('tile1x1', cx, y, cz, color, { part });
  }
}

// ─── The family's room ──────────────────────────────────────────────────────

function room(b: BrickBuild) {
  const u = H.upper, part = 'u.in';
  // A rail round the stairwell: spindled fences on plates, a newel post at each end.
  for (const x of [STAIR.well[0], STAIR.well[0] + 4]) {
    b.place('plate1x4', x, u, STAIR.well[3], C.timber, { part });
    b.place('fenceSpindle1x4x2', x, u + 1, STAIR.well[3], 'reddishBrown', { part });
  }
  b.place('plate1x4', STAIR.well[1], u, STAIR.well[2] + 1, C.timber, { rot: 1, part });
  b.place('fenceSpindle1x4x2', STAIR.well[1], u + 1, STAIR.well[2] + 1, 'reddishBrown', { rot: 1, part });
  for (const z of [STAIR.well[2], STAIR.well[3]]) {
    b.place('round1x1', STAIR.well[1], u, z, 'reddishBrown', { part });
    b.place('round1x1', STAIR.well[1], u + 3, z, 'reddishBrown', { part });
    b.place('roundPlate1x1', STAIR.well[1], u + 6, z, 'reddishBrown', { part });
  }
  // The bed by the west wall: a headboard, a frame, a white mattress, pillows and a red blanket.
  for (const y of [u, u + 3]) b.place('brick1x4', 1, y, 12, C.timber, { rot: 1, part });
  b.place('tile1x4', 1, u + 6, 12, C.timber, { rot: 1, part });
  for (const z of [12, 14]) b.place('brick2x8', 2, u, z, 'reddishBrown', { part });
  b.place('plate4x8', 2, u + 3, 12, 'white', { part });
  for (const z of [12, 14]) {
    b.place('plate2x2', 2, u + 4, z, 'white', { part });
    b.place('tile2x2', 2, u + 5, z, 'white', { part });
    b.place('tile2x6', 4, u + 4, z, 'darkRed', { part });
  }
  b.place('brick1x4', 10, u, 12, C.timber, { rot: 1, part });
  b.place('tile1x4', 10, u + 3, 12, C.timber, { rot: 1, part });
  // A chest at the bed's foot, a wardrobe by the back wall.
  b.place('brick2x4', 11, u, 12, 'mediumNougat', { rot: 1, part });
  b.place('tile2x4', 11, u + 3, 12, 'reddishBrown', { rot: 1, part });
  for (let y = u; y < u + 12; y += 3) b.place('brick2x4', 1, y, 1, 'reddishBrown', { rot: 1, part });
  b.place('plate2x4', 1, u + 12, 1, C.timber, { rot: 1, part });
  b.place('tile2x4', 1, u + 13, 1, C.timber, { rot: 1, part });
  // A table by the front windows (its top at the hero's hip) with a candle and a dish, two stools, on a red rug.
  for (const [x, z] of [[14, 10], [17, 10], [14, 11], [17, 11]]) {
    b.place('round1x1', x, u, z, 'reddishBrown', { part });
    for (const y of [u + 3, u + 4]) b.place('roundPlate1x1', x, y, z, 'reddishBrown', { part });
  }
  b.place('plate2x4', 14, u + 5, 10, 'mediumNougat', { part });
  b.place('round1x1', 15, u + 6, 10, 'white', { part });
  b.place('flame1x1', 15, u + 9, 10, 'black', { part });
  b.place('roundTile2x2', 16, u + 6, 10, 'white', { part });
  for (const [x, z] of [[14, 12], [18, 10]]) {
    b.place('round2x2', x, u, z, 'reddishBrown', { part });
    b.place('roundTile2x2', x, u + 3, z, 'darkTan', { part });
  }
  boards(b, 12, 7, 20, 14, u, 'tile', 'darkRed', 'u.floor', 'x', [4, 2, 1]);
  // The boards: the floor's top everywhere else (round the well).
  boards(b, HOUSE.x0 + 1, HOUSE.z0 + 1, HOUSE.x1 - 1, HOUSE.z1 - 1, u, 'tile', 'mediumNougat', 'u.floor', 'x', [8, 6, 4, 3, 2, 1], inWell);
}

// ─── The street front ───────────────────────────────────────────────────────

function street(b: BrickBuild) {
  const part = 'outside', S = HOUSE.z1;
  // Four steps up to the door, each a plate's rise and a stud's going, between stepped cheek walls
  // standing a brick over each step.
  const x0 = DOOR.x - 1;
  b.place('brick1x6', x0, 0, S, C.plinth, { part });
  b.place('tile1x6', x0, 3, S, C.plinth, { part });
  for (let i = 1; i <= 3; i++) {
    const z = S + i, rise = 4 - i;
    for (let y = 0; y < rise - 1; y++) b.place('plate1x6', x0, y, z, C.plinth, { part });
    b.place('tile1x6', x0, rise - 1, z, C.plinth, { part });
  }
  for (const x of [x0 - 1, x0 + 6]) {
    b.place('brick1x4', x, 0, S, C.plinth, { rot: 1, part });
    [7, 6, 5, 4].forEach((top, i) => {
      let y = 3;
      for (; y + 3 <= top - 1; y += 3) b.place('brick1x1', x, y, S + i, C.plinth, { part });
      for (; y < top - 1; y++) b.place('plate1x1', x, y, S + i, C.plinth, { part });
      b.place('tile1x1', x, top - 1, S + i, C.plinth, { part });
    });
  }
  // Flowers in the window boxes.
  const blooms: BrickColor[] = ['red', 'yellow', 'white', 'red', 'pink', 'yellow'];
  UPPER_WINDOWS.forEach((x, i) => {
    for (const k of [0, 1]) b.place('flower1x1', x + k, H.upper + 6, S, blooms[i * 2 + k], { part: 'uS' });
  });
  // The street lamp left of the steps; the baker's sign hung from its bracket right of the door.
  b.place('lampPost2x2x7', 6, 0, S + 2, 'black', { part });
  b.place('lantern2x2', 6, 21, S + 2, 'black', { part });
  b.place('signBracket', 16, H.ground + 15, S - 1, 'black', { part: 'gS' });
  b.place('signBoard3x2', 15, H.ground + 12, S + 1, 'reddishBrown', { part: 'gS' });
  // Potted plants at the house's corners, their leaves on the pot's inner back stud (the leaves' hub
  // sits a stud off their middle, so the east one is turned round).
  b.place('round2x2', 0, 0, S + 2, 'darkTan', { part });
  b.place('leaves4x3', -1, 3, S + 2, 'green', { part });
  b.place('round2x2', 21, 0, S + 2, 'darkTan', { part });
  b.place('leaves4x3', 20, 3, S + 2, 'green', { rot: 2, part });
}
