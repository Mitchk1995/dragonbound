import type { Vec2 } from '../../types';
import { upperCells } from '../../world/building';
import { blockDisc, Ground, type StationKind } from '../../world/layout';
import * as castleBailey from '../../world/castle/bailey';
import * as castleCurtain from '../../world/castle/curtain';
import * as castleGround from '../../world/castle/ground';
import { keepGround } from '../../world/castle/keepSpec';
import { KEEP } from '../../world/castle/plan';
import { blockRect, inPoly } from './helpers';
import { inB, KEEP_BUILDINGS } from './keepBuildings';
import { FORGE, ISLAND, KEEP_ARCHES, type KeepBuild } from './keepPlan';

/** The portal court, the yards and open ground, the castle's walls, the buildings, the stations and the court's dressing. Returns the lookout's spot. */
export function layTown({ G, level, site, w, h }: KeepBuild, court: Vec2) {
  // ─── Portal court: arrival dais, the portal ring, the Warden, the board ─────
  G.prop('landing', ISLAND.landing.x, ISLAND.landing.z);
  G.l.entry = { x: ISLAND.landing.x, z: ISLAND.landing.z - 1.8 };
  G.reserve(ISLAND.landing.x, ISLAND.landing.z, 4);

  // ─── Yards, forecourts and open ground ───────────────────────────────────────
  const yard = (p: Vec2, r: number, gr: Ground, wob: number) => G.clearing(p.x, p.z, r, gr, wob);
  yard(inB('smelter', 8.6, 20.4), 6.6, Ground.Stone, 0.8);
  yard(inB('smelter', 3.6, 15.8), 3.8, Ground.Stone, 0.4);
  yard(inB('bank', 10, 19), 4, Ground.Stone, 0.6);
  yard(inB('shop', 7, 13), 3.4, Ground.Stone, 0.6);
  // The green, the memorial garden, the fields and the reserved ground stay open lawn.
  const keepOpen = (poly: number[][]) => {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    for (let z = Math.floor(Math.min(...zs)); z < Math.max(...zs); z++) for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) {
      if (!G.inside(x, z) || !inPoly(x + 0.5, z + 0.5, poly)) continue;
      const i = G.idx(x, z);
      if (!G.reserved[i]) G.reserved[i] = 3;
    }
  };
  G.verge(146, 198, 7);
  G.clearing(146, 198, 6, undefined, 1);
  keepOpen([[166, 218], [186, 218], [187, 236], [167, 236]]);
  keepOpen([[48, 162], [94, 162], [94, 198], [48, 198]]);
  keepOpen([[235, 148], [284, 144], [291, 170], [279, 192], [242, 195], [235, 172]]);
  keepOpen([[72, 202], [108, 202], [110, 218], [92, 222], [82, 212]]);
  const look = { x: 179, z: 248 };
  G.floor(look.x, look.z, 4.6, 2.6, 0, Ground.Stone);

  // ─── The castle: the curtain, then the terrace and the bailey's grounds ─────
  castleCurtain.curtain(site);
  castleGround.keepPlinth(site);
  castleBailey.terrace(site);
  castleBailey.grounds(site);

  // ─── Buildings ─────────────────────────────────────────────────────────────
  for (const b of KEEP_BUILDINGS) G.building(b);
  // (The keep's turrets and frontispiece stand on the terrace round it.)
  keepGround(site);
  for (const b of KEEP_BUILDINGS) G.verge(b.x + b.w / 2, b.z + b.d / 2, Math.max(b.w, b.d) / 2 + 7);
  // (A raised part of a floor, a dais, raises the ground the hero stands on there.)
  for (const b of KEEP_BUILDINGS) for (const r of b.raised ?? []) site.cells([b.x + r.rect[0], b.z + r.rect[1], b.x + r.rect[2], b.z + r.rect[3]], (i) => (level[i] += r.h));
  G.l.upper = upperCells(w, h, KEEP_BUILDINGS);
  // The great door's leaves stand open inside the keep's doorway on the axis.
  G.prop('great_doors', KEEP.door.x, KEEP.door.z - 0.95, 0).len = KEEP.door.w;

  // ─── Stations (bank, furnace and shop first: the inspect tool frames the first few) ──
  const st = (kind: StationKind, id: string, p: Vec2, rot = 0, block = 0.1) => G.station(kind, id, p.x, p.z, rot, block);
  st('bank', 'bank', inB('bank', 10, 6.5));
  st('furnace', 'furnace', inB('smelter', 8.5, 2.6));
  st('shop', 'shop', inB('shop', 7.5, 4.5));
  // The Restoration Board stands in the arrival court with the Warden.
  st('restore', 'board', { x: 169.5, z: 181.5 }, 0, 0.6);
  st('anvil', 'anvil', FORGE.anvil, 0, 1.0);
  st('restore', 'emberforge', FORGE.hearth, 0, 1.3);
  st('npc', 'warden', { x: 182.5, z: 181 }, -Math.PI * 0.6, 0.5);
  st('npc', 'quartermaster', inB('shop', 7.5, 3.3), 0, 0.4);
  blockRect(G, inB('bank', 10, 6.5).x, inB('bank', 10, 6.5).z, 3.1, 0.6, 0);
  blockRect(G, inB('shop', 7.5, 4.5).x, inB('shop', 7.5, 4.5).z, 2.6, 0.6, 0);
  for (const a of KEEP_ARCHES) {
    const rad = (a.angle * Math.PI) / 180;
    const x = court.x + Math.cos(rad) * 10.5, z = court.z + Math.sin(rad) * 10.5;
    G.station('portal', a.id, x, z, Math.atan2(court.x - x, court.z - z), 1.4);
  }
  st('restore', 'vault_expanded', inB('bank', 17.5, 12.3), -Math.PI / 2, 0.3);
  st('restore', 'alchemy_lab', inB('alchemy_plot', 3.2, 11.3), 0, 0.3);
  st('restore', 'rune_altar', inB('rune_plot', -1.6, 2.4), Math.PI / 2, 0.3);
  st('restore', 'hatchery', inB('hatch_plot', 15.6, 3.6), -Math.PI / 2, 0.3);

  // ─── Dressing ──────────────────────────────────────────────────────────────
  // Real lights only at the court, the castle's gate terrace and the two busiest doors; lamp posts
  // elsewhere.
  for (const [x, z] of [[court.x - 12.5, court.z + 0.5], [court.x + 12.5, court.z + 0.5], [78.2, 154.6], [93.8, 154.6], [inB('bank', 6, 17).x, inB('bank', 6, 17).z], [inB('shop', 4.5, 15.2).x, inB('shop', 4.5, 15.2).z]]) G.prop('lamp', x, z, 0, 1, 0.4);
  for (const p of [{ x: 152, z: 180 }, { x: 166.6, z: 169 }, { x: 186.4, z: 186 }, { x: 158, z: 194 }, { x: 173.6, z: 200 }, { x: 196, z: 168 }]) G.prop('lamp_post', p.x, p.z, 0, 1, 0.4);
  // The forge yard, as the work flows from west to east (see FORGE): under the lean-to against the
  // smelter's south wall the Emberforge (its bellows and chimney built on) and the coal bin; the bars come out of
  // the smelter door onto their pallet. Out in front of the fire: the anvil, the quench trough at the
  // smith's right hand, the grindstone, and the finished work on show where the road comes in.
  G.prop('forge_canopy', FORGE.canopy.x, FORGE.canopy.z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) blockDisc(G.l, FORGE.canopy.x + sx * 3.3, FORGE.canopy.z + sz * 1.3, 0.3);
  const fit = (kind: string, p: Vec2, rot: number, s: number, block: number) => G.prop(kind, p.x, p.z, rot, s, block);
  fit('fit_coal_bin', inB('smelter', 5.3, 13.75), 0, 1, 0.75);
  fit('fit_bar_stack', inB('smelter', 10.4, 14.6), 0.1, 1, 0.7);
  fit('fit_trough', inB('smelter', 6.3, 20.0), Math.PI / 2, 1, 0.75);
  fit('fit_grindstone', inB('smelter', 8.9, 21.6), 0.25, 1, 0.6);
  fit('fit_arms_rack', inB('smelter', 11.8, 23.6), 0, 1.15, 1.0);
  fit('fit_armor_stand', inB('smelter', 14.6, 23.4), -0.2, 1.1, 0.5);
  // Ore comes in by cart at the smelter's east door; the bin waits beside the track.
  G.prop('rails', inB('smelter', 19.2, 6.5).x, inB('smelter', 19.2, 6.5).z, Math.PI / 2).len = 3.4;
  fit('minecart', inB('smelter', 19.6, 6.5), Math.PI / 2, 1, 0.9);
  fit('fit_ore_bin', inB('smelter', 20.0, 3.0), 0, 1, 0.8);
  fit('fit_woodpile', inB('smelter', -1.4, 6.0), Math.PI / 2, 1, 0.8);
  // The market: stalls along the lane down to the shop.
  G.prop('stall', 179.8, 198, Math.PI / 2, 1, 1.6).len = 0;
  G.prop('stall', 187, 208, Math.PI / 2 - 0.3, 1, 1.6).len = 2;
  G.prop('stall', 201, 207.5, -Math.PI / 2, 1, 1.6).len = 1;
  // Fingerposts where the smithy and bank roads leave the court.
  G.prop('signpost', 161.6, 181.2, 0, 1, 0.3);
  G.prop('signpost', 190.6, 178.2, 0, 1, 0.3);
  return look;
}
