import type { Vec2 } from '../../types';
import type { ZoneLayout } from '../../world/layout';
import { NavGrid } from '../../world/navgrid';
import { RUN, type HubPlan } from './plan';

export interface Walk {
  from: string;
  to: string;
  /** The way the hero runs (the game's own pathfinding), from the first spot to the second. */
  path: Vec2[];
  metres: number;
  seconds: number;
}

/** The game's walk grid for a layout (a fresh one: its own copy of the cells). */
const navOf = (l: ZoneLayout) => new NavGrid(l.w, l.h, l.cells);

/** The hero's run between two spots of a plan, timed at his run speed; null if there is no way. */
function walk(plan: HubPlan, a: string, b: string, nav = navOf(plan.layout)): Walk | null {
  const s = plan.spots.find((p) => p.id === a), t = plan.spots.find((p) => p.id === b);
  if (!s || !t) throw new Error(`hub layout ${plan.id}: no spot ${s ? b : a}`);
  const start = nav.nearestWalkable(s.at.x, s.at.z);
  if (!start) return null;
  const way = nav.findPath(start.x, start.z, t.at.x, t.at.z, 200000);
  if (!way) return null;
  const path = [start, ...way];
  let metres = 0;
  for (let i = 1; i < path.length; i++) metres += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return { from: a, to: b, path, metres: +metres.toFixed(1), seconds: +(metres / RUN).toFixed(1) };
}

/** Every timed walk of a plan (its `routes`). */
export function walks(plan: HubPlan): Walk[] {
  const nav = navOf(plan.layout);
  return plan.routes.map(([a, b]) => {
    const w = walk(plan, a, b, nav);
    if (!w) throw new Error(`hub layout ${plan.id}: no way from ${a} to ${b}`);
    return w;
  });
}
