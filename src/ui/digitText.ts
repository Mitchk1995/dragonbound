import { DIGIT_SETS, type DigitKind } from './digitGlyphs';

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
