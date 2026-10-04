import * as THREE from 'three';
import { ModelKit, PAL } from '../render/kit';
import { Discard, If, positionWorld } from 'three/tsl';
import { addPatch } from '../render/surface';
import { hash01, octagon, prism, taper, wedge } from '../render/blocks';
import {
  fitsOf, flightsOf, inRoom, raisedAt, isVoid, partitionRuns, partitionsOf, sideLen, stairParts, stairRect, stairSteps, STAIR_RULE, wallRuns,
  type BuildingSpec, type Fit, type FlightSteps, type Floor, type Side, type Window,
} from './building';
import { CURTAIN_WALL } from '../data/castle';
import { COURSE, STONE as STONE_LEN, type MasonGrid } from '../render/masonry';
import { glazedWindow } from './castleProps/curtain';
import { GROW } from './castle/plan';
import { BACK_PARAPET, fleche, hangingLamp, lantern, LEAD, RIDGE as RIDGE_LEAD, roseRing, rosePlate, slateRoof, SLATES } from './castle/rangeParts';
import {
  archDressing, archInset, archPane, archRing, glassMat, roomMaterial, roomPlate, spread, ASHLAR_B, ASHLAR_L, audit, BASE, BASE_COURSE, BUILDING_FLOOR_LINE, crownFoot, DRESS, frieze, pointedDoor, windowGlass, BLOCKS, BRICK, BRICK_D, cb, chunk, COAL, DARK, DECK, finishProp, flag, flame, DOOR_STAIN, IRON, IRON_L, lancet, light, livery, masonry, oneStone, PLASTER,
  GILT, LAMP_NAVY, PLOT_MARK, pointedArch, quoins, ROOF_BLUE, ROOF_BLUE_L, ROOF_ROLL, spandrels, spire, STONE, STONE_D, STONE_DD, STONE_L, WOOD, WOOD_D, WOOD_L, type Prop,
} from './props';

/**
 * Enterable buildings, built from a BuildingSpec (building.ts) so the walls stand exactly on the
 * grid cells that block. While the hero is inside, a building is cut away down to a clean stone
 * course on the floor they stand on, so the room opens up to the camera:
 *  - `built`: floor, the wall stubs all round, the back and side walls;
 *    its `ground` group holds the ground floor's rooms (interior walls and furnishings);
 *  - `mid`: what goes when the hero is on the ground floor: the camera-side (south) walls between
 *    the ground cut (CUT_H) and the upper cut, and the whole upper floor (boards, rooms, furniture);
 *  - `lifted`: what goes whichever floor the hero is on: the roof, the parapets, the camera-side
 *    walls above the upper cut. On the upper floor only this goes, and the ground floor's rooms hide
 *    under the boards.
 * The cut is a clean horizontal wipe sweeping down to the course (no dither). Single-storey
 * buildings have no upper cut: everything on the camera side above CUT_H lifts with the roof.
 * Restorable plots also carry a `ruin` group: broken courses on the same footprint and rubble.
 */

/**
 * Walls are cut down to this height above their floor while the hero is inside: the top of the deep
 * base course (on a castle building it caps the cut walls; elsewhere a clean stone course does).
 */
export const CUT_H = BASE_COURSE;
/** A cut threshold above everything (nothing cut). */
const OFF = 1e5;
const WALL_T = 0.9;
/** A castle door's dressed surround: how wide its ring of voussoirs is. */
const DRESS_T = 0.48;
/** How much further a long block of a square window's jamb reaches along the face than a short one. */
const JAMB_LONG = 0.24;
/** A shared keep door's square head, on a course line (its lintel is the course over it). */
const GREAT_DOOR_H = 10 * COURSE;
/** The flags of the castle buildings' floors. */
export const FLOOR_STONE = 0x7e776c;
const PLANKS = [0x8a6440, 0x7a5636, 0x94704a];
const SHUTTER = 0x3e5a58;
/** Interior cloth (rugs, runners, cushions) stays crimson; the castle's exterior livery is blue (props.ts). */
const RUG = 0x7a2020, RUG_TRIM = 0xc8a040;
/** Dark oak for the timber framing: clean flat colour (grain streaks read as stripes on long beams). */
export const TIMBER = 0x4b3122;

export interface BuildingProp extends Prop {
  spec: BuildingSpec;
  /**
   * 0 = whole; 1 = cut away round the hero inside, on `floor` (0 = ground: everything above the
   * ground course goes; 1 = upper floor: the roof and the walls above the upper course go, and the
   * ground floor's rooms hide under the boards).
   */
  setCut(v: number, floor?: Floor): void;
  /** Is a world point inside (floor or doorway)? */
  contains(x: number, z: number): boolean;
}

/**
 * A window from the castle's window kit on a castle building's face (castle v4): every building takes
 * its own kind, so no two read as copies of each other.
 */
export interface CastleWindow {
  side: Side;
  /** Its middle along the wall (cells from the wall's low end), its sill over the floor, its opening's width and height (to the apex of a pointed head). */
  u: number;
  sill: number;
  w: number;
  h: number;
  /**
   * lancet: a tall pointed light under a hood mould; pair: two pointed lights under one hood; square: a
   * square-headed light, mullioned when wide; slit: a small square-headed light; shuttered: a square
   * light with its shutters open flat either side; rose: a round window, seven round lights in a plate
   * of the dressed stone; oriel: a bay of lights standing out on corbels; stall: a stall's half-door,
   * the horse inside looking out over it; loft: a hay loft's door, shut, its hoist beam over it.
   */
  kind: 'lancet' | 'pair' | 'square' | 'slit' | 'shuttered' | 'rose' | 'oriel' | 'stall' | 'loft';
}

/** A local cell rectangle [x0, z0, x1, z1) (fractions allowed). */
type Area = [number, number, number, number];

/** How a castle building of the north range or the bailey looks, beyond its plan (rangeSpecs.ts). */
export interface CastleLook {
  /** Its windows (in place of the spec's plain ones). */
  windows?: CastleWindow[];
  /**
   * A steep slate roof on coped gables in place of the flat leads (rangeParts.ts): its ridge over the
   * floor, the louvred lantern (at u along the ridge, its tip) and the flèche.
   */
  roof?: { ridge: number; lantern?: { u: number; tip: number }; fleche?: { u: number; tip: number } };
  /** A shared wall's neighbour stands this high: this building carries the wall on up over it (to its own gable). */
  over?: Partial<Record<Side, number>>;
  /** Back walls walled up solid to the curtain's inner face under its walk: each step `out` from the wall's face, up to `top`. */
  fill?: { side: Side; steps: { out: number; top: number }[] }[];
  /** Buttresses on the south face (at u), in place of the pilasters. */
  buttresses?: number[];
  /** A gabled hood on corbels over the south door, a lantern hung under it. */
  porch?: boolean;
  /** The string course's foot (a sill course under the windows), in place of the floor line's. */
  course?: number;
  /** The upper floor is a gallery open over the room below: it stays standing while the hero is under it. */
  gallery?: boolean;
  /** A boarded ceiling over low rooms of a building otherwise open to its roof (its height). */
  ceiling?: { rect: Area; y: number };
  /** A closed loft over the rooms (its boards' height): its edge railed where it stands open over a room. */
  loft?: { rect: Area; y: number };
  /** The ground floor's interior walls stop at this height (under a ceiling or a loft). */
  partitionTop?: number;
}

/** A castle building's spec with its look. */
export type CastleSpec = BuildingSpec & { look?: CastleLook };

/** Clean horizontal cut: fragments above the world height `u` are cut away (it sweeps down as the building opens). */
function cutPatch(mat: THREE.Material, u: { value: number }) {
  addPatch(mat, { key: 'cut', uniforms: { uCutY: u }, nodes: (r) => ({
    discard() {
      If(positionWorld.y.greaterThan(r.f('uCutY')), () => {
        Discard();
      });
    },
  }) });

}

type Obj = THREE.Object3D;

/** A box placed in a wall's own frame: u along the wall, y up, `off` along its outward normal. */
function wallFrame(b: BuildingSpec, side: Side) {
  const ns = side === 'n' || side === 's';
  const c = side === 'n' ? 0.5 : side === 's' ? b.d - 0.5 : side === 'w' ? 0.5 : b.w - 0.5;
  const out = side === 'n' || side === 'w' ? -1 : 1;
  return {
    out,
    box(k: ModelKit, p: Obj, len: number, h: number, dep: number, u: number, y: number, off: number, color: number, tilt = 0, ch = 0.03, em = 0, int = 1) {
      if (len <= 0.01 || h <= 0.01) return;
      if (ns) cb(k, p, [len, h, dep], [u, y, c + off * out], color, tilt ? [0, 0, tilt] : undefined, ch, em, int);
      else cb(k, p, [dep, h, len], [c + off * out, y, u], color, tilt ? [-tilt, 0, 0] : undefined, ch, em, int);
    },
    /** A group on the wall's outer face at u (y = 0), its +Z facing out of the wall, `off` out from its centre line. */
    frame(p: Obj, u: number, off: number) {
      const f = new THREE.Group();
      f.position.set(ns ? u : c + off * out, 0, ns ? c + off * out : u);
      f.rotation.y = side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
      p.add(f);
      return f;
    },
    /** A pane of glass (its own see-through material, casts no shadow). */
    glass(p: Obj, mat: THREE.Material, len: number, h: number, dep: number, u: number, y: number, off: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ns ? len : dep, h, ns ? dep : len), mat);
      m.position.set(ns ? u : c + off * out, y, ns ? c + off * out : u);
      p.add(m);
      return audit(m, 'glass');
    },
    /**
     * A shaped piece (built across X, up Y, its depth along Z centred on 0) set in the wall at (u, y):
     * in the kit's colour, or as its own material (glass) when `mat` is given. `facing`: the piece's
     * +Z turned to face out of the wall (a piece that is not the same front and back).
     */
    shape(k: ModelKit, p: Obj, geo: THREE.BufferGeometry, color: number, u: number, y: number, off: number, mat?: THREE.Material, em = 0, facing = false) {
      const pos: [number, number, number] = ns ? [u, y, c + off * out] : [c + off * out, y, u];
      const turn = side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
      const rot: [number, number, number] | undefined = facing ? [0, turn, 0] : ns ? undefined : [0, Math.PI / 2, 0];
      if (!mat) return k.mesh(p, geo, color, pos, rot, em, em ? 0.9 : 1);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      p.add(m);
      return m;
    },
  };
}

type WallFrame = ReturnType<typeof wallFrame>;

/** A wall between heights y0 and y1 along [a, e], with rectangular openings left open. */
function holed(W: WallFrame, k: ModelKit, p: Obj, a: number, e: number, y0: number, y1: number, dep: number, color: number, holes: { u0: number; u1: number; y0: number; y1: number }[], ch = 0) {
  const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h.y0, h.y1]).filter((y) => y > y0 && y < y1)])].sort((p1, p2) => p1 - p2);
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1];
    const gaps = holes.filter((h) => h.y0 <= ya + 1e-6 && h.y1 >= yb - 1e-6).sort((g1, g2) => g1.u0 - g2.u0);
    let s = a;
    for (const g of gaps) {
      if (g.u0 > s) W.box(k, p, g.u0 - s, yb - ya, dep, (s + g.u0) / 2, (ya + yb) / 2, 0, color, 0, ch);
      s = Math.max(s, g.u1);
    }
    if (e > s) W.box(k, p, e - s, yb - ya, dep, (s + e) / 2, (ya + yb) / 2, 0, color, 0, ch);
  }
}

/** Window glass: the castle's clear, faintly blue panes, see-through to the room behind. */
function glassMats() {
  return windowGlass();
}

type Put = (kk: ModelKit, pp: Obj, y0: number, y1: number) => void;
/** An opening in a wall: u along it, y up. */
type Hole = { u0: number; u1: number; y0: number; y1: number };
/** A paired window's two lights: [middle along the wall, width] each, their surrounds meeting between them. */
const lightsOf = (o: CastleWindow): [number, number][] => {
  const lw = (o.w - 0.4) / 2;
  return [-1, 1].map((s) => [o.u + s * (lw / 2 + 0.325), lw]);
};
/** Splits a vertical span of a piece by the cut bands (see buildBuilding). */
type Band = (lift: boolean, y0: number, y1: number, put: Put) => void;

