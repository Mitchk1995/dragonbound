import type { Slot } from '../types';

export interface AffixDef {
  id: string;
  /** Tooltip text; {v} is replaced with the value. */
  text: string;
  slots: Slot[];
  /** Roll range at item level 0; both ends grow by `per` each item level. */
  min: number;
  max: number;
  per: number;
  decimals?: number;
  weight: number;
  /** What the tooltip line is tinted for: an element, or 'bad' for a penalty. Plain bonuses (the default) read as 'good'. */
  tint?: 'fire' | 'frost' | 'lightning' | 'poison' | 'bad';
  /** Word used when naming a magic item. */
  prefix?: string;
  suffix?: string;
}

const W: Slot = 'weapon', H: Slot = 'helm', B: Slot = 'body', G: Slot = 'gloves', F: Slot = 'boots', A: Slot = 'amulet', R: Slot = 'ring';

const list: AffixDef[] = [
  { id: 'dmgPct', text: '+{v}% damage', slots: [W, A, R, G], min: 5, max: 12, per: 0.6, weight: 10, prefix: 'Cruel' },
  { id: 'flatDmg', text: '+{v} damage', slots: [W, R, G], min: 1, max: 2, per: 0.2, weight: 8, prefix: 'Jagged' },
  { id: 'atkSpd', text: '+{v}% attack speed', slots: [W, G, R], min: 4, max: 9, per: 0.15, weight: 6, suffix: 'of Haste' },
  { id: 'castSpd', text: '+{v}% cast speed', slots: [W, A, R], min: 5, max: 10, per: 0.15, weight: 5, suffix: 'of Incantation' },
  { id: 'critChance', text: '+{v}% critical strike chance', slots: [W, A, H, R], min: 2, max: 4, per: 0.1, weight: 6, prefix: 'Keen' },
  { id: 'critDmg', text: '+{v}% critical damage', slots: [W, A, G], min: 10, max: 20, per: 0.6, weight: 5, prefix: 'Vicious' },
  { id: 'life', text: '+{v} life', slots: [H, B, F, G, A, R], min: 5, max: 12, per: 1, weight: 12, suffix: 'of Vigor' },
  { id: 'armor', text: '+{v} armour', slots: [H, B, F, G], min: 2, max: 5, per: 0.4, weight: 10, prefix: 'Sturdy' },
  { id: 'regen', text: '+{v} life regenerated per second', slots: [B, A, R], min: 0.5, max: 1.2, per: 0.06, decimals: 1, weight: 6, suffix: 'of Mending' },
  { id: 'lifeOnHit', text: '+{v} life on hit', slots: [W, G, R], min: 1, max: 2, per: 0.1, weight: 5, suffix: 'of the Leech' },
  { id: 'moveSpd', text: '+{v}% movement speed', slots: [F], min: 4, max: 9, per: 0.15, weight: 8, suffix: 'of Swiftness' },
  { id: 'xpPct', text: '+{v}% experience gained', slots: [A, H], min: 2, max: 4, per: 0.08, weight: 3, suffix: 'of Wisdom' },
  { id: 'cdr', text: '-{v}% ability cooldowns', slots: [A, H, G], min: 3, max: 6, per: 0.1, weight: 4, suffix: 'of Focus' },
  { id: 'meleeLvl', text: '+{v} to Melee level', slots: [A, W], min: 1, max: 2, per: 0.03, weight: 2, suffix: 'of the Duelist' },
  { id: 'rangedLvl', text: '+{v} to Ranged level', slots: [A, W], min: 1, max: 2, per: 0.03, weight: 2, suffix: 'of the Hawk' },
  { id: 'magicLvl', text: '+{v} to Magic level', slots: [A, W], min: 1, max: 2, per: 0.03, weight: 2, suffix: 'of the Magus' },
];

export const AFFIXES: Record<string, AffixDef> = Object.fromEntries(list.map((a) => [a.id, a]));
export const AFFIX_LIST = list;

export const RARE_NAME_A = ['Dragon', 'Ash', 'Cinder', 'Storm', 'Grave', 'Wyrm', 'Blood', 'Ember', 'Iron', 'Doom', 'Scale', 'Soot'];
export const RARE_NAME_B = ['Bite', 'Mark', 'Song', 'Ward', 'Fang', 'Coil', 'Brand', 'Veil', 'Claw', 'Oath', 'Spire', 'Heart'];
