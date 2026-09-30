import * as THREE from 'three';
import { ModelKit, PAL } from '../render/kit';
import { addPatch } from '../render/surface';
import { octagon, taper, wedge } from '../render/blocks';
import { inRoom, wallRuns, type BuildingSpec, type Fit, type Side } from './building';
import {
  BLOCKS, BRICK, BRICK_D, cb, chunk, COAL, DARK, finishProp, flame, IRON, IRON_L, light, masonry, PLASTER, PLOT_MARK, STONE, STONE_D, STONE_L,
  WOOD, WOOD_D, WOOD_L, type Prop,
} from './props';

/**
 * Enterable buildings, built from a BuildingSpec (building.ts) so the walls stand exactly on the
 * grid cells that block. Every building is split in two at CUT_H:
 *  - `built`: floor, the wall stubs all round, the back and side walls, and the furnishings;
 *  - `lifted`: the roof, the camera-side (south) wall above the stub and the gables. It dissolves
 *    with an ordered dither while the hero is inside (setCut), so the room opens up to the camera
 *    like a cutaway, leaving a clean stone course where the walls were cut.
 * Restorable plots also carry a `ruin` group: broken courses on the same footprint and rubble.
 */

/** Walls are cut down to this height (a clean stone course) while the hero is inside. */
export const CUT_H = 1.1;
const WALL_T = 0.9;
const FLOOR_STONE = 0x7e776c;
const PLANKS = [0x8a6440, 0x7a5636, 0x94704a];
const GLASS = 0xffc870, GLASS_GLOW = 0xffa040;
const SHUTTER = 0x3e5a58;
const RUG = 0x7a2020, RUG_TRIM = 0xc8a040;
/** Dark oak for the timber framing: clean flat colour (grain streaks read as stripes on long beams). */
export const TIMBER = 0x4b3122;

export interface BuildingProp extends Prop {
  spec: BuildingSpec;
  /** 0 = whole; 1 = roof and camera-side walls lifted away (hero inside). */
  setCut(v: number): void;
  /** Is a world point inside (floor or doorway)? */
  contains(x: number, z: number): boolean;
}

