import type { AffixRoll, SkillId, Slot, Style } from '../types';
import { COMBAT_TUNING } from './tuning';

const SPEED = COMBAT_TUNING.weaponSpeed;

export type ItemKind = 'gear' | 'material' | 'tool' | 'quest';

/** Colour set applied to a gear model's role materials (metal / trim / dark). */
export interface Palette {
  main: number;
  trim: number;
  dark: number;
  /** Trim glows (emberforged). */
  glow?: boolean;
  /** Forged metal: the role parts get a metallic finish that reflects light (smithed tiers). */
  metal?: boolean;
  /** Surface roughness of forged metal parts (default METAL_FINISH): dull iron is rougher than polished steel. */
  rough?: number;
}

export interface BaseItem {
  id: string;
  name: string;
  kind: ItemKind;
  slot?: Slot;
  style?: Style;
  dmg?: [number, number];
  /** Base attacks per second (COMBAT_TUNING.weaponSpeed). */
  speed?: number;
  armor?: number;
  req?: { skill: SkillId; level: number };
  /** Lowest item level this base can drop at; undefined = never drops as random gear. */
  minIlvl?: number;
  value: number;
  /** Gear model id (public/models/gear_<model>.glb) or material model kind. */
  model?: string;
  palette?: Palette;
  tier?: TierId;
  /** Pickaxe power: ticks per swing. */
  swingTicks?: number;
  desc?: string;
  /** Icon/model colour for materials. */
  color?: number;
}

// ─── Metal tiers ────────────────────────────────────────────────────────────

export type TierId = 'bronze' | 'iron' | 'steel' | 'ember';

export interface Tier {
  id: TierId;
  name: string;
  palette: Palette;
  /** Level to wear/wield. */
  req: number;
  /** Smithing level of the tier's first item. */
  smith: number;
  /** Smithing XP per bar used. */
  xpPerBar: number;
  bar: string;
  minIlvl: number;
}

export const TIERS: Record<TierId, Tier> = {
  bronze: { id: 'bronze', name: 'Bronze', palette: { main: 0xb4743a, trim: 0xe3a45a, dark: 0x6a4020 }, req: 1, smith: 1, xpPerBar: 12.5, bar: 'bronze_bar', minIlvl: 1 },
  iron: { id: 'iron', name: 'Iron', palette: { main: 0x60646a, trim: 0x8e9399, dark: 0x35373b, rough: 0.5 }, req: 10, smith: 15, xpPerBar: 25, bar: 'iron_bar', minIlvl: 4 },
  steel: { id: 'steel', name: 'Steel', palette: { main: 0x6f7e93, trim: 0xadb9c8, dark: 0x2c3440, rough: 0.28 }, req: 20, smith: 30, xpPerBar: 37.5, bar: 'steel_bar', minIlvl: 9 },
  ember: { id: 'ember', name: 'Emberforged', palette: { main: 0x3a3336, trim: 0xff7a1a, dark: 0x5a1a16, glow: true }, req: 30, smith: 40, xpPerBar: 60, bar: 'ember_bar', minIlvl: 15 },
};
export const TIER_ORDER: TierId[] = ['bronze', 'iron', 'steel', 'ember'];

/** Smithable pieces. `offset` is added to the tier's smithing level; `bars` is the bar cost. */
export interface Piece {
  key: string;
  name: string;
  kind: ItemKind;
  slot?: Slot;
  model: string;
  offset: number;
  bars: number;
  stats: (t: number) => Partial<BaseItem>;
}

