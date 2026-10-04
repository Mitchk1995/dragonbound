import { BrickBuild } from './build';
import { brickId } from './elements';
import type { BrickColor } from './palette';
import { furnish } from './houseInside';
import type { Rot } from './scale';
import { capStuds, course, masonryBricks, plainBricks, plates, slopeRow, type Course, type Line } from './walls';

/**
 * The first hub-town house built from the kit: a baker's shop with the family's room over it. A
 * coursed stone ground floor in the castle's cream stone (masonry bricks; its quoins and lintels
 * plain bricks of the same stone, as the castle's trim is; a darker plinth) with two shop windows
 * either side of the door, a half-timbered upper floor (white plaster between dark timbers) with
 * three shuttered windows over window boxes, and a steep red roof of slopes with a ridge, its chimney
 * stack standing outside the east gable over the bakehouse hearth. Inside: the shop and its hearth on
 * the ground floor, a stair along the back wall up to the family's room.
 *
 * Grid (studs across, plates up): the walls stand on x 0–23 (west to east) and z 0–17 (back to
 * front; the front faces the camera, +z), on a stone plinth a stud wider all round.
 */
export const H = {
  /** The plinth's top, where the floor plates lie. */
  plinth: 3,
  /** The ground floor's walls start on the floor plates; its tiles are walked on a plate higher. */
  ground: 4,
  groundWalk: 5,
  /** Seven courses of stone, then the upper floor's plates and boards. */
  upperPlate: 25,
  upper: 26,
  upperWalk: 27,
  /** Six courses of timber and plaster, then the roof. */
  eaves: 44,
  ridge: 71,
  chimneyTop: 81,
} as const;

/**
 * The walls' footprint, and the stubs (plates) the walls on the camera's side are cut down to while the hero
 * is inside: on the ground floor two courses over the floor plates; upstairs the sill beam and the course over it,
 * whose top (plate 32) carries the window boxes; the stub stands one plate higher so the boxes keep their flowers.
 */
export const HOUSE = { x0: 0, z0: 0, x1: 24, z1: 18, stubGround: 10, stubUpper: 33 } as const;

/** The door frame's corner; the stair (treads along the back wall climbing west), its rail and the well over it. */
export const DOOR = { x: 10, z: 17 } as const;
export const STAIR = { foot: 20, top: 10, z0: 1, z1: 5, rail: 5, well: [10, 18, 1, 6] as const } as const;
/** The chimney stack outside the east gable. */
export const STACK = { x: 24, z: 11 } as const;

/** The house's colours: one cream stone for walls, quoins, lintels and stack; dark timbers; a dark red roof. */
export const C = {
  plinth: 'darkTan', stone: 'tan', quoin: 'tan', lintel: 'tan',
  timber: 'darkBrown', plaster: 'white', frame: 'reddishBrown', sash: 'white', shutter: 'sandGreen',
  roof: 'darkRed', chimney: 'tan', hearth: 'darkGrey', door: 'reddishBrown', floor: 'reddishBrown',
} as const satisfies Record<string, BrickColor>;

export type Side = 'S' | 'N' | 'E' | 'W';
const SIDES: Side[] = ['S', 'N', 'E', 'W'];
/** The turn that faces an element's front out of each side. */
export const OUT: Record<Side, Rot> = { S: 0, N: 2, E: 1, W: 3 };

/** The line of cells of one side of the box [x0, z0, x1, z1). */
function sideLine(s: Side, x0: number, z0: number, x1: number, z1: number): Line {
  if (s === 'S') return { axis: 'x', at: z1 - 1, from: x0, to: x1 };
  if (s === 'N') return { axis: 'x', at: z0, from: x0, to: x1 };
  if (s === 'E') return { axis: 'z', at: x1 - 1, from: z0, to: z1 };
  return { axis: 'z', at: x0, from: z0, to: z1 };
}

/** The plain course for side s: bricks 1 × n of `color`, turned out. */
export const plainCourse = (s: Side, color: BrickColor, part: string, h = 3): Course => ({
  sizes: [6, 4, 3, 8, 2, 1], id: h === 3 ? plainBricks : (n) => brickId('plate', 1, n), color, part, h, rot: OUT[s], cost: (n) => (n === 1 ? 1.5 : n === 8 ? 0.3 : 0),
});

/**
 * One course of the walls' ring at plate y: a quoin at each corner (where nothing stands yet),
 * running along x on even courses and along z on odd ones so the corners bond; then each side filled
 * in running bond, its joints on even or odd studs by turns (the quoins set which: the fronts' first
 * joint falls two studs in on even courses and one on odd ones, the sides' the other way about).
 */
