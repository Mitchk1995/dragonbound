import type { Mesh3, V2 } from './mesh';
import { BRICK_COLORS, TRANS_COLORS } from './palette';
import { BR_LDU, PL_LDU } from './scale';
import { archShape, body, half, invSlope, log, masonry, ridge, round, roundTile, slope, SLOPES, tile, type SlopeDeg } from './shapes';
import { door, DOOR_BOXES, DOOR_OPENING, doorFrame, glassPane, lattice, sash, shutter, windowFrame, windowOpening, type Opening } from './shapesOpen';
import { fenceLow, fenceSpindled, flame, flowerPlate, lampPost, lantern, leaves, signBoard, signBracket } from './shapesDetail';

/**
 * The kit: every element a builder can place, each a faithful copy of a real element's shape and
 * size. An element stands on its footprint (w studs along x, d along z, at rotation 0) and is h
 * plates tall; its front faces +z.
 */

/** How a part is drawn: smooth plastic, the grained face of a slope, clear glass, or glowing glass. */
export type MatSlot = 'plastic' | 'grain' | 'glass' | 'glow';

export interface Part {
  mesh: () => Mesh3;
  mat: MatSlot;
  /** A colour of its own (a door's iron, a lamp's glass); otherwise the element's colour. */
  color?: number;
  /** Drawn only while the element is in this state (a door shut or open). */
  state?: 'shut' | 'open';
}

/** A box of space, element-local in LDU: [x0, y0, z0, x1, y1, z1]. */
export type Box = [number, number, number, number, number, number];

/** What sort of element it is: walls are laid from `brick`s; the rest is fitted round them. */
export type Kind = 'brick' | 'plate' | 'tile' | 'slope' | 'frame' | 'pane' | 'door' | 'detail';

export interface ElementDef {
  id: string;
  /** Its name as a builder would call it. */
  name: string;
  w: number;
  d: number;
  h: number;
  kind: Kind;
  /** Stud centres on top (LDU, element-local x and z), standing at `studY`. */
  studs: V2[];
  studY: number;
  /** The space it fills, for the overlap checks. */
  boxes: Box[];
  /** A frame's opening: left free for the glass or the door it holds. */
  holds?: Box;
  parts: Part[];
}

export const ELEMENTS: Record<string, ElementDef> = {};

/** Every stud of a w × d top. */
const grid = (w: number, d: number): V2[] => {
  const out: V2[] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([(i + 0.5 - w / 2) * 20, (j + 0.5 - d / 2) * 20]);
  return out;
};
/** The whole footprint, h plates tall. */
const fullBox = (w: number, d: number, hL: number): Box => [-half(w), 0, -half(d), half(w), hL, half(d)];

function def(e: Omit<ElementDef, 'studY' | 'boxes'> & { studY?: number; boxes?: Box[] }) {
  ELEMENTS[e.id] = { ...e, studY: e.studY ?? e.h * PL_LDU, boxes: e.boxes ?? [fullBox(e.w, e.d, e.h * PL_LDU)] };
}
const plastic = (mesh: () => Mesh3): Part => ({ mesh, mat: 'plastic' });

// ─── Bricks, plates and tiles ───────────────────────────────────────────────

export const BRICK_SIZES = { 1: [1, 2, 3, 4, 6, 8], 2: [2, 3, 4, 6, 8] } as const;
export const PLATE_SIZES = { 1: [1, 2, 3, 4, 6, 8], 2: [2, 3, 4, 6, 8], 4: [4, 6, 8, 10, 12], 6: [6, 8, 10, 12, 14, 16], 8: [8, 16] } as const;
export const TILE_SIZES = { 1: [1, 2, 3, 4, 6, 8], 2: [2, 3, 4, 6] } as const;

