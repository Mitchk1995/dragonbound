import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { paintText } from '../ui/paintedText';

/**
 * Dev only (inspect suite `font`): the painted alphabets in the real game. In the keep at the gameplay camera: an
 * NPC's name over its head, the glowing portal titles (open and sealed) and gold pickup words; then the zone plaque, the
 * boss bar, and an inventory tooltip with its text set in the gold alphabet at its real size (a readability test only:
 * dense UI text is not converted).
 */
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

export async function fontSuite(g: Game, shot: (name: string) => Promise<void>) {
  g.travel('keep', true);
  await frames(30);
  const p = g.player;
  const warden = g.zone.interactables.find((i) => i.id === 'warden')!;
  const arch = (id: string) => g.zone.interactables.find((i) => i.kind === 'portal' && i.id === id)!;
  const a = arch('foothills'), b = arch('lair');
  p.pos.set((warden.x + (a.x + b.x) / 2) / 2, 0, (warden.z + a.z) / 2 + 3);
  g.camPos.copy(p.pos);
  await frames(90);
  g.text.clear();
  g.text.float('+30 gold', p.x - 1.2, 2.4, p.z, 'gold');
  g.text.float('+1 potion', p.x + 1.4, 2.4, p.z - 0.4, 'heal');
  await frames(14);
  await shot('font-gameplay');
  g.text.clear();

  // The zone plaque on arrival, in another zone with a longer name.
  g.travel('foothills', true);
  await frames(30);
  g.ui.zoneTitle(g.zone.def.name);
  await frames(110); // the kind-of-place ribbon finishes sliding out from behind the plaque
  await shot('font-banner');

  // The boss bar.
  g.travel('lair', true);
  await frames(30);
  const boss = g.zone.enemies.find((e) => e.def.behavior === 'boss');
  if (boss) g.ui.showBoss(boss);
  await frames(10);
  await shot('font-boss');
  g.ui.showBoss(null);

  // Small text: an inventory tooltip, its lines set in gold at the size they really are (cap = 0.7 x the font size).
  g.travel('keep', true);
  await frames(30);
  g.ui.showTab('inventory');
  await frames(4);
  const item = g.save.inventory.find((i) => i?.base === 'steel_longsword') ?? makeItem('steel_longsword');
  const slot = document.querySelector<HTMLElement>('.sidepanel [data-inv]');
  if (slot) {
    g.ui.showItemTooltip(item, slot.getBoundingClientRect(), true);
    for (const e of document.querySelectorAll<HTMLElement>('#tooltip [class^="tt-"]')) {
      const size = parseFloat(getComputedStyle(e).fontSize);
      if (e.children.length === 0 && e.textContent) paintText(e, e.textContent, 'gold', Math.round(size * 0.7));
    }
    const title = document.querySelector<HTMLElement>('.sidepanel .stitle');
    if (title?.textContent) paintText(title, title.textContent, 'gold', 12);
  }
  await frames(4);
  await shot('font-small');
  g.ui.hideTooltip();
}
