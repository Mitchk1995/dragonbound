import { BASES } from '../../data/items';
import { SHOP } from '../../data/shop';
import { makeItem } from '../../loot/itemGen';
import { esc, fmt, itemSlot } from '../dom';
import { icon } from '../icons';
import type { Panels } from '../panels';

/** The Quartermaster's wares: each one's picture, name and price, greyed when the hero can't afford it. */
export function shopPanel(p: Panels) {
  const { ui, g } = p;
  const el = ui.panel('shop', "Quartermaster's Wares");
  if (!el) return;
  const rows = SHOP.map((e, i) => {
    const price = g.items.shopPrice(e);
    const item = e.special ? null : makeItem(e.id);
    const name = e.name ?? BASES[e.id].name;
    const pic = item ? itemSlot(item) : `<div class="slot r-magic">${icon('potion', 44)}</div>`;
    const afford = price !== null && g.save.gold >= price;
    return `<div class="shoprow ${afford ? '' : 'poor'}" data-buy="${i}">${pic}<div class="sr-name">${esc(name)}${e.desc ? `<small>${esc(e.desc)}</small>` : ''}</div><div class="sr-price">${price === null ? 'Maxed' : `${icon('gold', 16)} ${fmt(price)}`}</div></div>`;
  }).join('');
  ui.body(el, `<div class="shoplist">${rows}</div><div class="hint">Click to buy · Click items in your inventory to sell · You have ${fmt(g.save.gold)} gold</div>`);
  el.querySelectorAll<HTMLElement>('[data-buy]').forEach((r) => r.addEventListener('mousedown', () => g.items.buy(Number(r.dataset.buy))));
}
