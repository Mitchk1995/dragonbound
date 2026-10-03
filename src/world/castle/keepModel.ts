import * as THREE from 'three';
import { ModelKit, PAL, type V3 } from '../../render/kit';
import { addPatch } from '../../render/surface';
import { drumStones, type DrumNotch } from '../../render/masonry';
import { hash01, taper } from '../../render/blocks';
import { fitsOf, inRoom, isVoid, raisedAt, stairParts, stairRect, stairSteps, flightsOf, type BuildingSpec, type Floor, type Side } from '../building';
import { buildFitProp, CUT_H, TIMBER, type BuildingProp } from '../buildingModel';
import {
  archDressing, archInset, archRing, ASHLAR_B, ASHLAR_L, BASE, BASE_COURSE, cb, DECK, deep, DRESS, drum, finishProp, flag, GILT, HERALD_BLUE,
  LAMP_NAVY, livery, pointedArch, pointedDoor, ROOF_BLUE, ROOF_BLUE_L, ROOF_ROLL, singleDoor, spandrels, spire, spread,
} from '../props';
import { carved, drumDoorway, glazedWindow, paved, type Span, type WindowRoom } from '../castleProps/curtain';
import { FRONTISPIECE, GREAT_DOOR, KEEP_H, KEEP_WINDOWS, RANGE_ON_FLANK, TURRET, TURRETS, WALK_DOOR_U, type KeepWindow } from './keepSpec';
import { CURTAIN, RANGE } from './plan';

/**
 * The great keep's model (castle v4, stage 2), built from its spec (keepSpec.ts) in the castle's
 * ivory stone on its course lines, in the keep's own space (x east and z south from its north-west
 * corner, y up from its floor):
 *  - the walls a metre thick, every window a real one from the castle's glazing kit (an opening through
 *    the wall, leaded blue-tinted glass, and the throne hall itself behind it, or a lit room behind the
 *    great chamber's small lights), sizes falling storey by storey, string courses at the gallery's and
 *    the great chamber's levels, and a machicolated parapet on corbels cut from the same stone, a plain
 *    gilt band along it, over a lead roof deck;
 *  - a round turret on each corner, laid in rings of flat stones, rising a stage over the parapet to a
 *    corbelled crown and a blue spire (its quarter inside the keep cut away: the hall's corner is the
 *    keep's), the front pair's spiral stairs lit by slit lights stepping up round them, a door from
 *    each onto the leads;
 *  - on the axis the frontispiece between two pinnacles: the 8 m great door's arch through it (the
 *    doorway's square head under a tympanum carved with the lord's crest), the showpiece window over it
 *    (plate tracery: two tall lights and one in the head), the crest under its crenellated top;
 *  - the back half standing out of the moat on a battered plinth stepped down to the moat's bed;
 *  - the lord's two long banners in the front's side bays, the great flag on its pole over the roof;
 *  - inside, the throne hall open to the great chamber's floor: the dais, the crimson runner from the
 *    great door, four piers carrying the galleries' beams, the two stairs with their half landings and
 *    the doors into the turrets' stairs, the galleries' oak floors behind a stone balustrade, the doors
 *    onto the wall walks and into the great hall and the chapel.
 * While the hero is inside it opens round them as every castle building does (buildingModel.ts): the
 * camera-side walls and the front turrets cut down to the base course, the galleries with them on the
 * ground floor, the ceiling, the roof and everything over it on either floor. It opens the same way while
 * the hero stands at the great hall's or the chapel's end against it, where the camera would otherwise
 * stand inside a front turret.
 */

type Obj = THREE.Object3D;
type KitAt = [ModelKit, Obj];
type Put = (k: ModelKit, p: Obj, y0: number, y1: number) => void;

/**
 * The keep's size (its walls' outer faces) and its walls' thickness (a hair over the metre of its grid's
 * wall cells, so the great hall's and the chapel's walls, which run on into its flanks, end inside them).
 */
const S = 24, T = 1.02;
const UP = KEEP_H.gallery + CUT_H;
const OFF = 1e5;
const FLOOR = 0x7e776c;
const PLANKS = [0x8a6440, 0x7a5636, 0x94704a];
/** The crimson cloth inside (rugs and runners stay crimson; the livery outside is blue). */
const RUG = 0x7a2020, RUG_TRIM = 0xc8a040;
/** How far the deep base course stands proud of the walls, and each step of the plinth under it. */
const BAND_OUT = 0.3, STEP_OUT = 0.15;

/** Clean horizontal cut, as buildingModel's: fragments above world height `u` are cut away. */
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

/**
 * A face's frame: a group on the face's outer plane, its +Z looking out of the wall and its X running
 * along it (the wall in z −T..0). `u` (along the face from its low end: x on the north and south
 * faces, z on the west and east) is frame X `fu(side, u)`.
 */
const FRAME: Record<Side, { pos: V3; rot: number }> = {
  s: { pos: [0, 0, S], rot: 0 }, n: { pos: [S, 0, 0], rot: Math.PI }, e: { pos: [S, 0, S], rot: Math.PI / 2 }, w: { pos: [0, 0, 0], rot: -Math.PI / 2 },
};
const fu = (side: Side, u: number) => (side === 's' || side === 'w' ? u : S - u);

/** A pointed arch's springing rise for an opening `w` wide whose apex is `h` up (pointedArch's). */
const riseOf = (w: number, h: number) => pointedArch(w, h, 2).ah;

