/**
 * Global XP pacing. Chapter 1 aims for OSRS-length progression on Diablo-speed combat:
 * combat XP comes from each enemy's fixed `xp` value (shared by the fraction of its health
 * you dealt), so area damage and overkill can't inflate it, and XP/hour is bounded by how
 * fast an instance can be cleared.
 */
export const XP_TUNING = {
  /** Hitpoints XP as a fraction of the combat XP earned. */
  hitpointsShare: 1 / 3,
  /** Defence XP per point of damage your armour absorbs (on top of stance XP). */
  defencePerAbsorbed: 0.5,
  /** Multipliers on the per-action XP in data/ores.ts and data/recipes.ts. */
  mining: 0.5,
  smithing: 0.5,
};
