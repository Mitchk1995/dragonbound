import { AFFIXES } from '../data/affixes';
import type { Game } from '../game';
import { generateUnique } from '../loot/itemGen';
import { equip } from './inspect';

/**
 * Dev only (inspect suite `uitext`): the menus' painted, tinted lettering in the real game. Captures the inventory with
 * a Legendary card carrying elemental affixes, the equipment screen, the shop, the title menu and a few other screens
 * the lettering has to hold up on, and measures what the lettering costs: the time to set a tooltip, and the frame
 * time with a busy inventory and a card open.
 */
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

/** Mean and worst frame interval (ms) over `n` frames. */
async function frameCost(n: number) {
  const dts: number[] = [];
  let last = performance.now();
  for (let i = 0; i < n; i++) {
    await raf();
    const now = performance.now();
    dts.push(now - last);
    last = now;
  }
  dts.sort((a, b) => a - b);
  return { meanMs: +(dts.reduce((s, v) => s + v, 0) / n).toFixed(2), p95Ms: +dts[Math.floor(n * 0.95)].toFixed(2) };
}

export async function uiTextSuite(g: Game, shot: (name: string) => Promise<void>) {
  const report: Record<string, unknown> = {};
  const ui = g.ui as any;
  g.travel('keep', true);
  await frames(20);

  // The game has no elemental affixes yet; the card test borrows three, for this run only.
  const borrowed = [
    { id: 'fireDmg', text: '+{v} fire damage', tint: 'fire' as const },
    { id: 'frostRes', text: '+{v}% frost resistance', tint: 'frost' as const },
    { id: 'shockDmg', text: '+{v} lightning damage', tint: 'lightning' as const },
    { id: 'venom', text: '{v} poison damage per second', tint: 'poison' as const },
    { id: 'slowed', text: '-{v}% movement speed', tint: 'bad' as const },
  ];
  for (const a of borrowed) AFFIXES[a.id] = { ...a, slots: ['weapon'], min: 1, max: 1, per: 0, weight: 0 };
  const legendary = generateUnique(Math.random, 'cinderfang', 30);
  legendary.affixes = [
    { id: 'dmgPct', value: 45 }, { id: 'fireDmg', value: 12 }, { id: 'frostRes', value: 18 }, { id: 'shockDmg', value: 7 },
    { id: 'venom', value: 5 }, { id: 'atkSpd', value: 15 }, { id: 'slowed', value: 10 },
  ];
  g.items.add(legendary);
  await frames(3);

  ui.showTab('inventory');
  ui.refresh();
  await frames(3);
  const inv = g.save.inventory;
  const at = inv.indexOf(legendary);
  const slot = document.querySelector<HTMLElement>(`.sidepanel [data-inv="${at}"]`)!;

  // What a card costs to set: the same card many times, markup and lettering.
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) ui.showItemTooltip(legendary, slot.getBoundingClientRect(), true);
  const cardMs = (performance.now() - t0) / 30;
  report.cardMs = +cardMs.toFixed(2);
  const painted = document.querySelectorAll('#tooltip .pui').length;
  report.cardRuns = painted;
  report.cardNodes = document.querySelectorAll('#tooltip *').length;

  // Frame time: the busy inventory with no card, then with the card open.
  ui.hideTooltip();
  await frames(10);
  report.frameBusyInventory = await frameCost(120);
  slot.dispatchEvent(new MouseEvent('mouseenter'));
  await frames(10);
  report.frameWithCard = await frameCost(120);
  report.sidePanelNodes = document.querySelectorAll('.sidepanel *').length;
  await shot('ui-text-inventory');
  ui.hideTooltip();

  ui.showTab('equipment');
  equip(g, { weapon: 'steel_longsword', helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' });
  ui.refresh();
  await frames(3);
  await shot('ui-text-equipment');

  ui.showTab('inventory');
  ui.openShop();
  await frames(3);
  await shot('ui-text-shop');
  ui.toggle('shop', false);

  // Screens the lettering has to hold up on, for a look through (the owner's four are above and below).
  ui.showTab('skills');
  await shot('ui-text-x-skills');
  ui.showTab('journal');
  ui.openBook('journal');
  await shot('ui-text-x-journal');
  ui.toggle('book', false);
  ui.showTab('help');
  await shot('ui-text-x-help');
  ui.showTab('inventory');
  ui.openBank(false);
  await shot('ui-text-x-bank');
  ui.toggle('bank', false);
  const anvil = g.zone.interactables.find((it) => it.kind === 'anvil');
  if (anvil) {
    ui.openCraft('anvil', anvil);
    await shot('ui-text-x-anvil');
    ui.closeCraftMenu();
  }
  ui.openDialogue(g.story.talk('warden'));
  await shot('ui-text-x-dialogue');
  ui.closeDialogue();
  ui.message('Your hero reached a new level.', 'level');
  ui.message('Not enough mana.', 'deny');
  await shot('ui-text-x-hud');

  // The title menu and the hero-forging screen.
  g.mode = 'title';
  ui.showTitle();
  await frames(10);
  await shot('ui-text-title');
  ui.showCreate();
  await frames(10);
  await shot('ui-text-x-create');
  for (const a of borrowed) delete AFFIXES[a.id];
  return report;
}
