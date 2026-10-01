import type { Game } from '../game';
import { cellRole, fitBlocks, fitsOf, footprint, type BuildingSpec, type Floor } from '../world/building';
import { perf } from './inspect';

const ROOMS = [
  [
    ['kitchen', 'Kitchen', 5.5, 5.5], ['pantry', 'Buttery / pantry', 5.5, 15],
    ['great-hall', 'Great hall / dais', 18, 7.5], ['screens', 'Screens passage', 18, 17.5],
    ['armoury', 'Armoury', 30.5, 5.5], ['guard-room', 'Guard room', 30.5, 15],
  ],
  [
    ['bedchamber', "Warden's chamber", 5.5, 5.5], ['library', 'Library', 5.5, 15],
    ['solar', 'Solar', 18, 5.5], ['map-room', 'Map room', 18, 15],
    ['chapel', 'Chapel', 30.5, 5.5], ['antechamber', 'Stair antechamber', 30.5, 15],
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
  const header = floor ? 'Upper floor · 5.2 m above the hall' : 'Ground floor · north at the top';
  return `<div style="position:fixed;inset:0;z-index:2100;background:#161b22;color:#eadcc1;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial,sans-serif;gap:14px">
    <div style="font-size:30px">Dragonspire Keep — ${header}</div>
    <div style="font-size:16px;color:#b8b5ac">36 × 20 tiles · corner towers 5 × 5 · one grid square = one metre</div>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:min(85vw,${width}px);max-height:70vh">${shapes.join('')}</svg>
    <div style="font-size:16px">Dark: masonry · Sand: walkable floor / doors · Brown: furniture · Gold: tower stairs ${floor ? 'down' : 'up'}</div>
    <div style="font-size:14px;color:#a29d92">Doorways and stairs match the playable navigation grid. Enter through the south screens passage.</div>
  </div>`;
}

/** Dev-only audit: real floor plans, each room at gameplay height, and both spiral stairs. */
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
      g.camZoom = id === 'great-hall' || id === 'map-room' ? 1.2 : 0.8;
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
