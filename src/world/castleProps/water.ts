/**
 * The castle's water: the moat's masonry (its dressed outer bank and the plinths the walls and towers
 * rise from it on), the springs that feed it, the sluice and the fall from the outfall that drain it,
 * the falls off the brink, reeds and stream stones.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type V3 } from '../../render/kit';
import { hash01 } from '../../render/blocks';
import { drumStones } from '../../render/masonry';
import { crossedRibbons, fallingWaterMaterial, mistTexture, pour } from '../water';
import { type Builder, ASHLAR, ball, BASE, BASE_COURSE, brokenFoam, cb, chunk, deep, DRESS, drum, IRON, laidBand, lenOf, limb, ROCK_WET, softDisc, WOOD, WOOD_D } from '../props';
import { slopedBand } from './approach';

/**
 * A broken ring of foam spreading from where water lands (radius 1, scaled as it spreads): a few
 * arcs of soft blobs with gaps between them, wandering in and out a little, never a clean circle.
 */
const ringCache2 = new Map<number, THREE.BufferGeometry>();

export function foamArcs(seed: number) {
  let geo = ringCache2.get(seed);
  if (geo) return geo;
  const parts: THREE.BufferGeometry[] = [];
  let t = hash01(seed, 0) * Math.PI * 2;
  for (let arcN = 0; arcN < 4; arcN++) {
    const span = 0.5 + hash01(seed, arcN, 1) * 0.9, n = Math.round(span * 7);
    for (let i = 0; i < n; i++) {
      const a = t + (span * i) / n, rr = 1 + (hash01(seed, arcN, i) - 0.5) * 0.16;
      const blob = softDisc(seed * 17 + arcN * 7 + i, 0.09 + hash01(seed, i, arcN + 5) * 0.07, [0.92, 0.96, 0.97], 0.55 + 0.3 * hash01(seed, arcN, i + 9));
      parts.push(blob.clone().translate(Math.cos(a) * rr, 0, Math.sin(a) * rr));
    }
    t += span + 0.35 + hash01(seed, arcN, 3) * 0.6;
  }
  geo = mergeGeometries(parts)!;
  ringCache2.set(seed, geo);
  return geo;
}

const ROCK = 0x5e6572, ROCK_D = 0x4e5462, MOSS = [0x5a7a34, 0x66863a, 0x4e6e30];
/** The dark of an opening's depths (a culvert, a spout, the shade under an arch). */
const DEPTHS = 0x0c1216;

/**
 * The moat's props share one frame: their origin on the moat's bed (the masonry's foot), `h` up to
 * the crown's turf and `wl` up to the water. `pts` lays a run along a line (the water on its left,
 * as slopedBand reads left), `batter` how far a plinth leans out per metre down.
 */
interface MoatOpt {
  h: number;
  wl: number;
  pts?: number[][];
  top?: number;
  coping?: number;
  batter?: number;
  r?: number;
  out?: number[];
  depth?: number;
}
const moatOpt = (arg: unknown) => ((arg as { opt?: MoatOpt } | undefined)?.opt ?? { h: 4, wl: 2 }) as MoatOpt;

/** An unlit material for a soft, see-through stain or shade (no shadow, never dissolved). */
function decalMat(color = 0xffffff) {
  const m = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, depthWrite: false });
  m.userData.decal = m.userData.noOcclude = true;
  return m;
}

/**
 * The wet line on stone standing in still water: a dark band of damp and weed from just under the
 * surface to a hand's breadth over it, fading out upward, uneven along the face. `at(u, y)` gives the
 * point on the face (u from 0 to 1 along it, y the height in the prop) and `len` its length.
 */
function wetBand(g: THREE.Object3D, at: (u: number, y: number) => THREE.Vector3, len: number, wl: number, seed: number) {
  const n = Math.max(2, Math.ceil(len / 0.6)), rows: [number, number][] = [[wl - 0.45, 0.3], [wl, 0.5], [wl + 0.18, 0.34], [wl + 0.5, 0.12], [wl + 0.8, 0]];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, wob = hash01(seed, i) * 0.22, k = 0.75 + 0.5 * hash01(seed, i, 3);
    rows.forEach(([y, a], r) => {
      const p = at(u, y + (r >= 2 ? wob : 0));
      pos.push(p.x, p.y, p.z);
      col.push(0.13, 0.16, 0.1, Math.min(0.7, a * k));
    });
  }
  const R = rows.length;
  for (let i = 0; i < n; i++) for (let r = 0; r < R - 1; r++) {
    const a = i * R + r, b = a + R;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, decalMat());
  m.material.side = THREE.DoubleSide;
  m.name = 'wet-line';
  m.renderOrder = 2;
  g.add(m);
}

