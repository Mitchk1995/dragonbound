import * as THREE from 'three';
import { ModelKit, PAL } from '../render/kit';
import { addPatch } from '../render/surface';
import { hash01, octagon, prism, taper, wedge } from '../render/blocks';
import {
  fitsOf, inRoom, isVoid, partitionRuns, partitionsOf, sideLen, stairRect, wallRuns,
  type BuildingSpec, type Fit, type Floor, type Side, type Stair, type Window,
} from './building';
import { studioEnv } from '../render/env';
import {
  BLOCKS, BRICK, BRICK_D, cb, chunk, COAL, DARK, finishProp, flame, IRON, IRON_L, light, masonry, PLASTER, PLOT_MARK, STONE, STONE_D, STONE_DD, STONE_L,
  WOOD, WOOD_D, WOOD_L, type Prop,
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

/** Walls are cut down to this height above their floor (a clean stone course) while the hero is inside. */
export const CUT_H = 1.1;
/** A cut threshold above everything (nothing cut). */
const OFF = 1e5;
const WALL_T = 0.9;
const FLOOR_STONE = 0x7e776c;
const PLANKS = [0x8a6440, 0x7a5636, 0x94704a];
const SHUTTER = 0x3e5a58;
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

/** Clean horizontal cut: fragments above the world height `u` are cut away (it sweeps down as the building opens). */
function cutPatch(mat: THREE.Material, u: { value: number }) {
  addPatch(mat, { key: 'cut', apply: (shader) => {
    shader.uniforms.uCutY = u;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCutY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCutY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCutY;\nvarying float vCutY;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vCutY > uCutY) discard;');
  } });
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
    /** A pane of glass (its own see-through material, casts no shadow). */
    glass(p: Obj, mat: THREE.Material, len: number, h: number, dep: number, u: number, y: number, off: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ns ? len : dep, h, ns ? dep : len), mat);
      m.position.set(ns ? u : c + off * out, y, ns ? c + off * out : u);
      p.add(m);
    },
  };
}

type WallFrame = ReturnType<typeof wallFrame>;

/** A wall between heights y0 and y1 along [a, e], with rectangular openings left open. */
function holed(W: WallFrame, k: ModelKit, p: Obj, a: number, e: number, y0: number, y1: number, dep: number, color: number, holes: { u0: number; u1: number; y0: number; y1: number }[]) {
  const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h.y0, h.y1]).filter((y) => y > y0 && y < y1)])].sort((p1, p2) => p1 - p2);
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1];
    const gaps = holes.filter((h) => h.y0 <= ya + 1e-6 && h.y1 >= yb - 1e-6).sort((g1, g2) => g1.u0 - g2.u0);
    let s = a;
    for (const g of gaps) {
      if (g.u0 > s) W.box(k, p, g.u0 - s, yb - ya, dep, (s + g.u0) / 2, (ya + yb) / 2, 0, color, 0, 0);
      s = Math.max(s, g.u1);
    }
    if (e > s) W.box(k, p, e - s, yb - ya, dep, (s + e) / 2, (ya + yb) / 2, 0, color, 0, 0);
  }
}

/**
 * Window glass in two parts, so a window reads as a window from the high camera: the main lights
 * are dark glass with the warm glow of the lit room behind (you still see in), the top lights above
 * the transom catch a cool sheen of the night sky.
 */
function glassMats() {
  const mk = (o: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, flatShading: true, metalness: 0, envMap: studioEnv(), ...o });
    m.userData.decal = true;
    return m;
  };
  return {
    warm: mk({ color: 0x241a12, opacity: 0.42, roughness: 0.1, envMapIntensity: 0.5, emissive: 0xffa04a, emissiveIntensity: 0.2 }),
    sky: mk({ color: 0x2a3a52, opacity: 0.8, roughness: 0.04, envMapIntensity: 1.0, emissive: 0x24365a, emissiveIntensity: 0.45 }),
  };
}

