import * as THREE from 'three';
import { clamp } from '../../core/rng';
import { packAttributes } from '../../render/patch';
import { breakLength, brokenEnd } from './breaks';
import { crownDepth } from './crown';
import { along, arcAtHeight, lengthOf, normalOn, pointOn, sidesAt, tangentOn, type Joint, type Limb, type Skeleton } from './skeleton';
import { buttress, FOOT_YS, footLayout, footRadius, footTop } from './trunkFoot';

/** A limb's bark: whole tiles round it, the offset round it (tiles), and its coordinate along it (bark metres: `v` at arc `s`, `k` per metre). */
interface Bark {
  tiles: number;
  u: number;
  v: number;
  s: number;
  k: number;
}

/**
 * The tree's wood as one connected mesh (see treeGrowth.ts). Attributes besides position and
 * normal: `color` (a painted shade: the damp foot, the crotch of every fork and the shaded inner
 * crown darker), and where the bark lies for the bark shader (foliage.ts). Round each limb the
 * bark is wrapped in whole tiles: `aBarkA` = the cosine and sine of the point's angle round its
 * limb, the limb's tiles and its offset round (in tiles). Over a collar the branch's own wrap runs
 * right down to the rim of its hole, turned there so that the rim keeps the parent's bark (but in the crotch):
 * `aBarkB` = the same angle and tiles in the branch's wrap, and how far the rim point's offset is
 * turned from the branch's (0 on the branch's first ring; elsewhere `aBarkB` is a copy of
 * `aBarkA`). `aWood` = the wind's weight, the limb's radius, the bark's coordinate along the limb
 * (bark metres) and 1 on a branch's first ring, whose collar triangles (each drawn last from that
 * ring) take `aBarkB`. A dead tree's wood (its limbs snapped: deadwood.ts) also carries, for where
 * its bark has fallen away (foliage.ts), `aDead` = its limb's direction there and how far back
 * from the limb's break it lies, in the break's own lengths (0 at the break's tip, 1 at its foot,
 * far more on a limb that never snapped).
 */
export function woodGeometry(sk: Skeleton): THREE.BufferGeometry {
  return makeWoodGeometry(sk, false);
}

/** Fixed cylindrical charts for exposed wood: the collar blends parent and branch without turning either chart. */
export function branchAlignedWoodGeometry(sk: Skeleton): THREE.BufferGeometry {
  return unwrapBranchCharts(makeWoodGeometry(sk, true), sk.species.bark);
}

/**
 * Linear cylindrical UVs, cut at a seam as a modeller unwraps a branch. Interpolating the cosine
 * and sine before atan can pinch through zero across a broad fork triangle, twisting its grain.
 * Unwrap each face before interpolation and duplicate only vertices whose UV charts need a cut;
 * every position, triangle and smooth normal stays exactly as grown.
 */
