import { BASES, TIERS, TIER_ORDER, UNIQUES, pieceId, type TierId } from '../data/items';
import { makeItem } from '../loot/itemGen';
import type { Item, Slot } from '../types';
import { itemArtUrl } from '../ui/approvedArt';
import { BOWS_STAVES, EQUIPMENT, JEWELLERY, LEATHER, MATERIAL_SAMPLE, UNIQUE_IDS, fileOf, frames, make, tier, unique, type Audit, type Probe } from './approvedProbe';
import { equip } from './inspect';

/**
 * The approved artwork in the item windows (see approvedInspect.ts): three inventories, every item hovered and
 * dragged, equipment in each tier and every unique worn, bank, shop, anvil, collection log, each window opened and
 * closed three times, and the captured drag ghost. Returns the inventory audits and the third inventory, which
 * approvedPanel.ts captures last.
 */
export async function itemWindows(c: Probe) {
  const { g, ui, checks, problems, next, closeWindows, side, audit, setInv, invIdx, hover, drag } = c;
  await c.toKeep();
  // Three inventories (28 slots each) between them hold every piece of equipment and every unique: bronze + iron
  // with the four bows, the Ashen Crown and Emberstring beside their approved bases, and a bronze bar; steel +
  // Emberforged with the four staves, Cinderfang, the Wyrmbone Harness and Kindled Ash beside theirs; then leather
  // and jewellery beside every tier's gauntlets and boots (the 256×171 leather pair among square pairs), with
  // materials and a quest item. Checked in the order A, C, B, so B stays for the captures and drags that follow.
  const INV_A = [
    ...[...tier('bronze'), ...tier('iron'), ...BOWS_STAVES.filter((id) => id.endsWith('_bow'))].map(make),
    ...['ashen_crown', 'emberstring'].map(unique),
    { ...makeItem('bronze_bar'), qty: 5 },
  ];
  const INV_B = [
    ...[...tier('steel'), ...tier('ember'), ...BOWS_STAVES.filter((id) => id.endsWith('_staff'))].map(make),
    ...['cinderfang', 'scaleguard', 'kindled_ash'].map(unique),
  ];
  const INV_C = [
    ...[...LEATHER, ...JEWELLERY, ...TIER_ORDER.map((t) => pieceId(t, 'gauntlets')), ...TIER_ORDER.map((t) => pieceId(t, 'boots'))].map(make),
    { ...makeItem('copper_ore'), qty: 12 },
    ...['uncut_ruby', 'cinder_key'].map(make),
  ];
  {
    // Between them: every piece of equipment, every unique, and the materials and quest item.
    const held = new Set([...INV_A, ...INV_B, ...INV_C].map((it) => it.unique ?? it.base));
    for (const id of [...EQUIPMENT, ...UNIQUE_IDS, ...MATERIAL_SAMPLE]) if (!held.has(id)) problems.push(`fixture: ${id} in no inventory`);
  }
  const hoverInv = async (id: string, where = '') => {
    await hover(`inventory ${where}${id}`, `.sidepanel [data-inv="${invIdx(id)}"]`);
    ui.hideTooltip();
  };

  // Every item in each inventory hovered for its card and dragged for its ghost; A and B captured here, C last.
  const inventory: Record<string, Audit> = {};
  const dragGhosts: Record<string, Audit | null> = {};
  ui.showTab('inventory');
  for (const [name, list] of [['bronze-iron', INV_A], ['leather-jewellery', INV_C], ['steel-ember', INV_B]] as const) {
    setInv(list);
    await frames(4);
    inventory[name] = await audit(`inventory ${name}`, side());
    if (list !== INV_C) await next(`inventory-${name}`);
    for (const it of list) await hoverInv(it.unique ?? it.base, `${name} `);
    for (const it of list) {
      const id = it.unique ?? it.base;
      const file = fileOf(itemArtUrl(it));
      dragGhosts[`${name} ${id}`] = await drag(id, file ? [file] : [], false);
    }
  }
  checks.inventory = inventory;
  checks.dragGhosts = dragGhosts;

  await hover('inventory ember_platebody', `.sidepanel [data-inv="${invIdx('ember_platebody')}"]`);
  await next('tooltip-inventory');
  ui.hideTooltip();
  await hover('inventory steel_platebody (rare)', `.sidepanel [data-inv="${invIdx('steel_platebody')}"]`);
  ui.hideTooltip();

  // Equipment in each tier: both loadouts checked (sword / med helm / chainbody with the Bone Amulet and Copper Ring,
  // then longsword / full helm / platebody with the Jade Amulet and Silver Ring, gauntlets and boots in both), the
  // second captured.
  const loadout = (t: TierId, plate: boolean): Partial<Record<Slot, string>> => ({
    weapon: pieceId(t, plate ? 'longsword' : 'sword'), helm: pieceId(t, plate ? 'fullhelm' : 'medhelm'), body: pieceId(t, plate ? 'platebody' : 'chainbody'),
    gloves: pieceId(t, 'gauntlets'), boots: pieceId(t, 'boots'), amulet: plate ? 'jade_amulet' : 'bone_amulet', ring: plate ? 'silver_ring' : 'copper_ring',
  });
  const equipment: Record<string, unknown> = {};
  ui.showTab('equipment');
  for (const t of TIER_ORDER) {
    const both: Record<string, Audit> = {};
    for (const plate of [false, true]) {
      equip(g, loadout(t, plate));
      ui.refresh();
      await frames(3);
      both[plate ? 'plate' : 'chain'] = await audit(`equipment ${t} ${plate ? 'plate' : 'chain'}`, side());
    }
    equipment[t] = both;
    await next(`equipment-${t}`);
  }
  checks.equipment = equipment;
  // The uniques worn (by unique id, ahead of their approved bases), the Emberforged sword and each bow and staff
  // wielded, then leather and the jewellery: each checked and its slot hovered. The first (Cinderfang and the Ashen
  // Crown over the Emberforged plate) is captured with the plate's card.
  const wear = async (label: string, gear: Partial<Record<Slot, Item>>) => {
    Object.assign(g.save.equipment, gear);
    g.prog.recomputeStats();
    g.dressHero();
    ui.refresh();
    await frames(3);
    equipment[label] = await audit(`equipment ${label}`, side());
  };
  await wear('cinderfang + ashen_crown', { weapon: unique('cinderfang'), helm: unique('ashen_crown') });
  await hover('equipment ember_platebody', '.sidepanel [data-eq="body"]');
  await next('tooltip-equipment');
  ui.hideTooltip();
  for (const [slot, id] of [['weapon', 'cinderfang'], ['helm', 'ashen_crown']] as const) {
    await hover(`equipment ${id}`, `.sidepanel [data-eq="${slot}"]`);
    ui.hideTooltip();
  }
  await wear('scaleguard', { body: unique('scaleguard') });
  await hover('equipment scaleguard', '.sidepanel [data-eq="body"]');
  ui.hideTooltip();
  for (const it of [...['ember_sword', ...BOWS_STAVES].map(make), ...['emberstring', 'kindled_ash'].map(unique)]) {
    const id = it.unique ?? it.base;
    const slot: Slot = BASES[it.base].slot ?? 'weapon';
    const gear: Partial<Record<Slot, Item>> = {};
    gear[slot] = it;
    await wear(id, gear);
    await hover(`equipment ${id}`, `.sidepanel [data-eq="${slot}"]`);
    ui.hideTooltip();
  }
  // Leather head to foot (the gloves and boots at 256×171) with the first amulet and ring, then the second pair.
  const worn = async (label: string, ids: string[]) => {
    const gear: Partial<Record<Slot, Item>> = {};
    for (const id of ids) gear[BASES[id].slot!] = make(id);
    await wear(label, gear);
    for (const id of ids) {
      await hover(`equipment ${id}`, `.sidepanel [data-eq="${BASES[id].slot}"]`);
      ui.hideTooltip();
    }
  };
  await worn('leather', [...LEATHER, 'bone_amulet', 'copper_ring']);
  await worn('jade_amulet + silver_ring', ['jade_amulet', 'silver_ring']);
  equip(g, { ...loadout('steel', true), amulet: null, ring: null });

  // Bank: every piece of equipment, every unique and a bar (58 of 120; the audit reads every slot, scrolled
  // into view or not), inventory B beside.
  g.save.bank.length = 0;
  g.save.bank.push(
    ...[...TIER_ORDER.flatMap(tier), ...BOWS_STAVES, ...LEATHER, ...JEWELLERY].map(make),
    ...['ashen_crown', 'cinderfang', 'scaleguard', 'emberstring', 'kindled_ash'].map(unique),
    { ...makeItem('bronze_bar'), qty: 12 },
  );
  ui.showTab('inventory');
  ui.openBank(false);
  await frames(3);
  checks.bank = { panel: await audit('bank', document.querySelector('#panel-bank')), deposit: await audit('bank inventory', side()) };
  await next('bank');
  closeWindows();
  ui.openShop();
  await frames(2);
  checks.shop = { panel: await audit('shop', document.querySelector('#panel-shop')), sellFrom: await audit('shop inventory', side()) };
  await next('shop-sell-mode');
  closeWindows();

  // The anvil's recipe outputs: all four tiers, the Emberforged sword among them; the Cinder Key on its rendered icon.
  const anvil = g.zone.interactables.find((it) => it.kind === 'anvil');
  if (anvil) {
    ui.openCraft('anvil', anvil);
    await frames(2);
    checks.anvil = await audit('anvil', document.querySelector('#panel-craft'));
    for (const t of TIER_ORDER) {
      [...document.querySelectorAll<HTMLElement>('#panel-craft .rg-title')].find((x) => x.textContent === TIERS[t].name)?.scrollIntoView({ block: 'start' });
      await frames(1);
      await next(`anvil-${t}`);
    }
    ui.closeCraftMenu();
  } else problems.push('anvil: none in the keep');

  // The collection log draws uniques and gems only, each with its own artwork.
  ui.openBook('collection');
  await frames(3);
  checks.collection = await audit('collection', document.querySelector('#panel-book'), [...UNIQUE_IDS.map((id) => fileOf(itemArtUrl(unique(id)))!), ...['uncut_sapphire', 'uncut_emerald', 'uncut_ruby'].map((id) => fileOf(itemArtUrl(makeItem(id)))!)]);
  {
    // Entry by entry (the log's slots carry no item data): each unique's own picture, by its name.
    const shown = Object.fromEntries([...document.querySelectorAll<HTMLElement>('#panel-book .clog')].map((e) => [e.title.replace(/ \(.*\)$/, ''), fileOf(e.querySelector('img.art')?.getAttribute('src'))]));
    for (const id of Object.keys(UNIQUES)) {
      const want = fileOf(itemArtUrl(unique(id)));
      if (!(UNIQUES[id].name in shown)) problems.push(`collection: no entry for ${UNIQUES[id].name}`);
      else if (shown[UNIQUES[id].name] !== want) problems.push(`collection ${id}: shows ${shown[UNIQUES[id].name] ?? 'rendered icon'}, routed to ${want ?? 'rendered icon'}`);
    }
    (checks.collection as Record<string, unknown>).entries = shown;
  }
  await next('collection');
  ui.toggle('book', false);

  // Open and close each window three times: one panel while open, none after, the same pictures each time.
  const cycles: Record<string, unknown> = {};
  const cycle = async (name: string, sel: string, open: () => void, close: () => void) => {
    const runs: string[] = [];
    for (let k = 0; k < 3; k++) {
      open();
      await frames(2);
      const a = await audit(`${name} cycle ${k + 1}`, document.querySelector(sel));
      const opened = document.querySelectorAll(sel).length;
      close();
      await frames(2);
      const left = document.querySelectorAll(sel).length;
      if (opened !== 1 || left !== 0) problems.push(`${name} cycle ${k + 1}: ${opened} open, ${left} left after closing`);
      runs.push(`${opened} open · ${a.art.length} art · ${a.rendered} rendered · ${left} after close`);
    }
    if (new Set(runs).size !== 1) problems.push(`${name}: cycles differ: ${runs.join(' | ')}`);
    cycles[name] = runs;
  };
  await cycle('bank', '#panel-bank', () => ui.openBank(false), () => ui.toggle('bank', false));
  await cycle('shop', '#panel-shop', () => ui.openShop(), () => ui.toggle('shop', false));
  if (anvil) await cycle('anvil', '#panel-craft', () => ui.openCraft('anvil', anvil), () => ui.closeCraftMenu());
  await cycle('collection', '#panel-book', () => ui.openBook('collection'), () => ui.toggle('book', false));
  await cycle('equipment tab', '.sidepanel .doll', () => ui.showTab('equipment'), () => ui.showTab('inventory'));
  checks.cycles = cycles;
  checks.openWindowsAfter = [...ui.open];

  // Drag ghost, captured: the inventory's Steel Platebody (every item's ghost was checked with its inventory).
  ui.showTab('inventory');
  ui.refresh();
  await frames(2);
  checks.dragGhost = await drag('steel_platebody', ['steel-platebody-clearance-v3.png'], true);
  return { inventory, invC: INV_C };
}
