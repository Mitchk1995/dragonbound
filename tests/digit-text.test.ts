import { describe, expect, it } from 'vitest';
import { DIGIT_SETS } from '../src/ui/digitGlyphs';
import { DIGIT_HEIGHT, isDigitText, layoutDigits } from '../src/ui/digitText';

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
