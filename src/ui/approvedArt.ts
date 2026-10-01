import type { Item } from '../types';

/**
 * Painted artwork the owner approved (public/icons/approved), shown exactly as supplied in place of a generated
 * icon; the game draws the slot or tile behind it. Matched by exact id only: a unique by its own unique id (never its
 * base's), anything else by its base id. Every piece of equipment and every known unique is listed; whatever is not
 * (materials, quest items, an unknown unique) keeps its rendered icon. Files are 256 px on the long side: 256×256, but
 * the leather gloves and boots are 256×171 and are fitted whole, at their own aspect, by style.css.
 */
export const APPROVED_DIR = 'icons/approved';

const ITEM_ART = new Map<string, string>([
  // The whole bronze, iron, steel and Emberforged sets; every gauntlet is a thumbless version (bronze and steel v2).
  ['bronze_sword', 'bronze-sword-icon-v1.png'],
  ['bronze_longsword', 'bronze-longsword-icon-v1.png'],
  ['bronze_medhelm', 'bronze-medhelm-faceted-icon-v1.png'],
  ['bronze_fullhelm', 'bronze-fullhelm-faceted-icon-v1.png'],
  ['bronze_chainbody', 'bronze-chainbody-icon-v1.png'],
  ['bronze_platebody', 'bronze-platebody-clearance-icon-v1.png'],
  ['bronze_gauntlets', 'bronze-gauntlets-thumbless-icon-v2.png'],
  ['bronze_boots', 'bronze-boots-icon-v1.png'],
  ['bronze_pickaxe', 'bronze-pickaxe-icon-v1.png'],
  ['iron_sword', 'iron-sword-icon-v1.png'],
  ['iron_longsword', 'iron-longsword-icon-v1.png'],
  ['iron_medhelm', 'iron-medhelm-icon-v1.png'],
  ['iron_fullhelm', 'iron-fullhelm-icon-v1.png'],
  ['iron_chainbody', 'iron-chainbody-icon-v1.png'],
  ['iron_platebody', 'iron-platebody-icon-v1.png'],
  ['iron_gauntlets', 'iron-gauntlets-icon-v1.png'],
  ['iron_boots', 'iron-boots-icon-v1.png'],
  ['iron_pickaxe', 'iron-pickaxe-clear-margin-icon-v2.png'],
  ['steel_sword', 'steel-sword-icon-v1.png'],
  ['steel_longsword', 'steel-longsword-icon-v1.png'],
  ['steel_medhelm', 'steel-medhelm-icon-v1.png'],
  ['steel_fullhelm', 'steel-full-helm-icon-v1.png'],
  ['steel_chainbody', 'steel_chainbody.png'],
  ['steel_platebody', 'steel-platebody-clearance-v3.png'],
  ['steel_gauntlets', 'steel_gauntlets-v2.png'],
  ['steel_boots', 'steel_boots.png'],
  ['steel_pickaxe', 'steel-pickaxe-icon-v2.png'],
  ['ember_sword', 'ember_sword-icon-v3.png'],
  ['ember_longsword', 'ember_longsword-icon-v2.png'],
  ['ember_medhelm', 'ember_medhelm-icon-v1.png'],
  ['ember_fullhelm', 'ember_fullhelm-icon-v1.png'],
  ['ember_chainbody', 'ember_chainbody-icon-v1.png'],
  ['ember_platebody', 'ember_platebody-icon-v1.png'],
  ['ember_gauntlets', 'ember_gauntlets-icon-v1.png'],
  ['ember_boots', 'ember_boots-icon-v1.png'],
  ['ember_pickaxe', 'ember_pickaxe-icon-v1.png'],
  // The four bows and four staves.
  ['worn_bow', 'worn-bow-redesign-v2.png'],
  ['hunter_bow', 'hunter-bow-redesign-v2.png'],
  ['recurve_bow', 'recurve-bow-redesign-v2.png'],
  ['drakebone_bow', 'drakebone-bow-redesign-v2.png'],
  ['oak_staff', 'oak_staff-redesign-v3.png'],
  ['apprentice_staff', 'apprentice_staff-redesign-v5.png'],
  ['runed_staff', 'runed_staff-redesign-v5.png'],
  ['ember_staff', 'ember_staff-redesign-v6.png'],
  // Leather (the gloves and boots are the two 256×171 files) and jewellery.
  ['leather_cap', 'leather_cap-icon-v1.png'],
  ['leather_body', 'leather_body-icon-v2.png'],
  ['leather_gloves', 'leather_gloves-icon-v1.png'],
  ['leather_boots', 'leather_boots-icon-v1.png'],
  ['bone_amulet', 'bone_amulet-icon-v1.png'],
  ['jade_amulet', 'jade_amulet-icon-v1.png'],
  ['copper_ring', 'copper_ring-icon-v1.png'],
  ['silver_ring', 'silver_ring-icon-v1.png'],
]);

/** By unique id. `scaleguard` is the Wyrmbone Harness's save id. */
const UNIQUE_ART = new Map<string, string>([
  ['cinderfang', 'cinderfang-redesign-v1.png'],
  ['ashen_crown', 'ashen-crown-redesign-v1.png'],
  ['scaleguard', 'wyrmbone-harness-redesign-v1.png'],
  ['emberstring', 'emberstring-aligned-v2.png'],
  ['kindled_ash', 'kindled-ash-aligned-v2.png'],
]);

const ABILITY_ART = new Map<string, string>([['cleave', 'cleave-straight-hilt-v5.png']]);

/** Every approved file, for checks. */
export const APPROVED_FILES = [...ITEM_ART.values(), ...UNIQUE_ART.values(), ...ABILITY_ART.values()];

const url = (file: string) => `./${APPROVED_DIR}/${file}`;

/**
 * The approved artwork for this item, or null. A unique uses its own artwork or none: it never falls back to its
 * base's, so an unknown unique on an approved base keeps its rendered icon.
 */
export function itemArtUrl(item: Pick<Item, 'base' | 'unique'>): string | null {
  const file = item.unique ? UNIQUE_ART.get(item.unique) : ITEM_ART.get(item.base);
  return file ? url(file) : null;
}

/** The approved artwork for an ability's console tile, or null. */
export function abilityArtUrl(id: string): string | null {
  const file = ABILITY_ART.get(id);
  return file ? url(file) : null;
}
