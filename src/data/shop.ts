/** The Quartermaster sells basics and buys anything (at item value). */
export interface ShopEntry {
  id: string;
  price: number;
  /** Special purchases handled in code instead of adding an item. */
  special?: 'belt';
  name?: string;
  desc?: string;
}

export const SHOP: ShopEntry[] = [
  { id: 'bronze_pickaxe', price: 25 },
  { id: 'bronze_sword', price: 30 },
  { id: 'worn_bow', price: 30 },
  { id: 'apprentice_staff', price: 30 },
  { id: 'leather_cap', price: 20 },
  { id: 'leather_body', price: 35 },
  { id: 'coal', price: 45 },
  { id: 'belt', price: 0, special: 'belt', name: 'Potion Belt Upgrade', desc: '+1 potion charge (max 6).' },
];

/** Potion belt upgrade prices by current max charges. */
export const BELT_PRICES: Record<number, number> = { 3: 500, 4: 2000, 5: 8000 };
