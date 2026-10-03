/**
 * The castle's approach: its parapets, balustrades, ramp walls and paving, terrace and bench; the
 * climb's stair, walls and piers; the gate terrace's bastion, the bridge and the banners at its foot.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { PAL } from '../../render/kit';
import { taper } from '../../render/blocks';
import { COURSE } from '../../render/masonry';
import { type Builder, archRing, ASHLAR, ASHLAR_L, ASHLAR_W, ball, BASE, BASE_COURSE, cb, DARK, deep, DRESS, KERB, laidBand, LAMP_NAVY, lenOf, livery, PAVE, spandrels, vOf } from '../props';
import { paved } from './curtain';

/** Flagstones laid as props (the round terrace's): the road's flagstone tone, and a little darker. */
const FLAG = 0x958f86, FLAG_D = 0x8a847b;

/**
 * A band `w` wide along a polyline in plan (points (x, z)), its bottom and top at each corner given
 * (y0, y1: so it can follow a slope), mitred at every bend and squared at its ends, as one solid; the
 * band's middle may stand `shift` to the left of the line, and its top `lean` further left than its
 * bottom (a battered face). The audit sees each stretch as its own box.
 */
export function slopedBand(pts: THREE.Vector2[], y0: number[], y1: number[], w: number, shift = 0, lean = 0) {
  const n = pts.length, dir = (i: number) => pts[i + 1].clone().sub(pts[i]).normalize();
  const left = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  const mitre = (i: number) => {
    if (i === 0) return left(dir(0));
    if (i === n - 1) return left(dir(n - 2));
    const m = left(dir(i - 1)).add(left(dir(i))).normalize();
    return m.divideScalar(Math.max(0.35, m.dot(left(dir(i)))));
  };
  const pos: number[] = [], lay: number[] = [], boxes: { c: number[]; h: number[]; ry: number }[] = [];
  // (Each vertex also carries where it lies in the band, for laying its stones along it: the
  // distance along the run, 0 at the foot to 1 at the top, and 0 to 1 across: see masonry.ts.)
  const run = [0];
  for (let i = 1; i < n; i++) run.push(run[i - 1] + pts[i].distanceTo(pts[i - 1]));
  /** The 8 corners of the stretch between corners i and i + 1. */
  const corner = (i: number, side: number, top: boolean) => {
    const m = mitre(i), off = shift + side * (w / 2) + (top ? lean : 0), p = pts[i].clone().addScaledVector(m, off);
    return [p.x, top ? y1[i] : y0[i], p.y, run[i], top ? 1 : 0, (side + 1) / 2];
  };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    for (const v of [a, c, b, a, d, c]) {
      pos.push(v[0], v[1], v[2]);
      lay.push(v[3], v[4], v[5]);
    }
  };
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1;
    const [lb0, rb0, lt0, rt0] = [corner(i, 1, false), corner(i, -1, false), corner(i, 1, true), corner(i, -1, true)];
    const [lb1, rb1, lt1, rt1] = [corner(j, 1, false), corner(j, -1, false), corner(j, 1, true), corner(j, -1, true)];
    quad(lt0, rt0, rt1, lt1);
    quad(lb0, lb1, rb1, rb0);
    quad(lb0, lt0, lt1, lb1);
    quad(rb0, rb1, rt1, rt0);
    if (i === 0) quad(lb0, rb0, rt0, lt0);
    if (j === n - 1) quad(lb1, lt1, rt1, rb1);
    const d = pts[j].clone().sub(pts[i]), c = pts[i].clone().add(pts[j]).multiplyScalar(0.5).addScaledVector(left(d.clone().normalize()), shift + lean / 2);
    const lo = Math.min(y0[i], y0[j]), hi = Math.max(y1[i], y1[j]);
    boxes.push({ c: [c.x, (lo + hi) / 2, c.y], h: [d.length() / 2, (hi - lo) / 2, w / 2 + Math.abs(lean) / 2], ry: Math.atan2(-d.y, d.x) });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLay', new THREE.Float32BufferAttribute(lay, 3));
  geo.computeVertexNormals();
  geo.userData.boxes = boxes;
  geo.userData.lay = { len: run[n - 1], h: y0.reduce((a, y, i) => a + y1[i] - y, 0) / n, w };
  return geo;
}

/**
 * A flat slab cut to an outline in plan (points (x, z) in order round it), `h` thick with its foot on
 * y = 0: a flagstone of any shape.
 */
