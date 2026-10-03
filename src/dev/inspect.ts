import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { BASES, TIER_ORDER, TIERS, UNIQUES } from '../data/items';
import { KEEP_STAGE, ZONES } from '../data/zones';
import { KEEP_VIEWS } from '../data/zoneMaps';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { startAction, type ActionKind } from '../ai/boss';
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
 * inspect/. Suites: all | zones | models | hero | anims | ui | icons (comma separated); explicit only:
 * perf, memory, trees (tree style comparison, see treeLineup.ts), approved (approved artwork, see approvedInspect.ts), digits (painted damage numbers, see digitsInspect.ts).
 * Castle plans and rooms: castle. The castle's bailey, yards, approach and gardens: bailey (the castle
 * rock's views alone: bailey:rock; named views only: bailey:fountain-close+falls; named views plus three
 * orbits round each: bailey-angles:hall-door+landing).
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
interface PerfStats { cpuMs: number; gpuMs: number; gpuP95: number; frameMs: number; gpuRaw?: number[]; cpuRaw?: number[] }

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
    // `zones:keep+mine` captures only those zones.
    const zoneArg = suites.split(',').find((s) => s.startsWith('zones:'));
    if (want('zones') || zoneArg) report.zones = await zonesSuite(g, shot, zoneArg?.slice(6).split('+'));
    if (want('castle')) report.castle = await (await import('./castleInspect')).castleSuite(g, shot);
    const rockOnly = suites.split(',').includes('bailey:rock');
    const baileyOnly = suites.split(',').find((s) => s.startsWith('bailey:') && s !== 'bailey:rock')?.slice(7).split('+');
    const baileyAngles = suites.split(',').find((s) => s.startsWith('bailey-angles:'))?.slice(14).split('+');
    if (want('bailey') || rockOnly || baileyOnly || baileyAngles)
      report.bailey = await (await import('./castleInspect')).baileySuite(g, shot, rockOnly, baileyOnly ?? baileyAngles, !!baileyAngles);
    if (suites.split(',').includes('perf')) report.perf = await perfSuite(g);
    if (suites.split(',').includes('memory')) report.memory = await (await import('./memoryCheck')).memoryCheck(g);
    if (want('effects')) await effectsSuite(g, shot);
    if (want('boss')) await bossSuite(g, shot);
    if (want('ui')) await uiSuite(g, shot);
    // `hero` is the models suite without the creature sheets (quick passes on gear and hair).
    if (want('models') || want('hero')) await modelsSuite(g, shot, !want('models'));
    if (want('anims')) await animsSuite(g, shot);
    if (want('icons')) await iconsSuite(shot);
    // Tree style comparison (explicit only: `trees`, or `trees:scout` to pick the forest patch).
    const treeArg = suites.split(',').find((s) => s === 'trees' || s.startsWith('trees:'));
    if (treeArg) report.trees = await (await import('./treeLineup')).treesSuite(g, shot, treeArg.split(':').slice(1));
    // Approved artwork in every consumer, and the Steel Platebody's fit (explicit only: `approved`; `approved:ui` or
    // `approved:fit` runs one half).
    const approvedArg = suites.split(',').find((s) => s === 'approved' || s.startsWith('approved:'));
    if (approvedArg) report.approved = await (await import('./approvedInspect')).approvedSuite(g, shot, approvedArg.slice(9) as 'ui' | 'fit' | '');
    // The painted damage numbers floating in the real game (explicit only: `digits`).
    if (suites.split(',').includes('digits')) await (await import('./digitsInspect')).digitsSuite(g, shot);
  } catch (e) {
    errors.push(`inspect aborted: ${(e as Error).stack ?? e}`);
  }
  report.finishedAt = new Date().toISOString();
  await api.write('report.json', JSON.stringify(report, null, 2));
  await api.done(errors.length ? 1 : 0);
}

