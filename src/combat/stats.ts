import { BASES } from '../data/items';
import { COMBAT_TUNING } from '../data/tuning';
import type { Item, SkillId, Slot, Style } from '../types';

export interface PlayerStats {
  style: Style;
  styleLevel: number;
  dmgMin: number;
  dmgMax: number;
  atkSpeed: number;
  /** Multiplier on skill animation speed (1 = base; faster-cast gear raises it). */
  castSpeed: number;
  critChance: number;
  critMult: number;
  maxHp: number;
  armor: number;
  regen: number;
  lifeOnHit: number;
  moveSpeed: number;
  xpMult: number;
  cdr: number;
  range: number;
}

export interface StatMods {
  /** Post-death debuff. */
  weakened?: boolean;
  warCry?: boolean;
  /** Extra XP multiplier (diary rewards etc). */
  xpBonus?: number;
}

export const STYLE_RANGE: Record<Style, number> = { melee: 1.9, ranged: 12, magic: 10 };
const FISTS_DMG: [number, number] = [1, 3];

export function sumAffixes(equipment: Partial<Record<Slot, Item | null>>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    for (const a of item.affixes) totals[a.id] = (totals[a.id] ?? 0) + a.value;
  }
  return totals;
}

export function maxHpFor(hitpointsLevel: number, bonusLife = 0) {
  return 40 + hitpointsLevel * 6 + bonusLife;
}

export function computeStats(
  levels: Record<SkillId, number>,
  equipment: Partial<Record<Slot, Item | null>>,
  mods: StatMods = {},
): PlayerStats {
  const aff = sumAffixes(equipment);
  const get = (id: string) => aff[id] ?? 0;
  const weapon = equipment.weapon ? BASES[equipment.weapon.base] : null;
  const style: Style = weapon?.style ?? 'melee';
  const styleLevel = levels[style] + get(`${style}Lvl`);

  // Defence level adds innate armour on top of gear.
  let armor = Math.floor((levels.defence - 1) * 0.5);
  for (const item of Object.values(equipment)) if (item) armor += BASES[item.base]?.armor ?? 0;
  armor += get('armor');

  let dmgPct = get('dmgPct');
  if (mods.warCry) dmgPct += 35;
  let mult = (1 + (styleLevel - 1) * 0.03) * (1 + dmgPct / 100);
  if (mods.weakened) mult *= 0.75;

  const [bMin, bMax] = weapon?.dmg ?? FISTS_DMG;
  const flat = get('flatDmg');
  const T = COMBAT_TUNING;
  const speedPct = get('atkSpd') + (mods.warCry ? T.warCryAtkSpd : 0);

  return {
    style,
    styleLevel,
    dmgMin: Math.max(1, (bMin + flat) * mult),
    dmgMax: Math.max(1, (bMax + flat) * mult),
    atkSpeed: Math.min(T.maxAtkSpeed, (weapon?.speed ?? T.weaponSpeed.fists) * (1 + speedPct / 100)),
    castSpeed: Math.min(T.maxCastSpeed, 1 + get('castSpd') / 100),
    critChance: Math.min(0.75, 0.05 + get('critChance') / 100),
    critMult: 1.5 + get('critDmg') / 100,
    maxHp: maxHpFor(levels.hitpoints, get('life')),
    armor,
    regen: 0.5 + get('regen'),
    lifeOnHit: get('lifeOnHit'),
    moveSpeed: T.hero.moveSpeed * (1 + get('moveSpd') / 100),
    xpMult: (1 + get('xpPct') / 100) * (1 + (mods.xpBonus ?? 0)),
    cdr: Math.min(0.5, get('cdr') / 100),
    range: STYLE_RANGE[style],
  };
}

/**
 * A basic attack at `atkSpeed` attacks per second: the animation length, when the blow lands
 * (seconds after the click) and the time until the next attack can start.
 */
export function swingTiming(atkSpeed: number) {
  const T = COMBAT_TUNING;
  const dur = T.swingFrac / atkSpeed;
  return { dur, impactAt: dur * T.impact, interval: 1 / atkSpeed };
}

export type CastSkill = keyof typeof COMBAT_TUNING.skillCast;

/** Seconds a skill's animation takes at the given cast speed. */
export function castTime(skillId: CastSkill, castSpeed: number) {
  return COMBAT_TUNING.skillCast[skillId] / castSpeed;
}

/** Split combat XP across skills according to stance (OSRS-style). */
export function stanceSplit(stance: 'aggressive' | 'defensive' | 'shared', style: Style, xp: number): [SkillId, number][] {
  if (stance === 'aggressive') return [[style, xp]];
  if (stance === 'defensive') return [['defence', xp]];
  return [[style, xp / 2], ['defence', xp / 2]];
}
