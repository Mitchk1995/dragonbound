import * as THREE from 'three';
import type { Enemy } from '../entities/enemy';
import type { Game } from '../game';
import { arena, fireSpots, lair, struck, swing, type Clock } from './vfxInspect';

/**
 * The effects in motion (dev only, run by vfxInspect.ts): frame strips, a capture every 1/30 or 1/20 s through a
 * blow, a critical, a kill, an arrow landing, a fireball, a meteor of Cinderwing's and two fires, with where each
 * stands on screen written beside them for cropping (vfx-strips.json: x, y, width, height in CSS pixels); and the
 * frame cost of a busy fight.
 */

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * The busy fight's frame cost: CPU (update and draw submitted) and GPU (the whole render), medians and the GPU's 95th
 * percentile, and what the effects alone cost of it on the GPU.
 */
interface Cost { cpuMs: number; gpuMs: number; gpuP95: number; fxMs: number }

/** A strip of a blow: how to start it, when its blow lands, how long before that to start, how often and how many. */
interface Strip { name: string; start: () => Enemy; done: (t: Enemy) => () => boolean; lead: number; every: number; n: number; r: number; dz?: number }

export async function strips(g: Game, c: Clock) {
  const boxes: Record<string, number[]> = {};
  const box = (name: string, x: number, y: number, z: number, r: number) => {
    const v = new THREE.Vector3(x, y, z).project(g.camera);
    const cv = g.renderer.domElement, w = cv.clientWidth, h = cv.clientHeight;
    const px = (r / (2 * Math.tan(THREE.MathUtils.degToRad(g.camera.fov / 2)) * g.camera.position.distanceTo(new THREE.Vector3(x, y, z)))) * h;
    boxes[name] = [((v.x + 1) / 2) * w - px, ((1 - v.y) / 2) * h - px, px * 2, px * 2];
  };
  const fireball = () => {
    arena(g, 'apprentice_staff', 3);
    g.combat.useAbility('Q');
    return g.zone.enemies[0];
  };
  const kill = () => {
    const t = swing(g, 'steel_sword');
    g.debug.oneShot = true;
    return t;
  };
  const list: Strip[] = [
    { name: 'hit', start: () => swing(g, 'steel_sword'), done: struck, lead: 0.08, every: 1 / 30, n: 10, r: 2.2 },
    { name: 'crit', start: () => swing(g, 'steel_sword', true), done: struck, lead: 0.05, every: 1 / 30, n: 10, r: 2.2 },
    { name: 'kill', start: kill, done: (t) => () => t.dead, lead: 0.05, every: 1 / 20, n: 12, r: 2.2 },
    { name: 'arrow', start: () => swing(g, 'worn_bow'), done: struck, lead: 0.05, every: 1 / 30, n: 8, r: 2.2 },
    { name: 'spell', start: fireball, done: struck, lead: 0.2, every: 1 / 20, n: 12, r: 3.6, dz: 0.6 },
  ];
  for (const s of list) {
    // Played once to time its blow, then again to capture.
    let t = s.start(), frames = 0;
    c.until(() => (frames++, s.done(t)()));
    c.step(1.5);
    t = s.start();
    c.step(Math.max(0, frames / 60 - s.lead));
    box(`strip-${s.name}`, t.x, 1, t.z + (s.dz ?? 0), s.r);
    for (let i = 0; i < s.n; i++) {
      await c.shot(`vfx-strip-${s.name}-${String(i).padStart(2, '0')}`);
      c.step(s.every);
    }
    g.debug.oneShot = false;
    c.step(1.5);
  }
  await meteorStrip(g, c, box);
  await flameStrips(g, c, box);
  await window.electronAPI?.inspect?.write('vfx-strips.json', JSON.stringify(boxes));
}

type Box = (name: string, x: number, y: number, z: number, r: number) => void;

/** Cinderwing's first meteor of a flight, every 1/10 s from just after it starts falling until just after it lands. */
async function meteorStrip(g: Game, c: Clock, box: Box) {
  const den = lair(g, c);
  if (!den) return;
  den.act('flight');
  c.step(1.3);
  const p = g.player;
  box('strip-meteor', p.x, 3, p.z, 6);
  for (let i = 0; i < 16; i++) {
    await c.shot(`vfx-strip-meteor-${String(i).padStart(2, '0')}`);
    c.step(0.1);
  }
  c.step(6);
  den.done();
}

/**
 * Two fires (the campfire by the Foothills clearing, a torch in the keep), a frame every 1/30 s. Fires burn on the
 * renderer's own clock, so it is held and stepped by hand here.
 */
async function flameStrips(g: Game, c: Clock, box: Box) {
  const frame = (g.renderer as unknown as { _nodes: { nodeFrame: { time: number; frameId: number; update: () => void } } })._nodes.nodeFrame;
  const update = frame.update;
  for (const zone of ['foothills', 'keep']) {
    g.travel(zone, true);
    const p = g.player, near = new THREE.Vector3(p.x, 0, p.z);
    const s = fireSpots(g).sort((a, b) => a.distanceTo(near) - b.distanceTo(near))[0];
    if (!s) continue;
    p.pos.set(s.x, g.zone.groundY(s.x, s.z + 3), s.z + 3);
    p.stop();
    g.camPos.copy(p.pos);
    c.step(0.5);
    box(`strip-flame-${zone}`, s.x, s.y + 0.6, s.z, 1.4);
    const t0 = frame.time;
    // (Frames still count, so everything drawn once a frame is drawn afresh.)
    frame.update = () => void frame.frameId++;
    try {
      for (let i = 0; i < 16; i++) {
        frame.time = t0 + i / 30;
        await c.shot(`vfx-strip-flame-${zone}-${String(i).padStart(2, '0')}`);
      }
    } finally {
      frame.update = update;
    }
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
export async function busyFight(g: Game) {
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