/** `baseY`: the ground level the building stands on (its cut heights are measured from it). */
export function buildBuilding(b: BuildingSpec, baseY = 0): BuildingProp {
  // k: walls that stand (dissolve round the hero like any occluder); mk: walls that go with the
  // ground-floor cut; fk: the roof and what goes on any floor; ik: the ground floor's floor and
  // furnishings (never dissolved: the occluder cone would eat holes in the floor in front of the
  // hero); uk: the upper floor's boards and furnishings (go with the ground-floor cut).
  const k = new ModelKit(), mk = new ModelKit(), fk = new ModelKit(), ik = new ModelKit(), uk = new ModelKit();
  const g = new THREE.Group();
  g.position.set(b.x, baseY, b.z);
  const floorG = new THREE.Group(), built = new THREE.Group(), lifted = new THREE.Group(), ruin = new THREE.Group(), mid = new THREE.Group();
  const ground = new THREE.Group();
  g.add(floorG, built, lifted, ruin, mid);
  built.add(ground);
  const { w, d, wallH } = b;
  const timber = b.style === 'timber', hall = b.style === 'hall', keep = b.style === 'keep';
  const storeyH = b.storeyH ?? wallH;
  const multi = !!b.upper && storeyH < wallH;
  /** The upper floor's cut (none on single-storey buildings). */
  const upCut = multi ? storeyH + CUT_H : Infinity;
  /**
   * The floor line (the foot of the castle buildings' string course): the upper floor's, and on a tall
   * single storey the same height, so the courses of every castle building run at one level.
   */
  const look = (b as CastleSpec).look;
  const floorLine = look?.course ?? (b.storeyH ? storeyH : wallH > 7 ? BUILDING_FLOOR_LINE : wallH);
  /** Room for the floor line's course under the course that carries the parapet (none on a low range). */
  const lined = floorLine + COURSE < wallH - COURSE;
  // The castle's buildings (keep style) are built in its own stone: cream ashlar walls, their trim cut
  // from the same stone (a deep weathered base course, dressed courses and surrounds: props.ts); every
  // other building in the plain stone.
  const S = keep
    ? { base: ASHLAR_B, foot: ASHLAR_B, course: DRESS, line: DRESS, light: DRESS }
    : { base: STONE_DD, foot: STONE, course: STONE_L, line: STONE_D, light: STONE_L };
  const UPPER = timber ? PLASTER : keep ? ASHLAR_B : STONE;
  const CAP = timber ? TIMBER : STONE_D;
  const FRAME = timber ? TIMBER : S.light;
  // (A castle doorway's pointed head; its leaves hang inside it a hand clear of the stone.)
  const doorH = keep ? 5.05 : hall ? 3.8 : timber ? 2.8 : 3.1;
  /** The castle's buildings grew 1.3× round the hero: their fittings (lanterns, rails, the porch) grew with them. */
  const grow = keep ? GROW : 1;
  // The two cut thresholds (world heights: OFF = nothing cut) and the glass for each band.
  const uMid = { value: OFF }, uTop = { value: OFF };
  const glass = { still: glassMats(), mid: glassMats(), top: glassMats() };
  const room = { still: roomMaterial(), mid: roomMaterial(), top: roomMaterial() };
  cutPatch(glass.mid, uMid);
  cutPatch(glass.top, uTop);
  cutPatch(room.mid, uMid);
  cutPatch(room.top, uTop);
  const shared = new Set(b.shared ?? []), joinedTo = new Set(b.joined ?? []);
  /** Where a shared wall's neighbour stops and this building carries the wall on up (its gable end). */
  const over = (side: Side) => (shared.has(side) ? look?.over?.[side] : undefined);
  /** The castle windows of a side (the look's), and the openings they cut in its wall. */
  const castleWins = (side: Side) => (look?.windows ?? []).filter((o) => o.side === side);
  const holesOf = (o: CastleWindow): Hole[] => {
    // (Its foot a hair under the sill, so the walling's top never lies in the plane of the sill stone's.)
    const at = (u: number, w: number, w0 = o.sill, h = o.h) => ({ u0: u - w / 2, u1: u + w / 2, y0: w0 > 0 ? w0 - 0.006 : w0, y1: w0 + h });
    if (o.kind === 'loft') return [];
    if (o.kind === 'pair') return lightsOf(o).map(([u, w]) => at(u, w));
    if (o.kind === 'oriel') return [at(o.u, o.w - 0.6)];
    return [at(o.u, o.w)];
  };
  /** Where on a side a window stands across a height band [y0, y1] (a course, a pilaster's stage): its span along the wall with its surround. */
  const winSpans = (side: Side, y0: number, y1: number): [number, number][] => castleWins(side).flatMap((o) => {
    // (A window whose sill sits on a course does not cross it.)
    // (A shuttered window's reach takes in its shutters standing open either side.)
    const a = o.kind === 'oriel' ? o.sill - 0.9 : o.kind === 'stall' ? 0 : o.sill + 0.01, e = o.sill + o.h + (o.kind === 'lancet' || o.kind === 'pair' ? 0.8 : 0.4), half = o.kind === 'shuttered' ? o.w + 0.68 : o.w / 2 + (o.kind === 'pair' ? 0.4 : 0.35);
    return e > y0 && a < y1 ? [[o.u - half, o.u + half] as [number, number]] : [];
  });
  /** The walls the deep base course does not run along (shared, joined or backing onto the curtain). */
  const inBand = new Set([...shared, ...(b.joined ?? []), ...(b.backs ?? [])]);
  const ticks: ((t: number) => void)[] = [];
  let lamp: THREE.PointLight | undefined;

  /**
   * Draw a vertical span. Off the camera side it simply stands; on the camera side it splits at
   * the cuts: below CUT_H it stands, up to the upper cut it goes with the ground floor, above
   * that with the roof.
   */
  const band: Band = (lift, y0, y1, put) => {
    if (!lift) {
      put(k, built, y0, y1);
      return;
    }
    const bands: [number, number, ModelKit, Obj][] = [[-1e9, CUT_H, k, built], [CUT_H, upCut, mk, mid], [upCut, 1e9, fk, lifted]];
    for (const [a, e, kk, pp] of bands) {
      const lo = Math.max(y0, a), hi = Math.min(y1, e);
      if (hi - lo > 0.004) put(kk, pp, lo, hi);
    }
  };
  /** The kit and group for a whole piece that is not split (a detail), by the height of its foot. */
  const at = (lift: boolean, y: number): [ModelKit, Obj] => (!lift || y < CUT_H - 0.001 ? [k, built] : y < upCut - 0.001 ? [mk, mid] : [fk, lifted]);

  // ─── Floor ────────────────────────────────────────────────────────────────
  // Flagstones under every building (the ruin's floor too); timber houses lay planks over them.
  cb(ik, floorG, [w - 1.6, 0.06, d - 1.6], [w / 2, 0.02, d / 2], FLOOR_STONE, undefined, 0.02);
  if (timber) {
    for (let z = 1, row = 0; z < d - 1.01; z += 0.5, row++) {
      let u = 1 - (row % 3) * 0.6;
      for (let n = 0; u < w - 1; n++) {
        const l = 1.6 + ((row * 7 + n * 3) % 4) * 0.45;
        const a = Math.max(1, u), e = Math.min(w - 1, u + l);
        if (e - a > 0.2) cb(ik, ground, [e - a - 0.03, 0.05, 0.47], [(a + e) / 2, 0.06, z + 0.25], PLANKS[(row + n) % 3], undefined, 0.015);
        u += l;
      }
    }
  }
  // Raised parts of the floor (a dais, a chancel): a platform of the floor's stone stepped up from
  // the floor round it in steps of no more than a riser, each a tread in from the one under it on
  // the sides that face the open floor. Every step stands right down on the floor, and each lower step
  // is only its tread showing round the one over it, a border of dressed stones laid along the step
  // (so the platform's top and every tread are each one face of stone, never one flag over another).
  // (Every top stands as far over its walking height as the floor's own flags do over the ground, so
  // none lies in the plane of the ground raised under it.)
  const FLAGS = 0.05;
  for (const { rect: [x0, z0, x1, z1], h } of b.raised ?? []) {
    const n = Math.max(1, Math.ceil(h / (keep ? 0.2 : 0.17) - 1e-6)), T = 0.32 * grow;
    const ow = x0 > 1, oe = x1 < w - 1, on = z0 > 1, os = z1 < d - 1;
    for (let i = 0; i < n; i++) {
      const out = T * (n - 1 - i), y1 = ((i + 1) * h) / n + FLAGS, y0 = 0.04;
      const ax = ow ? x0 - out : x0, ex = oe ? x1 + out : x1, az = on ? z0 - out : z0, ez = os ? z1 + out : z1;
      const step = (bx0: number, bx1: number, bz0: number, bz1: number, color: number) => cb(ik, ground, [bx1 - bx0, y1 - y0, bz1 - bz0], [(bx0 + bx1) / 2, (y0 + y1) / 2, (bz0 + bz1) / 2], color, undefined, 0.02);
      if (i === n - 1) {
        step(ax, ex, az, ez, FLOOR_STONE);
        continue;
      }
      // The tread round the step over it: its sides (along Z) the whole depth, its ends between them.
      if (ow) step(ax, ax + T, az, ez, S.course);
      if (oe) step(ex - T, ex, az, ez, S.course);
      const sx0 = ow ? ax + T : ax, sx1 = oe ? ex - T : ex;
      if (on) step(sx0, sx1, az, az + T, S.course);
      if (os) step(sx0, sx1, ez - T, ez, S.course);
    }
  }
  // Thresholds: a pale stone sill through every doorway, a step beyond it.
  for (const dr of b.doors) {
    const W = wallFrame(b, dr.side), uc = dr.at + dr.w / 2;
    W.box(ik, floorG, dr.w + 0.2, 0.1, 1.0, uc, 0.05, 0, S.course, 0, 0.02);
    if (!shared.has(dr.side) && !joinedTo.has(dr.side)) W.box(ik, floorG, dr.w + 0.6, 0.1, 0.74, uc, 0.05, 0.85, S.base, 0, 0.03);
  }

  // ─── Walls ────────────────────────────────────────────────────────────────
  // Window openings are real holes through the wall: the wall is laid in bands between the sill
  // and head heights with gaps where the windows are, the glass sits in the middle of the wall's
  // thickness, and the surround lies flush on both faces (only the outside sill ledge projects).
  const face = (timber ? WALL_T - 0.08 : WALL_T) / 2;
  // (The castle's windows are tall narrow lancets, their upper ones' sills clear of the floor line's
  // course.) On a single tall storey (the wings) the upper row are clerestory lancets high in the wall.
  // (An upper lancet's head stands well under the course that carries the parapet at the wall's top.)
  const upperWy = multi ? storeyH + CUT_H + 0.3 : floorLine + COURSE + 0.35;
  const winDims = (wi: Window) => (keep ? { ww: 0.95, wh: wi.floor ? Math.min(2.5, wallH - COURSE - 0.55 - upperWy) : 2.4, wy: wi.floor ? upperWy : 1.5 } : wi.floor ? { ww: 1.1, wh: 2.1, wy: storeyH + 1.0 } : hall ? { ww: 1.3, wh: 2.3, wy: 1.9 } : { ww: 1.0, wh: 1.3, wy: 1.55 });
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    if (shared.has(side)) {
      // A wall shared with a lower neighbour: this building carries it on up from the neighbour's top
      // (under its gable), between its own north and south walls.
      const h0 = over(side);
      if (h0 !== undefined) holed(wallFrame(b, side), k, built, 1, sideLen(b, side) - 1, h0, wallH, WALL_T, UPPER, []);
      continue;
    }
    const W = wallFrame(b, side), fade = side === 's';
    /** A box between heights y0 and y1, split at the cuts on the camera side. */
    const piece = (len: number, y0: number, y1: number, dep: number, u: number, off: number, color: number, ch = 0.03) =>
      band(fade, y0, y1, (kk, pp, a, e) => W.box(kk, pp, len, e - a, dep, u, (a + e) / 2, off, color, 0, ch));
    const ns = side === 'n' || side === 's';
    const L = sideLen(b, side);
    // The north and south walls take the corners (over a lower neighbour's wall, only above its top).
    const ow = ns ? over('w') : undefined, oe = ns ? over('e') : undefined;
    // (A castle building's: square with the side walls' outer faces at a free corner; into the neighbour's
    // wall at a shared one.)
    const end0 = !keep || shared.has('w') || joinedTo.has('w') ? 0 : 0.5 - WALL_T / 2, end1 = !keep || shared.has('e') || joinedTo.has('e') ? L : L - 0.5 + WALL_T / 2;
    const lo = ns ? (ow !== undefined ? 1 : end0) : 1, hi = ns ? (oe !== undefined ? L - 1 : end1) : L - 1;
    // (The east and west walls run from the north wall's inner face to the south wall's, so no slot opens
    // between them at a corner; their stubs only from the inner edge of the base course where one runs
    // along that end, which fills the corner there.)
    const wlo = ns || !keep ? lo : 0.5 + WALL_T / 2, whi = ns || !keep ? hi : L - 0.5 - WALL_T / 2;
    const slo = ns || inBand.has('n') ? wlo : 1, shi = ns || inBand.has('s') ? whi : L - 1;
    const runs = wallRuns(b, side).map(([a, e]) => [Math.max(wlo, a), Math.min(whi, e)] as [number, number]).filter(([a, e]) => e > a);
    for (const [h0, c] of [[ow, 0.5], [oe, L - 0.5]] as [number | undefined, number][]) if (h0 !== undefined) piece(1, h0, wallH, WALL_T, c, 0, UPPER, 0);
    const wins = b.windows.filter((wi) => wi.side === side).map((wi) => ({ wi, ...winDims(wi) }));
    const cw = castleWins(side), cHoles = cw.flatMap(holesOf);
    for (const [a, e] of runs) {
      const len = e - a, u = (a + e) / 2;
      // Stone plinth and stub (always standing), capped by a pale course that hides the cut. The
      // keep stands on a raised, stepped base course that projects outward only (never into rooms).
      // (The castle's buildings lay their base courses as continuous bands round the footprint: below.)
      // (A castle building's stub stands right down to its floor: inside its deep base course, a hair
      // under its top, where the course runs along the wall (filling the wall beside a door, where the
      // course stops against the door's surround), and as the wall's own foot along a wall it shares,
      // joins or backs onto the curtain with, where no course runs.)
      if (!keep) W.box(k, built, len, 0.34, WALL_T + 0.16, u, 0.17, 0, STONE_D, 0, 0.04);
      const s0 = keep ? 0 : 0.34, s1 = keep && !inBand.has(side) ? CUT_H - 0.01 : CUT_H;
      // (A stall's half-door opens right down to the floor.)
      holed(W, k, built, Math.max(a, slo), Math.min(e, shi), s0, s1, WALL_T, S.foot, cHoles.filter((h) => h.y0 < s1 && h.u1 > a && h.u0 < e), 0.02);
      if (!keep) W.box(k, built, len, 0.16, WALL_T + 0.1, u, CUT_H - 0.05, 0, S.course, 0, 0.03);
      // Upper wall with its window openings, and the wall plate / cornice on top. On a two-storey
      // camera side the upper storey's own course caps the cut there too.
      const holes = [...wins.filter((o) => o.wi.at > a && o.wi.at < e).map((o) => ({ u0: o.wi.at - o.ww / 2, u1: o.wi.at + o.ww / 2, y0: o.wy, y1: o.wy + o.wh })), ...cHoles.filter((h) => h.u1 > a && h.u0 < e)];
      band(fade, CUT_H, wallH, (kk, pp, y0, y1) => holed(W, kk, pp, a, e, y0, y1, face * 2, UPPER, holes));
      // (A castle building's cut lies on a course line, so it needs no course of its own over it.)
      if (fade && multi && !keep) W.box(mk, mid, len, 0.16, WALL_T + 0.1, u, upCut - 0.08, 0, S.course, 0, 0.03);
      if (!keep) piece(len, wallH - 0.21, wallH + 0.03, WALL_T + 0.16, u, 0, CAP);
      if (timber) {
        // Timber frame: posts at the ends and between the windows (never across one), a sill beam
        // on the stone course and knee-free diagonal braces only in blank panels.
        piece(len, CUT_H, CUT_H + 0.2, WALL_T + 0.06, u, 0, TIMBER, 0.02);
        // End posts stand a little proud of the plaster's end, so the two faces never z-fight.
        const posts = [a + 0.09, e - 0.09];
        const clear = (p: number) => wins.every((o) => Math.abs(p - o.wi.at) > o.ww / 2 + 0.55);
        for (let p = a + 2.2; p < e - 1.2; p += 2.2) {
          let q = p;
          if (!clear(q)) q = [q - 0.9, q + 0.9, q - 1.3, q + 1.3].find(clear) ?? NaN;
          if (!Number.isNaN(q) && q > a + 0.8 && q < e - 0.8) posts.push(q);
        }
        posts.sort((x, y) => x - y);
        const H = wallH - CUT_H;
        for (const p of posts) piece(0.24, CUT_H, wallH, WALL_T + 0.04, p, 0, TIMBER, 0.02);
        const [bk, bp] = at(fade, CUT_H + 0.2);
        for (let i = 0; i + 1 < posts.length; i++) {
          const pa = posts[i], pb = posts[i + 1], span = pb - pa - 0.24;
          if (span < 1.2 || wins.some((o) => o.wi.at > pa - o.ww / 2 - 0.4 && o.wi.at < pb + o.ww / 2 + 0.4)) continue;
          const rise = H - 0.5, ang = Math.atan2(rise, span) * (i % 2 ? 1 : -1);
          W.box(bk, bp, Math.hypot(span, rise), 0.17, WALL_T + 0.02, (pa + pb) / 2, CUT_H + 0.2 + rise / 2, 0, TIMBER, ang, 0.01);
        }
      }
    }
    // Doorways: jambs, lintel, the wall above, and the leaves folded back against the inner face.
    // A castle door (the keep's buildings' side doors) is a pointed arch instead: the head filled down
    // to the arch, one ring of the castle's dressed stone round it and down its jambs (wedge-shaped
    // voussoirs closing on a keystone, the jambs on the walling's courses), a lantern either side
    // clear of the windows, the house banner over it (not on the stables, whose hay door is there),
    // and the lord's blue leaves standing open inside.
    for (const dr of b.doors.filter((x) => x.side === side)) {
      const u0 = dr.at, u1 = dr.at + dr.w, uc = (u0 + u1) / 2;
      const castle = keep && !shared.has(side), stable = !!look?.windows?.some((o) => o.kind === 'stall');
      // (A door through a wall joined to a neighbour's opens inside the range: no lanterns or banner. A
      // door under the porch's hood has the hood's lantern; one under a window has no banner.)
      const inner = joinedTo.has(side), hooded = !!look?.porch && side === 's';
      const under = cw.some((o) => o.u + o.w / 2 > u0 - 0.6 && o.u - o.w / 2 < u1 + 0.6 && o.sill > doorH);
      // (A door in a wall shared with the great keep has a square head on a course line, its lintel the
      // course over it.)
      const dH = castle || !keep ? doorH : GREAT_DOOR_H, lintel = keep ? COURSE : 0.36;
      const rise = Math.min(dr.w * 0.62, 1.7 * grow), sp = castle ? doorH - rise : dH;
      // (A castle door's jambs stand just outside the opening, right under the voussoir ring's feet, so
      // the ring springs straight off them over moulded imposts and the two share one span.)
      // (Its inner face a hair inside the opening, never in the plane of the wall's end behind it.)
      if (!castle) {
        for (const uj of [u0 + 0.12, u1 - 0.12]) piece(0.34, 0, sp, WALL_T + 0.2, uj, 0, FRAME, 0.04);
        piece(dr.w + 0.8, dH, dH + lintel, WALL_T + 0.22, uc, 0, FRAME, 0.04);
        if (hall || (!timber && !keep)) piece(0.5, dH + 0.05, dH + 0.55, WALL_T + 0.3, uc, 0, S.light, 0.04);
      }
      // The wall over the door, cut round any window above it.
      const aboveDoor = [...wins.filter((o) => o.wi.at + o.ww / 2 > u0 && o.wi.at - o.ww / 2 < u1).map((o) => ({ u0: o.wi.at - o.ww / 2, u1: o.wi.at + o.ww / 2, y0: o.wy, y1: o.wy + o.wh })), ...cHoles.filter((h) => h.u1 > u0 && h.u0 < u1)];
      band(fade, castle ? doorH : dH + lintel, wallH, (kk, pp, y0, y1) => holed(W, kk, pp, u0, u1, y0, y1, face * 2, UPPER, aboveDoor));
      if (castle) {
        const [hk, hp] = at(fade, sp);
        W.shape(hk, hp, spandrels(dr.w, doorH, WALL_T - 0.02, rise), UPPER, uc, 0, 0);
        // The surround: one ring of the castle's dressed stone round the arch and down both jambs to
        // the ground, the keystone on the centre line, all flush in one plane (the base course stops
        // against it).
        for (const st of archDressing(dr.w, doorH, rise, { foot: 0, t: DRESS_T, inset: 0.02 })) {
          const [dk2, dp2] = at(fade, st.y);
          W.shape(dk2, dp2, st.geo, DRESS, uc, 0, face, undefined, 0, true);
        }
        if (!inner && !hooded) for (const s of [-1, 1]) {
          // (Hung as much higher as the door grew taller, the lantern itself the same.)
          const lift = doorH - 4.05, [lk, lp] = at(fade, 2.4 + lift);
          // A navy wall lantern with warm glass and a gold finial, on the plain wall beside the door,
          // midway between its hood and the next window's (clear of both); the stables' the same.
          const lu = uc + s * (dr.w / 2 + 1.06 * grow), ly = (y: number) => y + lift;
          W.box(lk, lp, 0.2, 0.3, 0.08, lu, ly(3.1), face + 0.04, LAMP_NAVY, 0, 0.01);
          W.box(lk, lp, 0.07, 0.07, 0.5, lu, ly(3.2), face + 0.25, LAMP_NAVY, 0, 0.01);
          W.box(lk, lp, 0.26, 0.36, 0.26, lu, ly(2.8), face + 0.5, 0xffcf86, 0, 0.01, 0xffa038, 1.4);
          W.box(lk, lp, 0.32, 0.08, 0.32, lu, ly(3.02), face + 0.5, LAMP_NAVY, 0, 0.02);
          W.box(lk, lp, 0.32, 0.06, 0.32, lu, ly(2.6), face + 0.5, LAMP_NAVY, 0, 0.02);
          W.box(lk, lp, 0.1, 0.1, 0.1, lu, ly(3.12), face + 0.5, PAL.gold, Math.PI / 4, 0.01);
        }
        if (!stable && !inner && !hooded && !under) {
          // The house banner over the door, above the floor-line course (clear of it and of the hood), so
          // the way in reads from across the court.
          const [bk, bp] = at(fade, doorH + 0.8), fg = new THREE.Group();
          if (ns) fg.position.set(uc, 0, (side === 'n' ? 0.5 : b.d - 0.5) + (face + 0.06) * W.out);
          else fg.position.set((side === 'w' ? 0.5 : b.w - 0.5) + (face + 0.06) * W.out, 0, uc);
          fg.rotation.y = side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
          bp.add(fg);
          // (A long banner from under the parapet's corbels down to just over the floor-line course, or
          // over the door's hood on a low building; none where there is no room for one.)
          const bwid = Math.min(1.4, dr.w * 0.6), btop = wallH >= 7 ? wallH - 0.75 : wallH - 0.35, bbot = wallH >= 7 ? Math.max(floorLine + 0.35, doorH + 0.75) : doorH + 0.75;
          const bh = btop - 0.07 - bbot - bwid * 0.6;
          if (bh > 0.8) livery(bk, fg, 0, btop, 0, bwid, bh);
        }
        // The leaves: a pair of boarded leaves in the stained oak closing the doorway from the sill to
        // the point of its arch, set a little back in the reveal with a clear gap round them to the
        // stone (never touching the jambs), a ring handle on each at the hero's hand. (On the camera
        // side they go with the wall when the hero is inside.)
        const [dk, dp] = fade ? [mk, mid] : [k, built], dg = new THREE.Group(), lo = face - 0.24;
        if (ns) dg.position.set(uc, 0.05, (side === 'n' ? 0.5 : b.d - 0.5) + lo * W.out);
        else dg.position.set((side === 'w' ? 0.5 : b.w - 0.5) + lo * W.out, 0.05, uc);
        dg.rotation.y = side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
        dp.add(dg);
        const leaves = archInset(dr.w, doorH - 0.05, rise, 0.09);
        pointedDoor(dk, dg, leaves.w, leaves.h, leaves.rise, 'building', true);
        continue;
      }
      if (!keep) piece(dr.w, wallH - 0.21, wallH + 0.03, WALL_T + 0.16, uc, 0, CAP);
      // (Not on the camera side: cut down with the wall they would read as stray planks.)
      if (!fade) for (const [hinge, dir] of [[u0, -1], [u1, 1]] as [number, number][]) {
        const leaf = dr.w / 2 - 0.1;
        piece(leaf, 0.08, dH - 0.1, 0.1, hinge + (dir * leaf) / 2, -(WALL_T / 2 + 0.07), keep ? DOOR_STAIN[1] : WOOD, 0.02);
      }
    }
    // Windows: glass in the middle of the wall (warm main lights, a sky-tinted top light), a stone
    // mullion and transom that read against the dark glass, a surround flush on both faces, a sill
    // ledge outside and (timber houses) shutters flat to the wall.
    for (const { wi, ww, wh, wy } of wins) {
      const top = wy + wh, tr = wy + wh * 0.66;
      const gm = !fade ? glass.still : wi.floor && multi ? glass.top : glass.mid;
      const [gk, gp] = at(fade, wy - 0.2);
      const MULL = timber ? TIMBER : STONE_L;
      if (keep) {
        // A castle lancet: the opening closes to a true pointed head (the stone of the wall fills its
        // upper corners right through), one plain pane of clear glass near the outer face, a ring of
        // the castle's dressed stone round the head and down the jambs, and a plain sill.
        W.shape(gk, gp, spandrels(ww, wh, WALL_T - 0.02), UPPER, wi.at, wy, 0);
        // (The glass near the outer face, so it shows across the opening from the side too, not lost
        // at the back of a deep reveal.)
        audit(W.shape(gk, gp, archPane(ww, wh, 0.04), 0, wi.at, wy, face - 0.12, gm), 'glass');
        // The lit room behind it, painted on a plate a little behind the glass that only looks out
        // (from inside the room the window is clear to the sky).
        const plate = new THREE.Mesh(roomPlate(ww, wh), gm === glass.still ? room.still : gm === glass.top ? room.top : room.mid);
        plate.name = 'room';
        plate.position.set(ns ? wi.at : (side === 'w' ? 0.5 : b.w - 0.5) + (face - 0.32) * W.out, wy, ns ? (side === 'n' ? 0.5 : b.d - 0.5) + (face - 0.32) * W.out : wi.at);
        plate.rotation.y = side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
        gp.add(plate);
        // (Its top a hair over the opening's floor, so the two never lie in one plane.)
        W.box(gk, gp, ww + 0.5, 0.14, 0.3, wi.at, wy - 0.06, face + 0.08, DRESS, 0, 0.02);
        archRing(gk, W.frame(gp, wi.at, face), 0, wy, 0, ww, wh, { n: 3, t: 0.26, p: 0.12, dep: 0.08, jamb: true });
        continue;
      }
      W.glass(gp, gm, ww, tr - wy, 0.04, wi.at, (wy + tr) / 2, 0);
      W.glass(gp, gm, ww, top - tr, 0.04, wi.at, (tr + top) / 2, 0);
      if (ww >= 1.05) W.box(gk, gp, 0.13, wh, 0.34, wi.at, wy + wh / 2, 0, MULL, 0, 0.02);
      W.box(gk, gp, ww, 0.12, 0.34, wi.at, tr, 0, MULL, 0, 0.02);
      for (const o of [1, -1]) {
        const off = o * face;
        for (const s of [-1, 1]) W.box(gk, gp, 0.18, wh + 0.2, 0.08, wi.at + s * (ww / 2 + 0.09), wy + (wh + 0.2) / 2, off, FRAME, 0, 0.02);
        W.box(gk, gp, ww + 0.36, 0.2, 0.08, wi.at, top + 0.1, off, FRAME, 0, 0.02);
        if (o > 0) W.box(gk, gp, ww + 0.4, 0.12, 0.26, wi.at, wy - 0.06, face + 0.07, FRAME, 0, 0.02);
        else W.box(gk, gp, ww + 0.36, 0.12, 0.08, wi.at, wy - 0.06, off, FRAME, 0, 0.02);
      }
      if (timber) for (const s of [-1, 1]) W.box(gk, gp, ww / 2, wh, 0.05, wi.at + s * (ww * 0.75 + 0.2), wy + wh / 2, face + 0.03, SHUTTER, 0, 0.01);
    }
    for (const o of cw) castleWindow(W, fade, o);
    // Stone buildings: buttresses on the outer face of long walls, between doors and windows.
    if (!timber && !keep && ns) {
      const busy = (p: number) => wins.some((o) => Math.abs(p - o.wi.at) < o.ww / 2 + 0.7) || b.doors.some((dr) => dr.side === side && p > dr.at - 0.8 && p < dr.at + dr.w + 0.8);
      for (let p = 3; p < w - 2.5; p += hall ? 4 : 5) {
        if (busy(p)) continue;
        piece(0.8, 0, wallH - 0.6, 0.5, p, WALL_T / 2 + 0.24, STONE_D, 0.05);
      }
    }
    if (keep) {
      // Pilasters between the window bays (every face long enough for bays): a broad lower stage up
      // to the floor line, a slimmer upper stage to the parapet, each with a weathered cap, so the
      // front reads as bays with depth rather than one flat box. A single tall storey takes its
      // string course and the pilasters' set-back at mid-height.
      // (Not on a wall built against the curtain: its face is behind the curtain's wall walk.)
      // (A building with buttresses takes them instead.)
      if (L >= 10 && !(b.backs ?? []).includes(side) && !joinedTo.has(side) && !look?.buttresses) {
        const open: [number, number][] = [...wins.map((o) => [o.wi.at - o.ww / 2 - 0.3, o.wi.at + o.ww / 2 + 0.3] as [number, number]), ...winSpans(side, 0, wallH)];
        for (const dr of b.doors.filter((x) => x.side === side)) open.push([dr.at - 1.7, dr.at + dr.w + 1.7]);
        open.push([-9, lo + 0.4], [hi - 0.4, L + 9]);
        open.sort((p1, p2) => p1[0] - p2[0]);
        // (Overlapping openings merge, so no pilaster ever stands inside a door or window.)
        for (let i = 0; i + 1 < open.length; i++) {
          if (open[i + 1][0] <= open[i][1]) {
            open[i] = [open[i][0], Math.max(open[i][1], open[i + 1][1])];
            open.splice(i + 1, 1);
            i--;
          }
        }
        for (let i = 0; i + 1 < open.length; i++) {
          const g0 = open[i][1], g1 = open[i + 1][0];
          if (g1 - g0 < 1.3) continue;
          const p = (g0 + g1) / 2;
          // Pilasters in the body stone, their set-offs in the dressed stone: the lower stage rising
          // from the base course, the set-off the floor line's course stepping out round it, the upper
          // stage up to the course that carries the parapet. (Each set a little into the wall, so its
          // chamfered back edge never opens a dark seam down the face.)
          // (The set-off's weathered top stands a little over the course it steps out round.)
          if (lined) {
            piece(1.0, BASE_COURSE, floorLine, 0.44, p, WALL_T / 2 + 0.14, ASHLAR_B, 0.05);
            piece(1.12, floorLine, floorLine + COURSE + 0.06, 0.5, p, WALL_T / 2 + 0.17, DRESS, 0.04);
            piece(0.74, floorLine + COURSE + 0.06, wallH - COURSE, 0.42, p, WALL_T / 2 + 0.13, ASHLAR_B, 0.04);
          } else piece(1.0, BASE_COURSE, wallH - COURSE, 0.44, p, WALL_T / 2 + 0.14, ASHLAR_B, 0.05);
        }
      }
      // The floor line: a string course outside, one course of the dressed stone a hand proud of the
      // face, and inside (on the walls that stay standing) the beam the upper floor's joists rest on.
      // (The north and south courses reach round the corners; the east and west ones butt into them.)
      // (It stops at a shared wall's line, where the neighbour's face runs on, and is broken where a door
      // or a window stands across it; none runs behind the walling against the curtain.)
      const c0 = ns ? (shared.has('w') ? 1 : -0.06) : 0.12, c1 = ns ? (shared.has('e') ? L - 1 : L + 0.06) : L - 0.12;
      if (lined && !joinedTo.has(side) && !look?.fill?.some((f) => f.side === side)) {
        const cuts = [
          ...b.doors.filter((dr) => dr.side === side && floorLine < doorH + DRESS_T).map((dr) => [dr.at - DRESS_T - 0.02, dr.at + dr.w + DRESS_T + 0.02] as [number, number]),
          ...winSpans(side, floorLine, floorLine + COURSE),
        ].sort((p1, p2) => p1[0] - p2[0]);
        let a = c0;
        for (const [ca, ce] of [...cuts, [c1, c1] as [number, number]]) {
          const e = Math.min(c1, ca);
          if (e - a > 0.3) piece(e - a, floorLine, floorLine + COURSE, 0.12, (a + e) / 2, face, DRESS);
          a = Math.max(a, ce);
        }
      }
      // (Not under a timber roof open to the hall; a loft's beams carry its boards.)
      if (!fade && !look?.roof) {
        // (The beams along the east and west walls stop against the north and south walls' beams.)
        // (The beams along the north and south walls run into the side walls to their middles, never out
        // through their outer faces.)
        const b0 = ns ? Math.max(lo, 0.5) : lo, b1 = ns ? Math.min(hi, L - 0.5) : hi, bl = ns ? b1 - b0 : hi - lo - 0.3;
        // (A hair under the course that carries the parapet where the floor is the roof's, never in its plane.)
        const by = look?.loft?.y ?? storeyH;
        W.box(k, built, bl, 0.3, 0.2, (b0 + b1) / 2, by - 0.36, -(face + 0.1), TIMBER, 0, 0.02);
        for (let t = lo + 0.8; t < hi - 0.5; t += 1.4) W.box(k, built, 0.26, 0.26, 0.24, t, by - 0.66, -(face + 0.12), ASHLAR_L, 0, 0.03);
      }
    }
  }
  // The castle's deep base course: one continuous band round the footprint, a hand proud of the walls
  // and a hair into the rooms (so it caps the walls where they are cut down to it), mitred at the
  // corners and broken only at the doorways (none along a wall it shares or joins, which stands inside
  // the range).
  if (keep) {
    // (Broken where a stall's half-door opens right down to the floor.)
    const stalls = (look?.windows ?? []).filter((o) => o.kind === 'stall').map((o) => ({ side: o.side, span: [o.u - o.w / 2 - 0.36, o.u + o.w / 2 + 0.36] as [number, number] }));
    // (And at the buttresses, which stand on the ground through it.)
    const props = (look?.buttresses ?? []).map((u) => ({ side: 's' as Side, span: [u - 0.55, u + 0.55] as [number, number] }));
    footBand(k, built, b, 0, BASE_COURSE, 0.3, S.base, 0.05, [...stalls, ...props]);
  }
  // Stone corners: quoins in alternating courses (the camera-side pair lift with the wall).
  if (!timber && !keep) {
    for (const [cx, cz] of [[0.5, 0.5], [w - 0.5, 0.5], [0.5, d - 0.5], [w - 0.5, d - 0.5]]) {
      const fade = cz > d / 2;
      for (let y = 0.34, i = 0; y < wallH - 0.3; y += 0.52, i++) {
        const [kk, pp] = at(fade, y + 0.25 > CUT_H ? CUT_H : 0);
        cb(kk, pp, i % 2 ? [1.12, 0.48, 1.0] : [1.0, 0.48, 1.12], [cx, y + 0.25, cz], i % 2 ? STONE_L : STONE_D, undefined, 0.04);
      }
    }
  }

  // ─── Interior walls ───────────────────────────────────────────────────────
  // A stone stub always stands on each floor (the room plan stays readable); above it the wall
  // and its door heads go with the cut. The ground floor's stubs hide with its rooms upstairs.
  for (const floor of (multi ? [0, 1] : [0]) as Floor[]) {
    // (A ground-floor partition stops a hair under the boards over it, never in their plane.)
    const base = floor ? storeyH : 0, top = floor ? wallH : look?.partitionTop ?? (multi ? storeyH - 0.02 : Math.min(storeyH, wallH));
    /** A doorway's head in an interior wall (under a low ceiling, its lintel the wall's top course). */
    const head = Math.min(2.9 * grow, top - base - 0.32);
    const [sk, sp]: [ModelKit, Obj] = floor ? [mk, mid] : [k, ground];
    const [hk, hp]: [ModelKit, Obj] = floor ? [fk, lifted] : [mk, mid];
    for (const pt of partitionsOf(b, floor)) {
      const alongX = pt.axis === 'x', c = pt.at + 0.5;
      const pbox = (kk: ModelKit, pp: Obj, a: number, e: number, y0: number, y1: number, dep: number, color: number, ch = 0.02) => {
        const len = e - a, m = (a + e) / 2, h = y1 - y0, y = base + (y0 + y1) / 2;
        if (alongX) cb(kk, pp, [len, h, dep], [m, y, c], color, undefined, ch);
        else cb(kk, pp, [dep, h, len], [c, y, m], color, undefined, ch);
      };
      if (pt.screen) {
        screen(pt, pbox, [sk, sp], [hk, hp]);
        continue;
      }
      const T = WALL_T * 0.8;
      for (const [a0, e0] of partitionRuns(pt)) {
        // Runs reach into the outer walls and neighbouring partitions (no light gaps at the joints);
        // the capping course, as wide as the walls' own, stops at their faces.
        const a = a0 - 0.08, e = e0 + 0.08;
        pbox(sk, sp, a, e, 0, 0.3, T + 0.1, S.line, 0.03);
        pbox(sk, sp, a, e, 0.3, CUT_H - 0.1, T, S.foot);
        pbox(sk, sp, a0, e0, CUT_H - 0.12, CUT_H, T + 0.08, S.course, 0.03);
        pbox(hk, hp, a, e, CUT_H, top - base, T, keep ? PLASTER : UPPER);
      }
      for (const [da, dw] of pt.doors ?? []) {
        for (const j of [da + 0.1, da + dw - 0.1]) {
          pbox(sk, sp, j - 0.12, j + 0.12, 0, CUT_H, T + 0.14, FRAME, 0.03);
          pbox(hk, hp, j - 0.12, j + 0.12, CUT_H, head, T + 0.14, FRAME, 0.03);
        }
        pbox(hk, hp, da - 0.2, da + dw + 0.2, head, head + 0.3, T + 0.16, FRAME, 0.03);
        // (A hair inside the door's width, so its ends never lie in the plane of the boards' edges.)
        if (top - base > head + 0.4) pbox(hk, hp, da + 0.01, da + dw - 0.01, head + 0.3, top - base, T, keep ? PLASTER : UPPER);
      }
    }
  }

  // ─── The upper floor's boards ───────────────────────────────────────────────
  if (multi) {
    // Oak boards on the joists, wall to wall, row by row, leaving the voids (a hall open to its
    // roof) and the stairwells open; a balustrade runs round every opening.
    const y = storeyH - 0.15;
    // (A gallery open over the room below stays standing while the hero is under it.)
    const [gk, gp]: [ModelKit, Obj] = look?.gallery ? [k, built] : [uk, mid];
    const open = (lx: number, lz: number) => isVoid(b, lx, lz) || (b.stairs ?? []).some((st) => stairParts(st).some((r) => inRect(r, lx, lz)));
    for (let lz = 1; lz < d - 1; lz++) {
      let a = -1;
      for (let lx = 1; lx <= w - 1; lx++) {
        const solid = lx < w - 1 && !open(lx, lz);
        if (solid && a < 0) a = lx;
        if (!solid && a >= 0) {
          const x0 = a === 1 ? 0.95 : a, x1 = lx === w - 1 ? w - 0.95 : lx, z0 = lz === 1 ? 0.95 : lz, z1 = lz === d - 2 ? d - 0.95 : lz + 1;
          cb(gk, gp, [x1 - x0, 0.3, z1 - z0], [(x0 + x1) / 2, y, (z0 + z1) / 2], PLANKS[1], undefined, 0.01);
          a = -1;
        }
      }
    }
    // Balustrade: a rail on posts along each edge between boards and an opening.
    for (let lz = 1; lz < d - 1; lz++) for (let lx = 1; lx < w - 1; lx++) {
      if (open(lx, lz)) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = lx + dx, nz = lz + dz;
        if (nx < 1 || nz < 1 || nx > w - 2 || nz > d - 2 || !open(nx, nz) || headOf(nx, nz)) continue;
        const ex = lx + 0.5 + dx * 0.45, ez = lz + 0.5 + dz * 0.45, along = dz !== 0;
        // (At an outer corner of the boards, where a rail along x turns the corner, the rail along z
        // stops at its inner face, so the two never lie in each other.)
        const turn = (sz: number) => (!along && lz + sz >= 1 && lz + sz <= d - 2 && open(lx, lz + sz) && !headOf(lx, lz + sz) ? 0.12 : 0);
        const z0 = -0.5 + turn(-1), z1 = 0.5 - turn(1);
        const rail = 0.95 * grow;
        cb(gk, gp, along ? [1.0, 0.1, 0.12] : [0.12, 0.1, z1 - z0], [ex, storeyH + rail, ez + (along ? 0 : (z0 + z1) / 2)], WOOD_D, undefined, 0.02);
        cb(gk, gp, [0.12, rail, 0.12], [ex - (along ? 0.45 : 0), storeyH + rail / 2, ez - (along ? 0 : 0.45)], WOOD_D, undefined, 0.02);
        if (look?.gallery) {
          // A gallery's front: oak panels between the posts, and a deep beam under its edge.
          const zc = ez + (along ? 0 : (z0 + z1) / 2);
          cb(gk, gp, along ? [1.0, rail - 0.23, 0.05] : [0.05, rail - 0.23, z1 - z0], [ex, storeyH + (rail - 0.03) / 2, zc], PLANKS[0], undefined, 0.01);
          cb(gk, gp, along ? [1.0, 0.38, 0.24] : [0.24, 0.38, z1 - z0], [ex - dx * 0.1, storeyH - 0.42, zc - dz * 0.1], TIMBER, undefined, 0.02);
        }
      }
    }
  }
  /** Is a cell on a stair's head row (where the stair comes up: no rail across it)? */
  function headOf(lx: number, lz: number) {
    return (b.stairs ?? []).some((st) => {
      const top = flightsOf(st).at(-1)!, [x0, z0, x1, z1] = stairRect(top);
      if (!inRect([x0, z0, x1, z1], lx, lz)) return false;
      return top.dir === 'n' ? lz === z0 : top.dir === 's' ? lz === z1 - 1 : top.dir === 'w' ? lx === x0 : lx === x1 - 1;
    });
  }

  /**
   * A window of the castle's window kit on a face (its wall already laid round the opening, holesOf):
   * every piece in a frame on the wall's outer face at the window's middle (x along the wall, z out),
   * the whole window going with the cut its sill stands in.
   */
  function castleWindow(W: WallFrame, fade: boolean, o: CastleWindow) {
    // (A window standing across the upper floor's cut on the camera side goes with the walls over the
    // cut, whose shader cuts it there, so from the upper floor it is cut with the wall round it.)
    const across = fade && o.sill < upCut && o.sill + o.h > upCut;
    // (One whose opening stands over the ground floor's cut goes with the walls over the cut, sill and
    // all, so none of its surround stands up out of the cut wall.)
    const [kk, pp]: [ModelKit, Obj] = across ? [fk, lifted] : at(fade, o.sill >= CUT_H - 0.05 ? Math.max(CUT_H, o.sill) : Math.max(0, o.sill - 0.2)), f = W.frame(pp, o.u, face);
    /** A pane of the castle's clear glass, set back in the reveal. */
    const pane = (x: number, y: number, z: number, pw: number, ph: number, alongZ = false) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.03 : pw, ph, alongZ ? pw : 0.03), glassMat(kk));
      m.position.set(x, y, z);
      f.add(m);
      audit(m, 'glass');
    };
    /**
     * A square-headed opening's dressed surround, laid on the walling's courses: up each jamb a dressed
     * block to every course, long and short by turns as a quoin is (`t` and `t` + JAMB_LONG on the
     * face), one lintel stone over the head up to the next course line, and a sill stone standing out
     * under it.
     */
    const surround = (t: number, hood: boolean) => {
      const { w: ow, h: oh, sill } = o, head = sill + oh;
      const lines = [sill];
      for (let y = Math.ceil(sill / COURSE + 0.1) * COURSE; y < head - 0.05; y += COURSE) lines.push(y);
      lines.push(head);
      for (let i = 0; i + 1 < lines.length; i++) {
        const y0 = lines[i], y1 = lines[i + 1], wide = t + (Math.floor(y0 / COURSE + 1e-6) % 2 ? JAMB_LONG : 0);
        // (Their inner faces a hair inside the opening, never in the plane of the walling's cut ends.)
        for (const s of [-1, 1]) cb(kk, f, [wide + 0.02, y1 - y0, 0.3], [s * (ow / 2 + wide / 2 - 0.01), (y0 + y1) / 2, -0.09], DRESS, undefined, 0.03);
      }
      const top = Math.ceil((head + 0.3) / COURSE - 1e-6) * COURSE, lw = ow + 2 * (t + JAMB_LONG);
      // (Its soffit a hair down into the opening and its top a hair under the course line, never in the
      // plane of the walling's over it or of an opening's floor standing on it.)
      audit(oneStone(cb(kk, f, [lw, top - head + 0.008, 0.3], [0, (head + top) / 2 - 0.016, -0.09], DRESS, undefined, 0.03)), 'lintel');
      cb(kk, f, [ow + 2 * t + 0.12, 0.14, 0.34], [0, sill - 0.07, 0.05], DRESS, undefined, 0.02);
      if (!hood) return;
      // A drip-stone over it, its ends dropping a little either side.
      const hw = lw / 2 + 0.1;
      cb(kk, f, [2 * hw + 0.16, 0.16, 0.22], [0, top + 0.08, 0.06], DRESS, undefined, 0.02);
      for (const s of [-1, 1]) cb(kk, f, [0.16, 0.42, 0.22], [s * hw, top - 0.13, 0.06], DRESS, undefined, 0.02);
    };
    switch (o.kind) {
      case 'lancet': {
        // A tall pointed light, and a hood mould over its head standing clear of its ring.
        glazedWindow(kk, f, 0, o.sill, 0, { w: o.w, h: o.h, T: WALL_T, stone: UPPER });
        const rise = pointedArch(o.w, o.h, 2).ah + 0.4;
        archRing(kk, f, 0, o.sill, 0, o.w + 0.8, o.h + 0.5, { n: 5, t: 0.16, p: 0.16, dep: 0.1, rise });
        return;
      }
      case 'pair': {
        // Two pointed lights side by side under one pointed hood, the wall's stone between their heads.
        for (const [u, lw] of lightsOf(o)) glazedWindow(kk, f, u - o.u, o.sill, 0, { w: lw, h: o.h, T: WALL_T, stone: UPPER });
        archRing(kk, f, 0, o.sill, 0, o.w + 1.1, o.h + 1.4, { n: 7, t: 0.16, p: 0.16, dep: 0.1 });
        return;
      }
      case 'square':
      case 'slit':
      case 'shuttered': {
        // A square-headed light (two, either side of a stone mullion, when it is wide).
        const t = o.kind === 'slit' ? 0.2 : 0.28, mull = o.w >= 1.4;
        surround(t, o.kind === 'square');
        if (mull) {
          cb(kk, f, [0.16, o.h, WALL_T - 0.1], [0, o.sill + o.h / 2, -face], DRESS, undefined, 0.02);
          for (const s of [-1, 1]) pane((s * (o.w / 2 + 0.08)) / 2, o.sill + o.h / 2, -0.2, o.w / 2 - 0.08, o.h);
        } else pane(0, o.sill + o.h / 2, -0.2, o.w, o.h);
        if (o.kind === 'shuttered') {
          // The shutters standing open flat against the wall either side: boarded oak, two iron straps.
          for (const s of [-1, 1]) {
            const sx = s * (o.w / 2 + t + JAMB_LONG + o.w / 4 + 0.04);
            for (let i = 0; i < 2; i++) cb(kk, f, [o.w / 4 - 0.01, o.h, 0.06], [sx + (i - 0.5) * (o.w / 4), o.sill + o.h / 2, 0.03], DOOR_STAIN[(i + (s > 0 ? 1 : 0)) % 3], undefined, 0.01);
            for (const y of [0.22, o.h - 0.22]) cb(kk, f, [o.w / 2 - 0.08, 0.06, 0.03], [sx, o.sill + y, 0.075], IRON, undefined, 0.005);
          }
        }
        return;
      }
      case 'rose': {
        // A round window over the door: seven round lights pierced in a plate of the dressed stone, the
        // glass behind them, a ring of voussoirs round it.
        const R = o.w / 2, cy = o.sill + R, { plate, fill } = rosePlate(o.w, WALL_T - 0.04);
        kk.mesh(f, plate, DRESS, [0, cy, -face]);
        kk.mesh(f, fill, UPPER, [0, cy, -face]);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.03, 32).rotateX(Math.PI / 2), glassMat(kk));
        disc.position.set(0, cy, -face - 0.12);
        f.add(disc);
        audit(disc, 'glass');
        const g = new THREE.Group();
        g.position.set(0, cy, 0);
        f.add(g);
        roseRing(kk, g, R, 0.34, 0.08, 16);
        return;
      }
      case 'oriel': {
        // A bay of lights standing out on corbels of the dressed stone stepping out from the wall: a
        // post at each corner and a mullion in its front, the glass between them, a cornice and a lead
        // roof sloping back to the wall.
        const D = 0.7, ow = o.w, y = o.sill, h = o.h, P = 0.18;
        // (Its corbelling one stone, tapering down into the wall over the door's arch.)
        kk.mesh(f, taper(0.7, 0.2, ow, D, 0.9, 0, (D - 0.2) / 2), DRESS, [0, y - 0.45, 0.1 - 0.01]);
        for (const s of [-1, 1]) {
          cb(kk, f, [P, h, P], [s * (ow / 2 - P / 2), y + h / 2, D - P / 2], DRESS, undefined, 0.02);
          cb(kk, f, [P, h, P], [s * (ow / 2 - P / 2), y + h / 2, P / 2], DRESS, undefined, 0.02);
          pane(s * (ow / 2 - P / 2), y + h / 2, D / 2, D - 2 * P, h, true);
          const a0 = P / 2, a1 = ow / 2 - P;
          pane((s * (a0 + a1)) / 2, y + h / 2, D - P / 2, a1 - a0, h);
        }
        cb(kk, f, [P, h, P], [0, y + h / 2, D - P / 2], DRESS, undefined, 0.02);
        cb(kk, f, [ow + 0.1, 0.16, D + 0.1], [0, y + h + 0.08, D / 2], DRESS, undefined, 0.02);
        kk.mesh(f, taper(ow + 0.1, D + 0.1, ow - 0.3, 0.12, 0.3, 0, -(D + 0.1 - 0.12) / 2), LEAD, [0, y + h + 0.31, D / 2]);
        return;
      }
      case 'stall': {
        // A stall's own door: a pointed opening right down to the floor in a ring of the dressed stone,
        // its boarded oak half-door shut in the reveal, the horse inside looking out over it.
        const rise = Math.min(o.w * 0.62, 1.7), [hk, hp] = at(fade, o.h - rise);
        W.shape(hk, hp, spandrels(o.w, o.h, WALL_T - 0.02, rise), UPPER, o.u, 0, 0);
        for (const st of archDressing(o.w, o.h, rise, { foot: 0, t: 0.36, inset: 0.02 })) {
          const [dk, dp] = at(fade, st.y);
          W.shape(dk, dp, st.geo, DRESS, o.u, 0, face, undefined, 0, true);
        }
        const [bk, bp] = at(fade, 0), df = W.frame(bp, o.u, face), n = 4, bw = (o.w - 0.04) / n;
        for (let i = 0; i < n; i++) cb(bk, df, [bw - 0.012, 1.22, 0.07], [-o.w / 2 + 0.02 + bw * (i + 0.5), 0.67, -0.24], DOOR_STAIN[i % 3], undefined, 0.01);
        cb(bk, df, [o.w - 0.02, 0.09, 0.15], [0, 1.32, -0.24], WOOD_D, undefined, 0.01);
        for (const yy of [0.32, 1.02]) cb(bk, df, [o.w - 0.2, 0.06, 0.03], [0, yy, -0.19], IRON, undefined, 0.005);
        cb(bk, df, [o.w, 0.06, WALL_T - 0.02], [0, 0.03, -face], DRESS, undefined, 0.01);
        return;
      }
      case 'loft': {
        // The hay loft's door, shut in its dressed frame, and over it the hoist's beam standing out
        // from under the parapet's course, its pulley, rope and hook.
        surround(0.22, false);
        for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
          cb(kk, f, [o.w / 4 - 0.012, o.h - 0.02, 0.07], [s * (o.w / 4) + (i - 0.5) * (o.w / 4), o.sill + o.h / 2, -0.04], DOOR_STAIN[(i + (s > 0 ? 1 : 0)) % 3], undefined, 0.01);
        }
        for (const s of [-1, 1]) for (const yy of [0.3, o.h - 0.3]) cb(kk, f, [o.w / 2 - 0.12, 0.06, 0.03], [s * (o.w / 4), o.sill + yy, 0.005], IRON, undefined, 0.005);
        const by = o.sill + o.h + 0.5;
        cb(kk, f, [0.24, 0.24, 1.7], [0, by, 0.45], TIMBER, undefined, 0.02);
        kk.cyl(f, 0.14, 0.14, 0.1, [0, by - 0.22, 1.12], IRON, [0, 0, Math.PI / 2], 10);
        cb(kk, f, [0.03, 1.1, 0.03], [0, by - 0.82, 1.18], 0xb89a6a, undefined, 0.005);
        cb(kk, f, [0.06, 0.2, 0.12], [0, by - 1.44, 1.18], IRON, undefined, 0.01);
        return;
      }
    }
  }

  // ─── Stairs ───────────────────────────────────────────────────────────────
  for (const st of b.stairs ?? []) {
    const steps = stairSteps(st, storeyH);
    for (const s of steps) flight(ik, ground, s);
    // Each landing a solid block of the steps' stone, its top where its flight arrives.
    (st.turns ?? []).forEach((t, i) => {
      const [x0, z0, x1, z1] = t.landing, top = steps[i + 1].y0;
      cb(ik, ground, [x1 - x0 - 0.1, top, z1 - z0 - 0.1], [(x0 + x1) / 2, top / 2, (z0 + z1) / 2], STONE_L, undefined, 0.02);
    });
  }

  // ─── The castle's look: what stands against and inside its walls ───────────
  if (look) {
    // The back walls walled up solid to the curtain's inner face under its walk, step by step up to
    // its corbels and its inner parapet: along a north wall from end to end (round the corner where
    // the side wall is filled too, to the line of a wall shared with the range's next building), along
    // a side wall between the north wall's face and the south front.
    const filled = (s: Side) => !!look.fill?.some((f) => f.side === s);
    for (const { side, steps } of look.fill ?? []) {
      const W = wallFrame(b, side), ns = side === 'n' || side === 's', L = sideLen(b, side);
      let y0 = 0;
      for (const st of steps) {
        const lo = ns ? (shared.has('w') ? 1 : filled('w') ? -st.out : 0) : filled('n') ? 0.05 : 0;
        const hi = ns ? (shared.has('e') ? L - 1 : filled('e') ? L + st.out : L) : L - 0.05;
        W.box(k, built, hi - lo, st.top - y0, st.out + 0.02, (lo + hi) / 2, (y0 + st.top) / 2, WALL_T / 2 + st.out / 2 - 0.01, UPPER, 0, 0.02);
        y0 = st.top;
      }
    }
    // A boarded ceiling over low rooms, and a loft's floor on its joists, a rail along its open edge.
    // (They go with the ground floor's cut, so the rooms under them open to the camera.)
    if (look.ceiling) {
      const [x0, z0, x1, z1] = look.ceiling.rect, y = look.ceiling.y;
      cb(uk, mid, [x1 - x0 - 0.02, 0.2, z1 - z0 - 0.02], [(x0 + x1) / 2, y + 0.1, (z0 + z1) / 2], PLANKS[0], undefined, 0.01);
    }
    if (look.loft) {
      const [x0, z0, x1, z1] = look.loft.rect, y = look.loft.y, zc = (z0 + z1) / 2;
      // (The boards' top a hair over the walls under them.)
      cb(uk, mid, [x1 - x0 - 0.02, 0.16, z1 - z0 - 0.02], [(x0 + x1) / 2, y, zc], PLANKS[1], undefined, 0.01);
      for (let x = x0 + 0.9; x < x1 - 0.5; x += 1.4) cb(uk, mid, [0.18, 0.22, z1 - z0 + 0.06], [x, y - 0.19, zc], TIMBER, undefined, 0.01);
      const edge = x0 > 1.01 ? x0 + 0.08 : x1 < w - 1.01 ? x1 - 0.08 : null;
      if (edge !== null) {
        cb(uk, mid, [0.1, 0.1, z1 - z0 - 0.04], [edge, y + 0.95 * grow, zc], WOOD_D, undefined, 0.02);
        for (let z = z0 + 0.3; z < z1 - 0.1; z += 1.0) cb(uk, mid, [0.1, 0.95 * grow - 0.03, 0.1], [edge, y + (0.95 * grow - 0.03) / 2, z], WOOD_D, undefined, 0.02);
      }
    }
    // Buttresses on the south front: a broad lower stage to the sill course, a weathered set-off, a
    // narrower stage, and a long weathering dying back into the wall under the eaves' corbels.
    const S2 = wallFrame(b, 's');
    for (const p of look.buttresses ?? []) {
      const top = wallH - 2 * COURSE - 0.75, mid1 = floorLine + COURSE;
      for (const [y0, y1, dep, wid] of [[0, mid1, 0.95, 1.1], [mid1 + COURSE, top, 0.6, 1.0]] as [number, number, number, number][]) {
        band(true, y0, y1, (kk, pp, a, e) => S2.box(kk, pp, wid, e - a, dep + 0.02, p, (a + e) / 2, WALL_T / 2 + dep / 2 - 0.01, UPPER, 0, 0.04));
      }
      for (const [y, d0, d1, wid, h] of [[mid1, 0.95, 0.6, 1.1, COURSE], [top, 0.6, 0.06, 1.0, 0.75]] as [number, number, number, number, number][]) {
        const [kk, pp] = at(true, y);
        kk.mesh(S2.frame(pp, p, face), taper(wid, d0, wid, d1, h, 0, -(d0 - d1) / 2), DRESS, [0, y + h / 2, d0 / 2 - 0.01]);
      }
    }
    // The porch's hood over the south door: a little gabled slate roof standing out on two corbels of
    // the dressed stone stepping out from the wall, a stone gable in front over an oak tie beam, the
    // lantern hung under it.
    const pdr = look.porch ? b.doors.find((x) => x.side === 's') : undefined;
    if (pdr) {
      const [kk, pp] = at(true, doorH), f = S2.frame(pp, pdr.at + pdr.w / 2, face), HW = 1.95 * grow, D = 1.35 * grow, y0 = doorH + 0.95, rise = 1.25 * grow;
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) cb(kk, f, [0.42, 0.3, 0.42 * (i + 1)], [sx * (HW - 0.25), y0 - 0.75 + 0.3 * i, 0.21 * (i + 1) - 0.02], DRESS, undefined, 0.03);
      cb(kk, f, [2 * HW, 0.18, 0.24], [0, y0 - 0.06, D - 0.12], TIMBER, undefined, 0.02);
      const A = Math.atan2(rise, HW), Ls = Math.hypot(HW + 0.12, rise + 0.09);
      for (const sx of [-1, 1]) cb(kk, f, [Ls, 0.16, D + 0.12], [sx * ((HW + 0.12) / 2 + 0.05), y0 + rise / 2 + 0.06, D / 2 + 0.04], SLATES, [0, 0, -sx * A], 0.03);
      cb(kk, f, [0.22, 0.22, D + 0.14], [0, y0 + rise + 0.15, D / 2 + 0.04], RIDGE_LEAD, [0, 0, Math.PI / 4], 0.02);
      kk.mesh(f, wedge(0.28, rise, 2 * HW - 0.3), UPPER, [0, y0 + rise / 2 - 0.02, D - 0.16], [0, Math.PI / 2, 0]);
      for (const sx of [-1, 1]) cb(kk, f, [Math.hypot(HW, rise) - 0.1, 0.16, 0.36], [(sx * HW) / 2, y0 + rise / 2 + 0.17, D - 0.14], DRESS, [0, 0, -sx * A], 0.02);
      cb(kk, f, [0.26, 0.26, 0.4], [0, y0 + rise + 0.18, D - 0.14], DRESS, undefined, 0.03);
      hangingLamp(kk, f, 0, y0 - 0.15, D - 0.12);
    }
    // Under a timber roof open to the room: oak wall posts on stone corbels against the back wall, a
    // brace from each to the wall plate along its top (the roof's trusses spring from them).
    if (look.roof) {
      const lo = shared.has('w') ? 1 : 0.95, hi = shared.has('e') ? w - 1 : w - 0.95, zf = 0.95;
      cb(k, built, [hi - lo - 0.02, 0.3, 0.32], [(lo + hi) / 2, wallH - 0.15, zf + 0.16], TIMBER, undefined, 0.02);
      const n = Math.max(2, Math.round((hi - lo - 2) / 3.4));
      for (let i = 0; i <= n; i++) {
        const x = lo + 1 + ((hi - lo - 2) * i) / n, yc = wallH - 4.2;
        cb(k, built, [0.5, 0.42, 0.44], [x, yc - 0.21, zf + 0.21], ASHLAR_L, undefined, 0.03);
        cb(k, built, [0.3, wallH - yc - 0.3, 0.26], [x, (yc + wallH - 0.3) / 2, zf + 0.13], TIMBER, undefined, 0.02);
        cb(k, built, [0.22, 1.6, 0.22], [x, wallH - 1.0, zf + 0.42], TIMBER, [0.55, 0, 0], 0.02);
      }
    }
  }

  // ─── Roof ─────────────────────────────────────────────────────────────────
  let roofTop: number;
  if (look?.roof) {
    // The steep slate roof (rangeParts.ts): a gable of its own over a lower neighbour, a lead flashing
    // where it runs in under a taller one (the keep); the south eaves on a corbelled cornice, the north
    // slope into its gutter behind the back parapet over the wall walk; the lantern or the flèche.
    const R = look.roof, gw = over('w') !== undefined, ge = over('e') !== undefined, finial = R.fleche ? ('cross' as const) : ('ball' as const);
    const x0 = shared.has('w') ? (gw ? 0.92 : 0.97) : 0.92, x1 = shared.has('e') ? (ge ? w - 0.92 : w - 0.97) : w - 0.92;
    const P = slateRoof(fk, lifted, {
      w, d, eave: wallH, ridge: R.ridge, x0, x1,
      gables: [...(gw || !shared.has('w') ? [{ x: 0.5, finial }] : []), ...(ge || !shared.has('e') ? [{ x: w - 0.5, finial }] : [])],
      flashed: [...(shared.has('w') && !gw ? [1] : []), ...(shared.has('e') && !ge ? [w - 1] : [])],
    });
    // The cornice under the south eaves: a course of the dressed stone standing out over corbels.
    const c0 = shared.has('w') && !gw ? 1 : 0, c1 = shared.has('e') && !ge ? w - 1 : w, z = d - 0.05;
    cb(fk, lifted, [c1 - c0, COURSE, 0.47], [(c0 + c1) / 2, wallH - COURSE / 2, z + 0.215], DRESS, undefined, 0.03);
    for (const u of spread(c1 - c0 - 0.6, 0.9, 0)) cb(fk, lifted, [0.34, COURSE, 0.3], [(c0 + c1) / 2 + u, wallH - 1.5 * COURSE, z + 0.13], ASHLAR_B, undefined, 0.03);
    // The back parapet over the wall walk, its coping, and the lead gutter behind it.
    const p0 = gw ? 0.95 : x0 + 0.03, p1 = ge ? w - 0.95 : x1 - 0.03;
    cb(fk, lifted, [p1 - p0, BACK_PARAPET, 0.5], [(p0 + p1) / 2, wallH + BACK_PARAPET / 2, 0.3], ASHLAR_B, undefined, 0.03);
    cb(fk, lifted, [p1 - p0, 0.12, 0.62], [(p0 + p1) / 2, wallH + BACK_PARAPET + 0.06, 0.3], DRESS, undefined, 0.02);
    cb(fk, lifted, [p1 - p0, 0.14, 0.42], [(p0 + p1) / 2, wallH + 0.07, 0.76], LEAD, undefined, 0.02);
    if (R.lantern) lantern(fk, lifted, R.lantern.u, P, R.lantern.tip);
    if (R.fleche) fleche(fk, lifted, R.fleche.u, P, R.fleche.tip);
    roofTop = Math.max(R.ridge, R.lantern?.tip ?? 0, R.fleche?.tip ?? 0);
  } else roofTop = roof(fk, lifted, b, UPPER);

  // ─── Exterior dressing (signs, emblems, chimneys) ─────────────────────────
  const front = b.doors.find((x) => x.side === 's');
  switch (b.interior) {
    case 'smelter': {
      // A brick stack over the furnace, glowing at the top.
      const f = b.fits?.find((x) => x.kind === 'furnace_spot');
      const x = f?.x ?? w / 2, z = (f?.z ?? 2) + 0.2;
      cb(fk, lifted, [1.3, roofTop - wallH + 1.6, 1.2], [x, (wallH + roofTop + 1.6) / 2, z], BRICK, undefined, 0.04);
      cb(fk, lifted, [1.55, 0.3, 1.45], [x, roofTop + 1.65, z], STONE_D, undefined, 0.04);
      fk.box(lifted, [0.8, 0.06, 0.7], [x, roofTop + 1.82, z], 0x2a0c04, undefined, 0xff5a1a, 0.9);
      break;
    }
    case 'keep': {
      // The castle's buildings: a chimney stack over every hearth, rising through the roof from the
      // wall the hearth backs onto, and a louver on the ridge over an open hearth.
      const stacks: [number, number][] = [];
      for (const f of [...(b.fits ?? []), ...(b.upper?.fits ?? [])]) {
        if (f.kind === 'open_hearth') {
          // (Under a slate roof the lantern on its ridge lets the smoke out.)
          if (look?.roof) continue;
          // A square stone louvre on the leads over the hearth: dark openings crossed by stone slats,
          // a dressed cornice (on a course line) and a blue-slate cap with a gilt finial.
          cb(fk, lifted, [1.8, 1.3, 1.8], [f.x, wallH + 0.85, f.z], ASHLAR_B, undefined, 0.04);
          for (const [dx, dz] of [[0.91, 0], [-0.91, 0], [0, 0.91], [0, -0.91]]) {
            fk.box(lifted, [dz ? 0.8 : 0.04, 0.6, dz ? 0.04 : 0.8], [f.x + dx, wallH + 1.0, f.z + dz], 0x2e323a);
            for (const y of [0.82, 1.0, 1.18]) fk.box(lifted, [dz ? 0.8 : 0.06, 0.05, dz ? 0.06 : 0.8], [f.x + dx * 1.02, wallH + y, f.z + dz * 1.02], DRESS, dz ? [0.5, 0, 0] : [0, 0, 0.5]);
          }
          cb(fk, lifted, [2.1, 0.24, 2.1], [f.x, wallH + 1.62, f.z], DRESS, undefined, 0.03);
          spire(fk, lifted, f.x, wallH + 1.74, f.z, 1.0, 1.3, 4);
          continue;
        }
        if (f.kind !== 'fireplace' && f.kind !== 'hearth_oven') continue;
        // The hearth faces `rot` (0 = +Z): its stack rises from the wall at its back (an outer wall, or
        // an interior one), one stack to each hearth's flue (an upper hearth over a lower one shares it).
        const r = f.rot ?? 0;
        let x = f.x - Math.sin(r) * 0.95, z = f.z - Math.cos(r) * 0.95;
        if (x < 1.5) x = 0.9;
        else if (x > w - 1.5) x = w - 0.9;
        if (z < 1.5) z = 0.9;
        else if (z > d - 1.5) z = d - 0.9;
        if (stacks.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.6)) continue;
        stacks.push([x, z]);
        const top = roofTop + 1.4;
        cb(fk, lifted, [1.5, top - wallH, 1.5], [x, (wallH + top) / 2, z], ASHLAR_B, undefined, 0.05);
        cb(fk, lifted, [1.8, 0.3, 1.8], [x, top + 0.1, z], DRESS, undefined, 0.04);
        chimneyPots(fk, lifted, x, top + 0.25, z);
      }
      break;
    }
    case 'hall': {
      // The hearth's chimney rises through the back slope.
      cb(fk, lifted, [2.2, roofTop - wallH + 1.2, 1.4], [w / 2, (wallH + roofTop + 1.2) / 2, 0.8], STONE, undefined, 0.05);
      cb(fk, lifted, [2.5, 0.35, 1.7], [w / 2, roofTop + 1.3, 0.8], STONE_D, undefined, 0.04);
      break;
    }
  }
  // Hanging sign beside the front door (the shop and the smelter say what they are).
  const signs: Partial<Record<string, number>> = { shop: PAL.gold, smelter: 0xff7a30, alchemy: PLOT_MARK.alchemy_lab, rune: PLOT_MARK.rune_altar, hatchery: PLOT_MARK.hatchery };
  const signCol = signs[b.interior];
  if (signCol !== undefined && front) {
    const x = front.at + front.w + 0.9, z = d - 0.5 + WALL_T / 2;
    fk.box(lifted, [0.07, 0.07, 0.9], [x, 2.75, z + 0.42], IRON);
    cb(fk, lifted, [0.95, 0.66, 0.08], [x, 2.3, z + 0.82], 0x3a2a1e, undefined, 0.02);
    fk.mesh(lifted, octagon(0.22, 0.06), signCol, [x, 2.3, z + 0.88], [0, Math.PI / 2, 0], signCol, 0.6);
  }

  // ─── Furnishings ──────────────────────────────────────────────────────────
  for (const floor of (multi ? [0, 1] : [0]) as Floor[]) {
    for (const f of fitsOf(b, floor)) {
      const fg = new THREE.Group();
      fg.userData.furnishing = true;
      // (On a raised part of the floor, a dais, it stands on the platform.)
      fg.position.set(f.x, floor ? storeyH : raisedAt(b, b.x + Math.floor(f.x), b.z + Math.floor(f.z)), f.z);
      fg.rotation.y = f.rot ?? 0;
      if (f.s) fg.scale.setScalar(f.s);
      const gallery = floor && look?.gallery;
      (gallery ? built : floor ? mid : ground).add(fg);
      const res = FITS[f.kind]?.(gallery ? k : floor ? uk : ik, fg, f, b, floor);
      if (res?.tick) ticks.push(res.tick);
      if (res?.light) lamp = res.light;
      // Ruined plots show a heap of fallen stone where the furniture will stand.
      // (Small pieces get a single block, so a well-furnished plot doesn't turn into a rock field.)
      if (b.restore && f.block) {
        const n = f.block[0] * f.block[1] < 0.3 ? 1 : 3;
        for (let i = 0; i < n; i++) chunk(k, ruin, Math.floor(f.x * 13 + f.z * 7) + i, [0.7, 0.45, 0.6], [f.x + (i - (n - 1) / 2) * 0.5, -0.05, f.z + ((i * 37) % 3 - 1) * 0.25], BLOCKS[i % 3], i);
      }
    }
  }

  // ─── Ruin (restorable plots) ──────────────────────────────────────────────
  if (b.restore) buildRuin(k, ruin, b);

  // ─── Materials ────────────────────────────────────────────────────────────
  // The castle's buildings are laid on one block grid fixed in the world (whole stones of STONE_LEN from
  // a line a tenth in from every whole stone's length), so every face, band and top of a building and of its
  // neighbours shares its joints; a building whole metres long turns each outer corner on a quoin.
  if (keep) {
    const wrap = (v: number) => v - Math.floor(v / STONE_LEN) * STONE_LEN;
    g.userData.masonGrid = { ox: wrap(0.5 - WALL_T / 2 - b.x), oz: wrap(0.5 - WALL_T / 2 - b.z), l: STONE_LEN } satisfies MasonGrid;
  }
  finishProp(g, [k, mk, fk, ik, uk]);
  for (const m of [...ik.mats, ...uk.mats]) m.userData.noOcclude = true;
  for (const m of [...mk.mats, ...uk.mats]) cutPatch(m, uMid);
  for (const m of fk.mats) cutPatch(m, uTop);
  // (The window kit's glass has its own materials: cut with the band it stands in.)
  for (const [grp, u] of [[mid, uMid], [lifted, uTop]] as const) grp.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name === 'glass') cutPatch(o.material as THREE.Material, u);
  });

  // The cut sweeps down from above the spires to the course of the floor the hero stands on.
  const TOP = roofTop + 8;
  const wipe = (c: number, base: number) => (c <= 0.0001 ? OFF : baseY + base + (TOP - base) * (1 - c) * (1 - c));
  let cutV = 0, floorV: Floor = 0, restored = !b.restore;
  const shadows = (grp: Obj, on: boolean) => grp.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = on && !(o.material as THREE.Material).userData.decal;
  });
  const apply = () => {
    const c0 = floorV ? 0 : cutV;
    uMid.value = wipe(c0, CUT_H);
    uTop.value = wipe(cutV, floorV ? upCut : CUT_H);
    built.visible = restored;
    ruin.visible = !restored;
    ground.visible = !(floorV && cutV > 0) || !!b.upper?.voids?.length;
    mid.visible = restored && c0 < 0.999;
    lifted.visible = restored && cutV < 0.999;
    shadows(mid, c0 < 0.001);
    shadows(lifted, cutV < 0.001);
  };
  apply();
  return {
    obj: g,
    spec: b,
    light: lamp,
    tick: ticks.length ? (t) => ticks.forEach((f) => f(t)) : undefined,
    setState: (s) => {
      restored = !b.restore || s === 'restored';
      apply();
    },
    setCut: (v, floor = 0) => {
      const nv = Math.max(0, Math.min(1, v)), nf: Floor = multi ? floor : 0;
      if (nv === cutV && nf === floorV) return;
      cutV = nv;
      floorV = nf;
      apply();
    },
    contains: (x, z) => inRoom(b, x, z),
  };
}

