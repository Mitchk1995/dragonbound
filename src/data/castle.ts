/**
 * Measures shared by the castle's layout (src/world/castle/) and its models (castleProps/): the curtain's wall
 * walk and the gatehouse's drums, so the doorways the plan asks for open where the models put the
 * walk.
 */
export const CURTAIN_WALL = {
  /** The curtain's thickness and the height of its wall walk's deck. */
  T: 2.2,
  H: 7,
  /** The top of the walk's deck, where a tower's doorway onto it has its sill. */
  walkY: 7.06,
  /** How far the middle of the walk lies from the wall's centre line, toward the bailey. */
  walkOff: 0.445,
};

/** The gatehouse's two drums on the curtain's line: their centres either side of the axis, their radius. */
export const GATEHOUSE = { cx: 6, R: 2.6 };
