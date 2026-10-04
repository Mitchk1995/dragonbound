import * as THREE from 'three';
import { CURTAIN_WALL } from '../../data/castle';
import { ModelKit, type V3 } from '../../render/kit';
import { cb } from './core';
import { archHeight, archRing, pointedArch } from './legacyCastleArches';
import { DOOR_CORE, DOOR_STAIN, DRESS, IRON } from './palette';

// The castle's doors: sizes by purpose, boarded leaves, ring handles.
// Legacy: replaced by the modular kit (src/world/kit) and deleted with the old building code.

/**
 * The castle's single door on a face at z (facing +Z), its sill at (x, y): a dressed ring of the
 * castle's stone round its pointed head and down its jambs, a threshold, and the one blue leaf set in
 * the reveal behind them.
 */
export function singleDoor(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  const { w: W, h } = DOORS.single, rise = Math.min(W * 0.866, h * 0.62);
  archRing(k, g, x, y, z, W, h, { n: 4, t: 0.3, p: 0.08, dep: 0.02, rise, jamb: true });
  cb(k, g, [W + 0.3, 0.1, 0.5], [x, y - 0.05, z + 0.1], DRESS, undefined, 0.02);
  // (The leaf stands on the face it is set in, inside the reveal its jambs and voussoirs make.)
  const d = new THREE.Group();
  d.position.set(x, y, z + 0.03);
  g.add(d);
  pointedDoor(k, d, W, h, rise, 'single', false, 0.06);
}

/** The hero stands about 2.1 tall in his helm (feet to crown): every door and its handle is sized to him. */
export const HERO_HEIGHT = 2.1;

/**
 * The castle's doors by purpose, one size for each purpose (`w` × `h` is one leaf: its width, and its
 * height to the point of its pointed head, or to the lintel under a gate's tympanum):
 * - `building`: every building's doorway, a pair of leaves meeting under a pointed arch 3 wide;
 * - `single`: one leaf under a pointed arch, the door of a tower onto its wall walk, of a stair tower
 *   and of the roof houses onto the leads;
 * - `great`: the great door of the hall.
 * Every leaf carries a ring handle at the hero's hand (`handle` over the sill). `walk` is where a
 * tower's doorway opens onto the curtain's wall walk: the walk's height and its middle's offset from
 * the wall's centre line toward the bailey.
 */
export const DOORS = {
  building: { w: 1.41, h: 4.91, rise: 1.77 },
  single: { w: 1.3, h: 3.0 },
  great: { w: 2.88, h: 5.2 },
  handle: 1.05,
  walk: { y: CURTAIN_WALL.walkY, off: CURTAIN_WALL.walkOff },
} as const;

/** Mark a mesh for the geometry audit (what it is, and the facts a rule needs). */
export function audit<T extends THREE.Object3D>(m: T, part: string, info?: Record<string, unknown>): T {
  m.userData.part = part;
  if (info) m.userData.audit = info;
  return m;
}

/**
 * The outline of a door leaf filling a pointed doorway `W` wide whose apex stands `h` above its sill,
 * the arch rising `rise` over its springing: `part` 0 the whole opening (one leaf), -1 / 1 its left or
 * right half (a pair, meeting on the centre line). Built across X, up Y from the sill, `dep` thick
 * and centred on z = 0.
 */
const leafCache = new Map<string, THREE.BufferGeometry>();
export function pointedLeaf(W: number, h: number, rise: number, part: -1 | 0 | 1, dep = 0.1) {
  const key = `${W},${h},${rise},${part},${dep}`;
  let g = leafCache.get(key);
  if (g) return g;
  const { arc } = pointedArch(W, h, 10, rise), hw = W / 2;
  const s = new THREE.Shape();
  if (part === 0) {
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    for (const [x, y] of arc) s.lineTo(x, y);
    for (let i = arc.length - 2; i >= 0; i--) s.lineTo(-arc[i][0], arc[i][1]);
  } else {
    // From the foot of the centre line out along the sill, up the jamb, round the arc to the apex.
    s.moveTo(0, 0);
    s.lineTo(part * hw, 0);
    for (const [x, y] of arc) s.lineTo(part * x, y);
  }
  s.closePath();
  g = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -dep / 2);
  g.computeVertexNormals();
  leafCache.set(key, g);
  return g;
}

/** A black iron ring handle on its back plate, on a door's face at (x, y, z) (facing +Z). */
export function ringHandle(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  audit(cb(k, g, [0.1, 0.16, 0.03], [x, y + 0.05, z + 0.015], IRON, undefined, 0.01), 'handle');
  audit(k.mesh(g, new THREE.TorusGeometry(0.075, 0.018, 5, 12), IRON, [x, y - 0.02, z + 0.04]), 'handle');
}
/** How thick a door's boards stand on its core, and how wide a joint between two boards. */
const BOARD_T = 0.03, BOARD_GAP = 0.024;

