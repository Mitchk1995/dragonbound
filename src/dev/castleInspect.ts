import * as THREE from 'three';
import { CASTLE_PLAN } from '../data/zoneMaps';
import type { Game } from '../game';
import { cellRole, fitBlocks, fitsOf, footprint, type BuildingSpec, type Floor } from '../world/building';
import { OCCLUDE } from '../world/worldView';
import { perf } from './inspect';

/** The residence range's rooms on each floor: [id, label, x, z] in cells from its corner. */
const ROOMS = [
  [
    ['great-hall', 'Great hall / dais', 10, 7.5], ['screens', 'Screens passage', 20.5, 10],
    ['buttery', 'Buttery', 24, 3], ['service', 'Service passage', 24, 7.5], ['pantry', 'Pantry', 24, 12],
  ],
  [
    ['north-gallery', 'North gallery', 10, 1.5], ['west-gallery', 'West gallery', 1.5, 8],
    ['minstrel-gallery', 'Minstrel gallery', 20.5, 9], ['steward', "Steward's chamber", 24, 8],
  ],
] as const;

/** A diagram from the same cell roles and furnishing footprints used by navigation. */
function plan(b: BuildingSpec, floor: Floor) {
  const [x0, z0, x1, z1] = footprint(b), tile = 26;
  const width = (x1 - x0) * tile, height = (z1 - z0) * tile;
  const shapes: string[] = [];
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const role = cellRole(b, x, z, floor);
    if (role === 'out') continue;
    const fill = role === 'wall' ? '#41434a' : role === 'stair' ? '#d69b39' : role === 'floor' && fitBlocks(b, x, z, floor) ? '#ad8558' : '#e6d7b7';
    shapes.push(`<rect x="${(x - x0) * tile}" y="${(z - z0) * tile}" width="${tile}" height="${tile}" fill="${fill}" stroke="#716f6733"/>`);
    if (role === 'stair') shapes.push(`<text x="${(x - x0 + 0.5) * tile}" y="${(z - z0 + 0.67) * tile}" text-anchor="middle" font-size="17" fill="#171715">${floor ? '↓' : '↑'}</text>`);
  }
  for (const [, label, x, z] of ROOMS[floor]) {
    const px = (b.x + x - x0) * tile, pz = (b.z + z - z0) * tile;
    shapes.push(`<rect x="${px - 82}" y="${pz - 13}" width="164" height="26" rx="4" fill="#171a20e8"/><text x="${px}" y="${pz + 5}" font-size="15" text-anchor="middle" fill="#f5edda">${label}</text>`);
  }
  const header = floor ? 'Upper floor · 5 m above the hall, open over it' : 'Ground floor · north at the top';
  return `<div style="position:fixed;inset:0;z-index:2100;background:#161b22;color:#eadcc1;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial,sans-serif;gap:14px">
    <div style="font-size:30px">Dragonspire Keep — ${header}</div>
    <div style="font-size:16px;color:#b8b5ac">${b.w} × ${b.d} tiles · one grid square = one metre</div>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:min(85vw,${width}px);max-height:70vh">${shapes.join('')}</svg>
    <div style="font-size:16px">Dark: masonry, open void, stair flight · Sand: walkable floor / doors · Brown: furniture · Gold: the stair ${floor ? 'down' : 'up'}</div>
    <div style="font-size:14px;color:#a29d92">Doorways and stairs match the playable navigation grid. Enter by the great door or the screens door.</div>
  </div>`;
}

