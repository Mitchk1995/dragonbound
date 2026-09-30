import { describe, expect, it } from 'vitest';
import { canAfford, computeStats, manaRegenFor, maxManaFor } from '../src/combat/stats';
import { ABILITIES, ABILITY_ELEMENT, abilityFor } from '../src/data/abilities';
import { MANA_TUNING } from '../src/data/tuning';
import { SKILLS, type SkillId, type Style } from '../src/types';
import { SIDE_TABS, TAB_KEYS, consoleKeys, cooldownFrac, escapeAction, isSideTab, pressTab, showTab, swapSlots } from '../src/ui/hudLayout';

const levels = (n: number, over: Partial<Record<SkillId, number>> = {}) =>
  Object.fromEntries(SKILLS.map((k) => [k, over[k] ?? n])) as Record<SkillId, number>;

describe('mana: one pool shared by every weapon style', () => {
  it('grows with the best combat-style level, whichever style that is', () => {
    expect(maxManaFor(levels(1))).toBe(MANA_TUNING.base + MANA_TUNING.perLevel);
    const melee = maxManaFor(levels(1, { melee: 40 }));
    expect(maxManaFor(levels(1, { magic: 40 }))).toBe(melee);
    expect(maxManaFor(levels(1, { ranged: 40 }))).toBe(melee);
    expect(maxManaFor(levels(99))).toBeGreaterThan(maxManaFor(levels(50)));
  });

  it('is the same pool whatever weapon is held (swapping never refills or drains it)', () => {
    const lv = levels(30, { magic: 45 });
    const sword = computeStats(lv, {});
    expect(sword.style).toBe('melee');
    expect(sword.maxMana).toBe(maxManaFor(lv));
    expect(sword.manaRegen).toBeCloseTo(manaRegenFor(sword.maxMana));
  });

  it('a new character can chain a few skills but not spam them', () => {
    const st = computeStats(levels(1), {});
    for (const style of ['melee', 'ranged', 'magic'] as Style[]) {
      const q = abilityFor(style, 'Q')!, w = abilityFor(style, 'W')!;
      // Q then W from a full pool, with room for a second Q...
      expect(st.maxMana).toBeGreaterThanOrEqual(q.mana * 2 + w.mana);
      // ...but casting Q and W on cooldown drains faster than the pool refills in a fight.
      expect(q.mana / q.cooldown + w.mana / w.cooldown).toBeGreaterThan(st.manaRegen);
    }
  });

  it('every skill costs mana, bigger skills cost more, and each has an element for its tile', () => {
    for (const a of Object.values(ABILITIES)) {
      expect(a.mana, a.id).toBeGreaterThan(0);
      expect(ABILITY_ELEMENT[a.id], a.id).toBeTruthy();
    }
    for (const style of ['melee', 'ranged', 'magic'] as Style[]) expect(abilityFor(style, 'E')!.mana).toBeGreaterThan(abilityFor(style, 'Q')!.mana);
  });

  it('refuses a cast only when the pool is genuinely short', () => {
    expect(canAfford(8, 8)).toBe(true);
    expect(canAfford(8 - 1e-9, 8)).toBe(true);
    expect(canAfford(7.9, 8)).toBe(false);
  });
});

describe('side panel tabs (OSRS)', () => {
  it('opens on the inventory, and every tab has a hotkey', () => {
    expect(SIDE_TABS[0].id).toBe('inventory');
    for (const t of SIDE_TABS) if (t.id !== 'help') expect(TAB_KEYS[t.key.toLowerCase()]).toBe(t.id);
    expect(TAB_KEYS.b).toBe('inventory');
    expect(isSideTab('journal')).toBe(true);
    expect(isSideTab('bank')).toBe(false);
  });

  it('pressing another tab switches; pressing the open tab folds and unfolds the panel', () => {
    let s = { tab: 'inventory' as const, collapsed: false };
    const k = pressTab(s, 'skills');
    expect(k).toEqual({ tab: 'skills', collapsed: false });
    const folded = pressTab(k, 'skills');
    expect(folded.collapsed).toBe(true);
    expect(pressTab(folded, 'skills').collapsed).toBe(false);
    // A different tab always unfolds.
    expect(pressTab(folded, 'journal')).toEqual({ tab: 'journal', collapsed: false });
    // A bank opening forces the inventory into view, even when folded.
    expect(showTab({ tab: 'skills', collapsed: true }, 'inventory')).toEqual({ tab: 'inventory', collapsed: false });
    s = { tab: 'inventory', collapsed: false };
    expect(showTab(s, 'inventory')).toEqual(s);
  });

  it('Escape closes a dialogue, then windows, then flips to settings and back', () => {
    const s = { tab: 'inventory' as const, collapsed: false };
    expect(escapeAction(true, 2, s)).toBe('dialogue');
    expect(escapeAction(false, 1, s)).toBe('windows');
    expect(escapeAction(false, 0, s)).toEqual({ tab: 'help', collapsed: false });
    expect(escapeAction(false, 0, { tab: 'help', collapsed: false })).toEqual({ tab: 'inventory', collapsed: false });
    expect(escapeAction(false, 0, { tab: 'help', collapsed: true })).toEqual({ tab: 'help', collapsed: false });
  });
});

describe('console', () => {
  it('shows Q W E, and R only once a skill uses it', () => {
    for (const style of ['melee', 'ranged', 'magic'] as Style[]) {
      const keys = consoleKeys(style);
      expect(keys.slice(0, 3)).toEqual(['Q', 'W', 'E']);
      expect(keys.includes('R')).toBe(!!abilityFor(style, 'R'));
    }
  });

  it('cooldown sweep is the fraction left, respecting cooldown reduction', () => {
    expect(cooldownFrac(0, 8, 0)).toBe(0);
    expect(cooldownFrac(4, 8, 0)).toBe(0.5);
    expect(cooldownFrac(4, 8, 0.5)).toBe(1);
    expect(cooldownFrac(9, 8, 0)).toBe(1);
  });
});

describe('inventory drag-rearrange', () => {
  it('swaps two slots, including into an empty one', () => {
    const inv: (string | null)[] = ['sword', null, 'ore', null];
    expect(swapSlots(inv, 0, 3)).toBe(true);
    expect(inv).toEqual([null, null, 'ore', 'sword']);
    expect(swapSlots(inv, 2, 3)).toBe(true);
    expect(inv).toEqual([null, null, 'sword', 'ore']);
  });

  it('ignores drops on the same slot, from an empty slot or out of range', () => {
    const inv: (string | null)[] = ['a', null];
    expect(swapSlots(inv, 0, 0)).toBe(false);
    expect(swapSlots(inv, 1, 0)).toBe(false);
    expect(swapSlots(inv, 0, 5)).toBe(false);
    expect(inv).toEqual(['a', null]);
  });
});
