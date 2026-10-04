import * as THREE from 'three';
import { box, cylinder, join, Mesh3, prism, rect, ring, type V2 } from '../mesh';
import { half, U } from '../scale';

/**
 * Windows, doors and shutters, in kit units: each stands on y = 0 centred on its footprint, its
 * outside toward +z. A window's or a door's frame sits in the middle of the wall's thickness, so the
 * wall's own stones or timbers show in the reveal round it.
 */

/** A window or door frame's members (U across) and how deep it stands in the wall (U, each side of the middle). */
export const FRAME = 3.6, FRAME_D = 4.5;

/** The clear opening inside a frame `w` cells wide and `hU` tall (a door's runs down to its foot): [x0, y0, x1, y1]. */
export const lightOf = (w: number, hU: number, door = false): [number, number, number, number] => [-half(w) + FRAME, door ? 0 : FRAME, half(w) - FRAME, hU - FRAME];

/** A frame round an opening `w` cells wide and `hU` tall: jambs, head and (for a window) a sill board. */
export function frame(w: number, hU: number, door = false): Mesh3 {
  const [x0, y0, x1, y1] = lightOf(w, hU, door);
  if (door) {
    // Two jambs and a head, as one piece (a U standing on its ends).
    const W = half(w), prof: V2[] = [[-W, 0], [x0, 0], [x0, y1], [x1, y1], [x1, 0], [W, 0], [W, hU], [-W, hU]];
    return prism(ring(prof, 0.7), [], FRAME_D * 2, 0.7)[0];
  }
  const hole = ring(rect(x0, y0, x1, y1).reverse(), 0.5);
  return prism(ring(rect(-half(w), 0, half(w), hU), 0.7), [hole], FRAME_D * 2, 0.7)[0];
}

/** The openings `cols` × `rows` glazing bars (1.6 U wide) leave in a window's light: [x0, y0, x1, y1] each. */
function panes(w: number, hU: number, cols: number, rows: number) {
  const [x0, y0, x1, y1] = lightOf(w, hU), bar = 0.8, out: [number, number, number, number][] = [];
  const at = (a: number, b: number, k: number, n: number) => a + ((b - a) * k) / n;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    out.push([i ? at(x0, x1, i, cols) + bar : x0, j ? at(y0, y1, j, rows) + bar : y0, i + 1 < cols ? at(x0, x1, i + 1, cols) - bar : x1, j + 1 < rows ? at(y0, y1, j + 1, rows) - bar : y1]);
  }
  return out;
}

/**
 * Glazing bars dividing a window's light into `cols` × `rows` panes: one grid, the light less its
 * panes (a hair of it left along the frame, which it touches), standing a little proud of the glass.
 */
export function glazingBars(w: number, hU: number, cols: number, rows: number): Mesh3 {
  if (cols * rows === 1) return new Mesh3();
  const [x0, y0, x1, y1] = lightOf(w, hU), e = 0.05;
  const holes = panes(w, hU, cols, rows).map(([a, b, c, d]) => ring(rect(a === x0 ? a + e : a, b === y0 ? b + e : b, c === x1 ? c - e : c, d === y1 ? d - e : d).reverse(), 0));
  return prism(ring(rect(x0, y0, x1, y1), 0), holes, 3, 0)[0];
}

/** The glass of a window's light: a pane filling each opening of its glazing bars, touching them all round. */
export function pane(w: number, hU: number, cols = 1, rows = 1): Mesh3 {
  const [x0, y0, x1, y1] = lightOf(w, hU), e = cols * rows === 1 ? 0 : 0.05;
  return join(...panes(w, hU, cols, rows).map(([a, b, c, d]) => box(a === x0 ? a + e : a, b === y0 ? b + e : b, -0.5, c === x1 ? c - e : c, d === y1 ? d - e : d, 0.5, 0)));
}

// ─── Doors ──────────────────────────────────────────────────────────────────

/** A door leaf's boards' thickness, and its ledges' behind them (U). */
const BOARD_T = 3.2, LEDGE_T = 2.6;

/**
 * A pair of planked doors hung behind a frame `w` cells wide and `hU` tall, closing against its back
 * and opening inward (toward −z), each leaf a quarter turn about its hinge on the frame's back
 * corner. The ledges and brace on their backs start clear of the hinge, so an opened leaf stands
 * clear of the wall's reveal. Returns [boards, iron], shut or open.
 */
