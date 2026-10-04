import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CASTLE, CX, gateTowers, type HubPlan, type Mass, OUTWARD, RISER, stairRects, TREAD, WALL } from './plan';

/**
 * The hub layouts' plain volumes (dev only): each station's building as walls, a plinth, a door,
 * windows and a roof at true size; the castle on its rock; the town wall; the castle stair, tread by
 * tread with its parapets. Flat colours from the kit's own palette: these are a blockout of where
 * things stand and how big they are, not the buildings themselves.
 */

type Floor = (x: number, z: number) => number;

const COLOUR = {
  stone: 0xdcc9a1, plinth: 0xa99e88, plaster: 0xf0e7d6, clay: 0x8c503e, slate: 0x46597e, door: 0x7a4026, window: 0x2c2b30,
  castle: 0xe4d6b4, castleRoof: 0x3d5688, stair: 0xcdbf9f, wall: 0xd8c8a6, chimney: 0x8e7f6c,
} as const;
type Tone = keyof typeof COLOUR;

/** Geometry collected by colour, merged into one mesh per colour. */
class Parts {
  private readonly by = new Map<Tone, THREE.BufferGeometry[]>();
  add(tone: Tone, geo: THREE.BufferGeometry) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    const list = this.by.get(tone);
    if (list) list.push(g);
    else this.by.set(tone, [g]);
  }
  /** A box `size` (x, y, z) with its foot's middle at `at`, turned by `rot` about its middle. */
  box(tone: Tone, size: [number, number, number], at: THREE.Vector3, rot = 0) {
    const g = new THREE.BoxGeometry(...size).translate(0, size[1] / 2, 0);
    if (rot) g.rotateY(rot);
    this.add(tone, g.translate(at.x, at.y, at.z));
  }
  group() {
    const out = new THREE.Group();
    for (const [tone, list] of this.by) {
      const mesh = new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({ color: COLOUR[tone], roughness: 0.9 }));
      mesh.castShadow = mesh.receiveShadow = true;
      out.add(mesh);
      for (const g of list) g.dispose();
    }
    return out;
  }
}

/** A gable roof over a w × d plan (ridge along the longer side), its eaves at y; or a hipped roof. */
function roof(kind: 'gable' | 'hip', w: number, d: number, pitch: number, eaves = 0.45): THREE.BufferGeometry {
  const along = w >= d, len = (along ? w : d) + eaves * 2, span = (along ? d : w) + eaves * 2, rise = (span / 2) * Math.tan(pitch);
  if (kind === 'hip') {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    return g.scale(w + eaves * 2, rise, d + eaves * 2);
  }
  const L = len / 2, S = span / 2;
  // Two slopes and two gables, the ridge along x, then turned if the plan runs along z.
  const p = [
    [-L, 0, S], [L, 0, S], [L, rise, 0], [-L, 0, S], [L, rise, 0], [-L, rise, 0],
    [L, 0, -S], [-L, 0, -S], [-L, rise, 0], [L, 0, -S], [-L, rise, 0], [L, rise, 0],
    [-L, 0, -S], [-L, 0, S], [-L, rise, 0], [L, 0, S], [L, 0, -S], [L, rise, 0],
  ].flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  if (!along) g.rotateY(Math.PI / 2);
  return g;
}

/** A station's building: plinth, walls, door and windows on every side, roof, chimney. */
function building(parts: Parts, m: Mass, floor: Floor) {
  const { box: b } = m, w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  let y = Infinity;
  for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1], [cx, cz]]) y = Math.min(y, floor(x, z));
  const base = new THREE.Vector3(cx, y - 0.4, cz);
  parts.box('plinth', [w + 0.2, 0.94, d + 0.2], base);
  parts.box(m.walls, [w, m.wall + 0.4, d], base);
  const top = base.clone().setY(y + m.wall);
  parts.add(m.tiles, roof(m.roof, w, d, m.roof === 'hip' ? 0.6 : 0.68).translate(top.x, top.y, top.z));
  if (m.chimney) parts.box('chimney', [1.35, Math.min(w, d) * 0.5 + 2.2, 0.9], new THREE.Vector3(w >= d ? b.x0 + 1.4 : cx + w / 4, y + m.wall - 0.5, w >= d ? cz : b.z0 + 1.4));
  // Each side: its door (the front's, wide for the smithy's forge) and a row of windows on each storey.
  for (const f of ['S', 'E', 'N', 'W'] as const) {
    const o = OUTWARD[f], len = o.x ? d : w, rot = o.x ? Math.PI / 2 : 0;
    const face = (t: number, h: number) => new THREE.Vector3(o.x ? (o.x > 0 ? b.x1 : b.x0) : b.x0 + t, y + h, o.z ? (o.z > 0 ? b.z1 : b.z0) : b.z0 + t);
    const doorW = m.wall < 5 ? 3.6 : 2.25;
    if (f === m.face) parts.box('door', [doorW, Math.min(3.06, m.wall - 0.6), 0.3], face(len / 2, 0.1), rot);
    for (let sill = 1.1; sill + 1.35 < m.wall - 0.4; sill += 3.24) for (let t = 2.25; t < len - 1.5; t += 2.7) {
      if (f === m.face && sill < 3 && Math.abs(t - len / 2) < doorW / 2 + 0.9) continue;
      parts.box('window', [0.9, 1.35, 0.24], face(t, sill), rot);
    }
  }
}

