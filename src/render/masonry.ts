import * as THREE from 'three';

/**
 * Masonry laid as a mason lays it. Every dressed-stone part of a castle prop carries its own stone
 * layout as vertex attributes (computed once, when the prop is finished): its courses fitted between
 * the bands that cross it, and its stones fitted to each face so a face ends on a whole or half stone,
 * never a sliver. The courses are one height everywhere (COURSE), counted up from the foot every
 * castle piece stands on, and every band of the castle (plinths, string courses, the courses that carry
 * the parapets) is one or more whole courses on those lines, so the courses of every wall, tower and
 * building run on level with each other wherever they meet. Each face is laid in running bond from its
 * own ends, and at every corner the stone that turns it is a quoin: long on one face and short on the
 * other by turns, course over course, never a joint up the arris. Drums are laid in rings of whole flat
 * stones, every course turned half a stone on the one under it (laidDrum), and a battered foot keeps
 * the same stones per course as the drum above. The stone itself (joints, bevels, chips, its lit top
 * edge) is drawn in the shader (paint.ts) from these coordinates.
 */

/** The course height and stone length (metres): one standard block for every wall and tower. */
export const COURSE = 0.5;
export const STONE = 1.0;
/**
 * A stone laid whole (a merlon, a quoin, a lintel) names its foot and head arrises out beyond it, a
 * course under and over: they change nothing in the shader (its own edges stay joints), and they mark it
 * for the audits as one stone, not a course.
 */
export const WHOLE_STONE: [number, number] = [-1, 2];
/** The width of a row of flags on a broad top laid on a prop's grid (a floor, a dais). */
const FLAG_W = 0.6;

/**
 * The band of courses that height y falls in, for a schedule of breaks: the course coordinate at
 * its foot `c0` (whole numbers on the joints), its foot `a` and courses per metre `k`, so the course
 * coordinate at any height in it is c0 + (y - a) * k. Beyond the schedule the courses run on at `course`.
 */
export function courseBand(breaks: number[], y: number, course = COURSE) {
  if (breaks.length < 2 || y < breaks[0]) return { c0: 0, a: breaks[0] ?? 0, k: 1 / course };
  let c0 = 0;
  for (let i = 0; i + 1 < breaks.length; i++) {
    const a = breaks[i], b = breaks[i + 1], n = Math.max(1, Math.round((b - a) / course));
    if (y <= b) return { c0, a, k: n / (b - a) };
    c0 += n;
  }
  return { c0, a: breaks[breaks.length - 1], k: 1 / course };
}

/** Sorted, de-duplicated break heights (breaks closer than `gap` merge into one). */
export function cleanBreaks(ys: number[], gap = 0.06) {
  const s = [...ys].sort((a, b) => a - b), out: number[] = [];
  for (const y of s) if (!out.length || y - out[out.length - 1] > gap) out.push(y);
  return out;
}

/** A height on the course lines (a whole number of courses up from the foot), within a hair. */
export const onCourse = (y: number) => Math.abs(y / COURSE - Math.round(y / COURSE)) < 1e-3;

/**
 * The bond's phase on each face of a rectangle `nx` by `nz` stones (each a whole number of half
 * stones), going round +Z, +X, -Z, -X: each face's stone coordinate starts at its phase, so that at
 * every corner the stone ending one face and the stone starting the next are long and short by turns
 * (a quoin), course over course. (The phases close round any such rectangle: see masonry.test.ts.)
 */
export function bondPhases(nx: number, nz: number) {
  const frac = (v: number) => v - Math.floor(v + 1e-9);
  const pz = 0, px = frac(pz - nx + 0.5), mz = frac(px - nz + 0.5), mx = frac(mz - nx + 0.5);
  return { pz, px, mz, mx };
}

/** Split every triangle of a non-indexed geometry where it crosses the horizontal planes y = ys. */
function sliceY(pos: ArrayLike<number>, nrm: ArrayLike<number>, ys: number[]) {
  const P: number[] = [], N: number[] = [];
  type V = { p: number[]; n: number[] };
  const emit = (tri: V[]) => {
    for (const q of tri) {
      P.push(q.p[0], q.p[1], q.p[2]);
      N.push(q.n[0], q.n[1], q.n[2]);
    }
  };
  /** Cut a triangle at the first plane through it, and each piece at the rest. */
  const cut = (tri: V[], planes: number[]) => {
    const lo = Math.min(tri[0].p[1], tri[1].p[1], tri[2].p[1]), hi = Math.max(tri[0].p[1], tri[1].p[1], tri[2].p[1]);
    const k = planes.findIndex((Y) => Y > lo + 1e-5 && Y < hi - 1e-5);
    if (k < 0) return emit(tri);
    const Y = planes[k], rest = planes.slice(k + 1);
    const side = tri.map((q) => (q.p[1] > Y + 1e-5 ? 1 : q.p[1] < Y - 1e-5 ? -1 : 0));
    // Walk the triangle's outline, cutting each edge that crosses Y, and keep the two pieces.
    const below: V[] = [], above: V[] = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3], sa = side[i], sb = side[(i + 1) % 3];
      if (sa <= 0) below.push(a);
      if (sa >= 0) above.push(a);
      if (sa * sb < 0) {
        const f = (Y - a.p[1]) / (b.p[1] - a.p[1]);
        const m = { p: a.p.map((x, j) => x + (b.p[j] - x) * f), n: a.n.map((x, j) => x + (b.n[j] - x) * f) };
        below.push(m);
        above.push(m);
      }
    }
    for (const poly of [below, above]) for (let i = 1; i + 1 < poly.length; i++) cut([poly[0], poly[i], poly[i + 1]], rest);
  };
  const vert = (i: number): V => ({ p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], n: [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]] });
  for (let t = 0; t < pos.length / 3; t += 3) {
    if (!ys.length) {
      for (let i = t * 3; i < t * 3 + 9; i++) {
        P.push(pos[i]);
        N.push(nrm[i]);
      }
    } else cut([vert(t), vert(t + 1), vert(t + 2)], ys);
  }
  return { P, N };
}

