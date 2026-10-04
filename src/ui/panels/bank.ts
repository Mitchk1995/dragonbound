import { BASES } from '../../data/items';
import { esc, itemSlot } from '../dom';
import type { Panels } from '../panels';

/** The bank vault (search, capacity, withdraw by click), or the deposit chest's single button. */
export function bankPanel(p: Panels) {
  const { ui, g } = p, s = g.save;
  const el = ui.panel('bank', p.bankMode === 'deposit' ? 'Deposit Chest' : 'Bank Vault');
  if (!el) return;
  if (p.bankMode === 'deposit') {
    ui.body(el, `<p class="lead">Deposit only. Click items in your inventory to send them home to the vault.</p><button class="btn big" data-act="all">Deposit inventory</button>`);
    el.querySelector('[data-act="all"]')!.addEventListener('click', () => g.items.depositAll());
    return;
  }
  const q = p.bankSearch.toLowerCase();
  const cells = s.bank.map((it, i) => {
    const hide = q && !(BASES[it.base]?.name.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q));
    return hide ? '' : itemSlot(it, `data-bank="${i}"`);
  }).join('');
  ui.body(el, `
    <div class="banktop"><input class="search" placeholder="Search…" value="${esc(p.bankSearch)}"><span>${s.bank.length} / ${g.items.bankCapacity()}</span><button class="btn" data-act="all">Deposit inventory</button></div>
    <div class="bankgrid">${cells || '<div class="emptynote">Your vault is empty.</div>'}</div>
    <div class="hint">Click: withdraw 1 · Shift-click: withdraw 10 · Ctrl-click: withdraw all</div>`);
  const search = el.querySelector<HTMLInputElement>('.search')!;
  search.addEventListener('input', () => {
    p.bankSearch = search.value;
    bankPanel(p);
    el.querySelector<HTMLInputElement>('.search')?.focus();
  });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  el.querySelector('[data-act="all"]')!.addEventListener('click', () => g.items.depositAll());
  el.querySelectorAll<HTMLElement>('[data-bank]').forEach((c) => {
    const i = Number(c.dataset.bank);
    c.addEventListener('mouseenter', () => s.bank[i] && ui.tooltip.item(s.bank[i], c.getBoundingClientRect(), true));
    c.addEventListener('mouseleave', () => ui.tooltip.hide());
    c.addEventListener('mousedown', (e) => {
      ui.tooltip.hide();
      g.items.withdraw(i, e.ctrlKey ? 9999 : e.shiftKey ? 10 : 1);
    });
  });
}
