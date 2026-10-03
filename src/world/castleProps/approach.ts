/** The castle's approach: its parapets, balustrades, ramp walls and paving, terrace and bench. */
import * as THREE from 'three';
import { PAL } from '../../render/kit';
import { taper } from '../../render/blocks';
import { type Builder, ASHLAR, ASHLAR_L, ASHLAR_W, ball, BASE, cb, DRESS, KERB, laidBand, LAMP_NAVY, lenOf, vOf } from '../props';

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

export const APPROACH_PROPS: Record<string, Builder> = {
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
