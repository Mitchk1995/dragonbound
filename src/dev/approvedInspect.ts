import { UNIQUES } from '../data/items';
import type { Game } from '../game';
import { APPROVED_DIR, APPROVED_FILES, itemArtUrl } from '../ui/approvedArt';
import { consoleAndCloseups } from './approvedConsole';
import { steelPlateFit } from './approvedFit';
import { itemWindows } from './approvedItems';
import { inventoryPanel } from './approvedPanel';
import { EQUIPMENT, ROUTED, UNIQUE_IDS, createProbe, sizeOf, type Shot } from './approvedProbe';

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
 * `dragGhosts`, `inventoryPanel` (selection through Sort, stale cards, folding mid-drag, bank and shop footers) and
 * `checks.drop`.
 *
 * The sections: approvedItems.ts (the item windows), approvedConsole.ts (Cleave's tile, 720p and the close-ups),
 * approvedPanel.ts (the inventory panel), approvedFit.ts (the fit); approvedProbe.ts holds what they share.
 */
export async function approvedSuite(g: Game, shot: Shot, scope: 'ui' | 'fit' | '' = '') {
  const c = createProbe(g, shot);
  const { checks, problems } = c;

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

    const { inventory, invC } = await itemWindows(c);
    await consoleAndCloseups(c);
    await inventoryPanel(c, inventory, invC);
  }

  if (scope !== 'ui') {
    c.renumber(31);
    await steelPlateFit(c);
  }
  checks.problems = problems;
  return { files, checks };
}
