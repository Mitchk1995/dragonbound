import * as THREE from 'three';
import { ZONES } from '../src/data/zones';
import type { BuildingSpec } from '../src/world/building';
import type { PropSpawn, ZoneLayout } from '../src/world/layout';
import { PART_AUDIT, type Part } from '../src/world/props';
import { buildWorldView, type WorldView } from '../src/world/worldView';
import { Grid, solidsOf, type Solid } from './geometry';

/**
 * The castle as the game builds it (the keep's layout and its world view), with every prop and
 * building in and round the castle broken back into its parts, for the geometry audit.
 */
export interface Piece {
  /** Kind and position, e.g. `castle_wall@77.4,100.0` or `building:keep`. */
  name: string;
  kind: string;
  obj: THREE.Object3D;
  spawn?: PropSpawn;
  building?: BuildingSpec;
  solids: Solid[];
}

export interface CastleScene {
  layout: ZoneLayout;
  view: WorldView;
  pieces: Piece[];
  solids: Solid[];
  grid: Grid;
  /** The ground a piece stands on at a point (the higher of the walking floor and the terrain). */
  ground: (x: number, z: number) => number;
}

/** The castle on its crown, the gate terrace, the ledge road and the landing at the head of the climb. */
export const CASTLE_AREA = { x0: 14, x1: 135, z0: 15, z1: 120 };
const inArea = (x: number, z: number) => x > CASTLE_AREA.x0 && x < CASTLE_AREA.x1 && z > CASTLE_AREA.z0 && z < CASTLE_AREA.z1;

let scene: CastleScene | null = null;

export function castleScene(): CastleScene {
  if (scene) return scene;
  const seed = 1000 + 'keep'.length * 97;
  PART_AUDIT.on = true;
  let layout: ZoneLayout, view: WorldView;
  try {
    layout = ZONES.keep.build(seed);
    view = buildWorldView(layout, ZONES.keep.theme, seed + 7);
  } finally {
    PART_AUDIT.on = false;
  }
  view.group.updateMatrixWorld(true);
  const pieces: Piece[] = [];
  layout.props.forEach((pr, i) => {
    if (inArea(pr.x, pr.z)) pieces.push({ name: `${pr.kind}@${pr.x.toFixed(1)},${pr.z.toFixed(1)}`, kind: pr.kind, obj: view.props[i].obj, spawn: pr, solids: [] });
  });
  (layout.buildings ?? []).forEach((b, i) => {
    if (inArea(b.x + b.w / 2, b.z + b.d / 2)) pieces.push({ name: `building:${b.id}`, kind: `building:${b.id}`, obj: view.buildings[i].obj, building: b, solids: [] });
  });
  const solids: Solid[] = [];
  pieces.forEach((p, i) => {
    for (const part of (p.obj.userData.parts ?? []) as Part[]) {
      if (part.fx) continue;
      for (const s of solidsOf(i, part, p.obj.matrixWorld)) {
        p.solids.push(s);
        solids.push(s);
      }
    }
  });
  const ground = (x: number, z: number) => Math.max(view.floorAt(x, z), view.heightAt(x, z));
  scene = { layout, view, pieces, solids, grid: new Grid(solids), ground };
  return scene;
}
