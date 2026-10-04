import { startAction, type ActionKind } from '../ai/boss';
import { UNIQUES } from '../data/items';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { equip, frames, goblinCamp } from './inspectCommon';

// ─── Effects ────────────────────────────────────────────────────────────────

/**
 * Combat effects captured mid-flight: every weapon style's basic attack and abilities against a
 * few targets, plus loot drops. The simulation is stepped by hand (the frame loop only renders)
 * so each capture lands at a fixed time after the trigger.
 */
export async function effectsSuite(g: Game, shot: (n: string) => Promise<void>) {
  g.travel('foothills', true);
  await frames(15);
  // An open clearing (the southern goblin camp, emptied for the test).
  const spot = goblinCamp(g, 0);
  const p = g.player;
  const step = (secs: number) => {
    for (let i = 0; i < Math.round(secs * 60); i++) g.update(1 / 60);
  };
  g.debug.hold = () => false; // render only; the suite advances time itself
  const setup = (weapon: string) => {
    for (const e of g.zone.enemies) {
      e.dead = true;
      e.obj.removeFromParent();
    }
    g.zone.enemies = [];
    for (const it of g.zone.items) it.group.removeFromParent();
    g.zone.items = [];
    g.text.clear();
    equip(g, { weapon });
    p.pos.set(spot.x, 0, spot.z);
    p.stop();
    p.cds = {};
    g.combat.mana = Infinity; // every case starts with a full pool
    p.action = null;
    p.dash = null;
    g.camPos.copy(p.pos);
    const targets = [[0, -5.5], [-2, -6.5], [2, -6.8]].map(([dx, dz]) => g.combat.spawnEnemy('goblin', spot.x + dx, spot.z + dz, null));
    for (const t of targets) t.faceTo(p.x, p.z, true);
    g.hovered = targets[0];
    g.ground.set(targets[0].x, 0, targets[0].z);
    p.faceTo(targets[0].x, targets[0].z, true);
    step(0.1);
    return targets;
  };
  const cases: [string, string, (t: ReturnType<typeof setup>) => void, number[]][] = [
    // Times bracket each attack's impact frame (COMBAT_TUNING: a steel sword lands at 0.40 s,
    // a worn bow looses at 0.46 s, a staff bolt at 0.51 s; skills land at 55% of their cast).
    ['melee-basic', 'steel_sword', (t) => g.combat.startBasicAttack(t[0]), [0.28, 0.42, 0.6]],
    ['melee-cleave', 'steel_sword', () => g.combat.useAbility('Q'), [0.28, 0.4, 0.55]],
    ['melee-leap_slam', 'steel_longsword', () => g.combat.useAbility('W'), [0.3, 0.65]],
    ['melee-war_cry', 'steel_sword', () => g.combat.useAbility('E'), [0.3, 0.6]],
    ['ranged-basic', 'worn_bow', (t) => g.combat.startBasicAttack(t[0]), [0.4, 0.52]],
    ['ranged-multishot', 'worn_bow', () => g.combat.useAbility('Q'), [0.3, 0.45]],
    ['ranged-roll', 'worn_bow', () => g.combat.useAbility('W'), [0.12]],
    ['ranged-arrow_rain', 'worn_bow', () => g.combat.useAbility('E'), [0.8, 1.4]],
    ['magic-basic', 'apprentice_staff', (t) => g.combat.startBasicAttack(t[0]), [0.45, 0.6]],
    ['magic-fireball', 'apprentice_staff', () => g.combat.useAbility('Q'), [0.3, 0.6]],
    ['magic-frost_nova', 'apprentice_staff', () => g.combat.useAbility('W'), [0.36, 0.5]],
    ['magic-chain_lightning', 'apprentice_staff', () => g.combat.useAbility('E'), [0.36, 0.44]],
  ];
  let n = 1;
  for (const [name, weapon, trigger, times] of cases) {
    const t = setup(weapon);
    // Aim at the first target (hover is recomputed from the mouse each update, so set it last).
    g.hovered = t[0];
    g.ground.set(t[0].x, 0, t[0].z);
    trigger(t);
    let at = 0;
    for (const time of times) {
      step(time - at);
      at = time;
      await shot(`fx-${String(n++).padStart(2, '0')}-${name}-${time}s`);
    }
    step(1.5);
  }
  // Loot: a unique and a rare drop (beams, labels).
  setup('steel_sword');
  const u = Object.values(UNIQUES)[0];
  g.items.drop({ ...makeItem(u.base), unique: u.id, rarity: 'unique' } as any, 0, spot.x + 1, spot.z - 2, 1);
  g.items.drop({ ...makeItem('steel_platebody'), rarity: 'rare' } as any, 120, spot.x - 1.5, spot.z - 2.5, 1);
  step(1.2);
  await shot(`fx-${String(n++).padStart(2, '0')}-loot-drops`);
  g.altHeld = true;
  step(0.1);
  await shot(`fx-${String(n++).padStart(2, '0')}-loot-labels`);
  g.altHeld = false;
  g.debug.hold = null;
}

// ─── Boss attacks ───────────────────────────────────────────────────────────

/**
 * Cinderwing's attacks, each triggered deterministically and captured at the telegraph and the
 * hit: bite, breath (wind-up + fire cone), tail sweep, wing gust, and the phase-2 flight with
 * meteor rain. The hero is invulnerable (god mode) and stands 6 units south in the arena.
 */
export async function bossSuite(g: Game, shot: (n: string) => Promise<void>) {
  g.travel('lair', true);
  await frames(15);
  const L = g.zone.layout;
  const boss = g.zone.enemies.find((e) => e.def.behavior === 'boss')!;
  const p = g.player;
  const step = (secs: number) => {
    for (let i = 0; i < Math.round(secs * 60); i++) g.update(1 / 60);
  };
  g.debug.hold = () => false;
  g.debug.god = true;
  g.camZoom = 1.35;
  const reset = () => {
    p.pos.set(L.boss!.x, 0, L.boss!.z + 6);
    p.stop();
    g.camPos.copy(p.pos);
    boss.pos.set(L.boss!.x, 0, L.boss!.z);
    boss.faceTo(p.x, p.z, true);
    for (const t of g.zone.telegraphs) t.done = true;
    g.zone.hazards = [];
    step(0.05);
  };
  reset();
  step(0.5); // engage
  const b = boss.boss!;
  const cases: [ActionKind, number[]][] = [
    ['bite', [0.4, 0.7]], ['breath', [0.8, 1.6, 2.3]], ['tail', [0.7, 1.35]], ['gust', [0.7, 1.2]], ['flight', [1.5, 4, 6.5, 8.8]],
  ];
  let n = 1;
  for (const [kind, times] of cases) {
    reset();
    b.action = null;
    b.actionCd = 99;
    if (kind === 'flight') b.phase = 2;
    startAction(boss, b, kind, g);
    let at = 0;
    for (const time of times) {
      step(time - at);
      at = time;
      await shot(`boss-${String(n++).padStart(2, '0')}-${kind}-${time}s`);
    }
    step(2);
  }
  g.debug.hold = null;
  g.camZoom = 1;
}
