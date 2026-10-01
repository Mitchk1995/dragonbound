import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { Cell, emptyLayout, Ground } from '../src/world/layout';
import { buildTerrain } from '../src/world/terrain';

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

  it('leaves a zone without levels exactly as it was', () => {
    const flat = plateauMap();
    flat.level = undefined;
    const a = buildTerrain(flat, theme, 7);
    expect(a.floorAt(30.5, 5.5)).toBe(0);
    expect(Math.abs(a.heightAt(30.5, 5.5))).toBeLessThan(0.1);
  });
});