export function flatSlab(outline: THREE.Vector2[], h: number) {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  // (For the audit: three boxes along it, each inside the slab, turned to the edge that boxes it
  // tightest, so neighbouring slabs' boxes never overlap where the stones themselves only meet.)
  let best = { area: Infinity, d: new THREE.Vector2(1, 0), u0: 0, u1: 0 };
  for (let i = 0; i < outline.length; i++) {
    const d = outline[(i + 1) % outline.length].clone().sub(outline[i]).normalize(), nrm = new THREE.Vector2(-d.y, d.x);
    const us = outline.map((p) => p.dot(d)), vs = outline.map((p) => p.dot(nrm));
    const area = (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    if (area < best.area) best = { area, d, u0: Math.min(...us), u1: Math.max(...us) };
  }
  const d = best.d, nrm = new THREE.Vector2(-d.y, d.x);
  /** The slab's extent across it (v) where the line u = const crosses its outline. */
  const across = (u: number) => {
    const vs: number[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length], ua = a.dot(d), ub = b.dot(d);
      if ((ua - u) * (ub - u) > 0 || ua === ub) continue;
      const t = (u - ua) / (ub - ua);
      vs.push(a.dot(nrm) + (b.dot(nrm) - a.dot(nrm)) * t);
    }
    return vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 0];
  };
  geo.userData.boxes = [0, 1, 2].map((k) => {
    const ua = best.u0 + ((best.u1 - best.u0) * k) / 3 + 0.01, ub = best.u0 + ((best.u1 - best.u0) * (k + 1)) / 3 - 0.01;
    const [a0, a1] = across(ua), [b0, b1] = across(ub), v0 = Math.max(a0, b0) + 0.004, v1 = Math.min(a1, b1) - 0.004;
    const c = d.clone().multiplyScalar((ua + ub) / 2).add(nrm.clone().multiplyScalar((v0 + v1) / 2));
    return { c: [c.x, h / 2, c.y], h: [(ub - ua) / 2, h / 2, Math.max(0.001, (v1 - v0) / 2)], ry: Math.atan2(-d.y, d.x) };
  });
  return geo;
}