for (const [d, ws] of Object.entries(BRICK_SIZES)) for (const w of ws) {
  def({ id: `brick${d}x${w}`, name: `Brick ${d} × ${w}`, w, d: +d, h: 3, kind: 'brick', studs: grid(w, +d), parts: [plastic(() => body(w, +d, BR_LDU))] });
}
for (const h of [3, 5]) def({ id: `brick1x1x${h}`, name: `Brick 1 × 1 × ${h}`, w: 1, d: 1, h: h * 3, kind: 'detail', studs: grid(1, 1), parts: [plastic(() => body(1, 1, h * BR_LDU))] });
for (const [d, ws] of Object.entries(PLATE_SIZES)) for (const w of ws) {
  def({ id: `plate${d}x${w}`, name: `Plate ${d} × ${w}`, w, d: +d, h: 1, kind: 'plate', studs: grid(w, +d), parts: [plastic(() => body(w, +d, PL_LDU))] });
}
for (const [d, ws] of Object.entries(TILE_SIZES)) for (const w of ws) {
  def({ id: `tile${d}x${w}`, name: `Tile ${d} × ${w}`, w, d: +d, h: 1, kind: 'tile', studs: [], parts: [plastic(() => tile(w, +d))] });
}

/** The id of a d × w brick, plate or tile (d ≤ w, as the real ones are named). */
export const brickId = (kind: 'brick' | 'plate' | 'tile', a: number, b: number) => `${kind}${Math.min(a, b)}x${Math.max(a, b)}`;

// ─── Modified bricks ────────────────────────────────────────────────────────

for (const w of [2, 4]) {
  def({ id: `masonry1x${w}`, name: `Brick 1 × ${w} with masonry profile`, w, d: 1, h: 3, kind: 'brick', studs: grid(w, 1), parts: [plastic(() => masonry(w))] });
  def({ id: `log1x${w}`, name: `Brick 1 × ${w} log`, w, d: 1, h: 3, kind: 'brick', studs: grid(w, 1), parts: [plastic(() => log(w))] });
}
def({ id: 'round1x1', name: 'Brick, round 1 × 1', w: 1, d: 1, h: 3, kind: 'detail', studs: grid(1, 1), parts: [plastic(() => round(1, BR_LDU))] });
def({ id: 'round2x2', name: 'Brick, round 2 × 2', w: 2, d: 2, h: 3, kind: 'detail', studs: grid(2, 2), parts: [plastic(() => round(2, BR_LDU))] });
def({ id: 'roundPlate1x1', name: 'Plate, round 1 × 1', w: 1, d: 1, h: 1, kind: 'plate', studs: grid(1, 1), parts: [plastic(() => round(1, PL_LDU))] });
def({ id: 'roundPlate2x2', name: 'Plate, round 2 × 2', w: 2, d: 2, h: 1, kind: 'plate', studs: grid(2, 2), parts: [plastic(() => round(2, PL_LDU))] });
def({ id: 'roundTile1x1', name: 'Tile, round 1 × 1', w: 1, d: 1, h: 1, kind: 'tile', studs: [], parts: [plastic(() => roundTile(1))] });
def({ id: 'roundTile2x2', name: 'Tile, round 2 × 2', w: 2, d: 2, h: 1, kind: 'tile', studs: [], parts: [plastic(() => roundTile(2))] });

// ─── Slopes ─────────────────────────────────────────────────────────────────

const SLOPE_WIDTHS: Record<SlopeDeg, number[]> = { 45: [1, 2, 3, 4, 6, 8], 33: [1, 2, 3, 4] };
for (const deg of [45, 33] as SlopeDeg[]) {
  const D = SLOPES[deg].depth;
  for (const w of SLOPE_WIDTHS[deg]) {
    const back = grid(w, D).filter(([, z]) => z < -(D - 1) * 10 + 1);
    def({
      id: `slope${deg}_${D}x${w}`, name: `Slope ${deg}° ${D} × ${w}`, w, d: D, h: 3, kind: 'slope', studs: back,
      parts: [plastic(() => slope(deg, w)[0]), { mesh: () => slope(deg, w)[1], mat: 'grain' }],
    });
  }
  const RD = deg === 45 ? 2 : 4;
  for (const w of [1, 2, 4]) {
    def({
      id: `ridge${deg}_${RD}x${w}`, name: `Slope ${deg}° ${RD} × ${w} double`, w, d: RD, h: 3, kind: 'slope', studs: [],
      parts: [plastic(() => ridge(deg, w)[0]), { mesh: () => ridge(deg, w)[1], mat: 'grain' }],
    });
  }
  for (const w of [1, 2]) {
    def({ id: `inv${deg}_${D}x${w}`, name: `Slope, inverted ${deg}° ${D} × ${w}`, w, d: D, h: 3, kind: 'slope', studs: grid(w, D), parts: [plastic(() => invSlope(deg, w))] });
  }
}
/** The id of a slope, a ridge (double slope) or an inverted slope `w` wide. */
export const slopeId = (kind: 'slope' | 'ridge' | 'inv', deg: SlopeDeg, w: number) =>
  `${kind}${deg}_${kind === 'ridge' ? (deg === 45 ? 2 : 4) : SLOPES[deg].depth}x${w}`;

