import { boxClaim, type Box, type Claim } from './claims';
import type { Grain } from './geometry';
import type { Mesh3 } from './mesh';
import { CELL_U, half, PLAY, STEP_U } from './scale';
import type { Layer } from './surfaces';
import { chimneyCap, chimneyPot, ridgeCap, RIDGE_REACH, RIDGE_T, ROOF_RISE, tileBoarding, TILE_FALL, TILE_T, tileCourse } from './shapes/roof';
import { flatArch, plinth, sill, SILL_OUT, stone } from './shapes/masonry';
import { bargeboard, bracedPanel, panel, raked, timber } from './shapes/timber';
import { doorSpace, doubleDoor, frame, FRAME_D, glazingBars, lightOf, pane, shutter, shutterSpace } from './shapes/openings';

/**
 * The kit: every piece a builder can place. A piece stands on its footprint (w cells along x, d along
 * z, at rotation 0), h steps tall, its front toward +z; it is drawn in one or more parts, each in one
 * of the kit's surfaces (or glass, or glowing glass) and claims the space it fills. Pieces whose size
 * varies (a wall's stones, a roof's courses, a gable's raked panels) are made the first time a builder
 * asks for that size.
 */

/** How a part is drawn: one of the kit's surfaces, clear glass, glass that glows, or a plant's painted cards. */
export type Look = Layer | 'glass' | 'glow' | 'card';

export interface Part {
  mesh: () => Mesh3;
  look: Look;
  /** How its texture runs (wood along its length by default). */
  grain?: Grain;
  /** A colour of its own (a door's iron, an oven's bricks); otherwise the piece's colour. */
  color?: number;
  /** Drawn only while the piece is in this state (a door shut or open). */
  state?: 'shut' | 'open';
}

/**
 * What sort of piece it is: walls are laid from `stone`s and `beam`s course by course, floors from
 * `floor` pieces, roofs from `tile` courses; the rest is fitted round them.
 */
export type Kind = 'stone' | 'beam' | 'post' | 'panel' | 'floor' | 'tile' | 'frame' | 'door' | 'detail' | 'fill';

export interface ElementDef {
  id: string;
  /** Its name as a builder would call it. */
  name: string;
  w: number;
  d: number;
  /** Its height in steps. */
  h: number;
  kind: Kind;
  /** The space it fills (element-local, kit units), for the overlap checks. */
  claims: Claim[];
  parts: Part[];
}

export const ELEMENTS: Record<string, ElementDef> = {};

/** The whole footprint, `hU` tall. */
export const footprint = (w: number, d: number, hU: number): Claim => boxClaim(-half(w), 0, -half(d), half(w), hU, half(d));

/** Registers a piece (once: a piece asked for again is the same piece). */
export function def(e: Omit<ElementDef, 'claims'> & { claims?: Claim[] }): ElementDef {
  return (ELEMENTS[e.id] ??= { ...e, claims: e.claims ?? [footprint(e.w, e.d, e.h * STEP_U)] });
}

/** The piece with this id (throws on an unknown id: a typo must not build silently). */
export function el(id: string): ElementDef {
  const e = ELEMENTS[id];
  if (!e) throw new Error(`building kit: no piece "${id}"`);
  return e;
}

const part = (mesh: () => Mesh3, look: Look, extra: Partial<Part> = {}): Part => ({ mesh, look, ...extra });
const claimBox = (b: Box): Claim => ({ box: b });

// ─── Stone ──────────────────────────────────────────────────────────────────

/** A dressed stone `w` cells long, a cell deep and a course tall (or `h` steps). */
export const stoneEl = (w: number, h = 3) => def({
  id: h === 3 ? `stone${w}` : `stone${w}x${h}`, name: `Stone ${w} long`, w, d: 1, h, kind: 'stone',
  parts: [part(() => stone(w, h * STEP_U), 'stone')],
});