/** The castle on the rock: curtain walls, corner and gate towers, the great keep with its slate roof. */
function castle(parts: Parts, rockTop: number) {
  const b = CASTLE, t = 2.7, h = 9.72, y = rockTop - 1.5, at = (x: number, z: number) => new THREE.Vector3(x, y, z);
  const gate = 5.4, w = b.x1 - b.x0, d = b.z1 - b.z0;
  parts.box('castle', [w, h + 1.5, t], at(CX, b.z0 + t / 2));
  parts.box('castle', [t, h + 1.5, d], at(b.x0 + t / 2, (b.z0 + b.z1) / 2));
  parts.box('castle', [t, h + 1.5, d], at(b.x1 - t / 2, (b.z0 + b.z1) / 2));
  for (const k of [-1, 1]) parts.box('castle', [w / 2 - gate / 2, h + 1.5, t], at(CX + k * (w / 4 + gate / 4), b.z1 - t / 2));
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) parts.box('castle', [7.2, 15.5, 7.2], at(x, z));
  for (const k of [-1, 1]) parts.box('castle', [5.4, 14.5, 6.3], at(CX + k * (gate / 2 + 2.7), b.z1));
  parts.box('castle', [gate, h - 5.4, t], at(CX, b.z1 - t / 2).setY(rockTop + 5.4));
  parts.box('castle', [16.2, 27.4, 16.2], at(CX, 16));
  parts.add('castleRoof', roof('hip', 16.2, 16.2, 0.95, 0.6).translate(CX, y + 27.4, 16));
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) parts.add('castleRoof', roof('hip', 7.2, 7.2, 1.05, 0.45).translate(x, y + 15.5, z));
}

/** The castle stair: each tread solid to the ground, a parapet either side, the landings level. */
function stair(parts: Parts, plan: HubPlan, floor: Floor) {
  const y0 = floor(plan.stair.foot.x, plan.stair.foot.z);
  for (const r of stairRects(plan.stair)) {
    const o = OUTWARD[r.dir], len = o.x ? r.x1 - r.x0 : r.z1 - r.z0, width = o.x ? r.z1 - r.z0 : r.x1 - r.x0, rot = o.x ? Math.PI / 2 : 0;
    // (Along the leg from its foot: `s` metres in, `n` across from its middle.)
    const start = { x: o.x > 0 ? r.x0 : o.x < 0 ? r.x1 : (r.x0 + r.x1) / 2, z: o.z > 0 ? r.z0 : o.z < 0 ? r.z1 : (r.z0 + r.z1) / 2 };
    const at = (s: number, n: number, y: number) => new THREE.Vector3(start.x + o.x * s - o.z * n, y, start.z + o.z * s + o.x * n);
    const steps = r.flight ? Math.round((r.top1 - r.top0) / RISER) : 1, run = r.flight ? TREAD : len;
    for (let i = 0; i < steps; i++) {
      const top = r.top0 + (r.flight ? (i + 1) * RISER : 0), s = i * run + run / 2, foot = y0 - 0.6;
      parts.box('stair', [width, top - (foot - y0), run], at(s, 0, foot), rot);
      for (const k of [-1, 1]) parts.box('stone', [0.45, top + 0.95 - (foot - y0), run], at(s, k * (width / 2 + 0.225), foot), rot);
    }
  }
}

/** The town wall: its four sides open at the gates, a walk over each gate, the towers. */
function townWall(parts: Parts, plan: HubPlan, floor: Floor) {
  const w = plan.wall;
  if (!w) return;
  const b = w.box, t = WALL.thick, h = 7.02, gap = WALL.gate;
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    let y = Infinity;
    for (let s = 0; s <= 1; s += 0.1) y = Math.min(y, floor(x0 + (x1 - x0) * s, z0 + (z1 - z0) * s));
    parts.box('wall', [Math.max(x1 - x0, t), h + 1, Math.max(z1 - z0, t)], new THREE.Vector3((x0 + x1) / 2, y - 1, (z0 + z1) / 2));
  };
  const side = (a: number, b2: number, fixed: number, horizontal: boolean) => {
    const cuts = w.gates.filter((g) => (horizontal ? Math.abs(g.z - fixed) < 0.01 : Math.abs(g.x - fixed) < 0.01)).map((g) => (horizontal ? g.x : g.z)).sort((p, q) => p - q);
    let from = a;
    for (const c of [...cuts, Infinity]) {
      const to = Math.min(c - gap / 2, b2);
      const lineA = horizontal ? (fixed === b.z0 ? b.z0 : b.z1 - t) : fixed === b.x0 ? b.x0 : b.x1 - t;
      if (horizontal) run(from, lineA, to, lineA + t);
      else run(lineA, from, lineA + t, to);
      if (c !== Infinity) {
        // The walk carried over the gate on a lintel 5.4 m clear.
        const y = floor(horizontal ? c : lineA + t / 2, horizontal ? lineA + t / 2 : c);
        parts.box('wall', horizontal ? [gap, h - 5.4, t] : [t, h - 5.4, gap], new THREE.Vector3(horizontal ? c : lineA + t / 2, y + 5.4, horizontal ? lineA + t / 2 : c));
      }
      from = c + gap / 2;
    }
  };
  side(b.x0, b.x1, b.z0, true);
  side(b.x0, b.x1, b.z1, true);
  side(b.z0, b.z1, b.x0, false);
  side(b.z0, b.z1, b.x1, false);
  for (const p of [...w.towers, ...gateTowers(w)]) parts.box('wall', [p.s, 10.26 + 1, p.s], new THREE.Vector3(p.x, floor(p.x, p.z) - 1, p.z));
}

/** Every plain volume of a plan, standing on the zone's ground (`floor`), the castle on the rock's top (`rockTop`). */
export function massing(plan: HubPlan, floor: Floor, rockTop: number) {
  const parts = new Parts();
  for (const m of plan.masses) building(parts, m, floor);
  castle(parts, rockTop);
  stair(parts, plan, floor);
  townWall(parts, plan, floor);
  return parts.group();
}
