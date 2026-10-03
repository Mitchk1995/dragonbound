import { describe, expect, it } from 'vitest';
import { AFFIXES } from '../src/data/affixes';
import { FONT_SETS } from '../src/ui/fontGlyphs';
import { layoutText } from '../src/ui/paintedText';
import { COMMON, MIN_CAP, capFor, parseTint, tintChannel, tokenize } from '../src/ui/uiText';

describe('menu lettering', () => {
  it('has every character the menus use in the neutral alphabet, including the built middle dot', () => {
    const have = new Set(FONT_SETS.neutral.glyphs.map((g) => g.c));
    for (const c of `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'-:+%/()&#[]";·`) expect(have.has(c), c).toBe(true);
    expect(have.has('@')).toBe(false); // the sheet's two mistaken marks are dropped
  });

  it('sets typographic quotes, dashes and the ellipsis with painted look-alikes', () => {
    const l = layoutText('“Hi” – wait…', 'neutral', 10);
    expect(l.fallbacks).toEqual([]);
  });

  it('keeps small text at the minimum cap height the owner judged readable', () => {
    expect(capFor(11)).toBe(MIN_CAP);
    expect(capFor(9.5)).toBe(MIN_CAP);
    expect(capFor(20)).toBeGreaterThan(MIN_CAP);
  });

  it('tints luminance by colour, with highlights lifting toward white', () => {
    expect(tintChannel(0, 255)).toBe(0);
    expect(tintChannel(128, 255)).toBe(Math.round(Math.min(1, (128 / 255) * 1.15) * 255));
    expect(tintChannel(255, 0)).toBe(Math.round(1.6 * 0.25 * 255));
    expect(tintChannel(255, 255)).toBe(255);
  });

  it('splits text into words and single breakable spaces', () => {
    expect(tokenize('  Click:\n equip  ')).toEqual([
      { word: false, text: ' ' }, { word: true, text: 'Click:' }, { word: false, text: ' ' }, { word: true, text: 'equip' }, { word: false, text: ' ' },
    ]);
  });

  it('reads the tint custom property, falling back to Common', () => {
    expect(parseTint(' 255 150 40')).toEqual([255, 150, 40]);
    expect(parseTint('')).toEqual(COMMON);
    expect(parseTint('red')).toEqual(COMMON);
  });

  it('gives no shipped affix an element tint it cannot show', () => {
    for (const a of Object.values(AFFIXES)) expect([undefined, 'fire', 'frost', 'lightning', 'poison', 'bad']).toContain(a.tint);
  });
});
