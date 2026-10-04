import { box, join, Mesh3, prism, ring, turned, type V2 } from '../mesh';
import { CELL_U, half, PLAY } from '../scale';

/**
 * The roof, in kit units: clay tiles laid in courses, a ridge of capping tiles, and the chimney's
 * pots. A course runs along x, one cell of the roof's run deep (z), its low edge (the eaves side)
 * toward +z, rising `ROOF_RISE` over its cell: each tile hangs from the course above's batten line,
 * its butt resting on the course below, so every course shows a shadowed step at its foot.
 */

/** The roof's rise over each cell of its run (U): two steps a cell, about 39°. */
export const ROOF_RISE = 16;
/** A tile's thickness (U), and its width: half a cell. */
export const TILE_T = 2.4;
export const TILE_W = CELL_U / 2;

/** The underside of a course's tiles at z (its butt lifted one tile's thickness off the batten plane). */
export const tileUnder = (z: number) => TILE_T + ((ROOF_RISE - TILE_T) * (CELL_U / 2 - z)) / CELL_U;

/**
 * A course of tiles `w` cells long. `shift` sets the bond: the tiles of alternate courses are offset
 * by half a tile, with a half tile at each end, so no joint runs straight up the roof. Each tile is
 * its own (sub 1, 2, …), so each shows its own clay.
 */
export function tileCourse(w: number, shift: boolean): Mesh3 {
  const X = w * (CELL_U / 2), Z = CELL_U / 2, g = 0.35;
  const edges: number[] = [-X + PLAY];
  for (let x = -X + (shift ? TILE_W / 2 : TILE_W); x < X - 1; x += TILE_W) edges.push(x);
  edges.push(X - PLAY);
  const tiles: Mesh3[] = [];
  // Each tile in profile (z–y): a slab from its butt at +z up to its head at −z, the butt's upper edge
  // worn round (one chamfer, the edge that catches the light), the rest left sharp: a roof has hundreds.
  const bu = tileUnder(Z), c = 0.8, fall = (ROOF_RISE - TILE_T) / CELL_U, k = c / Math.hypot(1, fall);
  const prof: V2[] = [[Z - 0.2, bu], [Z - 0.2, bu + TILE_T - c], [Z - 0.2 - k, bu + TILE_T + k * fall], [-Z, tileUnder(-Z) + TILE_T], [-Z, tileUnder(-Z)]];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i] + (i ? g : 0), b = edges[i + 1] - (i + 2 < edges.length ? g : 0);
    if (b - a < 2) continue;
    tiles.push(prism(ring(prof, 0, undefined, 0.2), [], b - a, 0, 'x', [(a + b) / 2, 0, 0])[0].tag(i + 1));
  }
  return join(...tiles);
}

/**
 * The boarding under a course of tiles `w` cells long: a thin wedge on the roof's plane, filling up to
 * the tiles' undersides, so the gaps between the tiles show dark boarding, not daylight.
 */
export function tileBoarding(w: number): Mesh3 {
  const X = w * (CELL_U / 2) - PLAY, Z = CELL_U / 2;
  // (On the roof's plane under the butts, rising to meet the tiles' undersides at their heads.)
  const plane = (z: number) => (ROOF_RISE * (Z - z)) / CELL_U;
  const prof: V2[] = [[Z - 0.2, plane(Z - 0.2) + 0.02], [Z - 0.2, tileUnder(Z - 0.2) - 0.15], [-Z + 0.5, plane(-Z + 0.5) + 0.02]];
  return prism(ring(prof, 0), [], 2 * X, 0, 'x')[0];
}

/** How steeply the tiles' top surface falls (U per U of run): a little less than the roof, the butts lifted. */
export const TILE_FALL = (ROOF_RISE - TILE_T) / CELL_U;
/** How far the ridge's caps lap down each slope (U of run), and their thickness. */
export const RIDGE_REACH = 8, RIDGE_T = 2.6;

/**
 * The ridge: angular capping tiles along x over the apex where the two top courses meet (at z = 0,
 * height `apex`, the tiles' top surface there), each a cell long, lapping down both slopes.
 */
export function ridgeCap(w: number, apex: number): Mesh3 {
  const k = TILE_FALL, r = RIDGE_REACH, t = RIDGE_T, caps: Mesh3[] = [];
  // (Profile in z–y: the underside on the two slopes, the top parallel to them, a rounded crest.)
  const prof: V2[] = [[-r, apex - r * k], [0, apex], [r, apex - r * k], [r, apex - r * k + t], [1.4, apex + t + 0.4], [-1.4, apex + t + 0.4], [-r, apex - r * k + t]];
  for (let i = 0; i < w; i++) {
    const x0 = -w * 10 + i * 20 + PLAY, x1 = x0 + 20 - 2 * PLAY;
    caps.push(prism(ring(prof, 0, undefined, 0.2), [], x1 - x0, 0, 'x', [(x0 + x1) / 2, 0, 0])[0].tag(i + 1));
  }
  return join(...caps);
}

/** A clay chimney pot: a turned pot with a rolled rim, `hU` tall. */
export function chimneyPot(hU: number): Mesh3 {
  return turned([
    { r: 0, y: 0 }, { r: 5.2, y: 0 }, { r: 5.2, y: 1.6, round: true }, { r: 4.4, y: 2.4 },
    { r: 3.9, y: hU * 0.55, smooth: true }, { r: 3.5, y: hU - 3 }, { r: 4.6, y: hU - 2.2, round: true }, { r: 4.6, y: hU - 0.8 }, { r: 3.6, y: hU },
    { r: 2.6, y: hU }, { r: 2.6, y: hU - 6 }, { r: 0, y: hU - 6 },
  ], 14);
}

/** A chimney's cap: a slab `w` × `d` cells standing out `over` U all round, `hU` tall. */
export const chimneyCap = (w: number, d: number, over: number, hU: number) => box(-half(w) - over, 0, -half(d) - over, half(w) + over, hU, half(d) + over, 1.1);
