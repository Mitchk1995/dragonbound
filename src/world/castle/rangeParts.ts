import * as THREE from 'three';
import { ModelKit, PAL } from '../../render/kit';
import { taper } from '../../render/blocks';
import { ASHLAR_B, cb, DARK, DRESS, GILT, IRON, SLATE_BLUE, spire } from '../props';

/**
 * The north range's slate roofs (castle v4, stage 5): the great hall's and the chapel's steep blue
 * slate roofs on their walls, in a building's own space (x along it, z across it from its north
 * face, y up from its floor), and what stands on them. Built by buildingModel.ts.
 */

type Obj = THREE.Object3D;

/** The slates' blue (the spires' slate, painted as slates), the lead of the gutters, ridges and flashings. */
export const SLATES = SLATE_BLUE, LEAD = 0x4a5160, RIDGE = 0x2c3446;
const TIMBER = 0x4b3122, OAK_D = 0x4a3020;

/** A slate roof's shape: its slopes' pitch (rise over run) and its ridge's line across the building. */
export interface Pitch {
  /** Rise over run of both slopes. */
  t: number;
  /** The ridge's line (z) and height. */
  zr: number;
  ridge: number;
  /** The slates' top surface at z. */
  top: (z: number) => number;
}

export interface SlateRoofSpec {
  /** The building's length (x) and depth (z) in cells, and its eaves (the walls' top). */
  w: number;
  d: number;
  eave: number;
  ridge: number;
  /** The slopes run from x0 to x1 (between the gable's inner face or a neighbour's face at each end). */
  x0: number;
  x1: number;
  /** Ends closed by this building's own coped gable (rising over a lower neighbour), and its apex finial. */
  gables: { x: number; finial: 'ball' | 'cross' }[];
  /** Ends abutting a taller neighbour's face (the keep), dressed with a lead flashing. */
  flashed: number[];
}

/** How deep the slates are, how far the cornice under the eaves stands out, the north gutter's foot. */
const TH = 0.22, CORNICE = 0.45, GUTTER = { z: 0.85, up: 0.15 };
/** The back parapet over the north gutter: its walling's height over the eaves (its coping on top). */
export const BACK_PARAPET = 1.5;

/**
 * The slopes' pitch: the south slope resting at its foot on the eaves' cornice (its lip a hand beyond
 * it), the north slope coming down to its lead gutter behind the back parapet, both at one pitch, the
 * ridge where they meet at `ridge`.
 */
export function pitchOf(d: number, eave: number, ridge: number): Pitch {
  const lip = d - 0.05 + CORNICE + 0.05, yG = eave + GUTTER.up;
  let t = 1.4;
  for (let i = 0; i < 8; i++) t = (2 * ridge - yG - eave - TH * Math.sqrt(1 + t * t)) / (lip - GUTTER.z);
  const zr = GUTTER.z + (ridge - yG) / t;
  return { t, zr, ridge, top: (z: number) => ridge - Math.abs(z - zr) * t };
}

/**
 * A slate roof: the two slopes (the south one over the open eaves on a corbelled cornice, the north one
 * into a lead gutter behind a parapet over the wall walk), the ridge's capping, the coped gables that
 * close its ends over a lower neighbour (each with its kneelers and an apex finial: a ball, or the
 * chapel's cross) and the lead flashing where it abuts the keep. Returns the pitch.
 */