/**
 * The hall's screens: a panelled oak screen across the low end (an open-work upper stage on posts
 * under a moulded cornice), with a wide opening on the hall's axis. Its dado is the stub that
 * stays when the hero is inside.
 */
function screen(
  pt: { from: number; to: number; doors?: [number, number][] },
  pbox: (kk: ModelKit, pp: Obj, a: number, e: number, y0: number, y1: number, dep: number, color: number, ch?: number) => void,
  [sk, sp]: [ModelKit, Obj], [hk, hp]: [ModelKit, Obj],
) {
  const H = 3.5;
  for (const [a0, e0] of partitionRuns(pt as Parameters<typeof partitionRuns>[0])) {
    const a = a0 - 0.05, e = e0 + 0.05;
    pbox(sk, sp, a, e, 0, 0.2, 0.36, TIMBER, 0.02);
    pbox(sk, sp, a, e, 0.2, CUT_H - 0.1, 0.22, WOOD_D, 0.02);
    pbox(sk, sp, a, e, CUT_H - 0.12, CUT_H, 0.32, TIMBER, 0.02);
    // Upper stage: plain panels to shoulder height, open above, posts every bay.
    pbox(hk, hp, a, e, CUT_H, 2.3, 0.18, WOOD_D, 0.02);
    pbox(hk, hp, a, e, 2.3, 2.42, 0.28, TIMBER, 0.02);
    const n = Math.max(1, Math.round((e0 - a0) / 1.25));
    for (let i = 0; i <= n; i++) {
      const p = a0 + ((e0 - a0) * i) / n;
      pbox(sk, sp, p - 0.11, p + 0.11, 0, CUT_H, 0.3, TIMBER, 0.02);
      pbox(hk, hp, p - 0.11, p + 0.11, CUT_H, H, 0.3, TIMBER, 0.02);
    }
    pbox(hk, hp, a, e, H - 0.05, H + 0.25, 0.42, TIMBER, 0.03);
  }
  // Over the opening: the cornice carries across on a deep beam, between the stretches either side.
  for (const [da, dw] of pt.doors ?? []) {
    pbox(hk, hp, da + 0.05, da + dw - 0.05, H - 0.45, H + 0.25, 0.42, TIMBER, 0.03);
  }
}