/** A convex block from its corners (x, y, z), for the battered and raking masonry of the approach. */
function hull(pts: number[][]) {
  const geo = new ConvexGeometry(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  geo.computeVertexNormals();
  return geo;
}

/**
 * For the geometry audit: boxes filling a stretch along X from x0 to x1 whose foot and head rake
 * straight between their heights at its ends (y0a to y0b under it, y1a to y1b over it), `z0` to `z1`
 * across: short slices, each from the higher of its foot's ends to the lower of its head's, so every
 * box lies inside the stone.
 */
function rakedBoxes(x0: number, x1: number, y0a: number, y0b: number, y1a: number, y1b: number, z0: number, z1: number, step = 0.2) {
  const n = Math.max(1, Math.ceil((x1 - x0) / step)), at = (a: number, b: number, t: number) => a + (b - a) * t;
  return Array.from({ length: n }, (_, i) => {
    const t0 = i / n, t1 = (i + 1) / n;
    return [at(x0, x1, t0), Math.max(at(y0a, y0b, t0), at(y0a, y0b, t1)), z0, at(x0, x1, t1), Math.min(at(y1a, y1b, t0), at(y1a, y1b, t1)), z1];
  });
}

/** How far a talus (a battered plinth) stands out at its foot from the face it leans against. */
const TALUS_OUT = 0.7;

/**
 * The climb's stone: its flights of treads, its landings' flagstones, its walls with raking copings,
 * the piers where the copings change pitch and the buttresses on the tall wall over the lane.
 */
export const CLIMB_PROPS: Record<string, Builder> = {
  /**
   * A flight of steps from its foot (local z = 0) up toward -Z, `opt.w` wide between its walls: `n`
   * risers of `r` and a tread `g` deep for each but the last. Each step is a riser of the base course's
   * weathered stone under a tread slab of the paler dressed stone whose nosing stands out over it, so every step
   * reads from above as a pale tread over a line of shadow; each laid in two stones breaking joint with
   * the steps under and over it. The last step runs on as the head's landing to `run`. All `lift` over
   * the ground the flight stands on.
   */
  stair_flight: (k, g, arg) => {
    const o = { w: 4, run: 5, n: 17, r: 2.75 / 17, g: 0.28, lift: 0, ...arg?.opt } as { w: number; run: number; n: number; r: number; g: number; lift: number };
    const W = o.w, NOSE = 0.05, SLAB = 0.07;
    for (let i = 1; i <= o.n; i++) {
      const front = -(i - 1) * o.g, back = i < o.n ? -i * o.g : -o.run, y0 = o.lift + (i - 1) * o.r, y1 = o.lift + i * o.r;
      // (Each step in two stones, their joint half a metre off the middle on every other step.)
      const split = i % 2 ? 0 : 0.5;
      for (const [a, b] of [[-W / 2, split], [split, W / 2]]) {
        cb(k, g, [b - a, y1 - SLAB - y0, front - back], [(a + b) / 2, (y0 + y1 - SLAB) / 2, (front + back) / 2], BASE, undefined, 0.02);
        cb(k, g, [b - a, SLAB, front + NOSE - back], [(a + b) / 2, y1 - SLAB / 2, (front + NOSE + back) / 2], DRESS, undefined, 0.025);
      }
    }
  },
  /** A landing's flagstones, `opt.lx` by `opt.lz`, laid in the castle paving's rows in the dressed stone, their top `opt.lift` up. */
  stair_landing: (k, g, arg) => {
    const o = { lx: 4, lz: 4, lift: 0, ...arg?.opt } as { lx: number; lz: number; lift: number };
    paved(cb(k, g, [o.lx, 0.16, o.lz], [0, o.lift - 0.08, 0], DRESS, undefined, 0.02));
  },
  /**
   * A wall along local X, its stair side toward -Z and its outer face toward +Z, `opt.w` thick, as
   * stretches between the points `opt.pts` ([x, foot, coping top]): its walling from its foot (or from
   * the deep base course, `opt.base`, standing on the lane, a hand proud of the outer face) up to its
   * coping, the coping of dressed stones raking from one end to the other; with `opt.talus` its outer
   * face stands on a battered talus that high, running out over the base course at its foot.
   */
  climb_wall: (k, g, arg) => {
    const o = { pts: [[-2, 0, 1.1], [2, 0, 3.6]], w: 1, base: true, talus: 0, ...arg?.opt } as { pts: number[][]; w: number; base: boolean; talus: number; trim?: [number, number] };
    const hw = o.w / 2, C = 0.16, pts = o.pts, first = pts[0], last = pts[pts.length - 1], L = last[0] - first[0];
    const foot = (p: number[]) => (o.base ? BASE_COURSE : p[1]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (b[0] - a[0] < 0.01) continue;
      const geo = hull([[a[0], foot(a), -hw], [a[0], foot(a), hw], [b[0], foot(b), -hw], [b[0], foot(b), hw], [a[0], a[2] - C, -hw], [a[0], a[2] - C, hw], [b[0], b[2] - C, -hw], [b[0], b[2] - C, hw]]);
      geo.userData.boxes = rakedBoxes(a[0], b[0], foot(a), foot(b), a[2] - C, b[2] - C, -hw, hw, 0.25);
      k.mesh(g, geo, ASHLAR, [0, 0, 0]);
    }
    const mid = (first[0] + last[0]) / 2;
    if (o.base) deep(cb(k, g, [L, BASE_COURSE, o.w + (o.talus ? 0 : 0.08)], [mid, BASE_COURSE / 2, o.talus ? 0 : 0.04], BASE, undefined, 0.03));
    if (o.talus) {
      // (Laid in the deep base course's own size, leaning back from its foot into the face at its top;
      // cut back square at an end that meets the inside of a corner, clear of the wall turning there.)
      const T = o.talus, [ta, tb] = o.trim ?? [0, 0], x0 = first[0] + ta, x1 = last[0] - tb;
      deep(k.mesh(g, hull([[x0, 0, hw], [x1, 0, hw], [x0, 0, hw + TALUS_OUT], [x1, 0, hw + TALUS_OUT], [x0, T, hw], [x1, T, hw], [x0, T, hw + 0.002], [x1, T, hw + 0.002]]), BASE, [0, 0, 0]));
    }
    // The coping, a finger over the walling's faces on both sides.
    const cope = slopedBand([new THREE.Vector2(first[0], 0), new THREE.Vector2(last[0], 0)], [first[2] - C, last[2] - C], [first[2], last[2]], o.w + 0.05);
    // (Its boxes reach down into the walling under it, so the audit sees it laid on the wall.)
    cope.userData.boxes = rakedBoxes(first[0], last[0], first[2] - 2 * C - 0.2, last[2] - 2 * C - 0.2, first[2], last[2], -hw - 0.025, hw + 0.025).map(([x0, y0, z0, x1, y1, z1]) => ({ c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, Math.max(0.001, (y1 - y0) / 2), (z1 - z0) / 2], ry: 0 }));
    k.mesh(g, cope, DRESS, [0, 0, 0]);
  },
  /**
   * A pier of the climb's walls, standing on the lane: a shaft `opt.lx` by `opt.lz` rising a hand over
   * the copings it takes (to `opt.top`), standing a hand proud of the walls' outer faces on the sides
   * `opt.out` names (1 -X, 2 +X, 4 -Z, 8 +Z; on a battered talus where `opt.talus`), the castle's deep
   * base course at its foot, a moulded cap and a low pyramid on it, or a lantern (`v` 2).
   */
  climb_pier: (k, g, arg) => {
    const o = { lx: 1, lz: 1.2, top: 2, out: 0, ...arg?.opt } as { lx: number; lz: number; top: number; out: number; talus?: number; flush?: number };
    const P = 0.15, x0 = -o.lx / 2 - (o.out & 1 ? P : 0), x1 = o.lx / 2 + (o.out & 2 ? P : 0), z0 = -o.lz / 2 - (o.out & 4 ? P : 0), z1 = o.lz / 2 + (o.out & 8 ? P : 0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0, H = o.top;
    // (The shaft stands on the lane inside its base course, which stands a finger proud all round.)
    deep(cb(k, g, [sx + 0.06, BASE_COURSE, sz + 0.06], [cx, BASE_COURSE / 2, cz], BASE, undefined, 0.03));
    cb(k, g, [sx, H, sz], [cx, H / 2, cz], ASHLAR, undefined, 0.04);
    if (o.talus && o.out & 8) deep(k.mesh(g, hull([[x0, 0, z1], [x1, 0, z1], [x0, 0, z1 + TALUS_OUT], [x1, 0, z1 + TALUS_OUT], [x0, o.talus, z1], [x1, o.talus, z1], [x0, o.talus, z1 + 0.002], [x1, o.talus, z1 + 0.002]]), BASE, [0, 0, 0]));
    // (The cap stands out over every side but one built against a higher wall, `opt.flush`, in the same bits.)
    const f = o.flush ?? 0, c0 = f & 1 ? 0 : 0.09, c1 = f & 2 ? 0 : 0.09, c4 = f & 4 ? 0 : 0.09, c8 = f & 8 ? 0 : 0.09;
    cb(k, g, [sx + c0 + c1, 0.16, sz + c4 + c8], [cx + (c1 - c0) / 2, H + 0.08, cz + (c8 - c4) / 2], DRESS, undefined, 0.03);
    if (vOf(arg) === 2) {
      cb(k, g, [0.42, 0.08, 0.42], [cx, H + 0.2, cz], LAMP_NAVY, undefined, 0.02);
      k.box(g, [0.32, 0.42, 0.32], [cx, H + 0.46, cz], 0xffcf86, undefined, 0xffa038, 1.4);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.05, 0.46, 0.05], [cx + dx * 0.17, H + 0.46, cz + dz * 0.17], LAMP_NAVY);
      k.mesh(g, taper(0.5, 0.5, 0.1, 0.1, 0.22), LAMP_NAVY, [cx, H + 0.78, cz]);
      k.mesh(g, new THREE.OctahedronGeometry(0.08, 1), PAL.gold, [cx, H + 0.96, cz]);
    } else k.mesh(g, taper(sx, sz, 0.12, 0.12, 0.42), ASHLAR_L, [cx, H + 0.37, cz]);
  },
  /**
   * A buttress against a wall's outer face (its back on local z = 0, standing out toward +Z), `opt.h`
   * high: two stages, each with a sloping weathering, the lower 1.3 deep, the upper 0.8, on the castle's
   * deep base course.
   */
  climb_buttress: (k, g, arg) => {
    const H = ({ h: 8, ...arg?.opt } as { h: number }).h, W = 0.5, y1 = Math.round((H * 0.45) / COURSE) * COURSE;
    deep(cb(k, g, [2 * W + 0.1, BASE_COURSE, 1.4], [0, BASE_COURSE / 2, 0.7], BASE, undefined, 0.03));
    k.mesh(g, hull([[-W, BASE_COURSE, 0], [W, BASE_COURSE, 0], [-W, BASE_COURSE, 1.3], [W, BASE_COURSE, 1.3], [-W, y1, 1.3], [W, y1, 1.3], [-W, y1 + 0.5, 0], [W, y1 + 0.5, 0], [-W, y1 + 0.5, 0.8], [W, y1 + 0.5, 0.8]]), ASHLAR, [0, 0, 0]);
    k.mesh(g, hull([[-W, y1 + 0.5, 0], [W, y1 + 0.5, 0], [-W, y1 + 0.5, 0.8], [W, y1 + 0.5, 0.8], [-W, H, 0.8], [W, H, 0.8], [-W, H + 0.8, 0], [W, H + 0.8, 0]]), ASHLAR, [0, 0, 0]);
  },
};