/** Each point's offset to the left of a polyline (mitred at its bends, as slopedBand lays them). */
function mitres(pts: THREE.Vector2[]) {
  const n = pts.length, dir = (i: number) => pts[i + 1].clone().sub(pts[i]).normalize();
  const left = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  return pts.map((_, i) => {
    if (i === 0) return left(dir(0));
    if (i === n - 1) return left(dir(n - 2));
    const m = left(dir(i - 1)).add(left(dir(i))).normalize();
    return m.divideScalar(Math.max(0.35, m.dot(left(dir(i)))));
  });
}

/** A point along a polyline (u from 0 to 1 by length) set `off` to its left. */
function along(pts: THREE.Vector2[], u: number, off: number) {
  const m = mitres(pts), lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = lens[lens.length - 1] * u;
  let i = 0;
  while (i < pts.length - 2 && lens[i + 1] < L) i++;
  const f = (L - lens[i]) / Math.max(1e-6, lens[i + 1] - lens[i]);
  const p = pts[i].clone().lerp(pts[i + 1], f), mm = m[i].clone().lerp(m[i + 1], f);
  return p.addScaledVector(mm, off);
}

/**
 * Where falling water lands in still water: patches of churned foam heaving out of step, broken
 * arcs of foam spreading and fading, and a low mist rising off it. Returns its tick.
 */
function landing(g: THREE.Object3D, at: V3, r: number, seed: number, mistN = 5, drift = 0.5) {
  const foam: THREE.Mesh[] = [];
  for (const [dz, rr, n] of [[0, r, 18], [r * 0.5, r * 0.75, 12]] as const) {
    const f = new THREE.Mesh(brokenFoam(seed + foam.length, rr, n, 0.6), decalMat());
    f.position.set(at[0], at[1] + foam.length * 0.002, at[2] + dz);
    f.renderOrder = 3;
    f.name = 'foam';
    g.add(f);
    foam.push(f);
  }
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = decalMat();
    m.opacity = 0.5;
    const ring = new THREE.Mesh(foamArcs(seed + 10 + i), m);
    ring.position.set(at[0], at[1] + 0.004 + i * 0.002, at[2]);
    ring.rotation.y = i * 2.1;
    ring.name = 'foam-ring';
    ring.renderOrder = 3;
    g.add(ring);
    rings.push(ring);
  }
  const mist: THREE.Sprite[] = [];
  for (let i = 0; i < mistN; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: 0xeef6f8, transparent: true, depthWrite: false, opacity: 0.3 }));
    sp.name = 'spray';
    sp.renderOrder = 4;
    g.add(sp);
    mist.push(sp);
  }
  return (t: number) => {
    foam.forEach((f, i) => {
      f.scale.setScalar(0.9 + 0.15 * Math.sin(t * 3.3 + i * 1.9));
      f.rotation.y = 0.2 * Math.sin(t * 0.7 + i);
    });
    rings.forEach((ring, i) => {
      const p = (t * [0.31, 0.24, 0.37][i] + i * 0.37) % 1;
      ring.scale.setScalar(r * (0.8 + p * (1.8 + i * 0.35)));
      ring.position.z = at[2] + p * drift;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - p) * (1 - p) * Math.min(1, p * 5);
    });
    mist.forEach((sp, i) => {
      const p = (t * 0.25 + i / mist.length) % 1;
      sp.position.set(at[0] + Math.sin(i * 2.3) * r * 0.8, at[1] + 0.1 + p * r * 1.6, at[2] + Math.cos(i * 2.3) * r * 0.3);
      sp.scale.setScalar(r * (1.4 + p * 2.2));
      sp.material.opacity = 0.22 * Math.sin(p * Math.PI);
    });
  };
}

