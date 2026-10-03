import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { ZONES } from '../src/data/zones';
import { DIGIT_SETS } from '../src/ui/digitGlyphs';
import { FONT_CAP, FONT_SETS, type FontKind } from '../src/ui/fontGlyphs';
import { DIGIT_HEIGHT, isDigitText, layoutDigits, layoutText } from '../src/ui/paintedText';

describe('painted damage digits', () => {
  it('paints plain numbers and signed numbers, and leaves other text alone', () => {
    for (const t of ['7', '1234', '-45', '+12', '0']) expect(isDigitText(t)).toBe(true);
    for (const t of ['+1 potion', '+30 gold', '', '1.5', 'x']) expect(isDigitText(t)).toBe(false);
  });

  it('has all twelve glyphs in every set, inside its atlas, in order', () => {
    for (const set of Object.values(DIGIT_SETS)) {
      expect(set.glyphs.map((g) => g.c).join('')).toBe('0123456789+-');
      let end = 0;
      for (const g of set.glyphs) {
        expect(g.x).toBeGreaterThanOrEqual(end);
        end = g.x + g.w;
        expect(g.adv).toBeGreaterThan(0);
      }
      expect(end).toBeLessThanOrEqual(set.w);
      expect(set.base).toBeGreaterThan(set.top);
    }
  });

  it('sets glyphs left to right, each advancing by its own width, and scales with the digit height', () => {
    const l = layoutDigits('-45', 'hurt', 22);
    expect(l.glyphs.map((g) => g.c)).toEqual(['-', '4', '5']);
    const s = 22 / (DIGIT_SETS.hurt.base - DIGIT_SETS.hurt.top);
    const adv = (c: string) => DIGIT_SETS.hurt.glyphs.find((g) => g.c === c)!.adv * s;
    expect(l.width).toBeCloseTo(adv('-') + adv('4') + adv('5'), 6);
    expect(l.glyphs[1].x + DIGIT_SETS.hurt.glyphs.find((g) => g.c === '4')!.lead * s).toBeCloseTo(adv('-'), 6);
    const big = layoutDigits('-45', 'hurt', 44);
    expect(big.width).toBeCloseTo(l.width * 2, 6);
  });

  it('draws the crit biggest and rejects characters that are not painted', () => {
    expect(DIGIT_HEIGHT.crit).toBeGreaterThan(DIGIT_HEIGHT.white);
    expect(() => layoutDigits('1a', 'white', 20)).toThrow();
  });
});

describe('painted alphabets', () => {
  const ALL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'-:+";
  const glyph = (font: FontKind, c: string) => FONT_SETS[font].glyphs.find((g) => g.c === c)!;

  it('has every letter, digit and mark in each set, inside its atlas, in order', () => {
    for (const set of Object.values(FONT_SETS)) {
      expect(set.glyphs.map((g) => g.c).join('')).toBe(ALL);
      let end = 0;
      for (const g of set.glyphs) {
        expect(g.x).toBeGreaterThanOrEqual(end);
        end = g.x + g.w;
        expect(g.adv).toBeGreaterThan(0);
      }
      expect(end).toBeLessThanOrEqual(set.w);
      expect(set.base - set.top).toBeCloseTo(FONT_CAP, 1);
      expect(set.space).toBeCloseTo(0.3 * FONT_CAP, 1);
    }
  });

  it('sets text with its own case, a word space of 0.3 cap, and scales with the cap height', () => {
    const l = layoutText('Ab ab', 'gold', 20);
    const k = 20 / FONT_CAP;
    expect(l.items.map((i) => (i.kind === 'glyph' ? i.c : i.kind))).toEqual(['A', 'b', 'space', 'a', 'b']);
    expect(l.items[2].kind).toBe('space');
    expect(l.items[2].adv).toBeCloseTo(6, 6);
    const a = l.items[3] as { srcX: number };
    expect(a.srcX).toBeCloseTo(glyph('gold', 'a').x * k, 6);
    expect(l.items[0]).toMatchObject({ x: 0 });
    expect(l.items[1].x).toBeCloseTo(glyph('gold', 'A').adv * k, 6);
    expect(l.fallbacks).toEqual([]);
    expect(layoutText('Ab ab', 'gold', 40).width).toBeCloseTo(l.width * 2, 6);
    expect(layoutText('ab', 'gold', 20, { track: 0.1 }).width).toBeCloseTo(layoutText('ab', 'gold', 20).width + 4, 6);
  });

  it('draws the "+" in every alphabet and falls back to plain text for what no set has', () => {
    for (const font of ['gold', 'brown', 'blue'] as const) expect(layoutText('+30 gold', font, 20).fallbacks).toEqual([]);
    const odd = layoutText('Keep · (a/b)', 'gold', 20, { measure: () => 7 });
    expect(odd.fallbacks).toEqual(['·', '(', '/', ')']);
    expect(odd.items.find((i) => i.kind === 'fallback')).toMatchObject({ adv: 7 });
    expect(layoutText('Cinderwing’s', 'blue', 20).fallbacks).toEqual([]);
  });

  it('paints every zone, NPC and boss name in the game without falling back', () => {
    const names = [...Object.values(ZONES).map((z) => z.name), 'The Warden', 'Quartermaster Bram', ...Object.values(ENEMIES).map((e) => e.name)];
    for (const n of names) expect(layoutText(n, 'gold', 16).fallbacks, n).toEqual([]);
  });
});
