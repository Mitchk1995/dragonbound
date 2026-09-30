import type { SkillId } from '../types';

export interface Restoration {
  id: string;
  name: string;
  desc: string;
  cost: Record<string, number>;
  gold: number;
  reqs: { skill: SkillId; level: number }[];
  /** Other restorations or quests that must be done first. */
  after?: string[];
  quest?: string;
  /** Visible later-chapter teaser: can't be built yet. */
  locked?: string;
}

export const RESTORATIONS: Restoration[] = [
  {
    id: 'anvil_reforged', name: 'Reforge the Great Anvil',
    desc: 'The cracked anvil can only take bronze and iron. Reforge it to work steel and smelt steel bars.',
    cost: { iron_bar: 25 }, gold: 500, reqs: [{ skill: 'smithing', level: 25 }],
  },
  {
    id: 'vault_expanded', name: 'Expand the Vault',
    desc: 'Clear the collapsed side-vault: +80 bank slots.',
    cost: { bronze_bar: 20, iron_bar: 10 }, gold: 1200, reqs: [],
  },
  {
    id: 'mine_chest', name: 'Emberdeep Deposit Chest',
    desc: 'Haul a chest down into Emberdeep so you can bank ore without leaving the mine.',
    cost: { bronze_bar: 15 }, gold: 300, reqs: [{ skill: 'mining', level: 15 }],
  },
  {
    id: 'lair_arch', name: 'Relight the Lair Arch',
    desc: "Attune an arch to Cinderwing's lair for a direct portal, no trek through the Foothills.",
    cost: { steel_bar: 5, emberite_ore: 5 }, gold: 1500, reqs: [], quest: 'cinder_seal', after: ['anvil_reforged'],
  },
  {
    id: 'emberforge', name: 'Stoke the Emberforge',
    desc: 'Rekindle the ancient forge-heart to smelt and smith Emberforged gear.',
    cost: { steel_bar: 10, emberite_ore: 20 }, gold: 4000, reqs: [{ skill: 'smithing', level: 38 }], after: ['anvil_reforged'],
  },
  { id: 'alchemy_lab', name: 'Alchemy Lab', desc: 'Herblore: brew potions and elixirs.', cost: {}, gold: 0, reqs: [], locked: 'Chapter 2' },
  { id: 'rune_altar', name: 'Rune Altar', desc: 'Runecrafting and Enchanting.', cost: {}, gold: 0, reqs: [], locked: 'Chapter 3' },
  { id: 'hatchery', name: 'Dragon Hatchery', desc: 'Beastmastery: hatch dragon eggs and raise companions.', cost: {}, gold: 0, reqs: [], locked: 'Chapter 4' },
];

export const RESTORATION_BY_ID = Object.fromEntries(RESTORATIONS.map((r) => [r.id, r]));
