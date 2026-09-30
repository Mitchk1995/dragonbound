import type { SkillId } from '../types';

export const MAX_LEVEL = 99;
export const MAX_XP = 200_000_000;

/** OSRS experience table: XP_TABLE[L] is the total XP needed to reach level L. */
const XP_TABLE: number[] = (() => {
  const table = [0, 0];
  let points = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    points += Math.floor(l + 300 * Math.pow(2, l / 7));
    table[l + 1] = Math.floor(points / 4);
  }
  return table;
})();

export function xpForLevel(level: number): number {
  return XP_TABLE[Math.max(1, Math.min(MAX_LEVEL, level))];
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && XP_TABLE[level + 1] <= xp) level++;
  return level;
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, cur: xp, next: xp, frac: 1, remaining: 0 };
  const cur = XP_TABLE[level];
  const next = XP_TABLE[level + 1];
  return { level, cur, next, frac: (xp - cur) / (next - cur), remaining: next - xp };
}

/** `icon` is a key into the SVG icon set (ui/icons.ts). */
export const SKILL_INFO: Record<SkillId, { name: string; icon: string; color: string }> = {
  melee: { name: 'Melee', icon: 'melee', color: '#e0584a' },
  ranged: { name: 'Ranged', icon: 'ranged', color: '#7cc84a' },
  magic: { name: 'Magic', icon: 'magic', color: '#5a9cff' },
  defence: { name: 'Defence', icon: 'defence', color: '#9ab0c8' },
  hitpoints: { name: 'Hitpoints', icon: 'hitpoints', color: '#ff6a8a' },
  mining: { name: 'Mining', icon: 'mining', color: '#c8a070' },
  smithing: { name: 'Smithing', icon: 'smithing', color: '#e0a040' },
};

/** Skills coming in later chapters; shown locked so players can see where they're headed. */
export const FUTURE_SKILLS = [
  { name: 'Herblore', icon: 'herblore', chapter: 2 },
  { name: 'Runecrafting', icon: 'runecrafting', chapter: 3 },
  { name: 'Enchanting', icon: 'enchanting', chapter: 3 },
  { name: 'Beastmastery', icon: 'beastmastery', chapter: 4 },
];

/** OSRS-style XP rates: per point of damage dealt. */
export const XP_PER_DAMAGE = 4;
export const HP_XP_PER_DAMAGE = 1.33;
