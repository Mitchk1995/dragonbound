import * as THREE from 'three';
import { CASTLE_PLAN } from '../data/zoneMaps';
import type { Game } from '../game';
import { OCCLUDE } from '../world/worldView';
import { perf } from './inspect';

/**
 * Dev-only audit of the light (`npm run inspect -- lighting`; `lighting:keep` for the island alone):
 * the castle from the engine test's three views (the overview, the keep's front and the fountain
 * court) and from the island, the play camera at the keep door, in the great hall and the throne
 * hall, out on the island and in the woods, the title screen's orbit, and one view in every other
 * zone, each with its frame cost. `lighting:cost` measures instead what each part of the light costs
 * at the heaviest views (the frame with each part switched off in turn).
 */
export async function lightingSuite(g: Game, shot: (name: string) => Promise<void>, keepOnly = false, cost = false) {
  const out: Record<string, unknown> = {};
  const settle = () => new Promise((r) => setTimeout(r, 400));
  g.travel('keep', true);
  await settle();
  document.body.classList.add('inspect-clean');
  g.debug.timeScale = 0;
  g.player.stop();
  const P = CASTLE_PLAN;
  const xs = P.curtain.map((p) => p.x), zs = P.curtain.map((p) => p.z);
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  const y0 = g.zone.groundY(P.fountain.x, P.fountain.z);

  /** The hero at (x, z) through the game's own camera. */
  const play = async (name: string, x: number, z: number, zoom: number) => {
    const at = g.zone.nav.nearestWalkable(x, z) ?? { x, z };
    g.player.obj.visible = true;
    g.player.pos.set(at.x, g.zone.groundY(at.x, at.z), at.z);
    g.player.stop();
    g.camPos.copy(g.player.pos);
    g.camZoom = zoom;
    g.update(0);
    await perf(g, 10); // warm up (programs, textures)
    out[name] = await perf(g, 40);
    await shot(`light-${name}`);
  };
  /** A free camera at `eye` looking at `look`, as the engine test framed it (shadows over `span`). */
  const view = async (name: string, eye: number[], look: number[], span: number) => {
    const fog = g.scene.fog as THREE.Fog, sc = g.sun.shadow.camera;
    const keep = { near: fog.near, far: fog.far, l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, f: sc.far };
    const d = Math.hypot(eye[0] - look[0], eye[1] - look[1], eye[2] - look[2]);
    g.player.obj.visible = false;
    const render = () => {
      // The zone's own fog, pushed out as the title orbit does when the focus is farther than it.
      fog.near = Math.max(keep.near, d * 0.9);
      fog.far = Math.max(keep.far, d * 3.6);
      Object.assign(sc, { left: -span, bottom: -span, right: span, top: span, far: 60 + span * 3 });
      sc.updateProjectionMatrix();
      const k = 1 + span / 30;
      g.sun.position.set(look[0] + 14 * k, look[1] + 28 * k, look[2] + 10 * k);
      g.sun.target.position.set(look[0], look[1], look[2]);
      g.fill.position.set(look[0] - 18, look[1] + 14, look[2] - 6);
      g.camera.position.set(eye[0], eye[1], eye[2]);
      g.camera.lookAt(look[0], look[1], look[2]);
      OCCLUDE.uOccOn.value = 0;
      g.draw();
    };
    g.debug.hold = () => {
      render();
      return true;
    };
    try {
      await perf(g, 10, render);
      out[name] = await perf(g, 40, render);
      await shot(`light-${name}`);
    } finally {
      g.debug.hold = null;
      Object.assign(fog, { near: keep.near, far: keep.far });
      Object.assign(sc, { left: keep.l, right: keep.r, top: keep.t, bottom: keep.b, far: keep.f });
      sc.updateProjectionMatrix();
      g.player.obj.visible = true;
    }
  };

  if (cost) {
    // What each part of the light costs, at the two heaviest views: the frame with each switched off in turn.
    const game = g as any;
    const toggles: [string, () => () => void][] = [
      ['no occlusion', () => { game.shade.occlusion = false; return () => (game.shade.occlusion = true); }],
      ['shadow map 2048', () => { g.sun.shadow.mapSize.set(2048, 2048); g.sun.shadow.map?.dispose(); g.sun.shadow.map = null; return () => { g.sun.shadow.mapSize.set(4096, 4096); g.sun.shadow.map?.dispose(); g.sun.shadow.map = null; }; }],
      ['buildings take no shadow', () => {
        const l: THREE.Mesh[] = [];
        for (const b of g.zone.view.buildings) b.obj.traverse((o) => { if (o instanceof THREE.Mesh && o.receiveShadow) { l.push(o); o.receiveShadow = false; } });
        return () => l.forEach((o) => (o.receiveShadow = true));
      }],
      ['no shadows', () => { g.sun.castShadow = false; return () => (g.sun.castShadow = true); }],
      ['no occlusion or grade', () => { game.shade.enabled = false; return () => (game.shade.enabled = true); }],
      ['fixed 56 m shadow box', () => {
        const light = game.light;
        game.light = () => {
          light.call(g);
          const sc = g.sun.shadow.camera, p = g.player.pos;
          Object.assign(sc, { left: -28, bottom: -28, right: 28, top: 28, near: 1, far: 90 });
          sc.updateProjectionMatrix();
          g.sun.position.set(p.x + 13 * 2.2, p.y + 16 * 2.2, p.z + 12 * 2.2);
          g.sun.target.position.copy(p);
        };
        return () => (game.light = light);
      }],
    ];
    const measure = async (name: string, at: () => Promise<void>) => {
      const row: Record<string, unknown> = {};
      await at();
      row.baseline = out[name];
      for (const [t, off] of toggles) {
        const undo = off();
        await at();
        row[t] = out[name];
        undo();
      }
      out[`cost-${name}`] = row;
    };
    await measure('overview', () => view('overview', [c.x + 70, y0 + 92, c.z + 92], [c.x - 2, y0, c.z + 4], 70));
    await measure('centre', () => play('centre', P.fountain.x, P.fountain.z + 6.2, 1.2));
    await measure('orchard', () => play('orchard', 218, 84, 1.35));
    g.travel('mine', true);
    await settle();
    g.debug.timeScale = 0;
    const L = g.zone.layout;
    await measure('mine-entry', () => play('mine-entry', L.entry.x, L.entry.z, 1.0));
    g.travel('keep', true);
    document.body.classList.remove('inspect-clean');
    g.debug.timeScale = 1;
    return out;
  }
  // The engine test's views.
  await view('overview', [c.x + 70, y0 + 92, c.z + 92], [c.x - 2, y0, c.z + 4], 70);
  await view('keep-front', [P.door.x, y0 + 12, 70], [P.door.x, y0 + 10, 40], 24);
  await play('centre', P.fountain.x, P.fountain.z + 6.2, 1.2);
  // The castle from the island's lawns, low, so the sky and the haze show.
  await view('skyline', [P.gate.x + 60, y0 + 40, P.gate.z + 80], [P.gate.x, y0 + 12, 50], 70);
  // The play camera round the castle, inside it and out on the island.
  await play('door', P.door.x, P.door.z + 6, 1.0);
  await play('hall', 52, 32.5, 1.35);
  const keepB = g.zone.layout.buildings?.find((b) => b.id === 'keep');
  if (keepB) await play('throne', keepB.x + 12, keepB.z + 12, 1.2);
  await play('gate', 76, 106, 1.35);
  await play('court', 150, 138, 1.35);
  await play('green', 120, 158, 1.15);
  await play('upland', 192, 44, 1.35);
  await play('orchard', 218, 84, 1.35);
  // The title screen's slow orbit round the island.
  {
    const mode = g.mode, fog = g.scene.fog as THREE.Fog, keep = [fog.near, fog.far];
    g.mode = 'title';
    g.player.obj.visible = false;
    const render = () => {
      g.update(0, 0);
      g.draw();
    };
    g.debug.hold = () => {
      render();
      return true;
    };
    try {
      await perf(g, 10, render);
      out.title = await perf(g, 40, render);
      await shot('light-title');
    } finally {
      g.debug.hold = null;
      g.mode = mode;
      [fog.near, fog.far] = keep;
      g.player.obj.visible = true;
    }
  }
  if (!keepOnly) {
    for (const id of ['foothills', 'mine', 'ruin', 'lair']) {
      g.travel(id, true);
      await settle();
      g.debug.timeScale = 0;
      const L = g.zone.layout;
      await play(`${id}-entry`, L.entry.x, L.entry.z, 1.0);
      if (L.boss) await play(`${id}-boss`, L.boss.x, L.boss.z + 6, 1.35);
    }
    // The Foothills woods (round its southern goblin camp).
    g.travel('foothills', true);
    await settle();
    g.debug.timeScale = 0;
    const fires = g.zone.layout.props.filter((p) => p.kind === 'campfire' && p.z > 115).sort((a, b) => b.x - a.x || b.z - a.z);
    if (fires[1]) await play('foothills-woods', fires[1].x, fires[1].z + 5, 1.0);
  }
  document.body.classList.remove('inspect-clean');
  g.debug.timeScale = 1;
  g.travel('keep', true);
  return out;
}
