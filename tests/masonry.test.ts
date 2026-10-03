import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chamferBox } from '../src/render/blocks';
import { bondPhases, cleanBreaks, COURSE, courseBand, drumStones, laidDrum, laidRun, masonGeometry, STONE, WHOLE_STONE, type MasonGrid } from '../src/render/masonry';
import { KERB_W, kerbStones, type LaidKerb } from '../src/world/kerbStones';
import { archStones, ASHLAR, ASHLAR_B, buildProp, dressedArch, DRESS } from '../src/world/props';
import { buildBuilding, FLOOR_STONE } from '../src/world/buildingModel';
import { RANGE_SPECS } from '../src/world/castle/rangeSpecs';

/** The stone layout of every vertex: [stone coordinate, course coordinate, mode, the face's ends]. */
const layout = (geo: THREE.BufferGeometry) => {
  const a = geo.getAttribute('aMason'), k = geo.getAttribute('aMasonK'), f = geo.getAttribute('aMasonF'), p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  return Array.from({ length: a.count }, (_, i) => ({
    X: a.getX(i), C: a.getY(i), l: a.getZ(i), h: a.getW(i), mode: k.getX(i), xs: f.getX(i), xe: f.getY(i), cs: f.getZ(i), ce: f.getW(i),
    p: new THREE.Vector3().fromBufferAttribute(p, i), n: new THREE.Vector3().fromBufferAttribute(n, i),
  }));
};
const frac = (v: number) => v - Math.floor(v);

/** Stones from a face's end to the first joint into it, for a course of parity `par`, from its start or its end. */
const toJoint = (X: number, par: number, fromStart: boolean) => {
  const xo = X + par;
  if (fromStart) return Math.abs(frac(xo)) < 1e-6 || Math.abs(frac(xo) - 1) < 1e-6 ? 1 : Math.ceil(xo) - xo;
  return Math.abs(frac(xo)) < 1e-6 || Math.abs(frac(xo) - 1) < 1e-6 ? 1 : xo - Math.floor(xo);
};

