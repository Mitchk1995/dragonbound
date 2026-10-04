import * as THREE from 'three';
import { LDU } from './scale';

/**
 * Geometry for the brick elements, built in LDU and handed to three.js in metres: bevelled prisms
 * (a profile drawn in a plane and pushed straight through it, every edge chamfered) and bevelled
 * turned shapes. A chamfer is shaded from one face's normal to the next, so each edge catches the
 * light like the slightly rounded edge of a moulded part, while the faces themselves stay flat.
 */

export type V2 = readonly [number, number];

/**
 * A closed profile. `smooth[i]` shades across point i (a curve); `round[i]` marks edge i (from point
 * i to i + 1) as a chamfer, shaded from the edge before it to the edge after it; `group[i]` puts
 * edge i's faces in another mesh (a slope's textured face).
 */
export interface Ring {
  pts: V2[];
  smooth: boolean[];
  round: boolean[];
  group: number[];
}

const v3 = new THREE.Vector3(), w3 = new THREE.Vector3(), u3 = new THREE.Vector3();

/** A triangle mesh under construction, in LDU. */
export class Mesh3 {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly idx: number[] = [];

  get empty() {
    return this.idx.length === 0;
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    return this.pos.length / 3 - 1;
  }

  /** A triangle, wound to face along `facing` when given. */
  tri(a: number, b: number, c: number, facing?: THREE.Vector3) {
    if (facing && this.normalOf(a, b, c).dot(facing) < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number, facing?: THREE.Vector3) {
    // (Wound by the triangle with the larger area, so a quad collapsing to a triangle still faces right.)
    const flip = facing ? (this.normalOf(a, b, c).add(this.normalOf(a, c, d)).dot(facing) < 0) : false;
    if (flip) this.idx.push(a, c, b, a, d, c);
    else this.idx.push(a, b, c, a, c, d);
  }

  private normalOf(a: number, b: number, c: number) {
    const p = this.pos;
    v3.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    w3.set(p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]);
    return u3.crossVectors(v3, w3).clone();
  }

  /** Appends `o`, moved by `m` (a rotation and translation). */
  add(o: Mesh3, m?: THREE.Matrix4) {
    const base = this.pos.length / 3;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    for (let i = 0; i < o.pos.length; i += 3) {
      v3.set(o.pos[i], o.pos[i + 1], o.pos[i + 2]);
      w3.set(o.nor[i], o.nor[i + 1], o.nor[i + 2]);
      if (m) {
        v3.applyMatrix4(m);
        w3.applyMatrix3(nm!).normalize();
      }
      this.pos.push(v3.x, v3.y, v3.z);
      this.nor.push(w3.x, w3.y, w3.z);
    }
    for (const i of o.idx) this.idx.push(base + i);
    return this;
  }

  /** A copy moved by `m`. */
  moved(m: THREE.Matrix4) {
    return new Mesh3().add(this, m);
  }

  /** The bounds in LDU: [min, max]. */
  bounds(): [THREE.Vector3, THREE.Vector3] {
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < this.pos.length; i += 3) {
      v3.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
      lo.min(v3);
      hi.max(v3);
    }
    return [lo, hi];
  }

  /** In metres, for three.js. */
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos.map((v) => v * LDU), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ─── Profiles ───────────────────────────────────────────────────────────────

const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const len = (a: V2) => Math.hypot(a[0], a[1]);
const norm = (a: V2): V2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** The outward normal of the edge a → b of a counter-clockwise ring (or of a clockwise hole). */
const edgeNormal = (a: V2, b: V2): V2 => norm([b[1] - a[1], a[0] - b[0]]);