export function doubleDoor(w: number, hU: number, open: boolean): [Mesh3, Mesh3] {
  const [x0, y0, x1, y1] = lightOf(w, hU, true);
  const boards: Mesh3[] = [], iron: Mesh3[] = [];
  const leafW = (x1 - x0) / 2, hand = y0 + 0.98 / U, top = y1 + 0.3, foot = y0 + 0.3;
  const across = (x: number, y: number, z: number) => new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y, z);
  for (const s of [-1, 1]) {
    // One leaf, built shut with its hinge at x = 0 reaching toward +x (the middle), its face at z = 0.
    const b: Mesh3[] = [], fe: Mesh3[] = [];
    const n = 4, bw = (leafW - 0.3) / n, first = s < 0 ? 1 : 11;
    for (let i = 0; i < n; i++) b.push(box(i * bw + 0.15, foot, -BOARD_T, (i + 1) * bw - 0.15, top, 0, 0.5).tag(first + i));
    // Ledges behind and a brace rising from the hinge side between them, all clear of the hinge.
    const ledges = [foot + 20, top - 20];
    for (const y of ledges) b.push(box(8, y - 3, -BOARD_T - LEDGE_T, leafW - 2.5, y + 3, -BOARD_T, 0.6).tag(first + 5));
    const bh = ledges[1] - ledges[0] - 6;
    b.push(prism(ring([[8, 0], [14, 0], [leafW - 2.5, bh], [leafW - 8.5, bh]], 0.6), [], LEDGE_T, 0.6, 'z', [0, ledges[0] + 3, -BOARD_T - LEDGE_T / 2])[0].tag(first + 6));
    // Strap hinges across the front from the hinge side, and a ring-pull handle near the meeting edge.
    for (const y of ledges) fe.push(box(0.6, y - 1.6, 0, leafW * 0.7, y + 1.6, 0.8, 0.3), cylinder(2, 0.9, 0.3, 10).moved(across(leafW * 0.7, y, 0)));
    fe.push(cylinder(2.6, 0.8, 0.2, 14).moved(across(leafW - 6, hand, 0)), cylinder(1.4, 3.4, 0.5, 12).moved(across(leafW - 6, hand, 0.6)));
    // The left leaf hinged at the left jamb's back corner, the right mirrored onto the right; open, each turned in.
    const m = new THREE.Matrix4().makeTranslation(s < 0 ? x0 + 0.3 : x1 - 0.3, 0, -FRAME_D);
    if (open) m.multiply(new THREE.Matrix4().makeRotationY(s < 0 ? Math.PI / 2 : -Math.PI / 2));
    if (s > 0) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    const laid = (mesh: Mesh3) => {
      const out = mesh.moved(m);
      // (Mirrored, its triangles are wound the other way round.)
      if (s > 0) for (let i = 0; i < out.idx.length; i += 3) [out.idx[i + 1], out.idx[i + 2]] = [out.idx[i + 2], out.idx[i + 1]];
      return out;
    };
    boards.push(laid(join(...b)));
    iron.push(laid(join(...fe)));
  }
  return [join(...boards), join(...iron)];
}

/**
 * The space a pair of doors needs (element-local): where they hang shut behind the frame, and the
 * whole area they sweep opening into the room, which nothing may stand in.
 */
export function doorSpace(w: number, hU: number): [number, number, number, number, number, number][] {
  const [x0, y0, x1, y1] = lightOf(w, hU, true), leafW = (x1 - x0) / 2, hd = half(1);
  // (Within the wall's thickness only the boards swing, inside the frame's line; the ledges clear it. Shut,
  // the hinges' straps and the handles stand a little forward into the doorway.)
  const board = 0.3 - BOARD_T - 0.1, ledge = 0.3 - BOARD_T - LEDGE_T - 0.1;
  return [
    [x0 + board, y0, -hd, x1 - board, y1 + 0.6, -FRAME_D],
    [x0 + ledge, y0, -FRAME_D - leafW - 1, x1 - ledge, y1 + 0.6, -hd],
    [x0 + 0.1, y0, -FRAME_D, x1 - 0.1, y1, -FRAME_D + 4.2],
  ];
}

// ─── Shutters ───────────────────────────────────────────────────────────────

/**
 * A shutter, swung open flat against the wall beside its window: one cell wide and `hU` tall, three
 * boards held by two ledges, lying just outside the cell it stands in front of.
 */
export function shutter(hU: number): Mesh3 {
  const z0 = half(1) + 0.3, parts: Mesh3[] = [];
  const w = 18.6, bw = w / 3;
  for (let i = 0; i < 3; i++) parts.push(box(-w / 2 + i * bw + 0.15, 2, z0, -w / 2 + (i + 1) * bw - 0.15, hU - 2, z0 + 2.2, 0.55).tag(i + 1));
  for (const y of [hU * 0.22, hU * 0.78]) parts.push(box(-w / 2 + 1.5, y - 2, z0 + 2.2, w / 2 - 1.5, y + 2, z0 + 3.2, 0.45).tag(4));
  return join(...parts);
}

/** The outline a shutter or door leaf fills, for its claim (element-local). */
export const shutterSpace = (hU: number): [number, number, number, number, number, number] => [-9.6, 2, half(1), 9.6, hU - 2, half(1) + 3.6];