type Put = (kk: ModelKit, pp: Obj, y0: number, y1: number) => void;
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
  const UPPER = timber ? PLASTER : STONE;
  const TRIM = timber ? TIMBER : STONE_D;
  const FRAME = timber ? TIMBER : STONE_L;
  const doorH = hall || keep ? 3.8 : timber ? 2.8 : 3.1;
  // The two cut thresholds (world heights: OFF = nothing cut) and the glass for each band.
  const uMid = { value: OFF }, uTop = { value: OFF };
  const glass = { still: glassMats(), mid: glassMats(), top: glassMats() };
  for (const m of Object.values(glass.mid)) cutPatch(m, uMid);
  for (const m of Object.values(glass.top)) cutPatch(m, uTop);
  const shared = new Set(b.shared ?? []);
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
  // Thresholds: a pale stone sill through every doorway, a step beyond it.
  for (const dr of b.doors) {
    const W = wallFrame(b, dr.side), uc = dr.at + dr.w / 2;
    W.box(ik, floorG, dr.w + 0.2, 0.1, 1.0, uc, 0.05, 0, STONE_L, 0, 0.02);
    if (!shared.has(dr.side)) W.box(ik, floorG, dr.w + 0.6, 0.1, 0.7, uc, 0.05, 0.85, STONE_D, 0, 0.03);
  }

  // ─── Walls ────────────────────────────────────────────────────────────────
  // Window openings are real holes through the wall: the wall is laid in bands between the sill
  // and head heights with gaps where the windows are, the glass sits in the middle of the wall's
  // thickness, and the surround lies flush on both faces (only the outside sill ledge projects).
  const face = (timber ? WALL_T - 0.08 : WALL_T) / 2;
  // (The castle's windows are tall narrow lancets, their upper ones' sills clear of the upper course.)
  // On a single tall storey (the wings) the upper row are clerestory lancets high in the wall.
  const winDims = (wi: Window) => (keep ? { ww: 0.8, wh: 2.4, wy: wi.floor ? (multi ? storeyH + CUT_H + 0.3 : wallH * 0.58) : 1.7 } : wi.floor ? { ww: 1.1, wh: 2.1, wy: storeyH + 1.0 } : hall ? { ww: 1.3, wh: 2.3, wy: 1.9 } : { ww: 1.0, wh: 1.3, wy: 1.55 });
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    if (shared.has(side)) continue;
    const W = wallFrame(b, side), fade = side === 's';
    /** A box between heights y0 and y1, split at the cuts on the camera side. */
    const piece = (len: number, y0: number, y1: number, dep: number, u: number, off: number, color: number, ch = 0.03) =>
      band(fade, y0, y1, (kk, pp, a, e) => W.box(kk, pp, len, e - a, dep, u, (a + e) / 2, off, color, 0, ch));
    const ns = side === 'n' || side === 's';
    const L = sideLen(b, side);
    // The north and south walls take the corners.
    const lo = ns ? 0 : 1, hi = ns ? L : L - 1;
    const runs = wallRuns(b, side).map(([a, e]) => [Math.max(lo, a), Math.min(hi, e)] as [number, number]).filter(([a, e]) => e > a);
    const wins = b.windows.filter((wi) => wi.side === side).map((wi) => ({ wi, ...winDims(wi) }));
    for (const [a, e] of runs) {
      const len = e - a, u = (a + e) / 2;
      // Stone plinth and stub (always standing), capped by a pale course that hides the cut. The
      // keep stands on a raised, stepped base course that projects outward only (never into rooms).
      if (keep) {
        W.box(k, built, len, 0.62, WALL_T + 0.66, u, 0.31, 0.33, STONE_DD, 0, 0.05);
        W.box(k, built, len, 0.34, WALL_T + 0.36, u, 0.79, 0.18, STONE_D, 0, 0.04);
      } else W.box(k, built, len, 0.34, WALL_T + 0.16, u, 0.17, 0, STONE_D, 0, 0.04);
      W.box(k, built, len, CUT_H - 0.34, WALL_T, u, 0.34 + (CUT_H - 0.34) / 2, 0, STONE, 0, 0.02);
      W.box(k, built, len, 0.16, WALL_T + 0.1, u, CUT_H - 0.05, 0, STONE_L, 0, 0.03);
      // Upper wall with its window openings, and the wall plate / cornice on top. On a two-storey
      // camera side the upper storey's own course caps the cut there too.
      const holes = wins.filter((o) => o.wi.at > a && o.wi.at < e).map((o) => ({ u0: o.wi.at - o.ww / 2, u1: o.wi.at + o.ww / 2, y0: o.wy, y1: o.wy + o.wh }));
      band(fade, CUT_H, wallH, (kk, pp, y0, y1) => holed(W, kk, pp, a, e, y0, y1, face * 2, UPPER, holes));
      if (fade && multi) W.box(mk, mid, len, 0.16, WALL_T + 0.1, u, upCut - 0.08, 0, STONE_L, 0, 0.03);
      if (!keep) piece(len, wallH - 0.21, wallH + 0.03, WALL_T + 0.16, u, 0, TRIM);
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
    for (const dr of b.doors.filter((x) => x.side === side)) {
      const u0 = dr.at, u1 = dr.at + dr.w, uc = (u0 + u1) / 2;
      for (const uj of [u0 + 0.12, u1 - 0.12]) piece(0.34, 0, doorH, WALL_T + 0.2, uj, 0, FRAME, 0.04);
      piece(dr.w + 0.8, doorH, doorH + 0.36, WALL_T + 0.22, uc, 0, FRAME, 0.04);
      if (hall || !timber) piece(0.5, doorH + 0.05, doorH + 0.55, WALL_T + 0.3, uc, 0, STONE_L, 0.04);
      piece(dr.w, doorH + 0.36, wallH, face * 2, uc, 0, UPPER, 0.02);
      if (!keep) piece(dr.w, wallH - 0.21, wallH + 0.03, WALL_T + 0.16, uc, 0, TRIM);
      // (Not on the camera side: cut down with the wall they would read as stray planks.)
      if (!fade) for (const [hinge, dir] of [[u0, -1], [u1, 1]] as [number, number][]) {
        const leaf = dr.w / 2 - 0.1;
        piece(leaf, 0.08, doorH - 0.1, 0.1, hinge + (dir * leaf) / 2, -(WALL_T / 2 + 0.07), WOOD, 0.02);
      }
    }
    // Windows: glass in the middle of the wall (warm main lights, a sky-tinted top light), a stone
    // mullion and transom that read against the dark glass, a surround flush on both faces, a sill
    // ledge outside and (timber houses) shutters flat to the wall.
    for (const { wi, ww, wh, wy } of wins) {
      const top = wy + wh, tr = wy + wh * 0.66;
      const gm = !fade ? glass.still : wi.floor && multi ? glass.top : glass.mid;
      const [gk, gp] = at(fade, wy - 0.2);
      W.glass(gp, gm.warm, ww, tr - wy, 0.04, wi.at, (wy + tr) / 2, 0);
      W.glass(gp, gm.sky, ww, top - tr, 0.04, wi.at, (tr + top) / 2, 0);
      const MULL = timber ? TIMBER : STONE_L;
      if (keep) {
        // A castle lancet: the opening's head closes to a point (two springers leaning in from
        // each side), deep reveals, a pointed hood mould outside and a plain sill.
        for (const s of [-1, 1]) {
          W.box(gk, gp, ww / 2 + 0.16, 0.34, WALL_T, wi.at + s * (ww / 4 - 0.02), top - 0.12, 0, UPPER, s * -0.55, 0.02);
          W.box(gk, gp, ww / 2 + 0.5, 0.18, 0.2, wi.at + s * (ww / 4 + 0.02), top + 0.22, face + 0.08, STONE_L, s * -0.55, 0.02);
        }
        W.box(gk, gp, ww + 0.5, 0.14, 0.3, wi.at, wy - 0.07, face + 0.08, STONE_L, 0, 0.02);
        for (const s of [-1, 1]) W.box(gk, gp, 0.14, wh - 0.2, 0.16, wi.at + s * (ww / 2 + 0.07), wy + (wh - 0.2) / 2, face + 0.04, STONE_L, 0, 0.02);
        continue;
      }
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
      const mid = multi ? storeyH : wallH >= 7 ? wallH * 0.52 : wallH;
      if (L >= 10) {
        const open: [number, number][] = wins.map((o) => [o.wi.at - o.ww / 2 - 0.3, o.wi.at + o.ww / 2 + 0.3]);
        for (const dr of b.doors.filter((x) => x.side === side)) open.push([dr.at - 1.7, dr.at + dr.w + 1.7]);
        open.push([-9, lo + 0.4], [hi - 0.4, L + 9]);
        open.sort((p1, p2) => p1[0] - p2[0]);
        for (let i = 0; i + 1 < open.length; i++) {
          const g0 = open[i][1], g1 = open[i + 1][0];
          if (g1 - g0 < 1.3) continue;
          const p = (g0 + g1) / 2;
          piece(1.0, 1.1, mid, 0.5, p, WALL_T / 2 + 0.25, STONE_D, 0.05);
          piece(1.12, mid - 0.05, mid + 0.25, 0.62, p, WALL_T / 2 + 0.3, STONE_L, 0.04);
          piece(0.74, mid + 0.25, wallH - 0.1, 0.34, p, WALL_T / 2 + 0.17, STONE_D, 0.04);
        }
      }
      // The floor line: a string course outside, and inside (on the walls that
      // stay standing) the beam the upper floor's joists rest on.
      piece(hi - lo + 0.2, mid - 0.12, mid + 0.12, 0.12, (lo + hi) / 2, face + 0.05, STONE_D);
      if (!fade) {
        W.box(k, built, hi - lo, 0.3, 0.2, (lo + hi) / 2, storeyH - 0.35, -(face + 0.1), TIMBER, 0, 0.02);
        for (let t = lo + 0.8; t < hi - 0.5; t += 1.4) W.box(k, built, 0.26, 0.26, 0.24, t, storeyH - 0.66, -(face + 0.12), STONE_L, 0, 0.03);
      }
    }
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
    const base = floor ? storeyH : 0, top = floor ? wallH : Math.min(storeyH, wallH);
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
        // Runs reach into the outer walls and neighbouring partitions (no light gaps at the joints).
        const a = a0 - 0.08, e = e0 + 0.08;
        pbox(sk, sp, a, e, 0, 0.3, T + 0.1, STONE_D, 0.03);
        pbox(sk, sp, a, e, 0.3, CUT_H - 0.1, T, STONE);
        pbox(sk, sp, a, e, CUT_H - 0.12, CUT_H, T + 0.08, STONE_L, 0.03);
        pbox(hk, hp, a, e, CUT_H, top - base, T, keep ? PLASTER : UPPER);
      }
      for (const [da, dw] of pt.doors ?? []) {
        for (const j of [da + 0.1, da + dw - 0.1]) {
          pbox(sk, sp, j - 0.12, j + 0.12, 0, CUT_H, T + 0.14, FRAME, 0.03);
          pbox(hk, hp, j - 0.12, j + 0.12, CUT_H, 2.9, T + 0.14, FRAME, 0.03);
        }
        pbox(hk, hp, da - 0.2, da + dw + 0.2, 2.9, 3.2, T + 0.16, FRAME, 0.03);
        pbox(hk, hp, da, da + dw, 3.2, top - base, T, keep ? PLASTER : UPPER);
      }
    }
  }

  // ─── The upper floor's boards ───────────────────────────────────────────────
  if (multi) {
    // Oak boards on the joists, wall to wall, row by row, leaving the voids (a hall open to its
    // roof) and the stairwells open; a balustrade runs round every opening.
    const y = storeyH - 0.15;
    const open = (lx: number, lz: number) => isVoid(b, lx, lz) || (b.stairs ?? []).some((st) => inRect(stairRect(st), lx, lz));
    for (let lz = 1; lz < d - 1; lz++) {
      let a = -1;
      for (let lx = 1; lx <= w - 1; lx++) {
        const solid = lx < w - 1 && !open(lx, lz);
        if (solid && a < 0) a = lx;
        if (!solid && a >= 0) {
          const x0 = a === 1 ? 0.95 : a, x1 = lx === w - 1 ? w - 0.95 : lx, z0 = lz === 1 ? 0.95 : lz, z1 = lz === d - 2 ? d - 0.95 : lz + 1;
          cb(uk, mid, [x1 - x0, 0.3, z1 - z0], [(x0 + x1) / 2, y, (z0 + z1) / 2], PLANKS[1], undefined, 0.01);
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
        cb(uk, mid, along ? [1.0, 0.1, 0.12] : [0.12, 0.1, 1.0], [ex, storeyH + 0.95, ez], WOOD_D, undefined, 0.02);
        cb(uk, mid, [0.12, 0.95, 0.12], [ex - (along ? 0.45 : 0), storeyH + 0.47, ez - (along ? 0 : 0.45)], WOOD_D, undefined, 0.02);
      }
    }
  }
  /** Is a cell on a stair's head row (where the stair comes up: no rail across it)? */
  function headOf(lx: number, lz: number) {
    return (b.stairs ?? []).some((st) => {
      const [x0, z0, x1, z1] = stairRect(st);
      if (!inRect([x0, z0, x1, z1], lx, lz)) return false;
      return st.dir === 'n' ? lz === z0 : st.dir === 's' ? lz === z1 - 1 : st.dir === 'w' ? lx === x0 : lx === x1 - 1;
    });
  }

  // ─── Stairs ───────────────────────────────────────────────────────────────
  for (const st of b.stairs ?? []) flight(ik, ground, st, storeyH);

  // ─── The keep: entrance bay ────────────────────────────────────────────────
  if (keep) keepMasonry(band, b, face, [fk, lifted]);

  // ─── Roof ─────────────────────────────────────────────────────────────────
  const roofTop = roof(fk, lifted, b, UPPER);

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
      for (const f of b.fits ?? []) {
        if (f.kind === 'open_hearth') {
          // A square stone lantern on the leads, its louvred openings dark, a small capped top.
          cb(fk, lifted, [1.8, 1.4, 1.8], [f.x, wallH + 0.9, f.z], STONE, undefined, 0.04);
          for (const [dx, dz] of [[0.91, 0], [-0.91, 0], [0, 0.91], [0, -0.91]]) fk.box(lifted, [dz ? 0.8 : 0.04, 0.6, dz ? 0.04 : 0.8], [f.x + dx, wallH + 1.0, f.z + dz], DARK);
          cb(fk, lifted, [2.1, 0.24, 2.1], [f.x, wallH + 1.72, f.z], STONE_D, undefined, 0.03);
          continue;
        }
        if (f.kind !== 'fireplace' && f.kind !== 'hearth_oven') continue;
        // The hearth faces `rot` (0 = +Z): its back is toward the opposite wall.
        const r = f.rot ?? 0, bx = -Math.sin(r), bz = -Math.cos(r);
        const x = Math.abs(bx) > Math.abs(bz) ? (bx > 0 ? w - 0.9 : 0.9) : f.x, z = Math.abs(bx) > Math.abs(bz) ? f.z : bz < 0 ? 0.9 : d - 0.9;
        const top = roofTop + 1.4;
        cb(fk, lifted, [1.5, top - wallH, 1.5], [x, (wallH + top) / 2, z], STONE, undefined, 0.05);
        cb(fk, lifted, [1.8, 0.3, 1.8], [x, top + 0.1, z], STONE_D, undefined, 0.04);
        fk.box(lifted, [1.0, 0.06, 1.0], [x, top + 0.27, z], DARK);
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
      fg.position.set(f.x, floor ? storeyH : 0, f.z);
      fg.rotation.y = f.rot ?? 0;
      (floor ? mid : ground).add(fg);
      const res = FITS[f.kind]?.(floor ? uk : ik, fg, f, b, floor);
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
  finishProp(g, [k, mk, fk, ik, uk]);
  for (const m of [...ik.mats, ...uk.mats]) m.userData.noOcclude = true;
  for (const m of [...mk.mats, ...uk.mats]) cutPatch(m, uMid);
  for (const m of fk.mats) cutPatch(m, uTop);

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
    pbox(hk, hp, a - 0.1, e + 0.1, H - 0.05, H + 0.25, 0.42, TIMBER, 0.03);
  }
  // Over the opening: the cornice carries across on a deep beam.
  for (const [da, dw] of pt.doors ?? []) {
    pbox(hk, hp, da - 0.1, da + dw + 0.1, H - 0.45, H + 0.25, 0.42, TIMBER, 0.03);
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

// ─── The keep ────────────────────────────────────────────────────────────────

type KitAt = [ModelKit, Obj];

/**
 * The keep's projecting entrance bay round the great door, with the gate tower over it and the
 * lord's banner. It splits at the cuts like the south wall.
 */
function keepMasonry(band: Band, b: BuildingSpec, face: number, [fk, lifted]: KitAt) {
  const { d, wallH } = b, storeyH = b.storeyH ?? wallH;
  /** A box from y0 to y1 at (x, z), split at the cuts when `lift`. */
  const block = (lift: boolean, sx: number, sz: number, x: number, z: number, y0: number, y1: number, color: number, ch = 0.04) =>
    band(lift, y0, y1, (kk, pp, a, e) => cb(kk, pp, [sx, e - a, sz], [x, (a + e) / 2, z], color, undefined, ch));

  // ── Entrance bay round the great door ──
  const dr = b.doors.find((x) => x.side === 's' && x.w >= 4);
  if (dr) {
    const u0 = dr.at - 1.4, u1 = dr.at + dr.w + 1.4, P = 0.8, zf = d - 0.5 + face, zc = zf + P / 2 - 0.05;
    const BH = wallH, dh = 3.8;
    for (const [ua, ub] of [[u0, dr.at], [dr.at + dr.w, u1]]) {
      block(true, ub - ua, P + 0.4, (ua + ub) / 2, zc + 0.1, 0, 0.45, STONE_DD, 0.05);
      block(true, ub - ua, P, (ua + ub) / 2, zc, 0.45, BH, STONE, 0.04);
    }
    const uc = dr.at + dr.w / 2;
    // Stepped (corbelled) arch: two courses stepping in over the opening, a keystone above.
    block(true, dr.w, P, uc, zc, dh + 1.0, BH, STONE, 0.04);
    for (const [y, inset] of [[dh + 0.2, 0.35], [dh + 0.6, 0.75]] as [number, number][]) {
      for (const e of [-1, 1]) block(true, inset + 0.1, P + 0.12, uc + e * (dr.w / 2 - inset / 2 + 0.05), zc + 0.04, y - 0.2, y + 0.2, STONE_L, 0.03);
    }
    block(true, dr.w - 1.3, P + 0.14, uc, zc + 0.05, dh + 0.79, dh + 1.21, STONE_L, 0.03);
    const [ak, ap] = [fk, lifted];
    for (const e of [-1, 1]) block(true, 0.3, P + 0.14, uc + e * (dr.w / 2 + 0.15), zc + 0.04, 0.45, dh + 0.2, STONE_L, 0.03);
    band(true, dh + 1.1, dh + 1.8, (kk, pp) => kk.mesh(pp, taper(0.46, P + 0.2, 0.7, P + 0.2, 0.7), STONE_L, [uc, dh + 1.45, zc + 0.05]));
    // The gate tower: the bay rises on above the roofline as a square tower over the great door,
    // reaching back over the wall onto the roof deck, with a string course, a paired arched window,
    // a corbelled, crenellated parapet and a slate spire.
    const TWH = wallH + 4.6, zb0 = d - 3.4, zb1 = zf + P, tz = (zb0 + zb1) / 2, td = zb1 - zb0, tw = u1 - u0;
    cb(ak, ap, [tw, TWH - wallH + 0.1, td], [uc, (wallH - 0.1 + TWH) / 2, tz], STONE, undefined, 0.04);
    cb(ak, ap, [tw + 0.2, 0.24, td + 0.2], [uc, wallH + 0.05, tz], STONE_D, undefined, 0.03);
    // Its window: two dark lights under a stepped head, a mullion and a sill.
    const wy0 = wallH + 1.0, wy1 = wallH + 3.0;
    cb(ak, ap, [1.4, wy1 - wy0, 0.1], [uc, (wy0 + wy1) / 2, zb1 + 0.01], DARK, undefined, 0.01);
    cb(ak, ap, [0.2, wy1 - wy0, 0.2], [uc, (wy0 + wy1) / 2, zb1 + 0.04], STONE_L, undefined, 0.02);
    for (const s of [-1, 1]) {
      cb(ak, ap, [0.4, 0.3, 0.2], [uc + s * 0.55, wy1 - 0.15, zb1 + 0.04], STONE_L, undefined, 0.02);
      cb(ak, ap, [0.2, 0.3, 0.2], [uc + s * 0.45, wy1 - 0.45, zb1 + 0.04], STONE_L, undefined, 0.02);
    }
    cb(ak, ap, [1.9, 0.14, 0.3], [uc, wy0 - 0.07, zb1 + 0.1], STONE_L, undefined, 0.02);
    cb(ak, ap, [2.1, 0.2, 0.22], [uc, wy1 + 0.35, zb1 + 0.08], STONE_D, undefined, 0.03);
    // Corbels, parapet and merlons round a flat deck; the banner pole.
    for (let i = 0; i < 6; i++) {
      const t = -tw / 2 + 0.4 + (i * (tw - 0.8)) / 5;
      cb(ak, ap, [0.34, 0.4, 0.5], [uc + t, TWH - 0.2, zb1 + 0.12], STONE_D, undefined, 0.03);
    }
    cb(ak, ap, [tw + 0.7, 0.6, td + 0.7], [uc, TWH + 0.3, tz], STONE, undefined, 0.05);
    cb(ak, ap, [tw + 0.8, 0.16, td + 0.8], [uc, TWH + 0.66, tz], STONE_L, undefined, 0.03);
    for (let i = 0; i < 5; i++) cb(ak, ap, [0.72, 0.7, 0.5], [u0 + 0.2 + (i * (tw - 0.4)) / 4, TWH + 1.09, zb1 + 0.2], STONE, undefined, 0.04);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) cb(ak, ap, [0.5, 0.7, 0.72], [uc + s * (tw / 2 + 0.2), TWH + 1.09, zb0 + 0.5 + (i * (td - 1)) / 2], STONE, undefined, 0.04);
    cb(ak, ap, [0.12, 2.6, 0.12], [uc, TWH + 2.0, tz], IRON, undefined, 0.02);
    cb(ak, ap, [1.3, 0.75, 0.04], [uc + 0.67, TWH + 2.85, tz], RUG, undefined, 0.01);
    // The lord's banner on the bay, over the door: red with a gold dragon diamond (all of it above
    // the upper cut, so it goes whole).
    const zb = zf + P + 0.04, by = storeyH + CUT_H + 0.1;
    cb(ak, ap, [2.3, 0.14, 0.14], [uc, wallH - 0.3, zb + 0.05], WOOD_D, undefined, 0.02);
    cb(ak, ap, [1.9, wallH - 0.4 - by - 0.5, 0.06], [uc, (wallH - 0.4 + by + 0.5) / 2, zb], RUG, undefined, 0.01);
    ak.mesh(ap, wedge(1.9, 0.5, 0.06), RUG, [uc, by + 0.25, zb], [Math.PI, 0, 0]);
    ak.box(ap, [0.7, 0.7, 0.04], [uc, (wallH + by) / 2 + 0.3, zb + 0.04], RUG_TRIM, [0, 0, Math.PI / 4]);
    for (const e of [-1, 1]) ak.box(ap, [0.1, wallH - 0.4 - by - 0.5, 0.04], [uc + e * 0.8, (wallH - 0.4 + by + 0.5) / 2, zb + 0.04], RUG_TRIM);
  }
}

/**
 * A straight stair: solid stone steps from the floor up to the boards above, climbing toward its
 * `dir` along its flight, with a pale nosing on each tread.
 */
function flight(k: ModelKit, g: Obj, st: Stair, storeyH: number) {
  const [x0, z0, x1, z1] = stairRect(st), alongZ = st.dir === 'n' || st.dir === 's';
  const n = Math.max(4, Math.round(storeyH / 0.3)), L = alongZ ? z1 - z0 : x1 - x0, W = alongZ ? x1 - x0 : z1 - z0;
  const up = st.dir === 's' || st.dir === 'e' ? 1 : -1, start = up > 0 ? (alongZ ? z0 : x0) : alongZ ? z1 : x1;
  const t = L / n, cw = alongZ ? (x0 + x1) / 2 : (z0 + z1) / 2;
  for (let i = 0; i < n; i++) {
    const top = ((i + 1) * storeyH) / n, u = start + up * (i + 0.5) * t;
    const [px, pz] = alongZ ? [cw, u] : [u, cw];
    cb(k, g, alongZ ? [W - 0.1, top, t + 0.01] : [t + 0.01, top, W - 0.1], [px, top / 2, pz], i % 2 ? STONE : STONE_L, undefined, 0.02);
    const nose = start + up * i * t + up * 0.04;
    cb(k, g, alongZ ? [W - 0.06, 0.06, 0.1] : [0.1, 0.06, W - 0.06], alongZ ? [cw, top - 0.03, nose] : [nose, top - 0.03, cw], STONE_D, undefined, 0.01);
  }
}

/** Is local cell (lx, lz) inside a rectangle [x0, z0, x1, z1)? */
const inRect = ([x0, z0, x1, z1]: [number, number, number, number], lx: number, lz: number) => lx >= x0 && lx < x1 && lz >= z0 && lz < z1;

/**
 * The castle's roof: a flat lead deck (laid in sheets with standing rolls) inside a corbelled,
 * crenellated parapet with one merlon at each corner; a wall shared with a neighbour carries only
 * the neighbour's parapet, so a range of buildings reads as one even parapet. Big roofs (the wings)
 * take a stair turret on the middle of their back wall, a pair of chimney stacks in the side walls
 * and two glazed roof lanterns down the middle, all symmetric about the building's own axis.
 * Returns the parapet's top.
 */
function keepRoof(fk: ModelKit, p: Obj, b: BuildingSpec): number {
  const { w, d, wallH } = b, shared = new Set(b.shared ?? []), joined = new Set(b.joined ?? []);
  cb(fk, p, [w - 0.3, 0.3, d - 0.3], [w / 2, wallH + 0.05, d / 2], STONE_D, undefined, 0.03);
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    if (shared.has(side) || joined.has(side)) continue;
    const W = wallFrame(b, side), L = sideLen(b, side), o = WALL_T / 2 + 0.05, ns = side === 'n' || side === 's';
    // Along the north and south walls the ends at a shared wall stop short of it (the neighbour's
    // parapet runs there); the east and west walls leave the corner merlons to the north and south.
    const lo = ns && shared.has('w') ? 0.9 : 0, hi = ns && shared.has('e') ? L - 0.9 : L;
    for (let t = lo + 0.5; t < hi - 0.3; t += 0.95) W.box(fk, p, 0.36, 0.4, 0.5, t, wallH - 0.22, WALL_T / 2 + 0.15, STONE_D, 0, 0.03);
    W.box(fk, p, hi - lo + 0.2, 1.0, 0.7, (lo + hi) / 2, wallH + 0.5, o, STONE, 0, 0.03);
    W.box(fk, p, hi - lo + 0.3, 0.16, 0.84, (lo + hi) / 2, wallH + 1.05, o, STONE_L, 0, 0.03);
    const a = lo + 0.41, e = hi - 0.41, n = Math.max(1, Math.round((e - a) / 1.6));
    for (let i = 0; i <= n; i++) {
      const end = i === 0 || i === n;
      if (end && (!ns || (i === 0 && (shared.has('w') || joined.has('w'))) || (i === n && (shared.has('e') || joined.has('e'))))) continue;
      W.box(fk, p, 0.82, 0.74, 0.7, a + (i * (e - a)) / n, wallH + 1.5, o, STONE, 0, 0.04);
    }
  }
  // The leads: grey sheets with standing rolls across the short way.
  const along = w >= d;
  fk.box(p, [w - 1.8, 0.06, d - 1.8], [w / 2, wallH + 0.22, d / 2], LEAD);
  const span = along ? w - 1.8 : d - 1.8, cross = along ? d - 1.8 : w - 1.8;
  for (let t = -span / 2 + 1.3; t < span / 2 - 0.4; t += 1.3) {
    if (along) fk.box(p, [0.09, 0.07, cross], [w / 2 + t, wallH + 0.27, d / 2], LEAD_ROLL);
    else fk.box(p, [cross, 0.07, 0.09], [w / 2, wallH + 0.27, d / 2 + t], LEAD_ROLL);
  }
  if (w * d >= 150 && !b.doors.some((x) => x.side === 's' && x.w >= 4)) {
    // The stair turret on the middle of the back (north) wall, up from below onto the leads.
    const tx = w / 2, tz = 1.3, TH = wallH + 2.9;
    cb(fk, p, [2.4, TH - wallH, 2.4], [tx, (wallH + TH) / 2, tz], STONE, undefined, 0.04);
    cb(fk, p, [2.7, 0.2, 2.7], [tx, TH - 0.6, tz], STONE_D, undefined, 0.03);
    cb(fk, p, [2.8, 0.5, 2.8], [tx, TH + 0.1, tz], STONE, undefined, 0.04);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cb(fk, p, [0.7, 0.6, 0.7], [tx + dx * 1.05, TH + 0.65, tz + dz * 1.05], STONE, undefined, 0.04);
    cb(fk, p, [0.9, 1.8, 0.1], [tx, wallH + 1.2, tz + 1.21], DARK, undefined, 0.01);
    cb(fk, p, [1.2, 0.2, 0.18], [tx, wallH + 2.15, tz + 1.24], STONE_L, undefined, 0.02);
    // Chimney stacks in the side walls, level with each other.
    const stacks: [number, number][] = along ? [[w / 2, 0.6], [w / 2, d - 0.6]] : [[0.6, d * 0.55], [w - 0.6, d * 0.55]];
    for (const [cx, cz] of stacks) {
      cb(fk, p, [1.3, 2.6, 1.3], [cx, wallH + 1.3, cz], STONE, undefined, 0.04);
      cb(fk, p, [1.55, 0.26, 1.55], [cx, wallH + 2.7, cz], STONE_D, undefined, 0.03);
      fk.box(p, [0.8, 0.06, 0.8], [cx, wallH + 2.84, cz], DARK);
    }
    // Two glazed lanterns over the long room, on its axis, under low lead caps.
    for (const f of [0.45, 0.78]) {
      const lx = along ? w * f : w / 2, lz = along ? d / 2 : d * f;
      cb(fk, p, [1.8, 0.5, 1.8], [lx, wallH + 0.5, lz], STONE_D, undefined, 0.04);
      cb(fk, p, [1.5, 0.9, 1.5], [lx, wallH + 1.2, lz], STONE_L, undefined, 0.04);
      for (const [dx, dz] of [[0.76, 0], [-0.76, 0], [0, 0.76], [0, -0.76]]) fk.box(p, [dz ? 0.9 : 0.04, 0.55, dz ? 0.04 : 0.9], [lx + dx, wallH + 1.2, lz + dz], 0xffc870, undefined, 0xffa040, 0.7);
      fk.mesh(p, taper(1.9, 1.9, 0.5, 0.5, 0.5), LEAD_ROLL, [lx, wallH + 2.0, lz]);
    }
  }
  return wallH + 1.9;
}