export function slateRoof(k: ModelKit, g: Obj, o: SlateRoofSpec): Pitch {
  const { d, eave: E, ridge: R, x0, x1 } = o, P = pitchOf(d, E, R), { t, zr } = P, A = Math.atan(t), sec = Math.sqrt(1 + t * t);
  const W = x1 - x0, xm = (x0 + x1) / 2, lip = d - 0.05 + CORNICE + 0.05;
  /** A slab of the roof between z = a and z = b along the slope, its top on the slope's surface. */
  const slab = (a: number, b: number, sgn: number, color: number, th: number, len = W, x = xm, lift = 0) => {
    const zm = (a + b) / 2, ym = P.top(zm), L = Math.abs(b - a) * sec, off = lift - th / 2;
    const ny = 1 / sec, nz = (sgn * t) / sec;
    cb(k, g, [len, th, L], [x, ym + off * ny, zm + off * nz], color, [sgn * A, 0, 0], 0.03);
  };
  // The slopes: the south one to its lip over the cornice, the north one into the gutter, each a hair
  // past the ridge so the two meet under the capping.
  slab(zr, lip, 1, SLATES, TH);
  slab(GUTTER.z, zr, -1, SLATES, TH);
  // The ridge: a lead roll along it.
  cb(k, g, [W + 0.04, 0.26, 0.26], [xm, R + 0.02, zr], RIDGE, [Math.PI / 4, 0, 0], 0.03);
  // The flashing where the slopes run in under a taller neighbour's face.
  for (const fx of o.flashed) {
    const x = fx + (fx > xm ? -0.16 : 0.16);
    // (Its top a little over the slates', never in their plane.)
    slab(zr, lip - 0.05, 1, LEAD, 0.06, 0.32, x, 0.03);
    slab(GUTTER.z + 0.1, zr, -1, LEAD, 0.06, 0.32, x, 0.03);
  }
  // The gables: the end wall carried up over the eaves to a coped rake on each slope (the coping a hand
  // over the slates), level over the back parapet at the north and resting on a kneeler over the
  // cornice at the south; its apex finial.
  for (const { x: gx, finial } of o.gables) {
    const wallTop = (z: number) => P.top(z) + 0.12, Pk = E + BACK_PARAPET, zk = zr - (R + 0.12 - Pk) / t, zs = d - 0.05;
    const sh = new THREE.Shape([
      new THREE.Vector2(0.05, E), new THREE.Vector2(0.05, Pk), new THREE.Vector2(zk, Pk), new THREE.Vector2(zr, R + 0.12),
      new THREE.Vector2(zs, wallTop(zs)), new THREE.Vector2(zs, E),
    ]);
    // (Extruded across the wall's thickness: the shape's x is the building's z.)
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false, curveSegments: 1 }).rotateY(-Math.PI / 2).translate(gx + 0.45, 0, 0);
    k.mesh(g, geo, ASHLAR_B, [0, 0, 0]);
    // The coping on the rakes and over the level stretch at the north, and the kneeler at the eaves.
    const CW = 1.08, cop = (a: number, b: number, sgn: number) => {
      const zm = (a + b) / 2, L = Math.abs(b - a) * sec, ym = wallTop(zm);
      cb(k, g, [CW, 0.2, L], [gx, ym + 0.1 / sec, zm + (0.1 * sgn * t) / sec], DRESS, [sgn * A, 0, 0], 0.03);
    };
    cop(zk, zr, -1);
    cop(zr, zs + 0.12, 1);
    cb(k, g, [CW, 0.14, zk + 0.02], [gx, Pk + 0.07, zk / 2 + 0.04], DRESS, undefined, 0.02);
    const kt = wallTop(d), kb = E - 0.25;
    cb(k, g, [CW, kt - kb, 0.95], [gx, (kt + kb) / 2, d + 0.02], DRESS, undefined, 0.03);
    const ay = R + 0.12 + 0.1;
    if (finial === 'cross') {
      cb(k, g, [0.5, 0.36, 0.5], [gx, ay + 0.18, zr], DRESS, undefined, 0.03);
      cb(k, g, [0.2, 1.3, 0.2], [gx, ay + 1.0, zr], DRESS, undefined, 0.02);
      cb(k, g, [0.2, 0.2, 0.8], [gx, ay + 1.22, zr], DRESS, undefined, 0.02);
    } else {
      cb(k, g, [0.5, 0.5, 0.5], [gx, ay + 0.25, zr], DRESS, undefined, 0.03);
      k.mesh(g, new THREE.IcosahedronGeometry(0.28, 1), DRESS, [gx, ay + 0.72, zr]);
    }
  }
  return P;
}