/** Emblem on each building's front gable. */
const PEDIMENT: Partial<Record<string, number>> = { bank: PAL.gold, shop: PAL.gold, hall: PAL.gold, smelter: 0xff7a30, alchemy: PLOT_MARK.alchemy_lab };

/** Gable roof (ridge along the longer side) or a flat crenellated deck. Returns the ridge height. */
function roof(fk: ModelKit, p: Obj, b: BuildingSpec, gableCol: number): number {
  const { w, d, wallH } = b;
  if (b.style === 'keep') return keepRoof(fk, p, b);
  if (b.roofKind === 'flat') {
    cb(fk, p, [w - 0.2, 0.3, d - 0.2], [w / 2, wallH + 0.1, d / 2], STONE_D, undefined, 0.04);
    fk.box(p, [w - 1.6, 0.06, d - 1.6], [w / 2, wallH + 0.27, d / 2], 0x4e4a44);
    for (const [len, x, z, rot] of [[w, w / 2, 0.45, 0], [w, w / 2, d - 0.45, 0], [d - 1.8, 0.45, d / 2, Math.PI / 2], [d - 1.8, w - 0.45, d / 2, Math.PI / 2]] as [number, number, number, number][]) {
      cb(fk, p, [len, 0.45, 0.7], [x, wallH + 0.45, z], STONE, [0, rot, 0], 0.04);
      for (let t = -len / 2 + 0.5; t < len / 2 - 0.2; t += 1.3) {
        cb(fk, p, [0.66, 0.55, 0.6], [x + Math.cos(rot) * t, wallH + 0.95, z - Math.sin(rot) * t], STONE_L, [0, rot, 0], 0.04);
      }
    }
    return wallH + 1.2;
  }
  const alongX = w >= d;
  const span = alongX ? d : w, length = alongX ? w : d;
  const H = span / 2, ov = 0.55;
  const rise = Math.min(H * 0.72, 5.4), a = Math.atan2(rise, H);
  const run = H + ov, sl = run / Math.cos(a) + 0.1, th = 0.26;
  const col = b.roof;
  // A cross gable over the front (south) door: the main slope's eave is cut away under it.
  const front = b.doors.find((x) => x.side === 's');
  const cross = alongX && front ? { uc: front.at + front.w / 2, hw: front.w / 2 + 1.2 } : null;
  const EAVE = 0x3a3230;
  // A strip of the slope between horizontal distances h0..h1 from the ridge, from x0 to x1.
  const slabX = (sgn: number, h0: number, h1: number, x0: number, x1: number) => {
    const hm = (h0 + h1) / 2, y = wallH + rise - hm * Math.tan(a) + th / 2 / Math.cos(a);
    cb(fk, p, [x1 - x0, th, (h1 - h0) / Math.cos(a) + 0.02], [(x0 + x1) / 2, y, d / 2 + sgn * hm], col, [sgn * a, 0, 0], 0.04);
  };
  const eaveX = (sgn: number, x0: number, x1: number) => {
    const ey = wallH - ov * Math.tan(a) + 0.2, eo = run - 0.25;
    cb(fk, p, [x1 - x0, 0.12, 0.5], [(x0 + x1) / 2, ey, d / 2 + sgn * eo], EAVE, [sgn * a, 0, 0], 0.03);
  };
  for (const sgn of [-1, 1]) {
    if (alongX) {
      if (sgn > 0 && cross) {
        const g0 = cross.uc - cross.hw + 0.2, g1 = cross.uc + cross.hw - 0.2, hs = H - 0.6;
        slabX(sgn, 0, hs, -ov, w + ov);
        slabX(sgn, hs, run, -ov, g0);
        slabX(sgn, hs, run, g1, w + ov);
        eaveX(sgn, -ov - 0.02, g0);
        eaveX(sgn, g1, w + ov + 0.02);
      } else {
        slabX(sgn, 0, run, -ov, w + ov);
        eaveX(sgn, -ov - 0.02, w + ov + 0.02);
      }
      continue;
    }
    // Slab centre: halfway down the slope from the ridge, lifted by half its thickness.
    const y = wallH + rise - (run / 2) * Math.tan(a) + th / 2 / Math.cos(a);
    cb(fk, p, [sl, th, length + 2 * ov], [w / 2 + (sgn * run) / 2, y, d / 2], col, [0, 0, -sgn * a], 0.04);
    const ey = wallH - ov * Math.tan(a) + 0.2, eo = run - 0.25;
    cb(fk, p, [0.5, 0.12, length + 2 * ov + 0.04], [w / 2 + sgn * eo, ey, d / 2], EAVE, [0, 0, -sgn * a], 0.03);
  }
  if (cross) {
    const { uc, hw } = cross;
    const rp = Math.min(hw * 0.85, rise - 0.4), ac = Math.atan2(rp, hw);
    const crun = hw + 0.35, csl = crun / Math.cos(ac) + 0.05;
    const zF = d + 0.45, zB = d - rp / Math.tan(a) - 0.3, zc = (zF + zB) / 2, Lc = zF - zB;
    for (const sgn of [-1, 1]) {
      const y = wallH + rp - (crun / 2) * Math.tan(ac) + th / 2 / Math.cos(ac);
      cb(fk, p, [csl, th, Lc], [uc + (sgn * crun) / 2, y, zc], col, [0, 0, -sgn * ac], 0.04);
    }
    cb(fk, p, [0.3, 0.16, Lc + 0.05], [uc, wallH + rp + 0.12, zc], col, undefined, 0.04);
    // The pediment: the facade carried up into the gable.
    fk.mesh(p, wedge(WALL_T, rp, 2 * hw - 0.1), gableCol, [uc, wallH + rp / 2, d - 0.5], [0, Math.PI / 2, 0]);
    if (b.style === 'timber') {
      const zf = d - 0.5 + WALL_T / 2 + 0.04;
      cb(fk, p, [2 * hw - 0.1, 0.22, 0.12], [uc, wallH + 0.11, zf], TIMBER, undefined, 0.02);
      for (const e of [-1, 1]) cb(fk, p, [Math.hypot(hw, rp) + 0.1, 0.2, 0.12], [uc + (e * hw) / 2, wallH + rp / 2 + 0.05, zf], TIMBER, [0, 0, -e * ac], 0.02);
    }
    // What the building is, on the gable face (above the door, below the cross ridge).
    const mark = PEDIMENT[b.interior];
    if (mark !== undefined) {
      const y = wallH + rp * 0.42, z = d - 0.5 + WALL_T / 2;
      cb(fk, p, [1.25, 1.25, 0.16], [uc, y, z + 0.06], b.style === 'timber' ? TIMBER : b.style === 'hall' ? RUG : STONE_L, [0, 0, Math.PI / 4], 0.04);
      fk.mesh(p, octagon(0.52, 0.12), mark, [uc, y, z + 0.18], [0, Math.PI / 2, 0], mark, mark === PAL.gold ? 0.35 : 0.6);
      if (mark === PAL.gold) fk.mesh(p, octagon(0.32, 0.16), 0xc8962a, [uc, y, z + 0.2], [0, Math.PI / 2, 0], 0x4a2a00, 0.35);
    }
  }
  const ridgeY = wallH + rise + 0.16;
  if (alongX) cb(fk, p, [length + 2 * ov + 0.1, 0.3, 0.46], [w / 2, ridgeY, d / 2], 0x3a3230, undefined, 0.05);
  else cb(fk, p, [0.46, 0.3, length + 2 * ov + 0.1], [w / 2, ridgeY, d / 2], 0x3a3230, undefined, 0.05);
  // Gable ends filling the triangle between the eaves and the ridge (with a tie beam on timber).
  for (const e of [0.5, (alongX ? w : d) - 0.5]) {
    const pos: [number, number, number] = alongX ? [e, wallH + rise / 2, d / 2] : [w / 2, wallH + rise / 2, e];
    fk.mesh(p, wedge(WALL_T, rise, span - 0.1), gableCol, pos, alongX ? undefined : [0, Math.PI / 2, 0]);
    if (b.style === 'timber') {
      const out = e < 1 ? -1 : 1, o = out * (WALL_T / 2 + 0.03);
      const tpos: [number, number, number] = alongX ? [e + o, wallH + 0.12, d / 2] : [w / 2, wallH + 0.12, e + o];
      cb(fk, p, alongX ? [0.12, 0.22, span - 0.2] : [span - 0.2, 0.22, 0.12], tpos, TIMBER, undefined, 0.02);
      const kpos: [number, number, number] = alongX ? [e + o, wallH + rise * 0.42, d / 2] : [w / 2, wallH + rise * 0.42, e + o];
      cb(fk, p, alongX ? [0.12, rise * 0.8, 0.2] : [0.2, rise * 0.8, 0.12], kpos, TIMBER, undefined, 0.02);
    }
  }
  return wallH + rise;
}