function unwrapBranchCharts(source: THREE.BufferGeometry, barkWidth: number) {
  const A = source.getAttribute('aBarkA'), B = source.getAttribute('aBarkB'), parent = source.getAttribute('aParentBark');
  const wood = source.getAttribute('aWood'), branchV = source.getAttribute('aBranchV'), parentV = source.getAttribute('aParentV');
  const rawCharts = new Set(['aBranchV', 'aParentBark', 'aParentV']);
  const arrays = Object.fromEntries(Object.keys(source.attributes).filter((name) => !rawCharts.has(name)).map((name) => [name, [] as number[]]));
  const uv: number[] = [], indices: number[] = [], unique = new Map<string, number>(), tau = Math.PI * 2;
  /** Cut the circle through the largest gap between this face's corners, away from the face. */
  const angles = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, face: number[]) => {
    const a = face.map((i) => (Math.atan2(attr.getY(i), attr.getX(i)) + tau) % tau);
    const ordered = [...a].sort((x, y) => x - y);
    const gaps = ordered.map((x, i) => (ordered[(i + 1) % 3] + (i === 2 ? tau : 0)) - x);
    const cut = ordered[(gaps.indexOf(Math.max(...gaps)) + 1) % 3];
    return a.map((x) => x < cut - 1e-9 ? x + tau : x);
  };
  const idx = source.index!.array;
  for (let t = 0; t < idx.length; t += 3) {
    const face = [idx[t], idx[t + 1], idx[t + 2]], collar = wood.getW(face[2]) === 1;
    // A break's face is a planar chart, separate from the cylindrical side, avoiding a UV pole
    // at the heartwood point. Splinter sides keep the branch's longitudinal chart.
    const cap = face.some((i) => wood.getY(i) <= 0.00101);
    const capV = cap ? wood.getZ(face.find((i) => wood.getY(i) <= 0.00101)!) : 0;
    const chart = collar ? B : A, primary = angles(chart, face), secondary = collar ? angles(parent, face) : primary;
    face.forEach((vi, k) => {
      const u = cap ? A.getX(vi) * wood.getY(vi) / barkWidth + A.getW(vi)
        : primary[k] / tau * chart.getZ(vi) + (collar ? A.getW(face[2]) : A.getW(vi));
      const v = cap ? A.getY(vi) * wood.getY(vi) + capV : collar ? branchV.getX(vi) : wood.getZ(vi);
      const pu = collar ? secondary[k] / tau * parent.getZ(vi) + parent.getW(vi) : u;
      const pv = collar ? parentV.getX(vi) : v;
      const key = `${vi}:${u},${v},${pu},${pv}`;
      let out = unique.get(key);
      if (out === undefined) {
        out = unique.size;
        unique.set(key, out);
        for (const [name, data] of Object.entries(arrays)) {
          const attr = source.getAttribute(name);
          for (let c = 0; c < attr.itemSize; c++) data.push(attr.getComponent(vi, c));
        }
        uv.push(u, v, pu, pv);
      }
      indices.push(out);
    });
  }
  const g = new THREE.BufferGeometry();
  for (const [name, data] of Object.entries(arrays)) g.setAttribute(name, new THREE.Float32BufferAttribute(data, source.getAttribute(name).itemSize));
  g.setAttribute('aBarkUV', new THREE.Float32BufferAttribute(uv, 4));
  packAttributes(g, ['aWood', 'aBarkA', 'aBarkB', 'aDead', 'aBarkUV']);
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

