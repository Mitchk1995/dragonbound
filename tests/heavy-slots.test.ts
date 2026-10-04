import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { MAX_SLOTS, MIN_FREE_BYTES, slotPipe, allowedSlots } = createRequire(import.meta.url)('../tools/heavy.cjs') as {
  MAX_SLOTS: number;
  MIN_FREE_BYTES: number;
  slotPipe: (slot: number) => string;
  allowedSlots: (freeBytes: number, maxSlots?: number, minFree?: number) => number[];
};

describe('heavy job slots', () => {
  it('keeps the original pipe name for slot 0 and gives each other slot its own', () => {
    expect(slotPipe(0)).toBe('\\\\.\\pipe\\dragonbound-heavy');
    expect(new Set(Array.from({ length: MAX_SLOTS }, (_, i) => slotPipe(i))).size).toBe(MAX_SLOTS);
  });

  it('opens every slot when plenty of memory is free', () => {
    expect(allowedSlots(MIN_FREE_BYTES)).toEqual([0, 1, 2, 3]);
    expect(allowedSlots(32 * 1024 ** 3)).toHaveLength(MAX_SLOTS);
  });

  it('opens only slot 0 when memory is short, so a lone job never deadlocks', () => {
    expect(allowedSlots(MIN_FREE_BYTES - 1)).toEqual([0]);
    expect(allowedSlots(0)).toEqual([0]);
  });

  it('honours custom limits', () => {
    expect(allowedSlots(10, 2, 5)).toEqual([0, 1]);
    expect(allowedSlots(4, 2, 5)).toEqual([0]);
  });
});
