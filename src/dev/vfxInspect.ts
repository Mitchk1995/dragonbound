import * as THREE from 'three';
import { startAction, type ActionKind } from '../ai/boss';
import { BASES, UNIQUES } from '../data/items';
import type { Enemy } from '../entities/enemy';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { xpForLevel } from '../progression/skills';
import type { Slot } from '../types';

/**
 * The visual effects at the play camera, mid-effect, one family at a time (dev only): weapon hits and kills, spells,
 * melee and bow skills, the potion, a level-up, loot drops, mining and the anvil, the fires, portal arrival and
 * recall. Plus frame strips of a hit and a spell (a still cannot show motion) and the frame cost of a busy fight.
 *
 * Run it in the development build from the console, `shot` saving one capture under a name (in Electron, the inspect
 * API's capture): `(await import('/src/dev/vfxInspect.ts')).vfxSuite(__game, shot, ['hits'])`.
 * It drives only the game's own actions (attacks, skills, the potion, drops, mining), never the effects directly, so
 * the same suite captures any version of them. The simulation is stepped by hand (the frame loop only draws): each
 * capture is timed from the moment its blow lands or its spell goes off, so it is mid-effect in any version.
 */

export type Shot = (name: string) => Promise<void>;

/** Every family, in the order they run. */
export const VFX_FAMILIES = ['hits', 'spells', 'skills', 'potion', 'levelup', 'loot', 'mining', 'fires', 'travel', 'boss', 'strips', 'lightfx', 'perf'] as const;
export type VfxFamily = (typeof VFX_FAMILIES)[number];

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * The busy fight's frame cost: CPU (update and draw submitted) and GPU (the whole render), medians and the GPU's 95th
 * percentile, and what the effects alone cost of it on the GPU.
 */
interface Cost { cpuMs: number; gpuMs: number; gpuP95: number; fxMs: number }

/** Stepping the game by hand and capturing at times after a moment. */
interface Clock {
  step(secs: number): void;
  /** Step until `cond` holds (at most `max` seconds). */
  until(cond: () => boolean, max?: number): void;
  /** Capture at each time after now (seconds), named for it. */
  at(name: string, times: number[]): Promise<void>;
  shot: Shot;
}

