import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { BASES, TIER_ORDER, TIERS, UNIQUES } from '../data/items';
import { KEEP_STAGE, ZONES } from '../data/zones';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { Rig, newAnimState, type AnimState, type AttackKind } from '../render/anim';
import { BowDraw } from '../render/bowDraw';
import { itemIconUrl } from '../render/icons3d';
import { HeroDresser, MODEL_FILES, hasModel, makeModel } from '../render/registry';
import { xpForLevel } from '../progression/skills';
import { ICON_NAMES, icon } from '../ui/icons';
import type { Slot } from '../types';

/**
 * Automated visual + performance audit (dev only). `npm run inspect` launches Electron against
 * the dev server with DRAGONBOUND_INSPECT=<suites>; this drives the real game through every zone,
 * point of interest, model, pose and panel and writes full-window PNGs plus report.json to
 * inspect/. Suites: all | zones | models | anims | ui | icons (comma separated).
 */

type Api = NonNullable<NonNullable<Window['electronAPI']>['inspect']>;

const W = 1600, H = 900;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

interface ZoneReport {
  zone: string;
  shots: { name: string; lum: LumStats; perf: PerfStats }[];
  info: { calls: number; triangles: number; programs: number; geometries: number; textures: number };
}
interface LumStats { mean: number; p5: number; p95: number; clipped: number; crushed: number; cast: [number, number, number] }
/** frameMs = max(cpu, gpu): the frame cost ignoring vsync. */
interface PerfStats { cpuMs: number; gpuMs: number; gpuP95: number; frameMs: number }