function makeWoodGeometry(sk: Skeleton, branchAligned: boolean): THREE.BufferGeometry {
  const { limbs, crown } = sk;
  const pos: number[] = [], col: number[] = [], wood: number[] = [], ba: number[] = [], bb: number[] = [], idx: number[] = [];
  const dead = limbs.some((L) => L.broken !== undefined), dd: number[] = [], G = new THREE.Vector3();
  // The exposed grain on an ash keeps each limb's cylindrical chart fixed across its collar.
  // aBranchV carries that chart's length at the parent's rim; the material blends the two charts.
  const branchV: number[] = [], parentBark: number[] = [], parentV: number[] = [];
  const kids: number[][] = limbs.map(() => []);
  limbs.forEach((L, i) => L.parent >= 0 && kids[L.parent].push(i));
  /** Each limb's rings (vertex indices) and bark, and each branch's hole rim in its parent with the rim point its bark lines up on. */
  const rings: number[][][] = [];
  const barks: Bark[] = [];
  const rims: number[][] = [];
  const rimFoot: number[] = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), V = new THREE.Vector3();
  const vertex = (p: THREE.Vector3, a: number, bark: Bark, r: number, s: number, shade: number, w: number, L: Limb) => {
    pos.push(p.x, p.y, p.z);
    if (dead) {
      const len = lengthOf(L);
      tangentOn(L, s, G);
      dd.push(G.x, G.y, G.z, L.broken !== undefined ? (len - s) / breakLength(L, len) : 99);
    }
    ba.push(Math.cos(a), Math.sin(a), bark.tiles, bark.u);
    bb.push(Math.cos(a), Math.sin(a), bark.tiles, bark.u);
    // The damp foot, and the inner crown in the shade of the leaves.
    const foot = 0.68 + 0.32 * THREE.MathUtils.smoothstep(p.y, -0.3, 1.1);
    const inner = 1 - 0.38 * (1 - THREE.MathUtils.smoothstep(crownDepth(crown, p), 0.35, 0.9)) * THREE.MathUtils.smoothstep(p.y, crown.centre.y - crown.down, crown.centre.y);
    const c = foot * inner * shade;
    col.push(c, c, c);
    const v = bark.v + (s - bark.s) * bark.k;
    wood.push(w, r, v, 0);
    if (branchAligned) {
      branchV.push(v);
      parentBark.push(Math.cos(a), Math.sin(a), bark.tiles, bark.u);
      parentV.push(v);
    }
    return pos.length / 3 - 1;
  };
  /** A vertex's place round its limb's bark (tiles). */
  const uOf = (vi: number) => (Math.atan2(ba[vi * 4 + 1], ba[vi * 4]) / (Math.PI * 2)) * ba[vi * 4 + 2] + ba[vi * 4 + 3];
  const flute = sk.species.flute ?? 1, rootAngles = sk.roots.map((r) => r.a);
  /**
   * The trunk's foot, from deep under the ground up to its tube's first ring: rings of more sides
   * than the tube's (footLayout), each the trunk's flared, buttressed girth with every root's ridge
   * standing out of it, the last stitched to the tube.
   */
  const trunkFoot = (L: Limb, bark: Bark, start: number) => {
    const first = rings[0][0], top = pointOn(L, start, P).y;
    const foot = FOOT_YS.filter((y) => y < top - 0.1).map((y) => {
      const s = arcAtHeight(L, y), r = along(L.radius, L, s), w = along(L.sway, L, s);
      pointOn(L, s, P);
      tangentOn(L, s, T);
      normalOn(L, s, T, N);
      B.crossVectors(T, N);
      const lay = footLayout(sk.roots, Math.round(first.length * 2.6), P.y, r);
      return lay.angles.map((a, j) => {
        const rr = footRadius(sk.roots, rootAngles, a, P.y, r, flute);
        D.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        return vertex(V.copy(P).addScaledVector(D, rr), lay.bark[j], bark, rr, s, 1, w, L);
      });
    });
    // (A trunk whose tube starts at its very foot, a limb leaving it that low, has no foot rings.)
    if (!foot.length) return;
    const n = foot[0].length;
    for (let k = 0; k < foot.length - 1; k++) {
      for (let j = 0; j < n; j++) {
        const a = foot[k][j], b = foot[k][(j + 1) % n], c = foot[k + 1][(j + 1) % n], d = foot[k + 1][j];
        idx.push(a, b, c, a, c, d);
      }
    }
    tangentOn(L, start, T);
    stitch(foot[foot.length - 1], first, pos, idx, T, normalOn(L, start, T, N), pointOn(L, start, P));
  };

  limbs.forEach((L, li) => {
    const len = lengthOf(L);
    const holes = kids[li].map((k) => limbs[k].joint!);
    // (The trunk's tube starts over its foot, built on to it below: trunkFoot.)
    const start = L.joint ? L.joint.ring : L.order === 0 ? footTop(L, holes) : 0;
    const tipLen = L.broken !== undefined ? breakLength(L, len) : Math.min(len * 0.2, Math.max(0.06, L.radius[L.radius.length - 1] * 2.5));
    const st = stations(L, holes, start, len - tipLen);
    const sides = st.map((s) => sidesAt(L, s));
    // Bark tiles round the limb: as many as fit its girth at its foot (the trunk's at breast height),
    // each as long up it as it is wide there, so a thin limb wears the trunk's bark in small.
    const girth = Math.PI * 2 * (L.order === 0 ? along(L.radius, L, arcAtHeight(L, 1.3)) : L.radius[0]);
    const tiles = Math.max(1, Math.round(girth / sk.species.bark));
    const bark: Bark = { tiles, u: 0, v: 0, s: start, k: clamp((sk.species.bark * tiles) / girth, 0.75, 4) };
    if (L.parent >= 0) {
      // The collar: the branch's wrap carried down to its hole's rim. Its furrows run on from the
      // parent's at the rim's foot, and each rim point keeps the parent's bark, its offset unwound
      // round the rim both ways from the foot (the two meet in the crotch).
      const pb = barks[L.parent], j = L.joint!, rim = rims[li], n = rim.length, i0 = rimFoot[li];
      bark.v = pb.v + (j.s + j.h * 0.5 - pb.s) * pb.k;
      pointOn(L, start, P);
      tangentOn(L, start, T);
      normalOn(L, start, T, N);
      B.crossVectors(T, N);
      const th = rim.map((vi) => {
        V.set(pos[vi * 3] - P.x, pos[vi * 3 + 1] - P.y, pos[vi * 3 + 2] - P.z);
        return Math.atan2(V.dot(B), V.dot(N));
      });
      const d = rim.map((vi, i) => uOf(vi) - (th[i] / (Math.PI * 2)) * tiles);
      const off = new Array<number>(n);
      off[i0] = d[i0];
      const half = Math.floor(n / 2);
      for (let t = 1; t < n; t++) {
        const i = t <= half ? (i0 + t) % n : (i0 - (t - half) + n) % n;
        const prev = t <= half ? (i0 + t - 1) % n : (i0 - (t - half) + 1 + n) % n;
        off[i] = d[i] - Math.round(d[i] - off[prev]);
      }
      // Where the two meet, in the crotch, the branch's wrap has gone a whole turn of tiles further
      // than the parent's bark: over the crotch's half of the rim the branch keeps its own wrap
      // (meeting the parent's bark in the crease of the fork, as a branch's bark ridge does), not
      // packing that turn into one sliver of bark.
      const iF = (i0 + half) % n, iB = (i0 + half + 1) % n, m = Math.max(1, Math.floor(half / 2));
      const turn = Math.round(off[iB] - off[iF] - (d[iB] - d[iF] - Math.round(d[iB] - d[iF])));
      for (let t = 0; t < 2 * m; t++) off[(iF - m + 1 + t + n) % n] += (turn * (t + 0.5)) / (2 * m) - (t >= m ? turn : 0);
      rim.forEach((vi, i) => {
        bb.splice(vi * 4, 4, Math.cos(th[i]), Math.sin(th[i]), tiles, branchAligned ? 0 : off[i] - d[i0]);
        if (branchAligned) {
          V.set(pos[vi * 3] - P.x, pos[vi * 3 + 1] - P.y, pos[vi * 3 + 2] - P.z);
          branchV[vi] = bark.v + V.dot(T) * bark.k;
        }
      });
      bark.u = d[i0];
    }
    barks[li] = bark;
    // Rings.
    rings[li] = st.map((s, k) => {
      const S = sides[k];
      pointOn(L, s, P);
      tangentOn(L, s, T);
      normalOn(L, s, T, N);
      B.crossVectors(T, N);
      const r = along(L.radius, L, s), w = along(L.sway, L, s);
      return Array.from({ length: S }, (_, j) => {
        const a = (j / S) * Math.PI * 2;
        const rr = r * (L.order === 0 ? buttress(rootAngles, a, P.y, flute) : 1);
        D.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        return vertex(V.copy(P).addScaledVector(D, rr), a, bark, rr, s, 1, w, L);
      });
    });
    const ring = rings[li];
    // Holes: which quads each branch cuts out, and the rim it is stitched to.
    const nearest = (s: number) => st.reduce((bi, x, i) => (Math.abs(x - s) < Math.abs(st[bi] - s) ? i : bi), 0);
    const cut = kids[li].map((k) => {
      const j = limbs[k].joint!;
      return { k, j, k0: nearest(j.s - j.h), k1: Math.max(nearest(j.s - j.h) + 1, nearest(j.s + j.h)), j0: j.side - j.b, w: 2 * j.b, S: sidesAt(L, j.s) };
    });
    const inHole = (k: number, j: number) => cut.some((c) => k >= c.k0 && k < c.k1 && (((j - c.j0) % c.S) + c.S) % c.S < c.w);
    for (let k = 0; k < st.length - 1; k++) {
      const S = sides[k];
      if (sides[k + 1] !== S) {
        // Where the limb drops to fewer sides, the two rings are stitched into one band.
        tangentOn(L, st[k + 1], T);
        stitch(ring[k], ring[k + 1], pos, idx, T, normalOn(L, st[k + 1], T, N), pointOn(L, st[k + 1], P));
        continue;
      }
      for (let j = 0; j < S; j++) {
        if (inHole(k, j)) continue;
        // (Each triangle is drawn last from the upper ring, never from a branch's first: see aWood.)
        const a = ring[k][j], b = ring[k][(j + 1) % S], c = ring[k + 1][(j + 1) % S], d = ring[k + 1][j];
        idx.push(a, b, c, a, c, d);
      }
    }
    for (const c of cut) {
      const at = (k: number, j: number) => ring[k][(((c.j0 + j) % c.S) + c.S) % c.S];
      const rim: number[] = [];
      for (let t = 0; t <= c.w; t++) rim.push(at(c.k0, t));
      for (let k = c.k0 + 1; k < c.k1; k++) rim.push(at(k, c.w));
      for (let t = c.w; t >= 0; t--) rim.push(at(c.k1, t));
      for (let k = c.k1 - 1; k > c.k0; k--) rim.push(at(k, 0));
      rims[c.k] = rim;
      // The branch's bark lines up on the middle of the rim's edge its parent's bark runs in from:
      // the lower edge under a branch, the upper edge over a root (the trunk runs down into it).
      const C = limbs[c.k], up = tangentOn(C, C.joint!.ring, D).dot(tangentOn(L, c.j.s, T)) >= 0;
      rimFoot[c.k] = up ? c.j.b : 2 * c.w + c.k1 - c.k0 - c.j.b;
      // The crotch: the rim sits in the shadow of the fork.
      for (const vi of rim) for (let e = 0; e < 3; e++) col[vi * 3 + e] *= 0.84;
    }
    // The tip closes on one point (a snapped limb's in a ragged break).
    const last = ring[ring.length - 1];
    if (L.broken !== undefined) brokenEnd(L, last, len - tipLen, len, (p, a, r, s) => vertex(p, a, bark, r, s, 1, along(L.sway, L, s), L), idx);
    else {
      const tip = vertex(pointOn(L, len, P), 0, bark, 0.001, len, 1, along(L.sway, L, len), L);
      for (let j = 0; j < last.length; j++) idx.push(last[j], last[(j + 1) % last.length], tip);
    }
    if (L.order === 0) trunkFoot(L, bark, start);
    // The collar: this branch's first ring stitched to its hole's rim in the parent.
    if (L.parent >= 0) {
      stitch(rims[li], ring[0], pos, idx, tangentOn(L, start, T), normalOn(L, start, T, N), pointOn(L, start, P));
      for (const vi of ring[0]) {
        wood[vi * 4 + 3] = 1;
        bb[vi * 4 + 3] = 0;
      }
      if (branchAligned) {
        const parent = limbs[L.parent], pb = barks[L.parent], j = L.joint!;
        const pc = pointOn(parent, j.s), pt = tangentOn(parent, j.s), pn = normalOn(parent, j.s, pt);
        const binormal = new THREE.Vector3().crossVectors(pt, pn);
        for (const vi of ring[0]) {
          // Extend the parent's chart onto the branch ring too: a second fixed chart, not a
          // parent-to-branch angle interpolation hidden under the texture blend.
          V.set(pos[vi * 3] - pc.x, pos[vi * 3 + 1] - pc.y, pos[vi * 3 + 2] - pc.z);
          const a = Math.atan2(V.dot(binormal), V.dot(pn));
          parentBark.splice(vi * 4, 4, Math.cos(a), Math.sin(a), pb.tiles, pb.u);
          parentV[vi] = pb.v + (j.s + V.dot(pt) - pb.s) * pb.k;
        }
      }
    }
  });

  // Only the vertices the surface uses (the bark inside each hole goes).
  const keep = new Int32Array(pos.length / 3).fill(-1);
  let used = 0;
  for (const i of idx) if (keep[i] < 0) keep[i] = used++;
  const pick = (src: number[], k: number) => {
    const a = new Float32Array(used * k);
    keep.forEach((to, i) => to >= 0 && a.set(src.slice(i * k, i * k + k), to * k));
    return new THREE.Float32BufferAttribute(a, k);
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pick(pos, 3));
  g.setAttribute('color', pick(col, 3));
  g.setAttribute('aWood', pick(wood, 4));
  g.setAttribute('aBarkA', pick(ba, 4));
  g.setAttribute('aBarkB', pick(bb, 4));
  if (dead) g.setAttribute('aDead', pick(dd, 4));
  if (branchAligned) {
    g.setAttribute('aBranchV', pick(branchV, 1));
    g.setAttribute('aParentBark', pick(parentBark, 4));
    g.setAttribute('aParentV', pick(parentV, 1));
  }
  packAttributes(g, ['aWood', 'aBarkA', 'aBarkB', 'aDead', 'aBranchV', 'aParentBark', 'aParentV']);
  g.setIndex(idx.map((i) => keep[i]));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Ring stations along a limb from `start` to `end`: spaced by the limb's girth and closer where
 * it bends, plus the two edges of every branch's hole (stations inside a hole are dropped: the
 * collar replaces that bark).
 */
