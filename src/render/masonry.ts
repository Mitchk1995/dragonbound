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
 * other by turns, course over course, never a joint up the arris. Drums are laid in whole stones round
 * their circumference, so no seam shows where the courses close, and a battered foot keeps the same
 * stones per course as the drum above. The stone itself (joints, bevels, chips, its lit top edge) is
 * drawn in the shader (paint.ts) from these coordinates.
 */

/** The course height and stone length (metres): one standard block for every wall and tower. */
export const COURSE = 0.5;
export const STONE = 1.0;

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
  /** A drum round its local Y axis (laid in whole stones round it). */
  wrap: boolean;
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
}

/**
 * The part's geometry (local space) with its stone layout: `aMason` = (stone coordinate along the
 * face, course coordinate, stone length, course height), `aMasonK` = (mode, seed) and `aMasonF` = the
 * face's arrises: its two ends in the stone coordinate (where the quoins turn it) and its foot and head
 * in the course coordinate (each pair equal where the face has none; see Laid); mode 1 a side face, 2 a
 * top or bottom face, 3 a drum's side (x = stones round it), 4 a drum's top. Upright parts are cut at the course breaks so each piece takes its own band of courses. A
 * geometry that carries its own layout already (a ring of voussoirs, a kerb laid along its line) is
 * returned as it is.
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
  // Drums: whole stones round the circumference.
  const r = Math.max(wx, wz) / 2, around = Math.max(3, Math.round((2 * Math.PI * r) / stone));
  // Tops: rows across the short side, stones along the long side.
  const longX = wx >= wz, wl = longX ? wx : wz, ws = longX ? wz : wx;
  const rows = Math.max(1, Math.round(ws / (o.course ?? COURSE * 1.2))), rowW = ws / rows, ntop = Math.max(1, Math.round(wl / stone)), ltop = wl / ntop;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
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
    for (let i = 0; i < 3; i++) {
      const v = [a, b, c][i], j = t + i;
      const cc = band.c0 + (toY(v.y) - band.a) * band.k;
      let X: number, C = cc, l: number, h = hc, mode: number, xs = 0, xe = 0;
      if (layA && layU) {
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
        const span = (lo: number, hi: number, v2: number) => 0.01 + (0.98 * (v2 - lo)) / Math.max(1e-4, hi - lo);
        mode = top ? 2 : 1;
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
      } else if (o.wrap) {
        mode = top ? 4 : 3;
        X = around;
        l = (2 * Math.PI * r) / around;
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
      FA.set([xs, xe, 0, 0], j * 4);
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
    const { l, h, mode = 1, xs = 0, xe = 0, cs = 0, ce = 0 } = cut;
    for (const i of [0, 1, 2, 0, 2, 3]) {
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
