import { Gen } from '../../world/gen';
import { Cell, Ground, Lawn, lawnCell, type ZoneLayout } from '../../world/layout';
import * as castleBailey from '../../world/castle/bailey';
import * as castleGround from '../../world/castle/ground';
import { onCrown } from '../../world/castle/ground';
import { CROWN_Y, FOUNTAIN } from '../../world/castle/plan';
import { Site } from '../../world/castle/site';
import { ISLAND, POOL_BAY, type KeepBuild } from './keepPlan';
import { castleKerbs, nearCastle } from './keepCastle';
import { layLand } from './keepLand';
import { layTown } from './keepTown';
import { dressDistricts } from './keepDressing';
import { growWilds } from './keepWilds';

/** Dragonspire Keep, the home island, built in stages: the land, the town, the districts, the wilds, then its lawns. */
export function buildKeep(seed: number): ZoneLayout {
  const { w, h } = ISLAND;
  const G = new Gen(w, h, seed, Cell.Void, Ground.Grass);
  const level = (G.l.level = new Float32Array(w * h));
  const site = new Site(G);
  const k: KeepBuild = { G, level, site, w, h };
  const { outline, court, stream } = layLand(k);
  const look = layTown(k, court);
  dressDistricts(k, look, stream);
  growWilds(k, outline);
  // ─── Lawns and the meadow ──────────────────────────────────────────────────
  G.connect();
  // The meadow at the foot of the castle rock (round the fields and the pool) rolls a little: a slow
  // swell of a few tenths over a dozen cells, easing out to dead level three cells short of anything
  // set on the land (the rock, the road, the water, a plot, a fence), so every one of them stands on
  // level ground and only the open grass undulates.
  {
    const open = (i: number) => G.l.cells[i] === Cell.Ground && G.l.ground[i] === Ground.Grass && !G.l.fluid[i] && G.reserved[i] !== 1;
    const set = new Uint8Array(w * h);
    for (const p of G.l.props) if (G.inside(Math.floor(p.x), Math.floor(p.z))) set[G.idx(Math.floor(p.x), Math.floor(p.z))] = 1;
    const near = G.distance((i) => !open(i) || !!set[i]);
    for (let z = 152; z < 200; z++) for (let x = 40; x < 142; x++) {
      const i = G.idx(x, z);
      if (!open(i) || onCrown(x + 0.5, z + 0.5) || level[i] >= CROWN_Y) continue;
      const ease = Math.min(1, Math.max(0, (near[i] - 1) / 3));
      const swell = (G.noise(x * 0.09 + 13, z * 0.09 + 29) - 0.5) * 0.7 + (G.noise(x * 0.23 + 5, z * 0.23 + 61) - 0.5) * 0.2;
      level[i] += swell * ease;
    }
  }
  // Trees grow on the island's crags, but not on the castle's crown.
  const canopy = (G.l.canopy = new Uint8Array(w * h).fill(4));
  for (let i = 0; i < w * h; i++) if (nearCastle((i % w) + 0.5, Math.floor(i / w) + 0.5)) canopy[i] = 0;
  // A full grass carpet on every grassy cell: clipped lawns inside the curtain and on the crown
  // round it, meadow elsewhere (the rim of rock beyond the moat included).
  const lawn = (G.l.lawn = new Uint8Array(w * h));
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z);
    lawn[i] = lawnCell(G.l.cells[i], G.l.ground[i], G.l.fluid[i], castleBailey.inCastle(x + 0.5, z + 0.5) || (level[i] >= CROWN_Y && onCrown(x + 0.5, z + 0.5) && !castleGround.onRim(x + 0.5, z + 0.5)));
  }
  // The private gardens and the paddock grow a longer garden lawn with clover under it; the
  // formal lawns stay clipped and striped.
  for (const box of castleBailey.GARDEN_LAWNS) site.cells(box, (i) => {
    if (lawn[i] === Lawn.Clipped) lawn[i] = Lawn.Garden;
  });
  castleBailey.parterreLawn(site, lawn);
  // (The pool's round bay too: its paving lies flush to the kerb with no grass through it.)
  G.l.lawnCut = [{ x: FOUNTAIN.x, z: FOUNTAIN.z, r: castleBailey.ARC_LAWN }, { ...POOL_BAY, r: 3.0 }];
  G.l.kerbs = castleKerbs(G, lawn);
  return G.l;
}