/** Dithered discard driven by a per-building uniform (0 = solid, 1 = gone). */
function cutPatch(mat: THREE.Material, u: { value: number }) {
  addPatch(mat, { key: 'cut', apply: (shader) => {
    shader.uniforms.uCut = u;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uCut;
        float cutBayer(vec2 p) {
          ivec2 i = ivec2(mod(p, 4.0));
          int idx = i.x + i.y * 4;
          float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          return (m[idx] + 0.5) / 16.0;
        }`,
      )
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uCut > cutBayer(gl_FragCoord.xy)) discard;');
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
  };
}

export function buildBuilding(b: BuildingSpec): BuildingProp {
  // k: walls (dissolve around the hero), fk: the lifted roof, ik: floor and furnishings (never
  // dissolved: the occluder cone would eat holes in the floor in front of the hero).
  const k = new ModelKit(), fk = new ModelKit(), ik = new ModelKit();
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  const floorG = new THREE.Group(), built = new THREE.Group(), lifted = new THREE.Group(), ruin = new THREE.Group();
  g.add(floorG, built, lifted, ruin);
  const { w, d, wallH } = b;
  const timber = b.style === 'timber', hall = b.style === 'hall';
  const UPPER = timber ? PLASTER : STONE;
  const TRIM = timber ? TIMBER : STONE_D;
  const FRAME = timber ? TIMBER : STONE_L;
  const doorH = hall ? 3.8 : timber ? 2.8 : 3.1;
  const shared = new Set(b.shared ?? []);
  const ticks: ((t: number) => void)[] = [];
  let lamp: THREE.PointLight | undefined;

  // ─── Floor ────────────────────────────────────────────────────────────────
  // Flagstones under every building (the ruin's floor too); timber houses lay planks over them.
  cb(ik, floorG, [w - 1.6, 0.06, d - 1.6], [w / 2, 0.02, d / 2], FLOOR_STONE, undefined, 0.02);
  if (timber) {
    for (let z = 1, row = 0; z < d - 1.01; z += 0.5, row++) {
      let u = 1 - (row % 3) * 0.6;
      for (let n = 0; u < w - 1; n++) {
        const l = 1.6 + ((row * 7 + n * 3) % 4) * 0.45;
        const a = Math.max(1, u), e = Math.min(w - 1, u + l);
        if (e - a > 0.2) cb(ik, built, [e - a - 0.03, 0.05, 0.47], [(a + e) / 2, 0.06, z + 0.25], PLANKS[(row + n) % 3], undefined, 0.015);
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
  const winW = hall ? 1.3 : 1.0, winH = hall ? 2.3 : 1.3, winY = hall ? 1.9 : 1.55;
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    if (shared.has(side)) continue;
    const W = wallFrame(b, side), fade = side === 's';
    const [uk, up] = fade ? [fk, lifted] : [k, built];
    // A vertical piece from y0 to y1 that splits at the cut on the camera side.
    const vert = (len: number, y0: number, y1: number, dep: number, u: number, off: number, color: number, ch = 0.03) => {
      if (y1 <= CUT_H || !fade) W.box(k, built, len, y1 - y0, dep, u, (y0 + y1) / 2, off, color, 0, ch);
      else if (y0 >= CUT_H) W.box(uk, up, len, y1 - y0, dep, u, (y0 + y1) / 2, off, color, 0, ch);
      else {
        W.box(k, built, len, CUT_H - y0, dep, u, (y0 + CUT_H) / 2, off, color, 0, ch);
        W.box(uk, up, len, y1 - CUT_H, dep, u, (CUT_H + y1) / 2, off, color, 0, ch);
      }
    };
    const ns = side === 'n' || side === 's';
    const runs = wallRuns(b, side).map(([a, e]) => (ns ? [a, e] : [Math.max(1, a), Math.min(d - 1, e)]) as [number, number]).filter(([a, e]) => e > a);
    const wins = b.windows.filter((wi) => wi.side === side);
    for (const [a, e] of runs) {
      const len = e - a, u = (a + e) / 2;
      // Stone plinth and stub (always standing), capped by a pale course that hides the cut.
      W.box(k, built, len, 0.34, WALL_T + 0.16, u, 0.17, 0, STONE_D, 0, 0.04);
      W.box(k, built, len, CUT_H - 0.34, WALL_T, u, 0.34 + (CUT_H - 0.34) / 2, 0, STONE, 0, 0.02);
      W.box(k, built, len, 0.16, WALL_T + 0.1, u, CUT_H - 0.05, 0, STONE_L, 0, 0.03);
      // Upper wall and the wall plate / cornice on top.
      W.box(uk, up, len, wallH - CUT_H, timber ? WALL_T - 0.08 : WALL_T, u, CUT_H + (wallH - CUT_H) / 2, 0, UPPER, 0, 0.02);
      W.box(uk, up, len, 0.24, WALL_T + 0.16, u, wallH - 0.09, 0, TRIM, 0, 0.03);
      if (timber) {
        // Timber frame: posts at the ends and between the windows (never across one), a sill beam
        // on the stone course and knee-free diagonal braces only in blank panels.
        W.box(uk, up, len, 0.2, WALL_T + 0.06, u, CUT_H + 0.1, 0, TIMBER, 0, 0.02);
        // End posts stand a little proud of the plaster's end, so the two faces never z-fight.
        const posts = [a + 0.09, e - 0.09];
        const clear = (p: number) => wins.every((wi) => Math.abs(p - wi.at) > winW / 2 + 0.4);
        for (let p = a + 2.2; p < e - 1.2; p += 2.2) {
          let q = p;
          if (!clear(q)) q = [q - 0.9, q + 0.9, q - 1.3, q + 1.3].find(clear) ?? NaN;
          if (!Number.isNaN(q) && q > a + 0.8 && q < e - 0.8) posts.push(q);
        }
        posts.sort((x, y) => x - y);
        const H = wallH - CUT_H;
        for (const p of posts) W.box(uk, up, 0.24, H, WALL_T + 0.04, p, CUT_H + H / 2, 0, TIMBER, 0, 0.02);
        for (let i = 0; i + 1 < posts.length; i++) {
          const pa = posts[i], pb = posts[i + 1], span = pb - pa - 0.24;
          if (span < 1.2 || wins.some((wi) => wi.at > pa - winW / 2 && wi.at < pb + winW / 2)) continue;
          const rise = H - 0.5, ang = Math.atan2(rise, span) * (i % 2 ? 1 : -1);
          W.box(uk, up, Math.hypot(span, rise), 0.17, WALL_T + 0.02, (pa + pb) / 2, CUT_H + 0.2 + rise / 2, 0, TIMBER, ang, 0.01);
        }
      }
    }
    // Doorways: jambs, lintel, the wall above, and the leaves folded back against the inner face.
    for (const dr of b.doors.filter((x) => x.side === side)) {
      const u0 = dr.at, u1 = dr.at + dr.w, uc = (u0 + u1) / 2;
      for (const uj of [u0 + 0.12, u1 - 0.12]) vert(0.34, 0, doorH, WALL_T + 0.2, uj, 0, FRAME, 0.04);
      W.box(uk, up, dr.w + 0.8, 0.36, WALL_T + 0.22, uc, doorH + 0.18, 0, FRAME, 0, 0.04);
      if (hall || !timber) W.box(uk, up, 0.5, 0.5, WALL_T + 0.3, uc, doorH + 0.3, 0, STONE_L, 0, 0.04);
      W.box(uk, up, dr.w, wallH - doorH - 0.36, WALL_T, uc, (doorH + 0.36 + wallH) / 2, 0, UPPER, 0, 0.02);
      W.box(uk, up, dr.w, 0.24, WALL_T + 0.16, uc, wallH - 0.09, 0, TRIM, 0, 0.03);
      // (Not on the camera side: cut down with the wall they would read as stray planks.)
      if (!fade) for (const [hinge, dir] of [[u0, -1], [u1, 1]] as [number, number][]) {
        const leaf = dr.w / 2 - 0.1;
        vert(leaf, 0.08, doorH - 0.1, 0.1, hinge + (dir * leaf) / 2, -(WALL_T / 2 + 0.07), WOOD, 0.02);
      }
    }
    // Windows: a glowing pane through the wall with a proper surround (sill, lintel, jambs) on both
    // faces and shutters outside on timber houses. Nothing crosses the glass.
    for (const wi of wins) {
      const top = winY + winH;
      W.box(uk, up, winW, winH, WALL_T + 0.04, wi.at, winY + winH / 2, 0, GLASS, 0, 0.01, GLASS_GLOW, 1.1);
      for (const o of [1, -1]) {
        const off = o * (WALL_T / 2 + 0.05);
        W.box(uk, up, winW + 0.4, 0.16, 0.2, wi.at, winY - 0.08, off, FRAME, 0, 0.02);
        W.box(uk, up, winW + 0.4, 0.22, 0.2, wi.at, top + 0.11, off, FRAME, 0, 0.02);
        for (const e of [-1, 1]) W.box(uk, up, 0.16, winH, 0.16, wi.at + e * (winW / 2 + 0.08), winY + winH / 2, off, FRAME, 0, 0.02);
      }
      if (timber) for (const e of [-1, 1]) W.box(uk, up, winW / 2, winH, 0.07, wi.at + e * (winW * 0.75 + 0.2), winY + winH / 2, WALL_T / 2 + 0.09, SHUTTER, 0, 0.01);
      if (hall) W.box(uk, up, winW * 0.6, 0.3, WALL_T + 0.04, wi.at, top + 0.37, 0, GLASS, 0, 0.01, GLASS_GLOW, 1.1);
    }
    // Stone buildings: buttresses on the outer face of long walls, between doors and windows.
    if (!timber && ns) {
      const busy = (p: number) => wins.some((wi) => Math.abs(p - wi.at) < winW / 2 + 0.7) || b.doors.some((dr) => dr.side === side && p > dr.at - 0.8 && p < dr.at + dr.w + 0.8);
      for (let p = 3; p < w - 2.5; p += hall ? 4 : 5) {
        if (busy(p)) continue;
        vert(0.8, 0, wallH - 0.6, 0.5, p, WALL_T / 2 + 0.24, STONE_D, 0.05);
      }
    }
  }
  // Stone corners: quoins in alternating courses (the camera-side pair lift with the wall).
  if (!timber) {
    for (const [cx, cz] of [[0.5, 0.5], [w - 0.5, 0.5], [0.5, d - 0.5], [w - 0.5, d - 0.5]]) {
      const fade = cz > d / 2;
      for (let y = 0.34, i = 0; y < wallH - 0.3; y += 0.52, i++) {
        const [kk, pp] = fade && y + 0.25 > CUT_H ? [fk, lifted] : [k, built];
        cb(kk, pp, i % 2 ? [1.12, 0.48, 1.0] : [1.0, 0.48, 1.12], [cx, y + 0.25, cz], i % 2 ? STONE_L : STONE_D, undefined, 0.04);
      }
    }
  }

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
  for (const f of b.fits ?? []) {
    const fg = new THREE.Group();
    fg.position.set(f.x, 0, f.z);
    fg.rotation.y = f.rot ?? 0;
    built.add(fg);
    const res = FITS[f.kind]?.(ik, fg, f, b);
    if (res?.tick) ticks.push(res.tick);
    if (res?.light) lamp = res.light;
    // Ruined plots show a heap of fallen stone where the furniture will stand.
    if (b.restore && f.block) {
      for (let i = 0; i < 3; i++) chunk(k, ruin, Math.floor(f.x * 13 + f.z * 7) + i, [0.7, 0.45, 0.6], [f.x + (i - 1) * 0.5, -0.05, f.z + ((i * 37) % 3 - 1) * 0.25], BLOCKS[i % 3], i);
    }
  }

  // ─── Ruin (restorable plots) ──────────────────────────────────────────────
  if (b.restore) buildRuin(k, ruin, b);

  // ─── Materials ────────────────────────────────────────────────────────────
  finishProp(g, [k, fk, ik]);
  for (const m of ik.mats) m.userData.noOcclude = true;
  const u = { value: 0 };
  for (const m of fk.mats) cutPatch(m, u);

  let cutV = 0, restored = !b.restore;
  const apply = () => {
    u.value = cutV;
    built.visible = restored;
    ruin.visible = !restored;
    lifted.visible = restored && cutV < 0.999;
    const shadow = cutV < 0.001;
    lifted.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = shadow;
    });
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
    setCut: (v) => {
      const nv = Math.max(0, Math.min(1, v));
      if (nv === cutV) return;
      cutV = nv;
      apply();
    },
    contains: (x, z) => inRoom(b, x, z),
  };
}

/** Emblem on each building's front gable. */
const PEDIMENT: Partial<Record<string, number>> = { bank: PAL.gold, shop: PAL.gold, hall: PAL.gold, smelter: 0xff7a30, alchemy: PLOT_MARK.alchemy_lab };

/** Gable roof (ridge along the longer side) or a flat crenellated deck. Returns the ridge height. */
function roof(fk: ModelKit, p: Obj, b: BuildingSpec, gableCol: number): number {
  const { w, d, wallH } = b;
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

// ─── Furnishings ─────────────────────────────────────────────────────────────

type FitBuilder = (k: ModelKit, g: Obj, f: Fit, b: BuildingSpec) => { tick?: (t: number) => void; light?: THREE.PointLight } | void;

const FITS: Record<string, FitBuilder> = {
  pillar: (k, g, _f, b) => {
    // A square hall column with a stepped base and capital, up to the wall plate.
    const H = b.wallH;
    cb(k, g, [1.0, 0.36, 1.0], [0, 0.18, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.72, H - 0.9, 0.72], [0, 0.36 + (H - 0.9) / 2, 0], STONE, undefined, 0.06);
    cb(k, g, [1.0, 0.36, 1.0], [0, H - 0.36, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.86, 0.2, 0.86], [0, H - 0.08, 0], STONE_L, undefined, 0.04);
  },
  fireplace: (k, g) => {
    // A great hearth against the back wall (built facing +Z): stone surround, mantel, fire.
    cb(k, g, [3.6, 3.0, 0.9], [0, 1.5, 0], STONE_D, undefined, 0.06);
    cb(k, g, [4.0, 0.34, 1.1], [0, 3.1, 0.1], STONE_L, undefined, 0.05);
    for (const x of [-1.45, 1.45]) cb(k, g, [0.6, 2.2, 1.1], [x, 1.1, 0.12], STONE, undefined, 0.05);
    k.box(g, [2.3, 1.9, 0.6], [0, 0.95, 0.2], DARK);
    cb(k, g, [3.4, 0.16, 1.4], [0, 0.08, 0.75], STONE_L, undefined, 0.03);
    for (const x of [-0.35, 0.35]) cb(k, g, [0.26, 0.26, 1.2], [x, 0.3, 0.35], WOOD_D, [0, x, 0], 0.08);
    k.box(g, [1.3, 0.1, 0.5], [0, 0.2, 0.35], 0x3a1206, undefined, PAL.fire, 1.2);
    const f = flame(k, g, 0, 0.3, 0.35, 1.1);
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
  high_table: (k, g) => {
    // The lord's table across the dais, with a tall carved chair behind it.
    cb(k, g, [4.2, 0.24, 5.2], [0, 0.12, -0.4], STONE_L, undefined, 0.04);
    cb(k, g, [3.6, 0.12, 1.2], [0, 1.06, 0.3], WOOD_D, undefined, 0.03);
    cb(k, g, [3.4, 0.8, 1.0], [0, 0.64, 0.3], WOOD, undefined, 0.03);
    cb(k, g, [0.9, 0.5, 0.8], [0, 0.49, -0.8], WOOD_D, undefined, 0.03);
    cb(k, g, [0.9, 1.9, 0.18], [0, 1.2, -1.15], WOOD_D, undefined, 0.03);
    cb(k, g, [0.7, 0.9, 0.06], [0, 1.4, -1.04], RUG, undefined, 0.01);
    k.mesh(g, taper(0.9, 0.18, 0.3, 0.18, 0.4), WOOD_D, [0, 2.35, -1.15]);
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
  shelf: (k, g) => {
    // Shelves against a wall (built facing +Z), stocked with jars, bolts of cloth and crates.
    cb(k, g, [2.6, 2.4, 0.55], [0, 1.2, 0], WOOD_D, undefined, 0.03);
    k.box(g, [2.4, 2.2, 0.1], [0, 1.2, 0.2], 0x2a1d14);
    for (const y of [0.55, 1.2, 1.85]) cb(k, g, [2.5, 0.08, 0.55], [0, y, 0.05], WOOD, undefined, 0.02);
    const goods = [0xa03030, 0x3a6a9a, 0xc8a040, 0x4a7a3a, 0xe8dcc0, 0x8a5aa0];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
      const c = goods[(r * 4 + i) % goods.length];
      cb(k, g, [0.34, 0.34 + ((i + r) % 2) * 0.1, 0.32], [-0.9 + i * 0.6, 0.78 + r * 0.65, 0.06], c, undefined, 0.05);
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
    k.box(g, [1.0, 0.05, 1.0], [0, 0.88, 0], 0x5ad07a, undefined, 0x3aa05a, 1.4);
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
};

/** Every furnishing kind (tests build them all). */
export const FIT_KINDS = Object.keys(FITS);

