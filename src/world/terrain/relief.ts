import * as THREE from 'three';
import { hash01 } from '../../render/blocks';
import { CAVE_TERRACE } from '../../render/surface';
import type { Bedding } from './bedding';
import { FLOOR_CAP, sstep, type Grid } from './grid';
import type { Heights } from './heightfield';
import { cliffShadesOf, type Tally } from './paint';
import { SKIRT_DEPTH, type Skirt } from './skirt';
import type { Weathering } from './weathering';

const cliffC = new THREE.Color(), c2 = new THREE.Color();

/**
 * Relief rock (cave walls, cliffs, rims), rebuilt at twice the grid's resolution from the raw
 * heights and cut into true beds: every triangle of the fine grid is sliced by the bedding planes,
 * each band between two planes lies on its floor plane, and a sheer face stands along every cut
 * from the bed below up to it. So whichever way a wall faces it is built of flat-topped beds with
 * steep faces and crisp lips, never a smooth slope. Cave walls (wallRise) keep evenly spaced level
 * terraces, read as one layered mass climbing into the dark. Outdoor cliffs are cut on the natural
 * bedding (`bedding`: tall beds and thin ones, dipping and wandering) and then weathered: the faces
 * are pushed back into the rock by different amounts along the cliff and up it (`warp`), so they
 * stand out as buttresses and fall back into bays, lean out into overhangs and back under ledges.
 * Each bed takes its own tone. A cell lying wholly on one ledge is a single quad. Edges shared with
 * the floor mesh stay exactly on it (no cracks). `caveCells` lists the relief cells as x, z pairs;
 * `skirt` (on a floating island) takes the skirt along the relief's edge.
 */