export async function vfxSuite(g: Game, shot: Shot, only: readonly string[] = []) {
  const want = (f: VfxFamily) => !only.length || only.includes(f);
  const report: Record<string, unknown> = {};
  const style = document.createElement('style');
  style.textContent = '#hud, #world-ui, #panels, #dialogue, #screens, #tooltip { display: none !important; }';
  document.head.appendChild(style);
  setup(g);
  const held = g.debug.hold;
  g.debug.hold = () => false; // draw only: the suite advances time itself
  const tick = () => {
    g.update(1 / 60);
    for (const pin of pins) pin.e.pos.set(pin.x, pin.e.pos.y, pin.z);
  };
  const step = (secs: number) => {
    for (let i = 0; i < Math.round(secs * 60); i++) tick();
  };
  const c: Clock = {
    step,
    until(cond, max = 4) {
      for (let i = 0; i < max * 60 && !cond(); i++) tick();
    },
    async at(name, times) {
      let t = 0;
      for (const time of times) {
        step(time - t);
        t = time;
        await shot(`vfx-${name}-${time.toFixed(2)}s`);
      }
    },
    shot,
  };
  try {
    if (want('hits')) await hits(g, c);
    if (want('spells')) await spells(g, c);
    if (want('skills')) await skills(g, c);
    if (want('potion')) {
      const p = arena(g, 'steel_sword', 0);
      p.hp = g.stats.maxHp * 0.3;
      g.save.potions = Math.max(1, g.save.potions);
      g.items.drinkPotion();
      await c.at('potion', [0.15, 0.4, 0.8]);
    }
    if (want('levelup')) {
      arena(g, 'steel_sword', 0);
      g.prog.grant('melee', xpForLevel(g.levels.melee + 1) - g.save.skills.melee + 1);
      await c.at('levelup', [0.2, 0.5, 0.9]);
    }
    if (want('loot')) await loot(g, c);
    if (want('mining')) await mining(g, c);
    if (want('fires')) await fires(g, c);
    if (want('travel')) {
      g.travel('foothills', true);
      await c.at('arrive', [0.1, 0.35, 0.7]);
      const p = arena(g, 'steel_sword', 0);
      p.stop();
      g.recall();
      await c.at('recall', [0.6, 1.4]);
      g.recallT = -1;
    }
    if (want('boss')) await boss(g, c);
    if (want('strips')) await strips(g, c);
    if (want('lightfx')) await withLightFx(g, c);
    if (want('perf')) report.perf = await busyFight(g);
  } finally {
    g.debug.hold = held;
    style.remove();
  }
  return report;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

/** A fully progressed throwaway hero with a pickaxe and bars, invulnerable. */
function setup(g: Game) {
  g.newGame({ name: 'Inspector', skin: 1, hair: 2, hairColor: 1, beard: 1, cloth: 0, cloth2: 5 }, true);
  for (const k of Object.keys(g.save.skills) as (keyof typeof g.save.skills)[]) g.save.skills[k] = xpForLevel(k === 'hitpoints' ? 60 : 55);
  g.prog.refreshLevels();
  g.prog.recomputeStats();
  g.debug.god = true;
  for (const id of ['steel_pickaxe', 'apprentice_staff', 'worn_bow', 'steel_longsword']) if (BASES[id]) g.items.add(makeItem(id));
  if (BASES.bronze_bar) g.items.add({ ...makeItem('bronze_bar'), qty: 20 } as never);
}

/** The goblins standing where they were put for the captures (held there after every step, so each capture frames them the same). */
const pins: { e: Enemy; x: number; z: number }[] = [];

function equip(g: Game, gear: Partial<Record<Slot, string | null>>) {
  for (const [slot, id] of Object.entries(gear)) g.save.equipment[slot as Slot] = id && BASES[id] ? makeItem(id) : null;
  g.prog.recomputeStats();
  g.dressHero();
}

/**
 * Open level ground in the Foothills, nearest its entry but clear of the portal: no tree, rock, wall or prop within
 * 7 cells, nor for 12 cells south (between the hero and the camera), so nothing stands in front of the effects.
 */
const opened = new WeakMap<object, { x: number; z: number }>();
function openGround(g: Game) {
  const found = opened.get(g.zone);
  if (found) return found;
  const L = g.zone.layout, e = L.entry;
  const clear = (cx: number, cz: number) => {
    const lv = L.level?.[cz * L.w + cx] ?? 0;
    for (let dz = -7; dz <= 12; dz++) for (let dx = -7; dx <= 7; dx++) {
      if (dz < 8 && dx * dx + dz * dz > 49) continue;
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= L.w || z >= L.h) return false;
      const i = z * L.w + x;
      if (L.cells[i] !== 0 || L.fluid[i] || (L.level?.[i] ?? 0) !== lv) return false;
    }
    return true;
  };
  let best: { x: number; z: number } | null = null, bd = Infinity;
  for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) {
    const d = Math.hypot(x - e.x, z - e.z);
    if (d < 14 || d >= bd || !clear(x, z)) continue;
    best = { x: x + 0.5, z: z + 0.5 };
    bd = d;
  }
  const spot = best ?? { x: e.x, z: e.z - 10 };
  opened.set(g.zone, spot);
  return spot;
}

/**
 * The open clearing (openGround) with the hero `dz` south of its middle and `targets` goblins ahead of him: emptied
 * of other enemies and drops, the hero holding `weapon` with full mana and no cooldowns, the camera on him, the
 * first goblin hovered and aimed at.
 */