/** Signed area (positive when counter-clockwise). */
export function area(pts: V2[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/**
 * A ring from a polygon: every corner turning more than `curve` radians is cut back by `bevel`
 * along both its edges (a chamfer, shaded round), gentler turns are left as smooth curve points.
 * `groups` gives each original edge's mesh group.
 */
export function ring(poly: V2[], bevel: number, groups?: number[], curve = 0.36): Ring {
  const n = poly.length, out: Ring = { pts: [], smooth: [], round: [], group: [] };
  const turn = (i: number) => {
    const a = norm(sub(poly[i], poly[(i - 1 + n) % n])), b = norm(sub(poly[(i + 1) % n], poly[i]));
    return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
  };
  for (let i = 0; i < n; i++) {
    const p = poly[i], prev = poly[(i - 1 + n) % n], next = poly[(i + 1) % n];
    const g = groups?.[i] ?? 0;
    if (bevel > 0 && turn(i) > curve) {
      const lp = len(sub(p, prev)), ln = len(sub(next, p));
      const cp = Math.min(bevel, lp * 0.4), cn = Math.min(bevel, ln * 0.4);
      const dp = norm(sub(prev, p)), dn = norm(sub(next, p));
      out.pts.push([p[0] + dp[0] * cp, p[1] + dp[1] * cp], [p[0] + dn[0] * cn, p[1] + dn[1] * cn]);
      out.smooth.push(false, false);
      out.round.push(true, false);
      out.group.push(0, g);
    } else {
      out.pts.push(p);
      out.smooth.push(turn(i) <= curve);
      out.round.push(false);
      out.group.push(g);
    }
  }
  return out;
}

/** The ring wound counter-clockwise (`ccw`) or clockwise, its flags kept on the same points and edges. */
function orient(r: Ring, ccw: boolean): Ring {
  if (area(r.pts) > 0 === ccw) return r;
  const n = r.pts.length, back = (i: number) => (((n - 2 - i) % n) + n) % n;
  return {
    pts: r.pts.slice().reverse(),
    smooth: r.smooth.slice().reverse(),
    round: r.pts.map((_, i) => r.round[back(i)]),
    group: r.pts.map((_, i) => r.group[back(i)]),
  };
}

/** A rectangle [x0, x1] × [y0, y1], counter-clockwise. */
export const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Points along an ellipse arc from angle a0 to a1 (radians), centre (cx, cy), radii rx, ry. */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, seg: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

// ─── Prisms ─────────────────────────────────────────────────────────────────

/** How a prism's profile plane and its depth lie in the element: the profile in x–y, in z–y, or flat in x–z. */
export type Axis = 'z' | 'x' | 'y';

const AXES: Record<Axis, THREE.Matrix4> = {
  // (u, v, w) → (x, y, z): the profile in x–y, pushed along z.
  z: new THREE.Matrix4(),
  // The profile in z–y (u = z), pushed along x.
  x: new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1),
  // The profile flat (u = x, v = −z), pushed up y.
  y: new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1),
};

/**
 * A bevelled prism: `outer` (counter-clockwise) less `holes` (clockwise), `depth` deep and centred on
 * its plane, every edge bevelled by `bevel`. Returns one mesh per group (group 0 first), laid along
 * `axis` and moved by `at` (the middle of its depth).
 */
export function prism(outer: Ring, holes: Ring[], depth: number, bevel: number, axis: Axis = 'z', at: [number, number, number] = [0, 0, 0]): Mesh3[] {
  const meshes: Mesh3[] = [];
  const mesh = (g: number) => (meshes[g] ??= new Mesh3());
  const rings = [orient(outer, true), ...holes.map((h) => orient(h, false))];
  const h = depth / 2 - bevel, H = depth / 2;
  const inset: V2[][] = [];
  const facing = new THREE.Vector3();
  for (const r of rings) {
    const n = r.pts.length;
    const en = r.pts.map((p, i) => edgeNormal(p, r.pts[(i + 1) % n]));
    const at = (i: number) => en[(i + n) % n];
    const avg = (a: V2, b: V2) => norm([a[0] + b[0], a[1] + b[1]]);
    const startN = (i: number): V2 => (r.round[i] ? at(i - 1) : r.smooth[i] ? avg(at(i - 1), at(i)) : at(i));
    const endN = (i: number): V2 => (r.round[i] ? at(i + 1) : r.smooth[(i + 1) % n] ? avg(at(i), at(i + 1)) : at(i));
    // The cap's outline: each point moved in so every edge stands `bevel` inside its side.
    const q = r.pts.map((p, i): V2 => {
      if (bevel <= 0) return p;
      const m = avg(at(i - 1), at(i));
      const k = bevel / Math.max(0.35, m[0] * at(i)[0] + m[1] * at(i)[1]);
      return [p[0] - m[0] * k, p[1] - m[1] * k];
    });
    inset.push(q);
    for (let i = 0; i < n; i++) {
      const M = mesh(r.group[i]);
      const a = r.pts[i], b = r.pts[(i + 1) % n], sa = startN(i), sb = endN(i);
      facing.set(en[i][0], en[i][1], 0);
      const A0 = M.vert(a[0], a[1], -h, sa[0], sa[1], 0), B0 = M.vert(b[0], b[1], -h, sb[0], sb[1], 0);
      const B1 = M.vert(b[0], b[1], h, sb[0], sb[1], 0), A1 = M.vert(a[0], a[1], h, sa[0], sa[1], 0);
      M.quad(A0, B0, B1, A1, facing);
      if (bevel <= 0) continue;
      const qa = q[i], qb = q[(i + 1) % n];
      for (const s of [1, -1]) {
        const SA = M.vert(a[0], a[1], s * h, sa[0], sa[1], 0), SB = M.vert(b[0], b[1], s * h, sb[0], sb[1], 0);
        const QB = M.vert(qb[0], qb[1], s * H, 0, 0, s), QA = M.vert(qa[0], qa[1], s * H, 0, 0, s);
        facing.set(en[i][0], en[i][1], s);
        M.quad(SA, SB, QB, QA, facing);
      }
    }
  }
  // The two caps.
  const contour = inset[0].map((p) => new THREE.Vector2(p[0], p[1]));
  const holeVs = inset.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holeVs);
  const all = [...contour, ...holeVs.flat()];
  const M = mesh(0);
  for (const s of [1, -1]) {
    const base = M.pos.length / 3;
    for (const p of all) M.vert(p.x, p.y, s * H, 0, 0, s);
    facing.set(0, 0, s);
    for (const f of faces) M.tri(base + f[0], base + f[1], base + f[2], facing);
  }
  const m = AXES[axis].clone().setPosition(at[0], at[1], at[2]);
  return Array.from(meshes, (x) => (x ? x.moved(m) : new Mesh3()));
}

