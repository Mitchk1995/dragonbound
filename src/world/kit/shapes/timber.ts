import { box, join, Mesh3, prism, ring, slab, type V2 } from '../mesh';
import { half } from '../scale';

/**
 * Timber framing and its plaster, in kit units: each piece stands on y = 0 centred on its footprint,
 * one cell deep (the wall's thickness), its face toward +z. The timbers stand the full depth of the
 * wall; the plaster panels between them are thinner, so the frame stands a little proud of the
 * plaster on both faces, as a real frame does.
 */

/** The chamfer on a timber's edges (U). */
const TIMBER_EDGE = 0.9;
/** How far the plaster lies back from the timber's face, each side (U). */
const PLASTER_BACK = 2.6;

const hd = half(1), pd = hd - PLASTER_BACK;

/** A beam or post: `w` cells along x, `d` along z, `hU` tall. */
export const timber = (w: number, hU: number, d = 1) => box(-half(w), 0, -half(d), half(w), hU, half(d), TIMBER_EDGE);

/** A plaster panel filling a bay `w` cells wide and `hU` tall, set back from both faces. */
export const panel = (w: number, hU: number) => box(-half(w), 0, -pd, half(w), hU, pd, 0.5);

/**
 * A panel with a brace across it: a timber from one foot to the opposite head (rising to the right
 * when `dir` is 1, to the left when −1), the plaster in the two triangles either side. Returns
 * [plaster, brace].
 */
export function bracedPanel(w: number, hU: number, dir: 1 | -1, braceU = 11): [Mesh3, Mesh3] {
  const W = half(w), f = (p: V2[]): V2[] => (dir > 0 ? p : p.map(([x, y]) => [-x, y] as V2).reverse());
  const b = braceU * Math.hypot(2 * W, hU) / hU / 2;
  const lower: V2[] = [[-W + 2 * b, 0], [W, 0], [W, hU]];
  const upper: V2[] = [[-W, 0], [W - 2 * b, hU], [-W, hU]];
  const brace: V2[] = [[-W, 0], [-W + 2 * b, 0], [W, hU], [W - 2 * b, hU]];
  // (The plaster's triangles taper to fine points under the brace: left square, as plaster is.)
  return [
    join(slab(f(lower), -pd, pd, 0), slab(f(upper), -pd, pd, 0)),
    slab(f(brace), -hd, hd, 0.6),
  ];
}

/**
 * A piece of a gable `w` cells wide whose top follows the roof: `top0` U tall at its −x end and `top1`
 * at its +x end (a rake), or rising from both ends to `peak` at its middle when given. Plaster (set
 * back from both faces) or timber (the full depth).
 */
export function raked(w: number, top0: number, top1: number, timberPiece: boolean, peak?: number): Mesh3 {
  const W = half(w), d = timberPiece ? hd : pd;
  // (An end that rakes down to nothing is a point: the piece is a triangle.)
  const prof: V2[] = [[-W, 0], [W, 0]];
  if (top1 > 0.01) prof.push([W, top1]);
  if (peak !== undefined) prof.push([0, peak]);
  if (top0 > 0.01) prof.push([-W, top0]);
  return prism(ring(prof, timberPiece ? TIMBER_EDGE : 0.5), [], d * 2, timberPiece ? TIMBER_EDGE : 0.5, 'z')[0];
}

/**
 * A bargeboard under a roof's verge: a board `run` cells of the roof's slope long (in plan, along z),
 * falling `riseU` over that run toward +z, `deepU` deep below the roof's underside, `thick` U thick
 * across x, standing at x = `x0`..`x0 + thick` in its cell.
 */
export function bargeboard(riseU: number, deepU: number, thick: number, x0: number): Mesh3 {
  // (Each board runs its whole cell, meeting the next under the next course: the verge reads as one board.)
  const Z = 10;
  // (Its profile in z–y: the roof's underside on top, the board's lower edge parallel to it.)
  const prof: V2[] = [[-Z, riseU - deepU], [Z, -deepU], [Z, 0], [-Z, riseU]];
  return prism(ring(prof, 0.5), [], thick, 0.5, 'x', [x0 + thick / 2, 0, 0])[0];
}
