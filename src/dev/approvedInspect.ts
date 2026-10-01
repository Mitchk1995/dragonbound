import * as THREE from 'three';
import { BASES, BASE_LIST, PIECES, TIERS, TIER_ORDER, UNIQUES, pieceId, type TierId } from '../data/items';
import { RECIPES } from '../data/recipes';
import { SHOP } from '../data/shop';
import { KEEP_STAGE } from '../data/zones';
import { GroundItem } from '../entities/groundItem';
import type { Game } from '../game';
import { generateUnique, makeItem, makeMasterwork } from '../loot/itemGen';
import { Rig, newAnimState, type AttackKind } from '../render/anim';
import { itemIconUrl } from '../render/icons3d';
import { HeroDresser, makeModel, roleOf } from '../render/registry';
import type { Item, Rarity, Slot } from '../types';
import { APPROVED_DIR, APPROVED_FILES, itemArtUrl } from '../ui/approvedArt';
import { itemSlot } from '../ui/dom';
import { swapSlots } from '../ui/hudLayout';
import { Studio, equip, fit } from './inspect';

/**
 * `npm run inspect -- approved`: the approved artwork (72 files: all 52 pieces of equipment, 14 materials and quest
 * items, the five uniques, Cleave) in every real consumer. `approved:ui` captures
 * the consumers (approved-01…): two inventories, equipment in each tier, item tooltips (the equipment one worn with
 * Cinderfang and the Ashen Crown), bank, shop sell mode, the anvil's four tier groups, the collection log, drag
 * ghost, the Cleave console tile (ready / cooling / no mana / hover / 720p), bank, equipment and anvil again at
 * 1280×720, then a close-up sheet per tier, one of the bows, staves and uniques, one of leather and jewellery with
 * materials and a quest item, a third inventory of leather and jewellery (31), and last the approved inventory panel with a
 * pressed item selected (32) and carried to its new slot by Sort (33). `approved:fit` captures the Steel Platebody's
 * fit as worn and dropped and the bare hand beside the gauntlets (approved-31…, unchanged: in a full run its first
 * captures share the numbers 31-33 with the last ui captures, under their own names). Captures are
 * inspect/approved-*.png.
 * Every piece of equipment and every unique is checked in the inventory (hovered for its card and dragged for its
 * ghost), worn in the equipment panel and stored in the bank; the shop and anvil check whatever they list.
 * report.json gets `approved`: each file's decoded size, and per consumer the approved files actually shown, the
 * count of rendered icons, and `problems` (an image without a source, not loaded, decoded at other than its supplied
 * size, drawn other than whole at its own aspect, or a slot whose picture differs from what approvedArt routes its
 * item to). `checks.problems` gathers them all: it should be empty. Also open/close `cycles`, `tooltips`,
 * `dragGhosts`, `inventoryPanel` (selection through Sort, stale cards, folding mid-drag, bank and shop footers),
 * `checks.hands` and `checks.drop`.
 */

const tier = (t: TierId) => PIECES.map((p) => pieceId(t, p.key));
const ROUTED = (id: string) => !!itemArtUrl(makeItem(id));
const EQUIPMENT = BASE_LIST.filter((b) => b.kind === 'gear' || b.kind === 'tool').map((b) => b.id);
const BOWS_STAVES = BASE_LIST.filter((b) => b.model?.startsWith('bow_') || b.model?.startsWith('staff_')).map((b) => b.id);
const LEATHER = ['leather_cap', 'leather_body', 'leather_gloves', 'leather_boots'];
const JEWELLERY = BASE_LIST.filter((b) => b.slot === 'amulet' || b.slot === 'ring').map((b) => b.id);
/** Materials and a quest item, carried beside the equipment. */
const MATERIAL_SAMPLE = ['bronze_bar', 'copper_ore', 'uncut_ruby', 'cinder_key'];
/** Every unique, each with its own approved artwork (by unique id, never its base's). */
const UNIQUE_IDS = Object.keys(UNIQUES);
/** The shipped size of each file: 256×256 but for the leather gloves and boots. */
const SIZE: Record<string, [number, number]> = { 'leather_gloves-icon-v1.png': [256, 171], 'leather_boots-icon-v1.png': [256, 171] };
const sizeOf = (file: string): [number, number] => SIZE[file] ?? [256, 256];
/** A few approved items in other rarities, so their bevels show under the artwork. */
const RARITY: Record<string, Rarity> = { bronze_boots: 'rare', iron_longsword: 'magic', steel_platebody: 'rare', ember_fullhelm: 'magic', recurve_bow: 'magic', drakebone_bow: 'rare', apprentice_staff: 'magic', leather_boots: 'magic', silver_ring: 'rare' };