function stations(L: Limb, holes: Joint[], start: number, end: number) {
  const base = [start];
  const t0 = new THREE.Vector3(), t1 = new THREE.Vector3();
  for (let s = start; ;) {
    const r = along(L.radius, L, s);
    let ds = clamp(r * 5, r < 0.08 ? 0.6 : 0.24, 0.9);
    tangentOn(L, s, t0);
    for (let k = 0; k < 3 && t0.angleTo(tangentOn(L, s + ds, t1)) > 0.4; k++) ds *= 0.65;
    s += ds;
    if (s >= end - ds * 0.35) break;
    base.push(s);
  }
  base.push(end);
  if (L.step && L.step.s > start && L.step.s < end) base.push(L.step.s);
  const inside = (x: number) => holes.some((j) => x > j.s - j.h + 1e-4 && x < j.s + j.h - 1e-4);
  const all = [...base.filter((x) => !inside(x)), ...holes.flatMap((j) => [j.s - j.h, j.s + j.h])].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of all) if (!out.length || x - out[out.length - 1] > 0.012) out.push(x);
  return out;
}

/**
 * Stitch a hole's rim (vertex indices round it) to a branch's first ring: both are walked round
 * the branch's axis in angle, one triangle at a time from whichever is behind, so rims and rings
 * of any vertex count close into one band.
 */