/** One upright board from bx0 to bx1, its foot on the sill, its head cut to `top`, `t` thick on z = 0..t. */
const boardCache = new Map<string, THREE.BufferGeometry>();
function boardGeo(key: string, bx0: number, bx1: number, top: (x: number) => number, t: number) {
  const k = `${key},${bx0.toFixed(3)},${bx1.toFixed(3)},${t}`;
  let g = boardCache.get(k);
  if (g) return g;
  const s = new THREE.Shape(), m = 4;
  s.moveTo(bx0, 0.02);
  s.lineTo(bx1, 0.02);
  for (let j = 0; j <= m; j++) {
    const x = bx1 - ((bx1 - bx0) * j) / m;
    s.lineTo(x, top(x));
  }
  s.closePath();
  g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.computeVertexNormals();
  boardCache.set(k, g);
  return g;
}

/**
 * A boarded leaf from x0 to x1 (built across X, up Y from the sill at y = 0, centred on z = 0), its
 * head at `top(x)`: the dark core `dep` thick (the leaf the audit measures, `core` its outline),
 * faced on both sides with upright boards about a quarter wide, cut to the head a little inside its
 * edge and set a joint apart so the dark shows between them, each board its own shade of the stained
 * oak; on both faces black iron strap hinges running from the hinge edge most of the way across,
 * nailed with studs and ending in a point; and a ring handle at the hero's hand by the latch edge.
 */
export function boardedLeaf(k: ModelKit, g: THREE.Object3D, o: { key: string; core: THREE.BufferGeometry; corePos: V3; x0: number; x1: number; top: (x: number) => number; dep: number; cls: keyof typeof DOORS; hinge: -1 | 1; latch: number; spring: number }) {
  const { x0, x1, top, dep, hinge } = o, w = x1 - x0;
  audit(k.mesh(g, o.core, DOOR_CORE, o.corePos), 'door-leaf', { cls: o.cls });
  const n = Math.max(3, Math.round(w / 0.27)), bw = w / n, inset = 0.012;
  const head = (x: number) => top(Math.min(x1 - inset, Math.max(x0 + inset, x))) - inset * 1.5;
  for (let i = 0; i < n; i++) {
    const bx0 = x0 + i * bw + (i ? BOARD_GAP / 2 : inset), bx1 = x0 + (i + 1) * bw - (i < n - 1 ? BOARD_GAP / 2 : inset);
    const geo = boardGeo(o.key, bx0, bx1, head, BOARD_T), tone = DOOR_STAIN[(i * 2 + (o.hinge > 0 ? 1 : 0)) % 3];
    for (const e of [-1, 1]) audit(k.mesh(g, geo, tone, [0, 0, e > 0 ? dep / 2 - 0.004 : -dep / 2 + 0.004 - BOARD_T]), 'door-board');
  }
  // The straps: one low, one under the springing of the head, and one between on a tall leaf.
  const lo = 0.42, hi = o.spring - 0.32, levels = hi - lo > 1.7 ? [lo, (lo + hi) / 2, hi] : [lo, hi];
  const face = dep / 2 + BOARD_T - 0.004, len = w * 0.8, from = hinge < 0 ? x0 : x1;
  for (const e of [-1, 1]) {
    const f = new THREE.Group();
    f.rotation.y = e > 0 ? 0 : Math.PI;
    g.add(f);
    for (const y of levels) {
      // (Tapering toward its point: a broad strap at the hinge, a narrower run, a diamond tip.)
      const mid = from - hinge * len / 2;
      k.box(f, [len, 0.09, 0.02], [e * mid, y, face + 0.01], IRON);
      k.box(f, [0.13, 0.13, 0.02], [e * (from - hinge * (len + 0.03)), y, face + 0.01], IRON, [0, 0, Math.PI / 4]);
      for (let sx = 0.08; sx < len - 0.02; sx += 0.2) k.box(f, [0.045, 0.045, 0.02], [e * (from - hinge * sx), y, face + 0.028], IRON);
    }
    ringHandle(k, f, e * o.latch, DOORS.handle, face);
  }
}

/**
 * The leaves closing a pointed doorway `W` wide, apex `h` over the sill (on z = 0, facing +Z, the sill
 * at y = 0): one leaf, or a pair meeting on the centre line, each boarded in the stained oak to the
 * shape of the arch, strapped in iron, with a ring handle at the hero's hand (boardedLeaf), so the
 * doorway reads as a tall wooden door from either side.
 */
export function pointedDoor(k: ModelKit, g: THREE.Object3D, W: number, h: number, rise: number, cls: keyof typeof DOORS, pair: boolean, dep = 0.1) {
  const parts: (-1 | 0 | 1)[] = pair ? [-1, 1] : [0], spring = h - rise;
  for (const part of parts) {
    const x0 = part === 1 ? 0 : -W / 2, x1 = part === -1 ? 0 : W / 2;
    boardedLeaf(k, g, {
      key: `p${W},${h},${rise}`, core: pointedLeaf(W, h, rise, part, dep), corePos: [0, 0, 0], x0, x1,
      top: (x) => archHeight(W, h, rise, x), dep, cls, hinge: part === 1 ? 1 : -1,
      // (The handle by the meeting stiles, by the latch edge on a single leaf.)
      latch: part === 0 ? W / 2 - 0.22 : part * 0.2, spring,
    });
  }
}