/** Dev-only audit: the residence range's real floor plans and each room at gameplay height. */
export async function castleSuite(g: Game, shot: (name: string) => Promise<void>) {
  g.travel('keep', true);
  g.debug.timeScale = 0;
  g.player.stop();
  const keep = g.zone.layout.buildings!.find((b) => b.id === 'keep')!;
  const out: { name: string; floor: Floor; perf: Awaited<ReturnType<typeof perf>> }[] = [];
  for (const floor of [0, 1] as Floor[]) {
    const el = document.createElement('div');
    el.innerHTML = plan(keep, floor);
    document.body.appendChild(el);
    try { await shot(`castle-plan-${floor ? 'upper' : 'ground'}`); }
    finally { el.remove(); }
    g.zone.setFloor(floor, keep);
    for (const [id, , x, z] of ROOMS[floor]) {
      const stand = g.zone.nav.nearestWalkable(keep.x + x, keep.z + z)!;
      g.player.pos.set(stand.x, g.zone.groundY(stand.x, stand.z), stand.z);
      g.camPos.copy(g.player.pos);
      g.camZoom = id === 'great-hall' || id === 'north-gallery' ? 1.2 : 0.8;
      g.update(0);
      const name = `castle-${floor ? 'upper' : 'ground'}-${id}`;
      const measured = await perf(g, 30);
      await shot(name);
      out.push({ name, floor, perf: measured });
    }
  }
  g.zone.setFloor(0);
  g.travel('keep', true);
  g.debug.timeScale = 1;
  return { rooms: out, furnishings: [fitsOf(keep).length, fitsOf(keep, 1).length] };
}

/**
 * Dev-only audit of the bailey (`npm run inspect -- bailey`): the whole castle from above and as a
 * plan, the approach, every yard through the gameplay camera with the hero standing in it, the
 * centrepiece and a lawn up close, the island beyond and the camera-side wall dissolving round the
 * hero. Every position comes from CASTLE_PLAN, so the shots follow the layout.
 */
