import { BASES } from '../data/items';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import type { Slot } from '../types';

export const W = 1600, H = 900;
export const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

export function equip(g: Game, gear: Partial<Record<Slot, string | null>>) {
  for (const [slot, id] of Object.entries(gear)) g.save.equipment[slot as Slot] = id && BASES[id] ? makeItem(id) : null;
  g.prog.recomputeStats();
  g.dressHero();
}

/**
 * An open spot by one of the Foothills goblin camps (their fires, east to west: 0 = the south-east
 * camp, 1 = the southern camp, 2 and 3 = the war camp), `dz` south of its fire. Found from the layout, so
 * the harness follows the map when it moves.
 */
export function goblinCamp(g: Game, which: number, dz = 5) {
  const fires = g.zone.layout.props.filter((p) => p.kind === 'campfire' && p.z > 115).sort((a, b) => b.x - a.x || b.z - a.z);
  const f = fires[Math.min(which, fires.length - 1)];
  return { x: f.x, z: f.z + dz };
}