export function buildKeep(b: BuildingSpec, baseY = 0): BuildingProp {
  // k: what stands (dissolving round the hero like any occluder); mk: what goes with the ground floor's
  // cut (the camera side up to the upper cut, the galleries); fk: what goes on either floor (the
  // camera side over the upper cut, the ceiling, the roof and all over it); ik: the floor and the
  // ground floor's dressing (never dissolved); uk: the galleries' floors and their dressing; ek: the
  // few whole pieces on the front that stand across the upper cut (the crest, the porch's spandrels),
  // which are always shown, cut clean by the shader at the cut the hero stands under (the ground
  // floor's, or upstairs the upper cut).
  const k = new ModelKit(), mk = new ModelKit(), fk = new ModelKit(), ik = new ModelKit(), uk = new ModelKit(), ek = new ModelKit();
  const g = new THREE.Group();
  g.position.set(b.x, baseY, b.z);
  const floorG = new THREE.Group(), built = new THREE.Group(), lifted = new THREE.Group(), mid = new THREE.Group(), edge = new THREE.Group();
  const ground = new THREE.Group();
  g.add(floorG, built, lifted, mid, edge);
  built.add(ground);
  const storeyH = b.storeyH ?? KEEP_H.gallery;

  /** A vertical span, split at the cuts on the camera side (as buildingModel's band). */
  const band = (lift: boolean, y0: number, y1: number, put: Put) => {
    if (!lift) return put(k, built, y0, y1);
    const bands: [number, number, ModelKit, Obj][] = [[-1e9, CUT_H, k, built], [CUT_H, UP, mk, mid], [UP, 1e9, fk, lifted]];
    for (const [a, e, kk, pp] of bands) {
      const lo = Math.max(y0, a), hi = Math.min(y1, e);
      if (hi - lo > 0.004) put(kk, pp, lo, hi);
    }
  };
  /** The kit and group for a whole piece by the height of its foot. */
  const at = (lift: boolean, y: number): KitAt => (!lift || y < CUT_H - 0.001 ? [k, built] : y < UP - 0.001 ? [mk, mid] : [fk, lifted]);
  /**
   * The same on a face: the camera side splits at the cuts; the other faces stand to the great chamber's
   * floor, and over it go with the ceiling (inside, the great chamber is cut away with its floor).
   */
  const bandOn = (side: Side, y0: number, y1: number, put: Put) => {
    if (side === 's') return band(true, y0, y1, put);
    const H = KEEP_H.chamber;
    if (y0 < H - 0.004) put(k, built, y0, Math.min(y1, H));
    if (y1 > H + 0.004) put(fk, lifted, Math.max(y0, H), y1);
  };
  const atOn = (side: Side, y: number): KitAt => (side === 's' ? at(true, y) : y < KEEP_H.chamber - 0.001 ? [k, built] : [fk, lifted]);

  // ─── Frames ─────────────────────────────────────────────────────────────────
  const frames = new Map<string, THREE.Group>();
  const frame = (side: Side, p: Obj) => {
    const key = `${side}:${p.uuid}`;
    let f = frames.get(key);
    if (!f) {
      f = new THREE.Group();
      f.position.set(...FRAME[side].pos);
      f.rotation.y = FRAME[side].rot;
      p.add(f);
      frames.set(key, f);
    }
    return f;
  };
  /** A box in a face's frame (x along, y up, z out of the face), in the kit and group given. */
  const fbox = (side: Side, [kk, pp]: KitAt, size: V3, pos: V3, color: number, ch = 0.03) => cb(kk, frame(side, pp), size, pos, color, undefined, ch);

  // ─── The walls and their openings ────────────────────────────────────────────
  // Each face is laid as one block of walling with its openings left in it (carved), split at the cuts
  // on the camera side. North and south run corner to corner; west and east between them.
  const holes = new Map<Side, Span[]>([['n', []], ['s', []], ['e', []], ['w', []]]);
  const roomOf = (w: KeepWindow): WindowRoom | undefined => (w.chamber ? { w: w.w + 0.8, d: 2.0, floor: w.sill - KEEP_H.chamber - 0.25, ceil: 0.5 } : undefined);
  /** One real window on a face (or two lights under one hood for a pair), its opening `T` deep through the wall. */
  const glaze = (side: Side, wi: KeepWindow) => {
    const x = fu(side, wi.u), kp = atOn(side, wi.sill - 0.2), f = frame(side, kp[1]);
    const lights: [number, number][] = wi.kind === 'pair' ? [[x - 0.8, 0.95], [x + 0.8, 0.95]] : [[x, wi.w]];
    for (const [lx, lw] of lights) {
      // (A great chamber light's lit room stands in the closed chamber behind the wall.)
      holes.get(side)!.push(glazedWindow(kp[0], f, lx, wi.sill, 0, { w: lw, h: wi.h, T, stone: ASHLAR_B, room: roomOf(wi) }).hole);
    }
    if (wi.kind === 'pair') {
      // One hood over both lights: a drip stone along their heads, dropping a little at each end.
      const top = wi.sill + wi.h + 0.34;
      fbox(side, kp, [3.5, 0.16, 0.2], [x, top + 0.08, 0.1], DRESS, 0.02);
      for (const s of [-1, 1]) fbox(side, kp, [0.18, 0.5, 0.2], [x + s * 1.66, top - 0.25 + 0.08, 0.1], DRESS, 0.02);
    }
  };
  for (const wi of KEEP_WINDOWS) if (wi.kind !== 'showpiece') glaze(wi.side, wi);

  // The lord's doors into the great hall's dais and the chapel's west end: a pointed doorway two wide
  // through the shared wall, one ring of dressed stone round it on both faces, the lord's blue leaves
  // in the middle of the wall. (The same door from both sides.)
  const LORD = { w: 2, h: 4.05 }, lordRise = Math.min(LORD.w * 0.62, 1.7);
  for (const side of ['w', 'e'] as Side[]) {
    const dr = b.doors.find((d) => d.side === side);
    if (!dr) continue;
    const x = fu(side, dr.at + dr.w / 2), f = frame(side, built);
    holes.get(side)!.push({ x0: x - LORD.w / 2, x1: x + LORD.w / 2, y0: 0, y1: LORD.h, z0: -T - 0.01, z1: 0.01 });
    k.mesh(f, spandrels(LORD.w, LORD.h, T - 0.02, lordRise), ASHLAR_B, [x, 0, -T / 2]);
    for (const [z, rot] of [[0, 0], [-T, Math.PI]] as [number, number][]) {
      const face = new THREE.Group();
      face.position.set(x, 0, z);
      face.rotation.y = rot;
      f.add(face);
      for (const st of archDressing(LORD.w, LORD.h, lordRise, { foot: 0, t: 0.48, p: 0.08, dep: 0.3, inset: 0.02 })) k.mesh(face, st.geo, DRESS, [0, 0, 0]);
    }
    const leaves = archInset(LORD.w, LORD.h - 0.05, lordRise, 0.09), dg = new THREE.Group();
    dg.position.set(x, 0.05, -T / 2);
    f.add(dg);
    pointedDoor(k, dg, leaves.w, leaves.h, leaves.rise, 'building', true);
    fbox(side, [ik, floorG], [LORD.w - 0.02, 0.08, T + 0.06], [x, 0.04, -T / 2], DRESS, 0.02);
  }

  // The galleries' doors onto the north wall walks: one leaf in a pointed doorway through the flank,
  // a ring of dressed stone round it on both faces, its sill on the walk's deck.
  const WD = { w: 1.3, h: 3.0 }, wdRise = Math.min(WD.w * 0.866, WD.h * 0.62);
  for (const side of ['w', 'e'] as Side[]) {
    const x = fu(side, WALK_DOOR_U), f = frame(side, built), y = KEEP_H.walk;
    holes.get(side)!.push({ x0: x - WD.w / 2, x1: x + WD.w / 2, y0: y, y1: y + WD.h, z0: -T - 0.01, z1: 0.01 });
    k.mesh(f, spandrels(WD.w, WD.h, T - 0.02, wdRise), ASHLAR_B, [x, y, -T / 2]);
    for (const [z, rot] of [[0, 0], [-T, Math.PI]] as [number, number][]) {
      const face = new THREE.Group();
      face.position.set(x, 0, z);
      face.rotation.y = rot;
      f.add(face);
      archRing(k, face, 0, y, 0, WD.w, WD.h, { n: 4, t: 0.2, p: 0.06, dep: 0.02, rise: wdRise, jamb: true });
    }
    fbox(side, [k, built], [WD.w - 0.02, 0.1, T + 0.06], [x, y - 0.02, -T / 2], DRESS, 0.02);
    const d = new THREE.Group();
    d.position.set(x, y, -T / 2);
    f.add(d);
    pointedDoor(k, d, WD.w, WD.h, wdRise, 'single', false, 0.06);
  }

  // The great door: in the wall behind the frontispiece's porch, the doorway four wide under a square
  // head (the leaves stand open inside: the great_doors prop), its lintel one course of dressed stone,
  // the tympanum over it carved with the lord's crest.
  {
    const x = 12, hw = GREAT_DOOR.w / 2;
    holes.get('s')!.push({ x0: x - hw, x1: x + hw, y0: 0, y1: GREAT_DOOR.head, z0: -T - 0.01, z1: 0.01 });
    band(true, GREAT_DOOR.head, GREAT_DOOR.head + 0.5, (kk, pp, y0, y1) => cb(kk, frame('s', pp), [GREAT_DOOR.arch, y1 - y0, 0.1], [x, (y0 + y1) / 2, 0.05], DRESS, undefined, 0.02));
    fbox('s', [ik, floorG], [GREAT_DOOR.w + 0.2, 0.08, T + FRONTISPIECE.out], [x, 0.04, (FRONTISPIECE.out - T) / 2], DRESS, 0.02);
    crest(ek, frame('s', edge), x, 5.15, 0.0, 0.85);
  }

  // ─── The frontispiece ───────────────────────────────────────────────────────
  const F = FRONTISPIECE, fx0 = F.x0, fx1 = F.x1, fz = F.out, fc = (fx0 + fx1) / 2;
  const porchRise = riseOf(GREAT_DOOR.arch, GREAT_DOOR.apex);
  /** The showpiece: an arch 4.2 by 7.9 sunk 0.3 into the frontispiece, two tall lights and one in its head (plate tracery). */
  const show = KEEP_WINDOWS.find((w) => w.kind === 'showpiece')!;
  const SINK = 0.3, showRise = riseOf(show.w, show.h);
  const fHoles: Span[] = [
    { x0: fc - GREAT_DOOR.arch / 2, x1: fc + GREAT_DOOR.arch / 2, y0: 0, y1: GREAT_DOOR.apex, z0: -0.01, z1: fz + 0.01 },
    { x0: fc - show.w / 2, x1: fc + show.w / 2, y0: show.sill, y1: show.sill + show.h, z0: fz - SINK, z1: fz + 0.01 },
  ];
  {
    const [sk, sp] = at(true, show.sill);
    ek.mesh(frame('s', edge), spandrels(GREAT_DOOR.arch, GREAT_DOOR.apex, fz, porchRise), ASHLAR_B, [fc, 0, fz / 2]);
    // (The porch arch's dressing, stone by stone in the band its foot stands in.)
    for (const st of archDressing(GREAT_DOOR.arch, GREAT_DOOR.apex, porchRise, { foot: 0, t: 0.62, p: 0.14, dep: 0.3 })) {
      const [dk, dp] = at(true, Math.max(st.y, 0.01));
      dk.mesh(frame('s', dp), st.geo, DRESS, [fc, 0, fz]);
    }
    sk.mesh(frame('s', sp), spandrels(show.w, show.h, SINK, showRise), ASHLAR_B, [fc, show.sill, fz - SINK / 2]);
    archRing(sk, frame('s', sp), fc, show.sill, fz, show.w, show.h, { n: 6, t: 0.42, p: 0.12, dep: SINK + 0.02, jamb: true });
    cb(sk, frame('s', sp), [show.w + 0.9, 0.5, 0.12], [fc, show.sill - 0.25, fz + 0.06], DRESS, undefined, 0.02);
    const T2 = fz - SINK + T;
    for (const [lx, lw, ly, lh] of [[fc - 1.0, 1.4, show.sill + 0.1, 6.0], [fc + 1.0, 1.4, show.sill + 0.1, 6.0], [fc, 0.8, show.sill + 6.62, 0.95]]) {
      const { hole } = glazedWindow(sk, frame('s', sp), lx, ly, fz - SINK, { w: lw, h: lh, T: T2, stone: ASHLAR_B });
      fHoles.push(hole);
      holes.get('s')!.push(hole);
    }
  }
  // Its body, laid round the porch and the showpiece, rising a course over its cornice as the parapet.
  const fTop = F.top + 1.0;
  band(true, 0, fTop, (kk, pp, y0, y1) => carved(kk, frame('s', pp), [fx1 - fx0, y1 - y0, fz], [fc, (y0 + y1) / 2, fz / 2], ASHLAR_B, fHoles));
  // The string course at the great chamber's floor across its front, the lord's crest between the
  // showpiece and the cornice, a plain gilt band under the cornice, the coping and the merlons round
  // its top. (The pinnacles take its corners.)
  {
    const [ck, cp] = at(true, KEEP_H.chamber), cf = frame('s', cp), fw = fx1 - fx0 - 1.6;
    cb(ck, cf, [fw, 0.5, 0.1], [fc, KEEP_H.chamber + 0.25, fz + 0.05], DRESS, undefined, 0.02);
    crest(ck, cf, fc, 19.6, fz, 1.25);
    ck.box(cf, [fw, 0.14, 0.02], [fc, F.top - 0.75, fz + 0.01], GILT);
    cb(ck, cf, [fw, 0.5, 0.16], [fc, F.top - 0.25, fz + 0.08], DRESS, undefined, 0.02);
    cb(ck, cf, [fx1 - fx0 + 0.1, 0.12, fz + 0.1], [fc, fTop + 0.06, fz / 2], DRESS, undefined, 0.02);
    for (const u of spread(fw - 0.6, 1.45, 0)) for (const z of [fz - 0.3, 0.3]) cb(ck, cf, [0.8, 0.78, 0.55], [fc + u, fTop + 0.51, z], hash01(u, z) > 0.7 ? ASHLAR_L : ASHLAR_B, undefined, 0.04);
  }
  // The pinnacles on its front corners: slender octagonal shafts in the same stone rising from their
  // own base course past the frontispiece's merlons to a cap course and a little spire.
  for (const px of [fx0, fx1]) {
    const pz = S + 1.0, r = F.pinnacle.r, n = 8;
    const ring = (y0: number, y1: number, rr: number, color: number, course?: number) =>
      band(true, y0, y1, (kk, pp, a, e) => drum(kk, pp, { r: rr, y0: a, y1: e, n, course, turn: Math.PI / n, bond: false }, color, px, pz));
    ring(0, BASE_COURSE, r + 0.25, BASE, BASE_COURSE);
    ring(BASE_COURSE, F.pinnacle.top, r, ASHLAR_B);
    for (const y of KEEP_H.courses) ring(y, y + 0.5, r + 0.08, DRESS);
    ring(F.pinnacle.top, F.pinnacle.top + 0.5, r + 0.14, DRESS);
    const [sk, sp] = at(true, F.pinnacle.top);
    spire(sk, sp, px, F.pinnacle.top + 0.5, pz, r - 0.05, F.pinnacle.tip - F.pinnacle.top - 0.9, n);
  }

  // ─── The walls ──────────────────────────────────────────────────────────────
  for (const side of ['n', 's', 'w', 'e'] as Side[]) {
    const ns = side === 'n' || side === 's', a = ns ? 0 : T, e = ns ? S : S - T;
    bandOn(side, 0, KEEP_H.deck, (kk, pp, y0, y1) => carved(kk, frame(side, pp), [e - a, y1 - y0, T], [(a + e) / 2, (y0 + y1) / 2, -T / 2], ASHLAR_B, holes.get(side)!));
  }
  // The deep base course round its foot, a hand proud of the walls (none along the stretches of the
  // flanks inside the great hall and the chapel, nor across the great door), and the string courses.
  const [r0] = RANGE_ON_FLANK, R = TURRET.r;
  // (Each run ends against the turrets' and the pinnacles' own base courses.)
  const bt = Math.sqrt((R + BAND_OUT) ** 2 - BAND_OUT ** 2) - 0.01, bp = Math.sqrt((F.pinnacle.r + 0.25) ** 2 - (1 - BAND_OUT) ** 2);
  const runs: Record<Side, [number, number][]> = {
    n: [[bt, S - bt]],
    s: [[bt, fx0 - bp], [fx1 + bp, S - bt]],
    w: [[bt, r0]],
    e: [[bt, r0]],
  };
  for (const side of ['n', 's', 'w', 'e'] as Side[]) for (const [ua, ue] of runs[side]) {
    const x0 = Math.min(fu(side, ua), fu(side, ue)), x1 = Math.max(fu(side, ua), fu(side, ue));
    band(side === 's', 0, BASE_COURSE, (kk, pp, y0, y1) => deep(cb(kk, frame(side, pp), [x1 - x0, y1 - y0, BAND_OUT], [(x0 + x1) / 2, (y0 + y1) / 2, BAND_OUT / 2], BASE, undefined, 0.04)));
  }
  const courseRuns: Record<Side, { y: number; runs: [number, number][] }[]> = {
    n: KEEP_H.courses.map((y) => ({ y, runs: [[R - 0.6, S - R + 0.6]] })),
    s: KEEP_H.courses.map((y) => ({ y, runs: [[R - 0.6, fx0 - 0.45], [fx1 + 0.45, S - R + 0.6]] })),
    w: [{ y: KEEP_H.chamber, runs: [[R - 0.6, r0]] }],
    e: [{ y: KEEP_H.chamber, runs: [[R - 0.6, r0]] }],
  };
  for (const side of ['n', 's', 'w', 'e'] as Side[]) for (const { y, runs: rr } of courseRuns[side]) for (const [ua, ue] of rr) {
    const x0 = Math.min(fu(side, ua), fu(side, ue)), x1 = Math.max(fu(side, ua), fu(side, ue));
    fbox(side, atOn(side, y), [x1 - x0, 0.5, 0.1], [(x0 + x1) / 2, y + 0.25, 0.05], DRESS, 0.02);
  }

  // ─── The crown: machicolations, parapet, deck and leads ──────────────────────
  // On every face between the turrets (and on the front either side of the frontispiece): corbels of
  // three stones stepping out a quarter at a time from the gilt band to the parapet's foot, the
  // parapet standing on their tips over the slots between them, its coping and merlons.
  // (On the front each run of the parapet ends inside a pinnacle; its gilt band runs on to the frontispiece.)
  const crownRuns: Record<Side, [number, number][]> = { n: [[R - 0.9, S - R + 0.9]], s: [[R - 0.9, fx0], [fx1, S - R + 0.9]], w: [[R - 0.9, S - R + 0.9]], e: [[R - 0.9, S - R + 0.9]] };
  const C = KEEP_H.corbels, P = KEEP_H.parapet, CP = KEEP_H.coping;
  for (const side of ['n', 's', 'w', 'e'] as Side[]) for (const [ua, ue] of crownRuns[side]) {
    const x0 = Math.min(fu(side, ua), fu(side, ue)), x1 = Math.max(fu(side, ua), fu(side, ue));
    const front0 = side === 's' && x0 === fx1, front1 = side === 's' && x1 === fx0;
    const p0 = front0 ? x0 + 0.4 : x0, p1 = front1 ? x1 - 0.4 : x1, L = p1 - p0, xc = (p0 + p1) / 2;
    const f = frame(side, lifted);
    // (The corbels stand clear of the turrets' drums and the pinnacles.)
    const c0 = front0 ? x0 + 0.95 : x0 + 0.9, c1 = front1 ? x1 - 0.95 : x1 - 0.9;
    fk.box(f, [x1 - x0, 0.14, 0.03], [(x0 + x1) / 2, C - 0.12, 0.015], GILT);
    for (const u of spread(c1 - c0, 1.25, 0.3)) for (let i = 0; i < 3; i++) {
      cb(fk, f, [0.5, 0.5, 0.25 * (i + 1)], [(c0 + c1) / 2 + u, C + 0.25 + 0.5 * i, 0.125 * (i + 1)], ASHLAR_B, undefined, 0.03);
    }
    cb(fk, f, [L, CP - P, 0.6], [xc, (P + CP) / 2, 0.55], ASHLAR_B, undefined, 0.03);
    fk.box(f, [L, 0.12, 0.02], [xc, P + 0.1, 0.86], GILT);
    cb(fk, f, [L + 0.04, 0.12, 0.72], [xc, CP + 0.06, 0.55], DRESS, undefined, 0.02);
    for (const u of spread(L - 2.2, 1.6, 0)) cb(fk, f, [0.82, 0.78, 0.6], [xc + u, CP + 0.51, 0.55], hash01(u, side.charCodeAt(0)) > 0.7 ? ASHLAR_L : ASHLAR_B, undefined, 0.04);
  }
  // The roof deck over the walls' tops, and on it the leads laid in a two-tone diamond chequer with a
  // standing roll on every seam, a pale stone border and a gilt fillet inside it.
  {
    const y = KEEP_H.deck;
    cb(fk, lifted, [S, 0.2, S], [S / 2, y + 0.1, S / 2], DECK, undefined, 0.02);
    const iw = S - 2.4, ly = y + 0.23;
    fk.box(lifted, [iw, 0.06, iw], [S / 2, ly, S / 2], ROOF_BLUE);
    const DIA = 1.5, hd = DIA / 2, sd = DIA / Math.SQRT2, lo = S / 2 - iw / 2 + 0.6, hi = S / 2 + iw / 2 - 0.6;
    for (let i = 0; i * hd <= iw; i++) for (let j = 0; j * hd <= iw; j++) {
      if ((i + j) % 2) continue;
      const x = S / 2 - iw / 2 + i * hd, z = S / 2 - iw / 2 + j * hd;
      if (x - hd < lo || x + hd > hi || z - hd < lo || z + hd > hi) continue;
      fk.box(lifted, [sd - 0.06, 0.03, sd - 0.06], [x, ly + 0.045, z], i % 2 ? ROOF_BLUE_L : ROOF_BLUE, [0, Math.PI / 4, 0]);
      for (const r of [Math.PI / 4, -Math.PI / 4]) for (const s of [-1, 1]) {
        const ox = (Math.sin(r) * sd) / 2, oz = (Math.cos(r) * sd) / 2;
        fk.box(lifted, [sd - 0.08, 0.07, 0.07], [x + s * ox, ly + 0.08, z + s * oz], ROOF_ROLL, [0, r, 0]);
      }
    }
    // (The border's and the fillet's north and south strips run corner to corner; the west and east ones
    // between them.)
    const span = hi - lo;
    for (const [bx, bz, bw, bd] of [[S / 2, lo - 0.3, span + 1.0, 0.4], [S / 2, hi + 0.3, span + 1.0, 0.4], [lo - 0.3, S / 2, 0.4, span + 0.2], [hi + 0.3, S / 2, 0.4, span + 0.2]]) fk.box(lifted, [bw, 0.05, bd], [bx, ly + 0.05, bz], ASHLAR_L);
    for (const [bx, bz, bw, bd] of [[S / 2, lo - 0.05, span + 0.16, 0.06], [S / 2, hi + 0.05, span + 0.16, 0.06], [lo - 0.05, S / 2, 0.06, span + 0.04], [hi + 0.05, S / 2, 0.06, span + 0.04]]) fk.box(lifted, [bw, 0.06, bd], [bx, ly + 0.06, bz], GILT);
    // The great flag over the middle of the roof: a navy pole on a dressed plinth, a gold ball on top,
    // and the long flag flying east. (Over the middle of the keep its shadow falls on its own leads and
    // behind it, never on the court in front.)
    const fx = S / 2, fzz = S / 2, top = 38;
    cb(fk, lifted, [1.0, 0.5, 1.0], [fx, ly + 0.3, fzz], DRESS, undefined, 0.04);
    cb(fk, lifted, [0.24, top - ly - 0.5, 0.24], [fx, (ly + 0.5 + top) / 2, fzz], LAMP_NAVY, undefined, 0.03);
    fk.mesh(lifted, new THREE.OctahedronGeometry(0.22, 1), PAL.gold, [fx, top + 0.18, fzz]);
    flag(fk, lifted, fx, top - 0.25, fzz, 6, 3.6, 1);
  }

  // ─── The turrets ────────────────────────────────────────────────────────────
  for (const t of TURRETS) turret(t);

  function turret(t: (typeof TURRETS)[number]) {
    const lift = t.front, r = TURRET.r, n = drumStones(r), N = 24, top = TURRET.shaft;
    // Toward the keep's inside along x and z.
    const sx = t.x > S / 2 ? -1 : 1, sz = t.z > S / 2 ? -1 : 1;
    // The quarter of the drum inside the keep is cut away up to the deck (the hall's corner is the
    // keep's own): a notch along x toward the inside, across the keep's whole depth from just behind
    // the wall's inner face.
    const inner: DrumNotch = { a: sx > 0 ? Math.PI / 2 : -Math.PI / 2, o: -sx * sz * (T - 0.01 + (r + 0.2 - T + 0.01) / 2), half: (r + 0.2 - T + 0.01) / 2, back: 1.0, y0: -0.01, y1: KEEP_H.deck - 0.5 };
    // The slit lights: up the front turrets' spiral stairs, stepping round the side the bailey sees;
    // on the back turrets one to each storey on the side away from the keep.
    const out = Math.atan2(-sx, -sz);
    const slits: { a: number; y: number }[] = t.front
      ? [3.0, 8.0, 11.5, 15.0, 19.5, 24.8, 27.5].map((y, i) => ({ a: (sx > 0 ? 1 : -1) * (0.7 - i * 0.4), y }))
      : [8.0, 15.0, 19.5, 26.5].map((y, i) => ({ a: out + (i % 2 ? 0.3 : -0.3), y }));
    const SLIT = { w: 0.5, h: 1.6, T: 0.8 };
    const slitNotch = (s: { a: number; y: number }): DrumNotch => ({ a: s.a, o: 0, half: SLIT.w / 2 + 0.32, back: 0.02, y0: s.y - 0.25, y1: s.y + SLIT.h + 0.4 });
    // The door onto the leads, from the turret's stair, facing the middle of the roof.
    const lead = { a: Math.atan2(sx, sz), y: KEEP_H.deck + 0.2 };
    const wd = { L: 1.3 + 0.6, top: 3.0 + 0.5, back: 0.34 };
    const notches: DrumNotch[] = [inner, ...slits.map(slitNotch), { a: lead.a, o: 0, half: wd.L / 2 - 0.035, back: r - wd.back + 0.04, y0: lead.y, y1: lead.y + wd.top }];
    /** A drum between y0 and y1, split at the cuts on the camera side, notched where its notches pass. */
    const side: Side = lift ? 's' : 'n';
    const ring = (y0: number, y1: number, rr: number, color: number, o: { rTop?: number; course?: number; notched?: boolean; rIn?: number; bond?: boolean } = {}) =>
      bandOn(side, y0, y1, (kk, pp, a, e) => {
        const grp = turretGroup(pp);
        const rAt = (y: number) => rr + ((o.rTop ?? rr) - rr) * ((y - y0) / (y1 - y0));
        drum(kk, grp, { r: rAt(a), rTop: rAt(e), rIn: o.rIn, y0: a, y1: e, n, course: o.course, turn: o.course ? Math.PI / n : 0, bond: o.bond, notches: o.notched ? notches : undefined }, color);
      });
    const groups = new Map<string, THREE.Group>();
    const turretGroup = (pp: Obj) => {
      let grp = groups.get(pp.uuid);
      if (!grp) {
        grp = new THREE.Group();
        grp.position.set(t.x, 0, t.z);
        pp.add(grp);
        groups.set(pp.uuid, grp);
      }
      return grp;
    };
    // The back turrets stand out of the moat on the keep's plinth, stepped in a course at a time from
    // the moat's bed to the base course.
    if (!t.front) for (let i = 0; i < -KEEP_H.plinth; i++) ring(-1 - i, -i, r + BAND_OUT + STEP_OUT * (i + 1), BASE, { course: BASE_COURSE });
    ring(0, BASE_COURSE, r + BAND_OUT, BASE, { course: BASE_COURSE, notched: true });
    // The shaft, cut at the deck where its quarter inside the keep ends, with the walls' string courses
    // standing proud round it.
    ring(BASE_COURSE, KEEP_H.deck - 0.5, r, ASHLAR_B, { notched: true });
    ring(KEEP_H.deck - 0.5, top, r, ASHLAR_B, { notched: true });
    for (const y of KEEP_H.courses) ring(y, y + 0.5, r + 0.07, DRESS, { notched: true });
    // The crown: two courses of the same stone stepping out over a plain gilt band, the parapet ring
    // flush on them, a continuous coping and merlons; the turret's own deck inside; the spire.
    const [ck, cp] = atOn(side, top), cg = turretGroup(cp);
    ck.mesh(cg, ringBandGeo(r + 0.0, r + 0.03, 0.14, n * 2), GILT, [0, top - 0.32, 0]);
    drum(ck, cg, { r: r + 0.2, y0: top, y1: top + 0.5, n }, ASHLAR_B);
    drum(ck, cg, { r: r + 0.4, y0: top + 0.5, y1: top + 1.0, n }, ASHLAR_B);
    drum(ck, cg, { r: r + 0.45, rIn: r - 0.05, y0: top + 1.0, y1: top + 2.0, n: N }, ASHLAR_B);
    drum(ck, cg, { r: r + 0.5, rIn: r - 0.1, y0: top + 2.0, y1: top + 2.12, n: N, bond: false }, DRESS);
    for (let i = 0; i < N; i += 2) {
      const a = ((i + 0.5) / N) * Math.PI * 2, c = 2 * (r + 0.2) * Math.sin(Math.PI / N);
      cb(ck, cg, [c * 0.82, 0.7, 0.5], [Math.sin(a) * (r + 0.2), top + 2.12 + 0.35, Math.cos(a) * (r + 0.2)], hash01(i, t.x, t.z) > 0.7 ? ASHLAR_L : ASHLAR_B, [0, a, 0], 0.04);
    }
    ck.cyl(cg, r - 0.05, r - 0.05, 0.1, [0, TURRET.deck + 0.05, 0], DECK, undefined, N);
    spire(ck, cg, 0, TURRET.deck + 0.9, 0, r + 0.1, TURRET.spireTip - TURRET.deck - 1.06, N, 1, 1.5);
    // The slit lights: each a real window from the glazing kit set in a flat stone cut into the drum, a
    // glimpse of the stair's lit well behind it.
    for (const s of slits) {
      const [sk, sp] = atOn(side, s.y - 0.25), grp = turretGroup(sp), sg = new THREE.Group();
      sg.rotation.y = s.a;
      grp.add(sg);
      const nt = slitNotch(s), rf = r - 0.02, w2 = nt.half * 2;
      const { hole, cavity } = glazedWindow(sk, sg, 0, s.y, rf, { w: SLIT.w, h: SLIT.h, T: SLIT.T, stone: ASHLAR_B, room: { w: SLIT.w + 0.5, d: 1.3, floor: 0.6, ceil: 0.4 } });
      carved(sk, sg, [w2, nt.y1 - nt.y0, SLIT.T], [0, (nt.y0 + nt.y1) / 2, rf - SLIT.T / 2], ASHLAR_B, [hole, cavity]);
    }
    // The door onto the leads.
    const [lk, lp] = atOn(side, lead.y);
    drumDoorway(lk, turretGroup(lp), r, lead.a, 0, lead.y);
    // The front turrets' spiral stairs open onto the hall stairs' half landings: a door in the wall's
    // inner face over the landing, the same single door as every turret's.
    if (t.front) {
      const lx = sx > 0 ? T : S - T, landing = stairSteps(b.stairs![0], storeyH)[1].y0;
      const dg = new THREE.Group();
      dg.position.set(lx, 0, t.z + sz * 2);
      dg.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      built.add(dg);
      singleDoor(k, dg, 0, landing, 0);
    }
  }

  // ─── The plinth: the back half out of the moat ──────────────────────────────
  // Along the back and the flanks out to the curtain's outer face, stepped down a course at a time to
  // the moat's rock bed, each step a hand out from the one over it.
  {
    const flank = CURTAIN.north - CURTAIN.T / 2 - b.z;
    const pruns: [Side, number, number][] = [['n', R - 1.0, S - R + 1.0], ['w', R - 1.0, flank], ['e', R - 1.0, flank]];
    for (const [side, ua, ue] of pruns) {
      const x0 = Math.min(fu(side, ua), fu(side, ue)), x1 = Math.max(fu(side, ua), fu(side, ue)), f = frame(side, built);
      for (let i = 0; i < -KEEP_H.plinth; i++) {
        const outI = BAND_OUT + STEP_OUT * (i + 1);
        deep(cb(k, f, [x1 - x0, 1, outI + T], [(x0 + x1) / 2, -i - 0.5, (outI - T) / 2], BASE, undefined, 0.04));
      }
    }
  }

  // ─── The lord's banners ──────────────────────────────────────────────────────
  // Two long banners in the front's side bays, twelve metres from under the great chamber's lights to
  // just over the lower string course, clear of the small lancets under them.
  for (const u of [5.8, 18.2]) {
    const [bk, bp] = at(true, 18.9), f = frame('s', bp), w = 1.6, L = 12;
    livery(bk, f, u, 18.9, 0.1, w, L - w * 0.6);
  }

  // ─── Inside: the throne hall ────────────────────────────────────────────────
  // The floor of flagstones, the crimson runner from the great door to the dais, the dais three steps up.
  paved(cb(ik, floorG, [S - 2 * T + 0.02, 0.06, S - 2 * T + 0.02], [S / 2, 0.02, S / 2], FLOOR, undefined, 0.02));
  const dais = b.raised?.[0];
  if (dais) {
    const [dx0, dz0, dx1, dz1] = dais.rect, n = Math.max(1, Math.ceil(dais.h / 0.17 - 1e-6));
    for (let i = 0; i < n; i++) {
      const o = 0.32 * (n - 1 - i), y0 = i ? (i * dais.h) / n : 0.04, y1 = ((i + 1) * dais.h) / n;
      const ax = dx0 - o, ex = dx1 + o, az = dz0 > T ? dz0 - o : dz0, ez = dz1 + o;
      cb(ik, ground, [ex - ax, y1 - y0, ez - az], [(ax + ex) / 2, (y0 + y1) / 2, (az + ez) / 2], i === n - 1 ? FLOOR : DRESS, undefined, 0.02);
    }
    const rz0 = dz1 + 0.32 * n + 0.1, rz1 = S - T;
    ik.box(ground, [2.2, 0.03, rz1 - rz0], [S / 2, 0.065, (rz0 + rz1) / 2], RUG);
    for (const s of [-1, 1]) ik.box(ground, [0.1, 0.012, rz1 - rz0 - 0.1], [S / 2 + s * 0.98, 0.086, (rz0 + rz1) / 2], RUG_TRIM);
  }
  // The lord's banners on the north wall behind the high seat, under the council gallery.
  for (const x of [9.2, 14.8]) {
    const f = new THREE.Group();
    f.position.set(x, 0, T);
    ground.add(f);
    livery(ik, f, 0, storeyH - 0.5, 0.08, 1.2, 2.6);
  }
  // The piers carrying the galleries: a stepped base, the shaft, a capital under the beams; over the
  // galleries' floor they rise on to the great chamber's floor (going with the galleries when cut).
  const piers = fitsOf(b).filter((f) => f.kind === 'pillar');
  for (const p of piers) {
    // (Its capital carries the gallery's beam, 0.4 deep under the boards; over them the shaft rises to a
    // capital under the ceiling's beams.)
    const cap = storeyH - 0.7;
    cb(ik, ground, [1.4, 0.4, 1.4], [p.x, 0.2, p.z], DRESS, undefined, 0.05);
    cb(ik, ground, [1.0, cap - 0.7, 1.0], [p.x, 0.4 + (cap - 0.7) / 2, p.z], ASHLAR_B, undefined, 0.04);
    cb(ik, ground, [1.3, 0.3, 1.3], [p.x, cap - 0.15, p.z], DRESS, undefined, 0.04);
    cb(uk, mid, [0.9, KEEP_H.chamber - storeyH - 1.1, 0.9], [p.x, storeyH + (KEEP_H.chamber - storeyH - 1.1) / 2, p.z], ASHLAR_B, undefined, 0.04);
    cb(uk, mid, [1.2, 0.5, 1.2], [p.x, KEEP_H.chamber - 0.85, p.z], DRESS, undefined, 0.04);
  }
  // The stairs: solid steps of the dressed stone with pale nosings, the half landing a solid block, a
  // cheek wall of the same stone along each open side from the floor to the handrail's height.
  for (const st of b.stairs ?? []) {
    const steps = stairSteps(st, storeyH);
    for (const s of steps) flight(ik, ground, s);
    (st.turns ?? []).forEach((tn, i) => {
      const [x0, z0, x1, z1] = tn.landing, top = steps[i + 1].y0;
      cb(ik, ground, [x1 - x0 - 0.1, top, z1 - z0 - 0.1], [(x0 + x1) / 2, top / 2, (z0 + z1) / 2], ASHLAR_L, undefined, 0.02);
    });
    cheeks(st, steps);
  }
  // The galleries' oak floors on the piers' beams, wall to wall, leaving the hall and the stair wells
  // open, a stone balustrade round every opening but at a stair's head; the beams under their edges.
  {
    const y = storeyH - 0.15;
    const open = (lx: number, lz: number) => isVoid(b, lx, lz) || (b.stairs ?? []).some((st) => stairParts(st).some((rc) => inRect(rc, lx, lz)));
    for (let lz = 1; lz < S - 1; lz++) {
      let a = -1;
      for (let lx = 1; lx <= S - 1; lx++) {
        const solid = lx < S - 1 && !open(lx, lz);
        if (solid && a < 0) a = lx;
        if (!solid && a >= 0) {
          const x0 = a === 1 ? T : a, x1 = lx === S - 1 ? S - T : lx, z0 = lz === 1 ? T : lz, z1 = lz === S - 2 ? S - T : lz + 1;
          cb(uk, mid, [x1 - x0, 0.3, z1 - z0], [(x0 + x1) / 2, y, (z0 + z1) / 2], PLANKS[(lz + a) % 3], undefined, 0.01);
          a = -1;
        }
      }
    }
    const head = (lx: number, lz: number) => (b.stairs ?? []).some((st) => {
      const tp = flightsOf(st).at(-1)!, [x0, z0, x1, z1] = stairRect(tp);
      return inRect([x0, z0, x1, z1], lx, lz) && (tp.dir === 'n' ? lz === z0 : tp.dir === 's' ? lz === z1 - 1 : tp.dir === 'w' ? lx === x0 : lx === x1 - 1);
    });
    // Each open edge of the boards: a run of the balustrade along it (a plinth, balusters, a handrail),
    // and an oak beam under it.
    const edges: { x0: number; z0: number; x1: number; z1: number }[] = [];
    for (let lz = 1; lz < S - 1; lz++) for (let lx = 1; lx < S - 1; lx++) {
      if (open(lx, lz)) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = lx + dx, nz = lz + dz;
        if (nx < 1 || nz < 1 || nx > S - 2 || nz > S - 2 || !open(nx, nz) || head(nx, nz)) continue;
        const ex = dx ? lx + (dx > 0 ? 1 : 0) : lx, ez = dz ? lz + (dz > 0 ? 1 : 0) : lz;
        edges.push(dx ? { x0: ex, z0: lz, x1: ex, z1: lz + 1 } : { x0: lx, z0: ez, x1: lx + 1, z1: ez });
      }
    }
    // (Unit edges joined into straight runs.)
    const runsOf = (along: 'x' | 'z') => {
      const list = edges.filter((e) => (along === 'x' ? e.z0 === e.z1 : e.x0 === e.x1));
      const key = (e: (typeof edges)[number]) => (along === 'x' ? e.z0 : e.x0);
      const pos = (e: (typeof edges)[number]) => (along === 'x' ? e.x0 : e.z0);
      list.sort((p, q) => key(p) - key(q) || pos(p) - pos(q));
      const out: { at: number; a: number; e: number }[] = [];
      for (const e of list) {
        const last = out.at(-1);
        if (last && last.at === key(e) && Math.abs(last.e - pos(e)) < 1e-6) last.e = pos(e) + 1;
        else out.push({ at: key(e), a: pos(e), e: pos(e) + 1 });
      }
      return out;
    };
    // Each run on the edge's own line: a newel post at each end (one post where two runs meet), the
    // plinth and the handrail between the posts, balusters between them; the beam under it on the side
    // of the boards.
    const posts = new Set<string>(), PH = 1.04, PW = 0.28;
    for (const along of ['x', 'z'] as const) for (const run of runsOf(along)) {
      const boards = open(along === 'x' ? Math.floor(run.a) : run.at, along === 'x' ? run.at : Math.floor(run.a)) ? -1 : 1;
      const c = run.at, L = run.e - run.a - PW, m = (run.a + run.e) / 2;
      const box = (len: number, h: number, dep: number, y0: number, color: number, u = m, cc = c, ch = 0.02) => cb(uk, mid, along === 'x' ? [len, h, dep] : [dep, h, len], along === 'x' ? [u, y0 + h / 2, cc] : [cc, y0 + h / 2, u], color, undefined, ch);
      box(L, 0.12, 0.26, storeyH, DRESS);
      box(L, 0.12, 0.3, storeyH + 0.86, DRESS);
      const nb = Math.max(2, Math.round(L / 0.36));
      for (let i = 0; i < nb; i++) box(0.12, 0.74, 0.12, storeyH + 0.12, ASHLAR_L, m - L / 2 + 0.2 + ((L - 0.4) * i) / (nb - 1));
      for (const e of [run.a, run.e]) {
        const key = along === 'x' ? `${e},${c}` : `${c},${e}`;
        if (posts.has(key)) continue;
        posts.add(key);
        box(PW, PH, PW, storeyH, DRESS, e);
      }
      box(run.e - run.a, 0.4, 0.3, storeyH - 0.7, TIMBER, m, c + boards * 0.2);
    }
  }
  // The ceiling: the great chamber's oak floor on heavy beams across the hall from wall to wall.
  {
    const y = KEEP_H.chamber;
    cb(fk, lifted, [S - 2 * T + 0.02, 0.2, S - 2 * T + 0.02], [S / 2, y + 0.1, S / 2], PLANKS[1], undefined, 0.01);
    for (let z = T + 1.2; z < S - T - 0.6; z += 2.2) cb(fk, lifted, [S - 2 * T, 0.6, 0.4], [S / 2, y - 0.3, z], TIMBER, undefined, 0.02);
  }

  // ─── Finish ─────────────────────────────────────────────────────────────────
  // Each face's walling names its whole face in the keep's space (masonLayout reads it there).
  for (const f of frames.values()) {
    f.updateMatrix();
    for (const c of f.children) {
      const face = c.userData.face as { x0: number; x1: number; z0: number; z1: number } | undefined;
      if (!face) continue;
      const pts = [[face.x0, face.z0], [face.x1, face.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(f.matrix));
      c.userData.face = { x0: Math.min(pts[0].x, pts[1].x), x1: Math.max(pts[0].x, pts[1].x), z0: Math.min(pts[0].z, pts[1].z), z1: Math.max(pts[0].z, pts[1].z) };
    }
  }
  finishProp(g, [k, mk, fk, ik, uk, ek]);
  const uMid = { value: OFF }, uTop = { value: OFF };
  const patched = new Set<THREE.Material>();
  const patch = (grp: Obj, u: { value: number }) => grp.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!patched.has(m)) (patched.add(m), cutPatch(m, u));
  });
  patch(mid, uMid);
  patch(lifted, uTop);
  patch(edge, uTop);
  for (const m of [...ik.mats, ...uk.mats]) m.userData.noOcclude = true;
  // The furnishings (the high table, the braziers) stand on the floor and the dais.
  const ticks: ((t: number) => void)[] = [];
  let lamp: THREE.PointLight | undefined;
  for (const f of fitsOf(b)) {
    if (f.kind === 'pillar') continue;
    const fp = buildFitProp(f.kind, f.len);
    fp.obj.userData.furnishing = true;
    fp.obj.position.set(f.x, raisedAt(b, b.x + Math.floor(f.x), b.z + Math.floor(f.z)), f.z);
    fp.obj.rotation.y = f.rot ?? 0;
    fp.obj.traverse((o) => {
      if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.userData.noOcclude = true;
    });
    ground.add(fp.obj);
    if (fp.tick) ticks.push(fp.tick);
    lamp ??= fp.light;
  }

  // The cut sweeps down from over the spires to the course of the floor the hero stands on.
  const TOP = TURRET.spireTip + 4;
  const wipe = (c: number, base: number) => (c <= 0.0001 ? OFF : baseY + base + (TOP - base) * (1 - c) * (1 - c));
  let cutV = 0, floorV: Floor = 0;
  const shadows = (grp: Obj, on: boolean) => grp.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = on && !(o.material as THREE.Material).userData.decal;
  });
  const apply = () => {
    const c0 = floorV ? 0 : cutV;
    uMid.value = wipe(c0, CUT_H);
    uTop.value = wipe(cutV, floorV ? UP : CUT_H);
    mid.visible = c0 < 0.999;
    lifted.visible = cutV < 0.999;
    shadows(mid, c0 < 0.001);
    shadows(lifted, cutV < 0.001);
    shadows(edge, cutV < 0.001);
  };
  apply();
  // (Standing at the great hall's dais or the chapel's west end, the camera would stand in a front turret.)
  const ends: [number, number, number, number][] = [[RANGE.hall[2] - 6, RANGE.hall[1] + 1, RANGE.hall[2], RANGE.hall[3] - 1], [RANGE.chapel[0], RANGE.chapel[1] + 1, RANGE.chapel[0] + 6, RANGE.chapel[3] - 1]];
  return {
    obj: g,
    spec: b,
    light: lamp,
    tick: ticks.length ? (t) => ticks.forEach((f) => f(t)) : undefined,
    setState: () => apply(),
    setCut: (v, floor = 0) => {
      const nv = Math.max(0, Math.min(1, v)), nf: Floor = floor;
      if (nv === cutV && nf === floorV) return;
      cutV = nv;
      floorV = nf;
      apply();
    },
    contains: (x, z) => inRoom(b, x, z) || ends.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1),
  };

  /**
   * One flight: solid steps of the dressed stone from the height it climbs from, toward its `dir`, a
   * pale nosing on each tread.
   */
  function flight(kk: ModelKit, p: Obj, s: ReturnType<typeof stairSteps>[number]) {
    const st = s.flight, [x0, z0, x1, z1] = stairRect(st), alongZ = st.dir === 'n' || st.dir === 's';
    const L = alongZ ? z1 - z0 : x1 - x0, W = alongZ ? x1 - x0 : z1 - z0;
    const up = st.dir === 's' || st.dir === 'e' ? 1 : -1, start = up > 0 ? (alongZ ? z0 : x0) : alongZ ? z1 : x1;
    const t = L / s.risers, cw = alongZ ? (x0 + x1) / 2 : (z0 + z1) / 2;
    // (Each step is one block of the stone from its riser to the flight's head, under the steps over it.)
    const end = up > 0 ? (alongZ ? z1 : x1) : alongZ ? z0 : x0;
    for (let i = 0; i < s.risers; i++) {
      const top = s.y0 + (i + 1) * s.riser, a = start + up * i * t, u = (a + end) / 2, len = Math.abs(end - a);
      cb(kk, p, alongZ ? [W - 0.1, top, len] : [len, top, W - 0.1], alongZ ? [cw, top / 2, u] : [u, top / 2, cw], DRESS, undefined, 0.02);
      const nose = start + up * i * t + up * 0.04;
      cb(kk, p, alongZ ? [W - 0.06, 0.06, 0.1] : [0.1, 0.06, W - 0.06], alongZ ? [cw, top - 0.02, nose] : [nose, top - 0.02, cw], BASE, undefined, 0.01);
    }
  }

  /**
   * The cheek walls along a stair's open sides (toward the hall): from the floor to a handrail's height
   * over its nosings, level over its half landing, raking with each flight, capped with a dressed
   * coping; built as one outline each, extruded.
   */
  function cheeks(st: NonNullable<BuildingSpec['stairs']>[number], steps: ReturnType<typeof stairSteps>) {
    const RAIL = 0.95, TH = 0.22;
    const [f1, f2] = steps, land = st.turns![0].landing;
    // Along the first flight and the landing's open side (z = its north edge), x from the flight's foot
    // to the landing's far side; along the second flight's open side (x = its edge toward the hall).
    const [ax0, , ax1] = stairRect(f1.flight), toW = f1.flight.dir === 'w';
    const footX = toW ? ax1 : ax0, headX = toW ? ax0 : ax1, landFar = toW ? land[0] + (stairRect(f2.flight)[2] - stairRect(f2.flight)[0]) : land[2] - (stairRect(f2.flight)[2] - stairRect(f2.flight)[0]);
    const y1 = f2.y0, zc = stairRect(f1.flight)[1] + TH / 2;
    const sh1 = new THREE.Shape([new THREE.Vector2(footX, 0), new THREE.Vector2(landFar, 0), new THREE.Vector2(landFar, y1 + RAIL), new THREE.Vector2(headX, y1 + RAIL), new THREE.Vector2(footX, RAIL)]);
    const g1 = new THREE.ExtrudeGeometry(sh1, { depth: TH, bevelEnabled: false }).translate(0, 0, zc - TH / 2);
    ik.mesh(ground, g1, DRESS, [0, 0, 0]);
    const [bx0, bz0, bx1, bz1] = stairRect(f2.flight), xc = toW ? bx1 - TH / 2 : bx0 + TH / 2;
    // (In the plane of z and y: from the flight's foot at the landing to its head at the gallery.)
    const sh2 = new THREE.Shape([new THREE.Vector2(-bz1, 0), new THREE.Vector2(-bz0, 0), new THREE.Vector2(-bz0, storeyH + RAIL), new THREE.Vector2(-bz1, y1 + RAIL)]);
    const g2 = new THREE.ExtrudeGeometry(sh2, { depth: TH, bevelEnabled: false }).rotateY(Math.PI / 2).translate(xc - TH / 2, 0, 0);
    ik.mesh(ground, g2, DRESS, [0, 0, 0]);
  }
}

