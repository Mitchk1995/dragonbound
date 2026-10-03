import { FONT_SETS } from './fontGlyphs';
import { layoutText, loadAtlas } from './paintedText';

/**
 * The menus' lettering: every piece of ordinary text in the HTML UI is re-set in the neutral painted alphabet
 * (public/ui/font/neutral.png, a silver-white greyscale set) and tinted per meaning. The tint comes from the CSS
 * custom property `--ptint` ("r g b", inherited), so a class in style.css decides what a line means: rarity names,
 * element affixes, bonus and penalty lines, plain body text (Common). Nothing here knows the game's data.
 *
 * `paintTree(root)` walks the text nodes under `root` once and swaps each for a painted run; call it after setting
 * markup (`setHtml`), or use `setText` for a label that changes every frame. Inputs, selects, SVG and anything marked
 * `data-plain` stay ordinary text. Each run keeps its words as `aria-label` for assistive tech.
 */

/** The set every menu uses. */
const FONT = 'neutral' as const;
/** Capitals stand this share of the CSS font size (the zone plaque and name fallbacks use the same ratio). */
const CAP_RATIO = 0.72;
/** Nothing is set with capitals shorter than this many CSS px: the owner judged ~9 px caps readable. */
export const MIN_CAP = 9;
/** Common: plain body text. */
export const COMMON: Rgb = [235, 232, 225];
export type Rgb = [number, number, number];

/** Cap height (CSS px) for text of a CSS font size, never below MIN_CAP. */
export function capFor(fontSize: number): number {
  return Math.max(MIN_CAP, Math.round(fontSize * CAP_RATIO));
}

/**
 * Tint one greyscale sample (0-255 luminance) to a colour: luminance x colour x 1.15 plus a lift on the highlights,
 * so the bevel's shading survives and the brightest edge reads near white-hot.
 */
export function tintChannel(lum: number, channel: number): number {
  const l = lum / 255;
  return Math.round(Math.min(1, Math.max(0, l * (channel / 255) * 1.15 + Math.max(l - 0.75, 0) * 1.6)) * 255);
}

/** The words and the runs of whitespace between them; a run of space (or a newline) is one breakable space. */
export function tokenize(text: string): { word: boolean; text: string }[] {
  return text.split(/(\s+)/).filter(Boolean).map((t) => ({ word: !/^\s+$/.test(t), text: /^\s+$/.test(t) ? ' ' : t }));
}

/** "235 232 225" or "235, 232, 225" -> a colour; Common when the property is missing or malformed. */
export function parseTint(value: string): Rgb {
  const n = value.trim().split(/[\s,]+/).map(Number);
  return n.length === 3 && n.every((v) => Number.isFinite(v)) ? [n[0], n[1], n[2]] : COMMON;
}

// ─── Tinted atlases ──────────────────────────────────────────────────────────────────────────────────────────────────

let atlas: ImageBitmap | null = null;
let spaceRatio = 0.25;
let sheet: HTMLStyleElement | null = null;
const variants = new Map<string, string>();

/** Load the neutral alphabet; until it is in, `paintTree` leaves text as it is. Safe to call twice. */
export async function loadUiFont(): Promise<void> {
  if (atlas || typeof document === 'undefined') return;
  atlas = await loadAtlas(FONT_SETS[FONT]);
  if (!atlas) return;
  const probe = document.createElement('p-s');
  probe.className = 'psp';
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px';
  probe.textContent = ' ';
  document.body.appendChild(probe);
  spaceRatio = probe.getBoundingClientRect().width / 100 || spaceRatio;
  probe.remove();
}