export function buildRelief(g: Grid, t: Tally, hs: Heights, beds: Bedding, wx: Weathering, skirt: Skirt | null, caveCells: number[]) {
  const { theme, vi, noise, gridAt } = g;
  const { col, splat, fullRelief } = t;
  const { base, hgt, raw } = hs;
  const { warp, topNear } = wx;
  const cliffShades = cliffShadesOf(theme);
  const S = 2, band = [1.16, 0.82, 1.04, 0.88], tones = [1.07, 0.93, 1.0, 0.96, 1.04, 0.9, 1.02];
  const natural = !theme.wallRise;
  const P: number[] = [], C: number[] = [], A: number[] = [], N: number[] = [];
  const src = (k: number) => base[k] + (fullRelief(k) ? raw[k] : hgt[k]);
  // r: absolute height; f: the ground level under the point; s: the height in stratum space.
  type V = { x: number; z: number; r: number; f: number; s: number; c: number[]; a: number[] };
  const sOf = (r: number, x: number, z: number) => (natural ? beds.q(r, x, z) : r);
  const level = (k: number) => (natural ? beds.L[k] : k * CAVE_TERRACE);
  const indexOf = (s: number) => (natural ? beds.index(s) : Math.max(0, Math.floor(s / CAVE_TERRACE)));
  const groundOf = (v: V) => (natural ? beds.groundIndex(v.x, v.z, v.f) : Math.floor(v.f / CAVE_TERRACE + 1e-6));
  const sample = (x: number, z: number, u: number, v: number): V => {
    const k00 = vi(x, z), k10 = vi(x + 1, z), k01 = vi(x, z + 1), k11 = vi(x + 1, z + 1);
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    const bil = (arr: ArrayLike<number>, n: number, j: number) => arr[k00 * n + j] * w00 + arr[k10 * n + j] * w10 + arr[k01 * n + j] * w01 + arr[k11 * n + j] * w11;
    const r = src(k00) * w00 + src(k10) * w10 + src(k01) * w01 + src(k11) * w11;
    const f = base[k00] * w00 + base[k10] * w10 + base[k01] * w01 + base[k11] * w11;
    // (No nudge off the grid: the cut lines follow the noise in the heights, never the rows.)
    return { x: x + u, z: z + v, r, f, s: sOf(r, x + u, z + v), c: [bil(col, 3, 0), bil(col, 3, 1), bil(col, 3, 2)], a: [bil(splat, 4, 0), bil(splat, 4, 1), bil(splat, 4, 2), bil(splat, 4, 3)] };
  };
  const lerpV = (p: V, q: V, t: number): V => ({
    x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, r: p.r + (q.r - p.r) * t, f: p.f + (q.f - p.f) * t, s: p.s + (q.s - p.s) * t,
    c: p.c.map((v, j) => v + (q.c[j] - v) * t),
    a: p.a.map((v, j) => v + (q.a[j] - v) * t),
  });
  /** Clip a convex polygon to s >= lv (keep = 1) or s < lv (keep = -1). */
  const clip = (poly: V[], lv: number, keep: 1 | -1) => {
    const out: V[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const pin = keep > 0 ? p.s >= lv : p.s < lv, qin = keep > 0 ? q.s >= lv : q.s < lv;
      if (pin) out.push(p);
      if (pin !== qin) out.push(lerpV(p, q, (lv - p.s) / (q.s - p.s)));
    }
    return out;
  };
  /** Tone of bed `k` at a point (cave terraces alternate light and dark; outdoor beds each take their own). */
  const tone = (k: number, x: number, z: number) => {
    if (k <= 0) return 1;
    if (natural) return tones[Math.floor(hash01(k * 7.13, 3.7) * tones.length)] * (0.95 + noise(x * 0.3 + 60, z * 0.3) * 0.1);
    const b = k + Math.floor((noise(x * 0.05 + 3, z * 0.05) - 0.5) * 0.6 + 0.5);
    return band[((b % 4) + 4) % 4] * (0.95 + noise(x * 0.3 + 60, z * 0.3) * 0.1);
  };
  const ea = new THREE.Vector3(), eb = new THREE.Vector3(), fn = new THREE.Vector3();
  /** One triangle, wound to face `want`; its normal its own face's, or `nrm` (a weathered lip's: see slice). */
  const tri = (p: number[][], c: number[][], a: number[][], want: number[], nrm?: number[]) => {
    ea.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    eb.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    fn.crossVectors(ea, eb);
    const len = fn.length();
    if (len < 1e-7) return;
    let order = [0, 1, 2];
    if (fn.x * want[0] + fn.y * want[1] + fn.z * want[2] < 0) {
      order = [0, 2, 1];
      fn.negate();
    }
    fn.divideScalar(len);
    if (nrm) fn.set(nrm[0], nrm[1], nrm[2]);
    for (const o of order) {
      P.push(p[o][0], p[o][1], p[o][2]);
      C.push(c[o][0], c[o][1], c[o][2]);
      A.push(a[o][0], a[o][1], a[o][2], a[o][3]);
      N.push(fn.x, fn.y, fn.z);
    }
  };
  /**
   * Height of bed k at a point: the beds at or below the local ground level hug the ground (at
   * most FLOOR_CAP above it, so edges shared with the floor mesh meet it exactly); every bed above
   * lies on its plane.
   */
  const bandY = (k: number, v: V) => (natural ? beds.bandY(k, v.x, v.z, v.f, v.r) : k <= groundOf(v) ? v.f + Math.min(v.r - v.f, FLOOR_CAP) : k * CAVE_TERRACE);
  /**
   * A ledge partway down a face (well below the rock's top near it) is bare rock, not the turf of
   * the crown: its colour and ground weights go over to the cliff's own, so grass grows only on the
   * top and moss takes the lower ledges in patches (the shader's), never a green stripe per bed.
   */
  const ledgeT = (v: V, y: number) => (natural && theme.mesaTop !== undefined ? sstep(1.2, 3.0, gridAt(topNear, v.x, v.z) - y) : 0);
  const ledgeCol = (c3: number[], v: V, y: number) => {
    const t = ledgeT(v, y);
    if (t <= 0) return c3;
    const rc = cliffC.setHex(cliffShades[0]).lerp(c2.setHex(cliffShades[1]), noise(v.x * 0.21 + 50, v.z * 0.21));
    return [c3[0] + (rc.r - c3[0]) * t, c3[1] + (rc.g - c3[1]) * t, c3[2] + (rc.b - c3[2]) * t];
  };
  const ledgeA = (v: V, y: number) => {
    const t = ledgeT(v, y);
    if (t <= 0) return v.a;
    const tot = v.a[0] + v.a[1] + v.a[2] + v.a[3];
    return [v.a[0] * (1 - t), v.a[1] * (1 - t), v.a[2] * (1 - t), v.a[3] * (1 - t) + tot * t];
  };
  const shadeOf = (k: number, v: V, lift = 1) => {
    const f = tone(k, v.x, v.z);
    return [v.c[0] * f * (1 + 0.03 * lift), v.c[1] * f, v.c[2] * f * (1 - 0.04 * lift)];
  };
  const slice = (t: V[]) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of t) {
      lo = Math.min(lo, v.s);
      hi = Math.max(hi, v.s);
    }
    const k0 = indexOf(lo), k1 = indexOf(hi);
    // Downhill (toward lower r) in the triangle's plane, for the faces' facing.
    const ab = [t[1].x - t[0].x, t[1].z - t[0].z, t[1].r - t[0].r], ac = [t[2].x - t[0].x, t[2].z - t[0].z, t[2].r - t[0].r];
    const det = ab[0] * ac[1] - ab[1] * ac[0] || 1e-9;
    const gx = (ab[2] * ac[1] - ac[2] * ab[1]) / det, gz = (ac[2] * ab[0] - ab[2] * ac[0]) / det;
    const down = [-gx, 0, -gz];
    // How wide each bed's ledge runs across this triangle: its thickness over how fast the strata
    // climb across it. A ledge only a hand or two deep partway down a face is no shelf for moss:
    // it is the bed's weathered lip, rounded off toward the drop, so it never shows as a thin bright
    // line of moss drawn along the face (its normal leans out, so it takes the light as a lip).
    const sb = [t[1].s - t[0].s, t[2].s - t[0].s], gsx = (sb[0] * ac[1] - sb[1] * ab[1]) / det, gsz = (sb[1] * ab[0] - sb[0] * ac[0]) / det, gs = Math.hypot(gsx, gsz);
    const dl = Math.hypot(gx, gz), lipN = dl > 1e-6 ? [(-gx / dl) * 0.88, 0.47, (-gz / dl) * 0.88] : [0, 1, 0];
    const lip = (k: number, q: V[]) => natural && k < k1 && gs > 1e-6 && (level(k + 1) - level(k)) / gs < 0.7 && q.every((v) => gridAt(topNear, v.x, v.z) - bandY(k, v) > 0.6);
    for (let k = k0; k <= k1; k++) {
      // The band of this triangle between plane k and k + 1, lying on plane k.
      let poly = t;
      if (k > k0) poly = clip(poly, level(k), 1);
      if (k < k1) poly = clip(poly, level(k + 1), -1);
      if (poly.length >= 3) {
        for (let i = 1; i < poly.length - 1; i++) {
          const q = [poly[0], poly[i], poly[i + 1]];
          tri(q.map((v) => [v.x, bandY(k, v), v.z]), q.map((v) => ledgeCol(shadeOf(k, v, k > 0 ? 1 : 0), v, bandY(k, v))), q.map((v) => ledgeA(v, bandY(k, v))), [0, 1, 0], lip(k, q) ? lipN : undefined);
        }
        // Where this band's edge runs along the island's edge, the skirt drops from it.
        if (skirt) for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length];
          const alongZ = p.x === q.x && Number.isInteger(p.x), alongX = p.z === q.z && Number.isInteger(p.z);
          if (!alongZ && !alongX) continue;
          const side = alongZ ? skirt.voidSide(true, p.x, (p.z + q.z) / 2) : skirt.voidSide(false, p.z, (p.x + q.x) / 2);
          if (!side) continue;
          const bottom = Math.min(p.f, q.f) - SKIRT_DEPTH;
          skirt.quad(p.x, bandY(k, p), p.z, q.x, bandY(k, q), q.z, bottom, alongZ ? side : 0, alongX ? side : 0, shadeOf(k, p), shadeOf(k, q));
        }
      }
      // The sheer face up to this bed, along the cut where s crosses its plane.
      if (k > k0) {
        const lv = level(k), cut: V[] = [];
        for (let i = 0; i < 3; i++) {
          const p = t[i], q = t[(i + 1) % 3];
          if ((p.s >= lv) !== (q.s >= lv)) cut.push(lerpV(p, q, (lv - p.s) / (q.s - p.s)));
        }
        if (cut.length !== 2) continue;
        const [u, v] = cut;
        const pu0 = [u.x, bandY(k - 1, u), u.z], pv0 = [v.x, bandY(k - 1, v), v.z], pu1 = [u.x, bandY(k, u), u.z], pv1 = [v.x, bandY(k, v), v.z];
        tri([pu0, pv0, pv1], [shadeOf(k, u), shadeOf(k, v), shadeOf(k, v)], [u.a, v.a, v.a], down);
        tri([pu0, pv1, pu1], [shadeOf(k, u), shadeOf(k, v), shadeOf(k, u)], [u.a, v.a, u.a], down);
      }
    }
  };
  for (let i = 0; i < caveCells.length; i += 2) {
    const x = caveCells[i], z = caveCells[i + 1];
    const grid: V[] = [];
    for (let jv = 0; jv <= S; jv++) for (let ju = 0; ju <= S; ju++) grid.push(sample(x, z, ju / S, jv / S));
    const at2 = (ju: number, jv: number) => grid[jv * (S + 1) + ju];
    // A cell lying wholly on one ledge above its ground (the broad tops of the high rock) is one quad.
    const lv0 = indexOf(grid[0].s);
    if (grid.every((q) => indexOf(q.s) === lv0 && lv0 > groundOf(q))) {
      const q00 = at2(0, 0), q10 = at2(S, 0), q01 = at2(0, S), q11 = at2(S, S);
      for (const q of [[q00, q01, q11], [q00, q11, q10]]) tri(q.map((v) => [v.x, bandY(lv0, v), v.z]), q.map((v) => ledgeCol(shadeOf(lv0, v), v, bandY(lv0, v))), q.map((v) => ledgeA(v, bandY(lv0, v))), [0, 1, 0]);
      if (skirt) for (const [p, q] of [[q00, q01], [q10, q11], [q00, q10], [q01, q11]]) {
        const alongZ = p.x === q.x;
        const side = alongZ ? skirt.voidSide(true, p.x, (p.z + q.z) / 2) : skirt.voidSide(false, p.z, (p.x + q.x) / 2);
        if (side) skirt.quad(p.x, bandY(lv0, p), p.z, q.x, bandY(lv0, q), q.z, Math.min(p.f, q.f) - SKIRT_DEPTH, alongZ ? side : 0, alongZ ? 0 : side, shadeOf(lv0, p), shadeOf(lv0, q));
      }
      continue;
    }
    for (let jv = 0; jv < S; jv++) for (let ju = 0; ju < S; ju++) {
      const q00 = at2(ju, jv), q10 = at2(ju + 1, jv), q01 = at2(ju, jv + 1), q11 = at2(ju + 1, jv + 1);
      const alt = (x * S + ju + z * S + jv) & 1;
      if (alt) {
        slice([q00, q01, q10]);
        slice([q10, q01, q11]);
      } else {
        slice([q00, q01, q11]);
        slice([q00, q11, q10]);
      }
    }
  }
  // Weather the outdoor rock: every vertex moves by the same smooth field, so shared edges stay
  // shut; then each face takes its new flat normal (same winding, so it still faces out).
  if (natural) {
    for (let i = 0; i < P.length; i += 3) {
      const [wx2, wz] = warp(P[i], P[i + 1], P[i + 2]);
      P[i] = wx2;
      P[i + 2] = wz;
    }
    for (let i = 0; i < P.length; i += 9) {
      ea.set(P[i + 3] - P[i], P[i + 4] - P[i + 1], P[i + 5] - P[i + 2]);
      eb.set(P[i + 6] - P[i], P[i + 7] - P[i + 1], P[i + 8] - P[i + 2]);
      fn.crossVectors(ea, eb);
      const len = fn.length();
      if (len < 1e-9) continue;
      fn.divideScalar(len);
      for (let j = 0; j < 9; j += 3) {
        N[i + j] = fn.x;
        N[i + j + 1] = fn.y;
        N[i + j + 2] = fn.z;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aSplat', new THREE.Float32BufferAttribute(A, 4));
  return geo;
}