/**
 * The great hall's lantern on its ridge over the open hearth (at x, on the ridge): a slate-hung base
 * straddling the ridge, an octagonal timber louvre whose sloping boards let the smoke out, and a little
 * slate cap with a gilt finial, its tip `tip` over the floor.
 */
export function lantern(k: ModelKit, g: Obj, x: number, P: Pitch, tip: number) {
  const { zr, ridge: R } = P, N = 8, r = 0.82;
  cb(k, g, [2.0, 1.1, 2.0], [x, R - 0.25, zr], SLATES, undefined, 0.04);
  const y0 = R + 0.3, H = 1.25;
  cb(k, g, [2.1, 0.14, 2.1], [x, y0 + 0.07, zr], TIMBER, undefined, 0.02);
  k.cyl(g, r - 0.12, r - 0.12, H, [x, y0 + H / 2, zr], DARK, undefined, N);
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) * Math.PI * 2) / N, b = (i * Math.PI * 2) / N;
    // A post at each angle, three sloping boards across each face.
    cb(k, g, [0.14, H, 0.14], [x + Math.cos(b) * r, y0 + H / 2, zr + Math.sin(b) * r], TIMBER, [0, -b, 0], 0.01);
    for (let j = 0; j < 3; j++) {
      const fw = 2 * r * Math.sin(Math.PI / N);
      const s = new THREE.Group();
      s.position.set(x + Math.cos(a) * (r * Math.cos(Math.PI / N) - 0.02), y0 + 0.3 + j * 0.34, zr + Math.sin(a) * (r * Math.cos(Math.PI / N) - 0.02));
      s.rotation.y = -a + Math.PI / 2;
      g.add(s);
      cb(k, s, [fw - 0.1, 0.05, 0.3], [0, 0, 0], TIMBER, [0.6, 0, 0], 0.01);
    }
  }
  k.cyl(g, r + 0.12, r + 0.12, 0.16, [x, y0 + H + 0.08, zr], TIMBER, undefined, N);
  const foot = y0 + H + 0.16;
  spire(k, g, x, foot, zr, r + 0.06, Math.max(0.6, tip - foot - 0.16 - 1.03), N);
}

/**
 * The chapel's flèche on its ridge over the south door (at x): a slate-hung base straddling the
 * ridge, an open timber bell stage (corner posts, braces, the bell hanging inside), and a slender
 * slate spire to `tip` over the floor.
 */
export function fleche(k: ModelKit, g: Obj, x: number, P: Pitch, tip: number) {
  const { zr, ridge: R } = P, hw = 0.62, y0 = R + 0.32, H = 1.7;
  cb(k, g, [1.7, 1.15, 1.7], [x, R - 0.25, zr], SLATES, undefined, 0.04);
  cb(k, g, [1.6, 0.14, 1.6], [x, y0 + 0.07, zr], TIMBER, undefined, 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cb(k, g, [0.18, H, 0.18], [x + sx * hw, y0 + H / 2, zr + sz * hw], TIMBER, undefined, 0.01);
  // A rail round the stage at the bell's foot, and a pointed brace in each face under its head.
  for (const [ax, az] of [[1, 0], [0, 1]]) for (const s of [-1, 1]) {
    // (The rails across z stop against those along x.)
    cb(k, g, ax ? [2 * hw, 0.12, 0.12] : [0.12, 0.12, 2 * hw - 0.12], [x + az * s * hw, y0 + 0.62, zr + ax * s * hw], OAK_D, undefined, 0.01);
    for (const e of [-1, 1]) {
      const bx = x + az * s * hw + ax * e * hw * 0.5, bz = zr + ax * s * hw + az * e * hw * 0.5;
      cb(k, g, [0.1, 0.62, 0.1], [bx, y0 + H - 0.32, bz], OAK_D, ax ? [0, 0, e * 0.85] : [-e * 0.85, 0, 0], 0.01);
    }
  }
  // The bell: a bronze bell on its headstock.
  cb(k, g, [2 * hw + 0.1, 0.12, 0.14], [x, y0 + H - 0.2, zr], TIMBER, undefined, 0.01);
  k.mesh(g, taper(0.62, 0.62, 0.3, 0.3, 0.6), 0x9a7a3a, [x, y0 + H - 0.58, zr]);
  k.cyl(g, 0.36, 0.36, 0.08, [x, y0 + H - 0.92, zr], 0x8a6a2e, undefined, 10);
  cb(k, g, [1.66, 0.16, 1.66], [x, y0 + H + 0.08, zr], TIMBER, undefined, 0.02);
  const foot = y0 + H + 0.16;
  spire(k, g, x, foot, zr, 0.62, tip - foot - 0.16 - 1.03, 8);
}

/** A disc's outline (radius r), counter-clockwise. */
const ring = (r: number, n: number, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => new THREE.Vector2(cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)));