/** A slab of stone `w` × `d` cells and `h` steps thick: a flag of a floor, a step, a threshold. */
export const slabEl = (w: number, d: number, h = 1) => def({
  id: `slab${w}x${d}x${h}`, name: `Stone slab ${w} × ${d}`, w, d, h, kind: 'floor',
  parts: [part(() => stone(w, h * STEP_U, d), 'stone')],
});

/** A plinth stone `w` long: the walls' base course, its edges broadly chamfered. */
export const plinthEl = (w: number) => def({
  id: `plinth${w}`, name: `Plinth stone ${w} long`, w, d: 1, h: 3, kind: 'stone', parts: [part(() => plinth(w), 'stone')],
});

/** A window's sill stone across an opening `w` cells wide. */
export const sillEl = (w: number) => def({
  id: `sill${w}`, name: `Sill ${w} wide`, w, d: 1, h: 1, kind: 'detail',
  claims: [boxClaim(-half(w), 0, -half(1), half(w), STEP_U, half(1) + SILL_OUT)],
  parts: [part(() => sill(w), 'stone')],
});

/** A flat arch over an opening `span` cells wide: a course tall, a cell longer each side. */
export const flatArchEl = (span: number) => def({
  id: `flatArch${span}`, name: `Flat arch over ${span}`, w: span + 2, d: 1, h: 3, kind: 'stone',
  parts: [part(() => flatArch(span), 'stone')],
});

/** Packed rubble under a floor: fills the space, never seen. */
export const fillEl = (w: number, d: number, h: number) => def({ id: `fill${w}x${d}x${h}`, name: 'Rubble fill', w, d, h, kind: 'fill', parts: [] });

/** A chimney's cap, standing out a little all round its stack, and a pot. */
export const chimneyCapEl = (w: number) => def({
  id: `chimneyCap${w}`, name: 'Chimney cap', w, d: w, h: 1, kind: 'detail',
  claims: [boxClaim(-half(w) - 2.5, 0, -half(w) - 2.5, half(w) + 2.5, STEP_U, half(w) + 2.5)],
  parts: [part(() => chimneyCap(w, w, 2.5, STEP_U), 'stone')],
});
export const chimneyPotEl = () => def({
  id: 'chimneyPot', name: 'Chimney pot', w: 1, d: 1, h: 3.5, kind: 'detail',
  claims: [boxClaim(-5.3, 0, -5.3, 5.3, 28, 5.3)], parts: [part(() => chimneyPot(28), 'clay')],
});

// ─── Timber and plaster ─────────────────────────────────────────────────────

/** A beam `w` cells long, a cell deep, `h` steps tall (a sill, a rail, a plate, a joist turned across). */
export const beamEl = (w: number, h = 2) => def({
  id: `beam${w}x${h}`, name: `Beam ${w} long`, w, d: 1, h, kind: 'beam', parts: [part(() => timber(w, h * STEP_U), 'oak')],
});

/** A post a cell square, `h` steps tall. */
export const postEl = (h: number) => def({ id: `post${h}`, name: `Post ${h} steps`, w: 1, d: 1, h, kind: 'post', parts: [part(() => timber(1, h * STEP_U), 'oak')] });

/** A plaster panel `w` cells wide and `h` steps tall, set back from both faces of its frame. */
export const panelEl = (w: number, h: number) => def({ id: `panel${w}x${h}`, name: `Plaster panel ${w} × ${h}`, w, d: 1, h, kind: 'panel', parts: [part(() => panel(w, h * STEP_U), 'plaster')] });

/** A plaster panel with a brace across it, rising to the right (`dir` 1) or the left (−1): the brace takes the piece's colour, the plaster its own. */
export const bracedEl = (w: number, h: number, dir: 1 | -1, plaster: number) => def({
  id: `braced${w}x${h}${dir > 0 ? 'R' : 'L'}_${plaster}`, name: `Braced panel ${w} × ${h}`, w, d: 1, h, kind: 'panel',
  parts: [part(() => bracedPanel(w, h * STEP_U, dir)[0], 'plaster', { color: plaster }), part(() => bracedPanel(w, h * STEP_U, dir)[1], 'oak', { grain: 'auto' })],
});

