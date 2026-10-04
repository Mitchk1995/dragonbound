import type { Item } from '../types';
import { swapSlots } from '../ui/hudLayout';
import { drawnText, frames, type Audit, type Probe } from './approvedProbe';

/**
 * Last in the approved-artwork UI run (see approvedInspect.ts), so the capture numbers before them stay: the third
 * inventory (`invC`, leather and jewellery among every tier's gauntlets and boots), then the approved inventory
 * panel itself. Its title, six tabs, 28 slots and the coins and Sort in the footer; a press selects exactly the
 * pressed item's slot and Sort carries the selection with its item; a card over a slot whose item changes goes;
 * folding mid-drag leaves no ghost, dimmed slot or selection; bank and shop keep their footer hints.
 */
export async function inventoryPanel(c: Probe, inventory: Record<string, Audit>, invC: Item[]) {
  const { g, ui, checks, problems, next, closeWindows, side, audit, setInv, invIdx, tooltips } = c;
  ui.showTab('inventory');
  setInv(invC);
  await frames(4);
  inventory['leather-jewellery capture'] = await audit('inventory leather-jewellery capture', side());
  await next('inventory-leather-jewellery');
  checks.tooltips = tooltips;

  const panel: Record<string, unknown> = {};
  const bad = (what: string) => problems.push(`inventory panel: ${what}`);
  const slots = () => [...document.querySelectorAll<HTMLElement>('.sidepanel [data-inv]')];
  const selected = () => slots().filter((s) => s.classList.contains('sel')).map((s) => Number(s.dataset.inv));
  const tip = document.getElementById('tooltip')!;
  const tipShown = () => getComputedStyle(tip).display !== 'none';
  const centre = (i: number) => {
    const r = document.querySelector<HTMLElement>(`.sidepanel [data-inv="${i}"]`)!.getBoundingClientRect();
    return { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  };
  const sp = side()!;
  panel.title = drawnText(sp.querySelector('.stitle'));
  panel.tabs = sp.querySelectorAll('.stab').length;
  panel.slots = slots().length;
  panel.foot = [...sp.querySelectorAll('.invfoot > *')].map(drawnText);
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
    const foot = [...document.querySelectorAll('.sidepanel .invfoot > *')].map(drawnText);
    panel[name] = foot;
    if (foot.join('|') !== `${hint}|Sort`) bad(`${name} footer shows [${foot.join(', ')}]`);
    closeWindows();
  }
  ui.panels.clearSelection();
  ui.refresh();
  checks.inventoryPanel = panel;
}