export interface MasonOpts {
  /** Local space to the prop's space. */
  m: THREE.Matrix4;
  /** Course breaks in the prop's space (the prop's foot and the band edges, the courses running on at their height over the last); only used when the part stands upright. */
  breaks: number[];
  /** A number to vary the stones' tones between parts. */
  seed: number;
  /** One stone: painted whole, its mortar only round its edges. */
  single?: boolean;
  /** Its own course height and stone length, where it is laid in the deliberate other size (a deep base course). */
  course?: number;
  stone?: number;
  /**
   * For a part standing square in the prop (upright, turned by right angles), the reach of the whole
   * face it is laid in, in the prop's space: x0..x1 along X for its faces toward ±Z, z0..z1 along Z
   * for its faces toward ±X. Parts laid edge to edge in one face (a wall either side of a window, the
   * walling round an arch) share it, so the bond runs on across them without a seam.
   */
  face?: { x0: number; x1: number; z0: number; z1: number };
  /**
   * The prop's own block grid (a castle building's: see MasonGrid), shared by every part standing square
   * in it: the faces it lays (`at` names each face's reach, or null where the face is laid by its own
   * ends) and its tops.
   */
  grid?: { g: MasonGrid; at: (dir: GridDir, plane: number, lo: number, hi: number) => [number, number] | null; foot: number };
}

/** A face of a part standing square in its prop: toward +Z, -Z, +X or -X. */
export type GridDir = 'pz' | 'mz' | 'px' | 'mx';

/**
 * One block grid for a whole prop (a castle building): every face toward ±Z has its joints at
 * x = ox + k * l (and halfway between on the odd courses), every face toward ±X at z = oz + (k + ½) * l
 * (the other way about), so the joints of every face in one plane, of the bands and courses standing
 * proud of it, and of a wall's two faces fall on the same lines and the bond runs on unbroken across
 * them; a wall's top is laid in through-stones on its top course's joints; and at a corner of the
 * grid's rectangle (a whole number of stones less a tenth either way, as a building's is) the stones
 * turning it are long and short by turns, a quoin. Broad tops (floors, platforms) are flagged on one
 * grid, so the floor, a dais and its steps all line up.
 */
export interface MasonGrid {
  ox: number;
  oz: number;
  l: number;
}

/**
 * The grid coordinate of a point on a face of a part square in its prop (prop space): the stone
 * coordinate along the face (whole on the joints of the even courses), and the arrises of a reach
 * [lo, hi] along it.
 */
export function gridAlong(g: MasonGrid, dir: GridDir, x: number, z: number) {
  if (dir === 'pz') return (x - g.ox) / g.l;
  if (dir === 'mz') return -(x - g.ox) / g.l;
  if (dir === 'px') return -(z - g.oz) / g.l + 0.5;
  return (z - g.oz) / g.l + 0.5;
}

/**
 * The part's geometry (local space) with its stone layout: `aMason` = (stone coordinate along the
 * face, course coordinate, stone length, course height), `aMasonK` = (mode, seed) and `aMasonF` = the
 * face's arrises: its two ends in the stone coordinate (where the quoins turn it) and its foot and head
 * in the course coordinate (each pair equal where the face has none; see Laid); mode 1 a side face, 2 a
 * top or bottom face. Upright parts are cut at the course breaks so each piece takes its own band of
 * courses. A geometry that carries its own layout already (a ring of voussoirs, a kerb laid along its
 * line, a drum laid in rings of flat stones) is returned as it is.
 */