/**
 * The gate front below the gate: the bastion under the gate terrace with the culvert's arch, the
 * bridge over the moat on its arches, and the banners at the bridge's foot.
 */
export const GATE_FRONT_PROPS: Record<string, Builder> = {
  /**
   * The gate terrace's bastion, standing on the rock at the cliff's foot (y = 0): its top `opt.w` wide
   * and `opt.d` deep (its south face's top on local z = 0, its back toward -Z in the rock), `opt.h`
   * high, its west, south and east faces leaning back `opt.batter` per metre up; a deep base course
   * round its foot and a cornice of dressed stone under the terrace's parapet. In its south face on the
   * axis the culvert's mouth (`opt.arch`: its width and sill): a round arch over a channel running back
   * into the dark, its lip a stone spout standing out over the face, so the moat pours out clear of it.
   */
  gate_bastion: (k, g, arg) => {
    const o = { w: 20, d: 2, h: 11, batter: 0.1, arch: { w: 2, sill: 8.8 }, ...arg?.opt } as { w: number; d: number; h: number; batter: number; arch: { w: number; sill: number } };
    const { h: H, batter: B } = o, hw = o.w / 2, back = -o.d, aw = o.arch.w / 2, ys = o.arch.sill, yc = ys + 0.4 + aw, deepIn = -2;
    // (Its top a hair under the terrace's ground, so no stone lies in one plane with it.)
    const top = H - 0.02, out = (y: number) => B * (H - y);
    // The body in five blocks round the culvert's slot: west and east of it full height, under its
    // sill, over its arch, and behind its mouth.
    const side = (sx: number) => hull([[sx * (hw + out(0)), 0, back], [sx * (hw + out(0)), 0, out(0)], [sx * aw, 0, back], [sx * aw, 0, out(0)], [sx * hw, top, back], [sx * hw, top, out(top)], [sx * aw, top, back], [sx * aw, top, out(top)]]);
    const mid = (y0: number, y1: number, z1?: number) => hull([-aw, aw].flatMap((x) => [[x, y0, back], [x, y0, z1 ?? out(y0)], [x, y1, back], [x, y1, z1 ?? out(y1)]]));
    for (const geo of [side(-1), side(1), mid(0, ys), mid(yc, top), mid(ys, yc, deepIn)]) k.mesh(g, geo, ASHLAR, [0, 0, 0]);
    // The culvert's mouth: its back in shadow, the round head's spandrels filling the slot, and the
    // dressed ring of voussoirs and jambs leaning with the face.
    k.box(g, [2 * aw, yc - ys, 0.04], [0, (ys + yc) / 2, deepIn + 0.02], DARK);
    const dep = out(yc) - deepIn;
    k.mesh(g, spandrels(2 * aw, yc - ys, dep, aw), ASHLAR, [0, ys, deepIn + dep / 2]);
    const ring = new THREE.Group();
    ring.position.set(0, ys, out(ys));
    ring.rotation.x = -Math.atan(B);
    g.add(ring);
    archRing(k, ring, 0, 0, 0, 2 * aw, yc - ys, { rise: aw, n: 3, t: 0.34, p: 0.12, dep: 0.1, jamb: true });
    // The spout: a channel stone over two corbels, its lip standing out over the face's foot.
    const lip = out(0) + 0.5, z0 = out(ys) - 0.3;
    cb(k, g, [2 * aw + 0.5, 0.26, lip - z0], [0, ys - 0.13, (z0 + lip) / 2], DRESS, undefined, 0.03);
    for (const sx of [-1, 1]) for (const [y, d] of [[ys - 0.26, 0.9], [ys - 0.62, 0.5]]) cb(k, g, [0.34, 0.36, d], [sx * (aw + 0.05), y - 0.18, out(y) + d / 2 - 0.15], DRESS, undefined, 0.03);
    // The cornice under the terrace's parapet round the three faces, and the deep base course at the foot.
    const round3 = (off: number, z: number) => [new THREE.Vector2(-hw - off, z), new THREE.Vector2(-hw - off, off), new THREE.Vector2(hw + off, off), new THREE.Vector2(hw + off, z)];
    k.mesh(g, laidBand(round3(out(top - 0.4) + 0.17, back + 0.4), 0.55, 0.4, 1.0, 11), DRESS, [0, top - 0.4, 0]);
    // A string course round the faces at half their height, a course of the dressed stone standing proud.
    const sc = Math.round(H / 2 / COURSE) * COURSE;
    k.mesh(g, laidBand(round3(out(sc) + 0.12, back + 0.4), 0.45, COURSE, 1.0, 13), DRESS, [0, sc, 0]);
    deep(k.mesh(g, laidBand(round3(out(0) + 0.05, back + 0.4), 0.5, BASE_COURSE, 2.0, 12), BASE, [0, 0, 0]));
  },
  /**
   * The bridge over the moat (along local Z from `opt.z0` to `opt.z1`, `opt.hw` either side of its
   * middle), from the moat's bed (y = 0) to its deck (`opt.deck`): one mass of the castle's stone pierced
   * by its round arches (`opt.arches`, each [z0, z1], springing at `opt.spring`) either side of the pier
   * between them, a ring of voussoirs round each arch on both faces, pointed cutwaters with sloping caps
   * at the pier's two ends, a string course along both faces under the parapets and the deck paved in
   * the castle's paving.
   */
  castle_bridge: (k, g, arg) => {
    const o = { hw: 2.95, z0: -4, z1: 4, arches: [[-3, -1], [0, 2]], spring: 2.7, deck: 4.5, ...arg?.opt } as { hw: number; z0: number; z1: number; arches: number[][]; spring: number; deck: number };
    const { hw, deck: D, spring: S } = o, shape = new THREE.Shape();
    shape.moveTo(o.z0, 0);
    for (const [a, b] of o.arches) {
      const R = (b - a) / 2, c = (a + b) / 2;
      shape.lineTo(a, 0);
      shape.lineTo(a, S);
      for (let i = 1; i < 16; i++) {
        const t = Math.PI - (Math.PI * i) / 16;
        shape.lineTo(c + R * Math.cos(t), S + R * Math.sin(t));
      }
      shape.lineTo(b, S);
      shape.lineTo(b, 0);
    }
    shape.lineTo(o.z1, 0);
    shape.lineTo(o.z1, D);
    shape.lineTo(o.z0, D);
    shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, { depth: 2 * hw, bevelEnabled: false, curveSegments: 1 });
    body.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)).translate(hw, 0, 0);
    body.computeVertexNormals();
    // (For the geometry audit: the abutments and the piers between the arches, and the spandrels over each arch's crown.)
    const ends = [o.z0, ...o.arches.flat(), o.z1];
    body.userData.boxes = [
      ...Array.from({ length: ends.length / 2 }, (_, i) => [-hw, 0, ends[2 * i], hw, D, ends[2 * i + 1]]),
      ...o.arches.map(([a, b]) => [-hw, S + (b - a) / 2, a, hw, D, b]),
    ];
    k.mesh(g, body, ASHLAR, [0, 0, 0]);
    for (const sx of [-1, 1]) {
      // The voussoirs round each arch, flush on both faces.
      const face = new THREE.Group();
      face.position.set(sx * hw, 0, 0);
      face.rotation.y = (sx * Math.PI) / 2;
      g.add(face);
      for (const [a, b] of o.arches) archRing(k, face, -sx * ((a + b) / 2), S, 0, b - a, (b - a) / 2, { rise: (b - a) / 2, n: 4, t: 0.3, p: 0.1, dep: 0.1 });
      // A cutwater at this end of each pier, pointing into the stream, its cap sloping up to the face.
      const yt = S + 0.2, x0 = sx * hw, x1 = sx * (hw + 1.0);
      for (let i = 0; i + 1 < o.arches.length; i++) {
        const p0 = o.arches[i][1], p1 = o.arches[i + 1][0], c = (p0 + p1) / 2;
        k.mesh(g, hull([[x0, 0, p0], [x0, 0, p1], [x1, 0, c], [x0, yt, p0], [x0, yt, p1], [x1, yt, c], [x0, yt + 0.7, c]]), ASHLAR, [0, 0, 0]);
      }
      // The string course along the face under the parapet.
      cb(k, g, [0.24, COURSE, o.z1 - o.z0], [sx * (hw + 0.02), D - COURSE / 2, (o.z0 + o.z1) / 2], DRESS, undefined, 0.03);
    }
    // The deck: the castle's paving between the parapets, a hair over the stone it lies on.
    paved(k.box(g, [2 * hw - 1.8, 0.04, o.z1 - o.z0], [0, D - 0.008, (o.z0 + o.z1) / 2], PAVE));
  },
  /**
   * A banner pole on a dressed stone plinth: a tall navy pole with a gold finial and a crossbar, the
   * lord's banner hanging from it on both faces (toward ±Z).
   */
  banner_pole: (k, g) => {
    cb(k, g, [0.56, 0.5, 0.56], [0, 0.25, 0], DRESS, undefined, 0.04);
    cb(k, g, [0.14, 6.6, 0.14], [0, 3.8, 0], LAMP_NAVY, undefined, 0.02);
    k.mesh(g, new THREE.OctahedronGeometry(0.16, 1), PAL.gold, [0, 7.22, 0]);
    for (const r of [0, Math.PI]) {
      const side = new THREE.Group();
      side.rotation.y = r;
      g.add(side);
      livery(k, side, 0, 6.6, 0.1, 1.0, 2.6);
    }
  },
};

