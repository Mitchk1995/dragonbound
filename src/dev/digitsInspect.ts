import type { Game } from '../game';

/**
 * Dev only (inspect suite `digits`): the painted damage numbers in the real game. A normal hit, a critical hit,
 * a hit taken, a heal and a gold pickup (kept as text) float over an enemy and the hero at the gameplay camera,
 * captured while they rise.
 */
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

export async function digitsSuite(g: Game, shot: (name: string) => Promise<void>) {
  g.travel('foothills', true);
  await frames(15);
  const p = g.player;
  g.camPos.copy(p.pos);
  await frames(5);
  g.text.clear();
  const put = (text: string, dx: number, dz: number, y: number, cls: string) => g.text.float(text, p.x + dx, y, p.z + dz, cls);
  put('37', -3.2, -3, 1.6, 'dmg');
  put('1284', -0.6, -4, 1.9, 'crit');
  put('9', 1.6, -3.4, 1.6, 'dmg');
  put('412', 3.6, -3, 1.7, 'crit');
  put('-18', 0.2, 0.2, 2.2, 'hurt');
  put('+25', -2, -0.2, 2.2, 'heal');
  put('+1 potion', 2.2, 0.2, 2.4, 'heal');
  put('+30 gold', 0.2, 1.8, 2.2, 'gold');
  await frames(14);
  await shot('digits-in-game');
  g.text.clear();
}