export function masonGeometry(src: THREE.BufferGeometry, o: MasonOpts): THREE.BufferGeometry {
  if (src.getAttribute('aMason')) return src.index ? src.toNonIndexed() : src.clone();
  const geo = src.index ? src.toNonIndexed() : src;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!.clone(), e = o.m.elements;
  const upright = Math.abs(e[1]) < 1e-4 && Math.abs(e[9]) < 1e-4 && e[5] > 1e-4;
  // A band laid along a run (slopedBand: `aLay`) takes its courses along the run, not level (with its
  // own stone length and row width where it is laid as paving).
  const layA = geo.getAttribute('aLay'), layU = geo.userData.lay as { len: number; h: number; w: number; stone?: number; row?: number } | undefined;
  const course = o.course ?? COURSE, stone = o.stone ?? STONE;
  const fitted = upright && o.breaks.length >= 1 && !o.single && !layA;
  // Prop-space y of a local y (an upright part's courses are the prop's own).
  const toY = (y: number) => (fitted ? e[13] + y * e[5] : y);
  const breaks = fitted ? o.breaks : [bb.min.y, bb.max.y];
  const cuts = fitted ? breaks.map((Y) => (Y - e[13]) / e[5]).filter((y) => y > bb.min.y + 0.02 && y < bb.max.y - 0.02) : [];
  const nrm0 = geo.getAttribute('normal');
  const { P, N } = sliceY(geo.getAttribute('position').array, nrm0 ? nrm0.array : new Float32Array(geo.getAttribute('position').count * 3), cuts);
  const n = P.length / 3, A = new Float32Array(n * 4), K = new Float32Array(n * 2), FA = new Float32Array(n * 4);
  const wx = bb.max.x - bb.min.x, wz = bb.max.z - bb.min.z;
  // The faces' reach: the part's own, or (square in the prop) the whole face it is laid in.
  const F = upright ? o.face : undefined, square = !!F;
  const fx0 = F ? F.x0 : bb.min.x, fx1 = F ? F.x1 : bb.max.x, fz0 = F ? F.z0 : bb.min.z, fz1 = F ? F.z1 : bb.max.z;
  // Stones per face: a whole number of half stones, so every face ends on a whole or half stone.
  const half = (w: number) => Math.max(1, Math.round((2 * w) / stone)) / 2;
  const nx = half(fx1 - fx0), nz = half(fz1 - fz0), lx = (fx1 - fx0) / nx, lz = (fz1 - fz0) / nz;
  const pv = new THREE.Vector3(), pn = new THREE.Vector3(), rot = new THREE.Matrix3().setFromMatrix4(o.m);
  // Each face laid from its own start, going round +Z, +X, -Z, -X from the corner (min x, max z), at
  // the phase that turns every corner on a quoin.
  const ph = bondPhases(nx, nz);
  // Tops: rows across the short side, stones along the long side.
  const longX = wx >= wz, wl = longX ? wx : wz, ws = longX ? wz : wx;
  const rows = Math.max(1, Math.round(ws / (o.course ?? COURSE * 1.2))), rowW = ws / rows, ntop = Math.max(1, Math.round(wl / stone)), ltop = wl / ntop;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  // On the prop's block grid (square in it): the part's bounds in the prop's space. (A wall top's
  // through-stones are turned half a stone where the course under it is, as that course's own joints.)
  const G = square && !o.single && !layA ? o.grid : undefined;
  const pb = bb.clone().applyMatrix4(o.m), pwx = pb.max.x - pb.min.x, pwz = pb.max.z - pb.min.z;
  // (A wall's top: the face along it is on the grid, and the wall no thicker than a through-stone.)
  const topAlong: GridDir | null = !G ? null : Math.min(pwx, pwz) > 1.4 ? null : pwx >= pwz ? 'pz' : 'px';
  const topReach = G && topAlong ? G.at(topAlong, topAlong === 'pz' ? pb.max.z : pb.max.x, topAlong === 'pz' ? pb.min.x : pb.min.z, topAlong === 'pz' ? pb.max.x : pb.max.z) : null;
  const tq = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromArray(P, t * 3);
    b.fromArray(P, t * 3 + 3);
    c.fromArray(P, t * 3 + 6);
    const fn = b.clone().sub(a).cross(c.clone().sub(a));
    if (fn.lengthSq() < 1e-14) fn.set(N[t * 3], N[t * 3 + 1], N[t * 3 + 2]);
    fn.normalize();
    const top = Math.abs(fn.y) >= Math.max(Math.abs(fn.x), Math.abs(fn.z));
    // The band of courses this piece lies in (each piece lies in one: upright parts are cut at the breaks).
    const band = courseBand(breaks, toY((a.y + b.y + c.y) / 3), course), hc = 1 / band.k;
    // A side face on the grid: which way it faces in the prop, and its reach along its plane (null:
    // laid from its own ends).
    let gDir: GridDir | null = null, gReach: [number, number] | null = null, topPar = 0;
    if (G && top) topPar = Math.floor((toY((a.y + b.y + c.y) / 3) - G.foot) / course - 1e-3) % 2 ? 0.5 : 0;
    if (G && !top) {
      const qn = pn.copy(fn).applyMatrix3(rot);
      gDir = Math.abs(qn.z) >= Math.abs(qn.x) ? (qn.z > 0 ? 'pz' : 'mz') : qn.x > 0 ? 'px' : 'mx';
      const along = gDir === 'pz' || gDir === 'mz';
      let lo = Infinity, hi = -Infinity, plane = 0;
      for (const v of [a, b, c]) {
        tq.copy(v).applyMatrix4(o.m);
        lo = Math.min(lo, along ? tq.x : tq.z);
        hi = Math.max(hi, along ? tq.x : tq.z);
        plane += (along ? tq.z : tq.x) / 3;
      }
      gReach = G.at(gDir, plane, lo, hi);
    }
    for (let i = 0; i < 3; i++) {
      const v = [a, b, c][i], j = t + i;
      const cc = band.c0 + (toY(v.y) - band.a) * band.k;
      let X: number, C = cc, l: number, h = hc, mode: number, xs = 0, xe = 0, cs = 0, ce = 0;
      if (G && top && topReach) {
        // A wall's top: through-stones on the joints of its top course, its long edges arrises.
        mode = 2;
        tq.copy(v).applyMatrix4(o.m);
        const gx = topAlong === 'pz';
        X = gridAlong(G.g, topAlong!, tq.x, tq.z) + topPar;
        const e0 = gridAlong(G.g, topAlong!, gx ? topReach[0] : pb.max.x, gx ? pb.max.z : topReach[0]) + topPar, e1 = gridAlong(G.g, topAlong!, gx ? topReach[1] : pb.max.x, gx ? pb.max.z : topReach[1]) + topPar;
        [xs, xe] = [Math.min(e0, e1), Math.max(e0, e1)];
        l = G.g.l;
        h = gx ? pwz : pwx;
        C = 0.001 + (0.998 * (gx ? tq.z - pb.min.z : tq.x - pb.min.x)) / h;
        cs = 0;
        ce = 1;
      } else if (G && top) {
        // A broad top (a floor, a platform, a step): flagged on the prop's one grid, along X, its edges arrises.
        mode = 2;
        tq.copy(v).applyMatrix4(o.m);
        const fw = FLAG_W;
        X = (tq.x - G.g.ox) / G.g.l;
        C = (tq.z - G.g.oz) / fw;
        l = G.g.l;
        h = fw;
        [xs, xe] = [(pb.min.x - G.g.ox) / G.g.l, (pb.max.x - G.g.ox) / G.g.l];
        [cs, ce] = [(pb.min.z - G.g.oz) / fw, (pb.max.z - G.g.oz) / fw];
      } else if (gDir && gReach) {
        // A side face on the grid: its joints on the grid's lines, its arrises where its plane ends.
        mode = 1;
        tq.copy(v).applyMatrix4(o.m);
        X = gridAlong(G!.g, gDir, tq.x, tq.z);
        const along = gDir === 'pz' || gDir === 'mz', e0 = gridAlong(G!.g, gDir, along ? gReach[0] : 0, along ? 0 : gReach[0]), e1 = gridAlong(G!.g, gDir, along ? gReach[1] : 0, along ? 0 : gReach[1]);
        [xs, xe] = [Math.min(e0, e1), Math.max(e0, e1)];
        l = G!.g.l;
      } else if (layA && layU) {
        const s0 = layA.getX(j), t0 = layA.getY(j), q0 = layA.getZ(j), ls = layU.stone ?? stone;
        const along = layU.len / Math.max(1, Math.round(layU.len / ls)), nc = Math.max(1, Math.round(layU.h / course)), rowsA = Math.max(1, Math.round(layU.w / (layU.row ?? COURSE * 1.2)));
        mode = top ? 2 : 1;
        X = s0 / along;
        l = along;
        if (top) {
          C = q0 * rowsA;
          h = layU.w / rowsA;
        } else {
          C = t0 * nc;
          h = layU.h / nc;
          // (An end of the band: across it, in one stone.)
          if (Math.abs(layA.getX(t) - layA.getX(t + 1)) < 1e-6 && Math.abs(layA.getX(t) - layA.getX(t + 2)) < 1e-6) X = 0.01 + 0.98 * q0;
        }
      } else if (o.single) {
        // Both coordinates run 0.01 to 0.99 across the stone's faces, so no joint falls inside it.
        // (Its foot and head named as arrises beyond it, WHOLE_STONE, which mark it laid whole.)
        const span = (lo: number, hi: number, v2: number) => 0.01 + (0.98 * (v2 - lo)) / Math.max(1e-4, hi - lo);
        mode = top ? 2 : 1;
        [cs, ce] = WHOLE_STONE;
        C = span(bb.min.y, bb.max.y, v.y);
        h = bb.max.y - bb.min.y;
        if (top) {
          X = span(longX ? bb.min.x : bb.min.z, longX ? bb.max.x : bb.max.z, longX ? v.x : v.z);
          C = span(longX ? bb.min.z : bb.min.x, longX ? bb.max.z : bb.max.x, longX ? v.z : v.x);
          l = wl;
          h = ws;
        } else if (Math.abs(fn.z) >= Math.abs(fn.x)) {
          X = span(bb.min.x, bb.max.x, v.x);
          l = wx;
        } else {
          X = span(bb.min.z, bb.max.z, v.z);
          l = wz;
        }
      } else if (top) {
        mode = 2;
        const s = longX ? v.x - bb.min.x : v.z - bb.min.z, q = longX ? v.z - bb.min.z : v.x - bb.min.x;
        X = s / ltop;
        C = q / rowW;
        l = ltop;
        h = rowW;
      } else {
        mode = 1;
        // (Square in the prop: measured in the prop's space, along the whole face.)
        const q = square ? pv.copy(v).applyMatrix4(o.m) : v, qn = square ? pn.copy(fn).applyMatrix3(rot) : fn;
        if (Math.abs(qn.z) >= Math.abs(qn.x)) {
          xs = qn.z > 0 ? ph.pz : ph.mz;
          X = xs + (qn.z > 0 ? q.x - fx0 : fx1 - q.x) / lx;
          xe = xs + nx;
          l = lx;
        } else {
          xs = qn.x > 0 ? ph.px : ph.mx;
          X = xs + (qn.x > 0 ? fz1 - q.z : q.z - fz0) / lz;
          xe = xs + nz;
          l = lz;
        }
      }
      A.set([X, C, l, h], j * 4);
      K.set([mode, o.seed], j * 2);
      FA.set([xs, xe, cs, ce], j * 4);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('aMason', new THREE.Float32BufferAttribute(A, 4));
  out.setAttribute('aMasonK', new THREE.Float32BufferAttribute(K, 2));
  out.setAttribute('aMasonF', new THREE.Float32BufferAttribute(FA, 4));
  return out;
}

/** A corner of a laid face: where it is and its stone coordinates there (X along, C up, whole on the joints). */
export type LaidCorner = [x: number, y: number, z: number, X: number, C: number];

/** How a laid face's stones are cut: one stone `l` long, one course `h` high, and its arrises. */
export interface LaidCut {
  l: number;
  h: number;
  /** 1 a face laid upright (its stones get the lit top edge), 2 one lying flat. */
  mode?: 1 | 2;
  /** The face's arrises in its stone coordinates: ends xs..xe (none when equal), foot cs and head ce. */
  xs?: number;
  xe?: number;
  cs?: number;
  ce?: number;
}

/**
 * A piece that lays its own stones (masonGeometry takes it as it is): a ring of voussoirs whose joints
 * run out from the opening, a kerb laid along its line, a run of paving. Faces are added as flat quads
 * (corners counter-clockwise seen from the front), each corner carrying its stone coordinates, so the
 * joints fall wherever the builder puts the whole numbers: a stone may be its own quad with its own
 * length. An arris (`LaidCut`) is an edge of the stone with no joint, only the bevel: the corner of a
 * kerb, the edge of an arch where its face turns into the reveal.
 */
export class Laid {
  private P: number[] = [];
  private A: number[] = [];
  private K: number[] = [];
  private F: number[] = [];
  constructor(private seed: number) {}

  quad(c: [LaidCorner, LaidCorner, LaidCorner, LaidCorner], cut: LaidCut) {
    this.put(c, [0, 1, 2, 0, 2, 3], cut);
  }

  /** A flat triangle (corners counter-clockwise seen from the front). */
  tri(c: [LaidCorner, LaidCorner, LaidCorner], cut: LaidCut) {
    this.put(c, [0, 1, 2], cut);
  }

  private put(c: LaidCorner[], order: number[], cut: LaidCut) {
    const { l, h, mode = 1, xs = 0, xe = 0, cs = 0, ce = 0 } = cut;
    for (const i of order) {
      const [x, y, z, X, C] = c[i];
      this.P.push(x, y, z);
      this.A.push(X, C, l, h);
      this.K.push(mode, this.seed);
      this.F.push(xs, xe, cs, ce);
    }
  }

  get empty() {
    return !this.P.length;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('aMason', new THREE.Float32BufferAttribute(this.A, 4));
    g.setAttribute('aMasonK', new THREE.Float32BufferAttribute(this.K, 2));
    g.setAttribute('aMasonF', new THREE.Float32BufferAttribute(this.F, 4));
    g.computeVertexNormals();
    return g;
  }
}

/**
 * A run of `n` stones `L` long in all, `w` wide and `h` high, laid end to end as one box along local X
 * (centred on the origin): the joints square across it, the top's long edges, the sides' top edges and
 * its ends' upright edges arrises, so it reads as one border of dressed stones (a kerb, an inlay band).
 */
export function laidRun(L: number, w: number, h: number, n: number, seed: number) {
  const g = new Laid(seed), l = L / n, x0 = -L / 2, x1 = L / 2, z0 = -w / 2, z1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const side = { l, h, mode: 1 as const, cs: -1, ce: 1 }, end = { l: w, h, mode: 1 as const, xs: 0, xe: 1, cs: -1, ce: 1 };
  g.quad([[x0, y1, z1, 0, 0], [x1, y1, z1, n, 0], [x1, y1, z0, n, 1], [x0, y1, z0, 0, 1]], { l, h: w, mode: 2, cs: 0, ce: 1 });
  g.quad([[x0, y0, z1, 0, 0], [x1, y0, z1, n, 0], [x1, y1, z1, n, 1], [x0, y1, z1, 0, 1]], side);
  g.quad([[x1, y0, z0, n, 0], [x0, y0, z0, 0, 0], [x0, y1, z0, 0, 1], [x1, y1, z0, n, 1]], side);
  g.quad([[x1, y0, z1, 0, 0], [x1, y0, z0, 1, 0], [x1, y1, z0, 1, 1], [x1, y1, z1, 0, 1]], end);
  g.quad([[x0, y0, z0, 0, 0], [x0, y0, z1, 1, 0], [x0, y1, z1, 1, 1], [x0, y1, z0, 0, 1]], end);
  const geo = g.build();
  // (A true box: its bounds are its faces, for the geometry audit.)
  geo.userData.box = true;
  return geo;
}

/** Whole stones in each course round a drum whose corners stand at radius `r`, about one stone long each. */
export const drumStones = (r: number, stone = STONE) => Math.max(8, Math.round((2 * Math.PI * r) / stone));

/** A point in plan (x, z). */
type P2 = [number, number];

/** The point at bearing `t` (radians from +Z toward +X) and radius `r` from a drum's axis. */
const atBearing = (t: number, r: number): P2 => [Math.sin(t) * r, Math.cos(t) * r];

const area2 = (p: P2[]) => p.reduce((s, v, i) => {
  const w = p[(i + 1) % p.length];
  return s + v[0] * w[1] - w[0] * v[1];
}, 0);

/** A convex polygon cut down to where the linear function `f` is not negative. */
function clipConvex(poly: P2[], f: (v: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], fa = f(A), fb = f(B);
    if (fa >= 0) out.push(A);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
  }
  return out;
}

