import * as THREE from 'three';
import { CURTAIN_WALL } from '../data/castle';
import { CASTLE_PLAN } from '../data/zoneMaps';
import type { Game } from '../game';
import { cellRole, fitBlocks, fitsOf, footprint, type BuildingSpec, type Floor } from '../world/building';
import { OCCLUDE } from '../world/worldView';
import { perf } from './inspect';

/** The keep's rooms on each floor: [id, label, x, z] in cells from its corner. */
const ROOMS = [
  [
    ['throne-hall', 'Throne hall', 12, 12], ['dais', "The lord's dais", 12, 6.5], ['west-stair', 'West stair', 9.5, 21.5], ['east-stair', 'East stair', 14.5, 21.5],
  ],
  [
    ['council-gallery', 'Council gallery', 12, 3], ['west-gallery', 'West gallery', 3, 11], ['east-gallery', 'East gallery', 20, 11],
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
  const header = floor ? 'Galleries · at the wall walk, open over the throne hall' : 'Ground floor · north at the top';
  return `<div style="position:fixed;inset:0;z-index:2100;background:#161b22;color:#eadcc1;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial,sans-serif;gap:14px">
    <div style="font-size:30px">Dragonspire Keep — ${header}</div>
    <div style="font-size:16px;color:#b8b5ac">${b.w} × ${b.d} tiles · one grid square = one metre</div>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:min(85vw,${width}px);max-height:70vh">${shapes.join('')}</svg>
    <div style="font-size:16px">Dark: masonry, open void, stair flight · Sand: walkable floor / doors · Brown: furniture · Gold: the stair ${floor ? 'down' : 'up'}</div>
    <div style="font-size:14px;color:#a29d92">Doorways and stairs match the playable navigation grid. Enter by the great door, or from the great hall or the chapel.</div>
  </div>`;
}

/** Dev-only audit: the keep's real floor plans and each room at gameplay height. */
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
      g.camZoom = id === 'throne-hall' || id === 'council-gallery' ? 1.2 : 0.8;
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
 * Dev-only audit of the bailey (`npm run inspect -- bailey`): the whole castle from above, as a
 * plan and from the north, the approach up the stair and over the bridge, every yard through the
 * gameplay camera with the hero standing in it, the centrepiece up close, the island beyond and the
 * camera-side wall dissolving round the hero. Every position comes from CASTLE_PLAN, so the shots
 * follow the layout. With `angles` (`bailey-angles:door+bridge`) each named view is also shot from three orbits round the same
 * focus: the far side (`-opp`), low at the hero's eye height (`-low`) and close up (`-close`).
 */
export async function baileySuite(g: Game, shot: (name: string) => Promise<void>, rockOnly = false, only?: string[], angles = false) {
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

  /** The hero standing at (x, z), seen through the game's own camera at `zoom`, with its frame cost. */
  const play = async (name: string, x: number, z: number, zoom: number) => {
    if (only && !only.includes(name)) return;
    const at = g.zone.nav.nearestWalkable(x, z)!;
    g.player.obj.visible = true;
    g.player.pos.set(at.x, g.zone.groundY(at.x, at.z), at.z);
    g.player.stop();
    g.camPos.copy(g.player.pos);
    g.camZoom = zoom;
    g.update(0);
    out[`perf-${name}`] = await perf(g, 40);
    await shot(`bailey-${name}`);
    if (angles) {
      const look = g.player.pos.clone().setY(g.player.pos.y + 1.2);
      await orbits(name, g.camera.position.toArray(), look.toArray(), 16);
    }
  };
  /** A free camera at `eye` looking at `look` (world units), no fog, shadows cast over `span`. */
  const view = async (name: string, eye: number[], look: number[], span = 30) => {
    if (only && !only.includes(name)) return;
    await free(name, eye, look, span);
    if (angles) await orbits(name, eye, look, span);
  };
  /**
   * True when nothing but the focus itself stands between `eye` and `look` (tested both ways, so an
   * eye shut inside a building's walls, which only face outward, is caught too).
   */
  const ray = new THREE.Raycaster();
  ray.camera = g.camera;
  const blocked = (from: THREE.Vector3, to: THREE.Vector3, skipFrom: number, skipTo: number) => {
    const dir = to.clone().sub(from), d = dir.length();
    ray.set(from, dir.normalize());
    ray.near = skipFrom;
    ray.far = Math.max(skipFrom + 0.01, d - skipTo);
    return ray.intersectObjects(g.scene.children, true).some((h) => h.object.visible && (h.object as THREE.Mesh).isMesh);
  };
  const clear = (eye: THREE.Vector3, look: THREE.Vector3) => !blocked(eye, look, 0, 1.2) && !blocked(look, eye, 1.2, 0);
  /**
   * Three more angles on the same focus: swung round to the far side (the first swing from 180°
   * towards 60° with a clear line of sight, so a facade is never shot from inside its building),
   * low at the hero's eye height and close up.
   */
  const orbits = async (name: string, eye: number[], look: number[], span: number) => {
    const L = new THREE.Vector3(...look), E = new THREE.Vector3(...eye), off = E.clone().sub(L);
    const at = (v: THREE.Vector3) => v.toArray();
    let opp = L.clone().add(off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    for (const deg of [180, 135, -135, 100, -100, 70, -70]) {
      const cand = L.clone().add(off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180));
      if (clear(cand, L)) { opp = cand; break; }
    }
    await free(`${name}-opp`, at(opp), look, span);
    // Low: the hero's eye height on the same side (or swung round), nearer in until the line is clear.
    let low: THREE.Vector3 | null = null;
    for (const deg of [0, 30, -30, 60, -60, 180]) for (const k of [0.7, 0.5, 0.35, 0.2]) {
      if (low) break;
      const p = L.clone().add(new THREE.Vector3(off.x, 0, off.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180).multiplyScalar(k));
      p.y = g.zone.groundY(p.x, p.z) + 1.6;
      if (clear(p, L)) low = p;
    }
    low ??= L.clone().add(new THREE.Vector3(off.x, 0, off.z).multiplyScalar(0.35)).setY(L.y);
    await free(`${name}-low`, at(low), look, span);
    await free(`${name}-close`, at(L.clone().add(off.clone().multiplyScalar(0.35))), look, Math.max(8, span * 0.5));
  };
  const free = async (name: string, eye: number[], look: number[], span: number) => {
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

  const finish = () => {
    g.player.obj.visible = true;
    document.body.classList.remove('inspect-clean');
    g.debug.timeScale = 1;
    g.travel('keep', true);
    return out;
  };

  const K = P.keep, kx = (K[0] + K[2]) / 2;
  // The castle rock from below (`bailey:rock` captures only these): its south face over the farm
  // and the pool under the fall, the stair up its south-east corner from the court, the west face
  // from out over the Veil, and the fall into the pool.
  await view('rock-south', [P.gate.x + 4, 3, P.gate.z + 52], [P.gate.x + 4, 7, P.gate.z + 14], 45);
  await view('rock-east', [P.gate.x + 100, 7, P.gate.z + 24], [P.gate.x + 52, 6, P.gate.z + 14], 45);
  await view('stair', [P.gate.x + 72, 9, P.gate.z + 38], [P.gate.x + 51, 5, P.gate.z + 20], 22);
  await view('rock-west', [-14, 16, 86], [28, 8, 64], 40);
  await view('falls', [P.gate.x + 8, y0 - 6, P.gate.z + 36], [P.gate.x, y0 - 6, P.gate.z + 21], 18);
  await view('falls-west', [4, y0 + 6, 92], [20.8, y0 - 4, 81], 24);
  // The fields at the rock's foot, low across the plots.
  await view('farm', [P.gate.x - 4, 2.6, P.gate.z + 56], [P.gate.x - 12, 0.2, P.gate.z + 38], 20);
  // The lookout's knoll from the meadow under it, and the moat's west spring behind the keep and the
  // turf round the landing from above.
  await view('lookout-rock', [14, 3, 140], [30, 8, 117], 22);
  await view('spring', [54, y0 + 13, 22], [59.5, y0 - 1.5, 6.5], 12);
  await view('landing-turf', [142, y0 + 9, 101], [129, y0, 111], 14);
  if (rockOnly) return finish();

  // The whole castle: from high in the south-east (the plan's overview), as a plan from almost
  // straight above, from above the Veil to the north-west (the moat round the keep's back) and from
  // far out over the island in the south.
  await view('overview', [c.x + 70, y0 + 92, c.z + 92], [c.x - 2, y0, c.z + 4], 70);
  await view('plan', [c.x, y0 + 170, c.z + 22], [c.x, y0, c.z + 1], 75);
  await view('north', [c.x - 70, y0 + 46, K[1] - 58], [kx, y0 + 6, c.z - 8], 70);
  await view('skyline', [P.gate.x + 60, y0 + 40, P.gate.z + 80], [P.gate.x, y0 + 12, 50], 70);
  // The keep's front over the grand stair, and the gate front from the gate terrace.
  await view('keep-front', [P.door.x, y0 + 12, 70], [P.door.x, y0 + 10, 40], 24);
  await view('gatehouse-outer', [P.gate.x + 10, y0 + 6, P.gate.z + 22], [P.gate.x, y0 + 7, P.gate.z], 18);
  // Through the gameplay camera, on the way in: the stair's foot, its turn and its head, the
  // ledge, the bridge, the forecourt, the fountain, the avenue, the great door, and the yards and
  // the lookout.
  await play('stair-foot', 131, 132, 1.0);
  await play('stair-turn', 131, 118, 1.0);
  await play('stair-head', 116, 117.5, 1.0);
  await play('ledge', 100, 112.5, 1.0);
  await play('bridge', P.gate.x, P.gate.z + 6, 1.0);
  await play('entry', P.gate.x, P.gate.z - 4, 1.3);
  await play('centre', P.fountain.x, P.fountain.z + 6.2, 1.2);
  await play('avenue', P.gate.x, 60, 1.35);
  await play('door', P.door.x, P.door.z + 6, 1.0);
  await play('terrace', Z.terrace.x - 22, Z.terrace.z, 1.1);
  await play('stable-yard', Z.stableYard.x, Z.stableYard.z, 1.1);
  await play('muster-yard', Z.musterYard.x, Z.musterYard.z, 1.1);
  await play('kitchen-garden', Z.kitchenGarden.x, Z.kitchenGarden.z, 1.1);
  await play('privy-garden', Z.privyGarden.x, Z.privyGarden.z, 1.1);
  await play('paddock', Z.paddock.x, Z.paddock.z, 1.1);
  await play('training', Z.training.x, Z.training.z, 1.1);
  await play('lookout', 30, 115, 1.2);
  // The fountain up close, low down.
  await view('fountain-close', [P.fountain.x + 7.5, y0 + 4.2, P.fountain.z + 14.5], [P.fountain.x, y0 + 4.4, P.fountain.z + 0.5], 14);
  // The island beyond the castle: meadows, the approach, the portal court.
  await view('island', [c.x + 150, y0 + 70, c.z + 165], [c.x + 60, -4, c.z + 70], 100);
  // The hero by the camera-side (south) curtain: the wall stands full height and dissolves round them.
  await play('walls-southside', P.gate.x + 14, P.gate.z - 3.5, 1.0);
  // Along the wall walks at the hero's eye, down the walk's middle to the tower doors it leads to:
  // the south walk east to its tower and west to the gatehouse's drum, the east walk north to its
  // first tower.
  const walkY = y0 + CURTAIN_WALL.walkY + 1.6, mid = CURTAIN_WALL.walkOff;
  await view('walk-south-east', [P.gate.x + 11, walkY, P.gate.z - mid], [P.gate.x + 20, walkY - 0.6, P.gate.z - mid], 10);
  await view('walk-south-west', [P.gate.x + 15, walkY, P.gate.z - mid], [P.gate.x + 6, walkY - 0.6, P.gate.z - mid], 10);
  await view('walk-east', [120 - mid, walkY, 72], [120 - mid, walkY - 0.6, 63], 10);
  // Frame cost in a meadow outside the castle, for comparison with the fountain's.
  await play('meadow', 56, 150, 1.0);
  return finish();
}