/** A sheet of falling water along `pts`, `w0` wide at its lip to `w1` at its foot (broad sheets flat, narrow ones crossed). */
function fallSheet(g: THREE.Object3D, time: { value: number }, pts: THREE.Vector3[], w0: number, w1: number, seed: number, fade = false) {
  const { geo, len } = crossedRibbons(pts, w0, w1, w1 > 1.4 ? 1 : 2);
  const fall = new THREE.Mesh(geo, fallingWaterMaterial(time, seed, len, w1, fade));
  fall.name = 'waterfall';
  fall.renderOrder = 2;
  g.add(fall);
}

/** Moss cushions draped over the top of a rock or a ledge: flat lobes run together, sunk into it. */
function cushion(k: Parameters<Builder>[0], g: THREE.Object3D, x: number, y: number, z: number, w: number, seed: number) {
  const n = Math.max(2, Math.round(w / 0.32));
  for (let i = 0; i < n; i++) {
    const u = x - w / 2 + (w * (i + 0.5)) / n + (hash01(seed, i, 4) - 0.5) * 0.12, r = 0.2 + hash01(seed, i) * 0.12;
    ball(k, g, r, [u, y - 0.04 + (hash01(seed, i, 2) - 0.6) * 0.06, z + (hash01(seed, i, 3) - 0.5) * 0.14], MOSS[Math.abs(i + seed) % 3], [1.5, 0.45, 1.2]);
  }
}

