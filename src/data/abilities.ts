import type { Style } from '../types';

export type AbilityKey = 'Q' | 'W' | 'E' | 'R';

export interface AbilityDef {
  id: string;
  name: string;
  style: Style;
  key: AbilityKey;
  cooldown: number;
  /** Mana spent per cast (one pool shared by every style; see MANA_TUNING). */
  mana: number;
  /** Style level needed to use it. */
  unlock: number;
  /** Damage multiplier relative to a basic hit. */
  mult: number;
  icon: string;
  desc: string;
}

const list: AbilityDef[] = [
  { id: 'cleave', name: 'Cleave', style: 'melee', key: 'Q', cooldown: 3.5, mana: 8, unlock: 1, mult: 1.6, icon: '🌀', desc: 'A wide sweeping strike that hits everything in front of you.' },
  { id: 'leap_slam', name: 'Leap Slam', style: 'melee', key: 'W', cooldown: 8, mana: 14, unlock: 1, mult: 2.2, icon: '⤒', desc: 'Leap to the target area and slam, knocking enemies back.' },
  { id: 'war_cry', name: 'War Cry', style: 'melee', key: 'E', cooldown: 16, mana: 18, unlock: 15, mult: 0, icon: '📯', desc: 'Roar: +35% damage and +20% attack speed for 6 seconds.' },

  { id: 'multishot', name: 'Multishot', style: 'ranged', key: 'Q', cooldown: 3, mana: 8, unlock: 1, mult: 0.75, icon: '⋔', desc: 'Loose a fan of five arrows.' },
  { id: 'evasive_roll', name: 'Evasive Roll', style: 'ranged', key: 'W', cooldown: 5, mana: 6, unlock: 1, mult: 0, icon: '↻', desc: 'Roll toward the cursor, briefly untouchable. Your next shot is a guaranteed critical hit.' },
  { id: 'arrow_rain', name: 'Rain of Arrows', style: 'ranged', key: 'E', cooldown: 10, mana: 16, unlock: 15, mult: 0.55, icon: '☔', desc: 'Arrows pour down on the target area for 2.5 seconds.' },

  { id: 'fireball', name: 'Fireball', style: 'magic', key: 'Q', cooldown: 2.5, mana: 9, unlock: 1, mult: 2.0, icon: '🔥', desc: 'Hurl a fireball that explodes on impact.' },
  { id: 'frost_nova', name: 'Frost Nova', style: 'magic', key: 'W', cooldown: 8, mana: 14, unlock: 1, mult: 1.2, icon: '❄', desc: 'Blast of frost around you that slows enemies by 50%.' },
  { id: 'chain_lightning', name: 'Chain Lightning', style: 'magic', key: 'E', cooldown: 6, mana: 14, unlock: 15, mult: 1.5, icon: 'ϟ', desc: 'Lightning that arcs between up to 5 enemies.' },
];

/** A skill's element: tints its painted HUD tile. */
export type Element = 'physical' | 'rage' | 'wind' | 'nature' | 'fire' | 'frost' | 'lightning' | 'arcane';

export const ABILITY_ELEMENT: Record<string, Element> = {
  cleave: 'physical', leap_slam: 'physical', war_cry: 'rage',
  multishot: 'nature', evasive_roll: 'wind', arrow_rain: 'nature',
  fireball: 'fire', frost_nova: 'frost', chain_lightning: 'lightning',
};

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(list.map((a) => [a.id, a]));
export const abilitiesFor = (style: Style) => list.filter((a) => a.style === style);
export const abilityFor = (style: Style, key: AbilityKey) => list.find((a) => a.style === style && a.key === key);
