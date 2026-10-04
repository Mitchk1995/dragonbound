import * as THREE from 'three';
import { ModelKit } from '../../render/kit';
import { hasModel, makeModel } from '../../render/registry';
import { APPROACH_PROPS } from '../castleProps/approach';
import { BAILEY_PROPS } from '../castleProps/bailey';
import { CURTAIN_PROPS } from '../castleProps/curtain';
import { WATER_PROPS } from '../castleProps/water';
import { CAVE_PROPS } from './cave';
import { type Builder, type Prop } from './core';
import { DEN_PROPS } from './den';
import { DUNGEON_PROPS } from './dungeon';
import { finishProp } from './finish';
import { KEEP_PROPS } from './keep';
import { LANDMARK_PROPS } from './landmarks';
import { oreRock } from './oreRock';
import { portal } from './portal';
import { RUINS_PROPS } from './ruins';
import { TOWN_PROPS } from './town';

// Building a prop by kind.

/** Big walls that should dissolve around the hero when they stand between them and the camera. */
export const OCCLUDING_PROPS = new Set(['castle_wall', 'round_tower', 'corner_tower', 'outer_gatehouse', 'forge_canopy', 'dragon_fountain', 'great_doors', 'pergola', 'garden_tree', 'wall_climber', 'tower_flag']);

/**
 * Every code-built builder: the prop families' and the castle's (castleProps/), merged on first use.
 * The castle files import props.ts, so they are not read while it loads.
 */
let allBuilders: Record<string, Builder> | undefined;
const builders = () => (allBuilders ??= {
  ...LANDMARK_PROPS, ...TOWN_PROPS, ...KEEP_PROPS, ...DEN_PROPS, ...CAVE_PROPS, ...RUINS_PROPS, ...DUNGEON_PROPS,
  ...CURTAIN_PROPS, ...WATER_PROPS, ...APPROACH_PROPS, ...BAILEY_PROPS,
});

/** Every code-built prop kind (plus 'portal' and 'rock_<ore>', built by their own functions). */
export const propKinds = () => Object.keys(builders());

/** Build a prop by kind. GLB `prop_<kind>` overrides the code-built prop when present. */
export function buildProp(kind: string, arg?: any): Prop {
  if (hasModel(`prop_${kind}`)) {
    const m = makeModel(`prop_${kind}`);
    const g = new THREE.Group();
    g.add(m.root);
    return { obj: g };
  }
  const k = new ModelKit();
  const g = new THREE.Group();
  let res: Prop | void;
  if (kind === 'arch' || kind === 'portal') res = portal(k, g, arg ?? null);
  else if (kind.startsWith('rock_')) res = oreRock(k, g, kind.slice(5));
  else res = builders()[kind]?.(k, g, arg);
  finishProp(g, [k]);
  return res ?? { obj: g };
}
