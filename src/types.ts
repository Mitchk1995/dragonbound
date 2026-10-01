export type Style = 'melee' | 'ranged' | 'magic';
export type SkillId = 'melee' | 'ranged' | 'magic' | 'defence' | 'hitpoints' | 'mining' | 'smithing';
export const SKILLS: SkillId[] = ['melee', 'ranged', 'magic', 'defence', 'hitpoints', 'mining', 'smithing'];
export const COMBAT_SKILLS: SkillId[] = ['melee', 'ranged', 'magic', 'defence', 'hitpoints'];

export type Rarity = 'normal' | 'magic' | 'rare' | 'unique';
export const RARITIES: Rarity[] = ['normal', 'magic', 'rare', 'unique'];

export type Slot = 'weapon' | 'helm' | 'body' | 'gloves' | 'boots' | 'amulet' | 'ring';
export const SLOTS: Slot[] = ['weapon', 'helm', 'body', 'gloves', 'boots', 'amulet', 'ring'];

export interface AffixRoll {
  id: string;
  value: number;
}

export interface Item {
  uid: string;
  base: string;
  rarity: Rarity;
  ilvl: number;
  affixes: AffixRoll[];
  /** Set for named uniques; references UNIQUES. */
  unique?: string;
  /** Generated display name for magic/rare/masterwork items. */
  name?: string;
  /** Crafted with a bonus affix. */
  masterwork?: boolean;
  /** Stack size (bank stacks materials; inventory keeps one per slot like OSRS). */
  qty?: number;
}

export interface Vec2 {
  x: number;
  z: number;
}
