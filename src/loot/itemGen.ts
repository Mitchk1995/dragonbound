import { AFFIXES, AFFIX_LIST, RARE_NAME_A, RARE_NAME_B, type AffixDef } from '../data/affixes';
import { BASES, BASE_LIST, UNIQUES, type BaseItem } from '../data/items';
import { pick, randInt, weighted, type Rng } from '../core/rng';
import type { AffixRoll, Item, Rarity, Slot } from '../types';

let uidCounter = 0;
export function makeUid(rng: Rng = Math.random): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return Math.floor(rng() * 1e9).toString(36) + uidCounter.toString(36);
}

/** Pick a gear base that can drop at this item level, favouring the highest tiers available. */
export function pickBase(rng: Rng, ilvl: number, slot?: Slot): BaseItem {
  const pool = BASE_LIST.filter((b) => b.kind === 'gear' && b.minIlvl !== undefined && b.minIlvl <= ilvl && (!slot || b.slot === slot));
  const weights: Record<string, number> = {};
  for (const b of pool) weights[b.id] = 1 + b.minIlvl! / 3;
  return BASES[weighted(rng, weights)];
}

export function rollAffixValue(rng: Rng, def: AffixDef, ilvl: number): number {
  const lo = def.min + def.per * ilvl;
  const hi = def.max + def.per * ilvl;
  const raw = lo + (hi - lo) * rng();
  const d = def.decimals ?? 0;
  const f = Math.pow(10, d);
  return Math.max(d ? 0.1 : 1, Math.round(raw * f) / f);
}

export function rollAffixes(rng: Rng, slot: Slot, ilvl: number, count: number, exclude: string[] = []): AffixRoll[] {
  const pool = AFFIX_LIST.filter((a) => a.slots.includes(slot) && !exclude.includes(a.id));
  const chosen: AffixRoll[] = [];
  const used = new Set<string>();
  while (chosen.length < count && used.size < pool.length) {
    const weights: Record<string, number> = {};
    for (const a of pool) if (!used.has(a.id)) weights[a.id] = a.weight;
    const id = weighted(rng, weights);
    used.add(id);
    chosen.push({ id, value: rollAffixValue(rng, AFFIXES[id], ilvl) });
  }
  return chosen;
}

function magicName(base: BaseItem, affixes: AffixRoll[]): string {
  const pre = affixes.map((a) => AFFIXES[a.id].prefix).find(Boolean);
  const suf = affixes.map((a) => AFFIXES[a.id].suffix).find(Boolean);
  return [pre, base.name, suf].filter(Boolean).join(' ');
}

export function generateItem(rng: Rng, ilvl: number, rarity: Exclude<Rarity, 'unique'>, slot?: Slot): Item {
  const base = pickBase(rng, ilvl, slot);
  const count = rarity === 'normal' ? 0 : rarity === 'magic' ? randInt(rng, 1, 2) : randInt(rng, 3, 4);
  const affixes = rollAffixes(rng, base.slot!, ilvl, count);
  const item: Item = { uid: makeUid(rng), base: base.id, rarity, ilvl, affixes };
  if (rarity === 'magic') item.name = magicName(base, affixes);
  if (rarity === 'rare') item.name = `${pick(rng, RARE_NAME_A)} ${pick(rng, RARE_NAME_B)}`;
  return item;
}

export function generateUnique(rng: Rng, uniqueId: string, ilvl: number): Item {
  const def = UNIQUES[uniqueId];
  return {
    uid: makeUid(rng),
    base: def.base,
    rarity: 'unique',
    ilvl,
    unique: def.id,
    name: def.name,
    affixes: def.affixes.map((a) => ({ ...a })),
  };
}

/** A plain item of any base: crafted gear, tools, materials, quest items. */
export function makeItem(baseId: string, qty?: number): Item {
  const b = BASES[baseId];
  const item: Item = { uid: makeUid(), base: baseId, rarity: 'normal', ilvl: b?.minIlvl ?? 1, affixes: [] };
  if (qty !== undefined) item.qty = qty;
  return item;
}

/** A crafted item that rolled masterwork: one bonus affix, shown as magic quality. */
export function makeMasterwork(rng: Rng, baseId: string, smithLevel: number): Item {
  const b = BASES[baseId];
  const ilvl = Math.max(1, Math.round(smithLevel / 2));
  const affixes = rollAffixes(rng, b.slot!, ilvl, 1);
  return { uid: makeUid(rng), base: baseId, rarity: 'magic', ilvl, affixes, masterwork: true, name: `Masterwork ${b.name}` };
}

export function itemName(item: Item): string {
  return item.name ?? BASES[item.base]?.name ?? item.base;
}

export function itemReq(item: Item) {
  if (item.unique && UNIQUES[item.unique].req) return UNIQUES[item.unique].req;
  return BASES[item.base]?.req;
}

export function affixText(a: AffixRoll): string {
  const def = AFFIXES[a.id];
  return def ? def.text.replace('{v}', String(a.value)) : `${a.id} ${a.value}`;
}

export function itemValue(item: Item): number {
  const b = BASES[item.base];
  if (!b) return 0;
  if (b.kind !== 'gear') return b.value;
  const mult = { normal: 1, magic: 2.5, rare: 6, unique: 25 }[item.rarity];
  return Math.max(1, Math.round((b.value + item.ilvl) * mult));
}

/** Plain items stack in the bank (like OSRS); anything with rolls is kept individually. */
export const stacksInBank = (item: Item) => item.rarity === 'normal' && !item.affixes.length && !item.unique;
