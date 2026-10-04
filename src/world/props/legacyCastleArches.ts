import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from '../../render/blocks';
import { ModelKit } from '../../render/kit';
import { COURSE, Laid, type LaidCorner } from '../../render/masonry';
import { DRESS } from './palette';

// The castle's pointed arches and the stones that dress them, and its laid kerbs.
// Legacy: replaced by the modular kit (src/world/kit) and deleted with the old building code.

/**
 * A band `w` wide and `h` high along a polyline in plan (points (x, z), its ends open), mitred at every
 * bend like mitredBand and extruded up from y = 0, as one piece that lays its own stones (masonry.ts,
 * Laid): each run between sharp turns cut into whole stones as near `stone` long as fit, the joints
 * square across it and on the mitre where it turns sharply, the top's long edges, the sides' top edges
 * and its two ends arrises, so it reads as one kerb of dressed stones, never a row of pieces. The audit
 * sees each stretch as its own box along it.
 */
export function laidBand(pts: THREE.Vector2[], w: number, h: number, stone: number, seed: number) {
  const n = pts.length, hw = w / 2;
  const dir = (i: number) => pts[i + 1].clone().sub(pts[i]).normalize();
  const left = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  const mitre = (i: number) => {
    if (i === 0) return left(dir(0));
    if (i === n - 1) return left(dir(n - 2));
    const m = left(dir(i - 1)).add(left(dir(i))).normalize();
    return m.divideScalar(Math.max(0.35, m.dot(left(dir(i)))));
  };
  // The stone coordinate at each point: whole at both ends of every run between sharp turns.
  const X = [0];
  for (let a = 0; a < n - 1;) {
    let b = a + 1;
    while (b < n - 1 && dir(b - 1).dot(dir(b)) > Math.cos(Math.PI / 6)) b++;
    let len = 0;
    for (let i = a; i < b; i++) len += pts[i].distanceTo(pts[i + 1]);
    const k = Math.max(1, Math.round(len / stone));
    for (let i = a, acc = 0; i < b; i++) {
      acc += pts[i].distanceTo(pts[i + 1]);
      X[i + 1] = X[a] + (k * acc) / len;
    }
    a = b;
  }
  const L = new Laid(seed), boxes: { c: number[]; h: number[]; ry: number }[] = [];
  const at = (q: THREE.Vector2, y: number, Xv: number, C: number): LaidCorner => [q.x, y, q.y, Xv, C];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1], ma = mitre(i), mb = mitre(i + 1), out = left(dir(i));
    const oa = a.clone().addScaledVector(ma, hw), ob = b.clone().addScaledVector(mb, hw), ia = a.clone().addScaledVector(ma, -hw), ib = b.clone().addScaledVector(mb, -hw);
    const l = a.distanceTo(b) / Math.max(1e-6, X[i + 1] - X[i]);
    laidFace(L, [at(ia, h, X[i], 0), at(ib, h, X[i + 1], 0), at(ob, h, X[i + 1], 1), at(oa, h, X[i], 1)], [0, 1, 0], { l, h: w, mode: 2, cs: 0, ce: 1 });
    laidFace(L, [at(oa, 0, X[i], 0), at(ob, 0, X[i + 1], 0), at(ob, h, X[i + 1], 1), at(oa, h, X[i], 1)], [out.x, 0, out.y], { l, h, cs: -1, ce: 1 });
    laidFace(L, [at(ia, 0, X[i], 0), at(ib, 0, X[i + 1], 0), at(ib, h, X[i + 1], 1), at(ia, h, X[i], 1)], [-out.x, 0, -out.y], { l, h, cs: -1, ce: 1 });
    const d = b.clone().sub(a);
    boxes.push({ c: [(a.x + b.x) / 2, h / 2, (a.y + b.y) / 2], h: [d.length() / 2, h / 2, hw], ry: Math.atan2(-d.y, d.x) });
  }
  // Its two ends, square across it.
  for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
    const m = mitre(i), o = pts[i].clone().addScaledVector(m, hw), u = pts[i].clone().addScaledVector(m, -hw), away = pts[i].clone().sub(pts[j]).normalize();
    laidFace(L, [at(u, 0, 0, 0), at(o, 0, 1, 0), at(o, h, 1, 1), at(u, h, 0, 1)], [away.x, 0, away.y], { l: w, h, xs: 0, xe: 1, cs: -1, ce: 1 });
  }
  const geo = L.build();
  geo.userData.boxes = boxes;
  return geo;
}

/**
 * A pointed (two-centred) arch `w` wide whose apex stands `h` above its sill: straight jambs up to
 * the springing, then two arcs meeting at the apex (an equilateral arch where the opening is tall
 * enough). Returns the springing height, the arch's rise and the points of its right-hand arc from
 * the springing to the apex (x across from the centre line, y up from the sill); the left-hand arc
 * is its mirror.
 */
