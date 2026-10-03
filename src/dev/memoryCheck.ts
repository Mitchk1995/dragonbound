import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import type { Slot } from '../types';

/** Repeat real portal trips, looting and dressing; compare settled GPU resource counts. */
export async function memoryCheck(g: Game) {
  const frames = async () => {
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  };
  const sample = () => {
    const m = g.renderer.info.memory;
    return { geometries: m.geometries, textures: m.textures, programs: m.programs, renderTargets: m.renderTargets };
  };
  const round = async () => {
    for (const zone of ['mine', 'foothills', 'ruin', 'lair', 'keep']) {
      g.travel(zone, true);
      await frames();
    }
    for (const weapon of ['worn_bow', 'apprentice_staff', 'bronze_sword']) {
      g.save.equipment.weapon = makeItem(weapon);
      g.dressHero();
      const item = makeItem('bronze_gauntlets');
      item.rarity = 'rare';
      g.items.drop(item, 0, g.player.x, g.player.z, 1);
      await frames();
      for (const loot of g.zone.items) loot.gone = true;
      g.items.update(0);
      await frames();
    }
  };
  g.debug.timeScale = 0;
  const original = { ...g.save.equipment };
  try {
    // Warm deferred shadow/model buffers as well as first-use shader programs.
    await round();
    await round();
    const baseline = sample();
    const rounds = [];
    for (let i = 0; i < 3; i++) { await round(); rounds.push(sample()); }
    const stable = rounds.every(row => row.geometries === baseline.geometries && row.textures === baseline.textures && row.programs === baseline.programs);
    if (!stable) console.error(`Resource counts grew during repeated travel/loot/equipment: ${JSON.stringify({ baseline, rounds })}`);
    return { stable, warmupRounds: 2, baseline, rounds };
  } finally {
    for (const slot of Object.keys(original) as Slot[]) g.save.equipment[slot] = original[slot];
    g.dressHero();
    g.debug.timeScale = 1;
  }
}
