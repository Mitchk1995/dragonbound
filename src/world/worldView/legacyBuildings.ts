import * as THREE from 'three';
import { buildBuilding, buildFitProp } from '../buildingModel';
import { buildKeep } from '../castle/keepModel';
import { occludeAll } from './occlusion';
import type { Scene } from './scene';

/** The enterable buildings and the great keep, from the old building and castle models. */
export function placeBuildings(scene: Scene) {
  const { layout, floorAt, group } = scene;
  // Buildings stand on the flat floor they stamped; their walls dissolve around the hero like
  // any other occluder.
  return (layout.buildings ?? []).map((b) => {
    // (The great keep has its own model.)
    const bp = (b.id === 'keep' ? buildKeep : buildBuilding)(b, floorAt(b.x + b.w / 2, b.z + b.d / 2));
    occludeAll(bp.obj);
    // Their walls take the sun's shadows too: a tower's shadow falls across the wall beside it, the
    // battlements' across the wall walk, the hall's across the yard's buildings.
    bp.obj.traverse((o) => {
      if (o instanceof THREE.Mesh) o.receiveShadow = true;
    });
    group.add(bp.obj);
    return bp;
  });
}

/** A building's fitting stood out in the world (a `fit_` prop), from the old building model. */
export const fitProp = (kind: string, len?: number) => buildFitProp(kind.slice(4), len);