export function equip(g: Game, gear: Partial<Record<Slot, string | null>>) {
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
export async function perf(g: Game, n = 60): Promise<PerfStats> {
  const gl = g.renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const cpu: number[] = [];
  const queries: WebGLQuery[] = [];
  // Only our frames may touch the GPU while measuring (the frame loop would interleave its own).
  const held = g.debug.hold;
  g.debug.hold = () => true;
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
    await raf(); // one measured frame per display frame, like the game
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
  g.debug.hold = held;
  const med = (x: number[]) => (x.length ? x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)] : NaN);
  const p95 = (x: number[]) => (x.length ? x.slice().sort((p, q) => p - q)[Math.floor(x.length * 0.95)] : NaN);
  return { cpuMs: +med(cpu).toFixed(2), gpuMs: +med(gpu).toFixed(2), gpuP95: +p95(gpu).toFixed(2), frameMs: +Math.max(med(cpu), med(gpu)).toFixed(2), gpuRaw: gpu.map((v) => +v.toFixed(1)), cpuRaw: cpu.map((v) => +v.toFixed(1)) } as PerfStats;
}

// ─── Zones ──────────────────────────────────────────────────────────────────

async function zonesSuite(g: Game, shot: (n: string) => Promise<void>, only?: string[]) {
  const out: ZoneReport[] = [];
  const zones = Object.keys(ZONES).filter((id) => !only || only.includes(id));
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
      // The portal court as a whole (windows, glimpses and titles side by side).
      const gates = L.stations.filter((s) => s.kind === 'portal');
      if (gates.length > 1) pois.push(['portal-court', gates.reduce((a, s) => a + s.x, 0) / gates.length, Math.max(...gates.map((s) => s.z)) + 3]);
      for (const s of L.stations.slice(0, 8)) pois.push([`${s.kind}-${s.id}`, s.x, s.z + 2.2]);
      // Enterable buildings: stand the hero in the middle of each floor (the roof lifts off).
      for (const b of L.buildings ?? []) pois.push([`inside-${b.id}`, b.x + b.w / 2, b.z + b.d / 2 + 1], [`front-${b.id}`, b.x + b.w / 2, b.z + b.d + (b.wallH > 7 ? 11 : 5)]);
      // Landmarks worth a look of their own: the keep's facade (from its statue plaza, zoomed out),
      // the Foothills shrine, the drowned temple and market, the lair's ravine.
      const landmark = (kind: string, label: string, dz = 5) => {
        const p = L.props.find((q) => q.kind === kind);
        if (p) pois.push([label, p.x, p.z + dz]);
      };
      if (L.buildings?.some((b) => b.id === 'keep')) pois.push(['facade-keep', 66, 50]);
      // The island's districts and landmarks outside the castle.
      if (id === 'keep') for (const v of KEEP_VIEWS) pois.push([`view-${v.label}`, v.x, v.z]);
      landmark('ritual_dais', 'landmark-shrine', 4);
      landmark('temple_dais', 'landmark-temple', 9);
      landmark('stall_ruin', 'landmark-market', 3);
      landmark('ember_vent', 'landmark-ravine', 2);
      landmark('waterfall', 'landmark-waterfall', 6);
      if (id === 'foothills') landmark('tower_ruin', 'landmark-tower', 5);
      landmark('palisade', 'landmark-warcamp', 8);
      landmark('wall_lantern', 'landmark-lamp', 3);
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
        const view = label.startsWith('view-') ? KEEP_VIEWS.find((v) => `view-${v.label}` === label) : undefined;
        g.camZoom = view ? view.zoom : label.startsWith('boss') || label === 'front-keep' || label.startsWith('landmark') ? 1.35 : label === 'facade-keep' ? 1.7 : 1;
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

/**
 * An open spot by one of the Foothills goblin camps (their fires, east to west: 0 = the south-east
 * camp, 1 = the southern camp, 2 and 3 = the war camp), `dz` south of its fire. Found from the layout, so
 * the harness follows the map when it moves.
 */
function goblinCamp(g: Game, which: number, dz = 5) {
  const fires = g.zone.layout.props.filter((p) => p.kind === 'campfire' && p.z > 115).sort((a, b) => b.x - a.x || b.z - a.z);
  const f = fires[Math.min(which, fires.length - 1)];
  return { x: f.x, z: f.z + dz };
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
async function bossSuite(g: Game, shot: (n: string) => Promise<void>) {
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

// ─── Perf breakdown ─────────────────────────────────────────────────────────

/**
 * Where does the frame go? At a heavy spot, measure the frame with each feature switched off in
 * turn (explicit suite: `npm run inspect -- perf`). Differences from the baseline are the cost.
 */
async function perfSuite(g: Game) {
  const out: Record<string, Record<string, string>> = {};
  for (const which of [1, 0, 3]) {
    const zone = 'foothills';
    g.travel(zone, true);
    await frames(20);
    const { x, z } = goblinCamp(g, which, 4);
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
      ['no props', () => {
        const l = g.zone.view.props.map((p) => p.obj);
        l.forEach((o) => (o.visible = false));
        return () => l.forEach((o) => (o.visible = true));
      }],
      ['no lights', () => {
        const l = byName((o) => o instanceof THREE.PointLight);
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
    const row: Record<string, string> = {};
    await perf(g, 20); // warm up programs
    const fmt = (p: PerfStats) => `cpu ${p.cpuMs} gpu ${p.gpuMs}`;
    row.baseline = fmt(await perf(g, 60));
    for (const [name, off] of toggles) {
      const undo = off();
      await perf(g, 10);
      row[name] = fmt(await perf(g, 60));
      undo();
    }
    out[`${zone}@${x},${z}`] = row;
    g.debug.timeScale = 1;
  }
  return out;
}

// ─── UI ─────────────────────────────────────────────────────────────────────

/**
 * Drive the HUD with synthetic input and check it reacts: tab hotkeys, folding, Escape, hovering
 * UI marks the world as covered, and an OSRS drag swaps two inventory slots (captured mid-drag).
 * Failures go to console.error, which lands in report.json's errors.
 */
async function interactionChecks(g: Game, next: (n: string) => Promise<void>) {
  const ui = g.ui as any;
  const fail = (what: string) => console.error(`ui check failed: ${what}`);
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  ui.showTab('inventory');
  key('k');
  if (ui.sideTab !== 'skills') fail('K opens the skills tab');
  key('k');
  if (!document.querySelector('.sidepanel.collapsed')) fail('K again folds the side panel');
  key('c');
  if (ui.sideTab !== 'equipment' || document.querySelector('.sidepanel.collapsed')) fail('C opens equipment and unfolds');
  key('Escape');
  if (ui.sideTab !== 'help') fail('Esc with nothing open shows settings');
  key('Escape');
  if (ui.sideTab !== 'inventory') fail('Esc again returns to the inventory');
  await frames(2);

  const cell = (i: number) => document.querySelector<HTMLElement>(`.sidepanel [data-inv="${i}"]`)!;
  cell(0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  if (!ui.overUI) fail('hovering the side panel counts as over UI');
  const inv = g.save.inventory;
  const last = inv.length - 1;
  const first = inv[0], lastWas = inv[last];
  const at = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, button: 0 };
  };
  const from = at(cell(0)), to = at(cell(last));
  cell(0).dispatchEvent(new MouseEvent('mousedown', from));
  window.dispatchEvent(new MouseEvent('mousemove', { ...from, clientX: from.clientX + 20 }));
  window.dispatchEvent(new MouseEvent('mousemove', { ...to, clientX: to.clientX - 30, clientY: to.clientY - 20 }));
  await next('drag-inventory');
  window.dispatchEvent(new MouseEvent('mouseup', to));
  if (inv[last] !== first || inv[0] !== lastWas) fail('dragging slot 0 onto the last slot swaps them');
  if (document.querySelector('.dragghost')) fail('the drag ghost is removed on release');
  // Swap back so later captures match.
  [inv[0], inv[last]] = [inv[last], inv[0]];
  ui.refresh();
  ui.overUI = false;
}

async function uiSuite(g: Game, shot: (n: string) => Promise<void>) {
  g.travel('keep', true);
  await frames(15);
  const p = g.player;
  p.pos.set(KEEP_STAGE.x, 0, KEEP_STAGE.z);
  g.camPos.copy(p.pos);
  const ui = g.ui as any;
  let i = 1;
  const next = (name: string) => shot(`ui-${String(i++).padStart(2, '0')}-${name}`);
  const closeWindows = () => {
    for (const id of ['bank', 'shop', 'keep', 'craft', 'book']) ui.toggle(id, false);
  };
  // The always-visible side panel, one capture per tab (inventory is the default).
  ui.showTab('inventory');
  await next('hud');
  for (const tab of ['equipment', 'skills', 'journal', 'collection', 'help']) {
    ui.showTab(tab);
    await next(`tab-${tab}`);
  }
  // Hovering a skill tile: XP, XP to the next level and the progress bar.
  ui.showTab('skills');
  document.querySelector('.stile[data-skill="smithing"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover');
  ui.hideTooltip();
  // Defence's card says how it trains now there's no stance; the summary cards above the grid.
  document.querySelector('.stile[data-skill="defence"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover-defence');
  ui.hideTooltip();
  document.querySelector('.ssum[data-sum="combat"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover-combat-level');
  ui.hideTooltip();
  document.querySelector('.ssum[data-sum="xp"]')?.dispatchEvent(new MouseEvent('mouseenter'));
  await next('skill-hover-total-xp');
  ui.hideTooltip();
  ui.showTab('journal');
  ui.panels.journalTab = 'diary';
  ui.refresh();
  await next('tab-journal-diary');
  // The journal and collection log opened out into their full window (OSRS-style).
  ui.panels.journalTab = 'quests';
  ui.openBook('journal');
  await next('book-journal');
  ui.showTab('collection');
  ui.openBook('collection');
  await next('book-collection');
  closeWindows();
  // Arriving in a zone: the plaque flares, a ribbon names the kind of place.
  ui.showTab('journal');
  ui.zoneTitle(g.zone.def.name);
  await frames(40);
  await next('zone-arrival');
  ui.panels.journalTab = 'quests';
  ui.pressTab('journal'); // pressing the open tab folds the panel down to its tab row
  await next('side-collapsed');
  ui.showTab('inventory');
  // Station windows open beside the side panel.
  const stations: [string, () => void][] = [
    ['bank', () => ui.openBank(false)],
    ['shop', () => ui.openShop()],
    ['keep-board', () => ui.openKeep(null)],
  ];
  for (const [name, open] of stations) {
    open();
    await next(name);
    closeWindows();
  }
  for (const kind of ['furnace', 'anvil'] as const) {
    const st = g.zone.interactables.find((it) => it.kind === kind);
    if (st) {
      ui.openCraft(kind, st);
      await next(`craft-${kind}`);
      ui.closeCraftMenu();
    }
  }
  ui.openDialogue(g.story.talk('warden'));
  await next('dialogue-warden');
  ui.closeDialogue();
  // Tooltip over the first inventory item.
  await frames(2);
  const slot = document.querySelector<HTMLElement>('.sidepanel [data-inv]');
  const item = g.save.inventory.find(Boolean);
  if (slot && item) {
    ui.showItemTooltip(item, slot.getBoundingClientRect(), true);
    await next('tooltip');
    ui.hideTooltip();
  }
  await interactionChecks(g, next);
  ui.levelBanner('smithing', 42);
  await frames(45); // the banner animates in
  ui.xpDrop('smithing', 37.5);
  await next('level-banner');

  // The console mid-fight: cooldowns sweeping, a pool too low for the big skill, life low.
  g.travel('foothills', true);
  await frames(15);
  const spot = goblinCamp(g, 0);
  const stage = (weapon: string) => {
    for (const e of g.zone.enemies) {
      e.dead = true;
      e.obj.removeFromParent();
    }
    g.zone.enemies = [];
    equip(g, { weapon });
    p.pos.set(spot.x, 0, spot.z);
    p.stop();
    g.camPos.copy(p.pos);
    const foe = g.combat.spawnEnemy('goblin', spot.x + 1, spot.z - 5, null);
    g.hovered = foe;
    return foe;
  };
  stage('apprentice_staff');
  p.cds = { fireball: 1.4, frost_nova: 5.2 };
  g.combat.mana = 11;
  p.hp = g.stats.maxHp * 0.26;
  await frames(4);
  await next('combat-magic-lowmana');
  const q = document.querySelector<HTMLElement>('.sk[data-key="E"]');
  if (q) {
    ui.abilityTip('E', q);
    await next('skill-tooltip');
    ui.hideTooltip();
  }
  stage('worn_bow');
  p.cds = { multishot: 1.8 };
  g.combat.mana = Infinity;
  p.hp = g.stats.maxHp;
  await frames(4);
  await next('combat-ranged');

  // The smallest supported window: the console and side panel shrink, the view stays open.
  const api = window.electronAPI?.inspect;
  if (api?.resize) {
    await api.resize(1280, 720);
    await frames(20);
    stage('steel_sword');
    p.cds = { cleave: 2 };
    g.combat.mana = 30;
    await frames(4);
    await next('720-combat');
    g.hovered = null;
    g.travel('keep', true);
    await frames(10);
    p.pos.set(KEEP_STAGE.x, 0, KEEP_STAGE.z);
    g.camPos.copy(p.pos);
    ui.openBank(false);
    await next('720-bank');
    closeWindows();
    ui.openShop();
    await next('720-shop');
    closeWindows();
    const anvil = g.zone.interactables.find((it) => it.kind === 'anvil');
    if (anvil) {
      ui.openCraft('anvil', anvil);
      await next('720-craft-anvil');
      ui.closeCraftMenu();
    }
    ui.showTab('help');
    await next('720-settings');
    ui.showTab('skills');
    await next('720-skills');
    ui.showTab('inventory');
    await api.resize(W, H);
    await frames(20);
  }
  g.hovered = null;
  g.travel('keep', true);
  await frames(10);

  // Title and creation screens.
  g.mode = 'title';
  document.getElementById('hud')?.classList.add('hidden');
  ui.showTitle();
  await frames(30);
  await next('title');
  g.showCreate();
  await frames(20);
  await next('create');
  g.continueGame();
  await frames(10);
}

// ─── Studio renders (models, gear, animation strips) ────────────────────────

export class Studio {
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

/**
 * Camera placement that fits a posed object whole: its bounding sphere, seen from `dir`, fills a
 * studio cell (FOV 38°, cells ~0.9 aspect so the horizontal FOV is the tighter one).
 */
export function fit(o: THREE.Object3D, dir: THREE.Vector3) {
  o.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere());
  const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(19)) * 0.88);
  const dist = (sphere.radius / Math.sin(half)) * 1.04;
  return { eye: sphere.center.clone().add(dir.clone().normalize().multiplyScalar(dist)), at: sphere.center.clone() };
}

const VIEW_DIRS: [string, THREE.Vector3][] = [
  ['front', new THREE.Vector3(0, 0.35, 1)],
  ['left', new THREE.Vector3(1, 0.35, 0)],
  ['back', new THREE.Vector3(0, 0.35, -1)],
  ['3/4 top', new THREE.Vector3(-0.7, 1.1, 0.7)],
];

function sizeOf(o: THREE.Object3D) {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  return { box: b, h: Math.max(0.3, b.max.y - b.min.y), size: b.getSize(new THREE.Vector3()), center: b.getCenter(new THREE.Vector3()) };
}

async function modelsSuite(g: Game, shot: (n: string) => Promise<void>, heroOnly = false) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  // Characters and creatures: 4 views each, two models per sheet.
  const units = heroOnly ? [] : MODEL_FILES.filter((n) => hasModel(n) && !n.startsWith('gear_') && !n.startsWith('hair_') && !n.startsWith('beard_') && !n.startsWith('prop_'));
  for (let i = 0; i < units.length; i += 2) {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const name of units.slice(i, i + 2)) {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      new Rig(m.root).update(0, newAnimState());
      for (const [v, dir] of VIEW_DIRS) {
        const obj = v === 'front' ? holder : holder.clone();
        cells.push({ label: `${name} · ${v}`, obj, ...fit(holder, dir) });
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
  // The legendary set up close: each unique weapon in hand with the full set on, the crown, and the whole set from
  // the gameplay camera's pitch (about 56° down) all round.
  {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    const uniqueItem = (id: string) => ({ ...makeItem(UNIQUES[id].base), unique: id, rarity: 'unique' }) as any;
    const dressed = (weapon: string) => {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      const items: Record<string, any> = {};
      for (const u of Object.values(UNIQUES)) if (BASES[u.base].slot !== 'weapon') items[BASES[u.base].slot!] = uniqueItem(u.id);
      items.weapon = uniqueItem(weapon);
      new HeroDresser(m).dress({ name: '', skin: 1, hair: 2, hairColor: 1, beard: 1, cloth: 0, cloth2: 5 }, items);
      new Rig(m.root).update(0, newAnimState());
      objs.push(holder);
      return holder;
    };
    const weapons = Object.values(UNIQUES).filter((u) => BASES[u.base].slot === 'weapon').map((u) => u.id);
    for (const w of weapons) cells.push({ label: `${UNIQUES[w].name}`, obj: dressed(w), eye: new THREE.Vector3(-1.6, 1.7, 2.9), at: new THREE.Vector3(-0.15, 1.2, 0) });
    cells.push({ label: 'Ashen Crown', obj: dressed(weapons[0]), eye: new THREE.Vector3(0.7, 2.3, 1.6), at: new THREE.Vector3(0, 1.95, 0) });
    for (const [label, yaw] of [['game cam · front', 0.5], ['game cam · back', Math.PI + 0.4], ['game cam · left', Math.PI / 2], ['game cam · right', -Math.PI / 2]] as const) {
      const k = 0.36;
      cells.push({ label, obj: dressed(weapons[(cells.length - 4) % weapons.length]), eye: new THREE.Vector3(Math.sin(yaw) * 14 * k, 1 + 21 * k, Math.cos(yaw) * 14 * k), at: new THREE.Vector3(0, 1, 0) });
    }
    st.sheet(cells, 4, 2);
    await shot('hero-uniques-detail');
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
  // Every hair style from the front and from the side at eye level (the gaps under a shell and the hairline show here).
  {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [view, eye] of [['front', new THREE.Vector3(0, 1.95, 2.3)], ['side', new THREE.Vector3(2.3, 1.95, -0.2)]] as const) {
      for (const hair of [1, 2, 3, 4]) {
        const m = makeModel('hero');
        const holder = new THREE.Group();
        holder.add(m.root);
        new HeroDresser(m).dress({ name: '', skin: 1, hair, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 }, {});
        new Rig(m.root).update(0, newAnimState());
        cells.push({ label: `hair ${hair} · ${view}`, obj: holder, eye, at: new THREE.Vector3(0, 1.85, 0) });
        objs.push(holder);
      }
    }
    st.sheet(cells, 4, 2);
    await shot('hero-hair-front');
    st.clear(objs);
  }
  document.body.classList.remove('inspect-clean');
}

async function animsSuite(g: Game, shot: (n: string) => Promise<void>) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  // Rest, wind-up, peak, impact (0.55), follow-through.
  const times = [-1, 0.15, 0.3, 0.44, 0.55, 0.66, 0.8, 0.95];
  const heroSets: [string, string, AttackKind, string?][] = [
    ['emberforged slam', 'ember_longsword', 'slam', 'ember'], ['bronze swing', 'bronze_sword', 'swing', 'bronze'],
    ['sword swing', 'steel_sword', 'swing'], ['longsword slam', 'steel_longsword', 'slam'],
    ['bow', 'worn_bow', 'bow'], ['staff cast', 'apprentice_staff', 'cast'], ['pickaxe', 'steel_pickaxe', 'swing'],
  ];
  for (const [label, weapon, kind, tier = 'steel'] of heroSets) {
    for (const side of ['left', 'front'] as const) {
      const cells: Parameters<Studio['sheet']>[0] = [];
      const objs: THREE.Object3D[] = [];
      for (const t of times) {
        const m = makeModel('hero');
        const holder = new THREE.Group();
        holder.add(m.root);
        const dresser = new HeroDresser(m);
        dresser.dress(null, { weapon: makeItem(weapon), body: makeItem(`${tier}_platebody`), helm: makeItem(`${tier}_fullhelm`), gloves: makeItem(`${tier}_gauntlets`), boots: makeItem(`${tier}_boots`) });
        const bow = new BowDraw(m.root);
        bow.attach();
        const rig = new Rig(m.root);
        const s: AnimState = { ...newAnimState(), attackKind: kind, attack: t };
        rig.update(0, s);
        bow.update(s, dresser.socket('sock_handL'));
        const eye = side === 'left' ? new THREE.Vector3(6.2, 1.9, 0.6) : new THREE.Vector3(0.6, 1.9, 6.2);
        cells.push({ label: `${label} t=${t}`, obj: holder, eye, at: new THREE.Vector3(0, 1.55, 0) });
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
      cells.push({ label: `${name} ${label}`, obj: holder, ...fit(holder, new THREE.Vector3(1, 0.45, 0.5)) });
      objs.push(holder);
    }
    st.sheet(cells, 4, 2);
    await shot(`anim-${name}`);
    st.clear(objs);
  }
  // Pets are cosmetic followers (Pet.follow): the whelp hovers, the golem walks.
  const pets: [string, [string, Partial<AnimState>, number][]][] = [
    ['whelp', [['hover', { fly: 0.35 }, 0.2], ['hover 0.6s', { fly: 0.35 }, 0.6], ['hover 1.1s', { fly: 0.35 }, 1.1], ['follow', { fly: 0.35, speed: 5 }, 0.3], ['follow 0.7s', { fly: 0.35, speed: 5 }, 0.7], ['follow fast', { fly: 0.35, speed: 10 }, 0.5]]],
    ['golem', [['idle', {}, 0.5], ['idle 1.5s', {}, 1.5], ['walk', { speed: 3 }, 0.2], ['walk 0.45s', { speed: 3 }, 0.45], ['walk 0.7s', { speed: 3 }, 0.7], ['run', { speed: 8 }, 0.4]]],
  ];
  for (const [name, states] of pets) {
    if (!hasModel(name)) continue;
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [label, a, secs] of states) {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      const rig = new Rig(m.root);
      const st2 = { ...newAnimState(), ...a };
      for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, st2);
      cells.push({ label: `pet ${name} ${label}`, obj: holder, ...fit(holder, new THREE.Vector3(1, 0.45, 0.5)) });
      objs.push(holder);
    }
    st.sheet(cells, 3, 2);
    await shot(`anim-pet-${name}`);
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
  // Uniques and trinkets at slot size and large, so their framing and orientation can be judged.
  sheet.innerHTML = '';
  const trinkets = Object.keys(BASES).filter((id) => BASES[id].slot === 'amulet' || BASES[id].slot === 'ring');
  const looks = [
    ...Object.values(UNIQUES).map((u) => ({ label: u.name, item: { ...makeItem(u.base), unique: u.id, rarity: 'unique' } as any })),
    ...trinkets.map((id) => ({ label: id, item: makeItem(id) })),
  ];
  for (const size of [72, 144]) {
    for (const { label, item } of looks) {
      const f = document.createElement('figure');
      f.innerHTML = `<img width="${size}" height="${size}" src="${itemIconUrl(item)}"><figcaption>${label}</figcaption>`;
      sheet.appendChild(f);
    }
  }
  await shot('icons-uniques');
  sheet.innerHTML = ICON_NAMES.map((n) => `<figure>${icon(n, 64)}<figcaption>${n}</figcaption></figure>`).join('');
  await shot('icons-svg');
  sheet.remove();
  document.body.classList.remove('inspect-clean');
}
