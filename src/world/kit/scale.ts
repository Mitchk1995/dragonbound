/**
 * The building kit's one grid, at the hero's scale (owner, October 3 and 4: buildings are built from
 * modular pieces on one grid sized from the hero, laid as a mason lays them).
 *
 * Every piece stands on the grid: across in cells of 0.45 m, up in steps of 0.18 m (half steps
 * allowed), and stone walls are laid in courses of three steps (0.54 m). The hero (hero.py) stands
 * 2.15 m from his soles to the crown of his bare head: four courses. Shapes are built in kit units
 * (U, 2.25 cm), so the grid is whole numbers: a cell is 20 U, a step 8, a course 24.
 *
 *   cell 0.45 m (20 U)     step 0.18 m (8 U), half steps 0.09 m     course 0.54 m (24 U)
 *   a stone 0.9 m long and a course tall; a door 2.25 m wide; a stair's riser a step and a half
 */

/** Metres per kit unit. */
export const U = 0.0225;
/** A cell (the grid across), a step (the grid up) and a course of stone, in kit units. */
export const CELL_U = 20, STEP_U = 8, COURSE_U = 24;
/** The same in metres. */
export const CELL = CELL_U * U;
export const STEP = STEP_U * U;
export const COURSE = COURSE_U * U;

/** Each piece stops this far short of its cell on every side (U, 5.6 mm), so the joints between pieces read. */
export const PLAY = 0.25;

/** The hero's height, feet to bare crown (hero.py). */
export const HERO_H = 2.15;

/** A rotation about the vertical in quarter turns; 1 turns a piece's front (+z) to face +x. */
export type Rot = 0 | 1 | 2 | 3;

/** Half the length of `n` cells, less the play at each end (U). */
export const half = (n: number) => n * (CELL_U / 2) - PLAY;
