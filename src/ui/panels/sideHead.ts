import type { Panels } from '../panels';

export type BookView = 'journal' | 'collection';

/** The OSRS "open in a window" button a compact side-panel tab carries. */
const EXPAND = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** A side-panel header row: the view's own switcher (if any) and the button that opens the full window. */
export function sideHead(p: Panels, view: BookView, left: string) {
  const open = p.bookView === view;
  return `<div class="sidehead">${left}<button class="expand ${open ? 'on' : ''}" data-book="${view}">${EXPAND}</button></div>`;
}

export function bindSideHead(p: Panels, el: HTMLElement, view: BookView, label: string) {
  const b = el.querySelector<HTMLElement>(`[data-book="${view}"]`);
  if (!b) return;
  b.addEventListener('click', () => p.ui.openBook(view));
  b.addEventListener('mouseenter', () => p.ui.tooltip.text(`<div class="tt-name">${p.bookView === view ? 'Close' : 'Open'} ${label}</div><div class="tt-dim">The full-size window, beside the side panel.</div>`, b.getBoundingClientRect()));
  b.addEventListener('mouseleave', () => p.ui.tooltip.hide());
}