export const APPROACH_PROPS: Record<string, Builder> = {
  ...CLIMB_PROPS,
  ...GATE_FRONT_PROPS,
  /**
   * A low stone parapet along local X (`arg` = length): a solid breast wall on a weathered base
   * course under a dressed coping, all the castle's stone, standing straight on the rock's lip (no
   * built footing under it: the rock masses rise to meet the road; worldView).
   */
  parapet: (k, g, arg) => {
    const L = Math.max(2, arg ?? 6);
    cb(k, g, [L + 0.2, 0.24, 0.9], [0, 0.12, 0], BASE, undefined, 0.04);
    cb(k, g, [L, 0.62, 0.62], [0, 0.55, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [L + 0.12, 0.14, 0.78], [0, 0.93, 0], DRESS, undefined, 0.03);
  },
  /**
   * An open balustrade along local X, `len` long (its outer face toward +Z like the parapet's): a
   * plinth running down into the rock, turned balusters of pale stone, a dressed handrail.
   */
  balustrade: (k, g, arg) => {
    // Open: slender pale balusters well apart under a narrow slate rail, so the drop and the sky show
    // through between them from the play camera.
    // (A narrow plinth and rail, so from above the pale balusters and the gaps between them show.)
    const L = Math.max(1, lenOf(arg) ?? 4);
    k.mesh(g, taper(L + 0.1, 1.0, L + 0.1, 0.34, 2.4, 0, -0.33), ASHLAR_W, [0, -1.2, 0.33]);
    cb(k, g, [L + 0.1, 0.16, 0.34], [0, 0.08, 0], DRESS, undefined, 0.03);
    const n = Math.max(2, Math.round(L / 0.42));
    for (let i = 0; i < n; i++) {
      const u = -L / 2 + (L * (i + 0.5)) / n;
      k.cyl(g, 0.07, 0.1, 0.66, [u, 0.49, 0], ASHLAR_L, undefined, 8);
      k.mesh(g, new THREE.IcosahedronGeometry(0.13, 0), ASHLAR_L, [u, 0.4, 0]);
    }
    cb(k, g, [L + 0.12, 0.1, 0.18], [0, 0.87, 0], DRESS, undefined, 0.02);
  },
  ramp_wall: (k, g, arg) => {
    // (`opt.w`: how thick its foot is, 0.62 by default; a wall standing over a whole cell's width is
    // a cell thick, so no ground under it shows either side.)
    const o = (arg?.opt ?? {}) as { pts?: number[][]; ys?: number[]; tops?: number[]; w?: number };
    const wf = o.w ?? 0.62;
    const pts = (o.pts ?? [[-2, 0], [2, 0]]).map(([x, z]) => new THREE.Vector2(x, z)), ys = o.ys ?? pts.map(() => 0);
    // (Its coping stands 0.76 over the road, or level with higher ground behind it (`opt.tops`), so
    // the bank it holds back meets its top.)
    const tops = o.tops ?? ys.map((y) => y + 0.76);
    const at = (dy: number) => ys.map((y) => y + dy), top = (dy: number) => tops.map((y) => y + dy);
    // (Its weathered foot runs straight down into the ground under it, never out to one side, so
    // nothing of it shows through the rock beside the road.)
    k.mesh(g, slopedBand(pts, at(-5.0), at(0.4), wf), BASE, [0, 0, 0]);
    k.mesh(g, slopedBand(pts, at(0.38), top(-0.1), wf - 0.14), ASHLAR, [0, 0, 0]);
    k.mesh(g, slopedBand(pts, top(-0.12), tops, wf - 0.02), DRESS, [0, 0, 0]);
  },
  /**
   * A pier closing the end of a parapet run: a square shaft of the castle's cream on a weathered
   * base, a moulded dressed cap and a low pyramid of stone on top.
   */
  parapet_pier: (k, g, arg) => {
    // `v`: 0 a low stone pyramid on top, 1 a small urn with a gilt cap, 2 a lantern.
    const v = vOf(arg), z = 0;
    // (Its base course at the parapet's own height, standing on the ground: nothing of it hangs
    // below, down a cliff face.)
    cb(k, g, [1.2, 0.24, 1.2], [0, 0.12, z], BASE, undefined, 0.03);
    cb(k, g, [0.95, 1.0, 0.95], [0, 0.72, z], ASHLAR, undefined, 0.04);
    cb(k, g, [1.15, 0.16, 1.15], [0, 1.26, z], DRESS, undefined, 0.03);
    if (v === 1) {
      k.mesh(g, taper(0.26, 0.26, 0.4, 0.4, 0.14), ASHLAR_L, [0, 1.41, z]);
      k.mesh(g, taper(0.4, 0.4, 0.7, 0.7, 0.42), ASHLAR_L, [0, 1.69, z]);
      cb(k, g, [0.76, 0.08, 0.76], [0, 1.94, z], DRESS, undefined, 0.02);
      ball(k, g, 0.3, [0, 2.12, z], 0x4a7a34);
      k.mesh(g, new THREE.OctahedronGeometry(0.1, 1), PAL.gold, [0, 2.48, z]);
    } else if (v === 2) {
      cb(k, g, [0.42, 0.08, 0.42], [0, 1.38, z], LAMP_NAVY, undefined, 0.02);
      k.box(g, [0.32, 0.42, 0.32], [0, 1.64, z], 0xffcf86, undefined, 0xffa038, 1.4);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.05, 0.46, 0.05], [dx * 0.17, 1.64, z + dz * 0.17], LAMP_NAVY);
      k.mesh(g, taper(0.5, 0.5, 0.1, 0.1, 0.22), LAMP_NAVY, [0, 1.96, z]);
      k.mesh(g, new THREE.OctahedronGeometry(0.08, 1), PAL.gold, [0, 2.14, z]);
    } else k.mesh(g, taper(0.95, 0.95, 0.12, 0.12, 0.42), ASHLAR_L, [0, 1.55, z]);
  },
  /**
   * A round paved terrace of radius `len` (its threshold toward +Z): flagstones laid radially in two
   * rings round a round centre stone, flush on a dark bed, a kerb all round broken only for a pale
   * threshold stone where a path comes in.
   */
  round_terrace: (k, g, arg) => {
    const R = lenOf(arg) ?? 2.2, r0 = R * 0.3, r1 = R * 0.64, r2 = R - 0.3;
    // (Laid flush with the ground round it, so whatever stands on it stands on its stones.)
    k.cyl(g, R - 0.25, R - 0.25, 0.05, [0, -0.07, 0], FLAG_D, undefined, 32);
    k.cyl(g, r0 - 0.03, r0 - 0.03, 0.08, [0, -0.04, 0], ASHLAR_L, undefined, 12);
    // Each flagstone cut to its sector of the ring, a fine joint between it and the next.
    for (const [ra, rb, n, off] of [[r0, r1, 8, 0], [r1, r2, 14, 0.5]] as const) {
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * Math.PI * 2, da = Math.PI / n - 0.012 / ((ra + rb) / 2);
        const arcPts = Array.from({ length: 5 }, (_, j) => a + da - (2 * da * j) / 4);
        const outline = [new THREE.Vector2(Math.sin(a - da) * (ra + 0.012), Math.cos(a - da) * (ra + 0.012)), ...arcPts.reverse().map((t) => new THREE.Vector2(Math.sin(t) * (rb - 0.012), Math.cos(t) * (rb - 0.012))), new THREE.Vector2(Math.sin(a + da) * (ra + 0.012), Math.cos(a + da) * (ra + 0.012))];
        k.mesh(g, flatSlab(outline, 0.08), (i + n) % 3 ? FLAG : FLAG_D, [0, -0.08, 0]);
      }
    }
    // The kerb all round in one curved piece, open only for the threshold stone where the path comes in.
    const rk = R - 0.12;
    {
      const a0 = 0.32, kp = Array.from({ length: 41 }, (_, j) => a0 + ((Math.PI * 2 - 2 * a0) * j) / 40).map((t) => new THREE.Vector2(Math.sin(t) * rk, Math.cos(t) * rk));
      k.mesh(g, laidBand(kp, 0.3, 0.12, 0.6, 3), KERB, [0, -0.06, 0]);
    }
    cb(k, g, [1.3, 0.08, 0.42], [0, -0.04, rk], ASHLAR_L, undefined, 0.03);
  },
  /** A plain stone bench (facing +Z): a thick slab seat on two blocks, in the castle's stone. */
  stone_bench: (k, g) => {
    for (const x of [-0.65, 0.65]) cb(k, g, [0.32, 0.42, 0.46], [x, 0.21, 0], ASHLAR_W, undefined, 0.04);
    cb(k, g, [1.8, 0.14, 0.56], [0, 0.49, 0], ASHLAR_L, undefined, 0.03);
  },
};
