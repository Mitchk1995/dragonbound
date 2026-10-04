import { at, C, DOOR, FRAMES, H, HOUSE, inWell, JOISTS, OUT, sideLine, SIDES, STAIR, TRIMMER_Z, type Side } from './bakery';
import { KitBuild } from './build';
import { beamEl, boardEl, bracedEl, doorFrameEl, doorsEl, fillEl, flatArchEl, panelEl, plinthEl, postEl, sillEl, slabEl, stoneEl, windowEl, type ElementDef } from './elements';
import { furnish } from './houseInside';
import { roof } from './houseRoof';
import { course, rows, split, type Course } from './walls';

export * from './bakery';

/**
 * The first hub-town house built from the kit (its plan in bakery.ts): a baker's shop with the
 * family's room over it. A ground floor of coursed cream limestone (quoins at the corners, flat arches
 * over the door and the windows, sills under them, a plinth of broad-chamfered blocks), a timber
 * floor frame whose joist ends show along the front, a timber-framed upper floor (oak posts, rails,
 * braces and a wall plate round lime-plastered panels), and a tiled roof with half-timbered gables,
 * the chimney stack standing outside the east gable. Inside: the shop with its bread oven, a stair
 * along the back wall up to the family's room.
 */
export function buildBakery(): KitBuild {
  const b = new KitBuild();
  groundFloor(b);
  floorFrame(b);
  upperFloor(b);
  roof(b);
  furnish(b);
  return b;
}

/** A course of stones (mostly two cells long) for side s. */
const stones = (s: Side, part: string, piece: (n: number) => ElementDef = stoneEl, color: number = C.stone): Course => ({
  sizes: [2, 3, 4, 1], piece, color, part, rot: OUT[s], cost: (n) => (n === 1 ? 2.5 : n === 4 ? 0.6 : n === 3 ? 0.25 : 0),
});

/**
 * One course of the walls' ring at step y: a quoin at each corner (where nothing stands yet), running
 * along x on even courses and along z on odd ones so the corners bond; then each side filled in
 * running bond, its joints on even or odd cells by turns.
 */
function ringCourse(b: KitBuild, y: number, k: number, quoin: ElementDef, fill: (s: Side) => Course, color: number) {
  const { x0, z0, x1, z1 } = HOUSE;
  const corners: [number, number, Side][] = k % 2 === 0
    ? [[x0, z1 - 1, 'S'], [x1 - 2, z1 - 1, 'S'], [x0, z0, 'N'], [x1 - 2, z0, 'N']]
    : [[x0, z1 - 2, 'W'], [x0, z0, 'W'], [x1 - 1, z1 - 2, 'E'], [x1 - 1, z0, 'E']];
  for (const [x, z, s] of corners) {
    const [x2, z2] = k % 2 ? [x, z + 1] : [x + 1, z];
    if (b.free(x, z, y, y + 3) && b.free(x2, z2, y, y + 3)) b.place(quoin, x, y, z, color, { rot: k % 2 ? 1 : 0, part: `g${s}` });
  }
  for (const s of SIDES) course(b, sideLine(s, x0, z0, x1, z1), y, { ...fill(s), parity: (k + (s === 'S' || s === 'N' ? 0 : 1)) % 2 });
}

// ─── The ground floor ───────────────────────────────────────────────────────

/** A window in side s at `pos` along it, `w` cells wide: its sill, its frame and glazing, the flat arch over it. */
function stoneWindow(b: KitBuild, s: Side, pos: number, w: number, sill: number, h: number, glazing: [number, number]) {
  const rot = OUT[s], part = `g${s}`;
  b.place(sillEl(w), ...at(s, pos, sill), C.stone, { rot, part });
  b.place(windowEl(w, h, glazing[0], glazing[1], C.bars), ...at(s, pos, sill + 1), C.frame, { rot, part });
  b.place(flatArchEl(w), ...at(s, pos - 1, sill + 1 + h), C.stone, { rot, part });
}

function groundFloor(b: KitBuild) {
  const { x0, z0, x1, z1 } = HOUSE, S = z1 - 1;
  // The plinth: one course of broad-chamfered blocks all round, the quoins turning its corners.
  ringCourse(b, 0, 0, plinthEl(2), (s) => stones(s, `g${s}`, plinthEl, C.plinth), C.plinth);
  // Rubble under the floor inside it.
  b.place(fillEl(x1 - x0 - 2, z1 - z0 - 2, H.plinth), x0 + 1, 0, z0 + 1, C.plinth, { part: 'g.floor' });
  // The door: a threshold stone, the frame, the doors, a flat arch over it in the top course.
  b.place(slabEl(DOOR.w, 1), DOOR.x, H.plinth, S, C.step, { part: 'gS' });
  b.place(doorFrameEl(DOOR.w, H.doorHead - H.walk), DOOR.x, H.walk, S, C.frame, { part: 'gS' });
  b.place(doorsEl(DOOR.w, H.doorHead - H.walk, C.iron), DOOR.x, H.walk, S, C.door, { part: 'door' });
  b.place(flatArchEl(DOOR.w), DOOR.x - 1, H.doorHead, S, C.stone, { part: 'gS' });
  // The shop windows either side of it, a window in each end wall, a small one lighting the stair.
  for (const x of [3, 18]) stoneWindow(b, 'S', x, 4, H.sill, H.head - H.window, [4, 3]);
  stoneWindow(b, 'W', 9, 2, H.sill, H.head - H.window, [2, 3]);
  stoneWindow(b, 'E', 12, 2, H.sill, H.head - H.window, [2, 3]);
  stoneWindow(b, 'N', 9, 2, H.plinth + 12, H.doorHead - H.plinth - 13, [2, 2]);
  // Seven courses of stone round them, the quoins at the corners.
  for (let k = 0; k < 7; k++) ringCourse(b, H.plinth + k * 3, k + 1, stoneEl(2), (s) => stones(s, `g${s}`), C.stone);
}