/** Is local cell (lx, lz) inside a rectangle [x0, z0, x1, z1)? */
const inRect = ([x0, z0, x1, z1]: [number, number, number, number], lx: number, lz: number) => lx >= x0 && lx < x1 && lz >= z0 && lz < z1;

/** A thin flat ring (a gilt band round a drum) with `n` straight sides, its foot on y = 0. */
function ringBandGeo(rIn: number, rOut: number, h: number, n: number) {
  const poly = (r: number) => Array.from({ length: n }, (_, i) => new THREE.Vector2(Math.sin((i / n) * Math.PI * 2) * r, -Math.cos((i / n) * Math.PI * 2) * r));
  const shape = new THREE.Shape(poly(rOut));
  shape.holes.push(new THREE.Path(poly(rIn)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  geo.userData.ring = [rIn, rOut];
  geo.userData.hollow = true;
  return geo;
}

/**
 * The lord's crest carved on a face (facing +Z) at (x, y, z), `s` its scale: a shield of the castle's
 * dressed stone, its field the lord's blue, a gilt sword upright on it, and a gilt crown over it.
 */
function crest(k: ModelKit, g: Obj, x: number, y: number, z: number, s: number) {
  const W = 1.5 * s, H = 1.9 * s;
  const outline = (w: number, h: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, h);
    sh.lineTo(w / 2, h);
    sh.lineTo(w / 2, h * 0.45);
    sh.quadraticCurveTo(w / 2, h * 0.08, 0, 0);
    sh.quadraticCurveTo(-w / 2, h * 0.08, -w / 2, h * 0.45);
    sh.closePath();
    return sh;
  };
  const plate = new THREE.ExtrudeGeometry(outline(W, H), { depth: 0.12, bevelEnabled: false, curveSegments: 4 });
  k.mesh(g, plate, DRESS, [x, y, z]);
  const field = new THREE.ExtrudeGeometry(outline(W - 0.2 * s, H - 0.22 * s), { depth: 0.05, bevelEnabled: false, curveSegments: 4 });
  k.mesh(g, field, HERALD_BLUE, [x, y + 0.14 * s, z + 0.11]);
  // The sword: blade, guard, grip and pommel, in gilt.
  k.box(g, [0.13 * s, 1.0 * s, 0.04], [x, y + 0.85 * s, z + 0.17], GILT);
  k.mesh(g, taper(0.13 * s, 0.04, 0.01, 0.04, 0.18 * s), GILT, [x, y + 0.17 * s, z + 0.17], [Math.PI, 0, 0]);
  k.box(g, [0.62 * s, 0.1 * s, 0.05], [x, y + 1.38 * s, z + 0.17], GILT);
  k.box(g, [0.09 * s, 0.26 * s, 0.05], [x, y + 1.55 * s, z + 0.17], GILT);
  k.box(g, [0.16 * s, 0.16 * s, 0.05], [x, y + 1.72 * s, z + 0.17], GILT, [0, 0, Math.PI / 4]);
  // The crown over the shield: a band and three points with a jewel at their feet.
  const cy = y + H + 0.08 * s;
  k.box(g, [0.95 * s, 0.2 * s, 0.1], [x, cy + 0.1 * s, z + 0.08], GILT);
  for (const dx of [-0.36, 0, 0.36]) k.mesh(g, taper(0.2 * s, 0.1, 0.02, 0.02, (dx ? 0.3 : 0.42) * s), GILT, [x + dx * s, cy + 0.2 * s, z + 0.08]);
  k.box(g, [0.12 * s, 0.12 * s, 0.03], [x, cy + 0.1 * s, z + 0.14], 0xb02030, [0, 0, Math.PI / 4]);
}