/**
 * The part of convex polygon `a` lying outside convex polygon `b`, as convex pieces: where one course's
 * bed shows beyond the course laid on it (the lip at each corner of a ring turned half a stone on the
 * next, the ledge of a course standing proud of a drum).
 */
function convexMinus(a: P2[], b: P2[]): P2[][] {
  const s = Math.sign(area2(b)) || 1, out: P2[][] = [];
  let rest = a;
  for (let j = 0; j < b.length && rest.length >= 3; j++) {
    const p = b[j], q = b[(j + 1) % b.length];
    const inside = (v: P2) => s * ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]));
    const piece = clipConvex(rest, (v) => -inside(v));
    if (piece.length >= 3 && Math.abs(area2(piece)) > 1e-7) out.push(piece);
    rest = clipConvex(rest, inside);
  }
  return out;
}

/**
 * A doorway's notch in a drum (see laidDrum): on the bearing `a`, its middle `o` across from the line
 * through the drum's centre, `half` its half width, cut straight back along the way through it to an
 * arc `back` from the axis, between heights y0 and y1.
 */
export interface DrumNotch {
  a: number;
  o: number;
  half: number;
  back: number;
  y0: number;
  y1: number;
}

export interface DrumOpts {
  /** The corners' radius at its foot and at its head (a battered course leans in), and a hollow ring's inner corners' (0: solid). */
  r: number;
  rTop?: number;
  rIn?: number;
  /** Its foot and head in the prop's space: its courses lie on the lines `course` apart counted up from y = 0. */
  y0: number;
  y1: number;
  /** Stones in each course (drumStones). */
  n: number;
  course?: number;
  /** The bearing of a joint in its courses on the even lines; each course on an odd line is turned half a stone from it. */
  turn?: number;
  /** Every course turned half a stone on the one under it (running bond); false lays them all at `turn`. */
  bond?: boolean;
  seed: number;
  notches?: DrumNotch[];
}

