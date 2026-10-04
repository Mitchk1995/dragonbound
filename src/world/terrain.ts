import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { GROUND_TIME } from '../render/surface';
import { Fluid, type ZoneLayout } from './layout';
import { strandField } from './strands';
import { bedding } from './terrain/bedding';
import { buildFluids } from './terrain/fluids';
import { makeGrid } from './terrain/grid';
import { buildHeights } from './terrain/heightfield';
import { buildGround, terrainMesh } from './terrain/mesh';
import { channelColours, paintStrands, shadeGround, tallyCells } from './terrain/paint';
import { buildRelief } from './terrain/relief';
import { skirtBuilder } from './terrain/skirt';
import { weathering } from './terrain/weathering';

export { bedding } from './terrain/bedding';
export { isRelief, WATER_Y } from './terrain/grid';
export { smoothNoise } from './terrain/noise';

/**
 * Terrain for a zone: one continuous height grid (vertices at cell corners) split into
 * - flat ground: everything walkable and its gentle shore slopes (never dissolved), and
 * - relief: cliffs, plateaus and cave rock rising out of the same grid (dissolves around the
 *   hero like trees do, so a cliff never hides them);
 * plus animated water/lava surfaces over Fluid cells. Raised terrain only ever rises on cells that
 * block movement. The walkable ground itself may sit at a level (layout.level: plateaus, ramps):
 * every height is worked out relative to the local ground level and lifted onto it at the end,
 * so a zone without levels is unchanged, and units stand on the ground level (floorAt).
 *
 * The passes live in terrain/: grid (the vertex grid and its helpers), paint (ground colour and
 * splat), heightfield (ground levels, heights, shores), bedding and weathering (how outdoor rock is
 * cut and worn back), relief (the rock mesh), skirt (a floating island's sides), mesh (the ground
 * mesh and material) and fluids (water and lava surfaces).
 */
export interface Terrain {
  meshes: THREE.Mesh[];
  /** The relief mesh (cliffs/cave rock), if any: callers make it occludable. */
  relief: THREE.Mesh | null;
  /** Terrain height at a world point (bilinear over the vertex grid). */
  heightAt(x: number, z: number): number;
  /** Height of the walkable ground level at a world point (where units stand). */
  floorAt(x: number, z: number): number;
  /** Animated surfaces to tick each frame. */
  tick(t: number): void;
  /** The height of a flat ledge of outdoor rock at a point (on one bed out to `r`), else null. */
  ledge(x: number, z: number, r?: number): number | null;
  /** Where a point on outdoor rock at height y is drawn once the cliff is weathered (x, z). */
  warp(x: number, y: number, z: number): [number, number];
}

export function buildTerrain(layout: ZoneLayout, theme: ZoneTheme, seed: number): Terrain {
  const g = makeGrid(layout, theme, seed);
  const sf = layout.lawn ? strandField(layout) : null;
  const beds = bedding(seed);
  const tally = tallyCells(g);
  shadeGround(g, tally);
  const heights = buildHeights(g, tally, beds, sf);
  const chanCol = channelColours(g, tally);
  if (sf) paintStrands(g, tally, chanCol, sf);
  const { ground, pos, caveCells } = buildGround(g, tally, heights, chanCol);
  const wet = layout.fluid.some((f) => f === Fluid.Water);
  const worn = weathering(g, tally, heights, beds, seed);
  const skirt = theme.ambient === 'void' ? skirtBuilder(g) : null;

  const meshes: THREE.Mesh[] = [terrainMesh(ground, theme, 'ground', wet)];
  const relief = caveCells.length ? terrainMesh(buildRelief(g, tally, heights, beds, worn, skirt, caveCells), theme, 'relief', wet, false) : null;
  if (relief) meshes.push(relief);
  if (skirt) {
    // The skirt under the flat ground's edge (the relief's own edge laid its skirt as it was cut).
    const cut = new Set<number>();
    for (let i = 0; i < caveCells.length; i += 2) cut.add(caveCells[i + 1] * layout.w + caveCells[i]);
    skirt.underGround(cut, pos, tally.col, heights.base);
    const geo = skirt.geometry();
    if (geo) {
      const mesh = terrainMesh(geo, theme, 'skirt', wet, false);
      mesh.castShadow = true;
      meshes.push(mesh);
    }
  }
  const fluids = buildFluids(g, heights);
  meshes.push(...fluids.meshes);

  const { base, hgt } = heights;
  const heightAt = (x: number, z: number) => g.gridAt(base, x, z) + g.gridAt(hgt, x, z);
  const floorAt = (x: number, z: number) => g.gridAt(base, x, z);
  return { meshes, relief, heightAt, floorAt, ledge: worn.ledge, warp: worn.warp, tick: (t) => { GROUND_TIME.value = t; fluids.ticks.forEach((f) => f(t)); } };
}