export async function runInspect(g: Game, suites: string) {
  const api = window.electronAPI!.inspect!;
  const want = (s: string) => suites === 'all' || suites.split(',').includes(s);
  const gl0 = g.renderer.getContext();
  const report: Record<string, unknown> = {
    suites, startedAt: new Date().toISOString(), errors: [] as string[],
    // Captures are device pixels: css size × devicePixelRatio (e.g. 1600×900 at 150% → 2400×1350).
    viewport: { css: [innerWidth, innerHeight], dpr: devicePixelRatio, drawingBuffer: [gl0.drawingBufferWidth, gl0.drawingBufferHeight] },
  };
  const errors = report.errors as string[];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
  const origError = console.error;
  console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(' '));
    origError(...a);
  };

  const style = document.createElement('style');
  style.textContent = `
    body.inspect-clean #hud, body.inspect-clean #world-ui, body.inspect-clean #panels, body.inspect-clean #dialogue,
    body.inspect-clean #screens, body.inspect-clean #tooltip { display: none !important; }
    #inspect-overlay { position: fixed; inset: 0; z-index: 2000; pointer-events: none; font: 600 13px 'Alegreya Sans', sans-serif; color: #fff; }
    #inspect-overlay .lbl { position: absolute; background: #000b; padding: 2px 6px; border-radius: 3px; }
    #inspect-sheet { position: fixed; inset: 0; z-index: 2000; background: #1c1a1e; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; padding: 10px; overflow: hidden; }
    #inspect-sheet figure { margin: 0; display: flex; flex-direction: column; align-items: center; width: 92px; font: 11px 'Alegreya Sans', sans-serif; color: #cfc6b8; text-align: center; }
    #inspect-sheet img, #inspect-sheet svg { display: block; background: #2a262c; border-radius: 4px; }
  `;
  document.head.appendChild(style);

  const shot = async (name: string) => {
    await frames(3);
    await api.capture(name);
    void api.log(name);
  };
  void api.log(`start: ${suites}`);

  // ─── Setup: a fully progressed throwaway character ──────────────────────
  g.newGame({ name: 'Inspector', skin: 1, hair: 2, hairColor: 1, beard: 1, cloth: 0, cloth2: 5 }, true);
  for (const k of Object.keys(g.save.skills) as (keyof typeof g.save.skills)[]) g.save.skills[k] = xpForLevel(k === 'hitpoints' ? 60 : 55);
  g.save.gold = 250000;
  for (const id of Object.keys(ZONES)) g.save.portals[id] = true;
  g.prog.refreshLevels();
  g.prog.recomputeStats();
  g.debug.god = true;
  const fill = ['steel_longsword', 'worn_bow', 'apprentice_staff', 'iron_platebody', 'bronze_fullhelm', 'steel_pickaxe'];
  // Materials so crafting menus show enabled recipes (a stack each).
  for (const [id, n] of [['copper_ore', 6], ['tin_ore', 6], ['iron_ore', 4], ['coal', 8], ['bronze_bar', 5], ['iron_bar', 3]] as [string, number][]) {
    if (BASES[id]) g.items.add({ ...makeItem(id), qty: n } as any);
  }
  // A stocked bank and a collection log with finds in it.
  for (const id of ['steel_bar', 'iron_bar', 'coal', 'copper_ore', 'tin_ore', 'bronze_sword', 'iron_medhelm', 'bronze_platebody', 'sapphire', 'ruby'])
    if (BASES[id]) g.save.bank.push({ ...makeItem(id), qty: 1 + (id.length % 7) } as any);
  for (const u of Object.values(UNIQUES).slice(0, 2)) g.save.collection[u.id] = 1;
  g.save.collection.ember_whelp = 1;
  g.save.kc.goblin = 212;
  g.save.kc.drakeling = 37;
  for (const id of fill) if (BASES[id]) g.items.add(makeItem(id));
  equip(g, { weapon: 'steel_longsword', helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' });
  await frames(10);

  try {
    if (want('zones')) report.zones = await zonesSuite(g, shot);
    if (suites.split(',').includes('perf')) report.perf = await perfSuite(g);
    if (want('effects')) await effectsSuite(g, shot);
    if (want('ui')) await uiSuite(g, shot);
    if (want('models')) await modelsSuite(g, shot);
    if (want('anims')) await animsSuite(g, shot);
    if (want('icons')) await iconsSuite(shot);
  } catch (e) {
    errors.push(`inspect aborted: ${(e as Error).stack ?? e}`);
  }
  report.finishedAt = new Date().toISOString();
  await api.write('report.json', JSON.stringify(report, null, 2));
  await api.done(errors.length ? 1 : 0);
}

function equip(g: Game, gear: Partial<Record<Slot, string | null>>) {
  for (const [slot, id] of Object.entries(gear)) g.save.equipment[slot as Slot] = id && BASES[id] ? makeItem(id) : null;
  g.prog.recomputeStats();
  g.dressHero();
}

// ─── Measurements ───────────────────────────────────────────────────────────

function lumStats(g: Game): LumStats {
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const hist = new Uint32Array(256);
  let n = 0, clipped = 0, crushed = 0, r = 0, gg = 0, b = 0;
  for (let i = 0; i < px.length; i += 4 * 7) {
    const l = Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    hist[l]++;
    n++;
    if (px[i] > 250 || px[i + 1] > 250 || px[i + 2] > 250) clipped++;
    if (l < 8) crushed++;
    r += px[i];
    gg += px[i + 1];
    b += px[i + 2];
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= n * q) return i;
    return 255;
  };
  let mean = 0;
  for (let i = 0; i < 256; i++) mean += i * hist[i];
  const avg = (r + gg + b) / 3 || 1;
  return {
    mean: +(mean / n).toFixed(1), p5: pct(0.05), p95: pct(0.95),
    clipped: +((clipped / n) * 100).toFixed(2), crushed: +((crushed / n) * 100).toFixed(2),
    cast: [+(r / avg).toFixed(2), +(gg / avg).toFixed(2), +(b / avg).toFixed(2)],
  };
}

/**
 * Frame cost with the world frozen (dt = 0, every system still runs its per-frame work):
 * - cpuMs: update + render submission on the CPU;
 * - gpuMs: GPU time of the whole render (EXT_disjoint_timer_query_webgl2), the real render cost.
 * Wall-clock with a readPixels sync is NOT used: it quantises to the display's vsync period.
 */