function ringCourse(b: BrickBuild, y: number, k: number, quoin: { color: BrickColor; part: (s: Side) => string } | null, fill: (s: Side) => Course) {
  const { x0, z0, x1, z1 } = HOUSE;
  if (quoin) {
    const corners: [number, number, Side][] = k % 2 === 0
      ? [[x0, z1 - 1, 'S'], [x1 - 2, z1 - 1, 'S'], [x0, z0, 'N'], [x1 - 2, z0, 'N']]
      : [[x0, z1 - 2, 'W'], [x0, z0, 'W'], [x1 - 1, z1 - 2, 'E'], [x1 - 1, z0, 'E']];
    for (const [x, z, s] of corners) {
      const [x2, z2] = k % 2 ? [x, z + 1] : [x + 1, z];
      if (b.free(x, z, y, y + 3) && b.free(x2, z2, y, y + 3)) b.place('brick1x2', x, y, z, quoin.color, { rot: k % 2 ? 1 : 0, part: quoin.part(s) });
    }
  }
  for (const s of SIDES) course(b, sideLine(s, x0, z0, x1, z1), y, { ...fill(s), parity: (k + (s === 'S' || s === 'N' ? 0 : 1)) % 2 });
}

/**
 * What stands while the hero is inside, on the ground floor or upstairs, as the game's buildings
 * do: the roof lifts off, and the walls on the camera's side come down to a stub, whole courses
 * at a time (so the cut shows the studs on top of the course it stops at). On the ground floor the
 * whole upper storey goes too.
 */
export type Cut = 'none' | 'ground' | 'upper';
export function standsIn(cut: Cut, part: string, y: number, h: number): boolean {
  if (cut === 'none') return true;
  if (part === 'roof' || part === 'stackR') return false;
  if (cut === 'ground') {
    if (part === 'stackU' || part.startsWith('u')) return false;
    return part === 'gS' || part === 'door' ? y + h <= HOUSE.stubGround : true;
  }
  return part === 'uS' ? y + h <= HOUSE.stubUpper : true;
}

/** Builds the whole house. */
export function buildTownhouse(): BrickBuild {
  const b = new BrickBuild();
  plinth(b);
  groundFloor(b);
  upperFloor(b);
  roof(b);
  furnish(b);
  return b;
}

// ─── The plinth ─────────────────────────────────────────────────────────────

/** Is (x, z) kept clear of the plinth's ledge: the door's steps, and the chimney stack's foot? */
const offLedge = (x: number, z: number) => (z === HOUSE.z1 && x >= DOOR.x - 2 && x <= DOOR.x + 5) || (x === STACK.x && z >= STACK.z && z <= STACK.z + 1);

/** Two studs of dark stone: the walls' foundation, and a ledge a stud out round them capped with tiles. */
function plinth(b: BrickBuild) {
  const { x0, z0, x1, z1 } = HOUSE;
  for (const box of [[x0 - 1, z0 - 1, x1 + 1, z1 + 1], [x0, z0, x1, z1]]) {
    for (const s of SIDES) for (const run of runs(sideLine(s, box[0], box[1], box[2], box[3]))) course(b, run, 0, plainCourse(s, C.plinth, 'plinth'));
  }
  for (const s of SIDES) {
    for (const run of runs(sideLine(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1))) course(b, run, H.plinth, { ...plainCourse(s, C.plinth, 'plinth', 1), id: (n) => brickId('tile', 1, n) });
  }
  // The floor plates over the whole footprint: they carry the walls and the floor.
  plates(b, x0, z0, x1, z1, H.plinth, C.plinth, 'g.floor');
}

/** A line cut into the runs between the cells kept off the ledge. */
function runs(l: Line): Line[] {
  const out: Line[] = [];
  let from = l.from;
  for (let p = l.from; p <= l.to; p++) {
    const [x, z] = l.axis === 'x' ? [p, l.at] : [l.at, p];
    if (p === l.to || offLedge(x, z)) {
      if (p > from) out.push({ ...l, from, to: p });
      from = p + 1;
    }
  }
  return out;
}

// ─── The ground floor ───────────────────────────────────────────────────────