export const WATER_PROPS: Record<string, Builder> = {
  /** Reeds in a clump at the waterline: slim leaning blades, a few with brown cattail heads. */
  reeds: (k, g) => {
    for (let i = 0; i < 11; i++) {
      const a = hash01(i, 1) * Math.PI * 2, r = hash01(i, 2) * 0.6, h = 0.9 + hash01(i, 3) * 0.8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, lean = (hash01(i, 4) - 0.5) * 0.4;
      limb(k, g, [x, -0.1, z], [x + lean, h, z + lean * 0.6], [0.06, 0.04, 0.01, 0.01], i % 3 ? 0x5a7a34 : 0x6e8a3e);
      if (i % 4 === 0) cb(k, g, [0.08, 0.26, 0.08], [x + lean * 0.8, h * 0.82, z + lean * 0.5], 0x6a4a2a, [lean * 0.4, 0, 0], 0.02);
    }
  },
  /**
   * A rounded stone breaking a stream's surface (the water flowing toward +Z), a smaller one beside
   * it, and a short trail of broken foam drifting downstream from them.
   */
  stream_stone: (k, g, arg) => {
    const sd = Math.round((lenOf(arg) ?? 1) * 7);
    chunk(k, g, 980 + sd, [0.75, 0.62, 0.62], [0, -0.66, 0], 0x7a7470, hash01(sd, 1) * 3);
    chunk(k, g, 981 + sd, [0.42, 0.42, 0.38], [0.5 * (hash01(sd, 2) > 0.5 ? 1 : -1), -0.7, 0.25], 0x6a6466, hash01(sd, 3) * 3);
    const f = new THREE.Mesh(brokenFoam(200 + sd, 0.55, 6, 0.6), decalMat());
    f.position.set(0, -0.255, 0.55);
    f.scale.set(0.8, 1, 1.5);
    f.renderOrder = 3;
    g.add(f);
  },
  /**
   * Water spilling off the island's edge (flowing toward +Z): it curls over the lip in a widening
   * sheet and falls away into the Veil, fading as it drops, mist drifting up off it, a rock either
   * side of the lip.
   */
  edge_fall: (k, g) => {
    const time = { value: 0 };
    const pts = pour(new THREE.Vector3(0, -0.25, -0.6), new THREE.Vector3(0, -18, 4.5), 0.05, 30);
    const { geo, len } = crossedRibbons(pts, 2.2, 4.2);
    const fall = new THREE.Mesh(geo, fallingWaterMaterial(time, 83, len, 4.2, true));
    fall.name = 'waterfall';
    fall.renderOrder = 2;
    g.add(fall);
    for (const sx of [-1, 1]) chunk(k, g, 970 + sx, [0.9, 0.5, 0.8], [sx * 1.5, -0.35, -0.2], ROCK, sx);
    const mist: THREE.Sprite[] = [];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: 0xf2f4f8, transparent: true, depthWrite: false, opacity: 0.3 }));
      sp.name = 'spray';
      sp.renderOrder = 4;
      g.add(sp);
      mist.push(sp);
    }
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        mist.forEach((sp, i) => {
          const p = (t * 0.12 + i / mist.length) % 1;
          sp.position.set(Math.sin(i * 2.3) * 1.2, -3 - i * 2.2 + p * 2.5, 1.2 + i * 0.5);
          sp.scale.setScalar(2.5 + p * 3);
          sp.material.opacity = 0.32 * Math.sin(p * Math.PI);
        });
      },
    };
  },
  /**
   * The moat's outer bank (opt.pts along its face, the water on its left): dressed masonry founded on
   * the bed, laid in the castle's courses in its weathered stone, standing `depth` back into the bank
   * so the bank's earth never shows, up to `top`; with `coping`, a coping of dressed stones over it,
   * just proud of the turf behind and lipping a little over the water, otherwise flush with the
   * paving it carries (the ledge's wall stands on it). The wet line runs along it at the water.
   */
  moat_bank: (k, g, arg) => {
    const o = moatOpt(arg), pts = (o.pts ?? [[-2, 0], [2, 0]]).map(([x, z]) => new THREE.Vector2(x, z)), T = o.depth ?? 1.15, top = o.top ?? o.h;
    k.mesh(g, slopedBand(pts, pts.map(() => 0), pts.map(() => top), T, -T / 2), BASE, [0, 0, 0]);
    if (o.coping) {
      const lip = 0.1, w = T + lip, m = mitres(pts), mid = pts.map((p, i) => p.clone().addScaledVector(m[i], (lip - T) / 2));
      k.mesh(g, laidBand(mid, w, 0.14, 1.0, Math.floor(hash01(pts[0].x, pts[0].y) * 97)), DRESS, [0, top, 0]);
    }
    const L = pts.slice(1).reduce((a, p, i) => a + p.distanceTo(pts[i]), 0);
    wetBand(g, (u, y) => {
      const p = along(pts, u, 0.012);
      return new THREE.Vector3(p.x, y, p.y);
    }, L, o.wl, Math.floor(L * 13));
  },
  /**
   * The battered plinth a drum stands on in the moat (a tower's or a gate drum's, radius opt.r): a
   * drum of the deep base course's stones founded on the bed, leaning in at the base course's own
   * batter up to its foot (radius `len` at the turf), so the base course and the plinth read as one
   * battered foot rising out of the water; the same stones to a course as the drum above.
   */
  moat_plinth: (k, g, arg) => {
    const o = moatOpt(arg), rTop = lenOf(arg) ?? 3.7, b = o.batter ?? 0.35, n = drumStones(o.r ?? rTop - 0.5);
    const rFoot = rTop + b * o.h;
    // (Its top course turned half a stone on the base course standing on it: see laidDrum.)
    drum(k, g, { r: rFoot, rTop, y0: 0, y1: o.h, n, course: BASE_COURSE, turn: -Math.PI / n }, BASE);
    wetBand(g, (u, y) => {
      const a = u * Math.PI * 2, r = rFoot - b * y + 0.03;
      return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
    }, Math.PI * 2 * rTop, o.wl, Math.round(rTop * 31));
  },
  /**
   * The battered plinth along the outer face of a run of the curtain standing in the moat (opt.pts:
   * the line of its base course's face at the turf, `out` the way it faces): a band of the deep base
   * course's stones from the bed, leaning out `batter` per metre down from that face.
   */
  moat_plinth_run: (k, g, arg) => {
    const o = moatOpt(arg), pts = (o.pts ?? [[-2, 0], [2, 0]]).map(([x, z]) => new THREE.Vector2(x, z)), b = o.batter ?? 0.4;
    const d = pts[1].clone().sub(pts[0]).normalize(), out = o.out ?? [0, 1], s = Math.sign(-d.y * out[0] + d.x * out[1]) || 1;
    const reach = b * o.h, W = reach + 0.9;
    deep(k.mesh(g, slopedBand(pts, [0, 0], [o.h, o.h], W, s * (reach - W / 2), -s * reach), BASE, [0, 0, 0]));
    wetBand(g, (u, y) => {
      const p = along(pts, u, s * (reach - b * y + 0.012));
      return new THREE.Vector3(p.x, y, p.y);
    }, pts[0].distanceTo(pts[1]), o.wl, Math.round(pts[0].x * 7 + pts[0].y));
  },
  /**
   * A spring spilling into the moat from the outer bank (facing +Z, the bank's face at z = 0): an arched
   * spout in the dressed bank, its voussoirs under the coping, dark inside, a lip stone the water
   * pours from into the moat in a short fall with foam spreading from it; over it on the rim the rock
   * it rises in breaks through the turf, mossy, in a cleft with ferns.
   */
  moat_spring: (k, g, arg) => {
    const o = moatOpt(arg), H = o.h, T = o.depth ?? 1.05, hw = 1.0, ow = 0.6, sill = o.wl + 0.85, spring = sill + 0.3, time = { value: 0 };
    const s = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(hw, H), new THREE.Vector2(-hw, H)]);
    const hole = new THREE.Path();
    hole.moveTo(-ow, sill);
    hole.lineTo(ow, sill);
    for (let i = 0; i <= 10; i++) hole.lineTo(Math.cos((Math.PI * i) / 10) * ow, spring + Math.sin((Math.PI * i) / 10) * ow);
    hole.closePath();
    s.holes.push(hole);
    const wall = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -T);
    wall.computeVertexNormals();
    wall.userData.boxes = [[-hw, 0, -T, -ow, H, 0], [ow, 0, -T, hw, H, 0], [-ow, 0, -T, ow, sill, 0], [-ow, spring + ow, -T, ow, H, 0]];
    k.mesh(g, wall, BASE, [0, 0, 0]);
    // The voussoirs round the spout, standing a little proud, and its keystone under the coping.
    const nv = 7, tv = H - spring - ow - 0.01;
    for (let i = 0; i < nv; i++) {
      const a = (Math.PI * (i + 0.5)) / nv, key = i === 3, rr = ow + tv / 2;
      cb(k, g, [(Math.PI * rr) / nv - 0.02, tv, 0.32 + (key ? 0.04 : 0)], [Math.cos(a) * rr, spring + Math.sin(a) * rr, -0.1 + (key ? 0.02 : 0)], DRESS, [0, 0, a - Math.PI / 2], 0.02);
    }
    // The dark of the spout's throat, and the lip stone the water leaves over.
    const throat = new THREE.Mesh(new THREE.PlaneGeometry(ow * 2, spring + ow - sill).translate(0, (spring + ow + sill) / 2, -0.7), new THREE.MeshBasicMaterial({ color: DEPTHS }));
    throat.name = 'shade';
    g.add(throat);
    cb(k, g, [0.82, 0.16, 0.66], [0, sill - 0.08, 0.08], DRESS, undefined, 0.03);
    // The coping over the gap, carrying the bank's coping across.
    k.mesh(g, laidBand([new THREE.Vector2(-hw, (0.1 - T) / 2), new THREE.Vector2(hw, (0.1 - T) / 2)], T + 0.1, 0.14, 1.6, 31), DRESS, [0, H, 0]);
    // The fall from the lip and where it lands.
    fallSheet(g, time, pour(new THREE.Vector3(0, sill + 0.03, 0.25), new THREE.Vector3(0, o.wl - 0.04, 1.05), 0.12, 14), 0.62, 0.86, 61);
    const tick = landing(g, [0, o.wl + 0.01, 1.05], 0.7, 60, 3, 0.5);
    // The rock behind it on the rim: two rounded masses either side of a cleft and a broad one over
    // its head, moss over their crowns, the cleft dark and wet, ferns at its lip.
    for (const sx of [-1, 1]) {
      chunk(k, g, 1990 + sx, [1.5, 1.1, 1.6], [sx * 1.0, H - 0.35, -2.4], sx < 0 ? ROCK : ROCK_D, sx * 0.4);
      cushion(k, g, sx * 1.0, H + 0.68, -2.45, 0.9, 1990 + sx);
    }
    chunk(k, g, 1993, [2.4, 1.4, 1.5], [0, H - 0.4, -3.4], ROCK, 0.15);
    cushion(k, g, 0, H + 0.95, -3.45, 1.5, 1993);
    chunk(k, g, 1994, [0.7, 0.55, 0.9], [0, H - 0.3, -2.2], ROCK_WET, 0.1);
    for (const [x, z] of [[-0.45, -1.75], [0.5, -1.8], [-1.75, -2.1], [1.7, -2.0]]) ball(k, g, 0.2, [x, H + 0.04, z], MOSS[Math.abs(Math.round(x * 3)) % 3], [1.5, 0.5, 1.3]);
    return { obj: g, tick: (t) => ((time.value = t), tick(t)) };
  },
  /**
   * The sluice in the west arm's bank (facing the moat, +Z; the channel running back along -Z `len`
   * to the brink): two dressed piers either side of the channel's mouth, a stone sill across it at
   * the moat's level that the water slips over, the timber gate raised in the piers' grooves under a
   * headstock beam with its winding wheel, and foam drifting down the channel to the fall.
   */
  moat_sluice: (k, g, arg) => {
    const o = moatOpt(arg), H = o.h, L = lenOf(arg) ?? 4, cw = 1.0, pw = 0.5, T = 1.15;
    for (const sx of [-1, 1]) {
      cb(k, g, [pw, H + 0.6, T + 0.15], [sx * (cw + pw / 2), (H + 0.6) / 2, -T / 2 + 0.075], ASHLAR, undefined, 0.04);
      cb(k, g, [pw + 0.12, 0.16, T + 0.27], [sx * (cw + pw / 2), H + 0.68, -T / 2 + 0.075], DRESS, undefined, 0.03);
      // The gate's groove down the pier's face.
      cb(k, g, [0.06, H + 0.5 - o.wl, 0.12], [sx * (cw - 0.02), (H + 0.5 + o.wl) / 2, -0.5], 0x2a2420, undefined, 0.01);
    }
    cb(k, g, [cw * 2, o.wl - 0.02, T], [0, (o.wl - 0.02) / 2, -T / 2], ASHLAR, undefined, 0.03);
    // The gate, wound up clear of the water: planks on two iron straps.
    for (let i = 0; i < 5; i++) cb(k, g, [cw * 2 - 0.04, 0.24, 0.08], [0, o.wl + 0.75 + i * 0.25, -0.5], i % 2 ? WOOD : WOOD_D, undefined, 0.015);
    for (const sx of [-1, 1]) {
      cb(k, g, [0.08, 1.3, 0.1], [sx * 0.55, o.wl + 1.25, -0.44], IRON, undefined, 0.01);
      cb(k, g, [0.05, H + 0.95 - o.wl - 1.9, 0.05], [sx * 0.55, (H + 0.95 + o.wl + 1.9) / 2, -0.5], IRON, undefined, 0.01);
    }
    cb(k, g, [cw * 2 + pw * 2 + 0.2, 0.24, 0.32], [0, H + 0.88, -0.5], WOOD_D, undefined, 0.03);
    k.cyl(g, 0.38, 0.38, 0.1, [0, H + 1.38, -0.5], WOOD, [Math.PI / 2, 0, 0], 10);
    k.cyl(g, 0.06, 0.06, 0.5, [0, H + 1.18, -0.5], IRON, undefined, 6);
    // Water slipping over the sill and foam riding down the channel to the brink.
    const bits: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(brokenFoam(300 + i, 0.5, 7, 0.5), decalMat());
      f.scale.set(1.4, 1, 0.8);
      f.renderOrder = 3;
      f.name = 'foam';
      g.add(f);
      bits.push(f);
    }
    return {
      obj: g,
      tick: (t) => {
        bits.forEach((f, i) => {
          const p = (t * 0.22 + i / bits.length) % 1;
          f.position.set(Math.sin(i * 2.1 + t * 0.3) * 0.25, o.wl + 0.02, -0.2 - p * L);
          (f.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI);
        });
      },
    };
  },
  /**
   * The moat's water leaving the castle (facing +Z, `len` above the pool at y = 0): off the lip of the
   * spout under the culvert's arch in the bastion's face it pours as one broad fall into the pool,
   * churning foam that spreads in rings, a mist hugging the rock's foot. (`opt.w`: the culvert's width.)
   */
  moat_outfall: (_k, g, arg) => {
    const top = lenOf(arg) ?? 8.8, w = ((arg as { opt?: { w?: number } } | undefined)?.opt?.w ?? 2) - 0.1, time = { value: 0 };
    fallSheet(g, time, pour(new THREE.Vector3(0, top + 0.03, -0.1), new THREE.Vector3(0, -0.22, 1.8), 0.06, 26), w, w + 0.45, 72);
    const tick = landing(g, [0, -0.22, 1.8], 1.0, 80, 6, 0.7);
    return { obj: g, tick: (t) => ((time.value = t), tick(t)) };
  },
};