/** Broken courses along the same wall runs (doorways stay open), fallen timbers and scaffolding. */
function buildRuin(k: ModelKit, p: Obj, b: BuildingSpec) {
  const { w, d } = b;
  let seed = b.id.length * 17;
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    if (b.shared?.includes(side)) continue;
    const ns = side === 'n' || side === 's';
    for (const [a0, e0] of wallRuns(b, side)) {
      const a = ns ? a0 : Math.max(1, a0), e = ns ? e0 : Math.min(d - 1, e0);
      if (e - a < 0.3) continue;
      const len = e - a, uc = (a + e) / 2;
      const x = ns ? uc : side === 'w' ? 0.5 : w - 0.5, z = ns ? (side === 'n' ? 0.5 : d - 0.5) : uc;
      const peak = side === 's' ? 1.2 : 2.4;
      const s0 = seed++;
      masonry(k, p, {
        x, z, rot: ns ? 0 : Math.PI / 2, len, y0: 0, rows: 6, rowH: 0.46, thick: WALL_T, seed: s0, shades: [STONE, STONE_L, STONE_D], unit: 1.1,
        top: (t) => 0.5 + peak * Math.max(0, Math.sin(((t + len / 2) / len) * Math.PI * (1.2 + (s0 % 3) * 0.4) + s0)) ** 2,
      });
    }
  }
  // Fallen blocks along the walls, a toppled beam and a builder's scaffold at one corner.
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10, side = i % 4;
    const x = side === 0 ? 1.4 + t * (w - 2.8) : side === 1 ? w - 1.5 : side === 2 ? 1.4 + (1 - t) * (w - 2.8) : 1.5;
    const z = side === 0 ? 1.5 : side === 1 ? 1.4 + t * (d - 2.8) : side === 2 ? d - 1.6 : 1.4 + (1 - t) * (d - 2.8);
    chunk(k, p, seed + 40 + i, [0.6, 0.4, 0.5], [x, -0.04, z], BLOCKS[i % 3], i);
  }
  cb(k, p, [0.24, 0.24, Math.min(w, d) * 0.7], [w * 0.55, 0.25, d * 0.5], WOOD_D, [0.12, 0.7, 0.08], 0.03);
  for (const [x, z] of [[w - 1.2, d - 0.1], [w + 0.4, d - 0.1], [w - 1.2, d - 2.4], [w + 0.4, d - 2.4]]) cb(k, p, [0.14, 3.2, 0.14], [x, 1.6, z], WOOD_L, undefined, 0.02);
  for (const y of [1.3, 2.8]) {
    cb(k, p, [1.9, 0.08, 0.5], [w - 0.4, y, d - 0.1], WOOD, undefined, 0.02);
    cb(k, p, [1.9, 0.08, 0.5], [w - 0.4, y, d - 2.4], WOOD, undefined, 0.02);
  }
}

/**
 * A course round a building's foot as one continuous band between heights y0 and y1: from `inset`
 * inside the walls' inner faces out `out` beyond their outer faces, mitred where two banded walls
 * meet, ending square on the line of a wall it shares or joins (that wall has no band: it stands
 * inside the range) or at the face of a wall built against the curtain (whose foot is the curtain's),
 * and broken at the doorways. Each stretch is its own stone part, laid along its own run.
 */
function footBand(k: ModelKit, p: Obj, b: BuildingSpec, y0: number, y1: number, out: number, color: number, inset = 0, gaps: { side: Side; span: [number, number] }[] = []) {
  const { w, d } = b, inner = new Set([...(b.shared ?? []), ...(b.joined ?? [])]), backs = new Set(b.backs ?? []), skip = new Set([...inner, ...backs]);
  const lo = -WALL_T / 2 - inset, hi = WALL_T / 2 + out;
  for (const side of ['n', 'e', 's', 'w'] as Side[]) {
    if (skip.has(side)) continue;
    const ns = side === 'n' || side === 's', L = ns ? w : d;
    // The neighbouring walls at this side's two ends (its u = 0 end and its u = L end).
    const ends = ns ? (['w', 'e'] as Side[]) : (['n', 's'] as Side[]);
    /**
     * Where the band's edge `n` out from the wall's centre line stops at an end (u from 0.5 in): mitred
     * round a banded corner, square on the line of a shared wall, square at the outer face of a wall
     * against the curtain.
     */
    const stop = (end: number, n: number) => (inner.has(ends[end]) ? 0 : backs.has(ends[end]) ? -WALL_T / 2 : -n);
    // (A castle door's base courses stop against the outside of its dressed surround.)
    const cuts = [...b.doors.filter((dr) => dr.side === side).map((dr) => [dr.at - DRESS_T, dr.at + dr.w + DRESS_T] as [number, number]), ...gaps.filter((q) => q.side === side).map((q) => q.span)].sort((p1, p2) => p1[0] - p2[0]);
    // Stretches between the ends and the doors: [u at the inner edge, u at the outer edge] at each end.
    let from: [number, number] = [0.5 + stop(0, lo), 0.5 + stop(0, hi)];
    const runs: [[number, number], [number, number]][] = [];
    for (const [a, e] of cuts) {
      runs.push([from, [a, a]]);
      from = [e, e];
    }
    runs.push([from, [L - 0.5 - stop(1, lo), L - 0.5 - stop(1, hi)]]);
    for (const [[ia, oa], [ie, oe]] of runs) {
      if (ie - ia < 0.02) continue;
      // Plan points (u along the side, n out from its centre line) to building cells (x, z).
      const at = (u: number, n: number): [number, number] => {
        if (side === 'n') return [u, 0.5 - n];
        if (side === 's') return [u, d - 0.5 + n];
        if (side === 'w') return [0.5 - n, u];
        return [w - 0.5 + n, u];
      };
      const quad = [at(ia, lo), at(ie, lo), at(oe, hi), at(oa, hi)];
      const shape = new THREE.Shape(quad.map(([x, z]) => new THREE.Vector2(x, -z)));
      // (Each stretch its own stone part, so its faces and its top are laid along its own run.)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, y0, 0);
      geo.computeVertexNormals();
      // (For the geometry audit: its stretches, mitred edge to edge, are one band.) Standing `out` beyond the
      // walls, its faces are laid from its own outer corner (x0, z0), whole metres less a tenth and `out`
      // twice apart: the north side's joints from that corner, the south's half a stone on, the west's
      // and the east's likewise along Z, so every corner of it turns on a quoin, long and short by turns.
      const m = k.mesh(p, geo, color, [0, 0, 0]);
      m.userData.audit = { band: 'foot' };
      const c0 = 0.5 - hi;
      m.userData.gridFrom = ns ? { ox: c0 + (side === 's' ? 0.5 : 0) } : { oz: c0 + (side === 'e' ? 0.5 : 0) };
    }
  }
}

/**
 * One flight of a stair: solid stone steps from the height it climbs from (`y0`: the floor, or the
 * landing before it), climbing toward its `dir`, with a pale nosing on each tread.
 */
function flight(k: ModelKit, g: Obj, { flight: st, risers: n, riser, y0 }: FlightSteps) {
  const [x0, z0, x1, z1] = stairRect(st), alongZ = st.dir === 'n' || st.dir === 's';
  const L = alongZ ? z1 - z0 : x1 - x0, W = alongZ ? x1 - x0 : z1 - z0;
  const up = st.dir === 's' || st.dir === 'e' ? 1 : -1, start = up > 0 ? (alongZ ? z0 : x0) : alongZ ? z1 : x1;
  const t = L / n, cw = alongZ ? (x0 + x1) / 2 : (z0 + z1) / 2;
  for (let i = 0; i < n; i++) {
    const top = y0 + (i + 1) * riser, u = start + up * (i + 0.5) * t;
    const [px, pz] = alongZ ? [cw, u] : [u, cw];
    cb(k, g, alongZ ? [W - 0.1, top, t + 0.01] : [t + 0.01, top, W - 0.1], [px, top / 2, pz], i % 2 ? STONE : STONE_L, undefined, 0.02);
    const nose = start + up * i * t + up * 0.04;
    // (The nosing's top a hair over the tread's, never in its plane.)
    cb(k, g, alongZ ? [W - 0.06, 0.06, 0.1] : [0.1, 0.06, W - 0.06], alongZ ? [cw, top - 0.02, nose] : [nose, top - 0.02, cw], STONE_D, undefined, 0.01);
  }
}

/** Is local cell (lx, lz) inside a rectangle [x0, z0, x1, z1)? */
const inRect = ([x0, z0, x1, z1]: [number, number, number, number], lx: number, lz: number) => lx >= x0 && lx < x1 && lz >= z0 && lz < z1;

/**
 * The top of a chimney stack (its coping's top at y): a slate cap course and a pair of round flue
 * pots in dark slate, each with a gilt ring and a little slate hood, so no open void shows from above.
 */
export function chimneyPots(fk: ModelKit, p: Obj, x: number, y: number, z: number) {
  cb(fk, p, [1.15, 0.14, 1.15], [x, y + 0.07, z], ROOF_BLUE, undefined, 0.03);
  for (const s of [-1, 1]) {
    fk.cyl(p, 0.2, 0.24, 0.55, [x + s * 0.28, y + 0.42, z], 0x4a4f58, undefined, 8);
    fk.cyl(p, 0.24, 0.24, 0.06, [x + s * 0.28, y + 0.72, z], GILT, undefined, 8);
    // A little slate hood on each pot on two short legs (the flue's smoke comes out under it), never an
    // open void.
    fk.mesh(p, taper(0.42, 0.42, 0.06, 0.06, 0.2), ROOF_BLUE, [x + s * 0.28, y + 0.9, z]);
    for (const e of [-1, 1]) fk.box(p, [0.05, 0.18, 0.05], [x + s * 0.28 + e * 0.16, y + 0.83, z], ROOF_BLUE);
  }
}

/**
 * The castle's flat roof: a lead deck (laid in a diamond chequer with standing rolls) inside a
 * corbelled, crenellated parapet with one merlon at each corner; a wall shared with a neighbour carries
 * only the neighbour's parapet, so a range of buildings reads as one even parapet. Returns the
 * parapet's top.
 */
function keepRoof(fk: ModelKit, p: Obj, b: BuildingSpec): number {
  const { w, d, wallH } = b, shared = new Set(b.shared ?? []), joined = new Set(b.joined ?? []);
  // (Its underside a hair above the walls' tops inside, never in their plane.)
  cb(fk, p, [w - 0.3, 0.28, d - 0.3], [w / 2, wallH + 0.06, d / 2], DECK, undefined, 0.03);
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    if (shared.has(side) || joined.has(side)) continue;
    // The parapet stands out over the wall face on one course of the dressed stone stepped out under it
    // (its front flush with the course's), so the course plainly carries it from every side.
    // (Along a wall built against the curtain the parapet stands flush on the wall, on no course, so
    // nothing of the roof juts out over the curtain's wall walk.)
    const back = (b.backs ?? []).includes(side);
    // (A building lower than the curtain's wall walk has none along its back: the walk's own inner
    // parapet stands there over its roof.)
    if (back && wallH < CURTAIN_WALL.walkY) continue;
    const W = wallFrame(b, side), L = sideLen(b, side), o = back ? WALL_T / 2 - 0.35 : WALL_T / 2 - 0.05, ns = side === 'n' || side === 's';
    // Along the north and south walls the ends at a shared wall stop short of it (the neighbour's
    // parapet runs there); the east and west walls leave the corner merlons to the north and south.
    // (Along a wall joined to a taller neighbour the run stops a hair into its face, the neighbour's wall
    // carried on up there.)
    // (Nor round a low back, where it stops over the back wall's inner face, clear of the wall walk.)
    const low = (s: Side) => (b.backs ?? []).includes(s) && wallH < CURTAIN_WALL.walkY;
    const lo = ns && shared.has('w') ? 1.0 : ns && joined.has('w') ? 0.98 : ns && low('w') ? 0.95 : 0, hi = ns && shared.has('e') ? L - 1.0 : ns && joined.has('e') ? L - 0.98 : ns && low('e') ? L - 0.95 : L;
    // (The north and south runs reach round the corners, so the projecting parapets meet without a
    // notch; where a joined neighbour's roof runs on, the run stops on the wall line and the
    // neighbour's starts there, end to end.)
    const open0 = ns && !shared.has('w') && !joined.has('w') && !low('w'), open1 = ns && !shared.has('e') && !joined.has('e') && !low('e');
    // (The east and west runs stop against the north and south runs' inner faces, so no two stretches of
    // parapet overlap at a corner.)
    // (Against a flush back parapet they stop at its inner face.)
    const backs = new Set(b.backs ?? []);
    const r0 = ns ? lo - (open0 ? 0.3 : 0) : backs.has('n') ? 0.86 : 0.53, r1 = ns ? hi + (open1 ? 0.3 : 0) : backs.has('s') ? L - 0.86 : L - 0.53, rl = r1 - r0, rc = (r0 + r1) / 2;
    /** Stretches where the parapet runs into a tower or pavilion standing against the face: no merlons. */
    const plain = (t: number) => (b.plainParapet ?? []).some((q) => q.side === side && t > q.from && t < q.to);
    if (!back) W.box(fk, p, rl, COURSE, 0.4, rc, wallH - COURSE / 2, WALL_T / 2 + 0.1, DRESS, 0, 0.02);
    W.box(fk, p, rl, 2 * COURSE, 0.7, rc, wallH + COURSE, o, ASHLAR_B, 0, 0.03);
    W.box(fk, p, rl + (ns ? 0.1 : -0.04), 0.14, 0.84, rc, wallH + 2 * COURSE + 0.07, o, DRESS, 0, 0.03);
    const a = lo + 0.41, e = hi - 0.41, n = Math.max(1, Math.round((e - a) / 1.6));
    for (let i = 0; i <= n; i++) {
      const end = i === 0 || i === n;
      if (end && (!ns || (i === 0 && (shared.has('w') || joined.has('w'))) || (i === n && (shared.has('e') || joined.has('e'))))) continue;
      if (plain(a + (i * (e - a)) / n)) continue;
      W.box(fk, p, 0.82, 0.74, 0.7, a + (i * (e - a)) / n, wallH + 2 * COURSE + 0.51, o, ASHLAR_B, 0, 0.04);
    }
  }
  // The leads: slate-navy lead (the spires' slate) laid on the diagonal in a subtle two-tone diamond
  // chequer, a standing roll along every seam so the sheets read as metal, a pale stone band round
  // them inside the parapet and a thin gilt fillet just inside the band.
  const iw = w - 1.8, id = d - 1.8, y = wallH + 0.22;
  fk.box(p, [iw, 0.06, id], [w / 2, y, d / 2], ROOF_BLUE);
  const DIA = 1.5, hd = DIA / 2, side = DIA / Math.SQRT2;
  for (let i = 0; i * hd <= iw; i++) for (let j = 0; j * hd <= id; j++) {
    if ((i + j) % 2) continue;
    const x = 0.9 + i * hd, z = 0.9 + j * hd;
    // (Every diamond and its rolls stop inside the gilt fillet, so the pattern ends cleanly at the border.)
    if (x - hd < 1.56 || x + hd > w - 1.56 || z - hd < 1.56 || z + hd > d - 1.56) continue;
    fk.box(p, [side - 0.06, 0.03, side - 0.06], [x, y + 0.045, z], i % 2 ? ROOF_BLUE_L : ROOF_BLUE, [0, Math.PI / 4, 0]);
    // A roll along each of its four edges (in a chequer every seam borders one of these).
    for (const r of [Math.PI / 4, -Math.PI / 4]) for (const e of [-1, 1]) {
      const ox = (Math.sin(r) * side) / 2, oz = (Math.cos(r) * side) / 2;
      fk.box(p, [side - 0.08, 0.07, 0.07], [x + e * ox, y + 0.08, z + e * oz], ROOF_ROLL, [0, r, 0]);
    }
  }
  for (const [bx, bz, bw, bd] of [[w / 2, 1.13, iw, 0.46], [w / 2, d - 1.13, iw, 0.46], [1.13, d / 2, 0.46, id - 0.92], [w - 1.13, d / 2, 0.46, id - 0.92]]) fk.box(p, [bw, 0.05, bd], [bx, y + 0.05, bz], ASHLAR_L);
  for (const [bx, bz, bw, bd] of [[w / 2, 1.42, iw - 0.92, 0.08], [w / 2, d - 1.42, iw - 0.92, 0.08], [1.42, d / 2, 0.08, id - 1.16], [w - 1.42, d / 2, 0.08, id - 1.16]]) fk.box(p, [bw, 0.06, bd], [bx, y + 0.05, bz], GILT);
  return wallH + 1.9;
}


// ─── Furnishings ─────────────────────────────────────────────────────────────

type FitBuilder = (k: ModelKit, g: Obj, f: Fit, b: BuildingSpec, floor?: Floor) => { tick?: (t: number) => void; light?: THREE.PointLight } | void;