describe('masonry laid as a mason lays it', () => {
  it('fits whole courses between breaks, and every part of a schedule agrees on them', () => {
    const breaks = cleanBreaks([0, 0.62, 0.96, 0.97, 4.88, 5.12, 9]);
    expect(breaks).toEqual([0, 0.62, 0.96, 4.88, 5.12, 9]);
    // Each band of the schedule holds whole courses: its foot and head fall on joints.
    for (let i = 0; i + 1 < breaks.length; i++) {
      const b = courseBand(breaks, (breaks[i] + breaks[i + 1]) / 2);
      expect(frac(b.c0)).toBeCloseTo(0);
      expect(frac(b.c0 + (breaks[i + 1] - b.a) * b.k + 1e-9)).toBeCloseTo(0);
    }
    // Breaks on the course lines give courses of exactly one height, on those lines.
    for (const y of [0.2, 1.3, 3.7, 6.9]) {
      const b = courseBand([0, 1, 3.5, 4, 6.5, 7], y);
      expect(1 / b.k).toBeCloseTo(COURSE);
      expect(frac(b.a / COURSE - b.c0 + 1e-9)).toBeCloseTo(0);
    }
  });

  it('lays every face from its ends in whole and half stones, each corner turned on a quoin long and short by turns', () => {
    for (const [w, d] of [[5.3, 1.7], [4, 4], [6.6, 2.2], [3.1, 1.2]]) {
      const geo = masonGeometry(new THREE.BoxGeometry(w, 2, d), { m: new THREE.Matrix4(), breaks: [], seed: 1 });
      const v = layout(geo).filter((q) => q.mode === 1);
      // Every face is a whole number of half stones long (it ends on a whole or half stone, never a sliver).
      for (const q of v) expect(frac(2 * (q.xe - q.xs) + 1e-9)).toBeCloseTo(0);
      // At each corner, in each course, the stone ending one face and the stone starting the next are one
      // long (a whole stone to its first joint) and one short (half a stone).
      const { pz, px, mz, mx } = bondPhases(Math.round(2 * w / STONE) / 2, Math.round(2 * d / STONE) / 2);
      const face = (sel: (q: (typeof v)[number]) => boolean) => v.find(sel)!;
      const faces = [face((q) => q.n.z > 0.9), face((q) => q.n.x > 0.9), face((q) => q.n.z < -0.9), face((q) => q.n.x < -0.9)];
      expect(faces.map((q) => q.xs)).toEqual([pz, px, mz, mx].map((x) => expect.closeTo(x, 6)));
      for (let i = 0; i < 4; i++) {
        const end = faces[i], start = faces[(i + 1) % 4];
        for (const par of [0, 0.5]) {
          const pair = [toJoint(end.xe, par, false), toJoint(start.xs, par, true)].sort();
          expect(pair[0]).toBeCloseTo(0.5);
          expect(pair[1]).toBeCloseTo(1);
        }
      }
    }
  });

  it('lays a stone no bigger than one stone whole, with no joint across it', () => {
    const geo = masonGeometry(chamferBox(0.72, 0.6, 0.6, 0.05), { m: new THREE.Matrix4(), breaks: [], seed: 1, single: true });
    for (const q of layout(geo)) {
      expect(q.X).toBeGreaterThan(0);
      expect(q.X).toBeLessThan(1);
      expect(q.C).toBeGreaterThan(0);
      expect(q.C).toBeLessThan(1);
    }
  });

  describe('round towers laid in rings of flat stones', () => {
    const r = 3.2, n = drumStones(r), step = (2 * Math.PI) / n;
    /** Each stone's side face as laid: its course, its stone (the shader's half-stone turn of an odd course undone) and its triangle. */
    const stones = (geo: THREE.BufferGeometry) => {
      const v = layout(geo), out: { c: number; i: number; tri: ReturnType<typeof layout> }[] = [];
      for (let t = 0; t < v.length; t += 3) {
        const tri = v.slice(t, t + 3);
        if (tri[0].mode !== 1 || Math.abs(tri[0].n.y) > 1e-6) continue;
        const c = Math.floor(Math.min(...tri.map((q) => q.C)) + 1e-6), par = c % 2 ? 0.5 : 0;
        out.push({ c, i: Math.floor(Math.min(...tri.map((q) => q.X + par)) + 1e-6), tri });
      }
      return out;
    };
    const isJoint = (q: { X: number }, c: number) => {
      const j = q.X + (c % 2 ? 0.5 : 0);
      return Math.abs(j - Math.round(j)) < 1e-6;
    };

    it('lays each course in whole stones, each one flat face whose joints stand on the ring\'s corners', () => {
      const faces = stones(laidDrum({ r, y0: 1, y1: 6, n, seed: 1 }));
      const perCourse = new Map<number, Set<number>>();
      for (const { c, i, tri } of faces) {
        // No stone runs on past a corner: every triangle lies within one stone, between two joints.
        for (const q of tri) expect(q.X + (c % 2 ? 0.5 : 0)).toBeLessThanOrEqual(i + 1 + 1e-6);
        // Every joint is a corner of the ring (on the drum's radius, at the course's own turn).
        for (const q of tri.filter((p) => isJoint(p, c))) {
          expect(Math.hypot(q.p.x, q.p.z)).toBeCloseTo(r, 6);
          const b = Math.atan2(q.p.x, q.p.z), want = (c % 2 ? step / 2 : 0) + Math.round(q.X + (c % 2 ? 0.5 : 0)) * step;
          expect(Math.abs(Math.atan2(Math.sin(b - want), Math.cos(b - want)))).toBeLessThan(1e-6);
        }
        // And the stone's face is the flat between them: it faces straight out at its middle's bearing.
        const mid = (c % 2 ? step / 2 : 0) + (i + 0.5) * step;
        expect(tri[0].n.x).toBeCloseTo(Math.sin(mid), 6);
        expect(tri[0].n.z).toBeCloseTo(Math.cos(mid), 6);
        if (!perCourse.has(c)) perCourse.set(c, new Set());
        perCourse.get(c)!.add(((i % n) + n) % n);
      }
      // Ten courses from 1 to 6, each a whole ring of n stones.
      expect([...perCourse.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      for (const s of perCourse.values()) expect(s.size).toBe(n);
    });

    it('turns every course half a stone on the one under it, its courses on the castle\'s course lines', () => {
      const faces = stones(laidDrum({ r, y0: 1, y1: 6, n, seed: 1 }));
      for (const { c, tri } of faces) for (const q of tri) {
        // The course coordinate is the height in courses, so a tower's courses run on level with the walls'.
        expect(q.C * COURSE).toBeCloseTo(q.p.y, 6);
        expect(q.p.y).toBeGreaterThanOrEqual(c * COURSE - 1e-6);
        expect(q.p.y).toBeLessThanOrEqual((c + 1) * COURSE + 1e-6);
      }
      // Each joint of an odd course stands over the middle of a stone of the even course under it.
      const joints = (c: number) => faces.filter((f) => f.c === c).flatMap((f) => f.tri.filter((q) => isJoint(q, c))).map((q) => Math.atan2(q.p.x, q.p.z));
      for (const b of joints(3)) {
        const k = (b - step / 2) / step;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
        expect(joints(2).some((a) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3)).toBe(false);
      }
    });

    it('shows a course\'s bed only where its corners stand past the course over it, and cuts no stone into a doorway\'s notch', () => {
      const lips = layout(laidDrum({ r, y0: 1, y1: 2, n, seed: 1 })).filter((q) => q.n.y > 0.99 && Math.abs(q.p.y - 1.5) < 1e-6);
      // Between the two courses only the lip at each corner shows: a sliver r(1 - cos(pi / n)) deep.
      expect(lips.length).toBeGreaterThan(0);
      for (const q of lips) expect(Math.hypot(q.p.x, q.p.z)).toBeGreaterThan(r * Math.cos(Math.PI / n) - 1e-6);
      const notch = { a: Math.PI / 2, o: 0.3, half: 1.0, back: r - 0.3, y0: 2, y1: 5 };
      for (const { tri } of stones(laidDrum({ r, y0: 1, y1: 6, n, seed: 1, notches: [notch] }))) {
        const m = tri.reduce((s, q) => s.add(q.p.clone().multiplyScalar(1 / 3)), new THREE.Vector3());
        // (The stones of the drum's face, not the notch's own back and sides.)
        if (Math.hypot(m.x, m.z) < r * Math.cos(Math.PI / n) - 1e-3 || m.y < notch.y0 || m.y > notch.y1 || m.x <= 0) continue;
        expect(Math.abs(-m.z - notch.o)).toBeGreaterThan(notch.half - 1e-6);
      }
    });
  });

  it('lays the walling of the curtain, its towers and the gatehouse on one set of course lines', () => {
    // Every course in the walling one course high, and every course line on the castle's grid counted
    // up from the foot each piece stands on, so where two pieces meet their courses run on level.
    const pieces = [
      buildProp('castle_wall', { len: 12, v: 3 }), buildProp('round_tower', { len: 3.2, v: 11.2, opt: { walks: [[Math.PI / 2, 0]] } }),
      buildProp('corner_tower', { len: 3.4, v: 12 }), buildProp('outer_gatehouse', { len: 4, opt: { cx: 6, R: 2.6 } }),
    ];
    let checked = 0;
    for (const pc of pieces) {
      pc.obj.updateMatrixWorld(true);
      pc.obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('aMasonK')) return;
        const hex = (o.material as THREE.MeshStandardMaterial).color.getHex();
        if (hex !== ASHLAR && hex !== ASHLAR_B) return;
        const v = layout(o.geometry);
        // (The walling's own faces: side faces whose triangles span more than one course.)
        for (let t = 0; t < v.length; t += 3) {
          const tri = v.slice(t, t + 3);
          if (!tri.every((q) => q.mode === 1) || Math.max(...tri.map((q) => q.C)) - Math.min(...tri.map((q) => q.C)) < 1.01) continue;
          for (const q of tri) {
            const y = q.p.clone().applyMatrix4(o.matrixWorld).y;
            expect(q.h).toBeCloseTo(COURSE, 4);
            expect(Math.abs(frac((y - q.C * q.h) / COURSE + 1e-6) - 1e-6)).toBeLessThan(1e-3);
            checked++;
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(300);
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

  it('dresses an arch as one ring of stones laid in order round it, its jambs bedded on the walling\'s courses', () => {
    // A doorway 2 wide with its apex at 4.05, the sill 0.3 over the course lines' origin.
    const stones = dressedArch({ w: 2, h: 4.05, rise: 1.24, t: 0.48, p: 0.08, dep: 0.3, n: 4, foot: 0, grid: 0.3 });
    // The stone coordinate runs on unbroken from the left foot round to the right foot, one whole stone each.
    const spans = stones.map((st) => {
      const X = layout(st.geo).map((q) => q.X);
      return [Math.min(...X), Math.max(...X)];
    });
    spans.forEach(([a, b], i) => {
      expect(a).toBeCloseTo(i);
      expect(b).toBeCloseTo(i + 1);
    });
    // Each jamb stone's beds lie on the course lines (or at the foot or the springing), none under a quarter course.
    const ys = 4.05 - 1.24;
    for (const st of stones) {
      const p = layout(st.geo).map((q) => q.p.y), lo = Math.min(...p), hi = Math.max(...p);
      if (hi > ys + 1e-6) continue;
      for (const y of [lo, hi]) if (y > 1e-6 && Math.abs(y - ys) > 1e-6) expect(Math.abs(frac((y + 0.3) / COURSE + 1e-6) - 1e-6)).toBeLessThan(1e-3);
      expect(hi - lo).toBeGreaterThan(COURSE / 2 - 1e-6);
    }
  });
});

describe('the castle buildings laid on one block grid', () => {
  // Every castle building as the game builds it, its stone faces in its own space (the owner, October 3:
  // "the top doesnt line up with the side", courses broken across corners, jambs, buttresses and piers).
  const built = RANGE_SPECS.map((b) => {
    const p = buildBuilding(b);
    p.obj.updateMatrixWorld(true);
    const inv = p.obj.matrixWorld.clone().invert(), tris: { v: ReturnType<typeof layout>; m: THREE.Matrix4 }[] = [];
    p.obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('aMason')) return;
      const hex = (o.material as THREE.MeshStandardMaterial).color.getHex();
      if (![ASHLAR_B, DRESS, FLOOR_STONE].includes(hex)) return;
      const v = layout(o.geometry), m = inv.clone().multiply(o.matrixWorld);
      for (let t = 0; t < v.length; t += 3) tris.push({ v: v.slice(t, t + 3).map((q) => ({ ...q, p: q.p.clone().applyMatrix4(m) })), m });
    });
    return { b, grid: p.obj.userData.masonGrid as MasonGrid, tris };
  });
  /** A stone laid whole (a merlon, a quoin, a lintel), not in courses. */
  const whole = (tri: ReturnType<typeof layout>) => tri[0].cs === WHOLE_STONE[0] && tri[0].ce === WHOLE_STONE[1];
  const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-3;

  it('lays every course of every face, proud blocks and bands among them, on the one set of course lines', () => {
    let checked = 0;
    for (const { b, tris } of built) for (const { v } of tris) {
      if (v[0].mode !== 1 || Math.abs(v[0].h - COURSE) > 1e-4 || whole(v)) continue;
      // The course coordinate is the height in courses over the building's floor, on every part.
      for (const q of v) expect(q.C * COURSE, `${b.id} at (${q.p.x.toFixed(2)}, ${q.p.y.toFixed(2)}, ${q.p.z.toFixed(2)})`).toBeCloseTo(q.p.y, 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('runs the joints of every long face on the grid, so faces in one plane and bands proud of them share them', () => {
    let checked = 0;
    for (const { b, grid, tris } of built) for (const { v } of tris) {
      // (Coursed faces: a coping laid down a gable's rake takes its own stones.)
      if (v[0].mode !== 1 || whole(v) || Math.abs(v[0].h - COURSE) > 1e-4) continue;
      const n = v[0].n, alongX = Math.abs(n.z) > 0.99, alongZ = Math.abs(n.x) > 0.99;
      if (!alongX && !alongZ) continue;
      const span = Math.max(...v.map((q) => (alongX ? q.p.x : q.p.z))) - Math.min(...v.map((q) => (alongX ? q.p.x : q.p.z)));
      if (span < 1.6) continue;
      // The stone coordinate is the place along the face on the building's grid, the same whichever way
      // the face looks, so a joint falls at one place on every face and band of that run.
      for (const q of v) {
        const at = alongX ? (q.p.x - grid.ox) / grid.l : (q.p.z - grid.oz) / grid.l + 0.5;
        expect(q.l, b.id).toBeCloseTo(grid.l, 4);
        expect(isWhole(q.X - at) || isWhole(q.X + at - (alongX ? 0 : 1)), `${b.id}: a face at (${q.p.x.toFixed(2)}, ${q.p.y.toFixed(2)}, ${q.p.z.toFixed(2)}) is off the grid`).toBe(true);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('lays a wall\'s top in through-stones on its top course\'s joints, and every floor, dais and step on one grid', () => {
    let tops = 0, flags = 0;
    for (const { b, grid, tris } of built) for (const { v } of tris) {
      if (v[0].mode !== 2 || v[0].n.y < 0.99 || whole(v)) continue;
      const y = v[0].p.y, flagged = Math.abs(v[0].h - 0.6) < 1e-4;
      for (const q of v) {
        if (flagged) {
          // (A floor: stones along X on the grid's lines, rows across it.)
          expect(isWhole(q.X - (q.p.x - grid.ox) / grid.l), `${b.id}: a floor at (${q.p.x.toFixed(2)}, ${y.toFixed(2)}, ${q.p.z.toFixed(2)})`).toBe(true);
          flags++;
          continue;
        }
        // A wall's top: its joints where its top course's are, on either axis (that course's half-stone turn and all).
        const par = Math.floor(y / COURSE - 1e-3) % 2 ? 0.5 : 0, ax = (q.p.x - grid.ox) / grid.l + par, az = -(q.p.z - grid.oz) / grid.l + 0.5 + par;
        expect(isWhole(q.X - ax) || isWhole(q.X - az), `${b.id}: a wall top at (${q.p.x.toFixed(2)}, ${y.toFixed(2)}, ${q.p.z.toFixed(2)})`).toBe(true);
        tops++;
      }
    }
    expect(tops).toBeGreaterThan(200);
    expect(flags).toBeGreaterThan(50);
  });

  it('turns every outer corner on a quoin: long and short by turns, never a sliver of a stone', () => {
    // (A building whole stones long and deep, less a tenth, as the plan sets them out: a building of any
    // other size would end its faces on slivers here.)
    for (const { b, grid } of built) {
      const x0 = 0.5 - 0.45, x1 = b.w - 0.5 + 0.45, z0 = 0.5 - 0.45, z1 = b.d - 0.5 + 0.45;
      for (const par of [0, 0.5]) {
        // The piece from each end of each face to the first joint into it (in metres).
        const piece = (a: number) => {
          const f = a + par - Math.floor(a + par + 1e-9);
          return f < 1e-6 ? grid.l : f * grid.l;
        };
        const pieces = [
          piece((x0 - grid.ox) / grid.l) === grid.l ? grid.l : grid.l - piece((x0 - grid.ox) / grid.l), piece((x1 - grid.ox) / grid.l),
          piece((z0 - grid.oz) / grid.l + 0.5) === grid.l ? grid.l : grid.l - piece((z0 - grid.oz) / grid.l + 0.5), piece((z1 - grid.oz) / grid.l + 0.5),
        ];
        for (const s of pieces) expect(s, `${b.id}: a corner stone ${s.toFixed(2)} long`).toBeGreaterThan(0.3);
      }
    }
  });
});

describe('kerbs laid as one border of stones', () => {
  /** The kerbs as rectangles in plan. */
  const rects = (runs: LaidKerb[]) => runs.map((s) => {
    const ax = Math.abs(Math.cos(s.rot)) > 0.5;
    return { x0: s.x - (ax ? s.len : KERB_W) / 2, x1: s.x + (ax ? s.len : KERB_W) / 2, z0: s.z - (ax ? KERB_W : s.len) / 2, z1: s.z + (ax ? KERB_W : s.len) / 2 };
  });
  const covered = (r: ReturnType<typeof rects>, x: number, z: number) => r.some((q) => x > q.x0 - 1e-6 && x < q.x1 + 1e-6 && z > q.z0 - 1e-6 && z < q.z1 + 1e-6);
  const overlapping = (r: ReturnType<typeof rects>) => r.some((a, i) => r.some((b, j) => j > i && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.01 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.01));

  it('turns an outside corner on one square corner stone, no gap and no overlap', () => {
    // A paved square (0..3, 0..3) with lawn to its north and east: runs set 0.08 onto the paving.
    const runs = kerbStones([{ x: 1.5, z: 0.08, rot: 0, len: 3 }, { x: 2.92, z: 1.5, rot: Math.PI / 2, len: 3 }]);
    const r = rects(runs);
    expect(overlapping(r)).toBe(false);
    // The angle is filled right into the corner.
    for (const [x, z] of [[2.9, 0.1], [2.75, 0.25], [2.95, 0.05]]) expect(covered(r, x, z)).toBe(true);
    // Each run is whole stones of the paving's own length (two thirds), its corner stone square.
    for (const s of runs) expect(Math.abs(s.len / s.n - (s.n === 1 && s.len < 0.4 ? KERB_W : 2 * KERB_W))).toBeLessThan(0.17);
  });

  it('fills the inside corner where a lawn\'s corner pokes into the paving', () => {
    // Lawn cell (1..2, -1..0) with paving west, south and south-west of it.
    const r = rects(kerbStones([{ x: 1.5, z: 0.08, rot: 0, len: 1 }, { x: 0.92, z: -0.5, rot: Math.PI / 2, len: 1 }]));
    expect(overlapping(r)).toBe(false);
    expect(covered(r, 0.95, 0.05)).toBe(true);
  });

  it('lays a run as one box whose joints are drawn in it, its top edges arrises', () => {
    const v = layout(laidRun(2, KERB_W, 0.12, 3, 1));
    // Along the run the stone coordinate runs 0 to 3: three stones, the joints at its whole numbers.
    const top = v.filter((q) => q.n.y > 0.9);
    expect(Math.min(...top.map((q) => q.X))).toBeCloseTo(0);
    expect(Math.max(...top.map((q) => q.X))).toBeCloseTo(3);
    for (const q of top) expect(q.l).toBeCloseTo(2 / 3);
  });
});