export function pointedArch(w: number, h: number, n = 7, rise?: number) {
  const hw = w / 2, ah = rise ?? Math.min(w * 0.866, h * 0.62), ys = h - ah;
  const c = (ah * ah - hw * hw) / w, R = hw + c, ta = Math.atan2(ah, c);
  const arc: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (ta * i) / n;
    arc.push([-c + R * Math.cos(t), ys + R * Math.sin(t)]);
  }
  return { ys, ah, arc, c, R };
}

/** The opening of a pointed arch as a Shape (sill at y = 0, centred on x = 0). */
export function archShape(w: number, h: number, n = 7) {
  const { arc } = pointedArch(w, h, n), hw = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  for (const [x, y] of arc) s.lineTo(x, y);
  for (let i = arc.length - 2; i >= 0; i--) s.lineTo(-arc[i][0], arc[i][1]);
  s.closePath();
  return s;
}

/**
 * The two spandrels that fill a square-headed opening `w` wide and `h` tall down to a pointed arch
 * inside it (so a rectangular hole in a wall reads as a pointed lancet), extruded `dep` deep and
 * centred on z = 0.
 */
const spandrelCache = new Map<string, THREE.BufferGeometry>();
export function spandrels(w: number, h: number, dep: number, rise?: number) {
  const key = `${w},${h},${dep},${rise}`;
  let g = spandrelCache.get(key);
  if (g) return g;
  const { arc } = pointedArch(w, h, 7, rise), hw = w / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(sx * hw, arc[0][1] - 0.01);
    s.lineTo(sx * (hw + 0.01), h + 0.01);
    s.lineTo(0, h + 0.01);
    for (let i = arc.length - 1; i >= 0; i--) s.lineTo(sx * arc[i][0], arc[i][1]);
    s.closePath();
    parts.push(new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: false }).translate(0, 0, -dep / 2));
  }
  g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  g.computeVertexNormals();
  g.userData.hollow = true;
  spandrelCache.set(key, g);
  return g;
}

/** A pane of glass in a pointed opening, `dep` thick, centred on z = 0. */
const paneCache = new Map<string, THREE.BufferGeometry>();
export function archPane(w: number, h: number, dep: number) {
  const key = `${w},${h},${dep}`;
  let g = paneCache.get(key);
  if (!g) {
    g = new THREE.ExtrudeGeometry(archShape(w, h), { depth: dep, bevelEnabled: false }).translate(0, 0, -dep / 2);
    paneCache.set(key, g);
  }
  return g;
}

/**
 * The stones of a pointed arch (`w` wide, apex `h` above the sill at y = 0, centred on x = 0, the
 * arch rising `rise` over its springing) laid between `r0` and `r1` out from the opening's edge, as
 * outlines in the arch's plane: `n` voussoirs a side, cut on true radial joints so they close on each
 * other with no gap and no step, and a keystone `kw` wide at its foot closing the two arcs on the
 * centre line. Each comes with its place in the ring counted from the keystone (0) out to the springing.
 */
export function archStones(w: number, h: number, rise: number | undefined, r0: number, r1: number, n: number, kw: number) {
  const { ys, c, R } = pointedArch(w, h, 2, rise);
  /** The right-hand arc `d` out from the opening at angle `a` (0 at the springing). */
  const at = (d: number, a: number): [number, number] => [-c + (R + d) * Math.cos(a), ys + (R + d) * Math.sin(a)];
  /** Where the right-hand arc `d` out reaches the centre line. */
  const apexA = (d: number) => Math.atan2(Math.sqrt(Math.max(0, (R + d) ** 2 - c * c)), c);
  const keyA = Math.acos(Math.min(1, (kw / 2 + c) / (R + r0)));
  const arcPts = (d: number, a: number, b: number, k = 4) => Array.from({ length: k + 1 }, (_, i) => at(d, a + ((b - a) * i) / k));
  const out: { pts: [number, number][]; place: number }[] = [];
  for (let j = 0; j < n; j++) {
    const a = (keyA * j) / n, b = (keyA * (j + 1)) / n;
    const right = [...arcPts(r0, a, b), ...arcPts(r1, b, a)];
    for (const sx of [1, -1]) out.push({ pts: (sx > 0 ? right : right.map(([x, y]) => [-x, y] as [number, number]).reverse()), place: n - j });
  }
  const inR = arcPts(r0, keyA, apexA(r0)), outR = arcPts(r1, apexA(r1), keyA);
  const mirror = (p: [number, number][]) => p.map(([x, y]) => [-x, y] as [number, number]).reverse();
  out.push({ pts: [...inR, ...mirror(inR).slice(1), ...mirror(outR), ...outR.slice(1)], place: 0 });
  return out;
}

