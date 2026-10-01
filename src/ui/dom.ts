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

/** Share of a slot an approved artwork's subject fills (along its longer side). */
const ART_FILL = 0.86;
const artFit = new Map<string, string>();

/**
 * Approved files fill their canvas by different amounts (66-98%) and a few subjects sit off-centre, so each one in a
 * slot or drag ghost is scaled and shifted until its subject fills ART_FILL of the box, centred, never crossing the
 * rim. Measured once per file from its alpha, the first time it loads.
 */
function fitArt(img: HTMLImageElement) {
  const src = img.getAttribute('src');
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!src || !iw || !ih) return;
  let t = artFit.get(src);
  if (t === undefined) {
    const c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const a = g.getImageData(0, 0, iw, ih).data;
    let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      if (a[(y * iw + x) * 4 + 3] <= 24) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    t = '';
    if (x1 >= 0) {
      // In box units (object-fit: contain): the image is scaled by s and centred.
      const s = 1 / Math.max(iw, ih), ox = (1 - iw * s) / 2, oy = (1 - ih * s) / 2;
      const bx0 = ox + x0 * s, bx1 = ox + (x1 + 1) * s, by0 = oy + y0 * s, by1 = oy + (y1 + 1) * s;
      const k = ART_FILL / Math.max(bx1 - bx0, by1 - by0);
      const tx = (0.5 - (bx0 + bx1) / 2) * k * 100, ty = (0.5 - (by0 + by1) / 2) * k * 100;
      t = `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${k.toFixed(3)})`;
    }
    artFit.set(src, t);
  }
  img.style.transform = t;
}

/** Fit every approved artwork that loads into a slot or drag ghost (load events reach the document while capturing). */
export function installArtFit() {
  document.addEventListener(
    'load',
    (e) => {
      const img = e.target;
      if (img instanceof HTMLImageElement && img.classList.contains('art') && img.closest('.slot, .dragghost')) fitArt(img);
    },
    true,
  );
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
