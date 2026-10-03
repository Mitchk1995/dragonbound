import { describe, expect, it } from 'vitest';
import { worldTextShows } from '../src/ui/worldTextRule';

describe('world text visibility', () => {
  it('shows names, labels, bars and floaters only during play', () => {
    expect(worldTextShows('play')).toBe(true);
    expect(worldTextShows('title')).toBe(false);
    expect(worldTextShows('create')).toBe(false);
  });
});