/**
 * A piece of a gable under the roof, `w` cells wide (along x before turning): its top raking from
 * `t0` to `t1` (U) across it, or up to `peak` in its middle and down again; plaster or a timber.
 */
export function rakedEl(w: number, t0: number, t1: number, timberPiece: boolean, peak?: number): ElementDef {
  const W = half(w), D = half(1), hi = Math.max(t0, t1, peak ?? 0);
  // (Its ends stop short of its cells by the play, where the roof over them is a little lower or higher.)
  const f = PLAY / (w * CELL_U);
  const e0 = peak === undefined ? t0 + (t1 - t0) * f : t0 + (peak - t0) * 2 * f;
  const e1 = peak === undefined ? t1 - (t1 - t0) * f : t1 + (peak - t1) * 2 * f;
  const id = `raked${timberPiece ? 'T' : 'P'}${w}_${t0}_${t1}${peak === undefined ? '' : `_${peak}`}`;
  const claims: Claim[] = peak === undefined
    ? [{ box: [-W, 0, -D, W, hi, D], top: { axis: 'x', at0: e0, at1: e1 } }]
    : [{ box: [-W, 0, -D, 0, peak, D], top: { axis: 'x', at0: e0, at1: peak } }, { box: [0, 0, -D, W, peak, D], top: { axis: 'x', at0: peak, at1: e1 } }];
  return def({
    id, name: `Gable ${timberPiece ? 'timber' : 'panel'} ${w} wide`, w, d: 1, h: Math.ceil(hi / STEP_U), kind: timberPiece ? 'post' : 'panel', claims,
    parts: [part(() => raked(w, e0, e1, timberPiece, peak), timberPiece ? 'oak' : 'plaster', timberPiece ? { grain: 'y' } : {})],
  });
}

/**
 * A bargeboard under a verge: one cell of the roof's run, falling toward +z, against the outer edge of
 * the overhang: at −x in its cell (`side` −1) or at +x (1).
 */
export const BARGE = { thick: 4.4, deep: 13 } as const;
export const bargeEl = (side: 1 | -1) => {
  const x0 = side < 0 ? -half(1) : half(1) - BARGE.thick;
  return def({
    id: `barge${side < 0 ? 'L' : 'R'}`, name: 'Bargeboard', w: 1, d: 1, h: 2, kind: 'detail',
    claims: [{ box: [x0, -BARGE.deep, -CELL_U / 2, x0 + BARGE.thick, ROOF_RISE, CELL_U / 2], top: { axis: 'z', at0: ROOF_RISE, at1: 0 }, bottom: { axis: 'z', at0: ROOF_RISE - BARGE.deep, at1: -BARGE.deep } }],
    parts: [part(() => bargeboard(ROOF_RISE, BARGE.deep, BARGE.thick, x0), 'oak', { grain: 'z' })],
  });
};

/** A floorboard `w` cells long, half a step thick. */
export const boardEl = (w: number) => def({ id: `board${w}`, name: `Floorboard ${w} long`, w, d: 1, h: 0.5, kind: 'floor', parts: [part(() => timber(w, STEP_U / 2), 'oak', { grain: 'x' })] });

// ─── The roof ───────────────────────────────────────────────────────────────

/** The boarding under the tiles, seen only in the gaps between them. */
const BOARDING = 0x2e2219;

/** A course of tiles `w` cells long rising over one cell of the roof's run; `shift` breaks its joints on the course below. */
export const tilesEl = (w: number, shift: boolean) => def({
  id: `tiles${w}${shift ? 's' : ''}`, name: `Tile course ${w} long`, w, d: 1, h: 2, kind: 'tile',
  claims: [{ box: [-half(w), 0, -half(1) - 0.25, half(w), ROOF_RISE + TILE_T, half(1) + 0.25], bottom: { axis: 'z', at0: ROOF_RISE, at1: 0 }, top: { axis: 'z', at0: ROOF_RISE + TILE_T, at1: 2 * TILE_T } }],
  parts: [part(() => tileCourse(w, shift), 'clay'), part(() => tileBoarding(w), 'oak', { color: BOARDING, grain: 'x' })],
});