/** Add a laid quad turned so its face looks along `toward` (corners in either order round it). */
function laidFace(L: Laid, c: [LaidCorner, LaidCorner, LaidCorner, LaidCorner], toward: [number, number, number], cut: Parameters<Laid['quad']>[1]) {
  const [a, b, d] = [c[0], c[1], c[2]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  L.quad(n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? c : [c[0], c[3], c[2], c[1]], cut);
}

/**
 * The dressed ring of a pointed opening, in a face at z = 0 facing +Z, as stones that each lay their own
 * joints (masonry.ts, Laid): the opening `w` wide with its apex `h` over the sill at y = 0, centred on
 * x = 0, its arch rising `rise` over the springing; the ring `t` wide all round, `out` beyond the
 * opening's edge (inside it when negative), standing `p` proud of the face and running `dep` back into
 * the reveal, all one stone. Its `n` voussoirs a side are cut on the arch's radial joints (archStones),
 * closing on a keystone `kw` wide; with `foot` it runs on down both jambs as stones bedded on the
 * walling's course lines (`grid`: how far over the line the courses are counted from the sill stands),
 * none under a quarter course. The face's inner edge and the reveal's front edge are arrises. Each stone
 * comes with the height of its foot, and its bounds for the geometry audit, so a caller that splits its
 * walls by height can set each stone in its own band.
 */
export function dressedArch(o: { w: number; h: number; rise?: number; t: number; p: number; dep: number; out?: number; n: number; kw?: number; foot?: number; grid?: number; seed?: number }) {
  const { w, h, t, p, dep, out = 0, n, kw = 0.4, grid = 0, seed = 0 } = o;
  const { ys } = pointedArch(w, h, 2, o.rise), x0 = w / 2 + out, x1 = x0 + t;
  const stones: { geo: THREE.BufferGeometry; y: number }[] = [];
  const length = (q: [number, number][]) => q.slice(1).reduce((a, v, i) => a + Math.hypot(v[0] - q[i][0], v[1] - q[i][1]), 0);
  let X = 0;
  /** One stone from its inner and outer edges, both in the ring's own order (up the left, down the right). */
  const lay = (inner: [number, number][], outer: [number, number][]) => {
    const L = new Laid(seed), k = inner.length - 1, len = (length(inner) + length(outer)) / 2;
    const Xs = inner.map((_, i) => X + i / k);
    for (let i = 0; i < k; i++) {
      const a = inner[i], b = inner[i + 1], c = outer[i + 1], d = outer[i];
      // The face; the reveal under the stone, toward the opening; and its edge standing proud of the wall.
      laidFace(L, [[a[0], a[1], p, Xs[i], 0], [b[0], b[1], p, Xs[i + 1], 0], [c[0], c[1], p, Xs[i + 1], 1], [d[0], d[1], p, Xs[i], 1]], [0, 0, 1], { l: len, h: t, mode: 2, cs: 0, ce: 2 });
      laidFace(L, [[a[0], a[1], p, Xs[i], 1], [b[0], b[1], p, Xs[i + 1], 1], [b[0], b[1], -dep, Xs[i + 1], 0], [a[0], a[1], -dep, Xs[i], 0]], [a[0] - d[0], a[1] - d[1], 0], { l: len, h: p + dep, mode: 2, cs: -1, ce: 1 });
      laidFace(L, [[d[0], d[1], 0, Xs[i], 0], [c[0], c[1], 0, Xs[i + 1], 0], [c[0], c[1], p, Xs[i + 1], 1], [d[0], d[1], p, Xs[i], 1]], [d[0] - a[0], d[1] - a[1], 0], { l: len, h: p, mode: 2, cs: -1, ce: 1 });
    }
    const geo = L.build(), all = [...inner, ...outer];
    // (For the geometry audit: the stone's own bounds, never the opening it frames.)
    geo.userData.boxes = [[Math.min(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), -dep, Math.max(...all.map((q) => q[0])), Math.max(...all.map((q) => q[1])), p]];
    stones.push({ geo, y: Math.min(...all.map((q) => q[1])) });
    X += 1;
  };
  // The jambs' beds: on the course lines between the foot and the springing, a quarter course clear of both.
  const beds: number[] = [];
  if (o.foot !== undefined) {
    beds.push(o.foot);
    for (let k = Math.ceil((o.foot + grid) / COURSE); k * COURSE - grid < ys; k++) {
      const y = k * COURSE - grid;
      if (y > o.foot + COURSE / 2 - 1e-6 && y < ys - COURSE / 2 + 1e-6) beds.push(y);
    }
    beds.push(ys);
  }
  for (let i = 0; i + 1 < beds.length; i++) lay([[-x0, beds[i]], [-x0, beds[i + 1]]], [[-x1, beds[i]], [-x1, beds[i + 1]]]);
  const ring = archStones(w, h, o.rise, out, out + t, n, kw), half = (q: [number, number][]) => q.length / 2;
  // Up the left side from the springing, the keystone, and down the right side to the springing.
  for (const st of ring.filter((q) => q.place > 0 && q.pts[0][0] < 0).sort((a, b) => b.place - a.place)) {
    const m = half(st.pts);
    lay(st.pts.slice(m).reverse(), st.pts.slice(0, m));
  }
  const key = ring.find((q) => q.place === 0)!, km = half(key.pts);
  lay(key.pts.slice(0, km).reverse(), key.pts.slice(km));
  for (const st of ring.filter((q) => q.place > 0 && q.pts[0][0] > 0).sort((a, b) => a.place - b.place)) {
    const m = half(st.pts);
    lay(st.pts.slice(0, m).reverse(), st.pts.slice(m));
  }
  for (let i = beds.length - 1; i > 0; i--) lay([[x0, beds[i]], [x0, beds[i - 1]]], [[x1, beds[i]], [x1, beds[i - 1]]]);
  return stones;
}

/**
 * The dressed ring round a pointed arch (`w` wide, apex `h` above the sill, sill at y0, centred on x)
 * on a face at z (facing +Z), in the castle's dressed stone: voussoirs `t` wide standing `p` proud of
 * the face, `n` to each side, cut on radial joints and closing on a keystone, `out` beyond the opening's
 * edge, running `dep` back into the reveal; with `jamb` it carries on down both jambs to the sill, laid
 * on the walling's courses (see dressedArch).
 */
export function archRing(k: ModelKit, g: THREE.Object3D, x: number, y0: number, z: number, w: number, h: number, opt: { n?: number; t?: number; p?: number; dep?: number; out?: number; rise?: number; jamb?: boolean } = {}) {
  const { n = 5, t = 0.26, p = 0.14, dep = 0.06, out = 0 } = opt;
  for (const st of dressedArch({ w, h, rise: opt.rise, t, p, dep, out, n, kw: t * 1.3, foot: opt.jamb ? 0 : undefined, grid: y0, seed: Math.floor(hash01(x, y0, z) * 97) })) k.mesh(g, st.geo, DRESS, [x, y0, z]);
}

/**
 * The dressed surround of a pointed doorway `w` wide, its apex `h` over the sill at y = 0, centred on
 * x = 0 in a face at z = 0 (facing +Z): one ring of the castle's dressed stone `t` wide round the arch
 * and down both jambs to `foot` (see dressedArch), flush in one plane `p` proud of the face and `dep`
 * deep into the reveal. Returns the stones (each a geometry with the height of its foot), so a caller
 * that splits its walls by height can place each stone in its own band.
 */
export function archDressing(w: number, h: number, rise: number, opt: { foot: number; t?: number; p?: number; dep?: number; inset?: number; grid?: number }) {
  // (`inset`: the surround's inner face stands that far inside the opening, so it never lies in one
  // plane with the end of a wall cut to the opening behind it.)
  const { foot, t = 0.48, p = 0.08, dep = 0.3, inset = 0, grid = 0 } = opt;
  const { c, R } = pointedArch(w, h, 2, rise);
  // Voussoirs about 0.42 along the ring's middle, a keystone a little broader.
  const arcLen = (R + t / 2) * Math.atan2(Math.sqrt(Math.max(0, (R + t / 2) ** 2 - c * c)), c);
  const n = Math.max(2, Math.round((arcLen - 0.25) / 0.42));
  return dressedArch({ w, h, rise, t, p, dep, out: -inset, n, kw: 0.46, foot, grid, seed: Math.floor(hash01(w, h, t) * 97) });
}

/** The height of a pointed doorway's outline at `x` across it (see pointedLeaf). */
export function archHeight(W: number, h: number, rise: number, x: number) {
  const { arc, ys } = pointedArch(W, h, 24, rise), ax = Math.abs(x);
  if (ax >= W / 2) return ys;
  for (let i = 0; i < arc.length - 1; i++) if (ax <= arc[i][0] && ax >= arc[i + 1][0]) {
    const t = (arc[i][0] - ax) / (arc[i][0] - arc[i + 1][0] || 1);
    return arc[i][1] + (arc[i + 1][1] - arc[i][1]) * t;
  }
  return h;
}

/**
 * The pointed arch `d` inside a pointed opening `W` wide with its apex `h` up and its arch rising
 * `rise` (the same centres, each arc `d` shorter): the outline of leaves hung in the opening with a
 * gap `d` round them to the stone.
 */
export function archInset(W: number, h: number, rise: number, d: number) {
  const { c, R, ys } = pointedArch(W, h, 2, rise), r2 = Math.sqrt(Math.max(0, (R - d) ** 2 - c * c));
  return { w: W - 2 * d, h: ys + r2, rise: r2 };
}
