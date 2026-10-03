import { describe, expect, it } from 'vitest';
import { HUD_CLEARANCE, NAME_CAP, WORD_CAP, overlapsHud, worldTextShows } from '../src/ui/worldTextRule';

describe('world text visibility', () => {
  it('shows names, labels, bars and floaters only during play', () => {
    expect(worldTextShows('play')).toBe(true);
    expect(worldTextShows('title')).toBe(false);
    expect(worldTextShows('create')).toBe(false);
  });
});

describe('world lettering sizes', () => {
  it('sets names over heads a clear step larger than pickup words, both still readable', () => {
    expect(NAME_CAP).toBeGreaterThanOrEqual(WORD_CAP * 1.25);
    expect(WORD_CAP).toBeGreaterThanOrEqual(13);
  });
});

describe('world labels give way to HUD panels', () => {
  const plaque = { left: 16, top: 12, right: 250, bottom: 50 };
  const hidden = { left: 0, top: 0, right: 0, bottom: 0 };

  it('catches a label sliding under a panel, or within the clearance of its edge', () => {
    expect(overlapsHud({ left: 200, top: 40, right: 300, bottom: 80 }, [plaque])).toBe(true);
    expect(overlapsHud({ left: 252, top: 20, right: 320, bottom: 40 }, [plaque])).toBe(true);
  });

  it('leaves a label clear of every panel alone', () => {
    expect(overlapsHud({ left: 250 + HUD_CLEARANCE + 1, top: 20, right: 400, bottom: 40 }, [plaque])).toBe(false);
    expect(overlapsHud({ left: 20, top: 50 + HUD_CLEARANCE + 1, right: 200, bottom: 90 }, [plaque])).toBe(false);
  });

  it('ignores hidden panels, which measure empty', () => {
    expect(overlapsHud({ left: -10, top: -10, right: 10, bottom: 10 }, [hidden])).toBe(false);
    expect(overlapsHud({ left: 100, top: 100, right: 200, bottom: 200 }, [])).toBe(false);
  });
});
