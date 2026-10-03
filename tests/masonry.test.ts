import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chamferBox } from '../src/render/blocks';
import { cleanBreaks, courseBand, courseSpans, fitCourses, masonGeometry } from '../src/render/masonry';
import { KERB_W, kerbStones, type KerbRun } from '../src/world/kerbStones';
import { archStones, buildProp } from '../src/world/props';

/** The stone layout of every vertex: [stone coordinate, course coordinate, mode]. */
const layout = (geo: THREE.BufferGeometry) => {
  const a = geo.getAttribute('aMason'), k = geo.getAttribute('aMasonK'), p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  return Array.from({ length: a.count }, (_, i) => ({ X: a.getX(i), C: a.getY(i), mode: k.getX(i), p: new THREE.Vector3().fromBufferAttribute(p, i), n: new THREE.Vector3().fromBufferAttribute(n, i) }));
};
const frac = (v: number) => v - Math.floor(v);

describe('masonry laid as a mason lays it', () => {
  it('fits whole courses between breaks, and every part of a schedule agrees on them', () => {
    fitCourses(0, 2.1).forEach((y, i) => expect(y).toBeCloseTo(i * 0.525));
    const breaks = cleanBreaks([0, 0.62, 0.96, 0.97, 4.88, 5.12, 9]);
    expect(breaks).toEqual([0, 0.62, 0.96, 4.88, 5.12, 9]);
    // Each band of the schedule holds whole courses: its foot and head fall on joints.
    for (let i = 0; i + 1 < breaks.length; i++) {
      const b = courseBand(breaks, (breaks[i] + breaks[i + 1]) / 2);
      expect(frac(b.c0)).toBeCloseTo(0);
      expect(frac(b.c0 + (breaks[i + 1] - b.a) * b.k + 1e-9)).toBeCloseTo(0);
    }
    // Quoins laid by courseSpans sit course for course on the walling's joints.
    for (const [y0, y1] of courseSpans(breaks, 0.96, 4.88)) {
      const b = courseBand(breaks, (y0 + y1) / 2);
      expect(frac(b.c0 + (y0 - b.a) * b.k + 1e-9)).toBeCloseTo(0);
      expect(y1 - y0).toBeGreaterThan(0.4);
    }
  });

  it('lays each face of a wall in whole or half stones, the bond running on round its corners', () => {
    const geo = masonGeometry(new THREE.BoxGeometry(5.3, 2, 1.7), { m: new THREE.Matrix4(), wrap: false, breaks: [], seed: 1 });
    const v = layout(geo).filter((q) => q.mode === 1);
    // At every corner of the plan the stone coordinate is a quarter stone off a joint, on both faces.
    for (const q of v) {
      const atCorner = Math.abs(Math.abs(q.p.x) - 2.65) < 1e-3 && Math.abs(Math.abs(q.p.z) - 0.85) < 1e-3;
      if (atCorner) expect(Math.abs(frac(q.X * 2) - 0.5)).toBeCloseTo(0, 3);
    }
    // The bond closes round the part: the coordinate at the start of +Z equals the end of -X, a whole number of stones on.
    const start = v.filter((q) => q.n.z > 0.9 && Math.abs(q.p.x + 2.65) < 1e-3).map((q) => q.X), end = v.filter((q) => q.n.x < -0.9 && Math.abs(q.p.z - 0.85) < 1e-3).map((q) => q.X);
    expect(frac(Math.max(...end) - Math.min(...start) + 1e-9)).toBeCloseTo(0);
  });

  it('lays a stone no bigger than one stone whole, with no joint across it', () => {
    const geo = masonGeometry(chamferBox(0.72, 0.6, 0.6, 0.05), { m: new THREE.Matrix4(), wrap: false, breaks: [], seed: 1, single: true });
    for (const q of layout(geo)) {
      expect(q.X).toBeGreaterThan(0);
      expect(q.X).toBeLessThan(1);
      expect(q.C).toBeGreaterThan(0);
      expect(q.C).toBeLessThan(1);
    }
  });

  it('lays round towers in whole stones round the drum, so no seam shows where the courses close', () => {
    const tower = buildProp('round_tower', { len: 3.2, v: 9 }).obj;
    let drums = 0;
    tower.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('aMasonK')) return;
      for (const q of layout(o.geometry)) if (q.mode === 3) {
        drums++;
        expect(q.X).toBe(Math.round(q.X));
      }
    });
    expect(drums).toBeGreaterThan(0);
  });

  it('cuts arch stones on radial joints that close on each other with no gap', () => {
    const stones = archStones(1.0, 4.0, 1.24, 0, 0.34, 4, 0.4);
    expect(stones.length).toBe(9);
    // Each voussoir shares its joint with the next one toward the keystone.
    const right = stones.filter((s) => s.place > 0 && s.pts[0][0] > 0).sort((a, b) => b.place - a.place);
    for (let i = 0; i + 1 < right.length; i++) {
      const a = right[i].pts, b = right[i + 1].pts, k = a.length / 2;
      // (A stone's outline: up its inner arc, then back down its outer arc.)
      const aTop = [a[k - 1], a[k]], bFoot = [b[0], b[b.length - 1]];
      for (let j = 0; j < 2; j++) for (let c = 0; c < 2; c++) expect(aTop[j][c]).toBeCloseTo(bFoot[j][c], 6);
    }
  });
});

describe('kerbs laid in single stones', () => {
  /** The kerbs as rectangles in plan. */
  const rects = (stones: KerbRun[]) => stones.map((s) => {
    const ax = Math.abs(Math.cos(s.rot)) > 0.5;
    return { x0: s.x - (ax ? s.len : KERB_W) / 2, x1: s.x + (ax ? s.len : KERB_W) / 2, z0: s.z - (ax ? KERB_W : s.len) / 2, z1: s.z + (ax ? KERB_W : s.len) / 2 };
  });
  const covered = (r: ReturnType<typeof rects>, x: number, z: number) => r.some((q) => x > q.x0 - 1e-6 && x < q.x1 + 1e-6 && z > q.z0 - 1e-6 && z < q.z1 + 1e-6);
  const overlapping = (r: ReturnType<typeof rects>) => r.some((a, i) => r.some((b, j) => j > i && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.01 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.01));

  it('turns an outside corner on one square corner stone, no gap and no overlap', () => {
    // A paved square (0..3, 0..3) with lawn to its north and east: runs set 0.08 onto the paving.
    const stones = kerbStones([{ x: 1.5, z: 0.08, rot: 0, len: 3 }, { x: 2.92, z: 1.5, rot: Math.PI / 2, len: 3 }]);
    const r = rects(stones);
    expect(overlapping(r)).toBe(false);
    // The angle is filled right into the corner.
    for (const [x, z] of [[2.9, 0.1], [2.75, 0.25], [2.95, 0.05]]) expect(covered(r, x, z)).toBe(true);
    // Every stone near square.
    for (const s of stones) expect(Math.abs(s.len - KERB_W)).toBeLessThan(0.11);
  });

  it('fills the inside corner where a lawn\'s corner pokes into the paving', () => {
    // Lawn cell (1..2, -1..0) with paving west, south and south-west of it.
    const stones = kerbStones([{ x: 1.5, z: 0.08, rot: 0, len: 1 }, { x: 0.92, z: -0.5, rot: Math.PI / 2, len: 1 }]);
    const r = rects(stones);
    expect(overlapping(r)).toBe(false);
    expect(covered(r, 0.95, 0.05)).toBe(true);
  });
});