function arena(g: Game, weapon: string, targets: number, dz = 2) {
  if (g.zone.def.id !== 'foothills') g.travel('foothills', true);
  const mid = openGround(g);
  for (const e of g.zone.enemies) {
    e.dead = true;
    e.obj.removeFromParent();
  }
  g.zone.enemies = [];
  for (const it of g.zone.items) it.group.removeFromParent();
  g.zone.items = [];
  g.text.clear();
  equip(g, { weapon, helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' });
  const p = g.player;
  p.pos.set(mid.x, g.zone.groundY(mid.x, mid.z + dz), mid.z + dz);
  p.stop();
  p.cds = {};
  p.action = null;
  p.dash = null;
  p.hp = g.stats.maxHp;
  g.combat.mana = Infinity;
  g.debug.oneShot = false;
  g.camPos.copy(p.pos);
  const spots: [number, number][] = [[0, -3.2], [-1.6, -4.2], [1.7, -4.4]];
  const list = spots.slice(0, targets).map(([dx, dz2]) => g.combat.spawnEnemy('goblin', p.x + dx, p.z + dz2, null));
  pins.length = 0;
  for (const t of list) {
    t.faceTo(p.x, p.z, true);
    pins.push({ e: t, x: t.x, z: t.z });
    // (Too tough to die, so a blow shows the same in every version: the kill is captured on its own.)
    t.maxHp = t.hp = 1e5;
  }
  if (list[0]) aim(g, list[0]);
  for (let i = 0; i < 6; i++) g.update(1 / 60);
  return p;
}

function aim(g: Game, t: Enemy) {
  g.hovered = t;
  g.ground.set(t.x, 0, t.z);
  g.player.faceTo(t.x, t.z, true);
}

/** Until the goblin is struck (or dies). */
const struck = (t: Enemy) => () => t.dead || t.hp < t.maxHp;
/** Until the hero's current action lands its blow. */
const landed = (g: Game) => () => !g.player.action || g.player.action.done;
/** Until a missile of the hero's has flown `d`. */
const flying = (g: Game, d: number) => () => g.zone.projectiles.some((p) => p.o.owner === 'player' && p.traveled >= d);

// ─── Families ───────────────────────────────────────────────────────────────

/** A basic attack on one goblin (`crit`: every blow a critical). */
function swing(g: Game, weapon: string, crit = false) {
  arena(g, weapon, 1);
  const t = g.zone.enemies[0];
  if (crit) g.stats.critChance = 1;
  g.combat.startBasicAttack(t);
  return t;
}

async function hits(g: Game, c: Clock) {
  for (const [name, weapon, crit] of [['hit-sword', 'steel_sword', false], ['hit-crit', 'steel_sword', true]] as const) {
    const t = swing(g, weapon, crit);
    c.until(struck(t));
    await c.at(name, [0.03, 0.1, 0.2]);
    c.step(1);
  }
  for (const [name, weapon] of [['hit-arrow', 'worn_bow'], ['hit-bolt', 'apprentice_staff']] as const) {
    const t = swing(g, weapon);
    c.until(flying(g, 1.2));
    await c.shot(`vfx-${name}-flight`);
    c.until(struck(t));
    await c.at(name, [0.03, 0.12]);
    c.step(1);
  }
  const t = swing(g, 'steel_sword');
  g.debug.oneShot = true;
  c.until(() => t.dead);
  await c.at('kill', [0.05, 0.2, 0.45]);
  g.debug.oneShot = false;
  c.step(1);
}

/** A skill aimed at the first of three goblins: captured as it goes off (`when`), then after. */
async function cast(g: Game, c: Clock, name: string, weapon: string, key: 'Q' | 'W' | 'E', when: (t: Enemy) => () => boolean, times: number[]) {
  arena(g, weapon, 3);
  const t = g.zone.enemies[0];
  g.combat.useAbility(key);
  c.until(when(t));
  await c.at(name, times);
  c.step(1.5);
}

async function spells(g: Game, c: Clock) {
  arena(g, 'apprentice_staff', 3);
  g.combat.useAbility('Q');
  c.until(flying(g, 1.2));
  await c.shot('vfx-fireball-flight');
  c.step(1.5);
  await cast(g, c, 'fireball', 'apprentice_staff', 'Q', struck, [0.03, 0.12, 0.3, 0.6]);
  await cast(g, c, 'frost-nova', 'apprentice_staff', 'W', () => landed(g), [0.03, 0.12, 0.3]);
  await cast(g, c, 'chain-lightning', 'apprentice_staff', 'E', () => landed(g), [0.02, 0.08, 0.16]);
}

async function skills(g: Game, c: Clock) {
  await cast(g, c, 'cleave', 'steel_sword', 'Q', () => landed(g), [0.02, 0.08, 0.18]);
  await cast(g, c, 'leap-slam', 'steel_longsword', 'W', () => () => !g.player.dash, [0.02, 0.1, 0.25]);
  await cast(g, c, 'war-cry', 'steel_sword', 'E', () => landed(g), [0.05, 0.2, 0.45]);
  await cast(g, c, 'roll', 'worn_bow', 'W', () => () => true, [0.05, 0.18]);
}

async function loot(g: Game, c: Clock) {
  const p = arena(g, 'steel_sword', 0);
  const u = Object.values(UNIQUES)[0];
  g.items.drop({ ...makeItem(u.base), unique: u.id, rarity: 'unique' } as never, 0, p.x + 1.2, p.z - 1.6, 1);
  g.items.drop({ ...makeItem('steel_platebody'), rarity: 'rare' } as never, 0, p.x - 1.4, p.z - 2.2, 1);
  c.until(() => g.zone.items.every((it) => it.landed));
  await c.at('loot', [0.05, 0.2, 0.5, 2.5]);
}

/**
 * Step until the skilling action strikes (its wait starts over, or it ends with the ore), then capture just after
 * the blow.
 */
async function strike(g: Game, c: Clock, name: string) {
  let last = g.skilling.action?.wait ?? 0;
  c.until(() => {
    const wait = g.skilling.action?.wait ?? -1;
    const hit = wait > last || wait < 0;
    last = wait;
    return hit;
  }, 12);
  await c.at(name, [0.03, 0.12]);
}

async function mining(g: Game, c: Clock) {
  arena(g, 'steel_sword', 0);
  const p = g.player;
  const rock = g.zone.interactables.filter((n) => n.kind === 'rock' && n.state !== 'depleted').sort((a, b) => p.distTo(a) - p.distTo(b))[0];
  if (rock) {
    // (Beside the rock, so the hero does not stand between it and the camera.)
    p.pos.set(rock.x + 1.3, g.zone.groundY(rock.x + 1.3, rock.z + 0.5), rock.z + 0.5);
    g.camPos.copy(p.pos);
    g.skilling.startMining(rock);
    await strike(g, c, `mine-${rock.id}`);
    g.skilling.stop();
  }
  g.travel('keep', true);
  const anvil = g.zone.interactables.find((n) => n.kind === 'anvil');
  if (anvil) {
    p.pos.set(anvil.x, g.zone.groundY(anvil.x, anvil.z + 1.6), anvil.z + 1.6);
    g.camPos.copy(p.pos);
    g.skilling.startCraft('smith_bronze_sword', 3, anvil);
    await strike(g, c, 'anvil');
    g.skilling.stop();
  }
}

/**
 * Where the zone's fires burn: every flame of its props (torches, braziers, campfires, hearths), one spot per fire
 * (a fire's tongues gathered), west to east.
 */
function fireSpots(g: Game) {
  const spots: THREE.Vector3[] = [];
  const at = new THREE.Vector3();
  g.zone.group.updateMatrixWorld(true);
  g.zone.group.traverseVisible((o) => {
    if (o.name !== 'flame') return;
    o.getWorldPosition(at);
    if (!spots.some((s) => Math.hypot(s.x - at.x, s.z - at.z) < 1.5)) spots.push(at.clone());
  });
  return spots.sort((a, b) => a.x - b.x || a.z - b.z);
}

/** The fires the world burns, at the play camera: three in the Foothills, the mine and the keep. */
async function fires(g: Game, c: Clock) {
  for (const zone of ['foothills', 'mine', 'keep']) {
    g.travel(zone, true);
    const spots = fireSpots(g), p = g.player;
    const picks = [...new Set([0, Math.floor(spots.length / 2), spots.length - 1])].filter((i) => spots[i]);
    for (const [n, i] of picks.entries()) {
      const s = spots[i];
      p.pos.set(s.x, g.zone.groundY(s.x, s.z + 3), s.z + 3);
      p.stop();
      g.camPos.copy(p.pos);
      c.step(0.5);
      await c.shot(`vfx-fire-${zone}-${n + 1}`);
    }
  }
}

/** Cinderwing's fire: its breath mid-burn, the meteors it rains in flight, its tail slam's dust. */
async function boss(g: Game, c: Clock) {
  g.travel('lair', true);
  const L = g.zone.layout, p = g.player;
  const e = g.zone.enemies.find((x) => x.def.behavior === 'boss');
  if (!e?.boss || !L.boss) return;
  const b = e.boss;
  const zoom = g.camZoom;
  g.camZoom = 1.35;
  const reset = () => {
    p.pos.set(L.boss!.x, g.zone.groundY(L.boss!.x, L.boss!.z + 6), L.boss!.z + 6);
    p.stop();
    g.camPos.copy(p.pos);
    e.pos.set(L.boss!.x, e.pos.y, L.boss!.z);
    e.faceTo(p.x, p.z, true);
    for (const t of g.zone.telegraphs) t.done = true;
    g.zone.hazards = [];
    c.step(0.05);
  };
  reset();
  c.step(0.5); // engage
  const cases: [ActionKind, number[]][] = [['breath', [1.7, 2.3]], ['tail', [1.6]], ['flight', [4, 6.5]]];
  for (const [kind, times] of cases) {
    reset();
    b.action = null;
    b.actionCd = 99;
    if (kind === 'flight') b.phase = 2;
    startAction(e, b, kind, g);
    await c.at(`boss-${kind}`, times);
    c.step(2);
  }
  b.action = null;
  g.camZoom = zoom;
}

/**
 * Frame strips (a still cannot show motion): a sword hit and a fireball, a capture every 1/30 s through each, from
 * just before the blow lands, with where the effect stands on screen written beside them for cropping. Each is played
 * once to time its blow, then again to capture.
 */
async function strips(g: Game, c: Clock) {
  const boxes: Record<string, number[]> = {};
  const box = (name: string, x: number, y: number, z: number, r: number) => {
    const v = new THREE.Vector3(x, y, z).project(g.camera);
    const cv = g.renderer.domElement, w = cv.clientWidth, h = cv.clientHeight;
    const px = (r / (2 * Math.tan(THREE.MathUtils.degToRad(g.camera.fov / 2)) * g.camera.position.distanceTo(new THREE.Vector3(x, y, z)))) * h;
    boxes[name] = [((v.x + 1) / 2) * w - px, ((1 - v.y) / 2) * h - px, px * 2, px * 2];
  };
  const timed = (start: () => Enemy, done: (t: Enemy) => () => boolean) => {
    const t = start();
    let n = 0;
    c.until(() => (n++, done(t)()));
    c.step(1.5);
    return n / 60;
  };
  const sword = () => swing(g, 'steel_sword');
  const blow = timed(sword, struck);
  const t = sword();
  c.step(Math.max(0, blow - 0.08));
  box('strip-hit', t.x, 1, t.z, 2.2);
  for (let i = 0; i < 10; i++) {
    await c.shot(`vfx-strip-hit-${String(i).padStart(2, '0')}`);
    c.step(1 / 30);
  }
  c.step(1.5);
  const fireball = () => {
    arena(g, 'apprentice_staff', 3);
    g.combat.useAbility('Q');
    return g.zone.enemies[0];
  };
  const boom = timed(fireball, struck);
  const f = fireball();
  c.step(Math.max(0, boom - 0.2));
  box('strip-spell', f.x, 1, f.z + 0.6, 3.6);
  for (let i = 0; i < 12; i++) {
    await c.shot(`vfx-strip-spell-${String(i).padStart(2, '0')}`);
    c.step(1 / 20);
  }
  c.step(1.5);
  await window.electronAPI?.inspect?.write('vfx-strips.json', JSON.stringify(boxes));
}

/**
 * A blow, the fireball and the frost nova again with every lighting effect switched on (bounce light, contact
 * shading, reflections and smooth edges, the last blending frames together), to see the effects hold up under them.
 */
async function withLightFx(g: Game, c: Clock) {
  const was = { ...g.save.settings.lighting };
  g.setLighting({ bounce: true, contact: true, reflections: true, smooth: true });
  try {
    const t = swing(g, 'steel_sword');
    c.until(struck(t));
    await c.at('lightfx-hit', [0.05, 0.12]);
    c.step(1);
    await cast(g, c, 'lightfx-fireball', 'apprentice_staff', 'Q', struck, [0.12, 0.3]);
    await cast(g, c, 'lightfx-frost-nova', 'apprentice_staff', 'W', () => landed(g), [0.12]);
  } finally {
    g.setLighting(was);
  }
}

/**
 * The frame cost of a busy fight at the play camera: a dozen goblins round the hero while he fights with each weapon
 * style, every skill fired as soon as it is ready. Each frame advances the game 1/60 s and is drawn and timed on the
 * GPU (the renderer's timestamps, the whole render; the frame loop held off meanwhile). Every other run of 50 frames
 * is drawn with the effects hidden (the particle pools, and every effect the scene holds by name), so their own cost
 * is the difference, measured under the same load (the first frames of each run are dropped: the timestamps arrive
 * late).
 */
async function busyFight(g: Game) {
  const out: Record<string, Cost> = {};
  const r = g.renderer;
  const med = (x: number[]) => (x.length ? x.slice().sort((a, b) => a - b)[Math.floor(x.length / 2)] : NaN);
  const p95 = (x: number[]) => (x.length ? x.slice().sort((a, b) => a - b)[Math.floor(x.length * 0.95)] : NaN);
  const effects = () => [g.glow.mesh, g.particles.mesh, ...g.scene.children.filter((o) => o.name.startsWith('fx-'))];
  const held = g.debug.hold;
  g.debug.hold = () => true;
  try {
    for (const weapon of ['steel_sword', 'apprentice_staff', 'worn_bow']) {
      const p = arena(g, weapon, 0);
      const foes = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2, rr = 2.2 + (i % 3) * 0.9;
        return g.combat.spawnEnemy('goblin', p.x + Math.cos(a) * rr, p.z - 1.5 + Math.sin(a) * rr, null, true);
      });
      for (let i = 0; i < 30; i++) g.update(1 / 60);
      const cpu: number[] = [], gpu: number[] = [], bare: number[] = [];
      await r.resolveTimestampsAsync('render');
      for (let i = 0; i < 300; i++) {
        for (const e of foes) if (e.dead) e.hp = e.maxHp; // keep the crowd alive
        g.combat.mana = Infinity;
        p.hp = g.stats.maxHp;
        const live = foes.filter((e) => !e.dead);
        const target = live[i % Math.max(1, live.length)] ?? null;
        if (target) {
          g.hovered = target;
          g.ground.set(target.x, 0, target.z);
        }
        // Every skill as soon as it is ready (a skill on cooldown does nothing), else a basic attack.
        for (const key of ['Q', 'W', 'E'] as const) if (!p.action && !p.dash) g.combat.useAbility(key, true);
        if (!p.action && !p.dash && p.attackCd <= 0) g.combat.startBasicAttack(target);
        const t0 = performance.now();
        g.update(1 / 60);
        const hide = Math.floor(i / 50) % 2 === 1, fx = effects(), shown = fx.map((o) => o.visible);
        if (hide) for (const o of fx) o.visible = false;
        g.draw();
        if (hide) fx.forEach((o, k) => (o.visible = shown[k]));
        const settled = i % 50 >= 4;
        if (settled && !hide) cpu.push(performance.now() - t0);
        const ms = await r.resolveTimestampsAsync('render');
        if (ms && settled) (hide ? bare : gpu).push(ms);
        await raf();
      }
      out[weapon] = { cpuMs: +med(cpu).toFixed(2), gpuMs: +med(gpu).toFixed(2), gpuP95: +p95(gpu).toFixed(2), fxMs: +(med(gpu) - med(bare)).toFixed(2) };
    }
  } finally {
    g.debug.hold = held;
  }
  return out;
}