function stitch(rim: number[], ring: number[], pos: number[], idx: number[], t: THREE.Vector3, n: THREE.Vector3, c: THREE.Vector3) {
  const b = new THREE.Vector3().crossVectors(t, n), w = new THREE.Vector3();
  const angle = (vi: number) => {
    w.set(pos[vi * 3] - c.x, pos[vi * 3 + 1] - c.y, pos[vi * 3 + 2] - c.z);
    const a = Math.atan2(w.dot(b), w.dot(n));
    return a < 0 ? a + Math.PI * 2 : a;
  };
  let L = rim.slice();
  // Walked counter-clockwise round the branch (as its rings are), from the vertex nearest angle 0.
  const turning = L.reduce((sum, vi, i) => {
    let d = angle(L[(i + 1) % L.length]) - angle(vi);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return sum + d;
  }, 0);
  if (turning < 0) L.reverse();
  const first = L.reduce((bi, vi, i) => (angle(vi) < angle(L[bi]) ? i : bi), 0);
  L = [...L.slice(first), ...L.slice(0, first)];
  const aL = L.map(angle), aR = ring.map((_, j) => (j / ring.length) * Math.PI * 2);
  aL.push(aL[0] + Math.PI * 2);
  aR.push(Math.PI * 2);
  // (A rim that doubles back a little round a tight fork is held level rather than wrapped a full turn.)
  for (let i = 1; i < aL.length; i++) aL[i] = Math.max(aL[i], aL[i - 1]);
  let i = 0, j = 0;
  const n0 = L.length, m0 = ring.length;
  while (i < n0 || j < m0) {
    if (j >= m0 || (i < n0 && aL[i + 1] <= aR[j + 1])) {
      idx.push(L[i], L[(i + 1) % n0], ring[j % m0]);
      i++;
    } else {
      idx.push(L[i % n0], ring[(j + 1) % m0], ring[j]);
      j++;
    }
  }
}