const FITS: Record<string, FitBuilder> = {
  pillar: (k, g, _f, b) => {
    // A square hall column with a stepped base and capital, up to the wall plate.
    const H = b.wallH;
    cb(k, g, [1.0, 0.36, 1.0], [0, 0.18, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.72, H - 0.9, 0.72], [0, 0.36 + (H - 0.9) / 2, 0], STONE, undefined, 0.06);
    cb(k, g, [1.0, 0.36, 1.0], [0, H - 0.36, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.86, 0.2, 0.86], [0, H - 0.08, 0], STONE_L, undefined, 0.04);
  },
  fireplace: (k, g0, f0, _b, floor) => {
    // A great hearth against the back wall (built facing +Z): stone surround, mantel, fire. Only
    // the ground floor's hearth lights the room (upstairs ones glow without a light of their own).
    // (`len`: a narrower hearth, its width.)
    let g: Obj = g0;
    if (f0.len) {
      g = new THREE.Group();
      g.scale.x = f0.len / 4.0;
      g0.add(g);
    }
    cb(k, g, [3.6, 3.0, 0.9], [0, 1.5, 0], STONE_D, undefined, 0.06);
    cb(k, g, [4.0, 0.34, 1.1], [0, 3.1, 0.1], STONE_L, undefined, 0.05);
    for (const x of [-1.45, 1.45]) cb(k, g, [0.6, 2.2, 1.1], [x, 1.1, 0.12], STONE, undefined, 0.05);
    k.box(g, [2.3, 1.9, 0.6], [0, 0.95, 0.2], DARK);
    cb(k, g, [3.4, 0.16, 1.4], [0, 0.08, 0.75], STONE_L, undefined, 0.03);
    for (const x of [-0.35, 0.35]) cb(k, g, [0.26, 0.26, 1.2], [x, 0.3, 0.35], WOOD_D, [0, x, 0], 0.08);
    k.box(g, [1.3, 0.1, 0.5], [0, 0.2, 0.35], 0x3a1206, undefined, PAL.fire, 1.2);
    const f = flame(k, g, 0, 0.3, 0.35, 1.1);
    if (floor) return { tick: f };
    const l = light(g, 0xff8a40, 9, 12, 1.4);
    l.position.z = 1.8;
    return { light: l, tick: (t: number) => { f(t); l.intensity = 8.5 + Math.sin(t * 9) * 1.2; } };
  },
  table: (k, g, f) => {
    // A long trestle table (along local Z) with benches either side, set with plates and candles.
    const L = f.len ?? 5;
    cb(k, g, [1.3, 0.12, L], [0, 0.82, 0], WOOD_L, undefined, 0.03);
    for (const z of [-L / 2 + 0.5, L / 2 - 0.5]) cb(k, g, [1.0, 0.76, 0.16], [0, 0.38, z], WOOD_D, undefined, 0.03);
    for (const x of [-1.05, 1.05]) {
      cb(k, g, [0.4, 0.1, L - 0.4], [x, 0.46, 0], WOOD, undefined, 0.02);
      for (const z of [-L / 2 + 0.6, L / 2 - 0.6]) cb(k, g, [0.3, 0.42, 0.12], [x, 0.21, z], WOOD_D, undefined, 0.02);
    }
    for (let z = -L / 2 + 0.8; z < L / 2 - 0.5; z += 1.1) for (const x of [-0.35, 0.35]) k.mesh(g, octagon(0.17, 0.04), 0xd8d0c0, [x, 0.9, z], [0, 0, Math.PI / 2]);
    for (const z of [-L / 4, L / 4]) {
      cb(k, g, [0.12, 0.3, 0.12], [0, 1.03, z], 0xe8dcc0, undefined, 0.02);
      k.box(g, [0.06, 0.1, 0.06], [0, 1.23, z], 0xffd080, undefined, 0xffb040, 2);
    }
  },
  open_hearth: (k, g, _f, _b, floor) => {
    // The hall's central open hearth: a low stone kerb round a bed of glowing logs, the smoke going
    // up through the louver on the ridge.
    k.mesh(g, octagon(0.95, 0.3), STONE_D, [0, 0.15, 0], [0, 0, Math.PI / 2]);
    k.mesh(g, octagon(0.72, 0.06), 0x3a1206, [0, 0.3, 0], [0, 0, Math.PI / 2], PAL.fire, 1.0);
    for (const a of [0.3, 1.9, 3.5]) cb(k, g, [0.22, 0.22, 1.0], [Math.cos(a) * 0.15, 0.4, Math.sin(a) * 0.15], WOOD_D, [0, a, 0], 0.06);
    const f = flame(k, g, 0, 0.35, 0, 1.0);
    if (floor) return { tick: f };
    const l = light(g, 0xff8a40, 9, 14, 1.6);
    return { light: l, tick: (t: number) => { f(t); l.intensity = 8.5 + Math.sin(t * 9) * 1.2; } };
  },
  high_table: (k, g) => {
    // The lord's table across the dais, with a tall carved chair behind it.
    cb(k, g, [4.2, 0.24, 5.2], [0, 0.12, -0.4], STONE_L, undefined, 0.04);
    cb(k, g, [3.6, 0.12, 1.2], [0, 1.06, 0.3], WOOD_D, undefined, 0.03);
    cb(k, g, [3.4, 0.8, 1.0], [0, 0.64, 0.3], WOOD, undefined, 0.03);
    // The Warden's high seat: a broad carved throne with arms, a red back cushion and gold finials.
    cb(k, g, [1.3, 0.5, 0.9], [0, 0.49, -0.8], WOOD_D, undefined, 0.03);
    cb(k, g, [0.9, 0.12, 0.7], [0, 0.78, -0.75], RUG, undefined, 0.04);
    for (const x of [-0.6, 0.6]) cb(k, g, [0.16, 0.5, 0.8], [x, 0.98, -0.8], WOOD_D, undefined, 0.03);
    cb(k, g, [1.3, 2.6, 0.22], [0, 1.55, -1.2], WOOD_D, undefined, 0.03);
    cb(k, g, [0.9, 1.5, 0.06], [0, 1.7, -1.08], RUG, undefined, 0.01);
    k.box(g, [0.34, 0.34, 0.04], [0, 2.1, -1.04], RUG_TRIM, [0, 0, Math.PI / 4]);
    k.mesh(g, taper(1.3, 0.22, 0.4, 0.22, 0.5), WOOD_D, [0, 3.1, -1.2]);
    for (const x of [-0.62, 0.62]) {
      cb(k, g, [0.18, 0.18, 0.18], [x, 2.95, -1.2], PAL.gold, undefined, 0.04);
      k.mesh(g, taper(0.14, 0.14, 0.02, 0.02, 0.24), PAL.gold, [x, 3.16, -1.2]);
    }
  },
  banner: (k, g) => {
    // The lord's banner hanging on the wall face (built facing +Z): blue and gold, like those outside.
    livery(k, g, 0, 4.1, 0.05, 1.4, 2.5);
  },
  rug: (k, g, f, b) => {
    // (Lying a hair over the floor: the flagstones or an upper floor's boards, or a timber house's planks laid over its flags.)
    const L = f.len ?? 4, y = b.style === 'timber' ? 0.1 : 0.05;
    k.box(g, [2.4, 0.05, L], [0, y, 0], RUG);
    for (const x of [-1.05, 1.05]) k.box(g, [0.14, 0.055, L - 0.2], [x, y + 0.002, 0], RUG_TRIM);
  },
  shelf: (k, g, f) => {
    // Open shelves against a wall (built facing +Z): a dark back board, side boards and four
    // shelves, stocked by variant (len): 0 = shop goods, 1 = ledgers and books, 2 = alchemy jars.
    cb(k, g, [2.6, 2.4, 0.08], [0, 1.2, -0.24], 0x2a1d14, undefined, 0.02);
    for (const x of [-1.26, 1.26]) cb(k, g, [0.1, 2.44, 0.56], [x, 1.22, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [2.66, 0.12, 0.6], [0, 2.44, 0], WOOD_D, undefined, 0.03);
    const shelves = [0.12, 0.72, 1.32, 1.9];
    for (const y of shelves) cb(k, g, [2.44, 0.08, 0.52], [0, y, 0], WOOD, undefined, 0.02);
    const v = f.len ?? 0;
    for (let r = 0; r < 4; r++) {
      const y0 = shelves[r] + 0.04;
      if (v === 1) {
        // Rows of ledgers and bound books, a few leaning, a gap here and there.
        const cols = [0x6a2020, 0x2a4a6a, 0x3a5a2a, 0x5a3a22, 0x7a5a2a, 0x4a2a4a];
        let x = -1.12;
        for (let i = 0; x < 1.05; i++) {
          const w = 0.09 + ((i * 5 + r) % 3) * 0.03, h = 0.36 + ((i * 7 + r * 3) % 4) * 0.05;
          if ((i + r * 2) % 9 === 8) { x += 0.2; continue; }
          const lean = (i + r) % 11 === 5 ? 0.3 : 0;
          cb(k, g, [w, h, 0.34], [x + w / 2 + lean * 0.3 * h, y0 + h / 2, 0.02], cols[(i * 3 + r) % cols.length], [0, 0, -lean], 0.01);
          x += w + 0.015 + lean * 0.2;
        }
      } else if (v === 2) {
        // Stoppered jars and bottles, some glowing faintly.
        const cols = [0x5ad07a, 0xd0a03a, 0x7a6aff, 0xd03a6a, 0x9a7a5a, 0xa0b0a0];
        for (let i = 0; i < 6; i++) {
          const c = cols[(i + r * 2) % cols.length], x = -1.0 + i * 0.4, h = 0.24 + ((i + r) % 3) * 0.08;
          const glow = (i + r) % 3 === 0;
          k.mesh(g, taper(0.22, 0.22, 0.16, 0.16, h), c, [x, y0 + h / 2, 0.02], undefined, glow ? c : 0, glow ? 0.5 : 1);
          k.box(g, [0.1, 0.07, 0.1], [x, y0 + h + 0.04, 0.02], 0x8a6a44);
        }
      } else {
        // Shop goods: bolts of cloth, crocks, small crates and folded hides.
        const cols = [0xa03030, 0x3a6a9a, 0xc8a040, 0x4a7a3a, 0xe8dcc0, 0x8a5aa0, PAL.leather];
        for (let i = 0; i < 4; i++) {
          const c = cols[(r * 4 + i) % cols.length], x = -0.85 + i * 0.57, kind = (i + r) % 3;
          if (kind === 0) cb(k, g, [0.42, 0.3, 0.34], [x, y0 + 0.15, 0.02], c, undefined, 0.12);
          else if (kind === 1) k.mesh(g, taper(0.34, 0.34, 0.24, 0.24, 0.38), c, [x, y0 + 0.19, 0.02]);
          else {
            cb(k, g, [0.42, 0.34, 0.36], [x, y0 + 0.17, 0.02], WOOD_L, undefined, 0.03);
            k.box(g, [0.44, 0.04, 0.38], [x, y0 + 0.28, 0.02], WOOD_D);
          }
        }
      }
    }
  },
  barrel: (k, g) => {
    cb(k, g, [0.7, 0.95, 0.7], [0, 0.47, 0], WOOD, undefined, 0.2);
    for (const y of [0.18, 0.76]) cb(k, g, [0.73, 0.06, 0.73], [0, y, 0], IRON, undefined, 0.2);
  },
  crate: (k, g) => {
    cb(k, g, [0.85, 0.75, 0.85], [0, 0.375, 0], WOOD_L, undefined, 0.04);
    for (const y of [0.12, 0.62]) cb(k, g, [0.89, 0.07, 0.89], [0, y, 0], WOOD_D, undefined, 0.03);
    cb(k, g, [0.6, 0.5, 0.6], [0.05, 1.0, 0.05], WOOD_L, [0, 0.4, 0], 0.04);
  },
  ore_bin: (k, g) => {
    // A plank bin heaped with copper-green and tin-grey ore.
    cb(k, g, [1.6, 0.6, 1.0], [0, 0.3, 0], WOOD, undefined, 0.03);
    for (const x of [-0.78, 0.78]) cb(k, g, [0.12, 0.7, 1.04], [x, 0.35, 0], WOOD_D, undefined, 0.02);
    for (let i = 0; i < 6; i++) chunk(k, g, 60 + i, [0.34, 0.26, 0.3], [-0.5 + (i % 3) * 0.5, 0.52, -0.2 + Math.floor(i / 3) * 0.4], i % 2 ? 0x4a8a6a : 0x8a8a8a, i);
  },
  coal: (k, g) => {
    for (let i = 0; i < 9; i++) chunk(k, g, 80 + i, [0.42, 0.3, 0.38], [(i % 3 - 1) * 0.4, (i > 5 ? 0.22 : 0) - 0.04, (Math.floor(i / 3) % 2 - 0.5) * 0.4], COAL, i);
  },
  bars: (k, g) => {
    // A rack of finished bars: bronze, iron and steel.
    cb(k, g, [1.6, 0.9, 0.7], [0, 0.45, 0], WOOD_D, undefined, 0.03);
    for (let i = 0; i < 9; i++) cb(k, g, [0.34, 0.12, 0.18], [-0.55 + (i % 3) * 0.55, 0.96 + Math.floor(i / 3) * 0.12, (Math.floor(i / 3) % 2) * 0.1 - 0.05], [0xc8864a, IRON_L, 0x9aa0aa][Math.floor(i / 3)], undefined, 0.02);
  },
  tools: (k, g) => {
    // A tool board on the wall (built facing +Z): tongs, hammers and a saw.
    cb(k, g, [2.2, 1.3, 0.08], [0, 1.9, 0.05], WOOD, undefined, 0.02);
    for (const [x, len, tilt] of [[-0.7, 0.9, 0.1], [-0.2, 0.7, -0.1], [0.3, 0.8, 0.05], [0.75, 0.6, 0]] as [number, number, number][]) {
      cb(k, g, [0.06, len, 0.05], [x, 1.9, 0.12], WOOD_D, [0, 0, tilt], 0.01);
      cb(k, g, [0.26, 0.14, 0.08], [x - tilt * len * 0.5, 1.9 + len / 2 - 0.05, 0.14], IRON, [0, 0, tilt], 0.02);
    }
  },
  strongbox: (k, g) => {
    cb(k, g, [1.1, 0.7, 0.75], [0, 0.35, 0], WOOD_D, undefined, 0.04);
    cb(k, g, [1.14, 0.24, 0.79], [0, 0.8, 0], PAL.leather, undefined, 0.05);
    for (const x of [-0.35, 0.35]) k.box(g, [0.09, 0.96, 0.8], [x, 0.47, 0], IRON);
    k.box(g, [0.22, 0.22, 0.05], [0, 0.55, 0.39], PAL.gold);
  },
  gold: (k, g) => {
    // Stacked ingots and coin piles on a low pallet.
    cb(k, g, [1.3, 0.14, 0.9], [0, 0.07, 0], WOOD_D, undefined, 0.02);
    for (let i = 0; i < 6; i++) cb(k, g, [0.4, 0.14, 0.2], [-0.3 + (i % 3) * 0.3, 0.21 + Math.floor(i / 3) * 0.14, (Math.floor(i / 3) ? 0 : 0.22) - 0.1], PAL.gold, undefined, 0.03, 0x5a3a00, 0.3);
    for (let i = 0; i < 4; i++) k.mesh(g, octagon(0.14, 0.05), PAL.gold, [0.4, 0.17 + i * 0.05, 0.25], [0, 0, Math.PI / 2], 0x5a3a00, 0.3);
  },
  vault_door: (k, g) => {
    // The great vault door set into the back wall (built facing +Z): an iron wheel door in a
    // stone frame, gold rim and spokes.
    cb(k, g, [3.2, 3.2, 0.4], [0, 1.7, 0], STONE_L, undefined, 0.06);
    k.mesh(g, octagon(1.3, 0.3), IRON, [0, 1.7, 0.2], [0, Math.PI / 2, 0]);
    k.mesh(g, octagon(1.05, 0.34), 0x3a3a42, [0, 1.7, 0.22], [0, Math.PI / 2, 0]);
    for (let i = 0; i < 4; i++) k.box(g, [1.6, 0.12, 0.08], [0, 1.7, 0.42], PAL.gold, [0, 0, (i * Math.PI) / 4]);
    k.mesh(g, octagon(0.28, 0.14), PAL.gold, [0, 1.7, 0.45], [0, Math.PI / 2, 0], 0x5a3a00, 0.3);
  },
  weapon_rack: (k, g) => {
    for (const x of [-0.9, 0.9]) cb(k, g, [0.12, 1.6, 0.3], [x, 0.8, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [2.0, 0.1, 0.3], [0, 1.45, 0], WOOD, undefined, 0.02);
    cb(k, g, [2.0, 0.1, 0.3], [0, 0.4, 0], WOOD, undefined, 0.02);
    for (const x of [-0.55, -0.15, 0.25, 0.65]) {
      cb(k, g, [0.08, 1.5, 0.05], [x, 0.95, 0.14], x > 0 ? IRON_L : WOOD_L, undefined, 0.01);
      cb(k, g, [0.3, 0.07, 0.07], [x, 0.45, 0.16], IRON, undefined, 0.01);
    }
  },
  workbench: (k, g) => {
    cb(k, g, [2.2, 0.12, 0.9], [0, 0.92, 0], WOOD_L, undefined, 0.03);
    for (const x of [-0.95, 0.95]) cb(k, g, [0.14, 0.86, 0.8], [x, 0.43, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [2.0, 0.08, 0.7], [0, 0.3, 0], WOOD, undefined, 0.02);
    cb(k, g, [0.5, 0.2, 0.3], [-0.5, 1.08, 0], IRON, undefined, 0.03);
    cb(k, g, [0.08, 0.06, 0.6], [0.4, 1.02, 0.05], WOOD_D, [0, 0.4, 0], 0.01);
  },
  cauldron: (k, g) => {
    // A squat iron cauldron over embers, brewing green.
    for (let i = 0; i < 5; i++) chunk(k, g, 120 + i, [0.34, 0.2, 0.3], [Math.cos(i * 1.26) * 0.6, -0.04, Math.sin(i * 1.26) * 0.6], BLOCKS[i % 3], i);
    k.mesh(g, taper(0.9, 0.9, 1.2, 1.2, 0.7), IRON, [0, 0.55, 0]);
    // A thick rim round the brew, bubbles breaking its surface, a ladle hooked over the side.
    for (const [x, z, w, d] of [[0, -0.58, 1.3, 0.14], [0, 0.58, 1.3, 0.14], [-0.58, 0, 0.14, 1.3], [0.58, 0, 0.14, 1.3]]) cb(k, g, [w, 0.14, d], [x, 0.92, z], IRON, undefined, 0.03);
    k.box(g, [1.0, 0.05, 1.0], [0, 0.91, 0], 0x5ad07a, undefined, 0x3aa05a, 1.4);
    for (const [x, z, s] of [[-0.2, 0.1, 0.14], [0.22, -0.15, 0.1], [0.05, 0.28, 0.08]]) cb(k, g, [s, s * 0.7, s], [x, 0.95, z], 0x8af0a0, undefined, s * 0.3, 0x5ad07a, 1.6);
    cb(k, g, [0.06, 0.8, 0.06], [0.45, 1.1, -0.3], WOOD_L, [0.35, 0, -0.4], 0.01);
  },
  flasks: (k, g) => {
    // An alchemist's bench crowded with glowing flasks.
    cb(k, g, [2.2, 0.12, 0.9], [0, 0.92, 0], WOOD, undefined, 0.03);
    for (const x of [-0.95, 0.95]) cb(k, g, [0.14, 0.86, 0.8], [x, 0.43, 0], WOOD_D, undefined, 0.02);
    for (const [x, c, h] of [[-0.7, 0x5ad07a, 0.34], [-0.35, 0xd0a03a, 0.26], [0, 0x7a6aff, 0.4], [0.4, 0xd03a6a, 0.3], [0.75, 0x5ad07a, 0.22]] as [number, number, number][]) {
      k.box(g, [0.18, h, 0.18], [x, 0.98 + h / 2, 0], c, undefined, c, 0.9);
      k.box(g, [0.08, 0.1, 0.08], [x, 1.03 + h, 0], 0xe8dcc0);
    }
  },
  rune_altar: (k, g) => {
    // A runestone altar: a stepped plinth with a glowing rune slab and standing rune stones.
    cb(k, g, [2.4, 0.3, 2.4], [0, 0.15, 0], STONE_D, undefined, 0.05);
    k.mesh(g, taper(1.3, 1.0, 1.0, 0.8, 1.0), STONE, [0, 0.8, 0]);
    k.box(g, [0.8, 0.06, 0.6], [0, 1.33, 0], 0x6aa8ff, undefined, 0x3a6ad0, 1.6);
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * (Math.PI / 2), x = Math.cos(a) * 1.5, z = Math.sin(a) * 1.5;
      k.mesh(g, taper(0.5, 0.36, 0.34, 0.24, 1.3), STONE_L, [x, 0.65, z], [0, a, 0]);
      k.box(g, [0.2, 0.2, 0.04], [x * 1.13, 0.9, z * 1.13], 0x6aa8ff, [0, Math.PI / 2 - a, Math.PI / 4], 0x3a6ad0, 1.4);
    }
  },
  nest: (k, g) => {
    // A straw nest ringed with stones, three warm dragon eggs in it.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      chunk(k, g, 170 + i, [0.5, 0.26, 0.4], [Math.cos(a) * 0.75, -0.04, Math.sin(a) * 0.75], i % 2 ? 0x8a6a3a : 0xa08050, -a);
    }
    k.box(g, [1.1, 0.08, 1.1], [0, 0.08, 0], 0xa08050, [0, 0.4, 0]);
    for (const [x, z, c] of [[-0.2, -0.1, 0xffa050], [0.25, 0.05, 0xd05a3a], [0, 0.3, 0xc8a040]] as [number, number, number][]) {
      k.mesh(g, taper(0.34, 0.34, 0.2, 0.2, 0.5), c, [x, 0.36, z], undefined, c, 0.35);
    }
  },
  brazier: (k, g) => {
    k.mesh(g, taper(0.6, 0.6, 0.3, 0.3, 0.16), IRON, [0, 0.08, 0]);
    cb(k, g, [0.16, 0.6, 0.16], [0, 0.46, 0], IRON, undefined, 0.02);
    k.mesh(g, taper(0.42, 0.42, 0.8, 0.8, 0.3), IRON, [0, 0.9, 0]);
    k.box(g, [0.66, 0.06, 0.66], [0, 1.03, 0], PAL.fire, undefined, PAL.fire, 1.8);
    return { tick: flame(k, g, 0, 0.95, 0, 0.8) };
  },
  /** Marks where the smelter's furnace station stands (the chimney follows it). */
  furnace_spot: (k, g) => {
    cb(k, g, [3.4, 0.08, 2.8], [0, 0.07, 0.2], BRICK_D, undefined, 0.02);
  },

  // ─── Smithing ──────────────────────────────────────────────────────────────
  crucibles: (k, g) => {
    // An iron stand of clay crucibles by the furnace, one still glowing, tongs leaning on it.
    cb(k, g, [1.3, 0.1, 0.8], [0, 0.55, 0], IRON, undefined, 0.02);
    for (const [x, z] of [[-0.58, -0.32], [0.58, -0.32], [-0.58, 0.32], [0.58, 0.32]]) cb(k, g, [0.08, 0.55, 0.08], [x, 0.28, z], IRON, undefined, 0.01);
    for (const [x, glow] of [[-0.38, false], [0.02, true], [0.4, false]] as [number, boolean][]) {
      k.mesh(g, taper(0.22, 0.22, 0.34, 0.34, 0.36), 0x8a5a3a, [x, 0.78, 0]);
      k.box(g, [0.26, 0.04, 0.26], [x, 0.97, 0], glow ? 0xffa040 : 0x3a2a24, undefined, glow ? PAL.fire : 0, glow ? 2 : 1);
    }
    cb(k, g, [0.05, 0.9, 0.05], [0.72, 0.45, 0.36], IRON, [0, 0, -0.35], 0.01);
    cb(k, g, [0.05, 0.9, 0.05], [0.8, 0.45, 0.36], IRON, [0, 0, -0.3], 0.01);
  },
  bellows: (k, g) => {
    // Great forge bellows on a timber trestle: leather body between two boards, iron nozzle
    // toward the furnace (+Z end), a lever arm over the top.
    for (const x of [-0.5, 0.5]) cb(k, g, [0.14, 0.5, 1.3], [x, 0.25, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.9, 0.08, 1.5], [0, 0.54, 0], WOOD, undefined, 0.02);
    k.mesh(g, taper(0.84, 1.3, 0.84, 0.5, 0.42, 0, 0.35), PAL.leather, [0, 0.8, -0.1]);
    cb(k, g, [0.9, 0.07, 1.2], [0, 1.03, 0.05], WOOD, [0.22, 0, 0], 0.02);
    k.mesh(g, taper(0.2, 0.2, 0.1, 0.1, 0.5), IRON, [0, 0.66, 0.9], [Math.PI / 2, 0, 0]);
    cb(k, g, [0.1, 0.1, 1.6], [0, 1.3, -0.3], WOOD_D, [0.3, 0, 0], 0.02);
    cb(k, g, [0.12, 0.8, 0.12], [0, 0.95, -0.95], WOOD_D, undefined, 0.02);
  },
  ore_cart: (k, g) => {
    // A mine cart heaped with fresh ore (set it on a 'rails' fit).
    k.mesh(g, taper(0.9, 1.2, 1.08, 1.4, 0.6), 0x5a4a3a, [0, 0.58, 0]);
    for (const y of [0.42, 0.8]) k.box(g, [1.12, 0.06, 1.44], [0, y, 0], IRON);
    for (let i = 0; i < 6; i++) chunk(k, g, 610 + i, [0.38, 0.3, 0.36], [-0.3 + (i % 3) * 0.3, 0.8, -0.35 + Math.floor(i / 3) * 0.6], [0xb4743a, 0x8a8a8a, 0x5a4a44][i % 3], i);
    for (const [x, z] of [[-0.46, -0.42], [0.46, -0.42], [-0.46, 0.42], [0.46, 0.42]]) k.mesh(g, octagon(0.18, 0.1), IRON, [x, 0.2, z]);
  },
  rails: (k, g, f) => {
    // A cart track along local Z, `len` long, laid into the floor (walk over it).
    const L = f.len ?? 6;
    for (const x of [-0.32, 0.32]) k.box(g, [0.07, 0.07, L], [x, 0.11, 0], IRON);
    for (let z = -L / 2 + 0.3; z < L / 2; z += 0.65) k.box(g, [0.95, 0.04, 0.2], [0, 0.08, z], WOOD_D);
  },
  bar_stack: (k, g) => {
    // A pallet of finished bars stacked crosswise: bronze below, iron on top.
    cb(k, g, [1.4, 0.14, 1.0], [0, 0.07, 0], WOOD_D, undefined, 0.02);
    for (let l = 0; l < 4; l++) {
      const along = l % 2 === 0, col = l < 2 ? 0xc8864a : IRON_L;
      for (let i = 0; i < 4; i++) {
        const o = -0.39 + i * 0.26;
        cb(k, g, along ? [0.9, 0.12, 0.2] : [0.2, 0.12, 0.8], along ? [0, 0.2 + l * 0.12, o * 0.9] : [o * 1.2, 0.2 + l * 0.12, 0], col, undefined, 0.02);
      }
    }
  },
  tool_rack: (k, g) => {
    // A freestanding smith's rack (built facing +Z): tongs, hammers and a file on pegs.
    for (const x of [-0.9, 0.9]) cb(k, g, [0.12, 1.9, 0.3], [x, 0.95, 0], WOOD_D, undefined, 0.02);
    for (const y of [0.3, 1.25, 1.8]) cb(k, g, [1.9, 0.1, 0.14], [0, y, -0.05], WOOD, undefined, 0.02);
    for (const [x, kind] of [[-0.6, 0], [-0.25, 1], [0.1, 0], [0.42, 1], [0.7, 2]] as [number, number][]) {
      if (kind === 0) for (const e of [-1, 1]) cb(k, g, [0.04, 0.8, 0.04], [x + e * 0.04, 0.9, 0.08], IRON, [0, 0, e * 0.06], 0.01);
      else if (kind === 1) {
        cb(k, g, [0.06, 0.7, 0.06], [x, 0.95, 0.08], WOOD_L, undefined, 0.01);
        cb(k, g, [0.3, 0.14, 0.14], [x, 0.58, 0.08], IRON, undefined, 0.02);
      } else cb(k, g, [0.06, 0.6, 0.03], [x, 0.95, 0.08], IRON_L, undefined, 0.01);
    }
    cb(k, g, [0.34, 0.26, 0.26], [0.45, 0.14, 0.1], WOOD_L, undefined, 0.03);
  },
  anvil_small: (k, g) => {
    // A working anvil on a banded stump, a half-finished blade across it.
    cb(k, g, [0.7, 0.55, 0.7], [0, 0.27, 0], 0x5a3a22, undefined, 0.16);
    cb(k, g, [0.73, 0.06, 0.73], [0, 0.4, 0], IRON, undefined, 0.16);
    k.mesh(g, taper(0.56, 0.4, 0.34, 0.26, 0.16), IRON, [0, 0.63, 0]);
    cb(k, g, [0.72, 0.18, 0.32], [0, 0.8, 0], IRON_L, undefined, 0.03);
    k.mesh(g, taper(0.26, 0.24, 0.03, 0.04, 0.4), IRON_L, [0.55, 0.79, 0], [0, 0, -Math.PI / 2]);
    cb(k, g, [0.7, 0.03, 0.08], [-0.05, 0.905, 0.04], 0x9aa0aa, [0, 0.2, 0], 0.01);
  },
  grindstone: (k, g) => {
    // A treadle grindstone: a stone wheel on a timber frame over a water trough.
    for (const x of [-0.3, 0.3]) cb(k, g, [0.1, 0.9, 0.7], [x, 0.45, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.5, 0.25, 0.9], [0, 0.14, 0], WOOD, undefined, 0.03);
    k.box(g, [0.4, 0.03, 0.8], [0, 0.27, 0], 0x24505c);
    k.mesh(g, octagon(0.42, 0.18), STONE_L, [0, 0.82, 0]);
    cb(k, g, [0.8, 0.06, 0.06], [0, 0.82, 0], IRON, undefined, 0.01);
    cb(k, g, [0.06, 0.06, 0.4], [0.42, 0.62, 0.2], WOOD_D, [0.6, 0, 0], 0.01);
  },
  trough: (k, g) => {
    // A long plank trough (quench water in the forge, drinking water in the roost).
    // Plank sides round a sunk water surface (it reads as water from above, not a closed box).
    cb(k, g, [1.8, 0.12, 0.7], [0, 0.06, 0], WOOD_D, undefined, 0.03);
    for (const z of [-0.3, 0.3]) cb(k, g, [1.8, 0.5, 0.1], [0, 0.31, z], WOOD, undefined, 0.02);
    for (const x of [-0.85, 0.85]) cb(k, g, [0.1, 0.5, 0.7], [x, 0.31, 0], WOOD, undefined, 0.02);
    k.box(g, [1.6, 0.04, 0.5], [0, 0.44, 0], 0x2a6070);
    for (const x of [-0.55, 0.55]) k.box(g, [0.06, 0.54, 0.74], [x, 0.3, 0], IRON);
  },
  coal_bin: (k, g) => {
    // A plank bin (along local X, open to +Z) heaped with coal, a shovel stuck in the heap.
    cb(k, g, [1.5, 0.55, 0.9], [0, 0.27, -0.05], WOOD, undefined, 0.03);
    for (const x of [-0.72, 0.72]) cb(k, g, [0.12, 0.66, 0.96], [x, 0.33, -0.05], WOOD_D, undefined, 0.02);
    cb(k, g, [1.5, 0.3, 0.08], [0, 0.15, 0.42], WOOD_D, undefined, 0.02);
    for (let i = 0; i < 7; i++) chunk(k, g, 700 + i, [0.36, 0.26, 0.32], [-0.48 + (i % 4) * 0.32, 0.5 + (i > 3 ? 0.12 : 0), -0.2 + (i % 2) * 0.24], COAL, i);
    cb(k, g, [0.06, 0.8, 0.06], [0.3, 0.9, -0.1], WOOD_L, [0.3, 0, -0.25], 0.01);
    cb(k, g, [0.24, 0.05, 0.26], [0.42, 0.55, -0.22], IRON, [0.3, 0, -0.25], 0.01);
  },
  arms_rack: (k, g) => {
    // The smith's finished work on show, facing +Z: an open frame with three blades standing in
    // its slotted foot (leant back so they face the high camera, not edge-on), a shield hung on
    // the left post and a helm capping the right one.
    for (const x of [-1.0, 1.0]) cb(k, g, [0.16, 1.8, 0.24], [x, 0.9, -0.1], WOOD_D, undefined, 0.03);
    cb(k, g, [2.3, 0.14, 0.3], [0, 1.66, -0.12], WOOD, undefined, 0.03);
    cb(k, g, [2.2, 0.22, 0.5], [0, 0.11, 0], WOOD, undefined, 0.03);
    for (const [x, tone] of [[-0.45, IRON_L], [0.05, IRON_L], [0.5, IRON]] as [number, number][]) {
      const s = new THREE.Group();
      s.position.set(x, 0.22, 0.08);
      s.rotation.x = -0.3;
      g.add(s);
      cb(k, s, [0.12, 1.05, 0.04], [0, 0.82, 0], tone, undefined, 0.01);
      k.mesh(s, taper(0.12, 0.04, 0.01, 0.01, 0.16), tone, [0, 1.42, 0]);
      cb(k, s, [0.38, 0.06, 0.07], [0, 0.27, 0], IRON, undefined, 0.01);
      cb(k, s, [0.06, 0.24, 0.06], [0, 0.12, 0], PAL.leather, undefined, 0.01);
    }
    // A kite shield on the left post: wood with an iron rim and boss, red field.
    const sh = new THREE.Group();
    sh.position.set(-1.0, 1.05, 0.04);
    g.add(sh);
    cb(k, sh, [0.62, 0.62, 0.07], [0, 0.08, 0], IRON, undefined, 0.03);
    cb(k, sh, [0.54, 0.54, 0.08], [0, 0.08, 0.01], RUG, undefined, 0.03);
    k.mesh(sh, taper(0.62, 0.07, 0.04, 0.04, 0.42), IRON, [0, -0.43, 0], [Math.PI, 0, 0]);
    k.mesh(sh, taper(0.54, 0.08, 0.03, 0.03, 0.36), RUG, [0, -0.41, 0.01], [Math.PI, 0, 0]);
    cb(k, sh, [0.16, 0.16, 0.06], [0, 0.08, 0.06], IRON_L, undefined, 0.03);
    // A helm on the right post.
    cb(k, g, [0.36, 0.34, 0.36], [1.0, 1.97, -0.1], IRON_L, undefined, 0.05);
    k.box(g, [0.26, 0.05, 0.02], [1.0, 1.98, 0.09], DARK);
  },
  mould_table: (k, g) => {
    // The casting table (along local X): a stone slab on blocks with a row of ingot moulds, two
    // just poured and glowing, two cooling dark, and a finished bar knocked out at the end.
    for (const x of [-0.7, 0.7]) cb(k, g, [0.3, 0.6, 0.6], [x, 0.3, 0], STONE_D, undefined, 0.03);
    cb(k, g, [1.9, 0.14, 0.8], [0, 0.67, 0], STONE, undefined, 0.03);
    [-0.6, -0.2, 0.2].forEach((x, i) => {
      cb(k, g, [0.32, 0.1, 0.5], [x, 0.79, 0], IRON, undefined, 0.02);
      k.box(g, [0.22, 0.02, 0.38], [x, 0.84, 0], i < 2 ? 0xffa040 : 0x3a2a24, undefined, i < 2 ? PAL.fire : 0, i < 2 ? 2 : 1);
    });
    cb(k, g, [0.34, 0.1, 0.18], [0.66, 0.79, 0.05], 0xc8864a, [0, 0.3, 0], 0.02);
    cb(k, g, [0.05, 0.05, 0.7], [0.62, 0.77, -0.25], IRON, [0, 1.2, 0], 0.01);
  },
  sacks: (k, g) => {
    // Two bulging sacks and a third slumped against them.
    cb(k, g, [0.55, 0.75, 0.45], [-0.2, 0.37, 0], 0xb09a70, [0, 0.2, 0], 0.18);
    cb(k, g, [0.5, 0.68, 0.45], [0.3, 0.34, 0.1], 0xa08a60, [0, -0.3, 0], 0.18);
    cb(k, g, [0.5, 0.4, 0.62], [0.05, 0.2, 0.45], 0xb09a70, [0.3, 0.5, 0], 0.16);
    for (const [x, z, y] of [[-0.2, 0, 0.77], [0.3, 0.1, 0.7]]) cb(k, g, [0.2, 0.1, 0.2], [x, y, z], 0x6a5a3a, undefined, 0.04);
  },
  woodpile: (k, g) => {
    // Split logs stacked against the wall (along local X), pale cut ends to the front.
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
      cb(k, g, [1.3, 0.3, 0.3], [0, 0.15 + r * 0.26, -0.45 + (i + r * 0.5) * 0.3], 0x4a3020, [0, 0, 0], 0.09);
      k.mesh(g, octagon(0.13, 0.03), 0xa08058, [0.66, 0.15 + r * 0.26, -0.45 + (i + r * 0.5) * 0.3]);
    }
  },
  coin_sacks: (k, g) => {
    // Tied coin sacks, one spilled across the floor.
    for (const [x, z, s] of [[-0.25, -0.1, 1], [0.25, -0.05, 0.85], [0, 0.3, 0.75]] as [number, number, number][]) {
      cb(k, g, [0.45 * s, 0.5 * s, 0.4 * s], [x, 0.25 * s, z], 0x8a6a48, undefined, 0.14 * s);
      cb(k, g, [0.18 * s, 0.1, 0.18 * s], [x, 0.53 * s, z], 0x5a4230, undefined, 0.03);
    }
    for (let i = 0; i < 6; i++) k.mesh(g, octagon(0.09, 0.03), PAL.gold, [0.35 + (i % 3) * 0.14, 0.02 + Math.floor(i / 3) * 0.03, 0.35 + (i % 2) * 0.12], [0, i, Math.PI / 2], 0x5a3a00, 0.3);
  },

  // ─── Counting house & hall ─────────────────────────────────────────────────
  ledger_desk: (k, g) => {
    // A clerk's desk (facing +Z): an open ledger, a stack of books, an inkwell and a candle, a stool.
    cb(k, g, [1.7, 0.1, 0.8], [0, 0.86, 0], WOOD_D, undefined, 0.02);
    for (const x of [-0.72, 0.72]) cb(k, g, [0.16, 0.82, 0.7], [x, 0.41, 0], WOOD, undefined, 0.02);
    cb(k, g, [1.4, 0.5, 0.06], [0, 0.55, -0.32], WOOD, undefined, 0.02);
    for (const e of [-1, 1]) k.box(g, [0.3, 0.04, 0.42], [-0.15 + e * 0.16, 0.93, 0.05], 0xe8dcc0, [0, 0, e * 0.07]);
    k.box(g, [0.03, 0.05, 0.42], [-0.15, 0.93, 0.05], 0x6a2020);
    for (let i = 0; i < 3; i++) cb(k, g, [0.34, 0.08, 0.26], [0.5, 0.95 + i * 0.08, -0.12], [0x6a2020, 0x2a4a6a, 0x5a3a22][i], [0, i * 0.2, 0], 0.01);
    k.box(g, [0.1, 0.1, 0.1], [0.3, 0.96, 0.15], DARK);
    cb(k, g, [0.08, 0.2, 0.08], [-0.6, 1.01, -0.15], 0xe8dcc0, undefined, 0.02);
    k.box(g, [0.05, 0.08, 0.05], [-0.6, 1.15, -0.15], 0xffd080, undefined, 0xffb040, 2);
    cb(k, g, [0.4, 0.5, 0.4], [0, 0.25, 0.75], WOOD, undefined, 0.04);
  },
  candelabra: (k, g) => {
    // A tall iron candle stand with three lit candles.
    cb(k, g, [0.46, 0.08, 0.46], [0, 0.04, 0], IRON, undefined, 0.02);
    cb(k, g, [0.07, 1.5, 0.07], [0, 0.8, 0], IRON, undefined, 0.01);
    cb(k, g, [0.7, 0.05, 0.07], [0, 1.52, 0], IRON, undefined, 0.01);
    for (const x of [-0.32, 0, 0.32]) {
      const y = x ? 1.62 : 1.7;
      cb(k, g, [0.1, x ? 0.18 : 0.3, 0.1], [x, y, 0], 0xe8dcc0, undefined, 0.02);
      k.box(g, [0.06, 0.1, 0.06], [x, y + (x ? 0.14 : 0.2), 0], 0xffd080, undefined, 0xffb040, 2.4);
    }
  },
  bench: (k, g) => {
    // A plain oak bench along local X.
    cb(k, g, [2.2, 0.1, 0.45], [0, 0.46, 0], WOOD_L, undefined, 0.02);
    for (const x of [-0.85, 0.85]) cb(k, g, [0.12, 0.42, 0.4], [x, 0.21, 0], WOOD_D, undefined, 0.02);
  },
  armor_stand: (k, g) => {
    // A suit of plate on a wooden stand (facing +Z): cuirass, pauldrons, great helm, a shield.
    cb(k, g, [0.6, 0.1, 0.6], [0, 0.05, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.1, 1.2, 0.1], [0, 0.65, 0], WOOD_D, undefined, 0.01);
    cb(k, g, [0.62, 0.66, 0.4], [0, 1.45, 0], PAL.steel, undefined, 0.06);
    cb(k, g, [0.54, 0.28, 0.36], [0, 1.0, 0], PAL.steelDark, undefined, 0.05);
    for (const x of [-0.4, 0.4]) cb(k, g, [0.3, 0.2, 0.44], [x, 1.76, 0], PAL.steelDark, undefined, 0.05);
    cb(k, g, [0.4, 0.44, 0.42], [0, 2.02, 0], PAL.steel, undefined, 0.05);
    k.box(g, [0.3, 0.05, 0.02], [0, 2.06, 0.22], DARK);
    cb(k, g, [0.08, 0.14, 0.3], [0, 2.3, 0], RUG, undefined, 0.02);
    cb(k, g, [0.16, 0.34, 0.2], [0, 1.52, 0.2], RUG, undefined, 0.02);
  },
  sideboard: (k, g) => {
    // A low cabinet (facing +Z) set with pewter platters and flagons.
    cb(k, g, [2.0, 0.9, 0.6], [0, 0.45, 0], WOOD_D, undefined, 0.03);
    for (const x of [-0.5, 0.5]) cb(k, g, [0.86, 0.6, 0.04], [x, 0.45, 0.31], WOOD, undefined, 0.02);
    cb(k, g, [2.1, 0.08, 0.66], [0, 0.93, 0], WOOD_L, undefined, 0.02);
    k.mesh(g, octagon(0.22, 0.03), IRON_L, [-0.6, 1.0, -0.12], [0, 0, 0.7]);
    for (const [x, h] of [[-0.1, 0.3], [0.15, 0.26], [0.6, 0.34]] as [number, number][]) k.mesh(g, taper(0.16, 0.16, 0.12, 0.12, h), IRON_L, [x, 0.97 + h / 2, 0.05]);
    for (let i = 0; i < 3; i++) chunk(k, g, 700 + i, [0.14, 0.12, 0.14], [0.35 + i * 0.1, 0.97, -0.15], [0xa03030, 0x5a8a3a, 0xc8a040][i], i);
  },
  display_case: (k, g, f) => {
    // A long shop counter (along local X, `len` long) with wares laid out on it.
    const L = f.len ?? 3.6;
    cb(k, g, [L, 1.0, 1.0], [0, 0.5, 0], WOOD, undefined, 0.04);
    for (let x = -L / 2 + 0.6; x < L / 2 - 0.3; x += 1.2) cb(k, g, [1.0, 0.6, 0.06], [x, 0.5, 0.51], WOOD_L, undefined, 0.02);
    cb(k, g, [L + 0.16, 0.12, 1.16], [0, 1.06, 0], WOOD_D, undefined, 0.03);
    // Goods: a coil of rope, a folded hide, a daggers board, potions, a shield face up.
    const n = Math.max(2, Math.floor(L / 0.9));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.5 + (i * (L - 1)) / Math.max(1, n - 1), kind = i % 4;
      if (kind === 0) k.mesh(g, octagon(0.22, 0.12), 0xb09a70, [x, 1.18, 0.05], [0, 0, Math.PI / 2]);
      else if (kind === 1) cb(k, g, [0.6, 0.1, 0.45], [x, 1.17, 0.05], 0x8a6a48, [0, 0.2, 0], 0.03);
      else if (kind === 2) {
        cb(k, g, [0.6, 0.04, 0.4], [x, 1.14, 0.05], 0x7a2020, undefined, 0.01);
        for (const e of [-1, 1]) cb(k, g, [0.06, 0.04, 0.34], [x + e * 0.12, 1.18, 0.05], IRON_L, undefined, 0.01);
      } else for (const [dx, c] of [[-0.12, 0xd03a3a], [0.12, 0x3a6ad0]] as [number, number][]) {
        k.box(g, [0.14, 0.24, 0.14], [x + dx, 1.24, 0.08], c, undefined, c, 0.5);
        k.box(g, [0.06, 0.07, 0.06], [x + dx, 1.4, 0.08], 0xe8dcc0);
      }
    }
  },
  display_table: (k, g) => {
    // A small trestle table of goods for browsing: boots, a helm and a shield.
    cb(k, g, [1.5, 0.1, 0.9], [0, 0.78, 0], WOOD_L, undefined, 0.02);
    for (const x of [-0.6, 0.6]) cb(k, g, [0.1, 0.74, 0.8], [x, 0.37, 0], WOOD_D, undefined, 0.02);
    for (const x of [-0.5, -0.3]) cb(k, g, [0.16, 0.26, 0.34], [x, 0.96, 0.05], PAL.leather, undefined, 0.04);
    cb(k, g, [0.34, 0.3, 0.34], [0.1, 0.98, -0.05], IRON_L, undefined, 0.05);
    k.mesh(g, octagon(0.28, 0.06), 0x3a5a8a, [0.5, 0.86, 0.1], [0, 0, Math.PI / 2]);
    k.mesh(g, octagon(0.1, 0.07), PAL.gold, [0.5, 0.89, 0.1], [0, 0, Math.PI / 2]);
  },

  // ─── Workshops (plots) ─────────────────────────────────────────────────────
  herb_rack: (k, g) => {
    // A drying rack (facing +Z) hung with bundles of herbs.
    for (const x of [-0.8, 0.8]) cb(k, g, [0.1, 1.9, 0.1], [x, 0.95, 0], WOOD_D, undefined, 0.02);
    for (const y of [1.2, 1.8]) {
      cb(k, g, [1.8, 0.07, 0.07], [0, y, 0], WOOD, undefined, 0.01);
      for (let i = 0; i < 5; i++) {
        const x = -0.6 + i * 0.3, c = [0x5a8a3a, 0x7a8a3a, 0x8a5aa0, 0x4a7a34, 0xa08a4a][(i + (y > 1.5 ? 2 : 0)) % 5];
        k.mesh(g, taper(0.06, 0.06, 0.2, 0.16, 0.36), c, [x, y - 0.24, 0.02], [Math.PI, 0, 0]);
      }
    }
  },
  jars: (k, g) => {
    // Big stoppered clay jars.
    for (const [x, z, s] of [[0, 0, 1], [0.42, 0.15, 0.8], [-0.2, 0.4, 0.7]] as [number, number, number][]) {
      k.mesh(g, taper(0.4 * s, 0.4 * s, 0.26 * s, 0.26 * s, 0.6 * s), 0x9a6a4a, [x, 0.3 * s, z]);
      k.box(g, [0.2 * s, 0.1 * s, 0.2 * s], [x, 0.64 * s, z], WOOD_D);
    }
  },
  distiller: (k, g) => {
    // An alembic: a copper still over a small brick hearth, its coil dripping into a flask.
    cb(k, g, [0.8, 0.5, 0.8], [0, 0.25, 0], BRICK, undefined, 0.04);
    k.box(g, [0.4, 0.2, 0.1], [0, 0.2, 0.37], 0x3a1206, undefined, PAL.fire, 1.2);
    k.mesh(g, taper(0.56, 0.56, 0.4, 0.4, 0.5), 0xc07a44, [0, 0.75, 0]);
    k.mesh(g, taper(0.3, 0.3, 0.1, 0.1, 0.4), 0xc07a44, [0, 1.2, 0]);
    cb(k, g, [0.06, 0.06, 0.7], [0.3, 1.25, 0.2], 0xc07a44, [0, 0.8, -0.4], 0.01);
    k.box(g, [0.18, 0.26, 0.18], [0.62, 0.63, 0.3], 0x5ad07a, undefined, 0x3aa05a, 1.2);
  },
  crystals: (k, g) => {
    // A cluster of rune-blue crystals in a stone socket (glows by itself).
    chunk(k, g, 720, [0.8, 0.3, 0.7], [0, -0.05, 0], STONE_D, 0.3);
    k.mesh(g, prism(0.28, 1.3, 0.3), 0x8ab8ff, [0, 0.1, 0], [0.1, 0.3, 0.1], 0x3a6ad0, 1.3);
    k.mesh(g, prism(0.2, 0.9, 0.3), 0x8ab8ff, [0.25, 0.1, 0.1], [-0.35, 1, -0.3], 0x3a6ad0, 1.3);
    k.mesh(g, prism(0.18, 0.7, 0.3), 0xa0c8ff, [-0.22, 0.1, -0.1], [0.3, 2, 0.35], 0x3a6ad0, 1.3);
  },
  lectern: (k, g) => {
    // A reading stand (facing +Z) with an open tome, its page glowing with a rune.
    cb(k, g, [0.6, 0.1, 0.5], [0, 0.05, 0], STONE_D, undefined, 0.02);
    k.mesh(g, taper(0.26, 0.26, 0.18, 0.18, 1.0), WOOD_D, [0, 0.6, 0]);
    cb(k, g, [0.7, 0.08, 0.5], [0, 1.14, 0], WOOD, [0.45, 0, 0], 0.02);
    for (const e of [-1, 1]) k.box(g, [0.3, 0.04, 0.4], [e * 0.16, 1.2, 0.03], 0xe8dcc0, [0.45, 0, e * 0.06]);
    k.box(g, [0.12, 0.02, 0.12], [0.16, 1.23, 0.05], 0x6aa8ff, [0.45, 0, 0], 0x3a6ad0, 1.5);
  },
  candles: (k, g) => {
    // A cluster of floor candles on a stone slab.
    cb(k, g, [0.6, 0.06, 0.5], [0, 0.03, 0], STONE_L, undefined, 0.02);
    for (const [x, z, h] of [[-0.15, -0.08, 0.34], [0.12, -0.1, 0.24], [0.02, 0.14, 0.18], [0.2, 0.12, 0.3]] as [number, number, number][]) {
      cb(k, g, [0.1, h, 0.1], [x, 0.06 + h / 2, z], 0xe8dcc0, undefined, 0.02);
      k.box(g, [0.05, 0.08, 0.05], [x, 0.1 + h, z], 0xffd080, undefined, 0xffb040, 2.4);
    }
  },
  hay: (k, g) => {
    // Two straw bales and a third on top.
    for (const [x, y, z, r] of [[-0.35, 0.25, 0, 0], [0.4, 0.25, 0.05, 0.1], [0.05, 0.75, 0, -0.2]] as [number, number, number, number][]) {
      cb(k, g, [0.8, 0.5, 0.55], [x, y, z], 0xc8a858, [0, r, 0], 0.06);
      for (const e of [-0.2, 0.2]) k.box(g, [0.04, 0.52, 0.57], [x + e, y, z], 0x8a6a34, [0, r, 0]);
    }
  },
  straw: (k, g) => {
    // Loose straw strewn on the floor (walk over it).
    // A trodden mat of straw (overlapping flat layers) with loose wisps scattered unevenly over and
    // round it, two shades (a regular ring of blades read as a star).
    for (let i = 0; i < 3; i++) k.box(g, [1.1 - i * 0.2, 0.02, 0.8 - i * 0.1], [(hash01(i, 21) - 0.5) * 0.4, 0.07 + i * 0.006, (hash01(i, 22) - 0.5) * 0.3], i % 2 ? 0xb8984a : 0xc8a858, [0, hash01(i, 23) * Math.PI, 0]);
    for (let i = 0; i < 11; i++) {
      const a = hash01(i, 11) * Math.PI * 2, r = Math.sqrt(hash01(i, 12)) * 0.85;
      k.box(g, [0.34 + hash01(i, 13) * 0.3, 0.02 + (i % 3) * 0.01, 0.08], [Math.cos(a) * r, 0.08 + (i % 3) * 0.01, Math.sin(a) * r * 0.8], i % 3 ? 0xc8a858 : 0xa8883e, [0, hash01(i, 14) * Math.PI, 0]);
    }
  },
  egg_crate: (k, g) => {
    // A straw-packed crate with a dragon egg nestled in it.
    cb(k, g, [0.85, 0.5, 0.7], [0, 0.25, 0], WOOD_L, undefined, 0.04);
    k.box(g, [0.75, 0.06, 0.6], [0, 0.5, 0], 0xc8a858);
    k.mesh(g, taper(0.3, 0.3, 0.18, 0.18, 0.44), 0x6a9ad0, [0.05, 0.68, 0], undefined, 0x6a9ad0, 0.3);
  },
  perch: (k, g) => {
    // A timber roost: a thick perch beam on two posts, scratched and worn.
    for (const x of [-0.9, 0.9]) cb(k, g, [0.22, 1.6, 0.22], [x, 0.8, 0], WOOD_D, undefined, 0.03);
    cb(k, g, [2.3, 0.24, 0.26], [0, 1.5, 0], WOOD, undefined, 0.07);
    for (const x of [-0.9, 0.9]) cb(k, g, [0.1, 0.6, 0.1], [x * 0.7, 1.1, 0], WOOD_D, [0, 0, (x > 0 ? 1 : -1) * 0.7], 0.02);
  },

  // ─── The keep ──────────────────────────────────────────────────────────────
  throne: (k, g) => {
    // The Warden's seat (facing +Z) on a two-step dais: a broad oak throne with a tall carved
    // back, a red cushion and a gold dragon crest, a red runner down the steps.
    cb(k, g, [5.4, 0.22, 3.3], [0, 0.11, 0], STONE_D, undefined, 0.04);
    cb(k, g, [4.2, 0.22, 2.4], [0, 0.33, -0.35], STONE_L, undefined, 0.04);
    k.box(g, [1.3, 0.03, 3.0], [0, 0.23, 0.15], RUG);
    k.box(g, [1.3, 0.03, 1.6], [0, 0.45, -0.3], RUG);
    cb(k, g, [1.6, 0.5, 1.1], [0, 0.69, -0.7], WOOD_D, undefined, 0.04);
    cb(k, g, [1.2, 0.14, 0.9], [0, 1.0, -0.65], RUG, undefined, 0.05);
    for (const x of [-0.72, 0.72]) {
      cb(k, g, [0.2, 0.55, 1.0], [x, 1.2, -0.7], WOOD_D, undefined, 0.03);
      cb(k, g, [0.26, 0.26, 0.26], [x, 1.52, -0.25], PAL.gold, undefined, 0.04);
    }
    cb(k, g, [1.6, 3.0, 0.3], [0, 1.95, -1.3], WOOD_D, undefined, 0.04);
    cb(k, g, [1.1, 1.8, 0.06], [0, 1.95, -1.13], RUG, undefined, 0.01);
    k.box(g, [0.42, 0.42, 0.04], [0, 2.3, -1.09], RUG_TRIM, [0, 0, Math.PI / 4]);
    // Crest: a gold diamond with two wing blades.
    k.box(g, [0.5, 0.5, 0.12], [0, 3.6, -1.3], PAL.gold, [0, 0, Math.PI / 4], 0x5a3a00, 0.35);
    for (const e of [-1, 1]) k.mesh(g, wedge(0.12, 0.5, 1.0), PAL.gold, [e * 0.62, 3.55, -1.3], [0, Math.PI / 2, e * 0.5], 0x5a3a00, 0.35);
  },
  feast_table: (k, g, f, b) => {
    // A long trestle table (along local Z) laid for a feast: roasts, bread, cheese, fruit, flagons.
    FITS.table(k, g, f, b);
    const L = f.len ?? 6;
    for (const z of [-L / 2 + 1.0, L / 2 - 1.0]) {
      k.mesh(g, octagon(0.34, 0.04), IRON_L, [0, 0.9, z], [0, 0, Math.PI / 2]);
      cb(k, g, [0.46, 0.3, 0.36], [0, 1.07, z], 0x8a4a22, undefined, 0.1);
      for (const e of [-1, 1]) cb(k, g, [0.08, 0.08, 0.24], [e * 0.24, 1.0, z + 0.05], 0xe8dcc0, [0, e * 0.4, 0], 0.02);
    }
    for (const [x, z] of [[0.05, -0.9], [-0.1, -0.55]]) cb(k, g, [0.34, 0.16, 0.2], [x, 0.96, z], 0xc89a58, [0, 0.3, 0], 0.07);
    k.mesh(g, taper(0.5, 0.5, 0.36, 0.36, 0.14), WOOD_L, [0, 0.95, 0.3]);
    for (let i = 0; i < 4; i++) cb(k, g, [0.14, 0.14, 0.14], [(i % 2 - 0.5) * 0.14, 1.06, 0.3 + (Math.floor(i / 2) - 0.5) * 0.14], [0xa02a2a, 0x7aa03a, 0xc8a040, 0xa02a2a][i], undefined, 0.05);
    k.mesh(g, octagon(0.2, 0.14), 0xe0c060, [0, 0.95, 1.05], [0, 0, Math.PI / 2]);
    for (const [x, z] of [[-0.35, -1.6], [0.35, 1.6], [-0.35, 2.7]]) k.mesh(g, taper(0.14, 0.14, 0.11, 0.11, 0.22), IRON_L, [x, 0.99, z]);
  },
  bed: (k, g) => {
    // The Warden's bed (along local Z, head at -Z): an oak frame and tall headboard, white linen
    // under a red coverlet with a gold band, two pillows, posts with gold finials at the head.
    cb(k, g, [1.8, 0.42, 2.5], [0, 0.31, 0], WOOD_D, undefined, 0.03);
    cb(k, g, [1.64, 0.2, 2.3], [0, 0.6, 0.02], 0xe8dcc0, undefined, 0.05);
    cb(k, g, [1.7, 0.12, 1.55], [0, 0.74, 0.4], RUG, undefined, 0.04);
    k.box(g, [1.72, 0.04, 0.14], [0, 0.81, -0.3], RUG_TRIM);
    for (const x of [-0.42, 0.42]) cb(k, g, [0.62, 0.16, 0.38], [x, 0.76, -0.82], 0xf0e8d8, undefined, 0.06);
    cb(k, g, [1.9, 1.5, 0.16], [0, 0.95, -1.26], WOOD_D, undefined, 0.03);
    cb(k, g, [1.3, 0.8, 0.05], [0, 1.2, -1.16], RUG, undefined, 0.01);
    for (const x of [-0.9, 0.9]) {
      cb(k, g, [0.18, 1.9, 0.18], [x, 0.95, -1.26], WOOD_D, undefined, 0.02);
      cb(k, g, [0.16, 0.16, 0.16], [x, 1.98, -1.26], PAL.gold, undefined, 0.03);
      cb(k, g, [0.16, 0.8, 0.16], [x, 0.4, 1.2], WOOD_D, undefined, 0.02);
    }
  },
  wardrobe: (k, g) => {
    // A tall oak press (facing +Z): two panelled doors, a cornice, iron handles.
    cb(k, g, [1.5, 2.2, 0.62], [0, 1.1, 0], WOOD_D, undefined, 0.03);
    for (const x of [-0.36, 0.36]) {
      cb(k, g, [0.62, 1.7, 0.05], [x, 1.1, 0.32], WOOD, undefined, 0.02);
      k.box(g, [0.05, 0.2, 0.05], [x * 0.25, 1.15, 0.36], IRON);
    }
    cb(k, g, [1.66, 0.16, 0.74], [0, 2.26, 0], WOOD_D, undefined, 0.03);
  },
  chair: (k, g) => {
    // A carved oak chair (facing +Z) with a red cushion and a high back.
    cb(k, g, [0.66, 0.1, 0.62], [0, 0.5, 0], WOOD_D, undefined, 0.02);
    for (const x of [-0.27, 0.27]) for (const z of [-0.24, 0.24]) cb(k, g, [0.09, 0.48, 0.09], [x, 0.24, z], WOOD_D, undefined, 0.01);
    cb(k, g, [0.56, 0.08, 0.52], [0, 0.59, 0.02], RUG, undefined, 0.03);
    cb(k, g, [0.66, 1.0, 0.1], [0, 1.0, -0.28], WOOD_D, undefined, 0.02);
    for (const x of [-0.3, 0.3]) cb(k, g, [0.08, 0.26, 0.5], [x, 0.7, 0], WOOD_D, undefined, 0.01);
  },
  map_table: (k, g) => {
    // The map table: a broad oak table spread with a chart of the island (sea, the island's green,
    // the keep marked in red), markers and a dagger pinning it, rolled charts at one end.
    cb(k, g, [4.6, 0.14, 2.9], [0, 0.9, 0], WOOD_D, undefined, 0.03);
    for (const x of [-1.95, 1.95]) for (const z of [-1.1, 1.1]) cb(k, g, [0.24, 0.84, 0.24], [x, 0.42, z], WOOD_D, undefined, 0.02);
    for (const z of [-1.1, 1.1]) cb(k, g, [3.7, 0.12, 0.12], [0, 0.22, z], WOOD, undefined, 0.01);
    k.box(g, [4.1, 0.02, 2.45], [0, 0.98, 0], 0xd8c8a0);
    k.box(g, [3.6, 0.02, 2.0], [0, 0.99, 0], 0x3e6272);
    k.box(g, [2.0, 0.02, 1.4], [-0.1, 1.0, 0.05], 0x6a8a4a, [0, 0.25, 0]);
    k.box(g, [1.2, 0.02, 1.0], [0.55, 1.002, -0.25], 0x7a9a54, [0, -0.4, 0]);
    k.box(g, [0.26, 0.08, 0.2], [-0.15, 1.04, -0.2], 0xa02a2a);
    for (const [x, z, c] of [[0.7, 0.3, PAL.gold], [-0.8, 0.45, 0x3a3a42], [0.35, -0.55, 0x3a3a42]] as [number, number, number][]) cb(k, g, [0.12, 0.16, 0.12], [x, 1.07, z], c, undefined, 0.03);
    cb(k, g, [0.06, 0.03, 0.6], [1.15, 1.02, 0.6], IRON_L, [0, 0.6, 0], 0.01);
    for (const [z, l] of [[-0.75, 0.9], [-0.45, 0.7]] as [number, number][]) k.mesh(g, octagon(0.09, l), 0xe8dcc0, [-1.85, 1.07, z], [0, Math.PI / 2, 0]);
  },
  hearth_oven: (k, g) => {
    // The kitchen hearth against the wall (facing +Z): a deep stone fireplace with a spit roast
    // over the embers, a pot on a hook, and a domed bread oven built into its side.
    cb(k, g, [3.6, 2.8, 1.2], [0, 1.4, 0], STONE_D, undefined, 0.06);
    cb(k, g, [3.9, 0.3, 1.4], [0, 2.85, 0.1], STONE_L, undefined, 0.04);
    k.box(g, [2.0, 1.6, 0.7], [-0.5, 0.8, 0.3], DARK);
    k.box(g, [1.6, 0.1, 0.6], [-0.5, 0.12, 0.35], 0x3a1206, undefined, PAL.fire, 1.2);
    cb(k, g, [2.1, 0.05, 0.05], [-0.5, 0.95, 0.4], IRON, undefined, 0.01);
    cb(k, g, [0.7, 0.36, 0.42], [-0.5, 0.95, 0.4], 0x8a4a22, undefined, 0.12);
    cb(k, g, [0.04, 0.5, 0.04], [0.1, 1.35, 0.25], IRON, undefined, 0.01);
    k.mesh(g, taper(0.44, 0.44, 0.34, 0.34, 0.36), IRON, [0.1, 0.95, 0.25]);
    // Bread oven: a stepped stone dome with a dark mouth.
    cb(k, g, [1.2, 1.0, 1.2], [1.25, 0.5, 0.4], STONE, undefined, 0.05);
    cb(k, g, [0.9, 0.3, 0.9], [1.25, 1.15, 0.4], STONE, undefined, 0.05);
    k.mesh(g, octagon(0.26, 0.05), DARK, [1.25, 0.55, 1.0], [0, Math.PI / 2, 0]);
    return { tick: flame(k, g, -0.5, 0.2, 0.35, 0.8) };
  },
  kitchen_table: (k, g) => {
    // A scrubbed prep table: loaves, a cheese, a cleaver on its board, a basket of apples.
    cb(k, g, [2.4, 0.12, 1.1], [0, 0.88, 0], WOOD_L, undefined, 0.03);
    for (const x of [-1.05, 1.05]) for (const z of [-0.42, 0.42]) cb(k, g, [0.14, 0.82, 0.14], [x, 0.41, z], WOOD_D, undefined, 0.02);
    for (const [x, z] of [[-0.8, -0.2], [-0.5, -0.25]]) cb(k, g, [0.34, 0.16, 0.2], [x, 1.02, z], 0xc89a58, [0, 0.4, 0], 0.07);
    k.mesh(g, octagon(0.2, 0.16), 0xe0c060, [-0.1, 1.02, 0.2], [0, 0, Math.PI / 2]);
    cb(k, g, [0.6, 0.05, 0.4], [0.45, 0.97, 0.1], WOOD, undefined, 0.01);
    cb(k, g, [0.3, 0.02, 0.14], [0.45, 1.01, 0.1], IRON_L, undefined, 0.01);
    cb(k, g, [0.46, 0.24, 0.36], [0.85, 1.06, -0.2], WOOD_L, undefined, 0.03);
    for (let i = 0; i < 3; i++) cb(k, g, [0.13, 0.13, 0.13], [0.75 + i * 0.1, 1.2, -0.2 + (i % 2) * 0.08], 0xa02a2a, undefined, 0.05);
  },
  bunk: (k, g) => {
    // A two-tier bunk (along local Z): oak posts, straw mattresses, wool blankets, a ladder.
    for (const x of [-0.5, 0.5]) for (const z of [-1.0, 1.0]) cb(k, g, [0.12, 1.9, 0.12], [x, 0.95, z], WOOD_D, undefined, 0.02);
    for (const [y, blanket] of [[0.45, 0x6a2a24], [1.45, 0x3a4a6a]] as [number, number][]) {
      cb(k, g, [1.1, 0.12, 2.1], [0, y, 0], WOOD, undefined, 0.02);
      cb(k, g, [0.94, 0.12, 1.9], [0, y + 0.12, 0], 0xc8b890, undefined, 0.04);
      cb(k, g, [0.98, 0.08, 1.3], [0, y + 0.2, 0.3], blanket, undefined, 0.03);
      cb(k, g, [0.6, 0.12, 0.34], [0, y + 0.22, -0.72], 0xe8dcc0, undefined, 0.05);
    }
    for (const y of [0.3, 0.7, 1.1, 1.5]) cb(k, g, [0.06, 0.06, 0.4], [0.56, y, 0.75], WOOD_L, undefined, 0.01);
  },
  guard_table: (k, g) => {
    // The guards' table: dice and cards, tankards, a candle, three stools.
    cb(k, g, [1.3, 0.1, 1.1], [0, 0.8, 0], WOOD, undefined, 0.03);
    cb(k, g, [0.9, 0.74, 0.7], [0, 0.37, 0], WOOD_D, undefined, 0.03);
    for (const [x, z] of [[-0.3, 0.25], [0.35, -0.2], [0.35, 0.3]]) k.mesh(g, taper(0.14, 0.14, 0.12, 0.12, 0.2), IRON_L, [x, 0.95, z]);
    for (const [x, z, r] of [[0, 0, 0.3], [0.1, 0.12, 0.9], [-0.15, -0.2, 0.2]] as [number, number, number][]) k.box(g, [0.18, 0.015, 0.26], [x, 0.86, z], 0xe8dcc0, [0, r, 0]);
    for (const [x, z] of [[-0.35, -0.2], [-0.25, -0.28]]) k.box(g, [0.08, 0.08, 0.08], [x, 0.89, z], 0xf0ece0, [0, 0.5, 0]);
    cb(k, g, [0.1, 0.2, 0.1], [0.5, 0.95, -0.4], 0xe8dcc0, undefined, 0.02);
    k.box(g, [0.05, 0.08, 0.05], [0.5, 1.09, -0.4], 0xffd080, undefined, 0xffb040, 2);
    for (const [x, z] of [[-0.95, 0], [0.95, 0.1], [0.1, 0.85]]) cb(k, g, [0.42, 0.5, 0.42], [x, 0.25, z], WOOD_L, undefined, 0.04);
  },
  horse_stall: (k, g, f) => {
    // A stall (facing +Z, toward its half-door in the outer wall): deep straw, a corner manger by the
    // door, a boarded gate on the aisle side, and the horse standing in it looking out over its door
    // (`len`: its coat by turns, chestnut, bay or grey).
    k.box(g, [3.1, 0.06, 2.9], [0, 0.04, 0], 0xc8a858);
    for (let i = 0; i < 5; i++) k.box(g, [0.5 + hash01(i, 31) * 0.4, 0.03, 0.08], [(hash01(i, 32) - 0.5) * 2.4, 0.08, (hash01(i, 33) - 0.5) * 2.2], 0xa8883e, [0, hash01(i, 34) * Math.PI, 0]);
    cb(k, g, [0.9, 0.5, 0.5], [1.05, 0.95, 1.3], WOOD_D, undefined, 0.02);
    cb(k, g, [0.8, 0.1, 0.4], [1.05, 1.18, 1.3], 0xc8a858, undefined, 0.02);
    for (const x of [-1.5, 1.5]) cb(k, g, [0.16, 1.5, 0.16], [x, 0.75, -1.45], TIMBER, undefined, 0.02);
    for (let i = 0; i < 4; i++) cb(k, g, [0.66, 1.1, 0.06], [-1.05 + i * 0.7, 0.62, -1.45], PLANKS[i % 3], undefined, 0.01);
    cb(k, g, [3.1, 0.1, 0.14], [0, 1.22, -1.45], WOOD_D, undefined, 0.01);
    // (The horse keeps its own size in a stall grown with the castle, standing up to its half-door.)
    const s = f.s ?? 1, hg = new THREE.Group();
    hg.scale.setScalar(1 / s);
    hg.position.z = 1.45 - 1.45 / s;
    g.add(hg);
    stallHorse(k, hg, (f.len ?? 0) % 3);
  },
  stall_boards: (k, g, f) => {
    // The boarded wall between two stalls (along local Z, `len` long): oak boards to shoulder height
    // between posts, iron bars above them to the post heads.
    const L = f.len ?? 3, n = Math.round(L / 0.5);
    for (const z of [-L / 2 + 0.09, L / 2 - 0.09]) cb(k, g, [0.18, 2.2, 0.18], [0, 1.1, z], TIMBER, undefined, 0.02);
    for (let i = 0; i < n; i++) cb(k, g, [0.07, 1.4, L / n - 0.012], [0, 0.7, -L / 2 + (L * (i + 0.5)) / n], PLANKS[i % 3], undefined, 0.01);
    cb(k, g, [0.16, 0.1, L - 0.2], [0, 1.45, 0], TIMBER, undefined, 0.01);
    cb(k, g, [0.16, 0.1, L - 0.2], [0, 2.15, 0], TIMBER, undefined, 0.01);
    for (let z = -L / 2 + 0.35; z < L / 2 - 0.25; z += 0.22) k.box(g, [0.03, 0.62, 0.03], [0, 1.8, z], IRON);
  },
  saddle_rack: (k, g) => {
    // The tack on the wall (facing +Z): two saddles on their trees, bridles on pegs, a folded blanket.
    cb(k, g, [1.9, 1.8, 0.08], [0, 1.2, -0.3], WOOD_D, undefined, 0.02);
    for (const x of [-0.45, 0.45]) {
      cb(k, g, [0.12, 0.12, 0.5], [x, 1.25, -0.04], WOOD, undefined, 0.01);
      cb(k, g, [0.52, 0.2, 0.62], [x, 1.36, 0.0], 0x6e3a22, undefined, 0.06);
      cb(k, g, [0.2, 0.16, 0.2], [x, 1.5, 0.22], 0x5a2e1a, undefined, 0.04);
      for (const s of [-1, 1]) cb(k, g, [0.05, 0.5, 0.18], [x + s * 0.27, 1.08, 0.0], 0x5a2e1a, undefined, 0.01);
      k.box(g, [0.04, 0.04, 0.2], [x, 2.0, -0.18], IRON);
      cb(k, g, [0.06, 0.6, 0.04], [x, 1.68, -0.08], 0x3a2416, undefined, 0.005);
    }
    cb(k, g, [0.9, 0.3, 0.5], [0, 0.15, 0], 0x3a4a6a, undefined, 0.04);
  },
  loft_stair: (k, g, f, b) => {
    // A steep timber stair up to a loft (along local +Z, climbing toward +Z, `len` long): solid oak
    // steps of one riser each from the floor to the loft's boards, and a handrail on posts.
    // (House-rule risers in one straight flight, past the rule's 17 between landings; 1.2 wide, rail at hand.)
    const H = (b as CastleSpec).look?.loft?.y ?? 2.9, L = f.len ?? 4, n = Math.ceil(H / STAIR_RULE.riserMax - 1e-6), rise = H / n, t = L / n, W = 1.2, R = 1.2;
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * rise;
      cb(k, g, [W, top, t + 0.01], [0, top / 2, -L / 2 + (i + 0.5) * t], i % 2 ? WOOD : WOOD_L, undefined, 0.01);
    }
    const A = Math.atan2(H, L), Lr = Math.hypot(L, H);
    cb(k, g, [0.08, 0.08, Lr], [W / 2 + 0.02, H / 2 + R, 0], WOOD_D, [-A, 0, 0], 0.01);
    for (const z of [-L / 2 + 0.2, 0, L / 2 - 0.2]) cb(k, g, [0.08, R, 0.08], [W / 2 + 0.02, ((z + L / 2) / L) * H + R / 2, z], WOOD_D, undefined, 0.01);
  },
  chancel_rail: (k, g, f) => {
    // The chancel's rail (along local Z, `len` long): an oak rail on turned balusters over a kneeling step.
    const L = f.len ?? 3;
    cb(k, g, [0.5, 0.12, L], [-0.25, 0.06, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.16, 0.12, L], [0, 0.98, 0], WOOD_D, undefined, 0.02);
    for (let z = -L / 2 + 0.12; z <= L / 2 - 0.1; z += 0.26) k.mesh(g, taper(0.09, 0.09, 0.06, 0.06, 0.84), WOOD, [0, 0.5, z]);
    for (const z of [-L / 2 + 0.08, L / 2 - 0.08]) cb(k, g, [0.18, 1.08, 0.18], [0, 0.54, z], WOOD_D, undefined, 0.02);
  },
  chapel_bench: (k, g) => {
    // A chapel's oak bench (along local X, facing +Z): its seat, a panelled back, shaped ends.
    cb(k, g, [2.2, 0.08, 0.42], [0, 0.46, 0], WOOD_L, undefined, 0.02);
    cb(k, g, [2.2, 0.5, 0.06], [0, 0.78, -0.2], WOOD, undefined, 0.02);
    cb(k, g, [2.24, 0.06, 0.1], [0, 1.05, -0.2], WOOD_D, undefined, 0.01);
    for (const x of [-1.1, 1.1]) cb(k, g, [0.08, 0.92, 0.5], [x, 0.46, -0.02], WOOD_D, undefined, 0.02);
  },
  pew: (k, g) => {
    // The lord's box pew (along local X, facing +Z): panelled oak sides and back, a red cushion, gilt finials.
    cb(k, g, [2.3, 0.1, 0.55], [0, 0.46, 0], WOOD_L, undefined, 0.02);
    cb(k, g, [2.2, 0.08, 0.5], [0, 0.55, 0], RUG, undefined, 0.02);
    cb(k, g, [2.4, 1.3, 0.1], [0, 0.65, -0.32], WOOD_D, undefined, 0.02);
    for (const x of [-1.2, 1.2]) {
      cb(k, g, [0.1, 1.1, 0.9], [x, 0.55, 0.1], WOOD_D, undefined, 0.02);
      cb(k, g, [0.14, 0.14, 0.14], [x, 1.37, -0.32], PAL.gold, undefined, 0.02);
    }
    cb(k, g, [2.4, 0.9, 0.08], [0, 0.45, 0.56], WOOD_D, undefined, 0.02);
    cb(k, g, [2.5, 0.08, 0.2], [0, 0.94, 0.56], WOOD, undefined, 0.02);
    cb(k, g, [0.9, 0.5, 0.05], [0, 0.95, -0.26], RUG, undefined, 0.01);
    k.box(g, [0.24, 0.24, 0.03], [0, 0.95, -0.23], RUG_TRIM, [0, 0, Math.PI / 4]);
  },
  chapel_altar: (k, g) => {
    // The chapel altar (facing +Z): a stone table under a white cloth with a red, gold-edged fall,
    // two tall candles, the dragon sigil on a painted reredos behind.
    cb(k, g, [2.6, 2.6, 0.24], [0, 1.5, -0.55], STONE_L, undefined, 0.04);
    cb(k, g, [1.6, 1.8, 0.06], [0, 1.7, -0.41], RUG, undefined, 0.01);
    k.box(g, [0.6, 0.6, 0.05], [0, 1.9, -0.37], PAL.gold, [0, 0, Math.PI / 4], 0x5a3a00, 0.35);
    cb(k, g, [2.2, 0.2, 1.0], [0, 0.1, 0], STONE_D, undefined, 0.03);
    cb(k, g, [1.9, 0.85, 0.8], [0, 0.62, 0], STONE, undefined, 0.04);
    k.box(g, [2.0, 0.05, 0.9], [0, 1.07, 0], 0xece4d4);
    cb(k, g, [0.8, 0.6, 0.04], [0, 0.8, 0.43], RUG, undefined, 0.01);
    k.box(g, [0.84, 0.06, 0.05], [0, 0.5, 0.44], RUG_TRIM);
    for (const x of [-0.7, 0.7]) {
      cb(k, g, [0.14, 0.12, 0.14], [x, 1.15, -0.1], PAL.gold, undefined, 0.02);
      cb(k, g, [0.09, 0.5, 0.09], [x, 1.46, -0.1], 0xe8dcc0, undefined, 0.02);
      k.box(g, [0.05, 0.1, 0.05], [x, 1.76, -0.1], 0xffd080, undefined, 0xffb040, 2.4);
    }
  },
};

