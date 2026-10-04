/**
 * The brick kit's one scale, taken from the hero (owner, October 3: buildings are built from real
 * toy-brick pieces at the hero's scale, and the hero is the minifigure).
 *
 * The hero (tools/blender/hero.py) stands 2.15 m from the soles of his boots to the crown of his
 * bare head: hip pivot 0.90, head pivot 0.78 above it, a 0.46 head cube on it. A minifigure stands
 * about four bricks tall without a hat (38.4 mm), so one brick is 2.15 / 4 ≈ 0.54 m, and every other
 * size follows from the real system's proportions. Lengths are kept in LDraw units (LDU, 0.4 mm of a
 * real brick) so the whole system is whole numbers: a stud pitch is 20 LDU, a brick 24, a plate 8.
 *
 *   1 mm of a real brick = 2.5 LDU = 0.05625 m (the kit is the real system scaled 56.25 times)
 *   stud pitch 8 mm  → 0.45 m         brick 9.6 mm → 0.54 m (width : height = 5 : 6)
 *   plate 3.2 mm     → 0.18 m (a third of a brick)
 *   stud Ø 4.8 mm    → 0.27 m, 1.7 mm tall → 0.096 m
 *   play between neighbours 0.2 mm → 1.1 cm, so every element reads apart from the next
 *   the hero: 4.0 bricks tall; a 1×4×6 door frame: 1.8 m wide, 3.24 m tall, a 2.88 m clear opening
 */

/** Metres per LDraw unit. */
export const LDU = 0.0225;
/** One millimetre of a real brick, in metres. */
export const MM = 2.5 * LDU;
/** Stud pitch: the grid across (8 mm). */
export const STUD = 20 * LDU;
/** A plate: the grid's vertical step (3.2 mm). */
export const PLATE = 8 * LDU;
/** A brick: three plates (9.6 mm). */
export const BRICK = 3 * PLATE;

/** Stud pitch, plate and brick in LDU. */
export const P_LDU = 20, PL_LDU = 8, BR_LDU = 24;
/** Stud radius and height, in LDU (Ø 4.8 mm, 1.7 mm tall). */
export const STUD_R = 6, STUD_H = 4.25;
/** Each element stops this far short of its cell on every side (0.1 mm), in LDU. */
export const PLAY = 0.25;
/**
 * The bevel on every edge, in LDU (0.36 mm, 2 cm in the world): a touch larger than the real thing's
 * rounding so that the joints between elements still read at the play camera's distance.
 */
export const EDGE = 0.9;

/** The hero's height, feet to bare crown (hero.py), and how many bricks that is. */
export const HERO_H = 2.15;
export const HERO_BRICKS = HERO_H / BRICK;

/** A rotation about the vertical in quarter turns; 1 turns an element's front (+z) to face +x. */
export type Rot = 0 | 1 | 2 | 3;