/** The ridge's capping tiles, `w` cells long, standing on the apex where the top courses meet (its footprint two cells across the ridge). */
export const ridgeEl = (w: number) => {
  const r = RIDGE_REACH, apex = TILE_T, top = apex + RIDGE_T + 0.5;
  return def({
    id: `ridge${w}`, name: `Ridge ${w} long`, w, d: 2, h: 1, kind: 'detail',
    claims: [
      { box: [-half(w), apex - r * TILE_FALL, -r, half(w), top, 0], bottom: { axis: 'z', at0: apex - r * TILE_FALL, at1: apex } },
      { box: [-half(w), apex - r * TILE_FALL, 0, half(w), top, r], bottom: { axis: 'z', at0: apex, at1: apex - r * TILE_FALL } },
    ],
    parts: [part(() => ridgeCap(w, apex), 'clay')],
  });
};

// ─── Windows, doors, shutters ───────────────────────────────────────────────

/** A window `w` cells wide and `h` steps tall: an oak frame in the wall's middle, glazing bars and glass. */
export const windowEl = (w: number, h: number, cols: number, rows: number, bars: number) => def({
  id: `window${w}x${h}_${cols}x${rows}`, name: `Window ${w} × ${h}`, w, d: 1, h, kind: 'frame',
  claims: [boxClaim(-half(w), 0, -FRAME_D, half(w), h * STEP_U, FRAME_D)],
  parts: [
    part(() => frame(w, h * STEP_U), 'oak', { grain: 'box' }),
    part(() => glazingBars(w, h * STEP_U, cols, rows), 'oak', { color: bars, grain: 'box' }),
    part(() => pane(w, h * STEP_U), 'glass'),
  ],
});

/** A door frame `w` cells wide and `h` steps tall: jambs and a head in the wall's middle. */
export const doorFrameEl = (w: number, h: number) => {
  const [x0, , x1, y1] = lightOf(w, h * STEP_U, true), W = half(w), hU = h * STEP_U;
  return def({
    id: `doorFrame${w}x${h}`, name: `Door frame ${w} × ${h}`, w, d: 1, h, kind: 'frame',
    claims: [boxClaim(-W, 0, -FRAME_D, x0, hU, FRAME_D), boxClaim(x1, 0, -FRAME_D, W, hU, FRAME_D), boxClaim(x0, y1, -FRAME_D, x1, hU, FRAME_D)],
    parts: [part(() => frame(w, hU, true), 'oak', { grain: 'box' })],
  });
};

/** A pair of doors for that frame, shut or swung in (the space they sweep is theirs). */
export const doorsEl = (w: number, h: number, iron: number) => def({
  id: `doors${w}x${h}`, name: `Pair of doors ${w} × ${h}`, w, d: 1, h, kind: 'door',
  claims: doorSpace(w, h * STEP_U).map(claimBox),
  parts: (['shut', 'open'] as const).flatMap((state): Part[] => [
    part(() => doubleDoor(w, h * STEP_U, state === 'open')[0], 'oak', { state, grain: 'y' }),
    part(() => doubleDoor(w, h * STEP_U, state === 'open')[1], 'iron', { state, color: iron }),
  ]),
});

/** A shutter swung open against the wall beside a window, `h` steps tall. */
export const shutterEl = (h: number) => def({
  id: `shutter${h}`, name: `Shutter ${h} tall`, w: 1, d: 1, h, kind: 'detail',
  claims: [claimBox(shutterSpace(h * STEP_U))], parts: [part(() => shutter(h * STEP_U), 'oak', { grain: 'y' })],
});