/** Shop windows and the door on the front, round-headed leaded windows on the sides, two at the back. */
function groundFloor(b: BrickBuild) {
  const y = (c: number) => H.ground + c * 3;
  const S = HOUSE.z1 - 1, N = HOUSE.z0;
  // The door and the shop windows, each under a plain stone lintel the width of the opening, on its
  // frame's studs (its ends on the joints the running bond wants in its course).
  b.place('doorFrame1x4x6', DOOR.x, H.ground, S, C.frame, { part: 'gS' });
  b.place('door1x4x6', DOOR.x, H.ground, S, C.door, { part: 'door' });
  b.place('brick1x4', DOOR.x, y(6), S, C.lintel, { part: 'gS' });
  for (const x of [3, 17]) {
    b.place('window1x4x3', x, y(2), S, C.frame, { part: 'gS' });
    b.place('sash1x4x3', x, y(2), S, C.sash, { part: 'gS' });
    b.place('brick1x4', x, y(5), S, C.lintel, { part: 'gS' });
  }
  // Round-headed leaded windows: two plates short of three courses, so a plate over each makes it up.
  const arched = (s: Side, x: number, z: number) => {
    const rot = OUT[s], part = `g${s}`;
    b.place('windowArch1x2', x, y(2), z, C.frame, { rot, part });
    b.place('latticeArch1x2', x, y(2), z, 'black', { rot, part });
    b.place('plate1x2', x, y(2) + 8, z, C.lintel, { rot: rot % 2 ? 1 : 0, part });
  };
  arched('W', HOUSE.x0, 8);
  arched('E', HOUSE.x1 - 1, 2);
  b.place('window1x2x3', 3, y(2), N, C.frame, { rot: 2, part: 'gN' });
  b.place('sash1x2x3', 3, y(2), N, C.sash, { rot: 2, part: 'gN' });
  b.place('window1x2x2', 14, y(4), N, C.frame, { rot: 2, part: 'gN' });
  b.place('sash1x2x2', 14, y(4), N, C.sash, { rot: 2, part: 'gN' });
  // Seven courses of coursed stone, plain quoins of the same stone at the corners.
  const stone = (s: Side): Course => ({ sizes: [4, 2, 1], id: masonryBricks, color: C.stone, part: `g${s}`, rot: OUT[s], cost: (n) => (n === 1 ? 2 : 0) });
  for (let k = 0; k < 7; k++) ringCourse(b, y(k), k, { color: C.quoin, part: (s) => `g${s}` }, stone);
}

// ─── The upper floor ────────────────────────────────────────────────────────

/** The front windows of the upper floor (each one's corner): shutters either side, a window box under. */
export const UPPER_WINDOWS = [4, 11, 18];

/** Is (x, z) in the stairwell? */
export const inWell = (x: number, z: number) => x >= STAIR.well[0] && x < STAIR.well[1] && z >= STAIR.well[2] && z < STAIR.well[3];

function upperFloor(b: BrickBuild) {
  const { x0, z0, x1, z1 } = HOUSE;
  const y = (c: number) => H.upper + c * 3;
  const S = z1 - 1, N = z0;
  plates(b, x0, z0, x1, z1, H.upperPlate, C.floor, 'u.floor', inWell);
  // Front: brackets in the sill beam carry the window boxes; the windows and their shutters over them.
  for (const x of UPPER_WINDOWS) {
    for (const bx of [x - 1, x + 2]) b.place('inv45_2x1', bx, y(0), S, C.timber, { part: 'uS' });
    b.place('brick1x4', x - 1, y(1), S + 1, C.frame, { part: 'uS' });
    b.place('window1x2x3', x, y(2), S, C.frame, { part: 'uS' });
    b.place('sash1x2x3', x, y(2), S, C.sash, { part: 'uS' });
    for (const sx of [x - 1, x + 2]) b.place('shutter1x3', sx, y(2), S, C.shutter, { part: 'uS' });
  }
  const window = (x: number, z: number, s: Side) => {
    b.place('window1x2x3', x, y(2), z, C.frame, { rot: OUT[s], part: `u${s}` });
    b.place('sash1x2x3', x, y(2), z, C.sash, { rot: OUT[s], part: `u${s}` });
  };
  window(4, N, 'N');
  window(18, N, 'N');
  window(x0, 8, 'W');
  window(x1 - 1, 4, 'E');
  // Timber posts: at the corners from the sill beam up through the wall plate (one 1 × 1 × 5 each),
  // between the windows from the sill beam up to the wall plate.
  for (const [x, z] of [[x0, S], [x1 - 1, S], [x0, N], [x1 - 1, N]]) b.place('brick1x1x5', x, y(1), z, C.timber, { part: z === S ? 'uS' : 'uN' });
  const posts: [number, number, Side][] = [[8, S, 'S'], [15, S, 'S'], [8, N, 'N'], [15, N, 'N'], [x0, 4, 'W'], [x0, 13, 'W'], [x1 - 1, 9, 'E'], [x1 - 1, 13, 'E']];
  for (const [x, z, s] of posts) {
    b.place('brick1x1x3', x, y(1), z, C.timber, { part: `u${s}` });
    b.place('brick1x1', x, y(4), z, C.timber, { part: `u${s}` });
  }
  // The sill beam and the wall plate are timber; the panels between them plaster.
  for (let k = 0; k < 6; k++) {
    const beam = k === 0 || k === 5;
    ringCourse(b, y(k), k, beam ? { color: C.timber, part: (s) => `u${s}` } : null, (s) => plainCourse(s, beam ? C.timber : C.plaster, `u${s}`));
  }
}