/** A bevelled box from (x0, y0, z0) to (x1, y1, z1), in LDU. */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, bevel: number): Mesh3 {
  const b = Math.min(bevel, (x1 - x0) * 0.3, (y1 - y0) * 0.3, (z1 - z0) * 0.3);
  return prism(ring(rect(x0, y0, x1, y1), b), [], z1 - z0, b, 'z', [0, 0, (z0 + z1) / 2])[0];
}

// ─── Turned shapes ──────────────────────────────────────────────────────────

/** A point of a turned profile: radius and height, with the same shading flags as a ring. */
export interface Turn {
  r: number;
  y: number;
  /** Shade across this point (a curve). */
  smooth?: boolean;
  /** The edge from this point to the next is a chamfer, shaded from the edge before to the edge after. */
  round?: boolean;
}

/**
 * A shape turned about the vertical: `profile` runs from the bottom up the outside (radius ≥ 0),
 * `seg` faces round. `at` is its centre at the foot.
 */
export function turned(profile: Turn[], seg: number, at: [number, number, number] = [0, 0, 0]): Mesh3 {
  const M = new Mesh3();
  const n = profile.length;
  const en: V2[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = profile[i], b = profile[i + 1];
    en.push(norm([b.y - a.y, a.r - b.r]));
  }
  const avg = (a: V2, b: V2) => norm([a[0] + b[0], a[1] + b[1]]);
  const facing = new THREE.Vector3();
  for (let i = 0; i + 1 < n; i++) {
    const a = profile[i], b = profile[i + 1];
    const prev = en[i - 1] ?? en[i], next = en[i + 1] ?? en[i];
    const na = a.round ? prev : a.smooth ? avg(prev, en[i]) : en[i];
    const nb = a.round ? next : b.smooth ? avg(en[i], next) : en[i];
    const ring0: number[] = [], ring1: number[] = [];
    for (let j = 0; j <= seg; j++) {
      const t = (j / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      ring0.push(M.vert(at[0] + a.r * c, at[1] + a.y, at[2] + a.r * s, na[0] * c, na[1], na[0] * s));
      ring1.push(M.vert(at[0] + b.r * c, at[1] + b.y, at[2] + b.r * s, nb[0] * c, nb[1], nb[0] * s));
    }
    for (let j = 0; j < seg; j++) {
      const t = ((j + 0.5) / seg) * Math.PI * 2;
      facing.set(en[i][0] * Math.cos(t), en[i][1], en[i][0] * Math.sin(t));
      if (b.r === 0) M.tri(ring0[j], ring0[j + 1], ring1[j], facing);
      else if (a.r === 0) M.tri(ring0[j], ring1[j + 1], ring1[j], facing);
      else M.quad(ring0[j], ring0[j + 1], ring1[j + 1], ring1[j], facing);
    }
  }
  return M;
}

/** A bevelled cylinder standing on (x, y, z): radius r, height h, its top (and its foot, if `foot`) edge bevelled. */
export function cylinder(r: number, h: number, bevel: number, seg: number, at: [number, number, number] = [0, 0, 0], foot = true): Mesh3 {
  const b = Math.min(bevel, r * 0.3, h * 0.3);
  const p: Turn[] = b <= 0
    ? [...(foot ? [{ r: 0, y: 0 }] : []), { r, y: 0 }, { r, y: h }, { r: 0, y: h }]
    : foot
      ? [{ r: 0, y: 0 }, { r: r - b, y: 0, round: true }, { r, y: b }, { r, y: h - b, round: true }, { r: r - b, y: h }, { r: 0, y: h }]
      : [{ r, y: 0 }, { r, y: h - b, round: true }, { r: r - b, y: h }, { r: 0, y: h }];
  return turned(p, seg, at);
}

/** Joins meshes into one. */
export function join(...parts: Mesh3[]): Mesh3 {
  const out = new Mesh3();
  for (const p of parts) out.add(p);
  return out;
}
