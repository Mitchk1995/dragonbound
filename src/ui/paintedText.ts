import { DIGIT_SETS, type DigitKind, type GlyphSet } from './digitGlyphs';
import { FONT_SETS, type FontKind } from './fontGlyphs';

/** One painted glyph placed in a number: its left edge, and where it is cut from the atlas (all in screen px). */
export interface PlacedGlyph { c: string; x: number; w: number; srcX: number }
export interface DigitLayout { glyphs: PlacedGlyph[]; width: number; height: number; atlasW: number; atlasH: number; file: string }

/** Only digits, + and - are painted; anything else (a "+1 potion") stays ordinary text. */
export function isDigitText(text: string): boolean {
  return /^[+-]?\d+$/.test(text) || text === '+' || text === '-';
}

/**
 * Lay a number out in glyph sprites, scaled so the digits stand `digitHeight` px tall. Each glyph advances by its
 * solid width plus a small gap; the sprite overhangs by its soft edge (and the crit glow), so neighbours overlap
 * slightly instead of being cut off. The number's width is the sum of the advances.
 */
export function layoutDigits(text: string, kind: DigitKind, digitHeight: number): DigitLayout {
  const set = DIGIT_SETS[kind];
  const s = digitHeight / (set.base - set.top);
  const glyphs: PlacedGlyph[] = [];
  let x = 0;
  for (const ch of text) {
    const g = set.glyphs.find((q) => q.c === ch);
    if (!g) throw new Error(`no painted glyph for "${ch}"`);
    glyphs.push({ c: ch, x: x - g.lead * s, w: g.w * s, srcX: g.x * s });
    x += g.adv * s;
  }
  return { glyphs, width: x, height: set.h * s, atlasW: set.w * s, atlasH: set.h * s, file: set.file };
}

/** The digit height (px) of each kind of floating number, before the crit's pop-in scale. */
export const DIGIT_HEIGHT: Record<DigitKind, number> = { white: 24, crit: 30, hurt: 22, heal: 20 };

/** Fill `el` with the painted glyphs of `text`; the element keeps the number's own width so it centres cleanly. */
export function paintDigits(el: HTMLElement, text: string, kind: DigitKind) {
  const l = layoutDigits(text, kind, DIGIT_HEIGHT[kind]);
  el.style.width = `${l.width}px`;
  el.style.height = `${l.height}px`;
  el.setAttribute('aria-label', text);
  for (const g of l.glyphs) {
    const d = document.createElement('i');
    d.style.cssText = `left:${g.x.toFixed(2)}px;width:${g.w.toFixed(2)}px;height:${l.height}px;background-image:url(${l.file});background-size:${l.atlasW.toFixed(2)}px ${l.atlasH.toFixed(2)}px;background-position:${(-g.srcX).toFixed(2)}px 0`;
    el.appendChild(d);
  }
}

/** Start loading every atlas so the first number of a session never shows an empty box. */
export function preloadDigits() {
  for (const set of Object.values(DIGIT_SETS)) new Image().src = set.file;
}

// ─── Words: the three alphabets ──────────────────────────────────────────────────────────────────────────────────────

/** Typographic marks the alphabets lack a glyph for, set with the plain one instead. */
const LOOKALIKES: Record<string, string> = { '’': "'", '‘': "'", '–': '-', '—': '-', '“': '"', '”': '"' };

/** The ordinary text colour for characters no painted set has, matched to each alphabet. */
export const FALLBACK_COLOR: Record<FontKind, string> = { gold: '#f3d98a', brown: '#5a3418', blue: '#a8dcff', neutral: '#ebe8e1' };

/** A drawn glyph's sprite geometry (screen px). Its advance box starts at the item's `x`; the sprite overhangs by `lead`. */
export interface GlyphItem { kind: 'glyph'; c: string; set: GlyphSet; x: number; adv: number; lead: number; w: number; h: number; srcX: number; atlasW: number; atlasH: number; top: number }
export interface SpaceItem { kind: 'space'; x: number; adv: number }
/** A character no painted set has; its width comes from the caller's measure (or a guess). */
export interface FallbackItem { kind: 'fallback'; c: string; x: number; adv: number }
export type TextItem = GlyphItem | SpaceItem | FallbackItem;
export interface TextLayout { items: TextItem[]; width: number; cap: number; fallbacks: string[] }

const lookups = new Map<GlyphSet, Map<string, GlyphSet['glyphs'][number]>>();
function glyphOf(set: GlyphSet, c: string) {
  let m = lookups.get(set);
  if (!m) lookups.set(set, (m = new Map(set.glyphs.map((g) => [g.c, g]))));
  return m.get(c);
}

/**
 * Lay a line out in a painted alphabet, scaled so the capitals stand `cap` px tall. Glyphs advance by their own solid
 * width plus the baked-in tracking (plus `track` cap heights more; the "+" is drawn into each alphabet), a space is 0.3 cap, and characters with no
 * painted glyph become `fallback` items sized by `measure`. Case is kept: lowercase text uses the lowercase glyphs.
 */