// ─── Arches ─────────────────────────────────────────────────────────────────

def({ id: 'arch1x4', name: 'Arch 1 × 4', w: 4, d: 1, h: 3, kind: 'frame', studs: grid(4, 1), parts: [plastic(() => archShape(4, BR_LDU))] });
def({ id: 'arch1x6x2', name: 'Arch 1 × 6 × 2', w: 6, d: 1, h: 6, kind: 'frame', studs: grid(6, 1), parts: [plastic(() => archShape(6, 2 * BR_LDU))] });

// ─── Windows and doors ──────────────────────────────────────────────────────

/**
 * The frame's own space: its sill, its two jambs and its head (its opening is left for the glass; a
 * round head's corners stand in the opening's box, which the frame `holds`).
 */
function frameBoxes(o: Opening, w: number, hL: number): Box[] {
  const W = half(w), D = half(1);
  return [[-W, 0, -D, W, o.y0, D], [o.x0, o.y1, -D, o.x1, hL, D], [-W, o.y0, -D, o.x0, hL, D], [o.x1, o.y0, -D, W, hL, D]];
}
const paneBox = (o: Opening): Box => [o.x0, o.y0, -3, o.x1, o.y1, 1.2];

const WINDOWS: [string, string, number, number, boolean][] = [
  ['1x2x2', 'Window 1 × 2 × 2', 2, 6, false],
  ['1x2x3', 'Window 1 × 2 × 3', 2, 9, false],
  ['1x4x3', 'Window 1 × 4 × 3', 4, 9, false],
  ['Arch1x2', 'Window 1 × 2 × 2⅔ with rounded top', 2, 8, true],
];
const CLEAR = TRANS_COLORS.clear.tint;
for (const [key, name, w, h, rnd] of WINDOWS) {
  const hL = h * PL_LDU, o = windowOpening(w, hL, rnd);
  def({ id: `window${key}`, name, w, d: 1, h, kind: 'frame', studs: grid(w, 1), boxes: frameBoxes(o, w, hL), holds: paneBox(o), parts: [plastic(() => windowFrame(w, hL, rnd))] });
  const glass: Part = { mesh: () => glassPane(o), mat: 'glass', color: CLEAR };
  def({ id: `glass${key}`, name: `Glass for ${name.toLowerCase()}`, w, d: 1, h, kind: 'pane', studs: [], boxes: [paneBox(o)], parts: [glass] });
  def({ id: `lattice${key}`, name: `Leaded glass for ${name.toLowerCase()}`, w, d: 1, h, kind: 'pane', studs: [], boxes: [paneBox(o)], parts: [glass, plastic(() => lattice(o))] });
  def({ id: `sash${key}`, name: `Pane for ${name.toLowerCase()}`, w, d: 1, h, kind: 'pane', studs: [], boxes: [paneBox(o)], parts: [glass, plastic(() => sash(o, w === 4 ? 4 : 2, h >= 8 ? 3 : 2))] });
}
for (const h of [6, 9]) {
  def({
    id: `shutter1x${h / 3}`, name: `Shutter for window 1 × 2 × ${h / 3}`, w: 1, d: 1, h, kind: 'detail', studs: [],
    boxes: [[-9.5, 2, half(1), 9.5, h * PL_LDU - 2, half(1) + 3.6]], parts: [plastic(() => shutter(h * PL_LDU))],
  });
}