export const PIECES: Piece[] = [
  { key: 'sword', name: 'Sword', kind: 'gear', slot: 'weapon', model: 'sword', offset: 0, bars: 1, stats: (t) => ({ style: 'melee', dmg: [[3, 6], [5, 9], [7, 13], [10, 17]][t] as [number, number], speed: SPEED.sword }) },
  { key: 'longsword', name: 'Longsword', kind: 'gear', slot: 'weapon', model: 'longsword', offset: 6, bars: 2, stats: (t) => ({ style: 'melee', dmg: [[5, 9], [7, 13], [10, 18], [14, 24]][t] as [number, number], speed: SPEED.longsword }) },
  { key: 'medhelm', name: 'Med Helm', kind: 'gear', slot: 'helm', model: 'helm_open', offset: 2, bars: 1, stats: (t) => ({ armor: [2, 4, 6, 9][t] }) },
  { key: 'fullhelm', name: 'Full Helm', kind: 'gear', slot: 'helm', model: 'helm_full', offset: 7, bars: 2, stats: (t) => ({ armor: [3, 6, 9, 13][t] }) },
  { key: 'chainbody', name: 'Chainbody', kind: 'gear', slot: 'body', model: 'body_chain', offset: 9, bars: 3, stats: (t) => ({ armor: [4, 8, 12, 17][t] }) },
  { key: 'platebody', name: 'Platebody', kind: 'gear', slot: 'body', model: 'body_plate', offset: 13, bars: 5, stats: (t) => ({ armor: [6, 11, 16, 23][t] }) },
  { key: 'gauntlets', name: 'Gauntlets', kind: 'gear', slot: 'gloves', model: 'gloves', offset: 4, bars: 1, stats: (t) => ({ armor: [1, 2, 4, 6][t] }) },
  { key: 'boots', name: 'Boots', kind: 'gear', slot: 'boots', model: 'boots', offset: 5, bars: 1, stats: (t) => ({ armor: [1, 2, 4, 6][t] }) },
  { key: 'pickaxe', name: 'Pickaxe', kind: 'tool', model: 'pickaxe', offset: 0, bars: 2, stats: (t) => ({ swingTicks: [5, 4, 4, 3][t] }) },
];

export const pieceId = (tier: TierId, piece: string) => `${tier}_${piece}`;

// ─── Base item list ─────────────────────────────────────────────────────────

const list: BaseItem[] = [];

/**
 * Plate-set design per tier (tools/blender/plate_variants.py): bronze, iron and steel share one plate
 * design ("p") and differ only by palette; Emberforged ("e") is the same plate in obsidian with a restrained
 * dragon identity (horned great helm with a burning visor, a dragon heart, a few scales and claws).
 * Gauntlets and boots follow the tier's set so full sets match.
 */
export const PLATE_STYLE: Record<TierId, 'p' | 'e'> = { bronze: 'p', iron: 'p', steel: 'p', ember: 'e' };
const STYLED = new Set(['body_plate', 'helm_full', 'gloves', 'boots']);

TIER_ORDER.forEach((tierId, t) => {
  const tier = TIERS[tierId];
  for (const p of PIECES) {
    const stats = p.stats(t);
    const isWeapon = p.slot === 'weapon';
    list.push({
      id: pieceId(tierId, p.key),
      name: `${tier.name} ${p.name}`,
      kind: p.kind,
      slot: p.slot,
      model: STYLED.has(p.model) ? `${p.model}_${PLATE_STYLE[tierId]}` : p.model,
      palette: { ...tier.palette, metal: true },
      tier: tierId,
      minIlvl: p.kind === 'gear' ? tier.minIlvl + Math.floor(p.offset / 4) : undefined,
      req: p.kind === 'gear' ? { skill: isWeapon ? 'melee' : 'defence', level: tier.req } : { skill: 'mining', level: tier.req },
      value: Math.round((4 + p.bars * 6) * Math.pow(3, t)),
      ...stats,
    });
  }
});

const WOOD: Palette = { main: 0x6b4426, trim: 0xd8c8a0, dark: 0x3a2414 };
const LEATHER: Palette = { main: 0x8a5a34, trim: 0x5a3a22, dark: 0x3a2414 };

