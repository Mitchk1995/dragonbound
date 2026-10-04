import * as THREE from 'three';
import { ModelKit } from '../../render/kit';
import { applyOreRock, type OreLook } from '../../render/rockMaterial';
import { rockGeometry, type RockName } from '../../render/rockModels';
import { chunk, type Prop } from './core';

// The ore rocks, one per ore (the rock kit's, tools/blender/rocks.py).

/**
 * Each ore's rock: its host stone, and its veins (the ore's own colour, one colour per ore: copper's orange, tin's
 * pale silver, iron's rust red, coal's glossy black, emberite's glow), glinting where the ore is metal.
 */
const ORES: Record<string, OreLook & { host: number }> = {
  copper: { host: 0x6a6056, vein: 0xd8783a, glint: 0xffc070, glow: 0, rough: 0.35 },
  tin: { host: 0x6c6a68, vein: 0xe2e8ee, glint: 0xeef6ff, glow: 0, rough: 0.3 },
  iron: { host: 0x5c524c, vein: 0x8a3a26, glint: 0xffb488, glow: 0, rough: 0.45 },
  coal: { host: 0x6c6864, vein: 0x121116, glint: 0xd8e4ff, glow: 0, rough: 0.2 },
  emberite: { host: 0x2e2826, vein: 0xff6a1a, glint: 0, glow: 2.4, rough: 0.6 },
};

/**
 * An ore rock, about two units across: one solid rock with the ore running through it in veins (painted from its
 * baked vein mask), so each kind reads by its veins' colour from the camera. Mined out, the veins go dark and dull
 * until the ore grows back. Before the rock kit has loaded (a headless test), a plain stone stands in.
 */
export function oreRock(k: ModelKit, g: THREE.Group, id: string): Prop {
  const look = ORES[id] ?? ORES.copper;
  const name = `ore_${id in ORES ? id : 'copper'}` as RockName;
  const geo = rockGeometry(name);
  if (!geo) {
    chunk(k, g, id.length * 11, [1.8, 0.9, 1.5], [0, -0.08, 0], look.host, 0.3);
    return { obj: g };
  }
  const mat = new THREE.MeshStandardMaterial({ color: look.host, roughness: 0.9 });
  const ore = applyOreRock(mat, name, look);
  const mesh = new THREE.Mesh(geo, mat);
  // (Named, so the prop's finish leaves it whole: its UVs carry the baked map.)
  mesh.name = 'ore_rock';
  // (Sunk a little, so its foot sits in the ground.)
  mesh.position.y = -0.06;
  g.add(mesh);
  return {
    obj: g,
    tick: ore.tick,
    setState: (st) => ore.setOre(st !== 'depleted'),
  };
}