/** The castle's lead roofs and their standing rolls. */
const LEAD = 0x5a5f68, LEAD_ROLL = 0x6c717a;

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
  fireplace: (k, g, _f, _b, floor) => {
    // A great hearth against the back wall (built facing +Z): stone surround, mantel, fire. Only
    // the ground floor's hearth lights the room (upstairs ones glow without a light of their own).
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
    // A hanging banner on the wall face (built facing +Z): red with a gold dragon diamond.
    cb(k, g, [1.7, 0.12, 0.12], [0, 4.1, 0.05], WOOD_D, undefined, 0.02);
    cb(k, g, [1.4, 2.6, 0.06], [0, 2.75, 0.06], RUG, undefined, 0.01);
    k.mesh(g, wedge(1.4, 0.5, 0.06), RUG, [0, 1.2, 0.06], [Math.PI, 0, 0]);
    k.box(g, [0.6, 0.6, 0.04], [0, 2.9, 0.1], RUG_TRIM, [0, 0, Math.PI / 4]);
    for (const x of [-0.62, 0.62]) k.box(g, [0.08, 2.6, 0.04], [x, 2.75, 0.1], RUG_TRIM);
  },
  rug: (k, g, f) => {
    const L = f.len ?? 4;
    k.box(g, [2.4, 0.03, L], [0, 0.1, 0], RUG);
    for (const x of [-1.05, 1.05]) k.box(g, [0.14, 0.035, L - 0.2], [x, 0.105, 0], RUG_TRIM);
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
    sh.position.set(-1.0, 1.05, 0.1);
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
    for (const [x, z] of [[-0.2, 0], [0.3, 0.1]]) cb(k, g, [0.2, 0.1, 0.2], [x, 0.78, z], 0x6a5a3a, undefined, 0.04);
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

/** Every furnishing kind (tests build them all). */
export const FIT_KINDS = Object.keys(FITS);

/** A spec for furnishings used out of doors (only the pillar reads it: the wall height). */
const OUTDOORS: BuildingSpec = { id: 'outdoors', style: 'timber', interior: 'shop', x: 0, z: 0, w: 1, d: 1, wallH: 3.6, roof: 0, doors: [], windows: [] };

/**
 * A furnishing as a free-standing world prop (layout props named `fit_<kind>`), so yards and
 * roadsides share the workshop furniture: benches, sacks, woodpiles, grindstones, bar stacks…
 */
export function buildFitProp(kind: string, len?: number): Prop {
  const k = new ModelKit(), g = new THREE.Group();
  const res = FITS[kind]?.(k, g, { kind, x: 0, z: 0, len }, OUTDOORS);
  finishProp(g, [k]);
  return { obj: g, tick: res?.tick, light: res?.light };
}