// ─── The roof and the chimney ───────────────────────────────────────────────

/** Rows of slopes each side of the ridge (the eaves a stud out over the walls, the ridge between the top rows). */
export const ROOF_ROWS = (HOUSE.z1 - HOUSE.z0 + 2 - 4) / 2 + 1;

/**
 * A 45° roof of slopes from eaves a stud out over the front and back walls up to a ridge of double
 * slopes, a stud out over each gable; plaster gables between its rows, each with a small window.
 * The chimney stack stands outside the east gable, from the ground to above the roof.
 */
function roof(b: BrickBuild) {
  const { x0, z0, x1, z1 } = HOUSE;
  const X0 = x0 - 1, X1 = x1 + 1;
  // The stack: 2 × 2 bricks, every other course a pair of 1 × 2s turned across, so its joints break.
  for (let yy = 0, k = 0; yy < H.chimneyTop; yy += 3, k++) {
    const part = yy < H.upperPlate ? 'stackG' : yy < H.eaves ? 'stackU' : 'stackR';
    if (k % 2 === 0) b.place('brick2x2', STACK.x, yy, STACK.z, C.chimney, { part });
    else for (const z of [STACK.z, STACK.z + 1]) b.place('brick1x2', STACK.x, yy, z, C.chimney, { part });
  }
  b.place('plate2x2', STACK.x, H.chimneyTop, STACK.z, 'black', { part: 'stackR' });
  for (const [x, z] of [[STACK.x, STACK.z], [STACK.x + 1, STACK.z + 1]]) b.place('round1x1', x, H.chimneyTop + 1, z, 'darkOrange', { part: 'stackR' });
  // Gables: a timber course, then plaster between the rows; a window in each.
  for (let k = 0; k < ROOF_ROWS - 1; k++) {
    const yy = H.eaves + k * 3, from = z0 + k + 1, to = z1 - k - 1;
    if (to <= from) break;
    for (const [x, s] of [[x0, 'W'], [x1 - 1, 'E']] as [number, Side][]) {
      if (k === 1) {
        b.place('window1x2x2', x, yy, 8, C.frame, { rot: OUT[s], part: 'roof' });
        b.place('sash1x2x2', x, yy, 8, C.sash, { rot: OUT[s], part: 'roof' });
      }
      course(b, { axis: 'z', at: x, from, to }, yy, plainCourse(s, k === 0 ? C.timber : C.plaster, 'roof'));
    }
  }
  // The rows of slopes, each a stud in and a brick up from the one below, joints broken; a row whose
  // end would run into the chimney stack stops at the gable.
  let south = new Set<number>(), north = new Set<number>();
  const end = (z: number) => (z + 1 >= STACK.z && z <= STACK.z + 1 ? x1 : X1);
  for (let k = 0; k < ROOF_ROWS; k++) {
    const yy = H.eaves + k * 3, zs = z1 - 1 - k, zn = z0 - 1 + k;
    south = slopeRow(b, 'slope', 45, X0, end(zs), zs, yy, 0, C.roof, 'roof', south);
    north = slopeRow(b, 'slope', 45, X0, end(zn), zn, yy, 2, C.roof, 'roof', north);
  }
  const ridgeY = H.eaves + ROOF_ROWS * 3;
  if (ridgeY !== H.ridge) throw new Error(`brick kit: the ridge stands at ${ridgeY}, not ${H.ridge}`);
  slopeRow(b, 'ridge', 45, X0, X1, (z0 + z1) / 2 - 1, ridgeY, 0, C.roof, 'roof', new Set([...south, ...north]));
  // Where a row stops short at the chimney, the row under it shows its studs: tiled over, as flashing.
  capStuds(b, (p) => p.part === 'roof' && p.el.kind === 'slope', C.roof, 'roof');
}