list.push(
  // Ranged and magic weapons: drop-only until Fletching/Runecrafting arrive.
  { id: 'worn_bow', name: 'Worn Shortbow', kind: 'gear', slot: 'weapon', style: 'ranged', dmg: [2, 5], speed: SPEED.shortbow, minIlvl: 1, value: 4, model: 'bow', palette: WOOD },
  { id: 'hunter_bow', name: "Hunter's Bow", kind: 'gear', slot: 'weapon', style: 'ranged', dmg: [4, 8], speed: SPEED.shortbow, req: { skill: 'ranged', level: 10 }, minIlvl: 4, value: 20, model: 'bow', palette: { ...WOOD, main: 0x7a5030, trim: 0xe0d0a8 } },
  { id: 'recurve_bow', name: 'Recurve Bow', kind: 'gear', slot: 'weapon', style: 'ranged', dmg: [6, 11], speed: SPEED.heavyBow, req: { skill: 'ranged', level: 20 }, minIlvl: 9, value: 60, model: 'bow', palette: { main: 0x4a3020, trim: 0xe0b44a, dark: 0x2a1a10 } },
  { id: 'drakebone_bow', name: 'Drakebone Bow', kind: 'gear', slot: 'weapon', style: 'ranged', dmg: [8, 15], speed: SPEED.heavyBow, req: { skill: 'ranged', level: 30 }, minIlvl: 15, value: 150, model: 'bow', palette: { main: 0xe8dcc0, trim: 0xc0392b, dark: 0x6a5a48 } },
  { id: 'apprentice_staff', name: 'Apprentice Staff', kind: 'gear', slot: 'weapon', style: 'magic', dmg: [3, 6], speed: SPEED.staff, minIlvl: 1, value: 4, model: 'staff', palette: { main: 0x6b4426, trim: 0x6aa8ff, dark: 0x3a2414 } },
  { id: 'oak_staff', name: 'Oak Staff', kind: 'gear', slot: 'weapon', style: 'magic', dmg: [5, 10], speed: SPEED.staff, req: { skill: 'magic', level: 10 }, minIlvl: 4, value: 20, model: 'staff', palette: { main: 0x8a6a3a, trim: 0x7ae07a, dark: 0x4a3420 } },
  { id: 'runed_staff', name: 'Runed Staff', kind: 'gear', slot: 'weapon', style: 'magic', dmg: [7, 14], speed: SPEED.heavyStaff, req: { skill: 'magic', level: 20 }, minIlvl: 9, value: 60, model: 'staff', palette: { main: 0x3a3440, trim: 0xb07aff, dark: 0x1a1820 } },
  { id: 'ember_staff', name: 'Emberwood Staff', kind: 'gear', slot: 'weapon', style: 'magic', dmg: [10, 18], speed: SPEED.heavyStaff, req: { skill: 'magic', level: 30 }, minIlvl: 15, value: 150, model: 'staff', palette: { main: 0x2a1a14, trim: 0xff7a1a, dark: 0x140c0a, glow: true } },
  // Leather: drop-only light armour.
  { id: 'leather_cap', name: 'Leather Cap', kind: 'gear', slot: 'helm', armor: 2, minIlvl: 1, value: 3, model: 'helm_open', palette: LEATHER },
  { id: 'leather_body', name: 'Leather Body', kind: 'gear', slot: 'body', armor: 4, minIlvl: 1, value: 5, model: 'body_leather', palette: LEATHER },
  { id: 'leather_gloves', name: 'Leather Gloves', kind: 'gear', slot: 'gloves', armor: 1, minIlvl: 1, value: 3, model: 'gloves', palette: LEATHER },
  { id: 'leather_boots', name: 'Leather Boots', kind: 'gear', slot: 'boots', armor: 1, minIlvl: 1, value: 3, model: 'boots', palette: LEATHER },
  // Jewellery: drop-only until Crafting.
  { id: 'bone_amulet', name: 'Bone Amulet', kind: 'gear', slot: 'amulet', minIlvl: 1, value: 8, model: 'amulet', palette: { main: 0xeee4cc, trim: 0x8a5a34, dark: 0x6a5a48 } },
  { id: 'jade_amulet', name: 'Jade Amulet', kind: 'gear', slot: 'amulet', minIlvl: 6, value: 30, model: 'amulet', palette: { main: 0x4ac08a, trim: 0xe0b44a, dark: 0x2a6a4a } },
  { id: 'copper_ring', name: 'Copper Ring', kind: 'gear', slot: 'ring', minIlvl: 1, value: 6, model: 'ring', palette: { main: 0xc07a3a, trim: 0xe0a060, dark: 0x6a4020 } },
  { id: 'silver_ring', name: 'Silver Ring', kind: 'gear', slot: 'ring', minIlvl: 6, value: 25, model: 'ring', palette: { main: 0xd8dce4, trim: 0x6aa8ff, dark: 0x7a8088 } },

  // Ores, bars, gems
  { id: 'copper_ore', name: 'Copper Ore', kind: 'material', value: 3, model: 'ore', color: 0xc8703a },
  { id: 'tin_ore', name: 'Tin Ore', kind: 'material', value: 3, model: 'ore', color: 0xb8b8b0 },
  { id: 'iron_ore', name: 'Iron Ore', kind: 'material', value: 12, model: 'ore', color: 0x9a5a48 },
  { id: 'coal', name: 'Coal', kind: 'material', value: 20, model: 'ore', color: 0x2a2626 },
  { id: 'emberite_ore', name: 'Emberite Ore', kind: 'material', value: 60, model: 'ore', color: 0xff5a1a },
  { id: 'bronze_bar', name: 'Bronze Bar', kind: 'material', value: 8, model: 'bar', color: 0xb4743a },
  { id: 'iron_bar', name: 'Iron Bar', kind: 'material', value: 28, model: 'bar', color: 0x6a6e74 },
  { id: 'steel_bar', name: 'Steel Bar', kind: 'material', value: 80, model: 'bar', color: 0x8ea0b6 },
  { id: 'ember_bar', name: 'Emberforged Bar', kind: 'material', value: 260, model: 'bar', color: 0xff6a1a },
  { id: 'uncut_sapphire', name: 'Uncut Sapphire', kind: 'material', value: 50, model: 'gem', color: 0x3a6aff, desc: 'A rare find while mining. Will one day be cut and set.' },
  { id: 'uncut_emerald', name: 'Uncut Emerald', kind: 'material', value: 90, model: 'gem', color: 0x3ad06a, desc: 'A rare find while mining. Will one day be cut and set.' },
  { id: 'uncut_ruby', name: 'Uncut Ruby', kind: 'material', value: 150, model: 'gem', color: 0xe0304a, desc: 'A rare find while mining. Will one day be cut and set.' },

  // Quest items
  { id: 'seal_fragment', name: 'Cinder Seal Fragment', kind: 'quest', value: 0, model: 'fragment', color: 0xff7a1a, desc: "A shard of the seal on Cinderwing's lair. Three would make it whole." },
  { id: 'cinder_key', name: 'Cinder Key', kind: 'quest', value: 0, model: 'key', color: 0xff5a1a, desc: 'Forged from the seal itself. It is warm to the touch.' },
);

