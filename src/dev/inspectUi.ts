import { BASES, UNIQUES } from '../data/items';
import { KEEP_STAGE } from '../data/zones';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { itemIconUrl } from '../render/icons3d';
import { ICON_NAMES, icon } from '../ui/icons';
import { H, W, equip, frames, goblinCamp } from './inspectCommon';

// ─── UI ─────────────────────────────────────────────────────────────────────

/**
 * Drive the HUD with synthetic input and check it reacts: tab hotkeys, folding, Escape, hovering
 * UI marks the world as covered, and an OSRS drag swaps two inventory slots (captured mid-drag).
 * Failures go to console.error, which lands in report.json's errors.
 */
async function interactionChecks(g: Game, next: (n: string) => Promise<void>) {
  const ui = g.ui as any;
  const fail = (what: string) => console.error(`ui check failed: ${what}`);
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  ui.showTab('inventory');
  key('k');
  if (ui.sideTab !== 'skills') fail('K opens the skills tab');
  key('k');
  if (!document.querySelector('.sidepanel.collapsed')) fail('K again folds the side panel');
  key('c');
  if (ui.sideTab !== 'equipment' || document.querySelector('.sidepanel.collapsed')) fail('C opens equipment and unfolds');
  key('Escape');
  if (ui.sideTab !== 'help') fail('Esc with nothing open shows settings');
  key('Escape');
  if (ui.sideTab !== 'inventory') fail('Esc again returns to the inventory');
  await frames(2);

  const cell = (i: number) => document.querySelector<HTMLElement>(`.sidepanel [data-inv="${i}"]`)!;
  cell(0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  if (!ui.overUI) fail('hovering the side panel counts as over UI');
  const inv = g.save.inventory;
  const last = inv.length - 1;
  const first = inv[0], lastWas = inv[last];
  const at = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, button: 0 };
  };
  const from = at(cell(0)), to = at(cell(last));
  cell(0).dispatchEvent(new MouseEvent('mousedown', from));
  window.dispatchEvent(new MouseEvent('mousemove', { ...from, clientX: from.clientX + 20 }));
  window.dispatchEvent(new MouseEvent('mousemove', { ...to, clientX: to.clientX - 30, clientY: to.clientY - 20 }));
  await next('drag-inventory');
  window.dispatchEvent(new MouseEvent('mouseup', to));
  if (inv[last] !== first || inv[0] !== lastWas) fail('dragging slot 0 onto the last slot swaps them');
  if (document.querySelector('.dragghost')) fail('the drag ghost is removed on release');
  // Swap back so later captures match.
  [inv[0], inv[last]] = [inv[last], inv[0]];
  ui.refresh();
  ui.overUI = false;
}

