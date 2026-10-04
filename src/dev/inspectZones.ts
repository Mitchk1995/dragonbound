import * as THREE from 'three';
import { ZONES } from '../data/zones';
import { KEEP_VIEWS } from '../data/zoneMaps';
import type { Game } from '../game';
import { H, W, frames } from './inspectCommon';
import { lumStats, perf, type LumStats, type PerfStats } from './inspectMetrics';

interface ZoneReport {
  zone: string;
  shots: { name: string; lum: LumStats; perf: PerfStats }[];
  info: { calls: number; triangles: number; programs: number; geometries: number; textures: number };
}

export async function zonesSuite(g: Game, shot: (n: string) => Promise<void>, only?: string[]) {
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
      if (L.buildings?.some((b) => b.id === 'keep')) pois.push(['facade-keep', 73, 65.7]);
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
      rep.info = { calls: info.render.calls, triangles: info.render.triangles, programs: info.memory.programs, geometries: info.memory.geometries, textures: info.memory.textures };
      g.debug.timeScale = 1;
      out.push(rep);
    }
  }
  return out;
}
