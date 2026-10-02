import { describe, expect, it } from 'vitest';
import { CASTLE_PLAN } from '../src/data/zoneMaps';
import { ZONES } from '../src/data/zones';
import { Cell, Fluid, Ground, Lawn, lawnCell } from '../src/world/layout';

const L = ZONES.keep.build(1000 + 'keep'.length * 97);

describe('lawn', () => {
  it('grows on grass over open ground, trees and props, never on paving, water or rock', () => {
    expect(lawnCell(Cell.Ground, Ground.Grass, Fluid.None, true)).toBe(Lawn.Clipped);
    expect(lawnCell(Cell.Tree, Ground.Grass, Fluid.None, false)).toBe(Lawn.Meadow);
    expect(lawnCell(Cell.Blocked, Ground.Grass, Fluid.None, false)).toBe(Lawn.Meadow);
    expect(lawnCell(Cell.Ground, Ground.Stone, Fluid.None, true)).toBe(Lawn.None);
    expect(lawnCell(Cell.Ground, Ground.Grass, Fluid.Water, false)).toBe(Lawn.None);
    expect(lawnCell(Cell.Cliff, Ground.Grass, Fluid.None, false)).toBe(Lawn.None);
  });

  it('carpets every grassy cell of the island: clipped in the castle, meadow outside', () => {
    expect(L.lawn).toBeDefined();
    const lawn = L.lawn!;
    let clipped = 0, meadow = 0;
    for (let i = 0; i < L.w * L.h; i++) {
      const open = L.cells[i] === Cell.Ground && !L.fluid[i];
      if (open && L.ground[i] === Ground.Grass) expect(lawn[i]).not.toBe(Lawn.None);
      if (open && (L.ground[i] === Ground.Path || L.ground[i] === Ground.Dirt)) expect(lawn[i]).toBe(Lawn.None);
      if (lawn[i] === Lawn.Clipped) clipped++;
      if (lawn[i] === Lawn.Meadow) meadow++;
    }
    expect(clipped).toBeGreaterThan(1000);
    expect(meadow).toBeGreaterThan(clipped);
    // The parterre's lawn is clipped, the meadow by the farm is not.
    const at = (x: number, z: number) => lawn[z * L.w + x];
    expect(at(CASTLE_PLAN.zones.parterre.x - 6, CASTLE_PLAN.zones.parterre.z - 3)).toBe(Lawn.Clipped);
    expect(at(56, 132)).toBe(Lawn.Meadow);
  });

  it('ends the parterre in a circle round the fountain, with paving out to it', () => {
    const { x, z } = CASTLE_PLAN.fountain;
    const cut = L.lawnCut?.find((c) => c.x === x && c.z === z);
    expect(cut).toBeDefined();
    // The plaza's paving reaches the circle on every panel diagonal (no lawn ground inside it).
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const d = (cut!.r - 0.3) / Math.SQRT2;
      const i = Math.floor(z + sz * d) * L.w + Math.floor(x + sx * d);
      expect(L.ground[i]).toBe(Ground.Stone);
    }
  });
});
