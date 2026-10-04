import { describe, expect, it } from 'vitest';
import { planA } from '../src/dev/hub/optionA';
import { planB } from '../src/dev/hub/optionB';
import { planC } from '../src/dev/hub/optionC';
import { type HubPlan, stairRects, RISER, RISERS } from '../src/dev/hub/plan';
import { walks } from '../src/dev/hub/walk';
import { Cell } from '../src/world/layout';
import { CELL } from '../src/world/kit/scale';

// The hub town's three layout options (dev only, src/dev/hub/): each must hold together as a town the
// hero can use: every station reachable, buildings clear of each other and of the streets, on the
// kit's grid, and the castle stair climbing the rock's full height.
const PLANS: [string, () => HubPlan][] = [['A', planA], ['B', planB], ['C', planC]];

describe.each(PLANS)('hub layout %s', (_, make) => {
  const plan = make();

  it('has a way between every pair of places it times (the busiest stations, the castle stair, the road out)', () => {
    for (const w of walks(plan)) expect(w.seconds, `${w.from} to ${w.to}`).toBeGreaterThan(0);
  });

  it('stands every building on the kit grid, clear of the others', () => {
    const boxes = [...plan.masses.map((m) => m.box), ...plan.houses.map((h) => h.box)];
    const onGrid = (v: number) => Math.abs(v / CELL - Math.round(v / CELL)) < 1e-6;
    for (const b of boxes) expect([b.x0, b.z0, b.x1, b.z1].every(onGrid), `${b.x0}, ${b.z0}`).toBe(true);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0, `${a.x0},${a.z0} and ${b.x0},${b.z0}`).toBe(false);
    }
    expect(plan.houses.length).toBeGreaterThanOrEqual(14);
    expect(plan.houses[plan.bakery]).toBeDefined();
  });

  it('climbs the castle stair the rock\'s height in 41 risers, every station off the rock', () => {
    const legs = stairRects(plan.stair);
    expect(legs.reduce((n, l) => n + (l.flight ? Math.round((l.top1 - l.top0) / RISER) : 0), 0)).toBe(RISERS);
    const l = plan.layout;
    for (const s of plan.spots.filter((p) => p.kind === 'station')) expect(l.cells[Math.floor(s.at.z) * l.w + Math.floor(s.at.x)], s.id).not.toBe(Cell.Cliff);
  });
});
