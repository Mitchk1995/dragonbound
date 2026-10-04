import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import type { ZoneLayout } from './layout';
import type { Prop } from './props';
import { setWaterSky } from './water';
import type { BuildingProp } from './buildingModel';
import { buildTerrain } from './terrain';
import { makeOccludable } from './worldView/occlusion';
import { WIND } from './worldView/materials';
import { createScene } from './worldView/scene';
import { cellPass } from './worldView/cells';
import { caveKit, caveMass } from './worldView/caves';
import { dressCliffs } from './worldView/cliffs';
import { drawScatter } from './worldView/draw';
import { hangUnderside, veilSky } from './worldView/veil';
import { sowGrass } from './worldView/grass';
import { layKerbs, placeProps } from './worldView/dressing';
import { placeBuildings } from './worldView/legacyBuildings';

// A zone's world, assembled from the passes under worldView/: the terrain, the scenery scattered over
// it (trees, rock, undergrowth, grass), the sky, the props and the buildings.
export { makeOccludable, OCCLUDE } from './worldView/occlusion';
export { grownMeshes, treeMeshes } from './worldView/materials';

export interface WorldView {
  group: THREE.Group;
  /** Objects that follow the camera (sky). */
  followers: THREE.Object3D[];
  props: Prop[];
  /** Enterable buildings (roofs lift while the hero is inside). */
  buildings: BuildingProp[];
  /** Terrain height at a world point (scenery and props stand on it). */
  heightAt(x: number, z: number): number;
  /** Height of the walkable ground level at a world point, a deck's where one spans it (units, stations and buildings stand on it). */
  floorAt(x: number, z: number): number;
  /** Advance animated surfaces (water, lava). */
  tick(t: number): void;
}

export function buildWorldView(layout: ZoneLayout, theme: ZoneTheme, seed = 99): WorldView {
  const group = new THREE.Group();
  const followers: THREE.Object3D[] = [];

  // Terrain: continuous height grid (relief rises out of it), fluids, and a height query for scenery.
  const terrain = buildTerrain(layout, theme, seed);
  // Pools and basins on props reflect this zone's sky.
  setWaterSky(theme.hemi[0], theme.bg);
  for (const tm of terrain.meshes) group.add(tm);
  if (terrain.relief) makeOccludable(terrain.relief.material as THREE.Material);
  const { heightAt, floorAt } = terrain;

  // The scenery passes, in this order (they share one random stream): every cell, the outdoor cliffs,
  // the cave walls behind their foot, then everything drawn; the grass and the sky last.
  const { scene, sets } = createScene(layout, theme, seed, group, terrain);
  const cave = caveKit(scene, sets);
  const rockCells = cellPass(scene, sets, cave);
  dressCliffs(scene, sets, rockCells);
  caveMass(scene, sets, cave);
  drawScatter(scene, sets);
  hangUnderside(scene, sets);
  sowGrass(scene, sets);
  const debrisTick = veilSky(scene, followers);

  layKerbs(scene);
  const props = placeProps(scene);
  const buildings = placeBuildings(scene);
  // (On a deck, units stand on its paving, not on the ground under it.)
  const decks = layout.decks ?? [];
  const walkAt = (x: number, z: number) => {
    for (const d of decks) if (x > d.box[0] && x < d.box[2] && z > d.box[1] && z < d.box[3]) return d.y;
    return floorAt(x, z);
  };
  return { group, followers, props, buildings, heightAt, floorAt: walkAt, tick: (t) => { terrain.tick(t); WIND.uWindT.value = t; debrisTick?.(t); } };
}