export function layoutText(text: string, font: FontKind, cap: number, opts: { track?: number; measure?: (c: string) => number } = {}): TextLayout {
  const set = FONT_SETS[font];
  const s = cap / (set.base - set.top);
  const extra = (opts.track ?? 0) * cap;
  const items: TextItem[] = [];
  const fallbacks: string[] = [];
  let x = 0;
  for (const raw of text.replace(/…/g, '...')) {
    const c = LOOKALIKES[raw] ?? raw;
    if (c === ' ') {
      const adv = (set.space ?? 0.3 * (set.base - set.top)) * s;
      items.push({ kind: 'space', x, adv });
      x += adv;
      continue;
    }
    const g = glyphOf(set, c);
    if (g) {
      const adv = g.adv * s + extra;
      items.push({ kind: 'glyph', c, set, x, adv, lead: g.lead * s, w: g.w * s, h: set.h * s, srcX: g.x * s, atlasW: set.w * s, atlasH: set.h * s, top: set.top * s });
      x += adv;
    } else {
      const adv = (opts.measure?.(raw) ?? cap * 0.6) + extra;
      items.push({ kind: 'fallback', c: raw, x, adv });
      fallbacks.push(raw);
      x += adv;
    }
  }
  return { items, width: x, cap, fallbacks };
}

/**
 * Fill `el` with `text` set in an alphabet: one sprite per glyph in a baseline-aligned flex line, so a character with
 * no painted glyph simply stays ordinary text in the same line. Painting the same text again does nothing, so a HUD can
 * call this every frame. The text stays readable to assistive tech through `aria-label`.
 */
export function paintText(el: HTMLElement, text: string, font: FontKind, cap: number, track = 0) {
  const key = `${font}|${cap}|${track}|${text}`;
  if (el.dataset.painted === key) return;
  el.dataset.painted = key;
  const line = document.createElement('span');
  line.className = `ptext ${font}`;
  line.setAttribute('role', 'img');
  line.setAttribute('aria-label', text);
  line.style.color = FALLBACK_COLOR[font];
  const l = layoutText(text, font, cap, { track });
  for (const it of l.items) {
    if (it.kind === 'fallback') {
      const f = document.createElement('span');
      f.className = 'pf';
      f.textContent = it.c;
      f.style.fontSize = `${(cap / 0.7).toFixed(1)}px`;
      if (track) f.style.marginRight = `${(track * cap).toFixed(2)}px`;
      line.appendChild(f);
      continue;
    }
    const box = document.createElement('i');
    box.style.width = `${it.adv.toFixed(2)}px`;
    box.style.height = `${cap}px`;
    if (it.kind === 'glyph') {
      const b = document.createElement('b');
      b.style.cssText = `left:${(-it.lead).toFixed(2)}px;top:${(-it.top).toFixed(2)}px;width:${it.w.toFixed(2)}px;height:${it.h.toFixed(2)}px;background-image:url(${it.set.file});background-size:${it.atlasW.toFixed(2)}px ${it.atlasH.toFixed(2)}px;background-position:${(-it.srcX).toFixed(2)}px 0`;
      box.appendChild(b);
    }
    line.appendChild(box);
  }
  el.replaceChildren(line);
}

/** Start loading the alphabets so the first word of a session never shows an empty box. */
export function preloadFonts(kinds: FontKind[] = ['gold', 'blue']) {
  for (const k of kinds) new Image().src = FONT_SETS[k].file;
}

const bitmaps = new Map<string, Promise<ImageBitmap | null>>();
/**
 * A set's atlas as a bitmap for drawing words into a canvas (the portal titles). Fetched as a blob, so the canvas
 * stays untainted even when the game runs from a file; null outside a browser or if the file fails to load.
 */
export function loadAtlas(set: GlyphSet): Promise<ImageBitmap | null> {
  let p = bitmaps.get(set.file);
  if (!p) {
    p = typeof fetch === 'undefined' || typeof createImageBitmap === 'undefined'
      ? Promise.resolve(null)
      : fetch(set.file).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null);
    bitmaps.set(set.file, p);
  }
  return p;
}

/**
 * Draw a laid-out line into a canvas with its baseline at `y` and its left edge at `x`. `atlas` is the image of
 * `font`'s set; characters with no painted glyph are drawn with the context's own font and fill style.
 */
export function drawText(ctx: CanvasRenderingContext2D, atlas: ImageBitmap, font: FontKind, l: TextLayout, x: number, y: number) {
  const set = FONT_SETS[font];
  for (const it of l.items) {
    if (it.kind === 'fallback') ctx.fillText(it.c, x + it.x, y);
    else if (it.kind === 'glyph' && it.set === set) {
      const k = it.atlasW / set.w;
      ctx.drawImage(atlas, it.srcX / k, 0, it.w / k, set.h, x + it.x - it.lead, y - l.cap - it.top, it.w, it.h);
    }
  }
}