async function perf(g: Game, n = 60): Promise<PerfStats> {
  const gl = g.renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const cpu: number[] = [];
  const queries: WebGLQuery[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const q = ext ? gl.createQuery() : null;
    if (q && ext) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    g.update(0, 1 / 60);
    g.draw();
    if (q && ext) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      queries.push(q);
    }
    cpu.push(performance.now() - t0);
    if (i % 4 === 3) await raf(); // let the GPU drain so queries don't pile up
  }
  const gpu: number[] = [];
  for (let tries = 0; tries < 60 && gpu.length < queries.length; tries++) {
    await raf();
    for (const q of queries) {
      if ((q as any).done) continue;
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext!.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        (q as any).done = true;
      }
    }
  }
  queries.forEach((q) => gl.deleteQuery(q));
  const med = (x: number[]) => (x.length ? x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)] : NaN);
  const p95 = (x: number[]) => (x.length ? x.slice().sort((p, q) => p - q)[Math.floor(x.length * 0.95)] : NaN);
  return { cpuMs: +med(cpu).toFixed(2), gpuMs: +med(gpu).toFixed(2), gpuP95: +p95(gpu).toFixed(2), frameMs: +Math.max(med(cpu), med(gpu)).toFixed(2) };
}

// ─── Zones ──────────────────────────────────────────────────────────────────

async function zonesSuite(g: Game, shot: (n: string) => Promise<void>) {
  const out: ZoneReport[] = [];
  const zones = Object.keys(ZONES);
  for (const id of zones) {
    for (const variant of id === 'keep' ? ['ruined', 'restored'] : ['']) {
      if (variant) for (const k of Object.keys(g.save.keep)) g.save.keep[k] = variant === 'restored';
      if (variant === 'restored') for (const r of (await import('../data/keep')).RESTORATIONS) g.save.keep[r.id] = true;
      g.debug.timeScale = 1;
      g.travel(id, true);
      await frames(20);
      const name = variant ? `${id}-${variant}` : id;
      const z = g.zone, L = z.layout;
      const rep: ZoneReport = { zone: name, shots: [], info: { calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 } };

      // Map overview: orthographic, top-down, no fog.
      document.body.classList.add('inspect-clean');
      const ortho = new THREE.OrthographicCamera(-L.w / 2, L.w / 2, L.h / 2, -L.h / 2, 1, 400);
      const aspect = W / H;
      const span = Math.max(L.w / aspect, L.h) / 2 + 2;
      ortho.left = -span * aspect;
      ortho.right = span * aspect;
      ortho.top = span;
      ortho.bottom = -span;
      ortho.position.set(L.w / 2, 120, L.h / 2 + 0.001);
      ortho.lookAt(L.w / 2, 0, L.h / 2);
      ortho.updateProjectionMatrix();
      const fog = g.scene.fog;
      g.debug.hold = () => {
        g.scene.fog = null;
        g.sun.position.set(L.w / 2 + 20, 60, L.h / 2 + 12);
        g.sun.target.position.set(L.w / 2, 0, L.h / 2);
        g.renderer.render(g.scene, ortho);
        g.scene.fog = fog;
        return true;
      };
      await shot(`zone-${name}-00-map`);
      g.debug.hold = null;
      document.body.classList.remove('inspect-clean');

      // Points of interest, seen through the real gameplay camera (enemies frozen).
      const pois: [string, number, number][] = [['entry', L.entry.x, L.entry.z]];
      for (const s of L.stations.slice(0, 8)) pois.push([`${s.kind}-${s.id}`, s.x, s.z + 2.2]);
      for (const n of L.nodes.filter((n, i, a) => a.findIndex((m) => m.ore === n.ore) === i)) pois.push([`ore-${n.ore}`, n.x, n.z + 1.6]);
      L.packs.slice(0, 10).forEach((p, i) => pois.push([`pack${i}-${p.comp.join('+')}`, p.x, p.z + 4]));
      if (L.boss) pois.push([`boss-${L.boss.id}`, L.boss.x, L.boss.z + 6]);
      let i = 1;
      for (const [label, x, zz] of pois) {
        const p = g.player;
        p.pos.set(x, 0, zz);
        p.stop();
        g.camPos.copy(p.pos);
        // Big creatures need the widest zoom to be framed whole.
        g.camZoom = label.startsWith('boss') ? 1.35 : 1;
        g.debug.timeScale = 0;
        g.update(0);
        const perfStats = await perf(g, 40);
        g.draw();
        const lum = lumStats(g);
        const shotName = `zone-${name}-${String(i++).padStart(2, '0')}-${label}`;
        await shot(shotName);
        rep.shots.push({ name: shotName, lum, perf: perfStats });
      }
      // Accumulate over every pass of one frame (the post chain resets per render otherwise).
      const info = g.renderer.info;
      info.autoReset = false;
      info.reset();
      g.draw();
      info.autoReset = true;
      rep.info = { calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length ?? 0, geometries: info.memory.geometries, textures: info.memory.textures };
      g.debug.timeScale = 1;
      out.push(rep);
    }
  }
  return out;
}