export const BASES: Record<string, BaseItem> = Object.fromEntries(list.map((b) => [b.id, b]));
export const BASE_LIST = list;
export const isGear = (id: string) => BASES[id]?.kind === 'gear';
export const isPickaxe = (id: string) => BASES[id]?.kind === 'tool' && BASES[id].model === 'pickaxe';

export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  model: string;
  affixes: AffixRoll[];
  req?: { skill: SkillId; level: number };
  flavor: string;
}

export const UNIQUES: Record<string, UniqueDef> = {
  cinderfang: {
    id: 'cinderfang', name: 'Cinderfang', base: 'steel_longsword', model: 'u_cinderfang',
    affixes: [{ id: 'dmgPct', value: 45 }, { id: 'atkSpd', value: 15 }, { id: 'critChance', value: 8 }, { id: 'lifeOnHit', value: 3 }],
    req: { skill: 'melee', level: 22 },
    flavor: "Forged from a whelp's broken fang. Still warm.",
  },
  emberstring: {
    id: 'emberstring', name: 'Emberstring', base: 'recurve_bow', model: 'u_emberstring',
    affixes: [{ id: 'dmgPct', value: 35 }, { id: 'atkSpd', value: 20 }, { id: 'critDmg', value: 30 }],
    req: { skill: 'ranged', level: 22 },
    flavor: 'Strung with sinew that never cools.',
  },
  kindled_ash: {
    id: 'kindled_ash', name: 'Staff of Kindled Ash', base: 'runed_staff', model: 'u_kindled_ash',
    affixes: [{ id: 'dmgPct', value: 50 }, { id: 'castSpd', value: 20 }, { id: 'cdr', value: 15 }, { id: 'magicLvl', value: 2 }],
    req: { skill: 'magic', level: 22 },
    flavor: "The ember at its tip was once a dragon's heart.",
  },
  ashen_crown: {
    id: 'ashen_crown', name: 'Ashen Crown', base: 'iron_fullhelm', model: 'u_ashen_crown',
    affixes: [{ id: 'life', value: 30 }, { id: 'xpPct', value: 10 }, { id: 'critChance', value: 5 }],
    req: { skill: 'defence', level: 20 },
    flavor: 'Worn by the first who dared to hunt the Cinder brood.',
  },
  scaleguard: {
    id: 'scaleguard', name: 'Scaleguard Hauberk', base: 'steel_chainbody', model: 'u_scaleguard',
    affixes: [{ id: 'armor', value: 12 }, { id: 'life', value: 45 }, { id: 'regen', value: 2 }],
    req: { skill: 'defence', level: 22 },
    flavor: 'Shed scales, stitched by a patient hand.',
  },
};

export const PETS: Record<string, { id: string; name: string; model: string; flavor: string }> = {
  ember_whelp: { id: 'ember_whelp', name: 'Ember Whelp', model: 'whelp', flavor: 'It followed you home. It will not be leaving.' },
  rock_golem: { id: 'rock_golem', name: 'Pebble', model: 'golem', flavor: 'A tiny golem shaken loose from the Emberdeep walls.' },
};