/**
 * The chapel's rose window (diameter D, its centre at y = 0, facing +Z, `T` deep centred on z = 0):
 * its plate of the dressed stone pierced by seven round lights, one in the middle and six round it,
 * and the corners of the square opening it stands in filled back to the circle. The lights' centres
 * and radii come back with it, so the glass can be set in them. (Both pieces are open shapes: the
 * audit reads them as hollow.)
 */
export function rosePlate(D: number, T: number) {
  const R = D / 2, lights: [number, number, number][] = [[0, 0, R * 0.24]];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    lights.push([Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, R * 0.22]);
  }
  const plate = new THREE.Shape(ring(R, 40));
  for (const [x, y, r] of lights) plate.holes.push(new THREE.Path(ring(r, 20, x, y).reverse()));
  const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: T, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -T / 2);
  plateGeo.userData.hollow = true;
  const corners = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
  corners.holes.push(new THREE.Path(ring(R - 0.01, 40).reverse()));
  const fillGeo = new THREE.ExtrudeGeometry(corners, { depth: T - 0.02, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -(T - 0.02) / 2);
  fillGeo.userData.hollow = true;
  return { plate: plateGeo, fill: fillGeo, lights };
}

/** The ring of voussoirs round a rose window (radius R, `t` wide), standing `p` proud of the face at z = 0: one stone per `n`th of the circle, a hair apart. */
export function roseRing(k: ModelKit, g: Obj, R: number, t: number, p: number, n: number, color = DRESS) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + 0.006, a1 = ((i + 1) / n) * Math.PI * 2 - 0.006, m = 6;
    const pts: THREE.Vector2[] = [];
    for (let j = 0; j <= m; j++) pts.push(new THREE.Vector2(Math.cos(a0 + ((a1 - a0) * j) / m) * R, Math.sin(a0 + ((a1 - a0) * j) / m) * R));
    for (let j = m; j >= 0; j--) pts.push(new THREE.Vector2(Math.cos(a0 + ((a1 - a0) * j) / m) * (R + t), Math.sin(a0 + ((a1 - a0) * j) / m) * (R + t)));
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: p + 0.1, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -0.1);
    k.mesh(g, geo, color, [0, 0, 0]);
  }
}

/** A lantern hung by its chain from a hood or a beam at y (facing +Z): navy iron, warm glass, a gold finial. */
export function hangingLamp(k: ModelKit, g: Obj, x: number, y: number, z: number) {
  cb(k, g, [0.05, 0.4, 0.05], [x, y - 0.2, z], IRON, undefined, 0.01);
  k.mesh(g, taper(0.36, 0.36, 0.1, 0.1, 0.18), 0x27324a, [x, y - 0.49, z]);
  k.box(g, [0.26, 0.36, 0.26], [x, y - 0.76, z], 0xffcf86, undefined, 0xffa038, 1.4);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.04, 0.4, 0.04], [x + dx * 0.14, y - 0.76, z + dz * 0.14], 0x27324a);
  cb(k, g, [0.34, 0.06, 0.34], [x, y - 0.97, z], 0x27324a, undefined, 0.01);
  k.mesh(g, new THREE.OctahedronGeometry(0.05, 1), PAL.gold, [x, y - 1.04, z]);
  k.box(g, [0.3, 0.02, 0.3], [x, y - 0.58, z], GILT);
}