type Shot = (name: string) => Promise<void>;
type Cell = Parameters<Studio['sheet']>[0][number];
interface Audit { art: string[]; rendered: number; problems: string[] }

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};
const fileOf = (src: string | null | undefined) => (src ? src.split('/').pop()! : null);

const unique = (id: string): Item => generateUnique(Math.random, id, 20);
const make = (id: string): Item => (id === 'iron_platebody' ? makeMasterwork(Math.random, id, 99) : { ...makeItem(id), ...(RARITY[id] ? { rarity: RARITY[id] } : {}) });

export async function approvedSuite(g: Game, shot: Shot, scope: 'ui' | 'fit' | '' = '') {
  const ui = g.ui as any;
  const p = g.player;
  const checks: Record<string, unknown> = {};
  const problems: string[] = [];
  let n = 1;
  const next = (name: string) => shot(`approved-${String(n++).padStart(2, '0')}-${name}`);
  const closeWindows = () => {
    for (const id of ['bank', 'shop', 'keep', 'craft', 'book']) ui.toggle(id, false);
  };
  const toKeep = async () => {
    g.travel('keep', true);
    await frames(15);
    p.pos.set(KEEP_STAGE.x, 0, KEEP_STAGE.z);
    p.stop();
    g.camPos.copy(p.pos);
  };

  /** The item a game slot under `img` shows, from the save or the panel's own data; undefined outside one. */
  const itemOf = (img: HTMLElement): Item | null | undefined => {
    const c = img.closest<HTMLElement>('[data-inv], [data-eq], [data-bank], [data-buy], .recipe');
    if (!c) return undefined;
    const d = c.dataset;
    if (d.inv !== undefined) return g.save.inventory[Number(d.inv)];
    if (d.eq !== undefined) return g.save.equipment[d.eq as Slot];
    if (d.bank !== undefined) return g.save.bank[Number(d.bank)];
    if (d.buy !== undefined) {
      const e = SHOP[Number(d.buy)];
      return e.special ? null : makeItem(e.id);
    }
    if (d.r !== undefined) return makeItem(RECIPES[d.r].out);
    return undefined;
  };
  /**
   * Every image under `root` once decoded: the approved files shown, how many rendered icons, and anything wrong.
   * `expect` overrides the per-slot routing check with the exact approved files the root should show.
   */
  const audit = async (where: string, root: ParentNode | null, expect?: string[]): Promise<Audit> => {
    const imgs = root ? [...root.querySelectorAll<HTMLImageElement>('img')] : [];
    await Promise.all(imgs.map((i) => (i.getAttribute('src') ? i.decode().catch(() => undefined) : undefined)));
    const out: Audit = { art: [], rendered: 0, problems: [] };
    if (!root) out.problems.push('not on screen');
    for (const i of imgs) {
      const src = i.getAttribute('src');
      const isArt = i.classList.contains('art');
      // A console tile without artwork (or without a skill) leaves its images empty by design.
      if (!src) {
        if (!i.closest('.sk')) out.problems.push('img without src');
        continue;
      }
      const file = fileOf(src)!;
      if (!i.complete || !i.naturalWidth) out.problems.push(`not loaded: ${isArt ? file : 'rendered icon'}`);
      if (isArt) {
        out.art.push(file);
        const [w, h] = sizeOf(file);
        if (i.naturalWidth !== w || i.naturalHeight !== h) out.problems.push(`${file} decoded at ${i.naturalWidth}×${i.naturalHeight}, supplied ${w}×${h}`);
        // In a slot or drag ghost the file is drawn whole at its own aspect, never stretched to the square box.
        const fitted = i.closest('.slot, .dragghost') ? getComputedStyle(i).objectFit : 'contain';
        if (fitted !== 'contain') out.problems.push(`${file} drawn with object-fit ${fitted}`);
      } else out.rendered++;
      const it = expect ? undefined : itemOf(i);
      if (it) {
        const want = fileOf(itemArtUrl(it));
        const got = isArt ? file : null;
        if (want !== got) out.problems.push(`${it.unique ?? it.base}: shows ${got ?? 'rendered icon'}, routed to ${want ?? 'rendered icon'}`);
      }
    }
    if (expect) {
      const a = [...out.art].sort(), b = [...expect].sort();
      if (a.join() !== b.join()) out.problems.push(`shows [${a.join(', ')}], expected [${b.join(', ')}]`);
    }
    problems.push(...out.problems.map((x) => `${where}: ${x}`));
    return out;
  };

  // Every file decodes, at its own size.
  const files = await Promise.all(
    APPROVED_FILES.map(
      (file) =>
        new Promise<Record<string, unknown>>((res) => {
          const im = new Image();
          im.onload = () => res({ file, w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => {
            console.error(`approved art failed to load: ${file}`);
            res({ file, error: 'load failed' });
          };
          im.src = `./${APPROVED_DIR}/${file}`;
        }),
    ),
  );

  if (scope !== 'fit') {
    // Each file decoded at its supplied size; every piece of equipment and every unique routed to artwork (anything
    // without would show its rendered icon).
    for (const f of files) {
      const [w, h] = sizeOf(f.file as string);
      if (f.error) problems.push(`file ${f.file}: ${f.error}`);
      else if (f.w !== w || f.h !== h) problems.push(`file ${f.file}: decoded at ${f.w}×${f.h}, supplied ${w}×${h}`);
    }
    for (const id of EQUIPMENT) if (!ROUTED(id)) problems.push(`routing: ${id} has no approved artwork`);
    for (const id of UNIQUE_IDS) if (!itemArtUrl({ base: UNIQUES[id].base, unique: id })) problems.push(`routing: unique ${id} has no approved artwork`);

    // ─── Item consumers ─────────────────────────────────────────────────────
    await toKeep();
    const side = () => document.querySelector('.sidepanel');
    const panels = () => document.querySelector('#panels');
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
    const setInv = (list: Item[]) => {
      if (list.length > g.save.inventory.length) problems.push(`fixture: ${list.length} items for ${g.save.inventory.length} slots`);
      g.save.inventory = g.save.inventory.map((_, i) => list[i] ?? null);
      ui.refresh();
    };

    // Hover cards: the slot keeps the picture its item routes to (artwork, or the rendered icon for a material) and
    // the card its name, stats and hints.
    const tooltips: Record<string, unknown> = {};
    const hover = async (label: string, sel: string) => {
      const c = document.querySelector<HTMLElement>(sel);
      c?.dispatchEvent(new MouseEvent('mouseenter'));
      await frames(2);
      const tip = document.getElementById('tooltip')!;
      const img = c?.querySelector<HTMLElement>('img');
      const it = img ? itemOf(img) : undefined;
      const r = {
        slotArt: fileOf(c?.querySelector('img.art')?.getAttribute('src')),
        routed: it ? fileOf(itemArtUrl(it)) : undefined,
        visible: !!c && getComputedStyle(tip).display !== 'none' && tip.offsetWidth > 0,
        lines: [...tip.children].map((d) => d.textContent?.trim()).filter(Boolean),
      };
      if (!r.visible) problems.push(`tooltip ${label}: not shown`);
      if (!it) problems.push(`tooltip ${label}: hovered slot holds no item`);
      else if (r.routed && !r.slotArt) problems.push(`tooltip ${label}: hovered slot shows no artwork`);
      else if (r.slotArt !== r.routed) problems.push(`tooltip ${label}: hovered slot shows ${r.slotArt ?? 'rendered icon'}, routed to ${r.routed ?? 'rendered icon'}`);
      tooltips[label] = r;
    };
    /** The inventory slot holding this exact id: a unique by its unique id, anything else by its base (never a unique on it). */
    const invIdx = (id: string) => g.save.inventory.findIndex((it) => it && (it.unique ?? it.base) === id);
    const hoverInv = async (id: string, where = '') => {
      await hover(`inventory ${where}${id}`, `.sidepanel [data-inv="${invIdx(id)}"]`);
      ui.hideTooltip();
    };
    // Drag ghost: press an inventory item and move past the drag threshold; release where it started.
    const drag = async (id: string, want: string[], capture: boolean): Promise<Audit | null> => {
      const from = document.querySelector<HTMLElement>(`.sidepanel [data-inv="${invIdx(id)}"]`);
      if (!from) {
        problems.push(`drag ghost: no ${id} in the inventory`);
        return null;
      }
      const r = from.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      from.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: cx, clientY: cy }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx - 90, clientY: cy - 40 }));
      await frames(2);
      const a = await audit(`drag ghost ${id}`, document.querySelector('.dragghost'), want);
      if (capture) await next('drag-ghost');
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: cx, clientY: cy }));
      // The press selected the item: cleared, so the art captures that follow show every slot plain.
      ui.panels.clearSelection();
      ui.refresh();
      await frames(2);
      return a;
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

    // ─── Cleave on the console ─────────────────────────────────────────────
    g.travel('foothills', true);
    await frames(15);
    const clear = () => {
      for (const e of g.zone.enemies) {
        e.dead = true;
        e.obj.removeFromParent();
      }
      g.zone.enemies = [];
      g.hovered = null;
    };
    clear();
    equip(g, { weapon: 'steel_longsword' });
    p.hp = g.stats.maxHp;
    p.cds = {};
    g.combat.mana = g.stats.maxMana;
    await frames(4);
    checks.console = await audit('console', document.querySelector('.skillrow'), ['cleave-straight-hilt-v5.png']);
    await next('console-ready');
    p.cds = { cleave: 2 };
    await frames(3);
    await next('console-cooling');
    p.cds = {};
    g.combat.mana = 3;
    await frames(3);
    await next('console-nomana');
    g.combat.mana = g.stats.maxMana;
    await frames(2);
    const q = document.querySelector<HTMLElement>('.sk[data-key="Q"]');
    if (q) {
      q.dispatchEvent(new MouseEvent('mouseenter'));
      await next('console-cleave-hover');
      ui.hideTooltip();
    }
    const qTile = document.querySelector<HTMLElement>('.sk[data-key="Q"]')?.cloneNode(true) as HTMLElement | undefined;

    // The smallest supported window: the console, then bank, equipment and anvil back in the keep.
    const api = window.electronAPI?.inspect;
    if (api?.resize) {
      await api.resize(1280, 720);
      await frames(20);
      await next('console-720');
      const at720: Record<string, unknown> = {};
      await toKeep();
      await frames(10);
      ui.showTab('inventory');
      ui.openBank(false);
      await frames(3);
      at720.bank = await audit('720 bank', panels());
      at720.inventory = await audit('720 inventory', side());
      await next('720-bank');
      closeWindows();
      ui.showTab('equipment');
      await frames(3);
      at720.equipment = await audit('720 equipment', side());
      await next('720-equipment');
      ui.showTab('inventory');
      const anvil720 = g.zone.interactables.find((it) => it.kind === 'anvil');
      if (anvil720) {
        ui.openCraft('anvil', anvil720);
        await frames(3);
        at720.anvil = await audit('720 anvil', panels());
        await next('720-anvil');
        ui.closeCraftMenu();
      }
      checks.at720 = at720;
      await api.resize(1600, 900);
      await frames(20);
    } else problems.push('viewport: no resize API, 1280×720 not captured');

    // ─── Close-ups: real slot markup at 1× and 2.5×, beside the rendered icon each approved image replaces ───────
    // One sheet per tier (Cleave's tile with bronze), one of the bows, staves and uniques, then one of leather and
    // jewellery with materials and a quest item.
    document.body.classList.add('inspect-clean');
    const rendered = (it: Item) => `<div class="slot r-${it.rarity} k-${BASES[it.base]?.kind ?? 'gear'}"><img src="${itemIconUrl(it)}" alt="" draggable="false"></div>`;
    const sheetOf = async (name: string, cols: number, rows: [string, Item][], withRendered: boolean, tile?: HTMLElement) => {
      const sheet = document.createElement('div');
      sheet.id = 'approved-sheet';
      sheet.innerHTML = `<style>
        #approved-sheet { position: fixed; inset: 0; z-index: 2000; background: #1c1a1e; padding: 12px; display: grid; grid-template-columns: repeat(${cols}, max-content); gap: 14px 30px; align-content: start; font: 12px 'Alegreya Sans', sans-serif; color: #cfc6b8; }
        #approved-sheet .ar > div { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
        #approved-sheet .z { zoom: 2.5; }
        #approved-sheet i { color: #8f877c; }
      </style>`;
      sheet.innerHTML += rows.map(([label, it]) => {
        const file = fileOf(itemArtUrl(it));
        const cells = `${itemSlot(it)}<div class="z">${itemSlot(it)}</div>${withRendered ? `<div class="z">${rendered(it)}</div>` : ''}`;
        return `<div class="ar">${label}<br><i>${file ?? 'rendered icon'} · 1× · 2.5×${withRendered ? ' · rendered 2.5×' : ''}</i><div>${cells}</div></div>`;
      }).join('');
      if (tile) {
        const wrap = document.createElement('div');
        wrap.className = 'ar';
        wrap.innerHTML = 'Cleave tile (Q)<br><i>cleave-straight-hilt-v5.png · 1× · 2.5×</i><div></div>';
        const big = document.createElement('div');
        big.className = 'z';
        big.appendChild(tile.cloneNode(true));
        wrap.lastElementChild!.append(tile, big);
        sheet.appendChild(wrap);
      }
      document.body.appendChild(sheet);
      await frames(10); // the 3D icons render on first use; the PNGs decode
      const want = rows.flatMap(([, it]) => (itemArtUrl(it) ? [fileOf(itemArtUrl(it))!, fileOf(itemArtUrl(it))!] : []));
      const a = await audit(`closeup ${name}`, sheet, tile ? [...want, 'cleave-straight-hilt-v5.png', 'cleave-straight-hilt-v5.png'] : want);
      await next(`closeup-${name}`);
      sheet.remove();
      return a;
    };
    const closeup: Record<string, Audit> = {};
    for (const t of TIER_ORDER)
      closeup[t] = await sheetOf(t, 3, tier(t).map((id): [string, Item] => [`${BASES[id].name}${ROUTED(id) ? '' : ' (unrouted)'}`, makeItem(id)]), true, t === 'bronze' ? qTile : undefined);
    // The Emberforged Longsword, the four bows and four staves, then each unique, beside the rendered icon it replaces
    // (a unique's own model, not its base).
    closeup.weaponsUniques = await sheetOf('weapons-uniques', 4, [
      ...['ember_longsword', ...BOWS_STAVES].map((id): [string, Item] => [BASES[id].name, makeItem(id)]),
      ...UNIQUE_IDS.map((id): [string, Item] => {
        const it = unique(id);
        return [`${it.name} (unique on ${BASES[it.base].name})`, it];
      }),
    ], true);
    // Leather (the gloves and boots 256×171, fitted whole) and jewellery, then materials and a quest item.
    closeup.leatherJewellery = await sheetOf('leather-jewellery-materials', 4, [
      ...[...LEATHER, ...JEWELLERY].map((id): [string, Item] => [`${BASES[id].name}${SIZE[fileOf(itemArtUrl(makeItem(id)))!] ? ' (256×171)' : ''}`, makeItem(id)]),
      ...MATERIAL_SAMPLE.map((id): [string, Item] => [BASES[id].name, makeItem(id)]),
    ], true);
    checks.closeup = closeup;
    document.body.classList.remove('inspect-clean');

    // The third inventory, leather and jewellery among every tier's gauntlets and boots, captured last so the
    // numbers before it stay as they were.
    ui.showTab('inventory');
    setInv(INV_C);
    await frames(4);
    inventory['leather-jewellery capture'] = await audit('inventory leather-jewellery capture', side());
    await next('inventory-leather-jewellery');
    checks.tooltips = tooltips;

    // ─── The approved inventory panel (captured after everything above, so its numbers stay) ────────────────
    // Its title, six tabs, 28 slots and the coins and Sort in the footer; a press selects exactly the pressed item's
    // slot and Sort carries the selection with its item; a card over a slot whose item changes goes; folding mid-drag
    // leaves no ghost, dimmed slot or selection; bank and shop keep their footer hints.
    {
      const panel: Record<string, unknown> = {};
      const bad = (what: string) => problems.push(`inventory panel: ${what}`);
      const slots = () => [...document.querySelectorAll<HTMLElement>('.sidepanel [data-inv]')];
      const selected = () => slots().filter((c) => c.classList.contains('sel')).map((c) => Number(c.dataset.inv));
      const tip = document.getElementById('tooltip')!;
      const tipShown = () => getComputedStyle(tip).display !== 'none';
      const centre = (i: number) => {
        const r = document.querySelector<HTMLElement>(`.sidepanel [data-inv="${i}"]`)!.getBoundingClientRect();
        return { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      };
      const sp = side()!;
      panel.title = sp.querySelector('.stitle')?.textContent;
      panel.tabs = sp.querySelectorAll('.stab').length;
      panel.slots = slots().length;
      panel.foot = [...sp.querySelectorAll('.invfoot > *')].map((e) => e.textContent?.trim());
      if (panel.title !== 'Inventory') bad(`titled ${panel.title}`);
      if (panel.tabs !== 6) bad(`${panel.tabs} tabs`);
      if (panel.slots !== 28 || g.save.inventory.length !== 28) bad(`${panel.slots} slots for ${g.save.inventory.length} items`);
      if (!sp.querySelector('.invfoot .goldline') || !sp.querySelector('.invfoot [data-act="sort"]')) bad('footer lacks the coins or Sort');

      // The copper ore moved to the last slot and pressed (a material: the press only selects it), then Sort, which
      // brings it up behind the equipment: the selection must go with it.
      const ore = g.save.inventory[invIdx('copper_ore')]!;
      const last = g.save.inventory.length - 1;
      swapSlots(g.save.inventory, invIdx('copper_ore'), last);
      ui.refresh();
      await frames(2);
      const at = centre(last);
      document.querySelector(`.sidepanel [data-inv="${last}"]`)!.dispatchEvent(new MouseEvent('mousedown', at));
      window.dispatchEvent(new MouseEvent('mouseup', at));
      await frames(2);
      panel.pressed = { at: last, selected: selected() };
      if (selected().join() !== String(last)) bad(`pressing the copper ore in slot ${last} selects [${selected().join()}]`);
      await next('inventory-selected');
      sp.querySelector<HTMLElement>('[data-act="sort"]')!.click();
      await frames(2);
      const now = g.save.inventory.indexOf(ore);
      panel.sorted = { at: now, selected: selected() };
      if (now === last) bad('Sort left the copper ore in the last slot');
      if (selected().join() !== String(now)) bad(`after Sort the selection is [${selected().join()}], the copper ore at ${now}`);
      await next('inventory-sorted');

      // A card over a slot whose item is swapped away under it goes on the redraw.
      const held = g.save.inventory.findIndex(Boolean), gap = g.save.inventory.indexOf(null);
      document.querySelector(`.sidepanel [data-inv="${held}"]`)!.dispatchEvent(new MouseEvent('mouseenter'));
      await frames(1);
      const shownBefore = tipShown();
      swapSlots(g.save.inventory, held, gap);
      ui.refresh();
      await frames(1);
      panel.staleCard = { shownBefore, shownAfter: tipShown() };
      if (!shownBefore || tipShown()) bad(`card over a changed slot: shown ${shownBefore} before, ${tipShown()} after`);
      swapSlots(g.save.inventory, gap, held);
      ui.refresh();

      // Fold mid-drag, release, then fold and reopen three times.
      const before = [...g.save.inventory];
      const from = centre(held);
      document.querySelector(`.sidepanel [data-inv="${held}"]`)!.dispatchEvent(new MouseEvent('mousedown', from));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: from.clientX - 60, clientY: from.clientY - 30 }));
      await frames(1);
      const ghostWhileDragging = !!document.querySelector('.dragghost');
      ui.pressTab('inventory');
      await frames(1);
      window.dispatchEvent(new MouseEvent('mouseup', centre(held)));
      panel.foldMidDrag = { ghostWhileDragging, ghostAfter: !!document.querySelector('.dragghost'), dimmed: document.querySelectorAll('.dragfrom').length, collapsed: !!document.querySelector('.sidepanel.collapsed') };
      if (!ghostWhileDragging) bad('no ghost while dragging');
      if (document.querySelector('.dragghost') || document.querySelector('.dragfrom')) bad('folding mid-drag left a ghost or dimmed slot');
      if (g.save.inventory.some((it, i) => it !== before[i])) bad('a drag cancelled by folding still moved items');
      const reopen: string[] = [];
      for (let k = 0; k < 3; k++) {
        if (!document.querySelector('.sidepanel.collapsed')) ui.pressTab('inventory');
        await frames(1);
        const folded = !!document.querySelector('.sidepanel.collapsed') && !tipShown();
        ui.pressTab('inventory');
        await frames(2);
        reopen.push(`${folded ? 'folded' : 'not folded'} · ${slots().length} slots · ${selected().length} selected · ${document.querySelectorAll('.dragghost').length} ghosts`);
      }
      panel.reopen = reopen;
      if (reopen.some((r) => r !== 'folded · 28 slots · 0 selected · 0 ghosts')) bad(`fold and reopen: ${reopen.join(' | ')}`);

      // Bank and shop: their hint in the footer, Sort beside it, no coins.
      for (const [name, open, hint] of [['bank', () => ui.openBank(false), 'Click to deposit'], ['shop', () => ui.openShop(), 'Click to sell']] as const) {
        open();
        await frames(2);
        const foot = [...document.querySelectorAll('.sidepanel .invfoot > *')].map((e) => e.textContent?.trim());
        panel[name] = foot;
        if (foot.join('|') !== `${hint}|Sort`) bad(`${name} footer shows [${foot.join(', ')}]`);
        closeWindows();
      }
      ui.panels.clearSelection();
      ui.refresh();
      checks.inventoryPanel = panel;
    }
  }

  if (scope !== 'ui') {
    // ─── Steel Platebody fit (read-only: the shipped GLB, rig and dresser as the game uses them) ────────────
    n = 31;
    document.body.classList.add('inspect-clean');
    const st = new Studio(g);
    const LOOK = { name: '', skin: 1, hair: 2, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
    const POSES: [string, { walk?: number; kind?: AttackKind; t?: number }][] = [
      ['idle', {}], ['walk f8', { walk: 8 }], ['walk f20', { walk: 20 }], ['swing 0.3', { kind: 'swing', t: 0.3 }],
      ['swing 0.55', { kind: 'swing', t: 0.55 }], ['slam 0.3', { kind: 'slam', t: 0.3 }], ['slam 0.55', { kind: 'slam', t: 0.55 }], ['cast 0.55', { kind: 'cast', t: 0.55 }],
    ];
    const hero = (pose: (typeof POSES)[number][1], helm: boolean) => {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      const gear: Partial<Record<Slot, Item>> = { body: makeItem('steel_platebody'), weapon: makeItem('steel_longsword') };
      if (helm) gear.helm = makeItem('steel_fullhelm');
      new HeroDresser(m).dress(LOOK, gear);
      const rig = new Rig(m.root);
      if (pose.walk !== undefined) {
        const s = { ...newAnimState(), speed: 5.6 };
        for (let f = 0; f <= pose.walk; f++) rig.update(1 / 60, s);
      } else rig.update(0, { ...newAnimState(), ...(pose.kind ? { attackKind: pose.kind, attack: pose.t! } : {}) });
      return holder;
    };
    const sheetOf = async (name: string, cells: Cell[], cols: number, rows: number) => {
      st.sheet(cells, cols, rows);
      await next(name);
      st.clear(cells.map((c) => c.obj));
    };
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // The gameplay camera's pitch: (0, 21, 14) per zoom unit, looking at the player's waist.
    const gameDir = v(0, 21, 14).normalize();

    // Neck: the gorget against the bare head (beardless so the chin line shows), then under the full helm.
    const NECK: [string, THREE.Vector3][] = [['front', v(0, 1.78, 1.35)], ['side', v(1.35, 1.78, 0)], ['back', v(0, 1.78, -1.35)], ['3/4 top', v(-0.85, 2.45, 0.85)]];
    await sheetOf('fit-neck', [false, true].flatMap((helm) => NECK.map(([view, eye]): Cell => ({ label: `${helm ? 'full helm' : 'no helm'} · ${view}`, obj: hero({}, helm), eye, at: v(0, 1.7, 0) }))), 4, 2);
    await sheetOf('fit-neck-poses', POSES.map(([label, pose]): Cell => ({ label: `neck · ${label} · side`, obj: hero(pose, false), eye: v(1.5, 1.85, 0.25), at: v(0, 1.66, 0) })), 4, 2);
    // Arms against the cuirass: front, and from the gameplay camera's pitch.
    await sheetOf('fit-arms-front', POSES.map(([label, pose]): Cell => ({ label: `arms · ${label} · front`, obj: hero(pose, true), eye: v(0.25, 1.55, 4.2), at: v(0, 1.3, 0) })), 4, 2);
    await sheetOf('fit-arms-game', POSES.map(([label, pose]): Cell => ({ label: `arms · ${label} · game pitch`, obj: hero(pose, true), eye: v(0, 1.2, 0).addScaledVector(gameDir, 4.6), at: v(0, 1.2, 0) })), 4, 2);

    // Hands (the owner asked for thumbless gauntlets, taking the hero's hands to have no thumbs): the bare hero hand
    // beside the existing glove models, idle, close on the left hand; nothing else worn so the sleeves match.
    // Steel stands for the plate model bronze and iron share (gloves_p); Emberforged has its own (gloves_e).
    const HANDS: [string, Item | null][] = [['bare hand', null], ['Steel Gauntlets', makeItem('steel_gauntlets')], ['Emberforged Gauntlets', makeItem('ember_gauntlets')], ['Leather Gloves', makeItem('leather_gloves')]];
    const handed = (gloves: Item | null) => {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      new HeroDresser(m).dress(LOOK, gloves ? { gloves } : {});
      new Rig(m.root).update(0, newAnimState());
      holder.updateMatrixWorld(true);
      return { m, holder };
    };
    const hL = handed(null).m.root.getObjectByName('sock_handL')?.getWorldPosition(v(0, 0, 0)) ?? v(0.5, 0.75, 0);
    // Front, outer side (anything forward of the fist shows in silhouette), 3/4 from the body side where a thumb would
    // sit, from below, and close at the gameplay pitch.
    const HAND_VIEWS: [string, THREE.Vector3][] = [['front', v(0, 0.05, 0.95)], ['outer side', v(0.95, 0.05, 0)], ['thumb side 3/4', v(-0.45, 0.1, 0.8)], ['below', v(0.05, -0.55, 0.4)], ['game pitch', gameDir.clone().multiplyScalar(1.5)]];
    await sheetOf('fit-hands', HANDS.flatMap(([label, gloves]) => HAND_VIEWS.map(([view, off]): Cell => ({ label: `${label} · ${view}`, obj: handed(gloves).holder, eye: hL.clone().add(off), at: hL }))), 5, HANDS.length);

    // The same, measured on the loaded meshes in each arm's own frame: the bare hand (skin below its glove socket's
    // top) and each glove (everything on its sockets). A plain block has equal halves; an authored thumb makes the
    // half toward the body reach further forward (or back), and `thumbReach` is by how much.
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    const measure = (gloves: Item | null) => {
      const { m } = handed(gloves);
      const out: Record<string, unknown> = { model: gloves ? BASES[gloves.base]?.model : 'hero' };
      for (const [arm, sock] of [['armL', 'sock_handL'], ['armR', 'sock_gloveR']] as const) {
        const node = m.root.getObjectByName(arm);
        const socket = m.root.getObjectByName(sock);
        if (!node || !socket) {
          out[arm] = `missing ${node ? sock : arm}`;
          continue;
        }
        const inv = node.matrixWorld.clone().invert();
        const top = socket.getWorldPosition(v(0, 0, 0)).applyMatrix4(inv).y + 0.08;
        const pts: THREE.Vector3[] = [];
        let aRest = false;
        const underSocket = (o: THREE.Object3D) => {
          for (let a: THREE.Object3D | null = o; a && a !== node; a = a.parent) if (a.name.startsWith('sock_')) return true;
          return false;
        };
        (gloves ? socket : node).traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          if (!gloves && (underSocket(o) || roleOf(o.material as THREE.Material) !== 'skin')) return;
          aRest ||= !!o.geometry.getAttribute('aRest');
          const pos = o.geometry.getAttribute('position');
          const mat = inv.clone().multiply(o.matrixWorld);
          for (let i = 0; i < pos.count; i++) {
            const pt = v(0, 0, 0).fromBufferAttribute(pos, i).applyMatrix4(mat);
            if (gloves || pt.y < top) pts.push(pt);
          }
        });
        if (!pts.length) {
          out[arm] = 'no vertices';
          continue;
        }
        const box = new THREE.Box3().setFromPoints(pts);
        const cx = (box.min.x + box.max.x) / 2, side = Math.sign(node.position.x) || 1;
        const half = (inner: boolean) => {
          const zs = pts.filter((pt) => ((pt.x - cx) * side < 0) === inner).map((pt) => pt.z);
          return { zMin: r3(Math.min(...zs)), zMax: r3(Math.max(...zs)) };
        };
        const inner = half(true), outer = half(false);
        out[arm] = {
          verts: pts.length,
          fromGlb: aRest, // GLB geometry carries aRest; the code-built placeholder hand does not
          min: box.min.toArray().map(r3),
          max: box.max.toArray().map(r3),
          inner,
          outer,
          thumbReach: r3(Math.max(Math.abs(inner.zMax - outer.zMax), Math.abs(inner.zMin - outer.zMin))),
        };
      }
      return out;
    };
    checks.hands = Object.fromEntries(HANDS.map(([label, gloves]) => [label, measure(gloves)]));

    // Dropped: the real GroundItem (groundModel: the cuirass on sock_chest only), landed and turned square. Each view
    // is placed by `fit` on the dropped group's own bounds, in a 2×2 sheet: cells of a 4×1 sheet are too narrow
    // (aspect ~0.44) to hold it whole.
    const dropped = () => {
      const gi = new GroundItem({ ...makeItem('steel_platebody'), rarity: 'normal' }, 0, 0, 0, 0, 0);
      gi.update(1);
      gi.group.rotation.y = 0;
      gi.group.children[0].rotation.y = 0;
      gi.group.updateMatrixWorld(true);
      return gi.group;
    };
    const d0 = dropped();
    const dropBox = new THREE.Box3().setFromObject(d0);
    checks.drop = { scale: r3(d0.children[0].scale.x), min: dropBox.min.toArray().map(r3), max: dropBox.max.toArray().map(r3) };
    const DROP: [string, THREE.Vector3][] = [['front', v(0, 0.3, 1)], ['side', v(1, 0.3, 0)], ['game pitch', gameDir], ['top', v(0, 1, 0.02)]];
    await sheetOf('fit-drop', DROP.map(([view, dir]): Cell => {
      const obj = dropped();
      return { label: `dropped · ${view}`, obj, ...fit(obj, dir) };
    }), 2, 2);
    document.body.classList.remove('inspect-clean');

    // The same drop in the world, at the closest gameplay zoom. It lands 0.8 to the hero's side, which at the
    // gameplay pitch puts the hero over it, so the hero steps clear before the capture.
    await toKeep();
    ui.showTab('inventory');
    if (!g.save.inventory.some((it) => it?.base === 'steel_platebody' && !it.unique)) g.items.add(makeItem('steel_platebody'));
    const di = g.save.inventory.findIndex((it) => it?.base === 'steel_platebody' && !it.unique);
    if (di >= 0) {
      g.items.dropFromInventory(di);
      p.pos.x -= 1.4;
      p.stop();
      g.camZoom = 0.65;
      await frames(60);
      await next('fit-drop-world');
      g.camZoom = 1;
    }
  }
  checks.problems = problems;
  return { files, checks };
}
