import { BASES } from '../../data/items';
import { RESTORATIONS } from '../../data/keep';
import { QUESTS } from '../../data/quests';
import { SKILL_INFO } from '../../progression/skills';
import { esc, fmt } from '../dom';
import type { Panels } from '../panels';

/** The keep's restoration board: each restoration's cost and requirements, the focused one first. */
export function keepPanel(p: Panels) {
  const { ui, g } = p, s = g.save;
  const el = ui.panel('keep', 'Restoration Board');
  if (!el) return;
  const order = [...RESTORATIONS].sort((a, b) => (a.id === p.keepFocus ? -1 : b.id === p.keepFocus ? 1 : 0));
  const rows = order.map((r) => {
    const done = !!s.keep[r.id];
    const st = g.story.restorationStatus(r);
    const costs = Object.entries(r.cost).map(([id, n]) => {
      const have = g.items.totalCount(id);
      return `<span class="${have >= n ? 'ok' : 'no'}">${n}× ${esc(BASES[id].name)} <i>(${fmt(have)})</i></span>`;
    });
    if (r.gold) costs.push(`<span class="${s.gold >= r.gold ? 'ok' : 'no'}">${fmt(r.gold)} gold</span>`);
    const reqs = r.reqs.map((q) => `<span class="${g.levels[q.skill] >= q.level ? 'ok' : 'no'}">${SKILL_INFO[q.skill].name} ${q.level}</span>`);
    if (r.quest) reqs.push(`<span class="${s.quests[r.quest]?.done ? 'ok' : 'no'}">${esc(QUESTS[r.quest].name)}</span>`);
    return `<div class="restore ${done ? 'done' : ''} ${r.locked ? 'locked' : ''} ${r.id === p.keepFocus ? 'focus' : ''}">
      <div class="rs-head"><b>${esc(r.name)}</b>${done ? '<span class="tag ok">Restored</span>' : r.locked ? `<span class="tag">${esc(r.locked)}</span>` : ''}</div>
      <div class="rs-desc">${esc(r.desc)}</div>
      ${!done && !r.locked ? `<div class="rs-cost">${[...costs, ...reqs].join(' · ')}</div>
      <button class="btn" data-restore="${r.id}" ${st.can ? '' : 'disabled'}>Restore</button>` : ''}
    </div>`;
  }).join('');
  ui.body(el, `<p class="lead">Materials are taken from your inventory first, then the bank.</p><div class="restores">${rows}</div>`);
  el.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((b) => b.addEventListener('click', () => g.story.restore(b.dataset.restore!)));
}