// ─── Effects ────────────────────────────────────────────────────────────────

/**
 * Combat effects captured mid-flight: every weapon style's basic attack and abilities against a
 * few targets, plus loot drops. The simulation is stepped by hand (the frame loop only renders)
 * so each capture lands at a fixed time after the trigger.
 */
async function effectsSuite(g: Game, shot: (n: string) => Promise<void>) {
  g.travel('foothills', true);
  await frames(15);
  // An open clearing (the southern goblin camp, emptied for the test).
  const spot = { x: 106, z: 157 };
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
    ['melee-basic', 'steel_sword', (t) => g.combat.startBasicAttack(t[0]), [0.2, 0.26, 0.34]],
    ['melee-cleave', 'steel_sword', () => g.combat.useAbility('Q'), [0.15, 0.22, 0.3]],
    ['melee-leap_slam', 'steel_longsword', () => g.combat.useAbility('W'), [0.25, 0.55]],
    ['melee-war_cry', 'steel_sword', () => g.combat.useAbility('E'), [0.15, 0.5]],
    ['ranged-basic', 'worn_bow', (t) => g.combat.startBasicAttack(t[0]), [0.3, 0.42]],
    ['ranged-multishot', 'worn_bow', () => g.combat.useAbility('Q'), [0.3, 0.45]],
    ['ranged-roll', 'worn_bow', () => g.combat.useAbility('W'), [0.12]],
    ['ranged-arrow_rain', 'worn_bow', () => g.combat.useAbility('E'), [0.6, 1.2]],
    ['magic-basic', 'apprentice_staff', (t) => g.combat.startBasicAttack(t[0]), [0.3, 0.42]],
    ['magic-fireball', 'apprentice_staff', () => g.combat.useAbility('Q'), [0.35, 0.6]],
    ['magic-frost_nova', 'apprentice_staff', () => g.combat.useAbility('W'), [0.15, 0.35]],
    ['magic-chain_lightning', 'apprentice_staff', () => g.combat.useAbility('E'), [0.16, 0.24]],
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

// ─── Perf breakdown ─────────────────────────────────────────────────────────

/**
 * Where does the frame go? At a heavy spot, measure the frame with each feature switched off in
 * turn (explicit suite: `npm run inspect -- perf`). Differences from the baseline are the cost.
 */
async function perfSuite(g: Game) {
  const out: Record<string, Record<string, number>> = {};
  for (const [zone, x, z] of [['foothills', 96, 70], ['foothills', 85, 150], ['keep', 48, 50]] as [string, number, number][]) {
    g.travel(zone, true);
    await frames(20);
    const p = g.player;
    p.pos.set(x, 0, z);
    g.camPos.copy(p.pos);
    g.debug.timeScale = 0;
    const game = g as any;
    const byName = (test: (o: THREE.Object3D) => boolean) => {
      const list: THREE.Object3D[] = [];
      g.zone.group.traverse((o) => {
        if (test(o)) list.push(o);
      });
      return list;
    };
    const toggles: [string, () => () => void][] = [
      ['no shadows', () => {
        g.sun.castShadow = false;
        return () => (g.sun.castShadow = true);
      }],
      ['no bloom', () => {
        game.bloom.enabled = false;
        return () => (game.bloom.enabled = true);
      }],
      ['no vegetation', () => {
        const l = byName((o) => o instanceof THREE.InstancedMesh);
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no terrain', () => {
        const l = byName((o) => o.name === 'ground' || o.name === 'relief');
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no enemies', () => {
        g.zone.enemies.forEach((e) => (e.obj.visible = false));
        return () => g.zone.enemies.forEach((e) => (e.obj.visible = true));
      }],
      ['no water', () => {
        const l = byName((o) => o.name === 'water' || o.name === 'lava');
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no MSAA', () => {
        const rt = game.composer.renderTarget1;
        const s = rt.samples;
        rt.samples = 0;
        game.composer.renderTarget2.samples = 0;
        return () => {
          rt.samples = s;
          game.composer.renderTarget2.samples = s;
        };
      }],
    ];
    const row: Record<string, number> = {};
    await perf(g, 20); // warm up programs
    row.baseline = (await perf(g, 60)).gpuMs;
    for (const [name, off] of toggles) {
      const undo = off();
      await perf(g, 10);
      row[name] = (await perf(g, 60)).gpuMs;
      undo();
    }
    out[`${zone}@${x},${z}`] = row;
    g.debug.timeScale = 1;
  }
  return out;
}

// ─── UI ─────────────────────────────────────────────────────────────────────

async function uiSuite(g: Game, shot: (n: string) => Promise<void>) {
  g.travel('keep', true);
  await frames(15);
  const p = g.player;
  p.pos.set(KEEP_STAGE.x, 0, KEEP_STAGE.z);
  g.camPos.copy(p.pos);
  await shot('ui-01-hud');
  const ui = g.ui as any;
  const panels: [string, () => void][] = [
    ['inventory', () => ui.toggle('inventory', true)],
    ['skills', () => ui.toggle('skills', true)],
    ['journal', () => ui.toggle('journal', true)],
    ['collection', () => ui.toggle('collection', true)],
    ['help', () => ui.toggle('help', true)],
    ['bank', () => ui.openBank(false)],
    ['shop', () => ui.openShop()],
    ['keep-board', () => ui.openKeep(null)],
  ];
  let i = 2;
  for (const [name, open] of panels) {
    open();
    await shot(`ui-${String(i++).padStart(2, '0')}-${name}`);
    for (const id of ['inventory', 'skills', 'journal', 'collection', 'help', 'bank', 'shop', 'keep', 'craft']) ui.toggle(id, false);
  }
  for (const kind of ['furnace', 'anvil'] as const) {
    const st = g.zone.interactables.find((it) => it.kind === kind);
    if (st) {
      ui.openCraft(kind, st);
      await shot(`ui-${String(i++).padStart(2, '0')}-craft-${kind}`);
      ui.closeCraftMenu();
    }
  }
  ui.openDialogue(g.story.talk('warden'));
  await shot(`ui-${String(i++).padStart(2, '0')}-dialogue-warden`);
  ui.closeDialogue();
  // Tooltip over the first inventory item.
  ui.toggle('inventory', true);
  await frames(2);
  const slot = document.querySelector<HTMLElement>('#panel-inventory .slot.filled, #panel-inventory [data-inv]');
  const item = g.save.inventory.find(Boolean);
  if (slot && item) {
    ui.showItemTooltip(item, slot.getBoundingClientRect(), true);
    await shot(`ui-${String(i++).padStart(2, '0')}-tooltip`);
    ui.hideTooltip();
  }
  ui.toggle('inventory', false);
  ui.levelBanner('smithing', 42);
  await frames(45); // the banner animates in
  ui.xpDrop('smithing', 37.5);
  await shot(`ui-${String(i++).padStart(2, '0')}-level-banner`);
  // Title and creation screens.
  g.mode = 'title';
  document.getElementById('hud')?.classList.add('hidden');
  ui.showTitle();
  await frames(30);
  await shot(`ui-${String(i++).padStart(2, '0')}-title`);
  g.showCreate();
  await frames(20);
  await shot(`ui-${String(i++).padStart(2, '0')}-create`);
  g.continueGame();
  await frames(10);
}

// ─── Studio renders (models, gear, animation strips) ────────────────────────

class Studio {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private overlay: HTMLElement;
  constructor(private g: Game) {
    this.scene.background = new THREE.Color(0x3b3a40);
    this.scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x4a4038, 1.3));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(4, 8, 6);
    const rim = new THREE.DirectionalLight(0x9ab8ff, 1.2);
    rim.position.set(-6, 5, -6);
    this.scene.add(key, rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(50, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55525a, roughness: 1 }));
    this.scene.add(floor, new THREE.GridHelper(40, 40, 0x6a6670, 0x5e5a64));
    this.overlay = document.createElement('div');
    this.overlay.id = 'inspect-overlay';
  }

  /** Render `cells` into a cols×rows grid on the main canvas, each with its own camera placement. */
  sheet(cells: { label: string; obj: THREE.Object3D; eye: THREE.Vector3; at: THREE.Vector3 }[], cols: number, rows: number) {
    const r = this.g.renderer;
    const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
    this.overlay.innerHTML = '';
    document.body.appendChild(this.overlay);
    const draw = () => {
      r.setScissorTest(true);
      cells.forEach((c, i) => {
        const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch;
        r.setViewport(x, y, cw, ch);
        r.setScissor(x, y, cw, ch);
        this.cam.aspect = cw / ch;
        this.cam.updateProjectionMatrix();
        this.cam.position.copy(c.eye);
        this.cam.lookAt(c.at);
        for (const o of cells) o.obj.visible = o === c;
        r.render(this.scene, this.cam);
      });
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      return true;
    };
    cells.forEach((c, i) => {
      this.scene.add(c.obj);
      const l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = c.label;
      l.style.left = `${(i % cols) * cw + 4}px`;
      l.style.top = `${Math.floor(i / cols) * ch + 4}px`;
      this.overlay.appendChild(l);
    });
    this.g.debug.hold = draw;
  }

  clear(objs: THREE.Object3D[]) {
    for (const o of objs) o.removeFromParent();
    this.overlay.remove();
    this.g.debug.hold = null;
  }
}

