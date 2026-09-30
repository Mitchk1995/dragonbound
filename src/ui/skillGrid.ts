import { MAX_LEVEL, levelProgress } from '../progression/skills';

/**
 * The skills tab's numbers (OSRS's skill grid): each tile shows its level out of 99, and the hover
 * card shows total XP, the XP still needed for the next level and how far along it you are.
 * Kept free of the DOM so tests can check it.
 */
export interface SkillTileInfo {
  level: number;
  /** "42/99" as the tile shows it. */
  label: string;
  xp: number;
  /** Total XP at which the next level arrives (null at 99). */
  nextAt: number | null;
  /** XP still needed for the next level (0 at 99). */
  remaining: number;
  /** Progress through the current level, 0..1 (1 at 99). */
  frac: number;
  /** Rounded percent, never showing 100 before the level is actually reached. */
  pct: number;
}

export function skillTileInfo(xp: number): SkillTileInfo {
  const p = levelProgress(xp);
  const maxed = p.level >= MAX_LEVEL;
  const frac = maxed ? 1 : Math.max(0, Math.min(1, p.frac));
  return {
    level: p.level,
    label: `${p.level}/${MAX_LEVEL}`,
    xp,
    nextAt: maxed ? null : p.next,
    remaining: maxed ? 0 : Math.ceil(p.remaining),
    frac,
    pct: maxed ? 100 : Math.min(99, Math.floor(frac * 100)),
  };
}