/**
 * A horse standing in its stall (facing +Z, toward its half-door), in the blocky style of the horses
 * in the yards (castleProps/bailey.ts, `v` its coat): its chest to the stall's front wall and its neck
 * stretched out over the half-door, so its head looks out through the doorway.
 */
function stallHorse(k: ModelKit, g: Obj, v: number) {
  const coat = [0x8a5430, 0x4a3024, 0xb8aea2][v], dark = 0x231812, shade = new THREE.Color(coat).multiplyScalar(0.84).getHex(), muzzle = v === 2 ? 0x6a625a : 0x2e2018;
  const z0 = 0.55;
  cb(k, g, [0.6, 0.6, 1.5], [-0.15, 1.28, z0], coat, undefined, 0.1);
  cb(k, g, [0.56, 0.5, 0.34], [-0.15, 1.24, z0 + 0.74], shade, undefined, 0.08);
  cb(k, g, [0.64, 0.56, 0.5], [-0.15, 1.34, z0 - 0.6], coat, undefined, 0.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = -0.15 + sx * 0.19, z = z0 + sz * 0.58;
    cb(k, g, [0.17, 0.5, 0.2], [x, 0.78, z], coat, undefined, 0.03);
    cb(k, g, [0.14, 0.5, 0.16], [x, 0.32, z], shade, undefined, 0.02);
    cb(k, g, [0.18, 0.12, 0.22], [x, 0.06, z + 0.02], dark, undefined, 0.02);
  }
  cb(k, g, [0.13, 0.78, 0.15], [-0.15, 1.16, z0 - 0.86], dark, [0.26, 0, 0], 0.03);
  // The neck carried forward and up from the shoulders over the half-door, the mane along it.
  const nb: [number, number, number] = [-0.15, 1.5, z0 + 0.62], nt: [number, number, number] = [-0.15, 1.95, z0 + 1.62];
  const nl = Math.hypot(nt[1] - nb[1], nt[2] - nb[2]), na = Math.atan2(nt[2] - nb[2], nt[1] - nb[1]);
  const nc: [number, number, number] = [-0.15, (nb[1] + nt[1]) / 2, (nb[2] + nt[2]) / 2];
  cb(k, g, [0.28, nl + 0.2, 0.36], nc, coat, [na, 0, 0], 0.08);
  cb(k, g, [0.1, nl, 0.1], [-0.15, nc[1] + 0.2, nc[2] - 0.08], dark, [na, 0, 0], 0.02);
  const hd = new THREE.Group();
  hd.position.set(-0.15, nt[1] + 0.02, nt[2] + 0.12);
  hd.rotation.x = 0.55;
  g.add(hd);
  cb(k, hd, [0.28, 0.3, 0.62], [0, 0, 0.14], coat, undefined, 0.06);
  cb(k, hd, [0.26, 0.24, 0.18], [0, -0.03, 0.48], muzzle, undefined, 0.05);
  if (v === 0) k.box(hd, [0.08, 0.02, 0.36], [0, 0.155, 0.22], 0xf0e6d8);
  for (const sx of [-1, 1]) {
    cb(k, hd, [0.07, 0.16, 0.06], [sx * 0.08, 0.21, -0.1], coat, [0, 0, sx * 0.15], 0.02);
    k.box(hd, [0.03, 0.05, 0.06], [sx * 0.145, 0.06, 0.04], dark);
  }
  cb(k, hd, [0.14, 0.06, 0.16], [0, 0.17, 0.0], dark, undefined, 0.02);
}

/** Every furnishing kind (tests build them all). */
export const FIT_KINDS = Object.keys(FITS);

/** A spec for furnishings used out of doors (only the pillar reads it: the wall height). */
const OUTDOORS: BuildingSpec = { id: 'outdoors', style: 'timber', interior: 'shop', x: 0, z: 0, w: 1, d: 1, wallH: 3.6, roof: 0, doors: [], windows: [] };

/**
 * A furnishing as a free-standing world prop (layout props named `fit_<kind>`), so yards and
 * roadsides share the workshop furniture: benches, sacks, woodpiles, grindstones, bar stacks…
 */
export function buildFitProp(kind: string, len?: number, s?: number): Prop {
  const k = new ModelKit(), g = new THREE.Group();
  const res = FITS[kind]?.(k, g, { kind, x: 0, z: 0, len, s }, OUTDOORS);
  finishProp(g, [k]);
  return { obj: g, tick: res?.tick, light: res?.light };
}