/** Four canonical views around an object of height h (model faces +Z). */
function views(h: number, dist = 2.2): [string, THREE.Vector3][] {
  const d = h * dist, y = h * 0.6;
  return [
    ['front', new THREE.Vector3(0, y, d)],
    ['left', new THREE.Vector3(d, y, 0)],
    ['back', new THREE.Vector3(0, y, -d)],
    ['3/4 top', new THREE.Vector3(-d * 0.7, h * 1.6, d * 0.7)],
  ];
}

function sizeOf(o: THREE.Object3D) {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  return { box: b, h: Math.max(0.3, b.max.y - b.min.y), size: b.getSize(new THREE.Vector3()), center: b.getCenter(new THREE.Vector3()) };
}

async function modelsSuite(g: Game, shot: (n: string) => Promise<void>) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  // Characters and creatures: 4 views each, two models per sheet.
  const units = MODEL_FILES.filter((n) => hasModel(n) && !n.startsWith('gear_') && !n.startsWith('hair_') && !n.startsWith('beard_') && !n.startsWith('prop_'));
  for (let i = 0; i < units.length; i += 2) {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const name of units.slice(i, i + 2)) {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      new Rig(m.root).update(0, newAnimState());
      const { h } = sizeOf(holder);
      for (const [v, eye] of views(h)) {
        const obj = v === 'front' ? holder : holder.clone();
        cells.push({ label: `${name} · ${v}`, obj, eye, at: new THREE.Vector3(0, h * 0.45, 0) });
        objs.push(obj);
      }
    }
    st.sheet(cells, 4, 2);
    await shot(`model-${units.slice(i, i + 2).join('+')}`);
    st.clear(objs);
  }
  // Hero in each tier set, plus uniques.
  const sets: [string, Partial<Record<Slot, string>>][] = [
    ['plain clothes', {}],
    ...TIER_ORDER.map((t): [string, Partial<Record<Slot, string>>] => [TIERS[t].name, { weapon: `${t}_sword`, helm: `${t}_medhelm`, body: `${t}_chainbody`, gloves: `${t}_gauntlets`, boots: `${t}_boots` }]),
    ...TIER_ORDER.map((t): [string, Partial<Record<Slot, string>>] => [`${TIERS[t].name} plate`, { weapon: `${t}_longsword`, helm: `${t}_fullhelm`, body: `${t}_platebody`, gloves: `${t}_gauntlets`, boots: `${t}_boots` }]),
    ['uniques', Object.fromEntries(Object.values(UNIQUES).map((u) => [BASES[u.base].slot!, u.base])) as Partial<Record<Slot, string>>],
  ];
  for (const [label, gear] of sets) {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [v, eye] of views(2.2, 2.4)) {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      const items = Object.fromEntries(Object.entries(gear).filter(([, id]) => BASES[id!]).map(([s, id]) => [s, makeItem(id!)]));
      if (label === 'uniques') for (const u of Object.values(UNIQUES)) items[BASES[u.base].slot!] = { ...makeItem(u.base), unique: u.id, rarity: 'unique' } as any;
      new HeroDresser(m).dress({ name: '', skin: 1, hair: 2, hairColor: 1, beard: 1, cloth: 0, cloth2: 5 }, items);
      new Rig(m.root).update(0, newAnimState());
      cells.push({ label: `${label} · ${v}`, obj: holder, eye, at: new THREE.Vector3(0, 1.15, 0) });
      objs.push(holder);
    }
    st.sheet(cells, 4, 1);
    await shot(`hero-${label.replace(/\s+/g, '_')}`);
    st.clear(objs);
  }
  // Every hair style and beard, 3/4 from above (the gameplay angle shows the crown).
  {
    const looks: [string, number, number][] = [['hair 1', 1, 0], ['hair 2', 2, 0], ['hair 3', 3, 0], ['hair 4', 4, 0], ['bald', 0, 0], ['beard 1', 0, 1], ['beard 2', 0, 2], ['beard 3', 0, 3]];
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [label, hair, beard] of looks) {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      new HeroDresser(m).dress({ name: '', skin: 1, hair, hairColor: 1, beard, cloth: 0, cloth2: 5 }, {});
      new Rig(m.root).update(0, newAnimState());
      cells.push({ label, obj: holder, eye: new THREE.Vector3(1.1, 2.9, 1.9), at: new THREE.Vector3(0, 1.8, 0) });
      objs.push(holder);
    }
    st.sheet(cells, 4, 2);
    await shot('hero-hair');
    st.clear(objs);
  }
  document.body.classList.remove('inspect-clean');
}

