import { describe, expect, it } from 'vitest';
import { bedding } from '../src/world/terrain';

describe('natural cliff bedding', () => {
  const beds = bedding(99);

  it('stacks its planes upward at irregular spacing', () => {
    const gaps = beds.L.slice(1).map((y, k) => y - beds.L[k]);
    expect(gaps.every((g) => g > 0.5)).toBe(true);
    expect(new Set(gaps.map((g) => g.toFixed(2))).size).toBeGreaterThan(gaps.length * 0.8);
  });

  it('names the bed a stratum value falls in', () => {
    for (let k = 1; k < beds.L.length - 1; k += 7) {
      expect(beds.index(beds.L[k])).toBe(k);
      expect(beds.index(beds.L[k] - 1e-6)).toBe(k - 1);
      expect(beds.index((beds.L[k] + beds.L[k + 1]) / 2)).toBe(k);
    }
  });

  it('keeps the beds at the ground on the ground, and every bed above it over it', () => {
    for (const [x, z, f] of [[10.5, 20.25, 0], [63, 101, 11], [140.7, 33.1, 5]]) {
      const gi = beds.groundIndex(x, z, f);
      // Rock barely above the floor hugs it (the floor mesh meets it exactly).
      expect(beds.bandY(gi, x, z, f, f + 0.3)).toBeCloseTo(f + 0.3);
      expect(beds.bandY(gi, x, z, f, f + 4)).toBeCloseTo(f + 0.6);
      // The first ledge above the ground stands clear of the hugging band, and the planes climb.
      expect(beds.bandY(gi + 1, x, z, f, f + 4)).toBeGreaterThan(f + 0.6);
      expect(beds.plane(gi + 2, x, z)).toBeGreaterThan(beds.plane(gi + 1, x, z));
    }
  });

  it('cuts any height into the bed whose plane lies at or below it', () => {
    for (const [x, z] of [[3, 4], [77.5, 12.25], [200, 150]]) {
      for (let y = 1; y < 30; y += 1.37) {
        const k = beds.index(beds.q(y, x, z));
        expect(beds.plane(k, x, z)).toBeLessThanOrEqual(y + 1e-9);
        expect(beds.plane(k + 1, x, z)).toBeGreaterThan(y);
      }
    }
  });
});
