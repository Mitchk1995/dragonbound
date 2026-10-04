import { BASES, TIERS } from '../../data/items';
import { masterworkChance, recipesFor, RECIPES, type Recipe } from '../../data/recipes';
import { XP_TUNING } from '../../data/tuning';
import { makeItem } from '../../loot/itemGen';
import { esc, itemSlot } from '../dom';
import type { Panels } from '../panels';

/** The furnace's or anvil's recipes, grouped by tier, each with its inputs, XP and how many to make. */
export function craftPanel(p: Panels) {
  const { ui, g } = p;
  if (!p.craft) return;
  const kind = p.craft.kind;
  const el = ui.panel('craft', kind === 'furnace' ? 'Furnace: Smelting' : 'Anvil: Smithing');
  if (!el) return;
  const q = g.save.quests.cinder_seal;
  const list = recipesFor(kind).filter((r) => r.out !== 'cinder_key' || (q && !q.done && q.stage === 2));
  const groups = new Map<string, Recipe[]>();
  for (const r of list) {
    const key = r.tier ? TIERS[r.tier].name : 'Quest';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const html = [...groups].map(([name, rs]) => {
    const rows = rs.map((r) => {
      const err = g.skilling.craftError(r);
      const lvlOk = g.levels.smithing >= r.level;
      const ins = Object.entries(r.inputs).map(([id, n]) => {
        const have = g.items.count(id);
        return `<span class="${have >= n ? 'ok' : 'no'}">${n}× ${esc(BASES[id].name)} <i>(${have})</i></span>`;
      }).join(' ');
      const mw = masterworkChance(g.levels.smithing, r);
      const max = Math.min(...Object.entries(r.inputs).map(([id, n]) => Math.floor(g.items.count(id) / n)));
      return `<div class="recipe ${err ? 'blocked' : ''}" data-r="${r.id}">
        ${itemSlot(makeItem(r.out))}
        <div class="rc-main"><div class="rc-name">${esc(BASES[r.out].name)} <span class="${lvlOk ? 'lv' : 'lv bad'}">Lv ${r.level}</span></div>
        <div class="rc-in">${ins}</div>
        <div class="rc-xp">${+(r.xp * XP_TUNING.smithing).toFixed(1)} XP${mw > 0 ? ` · ${(mw * 100).toFixed(1)}% masterwork` : ''}${r.needs && !g.save.keep[r.needs] ? ' · <span class="no">needs forge restoration</span>' : ''}</div></div>
        <div class="rc-btns">${[1, 5, 10].map((n) => `<button class="btn sm" data-q="${n}" ${err ? 'disabled' : ''}>${n}</button>`).join('')}<button class="btn sm" data-q="${Math.max(1, max)}" ${err ? 'disabled' : ''}>All</button></div>
      </div>`;
    }).join('');
    return `<div class="rgroup"><div class="rg-title">${name}</div>${rows}</div>`;
  }).join('');
  ui.body(el, `<div class="recipes">${html}</div>`);
  el.querySelectorAll<HTMLElement>('.recipe').forEach((row) => {
    row.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) =>
      b.addEventListener('click', () => g.skilling.startCraft(row.dataset.r!, Number(b.dataset.q), p.craft!.station)),
    );
    const out = row.querySelector('.slot') as HTMLElement;
    out.addEventListener('mouseenter', () => ui.tooltip.item(makeItem(RECIPES[row.dataset.r!].out), out.getBoundingClientRect(), true));
    out.addEventListener('mouseleave', () => ui.tooltip.hide());
  });
}