async function animsSuite(g: Game, shot: (n: string) => Promise<void>) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  const times = [-1, 0.15, 0.3, 0.42, 0.5, 0.62, 0.8, 0.95];
  const heroSets: [string, string, AttackKind][] = [
    ['sword swing', 'steel_sword', 'swing'], ['longsword slam', 'steel_longsword', 'slam'],
    ['bow', 'worn_bow', 'bow'], ['staff cast', 'apprentice_staff', 'cast'], ['pickaxe', 'steel_pickaxe', 'swing'],
  ];
  for (const [label, weapon, kind] of heroSets) {
    for (const side of ['left', 'front'] as const) {
      const cells: Parameters<Studio['sheet']>[0] = [];
      const objs: THREE.Object3D[] = [];
      for (const t of times) {
        const m = makeModel('hero');
        const holder = new THREE.Group();
        holder.add(m.root);
        const dresser = new HeroDresser(m);
        dresser.dress(null, { weapon: makeItem(weapon), body: makeItem('steel_platebody'), helm: makeItem('steel_fullhelm') });
        const bow = new BowDraw(m.root);
        bow.attach();
        const rig = new Rig(m.root);
        const s: AnimState = { ...newAnimState(), attackKind: kind, attack: t };
        rig.update(0, s);
        bow.update(s, dresser.socket('sock_handL'));
        const eye = side === 'left' ? new THREE.Vector3(4.6, 1.6, 0.6) : new THREE.Vector3(0.6, 1.6, 4.6);
        cells.push({ label: `${label} t=${t}`, obj: holder, eye, at: new THREE.Vector3(0, 1.2, 0) });
        objs.push(holder);
      }
      st.sheet(cells, 4, 2);
      await shot(`anim-hero-${label.replace(/\s+/g, '_')}-${side}`);
      st.clear(objs);
    }
  }
  // Walk cycle.
  {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    const m0 = makeModel('hero');
    for (let k = 0; k < 8; k++) {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      new HeroDresser(m).dress(null, { weapon: makeItem('steel_sword') });
      const rig = new Rig(m.root);
      const s: AnimState = { ...newAnimState(), speed: 5.6 };
      for (let f = 0; f <= k * 3; f++) rig.update(1 / 60, s);
      cells.push({ label: `walk frame ${k * 3}`, obj: holder, eye: new THREE.Vector3(4.6, 1.6, 0.4), at: new THREE.Vector3(0, 1.1, 0) });
      objs.push(holder);
    }
    void m0;
    st.sheet(cells, 4, 2);
    await shot('anim-hero-walk');
    st.clear(objs);
  }
  // Creatures: idle, walk, attack, hurt/death, flight.
  for (const name of Object.values(ENEMIES).map((e) => e.model).filter((v, i, a) => a.indexOf(v) === i && hasModel(v))) {
    const states: [string, Partial<AnimState>, number][] = [
      ['idle', {}, 0.5], ['walk', { speed: 3 }, 0.4], ['attack 0.3', { attack: 0.3 }, 0], ['attack 0.55', { attack: 0.55 }, 0],
      ['hurt', { hurt: 1 }, 0], ['dead 0.6s', { dead: 0.6 }, 0], ['fly', { fly: 1, speed: 3 }, 0.8], ['fly 1.4s', { fly: 1, speed: 3 }, 1.4],
    ];
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [label, a, secs] of states) {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      const rig = new Rig(m.root);
      const s = { ...newAnimState(), ...a };
      rig.update(0, s);
      for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, s);
      const h = Math.max(1.2, m.height);
      cells.push({ label: `${name} ${label}`, obj: holder, eye: new THREE.Vector3(h * 2.2, h * 0.9, h * 1.1), at: new THREE.Vector3(0, h * 0.45 + (a.fly ? h * 0.8 : 0), 0) });
      objs.push(holder);
    }
    st.sheet(cells, 4, 2);
    await shot(`anim-${name}`);
    st.clear(objs);
  }
  document.body.classList.remove('inspect-clean');
}

// ─── Icons ──────────────────────────────────────────────────────────────────

async function iconsSuite(shot: (n: string) => Promise<void>) {
  document.body.classList.add('inspect-clean');
  const sheet = document.createElement('div');
  sheet.id = 'inspect-sheet';
  document.body.appendChild(sheet);
  const ids = Object.keys(BASES);
  const pages = Math.ceil(ids.length / 48);
  for (let p = 0; p < pages; p++) {
    sheet.innerHTML = '';
    for (const id of ids.slice(p * 48, p * 48 + 48)) {
      const f = document.createElement('figure');
      f.innerHTML = `<img width="72" height="72" src="${itemIconUrl(makeItem(id))}"><figcaption>${id}</figcaption>`;
      sheet.appendChild(f);
    }
    await shot(`icons-items-${p + 1}`);
  }
  sheet.innerHTML = ICON_NAMES.map((n) => `<figure>${icon(n, 64)}<figcaption>${n}</figcaption></figure>`).join('');
  await shot('icons-svg');
  sheet.remove();
  document.body.classList.remove('inspect-clean');
}