/**
 * A drum laid as a mason lays stone round a tower (the owner's rule, October 3): stone is never laid
 * truly round. Each course is a ring of `n` whole stones, each one flat face whose two side joints
 * stand on the ring's corners, so no stone ever bends round a curve and no corner cuts through a stone;
 * each course is turned half a stone on the one under it (running bond), so the outline is very
 * slightly many-sided, and where one course's corners stand past the next course's flats a small lip of
 * its bed shows, as on a laid stone tower. A hollow ring (a parapet, a basin's wall) is laid the same
 * way inside. Every face carries its stone layout with the joints on the corners and the courses on the
 * castle's course lines; tops lie flat, their joints running in from the corners, their edges arrises.
 * Doorways (`notches`) are cut straight back into the courses they pass through. The geometry is
 * flat-shaded stone by stone; userData carries its plan for the geometry audit.
 */
export function laidDrum(o: DrumOpts): THREE.BufferGeometry {
  const { r, y0, y1, n, seed } = o, rTop = o.rTop ?? r, rIn = o.rIn ?? 0, course = o.course ?? COURSE, turn = o.turn ?? 0, bond = o.bond ?? true;
  const notches = o.notches ?? [], step = (2 * Math.PI) / n, L = new Laid(seed);
  const rAt = (y: number) => r + ((rTop - r) * (y - y0)) / Math.max(1e-6, y1 - y0);
  const odd = (c: number) => (bond && ((c % 2) + 2) % 2 === 1 ? 1 : 0);
  const turnOf = (c: number) => turn + odd(c) * (step / 2);
  const onLine = (y: number) => Math.abs(y / course - Math.round(y / course)) < 1e-3;
  const ring = (rad: number, c: number): P2[] => Array.from({ length: n }, (_, i) => atBearing(turnOf(c) + i * step, rad));
  // Where a notch cuts the plan: across its way through, and in front of the drum's centre.
  const frame = (nt: DrumNotch, v: P2) => ({ lat: v[0] * Math.cos(nt.a) - v[1] * Math.sin(nt.a), along: v[0] * Math.sin(nt.a) + v[1] * Math.cos(nt.a) });
  const inNotch = (nt: DrumNotch, v: P2) => {
    const f = frame(nt, v);
    return f.along > 0 && Math.abs(f.lat - nt.o) < nt.half;
  };
  const notchesAt = (ya: number, yb: number) => notches.filter((nt) => nt.y0 < yb - 1e-6 && nt.y1 > ya + 1e-6);

  // The pieces of its height: split at the course lines and where a notch starts or stops.
  const ys = [y0, y1];
  for (let k = Math.ceil(y0 / course + 1e-6); k * course < y1 - 1e-6; k++) ys.push(k * course);
  for (const nt of notches) for (const y of [nt.y0, nt.y1]) if (y > y0 + 1e-6 && y < y1 - 1e-6) ys.push(y);
  const cuts = cleanBreaks(ys, 1e-4);

  // A stone's face (mode 1): X whole on the corners once the shader's half-stone turn of the odd courses
  // is undone, C the course coordinate; the piece's foot and head, off the course lines, are arrises.
  const sideCut = (ya: number, yb: number, rad: number) => ({
    l: 2 * rad * Math.sin(step / 2), h: course, mode: 1 as const,
    cs: ya === y0 && !onLine(ya) ? ya / course : -1e3, ce: yb === y1 && !onLine(yb) ? yb / course : 1e3,
  });
  for (let s = 0; s + 1 < cuts.length; s++) {
    const ya = cuts[s], yb = cuts[s + 1], c = Math.floor((ya + yb) / 2 / course), sh = odd(c) / 2;
    const Ca = ya / course, Cb = yb / course, ra = rAt(ya), rb = rAt(yb), cut = sideCut(ya, yb, (ra + rb) / 2);
    const fa = ring(ra, c), fb = ring(rb, c), here = notchesAt(ya, yb);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // The stretch of this stone's face the notches leave standing (parameters along it, 0..1).
      let keep: [number, number][] = [[0, 1]];
      for (const nt of here) {
        const A = frame(nt, fa[i]), B = frame(nt, fa[j]);
        // Where along the face it lies inside the notch: between its two sides, in front of the centre.
        const span = (va: number, vb: number, lo: number, hi: number): [number, number] => {
          if (Math.abs(vb - va) < 1e-9) return va > lo && va < hi ? [0, 1] : [1, 0];
          const t0 = (lo - va) / (vb - va), t1 = (hi - va) / (vb - va);
          return [Math.min(t0, t1), Math.max(t0, t1)];
        };
        const [l0, l1] = span(A.lat, B.lat, nt.o - nt.half, nt.o + nt.half), [a0, a1] = span(A.along, B.along, 0, Infinity);
        const t0 = Math.max(0, l0, a0), t1 = Math.min(1, l1, a1);
        if (t1 <= t0) continue;
        keep = keep.flatMap(([u, v]) => [[u, Math.min(v, t0)], [Math.max(u, t1), v]] as [number, number][]).filter(([u, v]) => v - u > 1e-4);
      }
      for (const [u, v] of keep) {
        const at = (p: P2[], t: number): P2 => [p[i][0] + (p[j][0] - p[i][0]) * t, p[i][1] + (p[j][1] - p[i][1]) * t];
        const [a, b, d, e] = [at(fa, u), at(fa, v), at(fb, v), at(fb, u)];
        L.quad([[a[0], ya, a[1], i + u - sh, Ca], [b[0], ya, b[1], i + v - sh, Ca], [d[0], yb, d[1], i + v - sh, Cb], [e[0], yb, e[1], i + u - sh, Cb]], cut);
      }
      if (rIn > 0) {
        const qa = ring(rIn, c), q0 = qa[i], q1 = qa[j];
        L.quad([[q1[0], ya, q1[1], i + 1 - sh, Ca], [q0[0], ya, q0[1], i - sh, Ca], [q0[0], yb, q0[1], i - sh, Cb], [q1[0], yb, q1[1], i + 1 - sh, Cb]], sideCut(ya, yb, rIn));
      }
    }
    // A notch's back and sides, behind the doorway's surround.
    for (const nt of here) {
      const pt = (lat: number, along: number): P2 => [lat * Math.cos(nt.a) + along * Math.sin(nt.a), -lat * Math.sin(nt.a) + along * Math.cos(nt.a)];
      const arc = Array.from({ length: 7 }, (_, k) => {
        const lat = nt.o - nt.half + (2 * nt.half * k) / 6;
        return pt(lat, Math.sqrt(Math.max(0, nt.back * nt.back - lat * lat)));
      });
      for (let k = 0; k < 6; k++) {
        const [a, b] = [arc[k], arc[k + 1]];
        L.quad([[a[0], ya, a[1], k / 6, Ca], [b[0], ya, b[1], (k + 1) / 6, Ca], [b[0], yb, b[1], (k + 1) / 6, Cb], [a[0], yb, a[1], k / 6, Cb]], { l: 2 * nt.half, h: course });
      }
      for (const sx of [-1, 1]) {
        const lat = nt.o + sx * nt.half, face = Math.sqrt(Math.max(0, ra * ra - lat * lat)), back = Math.sqrt(Math.max(0, nt.back * nt.back - lat * lat));
        const [p, q] = sx < 0 ? [pt(lat, face), pt(lat, back)] : [pt(lat, back), pt(lat, face)];
        L.quad([[p[0], ya, p[1], 0, Ca], [q[0], ya, q[1], 1, Ca], [q[0], yb, q[1], 1, Cb], [p[0], yb, p[1], 0, Cb]], { l: face - back, h: course });
      }
    }
  }

  // The flat faces (mode 2): X whole on the corners of the course they belong to, C running out from the
  // inner edge to the outer, both edges arrises.
  const flat = (poly: P2[], y: number, c: number, up: boolean, rOut: number, rI: number) => {
    const t0 = turnOf(c), w = Math.max(0.05, rOut - rI), cut = { l: 2 * rOut * Math.sin(step / 2), h: w, mode: 2 as const, cs: 0, ce: 0.999 };
    const mid = Math.atan2(poly.reduce((s, v) => s + v[0], 0), poly.reduce((s, v) => s + v[1], 0));
    const corner = (v: P2): LaidCorner => {
      const b = Math.atan2(v[0], v[1]), th = mid + Math.atan2(Math.sin(b - mid), Math.cos(b - mid));
      return [v[0], y, v[1], (th - t0) / step, (0.999 * (Math.hypot(v[0], v[1]) - rI)) / w];
    };
    for (let i = 1; i + 1 < poly.length; i++) {
      const tri: [LaidCorner, LaidCorner, LaidCorner] = [corner(poly[0]), corner(poly[i]), corner(poly[i + 1])];
      // (Wound to face up or down: in plan (x, z) a counter-clockwise turn faces down.)
      const ccw = area2([poly[0], poly[i], poly[i + 1]]) > 0;
      L.tri(ccw === up ? [tri[0], tri[2], tri[1]] : tri, cut);
    }
  };
  /** A whole bed or top: the ring between its outer and inner corners (a solid drum's closed at its heart). */
  const cap = (y: number, c: number, up: boolean) => {
    const rad = rAt(y), ri = rIn > 0 ? rIn : 0.04 * rad, out = ring(rad, c), inn = ring(ri, c);
    for (let i = 0; i < n; i++) flat([out[i], out[(i + 1) % n], inn[(i + 1) % n], inn[i]], y, c, up, rad, ri);
    if (!(rIn > 0)) flat(inn, y, c, up, rad, 0);
  };
  const c0 = Math.floor((cuts[0] + cuts[1]) / 2 / course), c1 = Math.floor((cuts[cuts.length - 2] + cuts[cuts.length - 1]) / 2 / course);
  cap(y0, c0, false);
  cap(y1, c1, true);
  // Between courses, the bed of each showing beyond the other (never inside a doorway's notch).
  for (let k = Math.ceil(y0 / course + 1e-6); k * course < y1 - 1e-6; k++) {
    const y = k * course, rad = rAt(y), lo = ring(rad, k - 1), hi = ring(rad, k);
    const shows = (p: P2[]) => {
      const m: P2 = [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length];
      return !notches.some((nt) => y >= nt.y0 - 1e-6 && y <= nt.y1 + 1e-6 && inNotch(nt, m));
    };
    for (const p of convexMinus(lo, hi)) if (shows(p)) flat(p, y, k - 1, true, rad, rIn);
    for (const p of convexMinus(hi, lo)) if (shows(p)) flat(p, y, k, false, rad, rIn);
    if (rIn > 0) {
      const ilo = ring(rIn, k - 1), ihi = ring(rIn, k);
      for (const p of convexMinus(ihi, ilo)) flat(p, y, k - 1, true, rad, rIn);
      for (const p of convexMinus(ilo, ihi)) flat(p, y, k, false, rad, rIn);
    }
  }
  const geo = L.build();
  // (For the geometry audit: a drum round its own axis, `n` flat sides to a course.)
  geo.userData.ring = [rIn, Math.max(r, rTop)];
  geo.userData.drum = { r, rTop, sides: n };
  if (notches.length) geo.userData.notched = true;
  return geo;
}