export async function uiSuite(g: Game, shot: (n: string) => Promise<void>) {
  g.travel('keep', true);
  await frames(15);
  const p = g.player;
  p.pos.set(KEEP_STAGE.x, 0, KEEP_STAGE.z);
  g.camPos.copy(p.pos);
  const ui = g.ui as any;
  let i = 1;
  const next = (name: string) => shot(`ui-${String(i++).padStart(2, '0')}-${name}`);
  const closeWindows = () => {
    for (const id of ['bank', 'shop', 'keep', 'craft', 'book']) ui.toggle(id, false);
  };
  // The always-visible side panel, one capture per tab (inventory is the default).
  ui.showTab('inventory');
  await next('hud');
  for (const tab of ['equipment', 'skills', 'journal', 'collection', 'help']) {
    ui.showTab(tab);
    await next(`tab-${tab}`);
  }
  // Hovering a skill tile: XP, XP to the next level and the progress bar.
  ui.showTab('skills');
  document.querySelector('.stile[data-skill="smithing"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover');
  ui.hideTooltip();
  // Defence's card says how it trains now there's no stance; the summary cards above the grid.
  document.querySelector('.stile[data-skill="defence"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover-defence');
  ui.hideTooltip();
  document.querySelector('.ssum[data-sum="combat"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover-combat-level');
  ui.hideTooltip();
  document.querySelector('.ssum[data-sum="xp"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover-total-xp');
  ui.hideTooltip();
  ui.showTab('journal');
  ui.panels.journalTab = 'diary';
  ui.refresh();
  await next('tab-journal-diary');
  // The journal and collection log opened out into their full window (OSRS-style).
  ui.panels.journalTab = 'quests';
  ui.openBook('journal');
  await next('book-journal');
  ui.showTab('collection');
  ui.openBook('collection');
  await next('book-collection');
  closeWindows();
  // Arriving in a zone: the plaque flares, a ribbon names the kind of place.
  ui.showTab('journal');
  ui.zoneTitle(g.zone.def.name);
  await frames(40);
  await next('zone-arrival');
  ui.panels.journalTab = 'quests';
  ui.pressTab('journal'); // pressing the open tab folds the panel down to its tab row
  await next('side-collapsed');
  ui.showTab('inventory');
  // Station windows open beside the side panel.
  const stations: [string, () => void][] = [
    ['bank', () => ui.openBank(false)],
    ['shop', () => ui.openShop()],
    ['keep-board', () => ui.openKeep(null)],
  ];
  for (const [name, open] of stations) {
    open();
    await next(name);
    closeWindows();
  }
  for (const kind of ['furnace', 'anvil'] as const) {
    const st = g.zone.interactables.find((it) => it.kind === kind);
    if (st) {
      ui.openCraft(kind, st);
      await next(`craft-${kind}`);
      ui.closeCraftMenu();
    }
  }
  ui.openDialogue(g.story.talk('warden'));
  await next('dialogue-warden');
  ui.closeDialogue();
  // Tooltip over the first inventory item.
  await frames(2);
  const slot = document.querySelector<HTMLElement>('.sidepanel [data-inv]');
  const item = g.save.inventory.find(Boolean);
  if (slot && item) {
    ui.showItemTooltip(item, slot.getBoundingClientRect(), true);
    await next('tooltip');
    ui.hideTooltip();
  }
  await interactionChecks(g, next);
  ui.levelBanner('smithing', 42);
  await frames(45); // the banner animates in
  ui.xpDrop('smithing', 37.5);
  await next('level-banner');

  // The console mid-fight: cooldowns sweeping, a pool too low for the big skill, life low.
  g.travel('foothills', true);
  await frames(15);
  const spot = goblinCamp(g, 0);
  const stage = (weapon: string) => {
    for (const e of g.zone.enemies) {
      e.dead = true;
      e.obj.removeFromParent();
    }
    g.zone.enemies = [];
    equip(g, { weapon });
    p.pos.set(spot.x, 0, spot.z);
    p.stop();
    g.camPos.copy(p.pos);
    const foe = g.combat.spawnEnemy('goblin', spot.x + 1, spot.z - 5, null);
    g.hovered = foe;
    return foe;
  };
  stage('apprentice_staff');
  p.cds = { fireball: 1.4, frost_nova: 5.2 };
  g.combat.mana = 11;
  p.hp = g.stats.maxHp * 0.26;
  await frames(4);
  await next('combat-magic-lowmana');
  const q = document.querySelector<HTMLElement>('.sk[data-key="E"]');
  if (q) {
    ui.abilityTip('E', q);
    await next('skill-tooltip');
    ui.hideTooltip();
  }
  stage('worn_bow');
  p.cds = { multishot: 1.8 };
  g.combat.mana = Infinity;
  p.hp = g.stats.maxHp;
  await frames(4);
  await next('combat-ranged');

  // The smallest supported window: the console and side panel shrink, the view stays open.
  const api = window.electronAPI?.inspect;
  if (api?.resize) {
    await api.resize(1280, 720);
    await frames(20);
    stage('steel_sword');
    p.cds = { cleave: 2 };
    g.combat.mana = 30;
    await frames(4);
    await next('720-combat');
    g.hovered = null;
    g.travel('keep', true);
    await frames(10);
    p.pos.set(KEEP_STAGE.x, 0, KEEP_STAGE.z);
    g.camPos.copy(p.pos);
    ui.openBank(false);
    await next('720-bank');
    closeWindows();
    ui.openShop();
    await next('720-shop');
    closeWindows();
    const anvil = g.zone.interactables.find((it) => it.kind === 'anvil');
    if (anvil) {
      ui.openCraft('anvil', anvil);
      await next('720-craft-anvil');
      ui.closeCraftMenu();
    }
    ui.showTab('help');
    await next('720-settings');
    ui.showTab('skills');
    await next('720-skills');
    ui.showTab('inventory');
    await api.resize(W, H);
    await frames(20);
  }
  g.hovered = null;
  g.travel('keep', true);
  await frames(10);

  // Title and creation screens.
  g.mode = 'title';
  document.getElementById('hud')?.classList.add('hidden');
  ui.showTitle();
  await frames(30);
  await next('title');
  g.showCreate();
  await frames(20);
  await next('create');
  g.continueGame();
  await frames(10);
}

// ─── Icons ──────────────────────────────────────────────────────────────────

export async function iconsSuite(shot: (n: string) => Promise<void>) {
  document.body.classList.add('inspect-clean');
  const sheet = document.createElement('div');
  sheet.id = 'inspect-sheet';
  document.body.appendChild(sheet);
  const ids = Object.keys(BASES);
  const pages = Math.ceil(ids.length / 48);
  for (let p = 0; p < pages; p++) {
    sheet.innerHTML = '';
    for (const id of ids.slice(p * 48, p * 48 + 48)) {
      const f = document.createElement('figure');
      f.innerHTML = `<img width="72" height="72" src="${itemIconUrl(makeItem(id))}"><figcaption>${id}</figcaption>`;
      sheet.appendChild(f);
    }
    await shot(`icons-items-${p + 1}`);
  }
  // Uniques and trinkets at slot size and large, so their framing and orientation can be judged.
  sheet.innerHTML = '';
  const trinkets = Object.keys(BASES).filter((id) => BASES[id].slot === 'amulet' || BASES[id].slot === 'ring');
  const looks = [
    ...Object.values(UNIQUES).map((u) => ({ label: u.name, item: { ...makeItem(u.base), unique: u.id, rarity: 'unique' } as any })),
    ...trinkets.map((id) => ({ label: id, item: makeItem(id) })),
  ];
  for (const size of [72, 144]) {
    for (const { label, item } of looks) {
      const f = document.createElement('figure');
      f.innerHTML = `<img width="${size}" height="${size}" src="${itemIconUrl(item)}"><figcaption>${label}</figcaption>`;
      sheet.appendChild(f);
    }
  }
  await shot('icons-uniques');
  sheet.innerHTML = ICON_NAMES.map((n) => `<figure>${icon(n, 64)}<figcaption>${n}</figcaption></figure>`).join('');
  await shot('icons-svg');
  sheet.remove();
  document.body.classList.remove('inspect-clean');
}
