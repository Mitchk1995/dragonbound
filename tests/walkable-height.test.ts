import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { Cell, emptyLayout, Ground } from '../src/world/layout';
import { buildTerrain } from '../src/world/terrain';
import { buildWorldView } from '../src/world/worldView';
import { CLIMB, TERRACE_STAIRS, TERRACE_Y } from '../src/world/castle/plan';

/**
 * Walkable ground levels (layout.level): a plateau at level 4 behind a two-cell cliff band, reached
 * by a ramp of walkable cells climbing from the lowland at 0. Units stand on floorAt, so it must be
 * exactly the level on flat ground and climb smoothly up the ramp, and the meshes must sit on it.
 */
function plateauMap() {
  const w = 40, h = 30, L = emptyLayout(w, h);
  L.cells.fill(Cell.Ground);
  L.ground.fill(Ground.Grass);
  L.level = new Float32Array(w * h);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = z * w + x;
    if (x >= 20) L.level[i] = 4; // plateau
    else if (x >= 17) {
      // the cliff band below the plateau's edge (it rises from the lowland), except the ramp rows
      if (z >= 12 && z < 16) continue;
      L.cells[i] = Cell.Cliff;
      L.elev[i] = 4.6;
    }
  }
  // The ramp: rows 12-15 climb from x = 8 (level 0) to x = 20 (level 4).
  for (let z = 12; z < 16; z++) for (let x = 8; x < 20; x++) L.level[z * w + x] = ((x - 8 + 0.5) / 12) * 4;
  return L;
}

describe('walkable ground levels', () => {
  const theme = ZONES.foothills.theme;
  const L = plateauMap();
  const t = buildTerrain(L, theme, 7);

  it('stands units on the plateau, the lowland and up the ramp', () => {
    expect(t.floorAt(30.5, 5.5)).toBeCloseTo(4, 5);
    expect(t.floorAt(4.5, 5.5)).toBeCloseTo(0, 5);
    const up = [9, 12, 15, 18].map((x) => t.floorAt(x + 0.5, 13.5));
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1]);
    expect(up[0]).toBeGreaterThan(0);
    expect(up[3]).toBeLessThan(4.01);
  });

  it('lays the ground mesh on the level (plateau ground is not dissolving relief)', () => {
    expect(Math.abs(t.heightAt(30.5, 5.5) - 4)).toBeLessThan(0.1);
    expect(Math.abs(t.heightAt(4.5, 5.5))).toBeLessThan(0.1);
    const ground = t.meshes.find((m) => m.name === 'ground')!;
    const box = new THREE.Box3().setFromBufferAttribute(ground.geometry.getAttribute('position') as THREE.BufferAttribute);
    expect(box.max.y).toBeGreaterThan(3.9);
  });

  it('raises the cliff from the lowland to at least the plateau', () => {
    const relief = t.relief!;
    expect(relief).toBeTruthy();
    const box = new THREE.Box3().setFromBufferAttribute(relief.geometry.getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeLessThan(0.7);
    expect(box.max.y).toBeGreaterThan(4);
  });

  it('stands units on a deck at its own level over whatever lies under it, and on the ground off it', () => {
    const D = emptyLayout(12, 12);
    D.cells.fill(Cell.Ground);
    D.ground.fill(Ground.Grass);
    D.level = new Float32Array(12 * 12);
    D.decks = [{ box: [3, 3, 7, 7], y: 2.5 }];
    const view = buildWorldView(D, theme, 3);
    expect(view.floorAt(5, 5)).toBe(2.5);
    expect(view.floorAt(9, 9)).toBeCloseTo(0, 5);
  });
  it('leaves a zone without levels exactly as it was', () => {
    const flat = plateauMap();
    flat.level = undefined;
    const a = buildTerrain(flat, theme, 7);
    expect(a.floorAt(30.5, 5.5)).toBe(0);
    expect(Math.abs(a.heightAt(30.5, 5.5))).toBeLessThan(0.1);
  });

  it('the castle\'s stairs are walked up flight by flight: the ground under the hero climbs every flight and stands level on every landing', () => {
    const L = ZONES.keep.build(1000 + 'keep'.length * 97), t = buildTerrain(L, ZONES.keep.theme, 7);
    // Up the climb's middle from the lane to the ledge, a step at a time.
    const route: [number, number][] = [[157.5, 171.5]];
    for (let z = 171; z >= 155.5; z -= 0.25) route.push([157.5, z]);
    for (let x = 157.5; x >= 139.5; x -= 0.25) route.push([x, 155.5]);
    const ys = route.map(([x, z]) => t.floorAt(x, z));
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1], `at ${route[i]}`).toBeGreaterThan(-0.01);
    expect(ys[0]).toBeLessThan(0.6);
    expect(ys[ys.length - 1]).toBeCloseTo(11, 1);
    // Every landing (two cells deep or more) is level across its middle.
    for (const l of CLIMB.landings) {
      const [x0, z0, x1, z1] = l.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.min(x1 - x0, z1 - z0) < 2) continue;
      expect(t.floorAt(cx, cz), `landing ${l.rect}`).toBeCloseTo(l.y, 1);
    }
    // The grand stair climbs from the cour to the terrace.
    const g = TERRACE_STAIRS[0], gx = (g.x0 + g.x1) / 2;
    const up = Array.from({ length: 12 }, (_, i) => t.floorAt(gx + 0.5, g.z1 + 0.5 - i * 0.5));
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1] - 0.01);
    expect(t.floorAt(gx + 0.5, g.z0 - 1)).toBeCloseTo(TERRACE_Y, 1);
  });
});
