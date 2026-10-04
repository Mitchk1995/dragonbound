import * as THREE from 'three';
import { BASES, UNIQUES } from '../data/items';
import { ZONES } from '../data/zones';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { xpForLevel } from '../progression/skills';
import { bossSuite, effectsSuite } from './inspectCombat';
import { equip, frames } from './inspectCommon';
import { perfSuite } from './inspectMetrics';
import { animsSuite, modelsSuite } from './inspectStudio';
import { iconsSuite, uiSuite } from './inspectUi';
import { zonesSuite } from './inspectZones';

// Keep these helpers available to the specialised inspection suites.
export { equip } from './inspectCommon';
export { perf } from './inspectMetrics';
export { Studio, fit } from './inspectStudio';

/**
 * Automated visual + performance audit (dev only). `npm run inspect` launches Electron against
 * the dev server with DRAGONBOUND_INSPECT=<suites>; this drives the real game through every zone,
 * point of interest, model, pose and panel and writes full-window PNGs plus report.json to
 * inspect/. Suites: all | zones | models | hero | anims | ui | icons (comma separated); explicit only:
 * perf, memory, trees (tree style comparison and the grown oak, see treeLineup.ts; trees:oak for the oak alone,
 * trees:grown:<kind> for one grown kind's progress pictures, trees:roots for their roots and crowns), approved (approved artwork, see approvedInspect.ts),
 * digits (painted damage numbers, see digitsInspect.ts), font (the painted alphabets, see fontInspect.ts),
 * uitext (the menus' tinted lettering, see uiTextInspect.ts), characters (the redesigned hero and enemies, see
 * charactersInspect.ts; skirts: the hero's skirts mid-stride; bow: the bow in his hands, measured; minifig: the shared
 * minifigure body, see minifigInspect.ts), lighting (the light in the engine test's views and every zone, see lightingInspect.ts), lightfx (the
 * lighting effects one at a time, see lightFxInspect.ts), dragons (the drakeling and Cinderwing, see dragonInspect.ts).
 * Castle plans and rooms: castle. The castle's bailey, yards, approach and gardens: bailey (the castle
 * rock's views alone: bailey:rock; named views only: bailey:fountain-close+falls; named views plus three
 * orbits round each: bailey-angles:hall-door+landing).
 */

export async function runInspect(g: Game, suites: string) {
  const api = window.electronAPI!.inspect!;
  const want = (s: string) => suites === 'all' || suites.split(',').includes(s);
  const buffer = g.renderer.getDrawingBufferSize(new THREE.Vector2());
  const report: Record<string, unknown> = {
    suites, startedAt: new Date().toISOString(), errors: [] as string[],
    // Which of the renderer's backends drew (WebGPU, or its WebGL 2 fallback).
    backend: (g.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2',
    // Captures are device pixels: css size × devicePixelRatio (e.g. 1600×900 at 150% → 2400×1350).
    viewport: { css: [innerWidth, innerHeight], dpr: devicePixelRatio, drawingBuffer: [buffer.x, buffer.y] },
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
    // `cams:name@ex_ey_ez_lx_ly_lz_span+…`: free cameras over the keep (see camSuite).
    const camArg = suites.split(',').find((s) => s.startsWith('cams:'));
    if (camArg) report.cams = await (await import('./castleInspect')).camSuite(g, shot, camArg.slice(5));
    if (suites.split(',').includes('perf')) report.perf = await perfSuite(g);
    // The light: the engine test's castle views and the play camera round the island and in every zone (explicit only:
    // `lighting`, `lighting:keep` for the island alone, `lighting:cost` for what each part of the light costs, `lighting:quality` for switching quality mid-session).
    const lightArg = suites.split(',').find((s) => s === 'lighting' || s.startsWith('lighting:'));
    if (lightArg) report.lighting = await (await import('./lightingInspect')).lightingSuite(g, shot, lightArg === 'lighting:keep', lightArg === 'lighting:cost', lightArg === 'lighting:quality');
    // The lighting effects one at a time, and their costs (explicit only: `lightfx`, or `lightfx:river+hero` for some views).
    const fxArg = suites.split(',').find((s) => s === 'lightfx' || s.startsWith('lightfx:'));
    if (fxArg) report.lightfx = await (await import('./lightFxInspect')).lightFxSuite(g, shot, fxArg.split(':')[1]?.split('+') ?? []);
    if (suites.split(',').includes('memory')) report.memory = await (await import('./memoryCheck')).memoryCheck(g);
    if (want('effects')) await effectsSuite(g, shot);
    if (want('boss')) await bossSuite(g, shot);
    if (want('ui')) await uiSuite(g, shot);
    // `hero` is the models suite without the creature sheets (quick passes on gear and hair).
    if (want('models') || want('hero')) await modelsSuite(g, shot, !want('models'));
    if (want('anims')) await animsSuite(g, shot);
    if (want('icons')) await iconsSuite(shot);
    // Tree style comparison (explicit: `trees`; `trees:oak` the grown oak, `trees:grown:<kind>` a kind, `trees:scout` the patch).
    const treeArg = suites.split(',').find((s) => s === 'trees' || s.startsWith('trees:'));
    if (treeArg) report.trees = await (await import('./treeLineup')).treesSuite(g, shot, treeArg.split(':').slice(1));
    // Approved artwork and the Steel Platebody's fit (explicit: `approved`, or one half: `approved:ui`, `approved:fit`).
    const approvedArg = suites.split(',').find((s) => s === 'approved' || s.startsWith('approved:'));
    if (approvedArg) report.approved = await (await import('./approvedInspect')).approvedSuite(g, shot, approvedArg.slice(9) as 'ui' | 'fit' | '');
    // The redesigned characters close up and at the play camera, the hero's skirts mid-stride, the bow in his hands (its
    // measurements, taken in the running game, go in the report) and the minifigure body (explicit only: `characters`,
    // `skirts`, `bow`, `minifig` or `minifig:<tag>`).
    if (/(^|,)(characters|skirts|bow|minifig(:[^,]*)?)(,|$)/.test(suites)) Object.assign(report, await (await import('./charactersInspect')).characterSuites(g, shot, suites));
    const kitArg = suites.split(',').find((s) => s === 'kit' || s.startsWith('kit:')); // the building kit's house (kitInspect.ts)
    if (kitArg) report.kit = await (await import('./kitInspect')).kitSuite(g, shot, kitArg.split(':').slice(1).join(':').split('+'));
    // The drakeling and Cinderwing against their concept sheets (explicit only: `dragons`).
    if (suites.split(',').includes('dragons')) await (await import('./dragonInspect')).dragonSuite(g, shot);
    // The painted damage numbers floating in the real game (explicit only: `digits`).
    if (suites.split(',').includes('digits')) await (await import('./digitsInspect')).digitsSuite(g, shot);
    // The painted alphabets: names, portal titles, the zone plaque, the boss bar and a small-text test (explicit only: `font`).
    if (suites.split(',').includes('font')) report.font = await (await import('./fontInspect')).fontSuite(g, shot);
    // The menus' tinted lettering: inventory card, equipment, shop, title, and what it costs (explicit only: `uitext`).
    if (suites.split(',').includes('uitext')) report.uitext = await (await import('./uiTextInspect')).uiTextSuite(g, shot);
  } catch (e) {
    errors.push(`inspect aborted: ${(e as Error).stack ?? e}`);
  }
  report.finishedAt = new Date().toISOString();
  await api.write('report.json', JSON.stringify(report, null, 2));
  await api.done(errors.length ? 1 : 0);
}
