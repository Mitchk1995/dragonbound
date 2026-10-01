import { BASES } from '../data/items';
import { itemIconUrl } from '../render/icons3d';
import type { Item } from '../types';
import { itemArtUrl } from './approvedArt';

export const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** An item's picture: its approved painted artwork (class `art`, sized in style.css) or its rendered 3D icon. */
export function itemImg(item: Item): string {
  const art = itemArtUrl(item);
  return art ? `<img class="art" src="${art}" alt="" draggable="false">` : `<img src="${itemIconUrl(item)}" alt="" draggable="false">`;
}

/** An inset stone slot showing an item's icon, rarity bevel and stack count. */
export function itemSlot(item: Item | null, attrs = '', extraClass = '', ghost = ''): string {
  if (!item) return `<div class="slot empty ${extraClass}" ${attrs}>${ghost}</div>`;
  const qty = item.qty && item.qty > 1 ? `<span class="qty">${item.qty > 99999 ? Math.floor(item.qty / 1000) + 'k' : item.qty}</span>` : '';
  const mw = item.masterwork ? '<span class="mw">✦</span>' : '';
  const kind = BASES[item.base]?.kind ?? 'gear';
  return `<div class="slot r-${item.rarity} k-${kind} ${extraClass}" ${attrs}>${itemImg(item)}${qty}${mw}</div>`;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