const DO = DOOR_OPENING, W4 = half(4), D1 = half(1);
def({
  id: 'doorFrame1x4x6', name: 'Door frame 1 × 4 × 6', w: 4, d: 1, h: 18, kind: 'frame', studs: grid(4, 1),
  boxes: [[-W4, 0, -D1, DO.x0, 144, D1], [DO.x1, 0, -D1, W4, 144, D1], [DO.x0, 0, -D1, DO.x1, DO.y0, D1], [DO.x0, DO.y1, -D1, DO.x1, 144, D1]],
  holds: [DO.x0, DO.y0, -D1, DO.x1, DO.y1, D1],
  parts: [plastic(() => doorFrame())],
});
def({
  id: 'door1x4x6', name: 'Door 1 × 4 × 6', w: 4, d: 1, h: 18, kind: 'door', studs: [], boxes: DOOR_BOXES,
  parts: (['shut', 'open'] as const).flatMap((state): Part[] => [
    { mesh: () => door(state === 'open')[0], mat: 'plastic', state },
    { mesh: () => door(state === 'open')[1], mat: 'plastic', color: BRICK_COLORS.black, state },
    { mesh: () => door(state === 'open')[2], mat: 'plastic', color: BRICK_COLORS.pearlGold, state },
  ]),
});

// ─── Fences, the lamp, plants, fire and the sign ────────────────────────────

def({ id: 'fenceSpindle1x4x2', name: 'Fence, spindled 1 × 4 × 2', w: 4, d: 1, h: 6, kind: 'detail', studs: grid(4, 1), boxes: [[-W4, 0, -6, W4, 48, 6]], parts: [plastic(fenceSpindled)] });
def({ id: 'fence1x4x1', name: 'Fence 1 × 4 × 1', w: 4, d: 1, h: 3, kind: 'detail', studs: grid(4, 1), boxes: [[-W4, 0, -5, W4, 24, 5]], parts: [plastic(fenceLow)] });
def({ id: 'lampPost2x2x7', name: 'Lamp post 2 × 2 × 7', w: 2, d: 2, h: 21, kind: 'detail', studs: [[0, 0]], boxes: [[-18.5, 0, -18.5, 18.5, 168, 18.5]], parts: [plastic(lampPost)] });
def({
  id: 'lantern2x2', name: 'Lantern 2 × 2', w: 2, d: 2, h: 7, kind: 'detail', studs: [], boxes: [[-15.5, 0, -15.5, 15.5, 50, 15.5]],
  parts: [plastic(() => lantern()[0]), { mesh: () => lantern()[1], mat: 'glow', color: TRANS_COLORS.yellow.tint }],
});
def({ id: 'leaves4x3', name: 'Plant leaves 4 × 3', w: 4, d: 3, h: 1, kind: 'detail', studs: [], boxes: [[-39.75, 0, -29.75, 39.75, 9.5, 29.75]], parts: [plastic(leaves)] });
def({ id: 'flower1x1', name: 'Plate, round 1 × 1 with flower edge', w: 1, d: 1, h: 1, kind: 'plate', studs: grid(1, 1), boxes: [[-9.75, 0, -9.75, 9.75, 8, 9.75]], parts: [plastic(flowerPlate)] });
def({ id: 'flame1x1', name: 'Flame', w: 1, d: 1, h: 3, kind: 'detail', studs: [], boxes: [[-6, 0, -6, 6, 24, 6]], parts: [{ mesh: flame, mat: 'glow', color: TRANS_COLORS.orange.tint }] });
def({
  id: 'signBracket', name: 'Sign bracket', w: 1, d: 1, h: 4, kind: 'detail', studs: [],
  // (The wall plate and the stay; the arm's outer half and its knob; the crossbar and its two rings.)
  boxes: [[-4.5, 4, D1, 4.5, 30, 30], [-4.5, 23.4, 30, 4.5, 30, 45.6], [-32, 19.05, 37.4, 32, 27.6, 42.6]], parts: [plastic(signBracket)],
});
def({
  id: 'signBoard3x2', name: 'Hanging sign 3 × 2', w: 3, d: 1, h: 6, kind: 'detail', studs: [], boxes: [[-30, 3, -2.2, 30, 43, 7]],
  parts: [plastic(() => signBoard()[0]), { mesh: () => signBoard()[1], mat: 'plastic', color: BRICK_COLORS.nougat }, { mesh: () => signBoard()[2], mat: 'plastic', color: BRICK_COLORS.darkOrange }],
});

/** The element with this id (throws on an unknown id: a typo must not build silently). */
export function el(id: string): ElementDef {
  const e = ELEMENTS[id];
  if (!e) throw new Error(`brick kit: no element "${id}"`);
  return e;
}
