import { grownBark, grownLeaves, type BarkLook } from '../render/foliage';
import { shareResource } from '../render/resources';
import { growTree, leafGeometry, woodGeometry, type Species } from './treeGrowth';
import { DEAD_ASH, killTree, type Death } from './treeGrowth/deadwood';
import { branchAlignedWoodGeometry } from './treeGrowth/wood';
import { BUSH, growShrub } from './treeGrowth/shrub';
import type { GrownLook, GrownStandIn } from './trees';

/**
 * The natural style's grown dead ash and bushes (TreeSet.grown, trees.ts), standing in for the block
 * models: their shapes, their looks, and their wood and leaves (built once, shared).
 */

/** The dead ash's shapes: each a seed, how that tree grew from the ash (forked low, leaning), and how it has broken up since it died. */
export const DEAD_ASHES: { seed: number; form?: Partial<Species>; death: Death }[] = [
  // A tall snag: its top snapped high, its limbs mostly whole but bare and broken at the tips.
  { seed: 5, death: { top: [0.74, 0.8], snap: 0.35, snapAt: [0.45, 0.75], keep: 0.65, stubs: 0.25, tips: 0.7 } },
  // Squat and wide: forked low into four or five spreading limbs, its trunk snapped not far over them.
  { seed: 6, form: { fork: [1.8, 2.1], limbs: [4, 5], rise: [0.5, 0.95], spread: [7.5, 8.5] }, death: { top: [0.55, 0.62], snap: 0.25, snapAt: [0.6, 0.85], keep: 0.65, stubs: 0.25, tips: 0.6 } },
  // Leaning a little, more of its branches still on it.
  { seed: 7, form: { lean: 0.42 }, death: { top: [0.66, 0.74], snap: 0.25, snapAt: [0.55, 0.8], keep: 0.7, stubs: 0.2, tips: 0.6 } },
];

/** The bushes' shapes: each a seed and how it departs from the bush. */
export const BUSHES: { seed: number; form?: Partial<Species> }[] = [
  // A round mound.
  { seed: 7 },
  // Low and spreading.
  { seed: 2, form: { height: [1.15, 1.3], spread: [2.5, 2.8], rise: [0.75, 1.1] } },
  // Tall and upright, its stems showing at its foot.
  { seed: 14, form: { height: [1.8, 2.0], spread: [1.5, 1.7], crownBase: 0.12, rise: [1.15, 1.4], limbs: [6, 7], fill: [0.3, 0.4] } },
];

/**
 * A dead ash's bark: an ash's grey-brown bark, still on most of its trunk low down, fallen away in
 * long patches higher up and off most of its limbs, baring weathered grey wood (DeadWood).
 */
const DEAD_BARK: BarkLook = { kind: 'ash', tile: 0.9, relief: 1.1, gain: 1.5, moss: [0.11, 0.14, 0.06], dead: { wood: 'deadwood', gain: 1.4, low: 1.2, high: 7, branchAligned: true } };
/** A bush's stems: a common broadleaf's smooth grey-brown bark, in small. */
const BUSH_BARK: BarkLook = { kind: 'tree', tile: 0.2, relief: 0.8, gain: 1.5, moss: [0.13, 0.17, 0.07] };

/** The dead ash: it has no leaves (its limbs are bark too); thinned to one every 5.5 m, nothing growing under it. */
export const DEAD_ASH_LOOK: GrownLook = {
  trunk: (m, w) => grownBark(m, w, DEAD_BARK),
  canopy: (m, w) => grownBark(m, w, DEAD_BARK),
  size: [0.85, 1.15],
  spacing: 5.5,
  palette: [0x9a958c],
};

/**
 * The bushes. The woods' undergrowth pass sets each bush's size and tint (the zone's own greens);
 * its size, spacing and palette here are what a bush staged on its own takes (the inspect lineup).
 */
export const BUSH_LOOK: GrownLook = {
  trunk: (m, w) => grownBark(m, w, BUSH_BARK),
  canopy: (m, w) => grownLeaves(m, w, 'bush'),
  size: [0.5, 1],
  spacing: 1.5,
  palette: [0x5c8a42, 0x648f44, 0x557f3e, 0x7d8a3e, 0x98893f],
};

let made: { ash: GrownStandIn; bush: GrownStandIn } | null = null;

/** The dead ash's and the bushes' shapes: each one's wood and the bushes' leaves (built once, shared). */
export function grownStandIns() {
  if (!made) {
    const ash = DEAD_ASHES.map(({ seed, form, death }) => killTree(growTree({ ...DEAD_ASH, ...form }, seed), seed, death));
    const bush = BUSHES.map(({ seed, form }) => growShrub({ ...BUSH, ...form }, seed));
    made = {
      ash: { trunk: ash.map(branchAlignedWoodGeometry), canopy: [], look: DEAD_ASH_LOOK },
      bush: { trunk: bush.map(woodGeometry), canopy: bush.map((sk, i) => leafGeometry(sk, BUSHES[i].seed)), look: BUSH_LOOK },
    };
    for (const g of [...made.ash.trunk, ...made.bush.trunk, ...made.bush.canopy]) shareResource(g);
  }
  return made;
}
