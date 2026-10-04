import { BASE_LIST, PIECES, UNIQUES, pieceId, type TierId } from '../data/items';
import { RECIPES } from '../data/recipes';
import { SHOP } from '../data/shop';
import { KEEP_STAGE } from '../data/zones';
import type { Game } from '../game';
import { generateUnique, makeItem, makeMasterwork } from '../loot/itemGen';
import type { Item, Rarity, Slot } from '../types';
import { itemArtUrl } from '../ui/approvedArt';

/**
 * The approved-artwork suite's shared kit (see approvedInspect.ts): the items it checks, and a probe that audits
 * the pictures under any part of the screen, hovers slots for their cards, drags them for their ghosts, and
 * numbers the captures.
 */

export const tier = (t: TierId) => PIECES.map((p) => pieceId(t, p.key));
export const ROUTED = (id: string) => !!itemArtUrl(makeItem(id));
export const EQUIPMENT = BASE_LIST.filter((b) => b.kind === 'gear' || b.kind === 'tool').map((b) => b.id);
export const BOWS_STAVES = BASE_LIST.filter((b) => b.model?.startsWith('bow_') || b.model?.startsWith('staff_')).map((b) => b.id);
export const LEATHER = ['leather_cap', 'leather_body', 'leather_gloves', 'leather_boots'];
export const JEWELLERY = BASE_LIST.filter((b) => b.slot === 'amulet' || b.slot === 'ring').map((b) => b.id);
/** Materials and a quest item, carried beside the equipment. */
export const MATERIAL_SAMPLE = ['bronze_bar', 'copper_ore', 'uncut_ruby', 'cinder_key'];
/** Every unique, each with its own approved artwork (by unique id, never its base's). */
export const UNIQUE_IDS = Object.keys(UNIQUES);
/** The shipped size of each file: 256×256 but for the leather gloves and boots. */
export const SIZE: Record<string, [number, number]> = { 'leather_gloves-icon-v1.png': [256, 171], 'leather_boots-icon-v1.png': [256, 171] };
export const sizeOf = (file: string): [number, number] => SIZE[file] ?? [256, 256];
/** A few approved items in other rarities, so their bevels show under the artwork. */
const RARITY: Record<string, Rarity> = { bronze_boots: 'rare', iron_longsword: 'magic', steel_platebody: 'rare', ember_fullhelm: 'magic', recurve_bow: 'magic', drakebone_bow: 'rare', apprentice_staff: 'magic', leather_boots: 'magic', silver_ring: 'rare' };

export type Shot = (name: string) => Promise<void>;
export interface Audit { art: string[]; rendered: number; problems: string[] }

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};
export const fileOf = (src: string | null | undefined) => (src ? src.split('/').pop()! : null);

export const unique = (id: string): Item => generateUnique(Math.random, id, 20);
export const make = (id: string): Item => (id === 'iron_platebody' ? makeMasterwork(Math.random, id, 99) : { ...makeItem(id), ...(RARITY[id] ? { rarity: RARITY[id] } : {}) });

export type Probe = ReturnType<typeof createProbe>;

/** Everything the suite's sections share: the game, the report's checks and problems, and the helpers below. */
export function createProbe(g: Game, shot: Shot) {
  const ui = g.ui as any;
  const p = g.player;
  const checks: Record<string, unknown> = {};
  const problems: string[] = [];
  let n = 1;
  const next = (name: string) => shot(`approved-${String(n++).padStart(2, '0')}-${name}`);
  /** Number the following captures from `k` on. */
  const renumber = (k: number) => {
    n = k;
  };
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
  const side = () => document.querySelector('.sidepanel');
  const panels = () => document.querySelector('#panels');

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

  const setInv = (list: Item[]) => {
    if (list.length > g.save.inventory.length) problems.push(`fixture: ${list.length} items for ${g.save.inventory.length} slots`);
    g.save.inventory = g.save.inventory.map((_, i) => list[i] ?? null);
    ui.refresh();
  };
  /** The inventory slot holding this exact id: a unique by its unique id, anything else by its base (never a unique on it). */
  const invIdx = (id: string) => g.save.inventory.findIndex((it) => it && (it.unique ?? it.base) === id);

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

  return { g, ui, p, checks, problems, next, renumber, closeWindows, toKeep, side, panels, audit, setInv, invIdx, tooltips, hover, drag };
}
