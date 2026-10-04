import { BASES, TIER_ORDER } from '../data/items';
import { makeItem } from '../loot/itemGen';
import { itemIconUrl } from '../render/icons3d';
import type { Item } from '../types';
import { itemArtUrl } from '../ui/approvedArt';
import { itemSlot } from '../ui/dom';
import { BOWS_STAVES, JEWELLERY, LEATHER, MATERIAL_SAMPLE, ROUTED, SIZE, UNIQUE_IDS, fileOf, frames, tier, unique, type Audit, type Probe } from './approvedProbe';
import { equip } from './inspect';

/**
 * Cleave's approved tile on the skill console (see approvedInspect.ts): ready, cooling, out of mana and hovered,
 * then the console, bank, equipment and anvil at 1280×720, and last the close-up sheets of every approved picture
 * at 1× and 2.5× beside the rendered icon it replaces.
 */
export async function consoleAndCloseups(c: Probe) {
  const { g, ui, p, checks, problems, next, closeWindows, side, panels, audit } = c;
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
    await c.toKeep();
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
  const sheetOf = async (name: string, cols: number, rows: [string, Item][], tile?: HTMLElement) => {
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
      const cells = `${itemSlot(it)}<div class="z">${itemSlot(it)}</div><div class="z">${rendered(it)}</div>`;
      return `<div class="ar">${label}<br><i>${file ?? 'rendered icon'} · 1× · 2.5× · rendered 2.5×</i><div>${cells}</div></div>`;
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
    closeup[t] = await sheetOf(t, 3, tier(t).map((id): [string, Item] => [`${BASES[id].name}${ROUTED(id) ? '' : ' (unrouted)'}`, makeItem(id)]), t === 'bronze' ? qTile : undefined);
  // The Emberforged Longsword, the four bows and four staves, then each unique, beside the rendered icon it replaces
  // (a unique's own model, not its base).
  closeup.weaponsUniques = await sheetOf('weapons-uniques', 4, [
    ...['ember_longsword', ...BOWS_STAVES].map((id): [string, Item] => [BASES[id].name, makeItem(id)]),
    ...UNIQUE_IDS.map((id): [string, Item] => {
      const it = unique(id);
      return [`${it.name} (unique on ${BASES[it.base].name})`, it];
    }),
  ]);
  // Leather (the gloves and boots 256×171, fitted whole) and jewellery, then materials and a quest item.
  closeup.leatherJewellery = await sheetOf('leather-jewellery-materials', 4, [
    ...[...LEATHER, ...JEWELLERY].map((id): [string, Item] => [`${BASES[id].name}${SIZE[fileOf(itemArtUrl(makeItem(id)))!] ? ' (256×171)' : ''}`, makeItem(id)]),
    ...MATERIAL_SAMPLE.map((id): [string, Item] => [BASES[id].name, makeItem(id)]),
  ]);
  checks.closeup = closeup;
  document.body.classList.remove('inspect-clean');
}