/** The CSS class whose background is the alphabet tinted `rgb` and drawn `capDev` device px tall; made on first use. */
function variantClass(rgb: Rgb, capDev: number): string {
  const key = `${rgb.join(',')}|${capDev}`;
  let cls = variants.get(key);
  if (cls) return cls;
  const set = FONT_SETS[FONT];
  const s = capDev / (set.base - set.top);
  const w = Math.max(1, Math.round(set.w * s)), h = Math.max(1, Math.round(set.h * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(atlas!, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i] = tintChannel(lum, rgb[0]);
    d[i + 1] = tintChannel(lum, rgb[1]);
    d[i + 2] = tintChannel(lum, rgb[2]);
  }
  ctx.putImageData(img, 0, 0);
  cls = `pv${variants.size}`;
  variants.set(key, cls);
  if (!sheet) {
    sheet = document.createElement('style');
    document.head.appendChild(sheet);
  }
  sheet.appendChild(document.createTextNode(`.${cls}{background-image:url(${canvas.toDataURL('image/png')})}`));
  return cls;
}

// ─── Runs ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Built runs, cloned for repeats (a tooltip rebuilt on every hover mostly says the same words). */
const runs = new Map<string, HTMLElement>();
const RUN_CACHE = 800;

function buildRun(text: string, cap: number, rgb: Rgb, track: number): HTMLElement {
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const capDev = Math.max(1, Math.round(cap * dpr));
  const capCss = capDev / dpr;
  const key = `${text}|${capDev}|${rgb.join(',')}|${track}`;
  const hit = runs.get(key);
  if (hit) return hit.cloneNode(true) as HTMLElement;
  const set = FONT_SETS[FONT];
  const cls = variantClass(rgb, capDev);
  const run = document.createElement('p-t');
  run.className = 'ptext pui';
  run.setAttribute('role', 'img');
  run.setAttribute('aria-label', text.replace(/\s+/g, ' ').trim());
  run.style.color = `rgb(${rgb.join(',')})`;
  const spaceW = (set.space ?? 0.3 * (set.base - set.top)) * (capCss / (set.base - set.top)) + track * capCss;
  run.style.setProperty('--sp', `${(spaceW / spaceRatio).toFixed(2)}px`);
  for (const tok of tokenize(text)) {
    if (!tok.word) {
      const sp = document.createElement('p-s');
      sp.className = 'psp';
      sp.textContent = ' ';
      run.appendChild(sp);
      continue;
    }
    const word = document.createElement('p-w');
    word.className = 'pw';
    const l = layoutText(tok.text, FONT, capCss, { track });
    for (const it of l.items) {
      if (it.kind === 'fallback') {
        const f = document.createElement('p-f');
        f.className = 'pf';
        f.textContent = it.c;
        f.style.fontSize = `${(capCss / 0.7).toFixed(1)}px`;
        if (track) f.style.marginRight = `${(track * capCss).toFixed(2)}px`;
        word.appendChild(f);
      } else if (it.kind === 'glyph') {
        const box = document.createElement('p-g');
        box.style.width = `${it.adv.toFixed(2)}px`;
        box.style.height = `${capCss}px`;
        const b = document.createElement('p-i');
        b.className = cls;
        b.style.cssText = `left:${(-it.lead).toFixed(2)}px;top:${(-it.top).toFixed(2)}px;width:${it.w.toFixed(2)}px;height:${it.h.toFixed(2)}px;background-size:${it.atlasW.toFixed(2)}px ${it.atlasH.toFixed(2)}px;background-position:${(-it.srcX).toFixed(2)}px 0`;
        box.appendChild(b);
        word.appendChild(box);
      }
    }
    run.appendChild(word);
  }
  if (runs.size >= RUN_CACHE) runs.clear();
  runs.set(key, run.cloneNode(true) as HTMLElement);
  return run;
}

/**
 * The run's elements are custom tags (p-t run, p-w word, p-s space, p-g glyph box, p-i glyph image, p-f unpainted
 * character), so the menus' rules for span, b and i never reach them.
 */

/** Elements whose text stays ordinary: editable fields, drawings, runs already painted, and anything opted out. */
const KEEP_PLAIN = 'input, textarea, select, option, script, style, svg, .ptext, [data-plain]';

interface Job { node: Text; cap: number; rgb: Rgb; track: number; text: string }

/** Re-set every ordinary piece of text under `root` (which must be in the page, for its styles) in the painted alphabet. A no-op until `loadUiFont` has finished. */
export function paintTree(root: Element): void {
  if (!atlas) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const jobs: Job[] = [];
  const looks = new Map<Element, { cap: number; rgb: Rgb; track: number; upper: boolean }>();
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const parent = n.parentElement;
    if (!parent || !/\S/.test(n.data) || parent.closest(KEEP_PLAIN)) continue;
    let look = looks.get(parent);
    if (!look) {
      const cs = getComputedStyle(parent);
      const cap = capFor(parseFloat(cs.fontSize) || 14);
      const ls = parseFloat(cs.letterSpacing);
      look = { cap, rgb: parseTint(cs.getPropertyValue('--ptint')), track: Number.isFinite(ls) ? ls / cap : 0, upper: cs.textTransform === 'uppercase' };
      looks.set(parent, look);
    }
    jobs.push({ node: n, cap: look.cap, rgb: look.rgb, track: look.track, text: look.upper ? n.data.toUpperCase() : n.data });
  }
  for (const j of jobs) j.node.replaceWith(buildRun(j.text, j.cap, j.rgb, j.track));
}

/** What `setHtml` / `setText` last put in each element. */
const shown = new WeakMap<HTMLElement, string>();

/** Set an element's markup and paint it, unless it already holds exactly this (so a HUD can call it every frame). */
export function setHtml(el: HTMLElement, html: string): void {
  if (shown.get(el) === html) return;
  shown.set(el, html);
  el.innerHTML = html;
  paintTree(el);
}

/** Set an element's text and paint it, unless it already says exactly this. */
export function setText(el: HTMLElement, text: string): void {
  if (shown.get(el) === text) return;
  shown.set(el, text);
  el.textContent = text;
  paintTree(el);
}
