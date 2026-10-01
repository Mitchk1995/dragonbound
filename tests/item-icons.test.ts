/**
 * Inventory readability: each ore and gem is its own shape and colour, bars are real ingots, amulets face the
 * viewer, and the skills tab's tiles and hover card show the right numbers.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BASES } from '../src/data/items';
import { buildMaterialModel, ingot } from '../src/render/materialModels';
import { iconSubject } from '../src/render/icons3d';
import { makeItem } from '../src/loot/itemGen';
import { MAX_LEVEL, xpForLevel } from '../src/progression/skills';
import { skillTileInfo, xpDropLabel } from '../src/ui/skillGrid';

const ORES = ['copper_ore', 'tin_ore', 'iron_ore', 'coal', 'emberite_ore'];
const GEMS = ['uncut_sapphire', 'uncut_emerald', 'uncut_ruby'];
const BARS = ['bronze_bar', 'iron_bar', 'steel_bar', 'ember_bar'];

const build = (id: string) => buildMaterialModel(BASES[id].model!, BASES[id].color!, id);

/** What a model looks like, coarsely: its geometries and colours. */
function signature(g: THREE.Object3D) {
  const parts: string[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshStandardMaterial;
      parts.push(`${o.geometry.uuid}:${m.color.getHexString()}`);
    }
  });
  return parts.sort().join('|');
}

describe('material icons', () => {
  it('every ore and gem has its own model', () => {
    const sigs = [...ORES, ...GEMS].map((id) => signature(build(id)));
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('ores differ in shape, not just tint', () => {
    const shapes = ORES.map((id) => {
      const geos = new Set<string>();
      build(id).traverse((o) => {
        if (o instanceof THREE.Mesh) geos.add(o.geometry.uuid);
      });
      return [...geos].sort().join('|');
    });
    expect(new Set(shapes).size).toBe(ORES.length);
  });

  it('bars are ingots: sloped sides, a bevelled top narrower than the base, a metal finish', () => {
    const geo = ingot(0.46, 0.26, 0.19, 0.055, 0.03);
    geo.computeBoundingBox();
    const pos = geo.getAttribute('position');
    let topW = 0, baseW = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i)), y = pos.getY(i);
      if (y > 0.189) topW = Math.max(topW, x);
      if (y < 0.001) baseW = Math.max(baseW, x);
    }
    expect(baseW).toBeCloseTo(0.23, 3);
    expect(topW).toBeLessThan(baseW - 0.07);
    for (const id of BARS) {
      let shiny = false;
      build(id).traverse((o) => {
        if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).envMap) shiny = true;
      });
      expect(shiny, id).toBe(true);
    }
  });

  it('the ember bar and emberite glow; plain ores and bars do not', () => {
    const glows = (id: string) => {
      let on = false;
      build(id).traverse((o) => {
        if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).emissive.getHex() !== 0) on = true;
      });
      return on;
    };
    expect(glows('ember_bar')).toBe(true);
    expect(glows('emberite_ore')).toBe(true);
    expect(glows('bronze_bar')).toBe(false);
    expect(glows('coal')).toBe(false);
  });
});

describe('trinket icons', () => {
  // The owner: amulets looked rotated backwards, away from the camera. A pendant is flat, so face-on it is shallow
  // along the view axis (Z) and tall on screen; tipped away it would be deep and squat.
  for (const id of ['bone_amulet', 'jade_amulet']) {
    it(`${id} shows its pendant face-on`, () => {
      const { holder } = iconSubject(makeItem(id));
      holder.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
      expect(size.z, id).toBeLessThan(size.y * 0.35);
    });
    it(`${id} hangs below its loop, upright`, () => {
      const g = buildMaterialModel('amulet', BASES[id].palette!.main, id);
      const loop = g.children[0] as THREE.Mesh;
      const rest = new THREE.Box3();
      for (const c of g.children.slice(1)) rest.expandByObject(c);
      expect(rest.max.y).toBeLessThan(loop.position.y);
    });
  }
});

describe('skills tab tiles', () => {
  it('shows level out of 99 and the XP still needed', () => {
    const t = skillTileInfo(xpForLevel(10) + 100);
    expect(t.level).toBe(10);
    expect(t.label).toBe('10/99');
    expect(t.nextAt).toBe(xpForLevel(11));
    expect(t.remaining).toBe(xpForLevel(11) - xpForLevel(10) - 100);
    expect(t.frac).toBeCloseTo(100 / (xpForLevel(11) - xpForLevel(10)), 5);
  });

  it('a fresh skill starts at 1/99 with 83 XP to go', () => {
    const t = skillTileInfo(0);
    expect(t.label).toBe('1/99');
    expect(t.remaining).toBe(83);
    expect(t.pct).toBe(0);
  });

  it('never rounds up to 100% before the level, and is complete at 99', () => {
    expect(skillTileInfo(xpForLevel(11) - 1).pct).toBe(99);
    const max = skillTileInfo(xpForLevel(MAX_LEVEL) + 5);
    expect(max.label).toBe('99/99');
    expect(max.nextAt).toBeNull();
    expect(max.remaining).toBe(0);
    expect(max.pct).toBe(100);
  });

  it('XP drops keep one decimal while small (combat XP comes in pieces), whole numbers from 10', () => {
    expect(xpDropLabel(0.43)).toBe('0.4');
    expect(xpDropLabel(0.01)).toBe('0.1');
    expect(xpDropLabel(1.96)).toBe('2');
    expect(xpDropLabel(8.75)).toBe('8.8');
    expect(xpDropLabel(17.5)).toBe('18');
    expect(xpDropLabel(1250)).toBe('1,250');
  });
});