// ─── The floor frame ────────────────────────────────────────────────────────

/**
 * The upper floor's frame on the stone walls' tops: oak joists spanning from the front wall to the
 * back (their ends showing in the front wall's face), a trimmer across the stairwell carrying the
 * joists it cuts, sill beams on the walls between the joists, and the floorboards across the joists.
 */
function floorFrame(b: KitBuild) {
  const { x0, z0, x1, z1 } = HOUSE, y = H.wallTop;
  const cut = (x: number) => x >= STAIR.well[0] && x < STAIR.well[1];
  for (const x of JOISTS) {
    const from = cut(x) ? TRIMMER_Z + 1 : z0;
    b.place(beamEl(z1 - from), x, y, from, C.joist, { rot: 1, part: 'u.floor' });
  }
  // The trimmer: from the last whole joist west of the well to the first east of it.
  const west = Math.max(...JOISTS.filter((x) => x < STAIR.well[0])), east = Math.min(...JOISTS.filter((x) => x >= STAIR.well[1]));
  b.place(beamEl(east - west - 1), west + 1, y, TRIMMER_Z, C.joist, { part: 'u.floor' });
  // The sill beams: the end walls' whole length, the fronts' between the joists.
  const beams = (s: Side): Course => ({ sizes: [9, 8, 6, 4, 3, 2, 1], piece: (n) => beamEl(n), color: C.timber, part: `u${s}`, h: 2, rot: OUT[s], cost: (n) => (n < 3 ? 0.5 : 0) });
  for (const s of ['W', 'E'] as Side[]) course(b, sideLine(s, x0, z0, x1, z1), y, beams(s));
  for (const s of ['S', 'N'] as Side[]) course(b, sideLine(s, x0 + 1, z0, x1 - 1, z1), y, beams(s));
  // The boards, across the joists, round the stairwell.
  rows(b, x0 + 1, z0 + 1, x1 - 1, z1 - 1, H.frameTop, (n) => boardEl(n), C.boards, 'u.floor', 'x', [7, 6, 5, 4, 3, 2, 1], 1, inWell, 0.5);
}

// ─── The upper floor ────────────────────────────────────────────────────────

/**
 * The timber-framed upper floor. On each side: short posts from the floor frame up to a girding rail
 * that runs right round the house at the windows' sills, plaster panels between them; over the rail
 * the posts again up to the wall plate, the bays between them filled with a window (a head rail over
 * it), a braced panel, or two panels on a middle rail. The rails and the plate are laid with their
 * joints over posts.
 */
function upperFloor(b: KitBuild) {
  const lowH = H.upSill - H.frameTop, highH = H.plate - H.upWindow;
  for (const s of SIDES) {
    const part = `u${s}`, rot = OUT[s], f = FRAMES[s];
    for (const p of f.posts) {
      b.place(postEl(lowH), ...at(s, p, H.frameTop), C.timber, { rot, part });
      b.place(postEl(highH), ...at(s, p, H.upWindow), C.timber, { rot, part });
    }
    for (const bay of f.bays) {
      const w = bay.to - bay.from, place = (e: ElementDef, y: number, color: number) => b.place(e, ...at(s, bay.from, y), color, { rot, part });
      place(panelEl(w, lowH), H.frameTop, C.plaster);
      if (bay.kind === 'window') {
        place(windowEl(w, H.upHead - H.upWindow, w, 3, C.bars), H.upWindow, C.frame);
        place(beamEl(w), H.upHead, C.timber);
        place(panelEl(w, H.plate - H.upHead - 2), H.upHead + 2, C.plaster);
      } else if (bay.kind === 'braced') {
        place(bracedEl(w, highH, bay.dir ?? 1, C.plaster), H.upWindow, C.timber);
      } else {
        const mid = H.upWindow + 5;
        place(panelEl(w, mid - H.upWindow), H.upWindow, C.plaster);
        place(beamEl(w), mid, C.timber);
        place(panelEl(w, H.plate - mid - 2), mid + 2, C.plaster);
      }
    }
  }
  // The girding rail and the wall plate: the fronts' the whole length, the ends' between them.
  for (const y of [H.upSill, H.plate]) for (const s of SIDES) {
    const [from, to] = s === 'S' || s === 'N' ? [HOUSE.x0, HOUSE.x1] : [HOUSE.z0 + 1, HOUSE.z1 - 1];
    beamRun(b, s, from, to, y, FRAMES[s].posts);
  }
}

/**
 * Beams along side s from `from` to `to` (exclusive) at step y, as few as can be, each at most nine
 * cells long, every joint at a post's edge (so each beam's end bears on a post).
 */
function beamRun(b: KitBuild, s: Side, from: number, to: number, y: number, posts: number[]) {
  const ok = new Set(posts.flatMap((p) => [p, p + 1]));
  const avoid = new Set<number>();
  for (let p = from + 1; p < to; p++) if (!ok.has(p)) avoid.add(p);
  let pos = from;
  for (const n of split(from, to, [9, 8, 7, 6, 5, 4, 3, 2, 1], avoid, (n) => (n < 3 ? 1 : 0)).lens) {
    b.place(beamEl(n), ...at(s, pos, y), C.timber, { rot: OUT[s], part: `u${s}` });
    pos += n;
  }
}