export async function baileySuite(g: Game, shot: (name: string) => Promise<void>) {
  g.travel('keep', true);
  await new Promise((r) => setTimeout(r, 400));
  document.body.classList.add('inspect-clean');
  g.debug.timeScale = 0;
  g.player.stop();
  const P = CASTLE_PLAN, Z = P.zones;
  const xs = P.curtain.map((p) => p.x), zs = P.curtain.map((p) => p.z);
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  const y0 = g.zone.groundY(P.fountain.x, P.fountain.z);
  const out: Record<string, unknown> = {};

  /** The hero standing at (x, z), seen through the game's own camera at `zoom`. */
  const play = async (name: string, x: number, z: number, zoom: number, measure = false) => {
    const at = g.zone.nav.nearestWalkable(x, z)!;
    g.player.obj.visible = true;
    g.player.pos.set(at.x, g.zone.groundY(at.x, at.z), at.z);
    g.player.stop();
    g.camPos.copy(g.player.pos);
    g.camZoom = zoom;
    g.update(0);
    if (measure) out[`perf-${name}`] = await perf(g, 40);
    await shot(`bailey-${name}`);
  };
  /** A free camera at `eye` looking at `look` (world units), no fog, shadows cast over `span`. */
  const view = async (name: string, eye: number[], look: number[], span = 30) => {
    const fog = g.scene.fog as THREE.Fog, sc = g.sun.shadow.camera;
    const keep = { near: fog.near, far: fog.far, l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, f: sc.far };
    g.player.obj.visible = false;
    g.debug.hold = () => {
      fog.near = 400;
      fog.far = 900;
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
      return true;
    };
    try { await shot(`bailey-${name}`); }
    finally {
      g.debug.hold = null;
      Object.assign(fog, { near: keep.near, far: keep.far });
      Object.assign(sc, { left: keep.l, right: keep.r, top: keep.t, bottom: keep.b, far: keep.f });
      sc.updateProjectionMatrix();
    }
  };

  // The whole castle: from high in the south-east, and as a plan from almost straight above.
  await view('overview', [c.x + 70, y0 + 92, c.z + 92], [c.x - 2, y0, c.z + 4], 70);
  await view('plan', [c.x, y0 + 160, c.z + 22], [c.x, y0, c.z + 1], 70);
  // The approach from below the rock: the ledge road climbing west under the south wall to the gate.
  await view('approach', [P.gate.x + 72, y0 + 16, P.gate.z + 38], [P.gate.x + 18, y0 - 2, P.gate.z + 4], 50);
  // The spring's fall out of the castle rock into its pool and the stream leaving it, from below.
  await view('falls', [P.gate.x + 31, y0 - 5, P.gate.z + 30], [P.gate.x + 26.5, y0 - 6.5, P.gate.z + 12], 18);
  // The architecture's colour and detail up close: the hall's front between its pavilions, the
  // gatehouse's outer face, the gate front from the terrace, a wall tower, the donjon and its spire,
  // the north skyline from far out in the south-east, and the roses on the curtain behind the bower.
  await view('keep-front', [P.door.x, y0 + 9, 62], [P.door.x, y0 + 7, 40], 18);
  await view('gatehouse-outer', [P.gate.x + 10, y0 + 6, P.gate.z + 22], [P.gate.x, y0 + 7, P.gate.z], 18);
  await view('gate-close', [P.gate.x + 14, y0 + 9, P.gate.z + 22], [P.gate.x, y0 + 6, P.gate.z - 1], 20);
  await view('tower-close', [43, y0 + 8, 79], [31, y0 + 7, 69], 14);
  await view('donjon', [66, y0 + 14, 66], [50, y0 + 12, 40], 24);
  await view('skyline', [P.gate.x + 60, y0 + 40, P.gate.z + 70], [P.gate.x, y0 + 6, 60], 60);
  await view('ivy-curtain', [38, y0 + 4, 48], [38, y0 + 4, 39], 12);
  // Through the gameplay camera: inside the gate looking up the yard, the centrepiece, the great door.
  await play('entry', P.gate.x, P.gate.z - 4, 1.3);
  await play('centre', P.fountain.x, P.fountain.z + 6.2, 1.35, true);
  await play('door', P.door.x, P.door.z + 3.5, 1.0);
  // The fountain and its water up close, low down.
  await view('fountain-close', [P.fountain.x + 7.5, y0 + 4.2, P.fountain.z + 14.5], [P.fountain.x, y0 + 4.4, P.fountain.z + 0.5], 14);
  // Every other yard and garden, and the way in.
  await play('ledge-road', P.gate.x + 34, P.gate.z + 6, 1.3);
  await play('terrace', P.gate.x, P.gate.z + 8, 1.2);
  await play('parterre', Z.parterre.x, Z.parterre.z + 2.5, 1.0);
  await play('cour', Z.cour.x, Z.cour.z, 1.2);
  await play('privy-garden', Z.privy.x, Z.privy.z, 1.0);
  await play('bower', Z.bower.x, Z.bower.z, 1.0);
  await play('belvedere', Z.belvedere.x, Z.belvedere.z, 1.0);
  await play('kitchen-garden', Z.kitchen.x, Z.kitchen.z, 1.1);
  await play('orchard', Z.orchard.x, Z.orchard.z, 1.0);
  await play('training', Z.training.x, Z.training.z, 1.2);
  await play('stables', Z.service.x, Z.service.z, 1.1);
  await play('paddock', Z.paddock.x, Z.paddock.z, 1.1);
  // A lawn up close (the parterre's north-west panel), low across the grass.
  await view('lawn-close', [Z.parterre.x - 8.5, y0 + 1.2, Z.parterre.z + 3.4], [Z.parterre.x + 1, y0 + 0.3, Z.parterre.z - 3.5], 12);
  // The island beyond the castle: meadows, the approach, the portal court.
  await view('island', [c.x + 150, y0 + 70, c.z + 165], [c.x + 60, -4, c.z + 70], 100);
  // The hero by the camera-side (south) curtain: the wall stands full height and dissolves round them.
  await play('walls-southside', P.gate.x + 14, P.gate.z - 3.5, 1.0);
  // Frame cost in a meadow outside the castle, for comparison with the fountain's.
  await play('meadow', 56, 132, 1.0, true);

  g.player.obj.visible = true;
  document.body.classList.remove('inspect-clean');
  g.debug.timeScale = 1;
  g.travel('keep', true);
  return out;
}
