/**
 * The rock kit (tools/blender/rocks.py, render/rockModels.ts): every rock is one closed piece within its triangle
 * budget with its baked map beside it; the zones draw their rock from the kit, and the castle's island keeps its own
 * block rock exactly as it was; the kit's masses dress the cliffs as fully as the block masses did and never rise
 * through a walk; the ore rocks carry their ore in veins of their own colour that go dull when mined; and rocks of
 * one paint share one program.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZONES } from '../src/data/zones';
import { ROCK_MASSES, rockMass } from '../src/render/blocks';
import { applyKitRock } from '../src/render/rockMaterial';
import { preloadRocks, ROCK_KIT, ROCK_NAMES, rockGeometry, rockKitReady, type RockName } from '../src/render/rockModels';
import { patchKeys } from '../src/render/surface';
import { Cell, Ground, type ZoneLayout } from '../src/world/layout';
import { buildProp } from '../src/world/props';
import { buildWorldView, type WorldView } from '../src/world/worldView';
import { KIT_MASSES, kitGeo, kitMass, kitMassPool, kitMassTall, ROCK_STYLE } from '../src/world/worldView/kitRocks';
import { patchGraph } from './patchGraph';
import { loadRockKit } from './rockKitLoad';

type Piece = { closed: boolean };
const load = createRequire(import.meta.url);
const geometry = load('../tools/one-piece-geometry.cjs') as {
  meshNodes: (file: string) => { name: string; tris: Float64Array }[];
  pieces: (meshes: { name: string; tris: Float64Array }[]) => Piece[];
};

/** Each class's triangle budget (they are drawn in their hundreds: scree and the cave walls' slabs most of all). */
const BUDGET: Record<keyof typeof ROCK_KIT, number> = { boulder: 340, stone: 80, slab: 72, mass: 700, cliff: 2600, ore: 1500 };
const classOf = (name: RockName) => (Object.keys(ROCK_KIT) as (keyof typeof ROCK_KIT)[]).find((c) => (ROCK_KIT[c] as readonly string[]).includes(name))!;
const size = (geo: THREE.BufferGeometry) => geo.boundingBox!.getSize(new THREE.Vector3());

/** A lossless WebP's size (its VP8L header), or null for anything else. */
function webpSize(file: string) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP' || b.toString('ascii', 12, 16) !== 'VP8L') return null;
  const bits = b.readUInt32LE(21);
  return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
}

beforeAll(loadRockKit);
afterEach(() => void (ROCK_STYLE.blocks = false));

describe('the rock kit', () => {
  it('holds 15 to 20 boulders and rocks, the five cliff modules and an ore rock for each ore', () => {
    const rocks = ROCK_KIT.boulder.length + ROCK_KIT.stone.length + ROCK_KIT.slab.length + ROCK_KIT.mass.length;
    expect(rocks).toBeGreaterThanOrEqual(15);
    expect(rocks).toBeLessThanOrEqual(20);
    expect([...ROCK_KIT.cliff].sort()).toEqual(['cliff_cap', 'cliff_corner_in', 'cliff_corner_out', 'cliff_straight', 'cliff_tall']);
    expect([...ROCK_KIT.ore].sort()).toEqual(['ore_coal', 'ore_copper', 'ore_emberite', 'ore_iron', 'ore_tin']);
  });

  it('every rock is one closed piece within its budget, with the bake UVs and its lossless baked map', () => {
    for (const name of ROCK_NAMES) {
      const file = `public/models/rock_${name}.glb`, list = geometry.pieces(geometry.meshNodes(file));
      expect(list.length, `${name}: pieces`).toBe(1);
      expect(list[0].closed, `${name}: closed`).toBe(true);
      const geo = rockGeometry(name)!;
      const tris = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      expect(tris, `${name}: triangles`).toBeLessThanOrEqual(BUDGET[classOf(name)]);
      expect(geo.getAttribute('uv'), `${name}: UVs`).toBeDefined();
      const map = webpSize(`public/models/rock_${name}.bake.webp`);
      expect(map, `${name}: lossless WebP map`).not.toBeNull();
      expect(map!.w, name).toBe(map!.h);
      expect([128, 256, 512, 1024], `${name}: map size`).toContain(map!.w);
    }
  });

  it('every rock stands on its foot at the origin (cliff modules face +Z, their backs flat)', () => {
    for (const name of ROCK_NAMES) {
      const b = rockGeometry(name)!.boundingBox!;
      expect(b.min.y, `${name}: foot`).toBeGreaterThan(-0.03);
      expect(b.min.y, `${name}: foot`).toBeLessThan(0.03);
      expect(Math.abs(b.min.x + b.max.x) / 2, `${name}: centred`).toBeLessThan(name.startsWith('cliff') ? 0.8 : 0.3);
    }
  });
});

describe('fitting kit rocks to their places', () => {
  it('a rock is scaled to the size asked, or to a width keeping its own proportions, its foot at y = 0 and centred', () => {
    const fit = kitGeo('slab_b', [1, 1, 1]);
    expect(size(fit).toArray().map((v) => +v.toFixed(5))).toEqual([1, 1, 1]);
    const own = size(rockGeometry('boulder_c')!), wide = kitGeo('boulder_c', null, 1.2), got = size(wide);
    expect(Math.max(got.x, got.z)).toBeCloseTo(1.2, 5);
    expect(got.y / got.x).toBeCloseTo(own.y / own.x, 5);
    for (const geo of [fit, wide]) {
      const b = geo.boundingBox!;
      expect(b.min.y).toBeCloseTo(0, 5);
      expect(b.min.x + b.max.x).toBeCloseTo(0, 5);
      expect(b.min.z + b.max.z).toBeCloseTo(0, 5);
    }
    expect(kitGeo('slab_b', [1, 1, 1]), 'shared, not remade').toBe(fit);
  });

  it('a cliff takes the masses nearest their own proportions in its place, three to vary along it', () => {
    // (The scene keeps a list of placements for each block mass; the kit's masses fill those lists.)
    expect(KIT_MASSES.length).toBeLessThanOrEqual(ROCK_MASSES);
    // (Seated at a place as tall as kitMassTall says, a mass stands in its own proportions, unstretched.)
    KIT_MASSES.forEach((name, v) => {
      const W = 2.3, dr = 0.85, T = kitMassTall(name) * W * Math.sqrt(dr), own = size(rockGeometry(name)!);
      const placed = kitMass(v).boundingBox!.clone().applyMatrix4(new THREE.Matrix4().makeScale(W, T, W * dr)).getSize(new THREE.Vector3());
      expect(placed.y / Math.sqrt(placed.x * placed.z), name).toBeCloseTo(own.y / Math.sqrt(own.x * own.z), 5);
    });
    for (const tall of [0.3, 0.6, 1, 1.6, 3]) {
      const pool = kitMassPool(tall);
      expect(new Set(pool).size, `${tall}`).toBe(3);
      const miss = (v: number) => Math.abs(Math.log(kitMassTall(KIT_MASSES[v]) / tall));
      for (let v = 0; v < KIT_MASSES.length; v++) if (!pool.includes(v)) expect(miss(v), `${tall}: ${KIT_MASSES[v]}`).toBeGreaterThanOrEqual(miss(pool[2]));
    }
    expect(kitMassPool(0.3).map((v) => KIT_MASSES[v])).toContain('mass_low_a');
    expect(kitMassPool(3).map((v) => KIT_MASSES[v])).toContain('spire_a');
    // (Each at the block masses' unit size, its crown 1 over the ground and its flared foot sunk below it.)
    for (let v = 0; v < KIT_MASSES.length; v++) {
      const b = kitMass(v).boundingBox!;
      expect([b.max.x - b.min.x, b.max.y, b.max.z - b.min.z].map((x) => +x.toFixed(5)), KIT_MASSES[v]).toEqual([0.9, 1, 0.8]);
      expect(b.min.y, KIT_MASSES[v]).toBeLessThan(-0.1);
    }
  });
});

/** Zone worlds built once each: with the kit, or (`blocks`) with the old block rocks everywhere. */
const built = new Map<string, { L: ZoneLayout; view: WorldView }>();
function world(id: string, blocks = false) {
  const key = `${id}:${blocks}`;
  let got = built.get(key);
  if (!got) {
    const seed = 1000 + id.length * 97, L = ZONES[id].build(seed);
    ROCK_STYLE.blocks = blocks;
    got = { L, view: buildWorldView(L, ZONES[id].theme, seed + 7) };
    ROCK_STYLE.blocks = false;
    built.set(key, got);
  }
  return got;
}

/** A world's instanced rock, split by paint: the kit's, and the block rocks'. */
function rockOf(view: WorldView) {
  const kit: THREE.InstancedMesh[] = [], block: THREE.InstancedMesh[] = [];
  view.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    const keys = patchKeys(o.material as THREE.Material);
    if (keys.some((k) => k.startsWith('rockkit'))) kit.push(o);
    else if (keys.some((k) => k.startsWith('rock:'))) block.push(o);
  });
  return { kit, block };
}

/** How much cliff face the masses among `meshes` cover: each placement's width by its height over the ground, in m2. */
function faceOf(meshes: THREE.InstancedMesh[], masses: Set<THREE.BufferGeometry>) {
  const m = new THREE.Matrix4(), s = new THREE.Vector3();
  let face = 0;
  for (const o of meshes) {
    if (!masses.has(o.geometry)) continue;
    o.geometry.computeBoundingBox();
    const unit = size(o.geometry), top = o.geometry.boundingBox!.max.y;
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, m);
      s.setFromMatrixScale(m);
      face += s.x * unit.x * s.y * top;
    }
  }
  return face;
}

describe('rock in the world', () => {
  it('the zones draw their rock from the kit', () => {
    for (const id of ['foothills', 'mine', 'lair']) {
      const { kit, block } = rockOf(world(id).view);
      expect(kit.length, `${id}: kit rock`).toBeGreaterThan(0);
      expect(block.length, `${id}: block rock left`).toBe(0);
    }
  }, 60000);

  it('the castle island keeps its own block rock, placed just as with the kit switched off', () => {
    const digest = (view: WorldView) => {
      const { kit, block } = rockOf(view), m = new THREE.Matrix4();
      expect(kit.length, 'kit rock round the castle').toBe(0);
      return block.map((o) => {
        let sum = 0;
        for (let k = 0; k < o.count; k++) sum += o.getMatrixAt(k, m).elements.reduce((a, x) => a + x, 0);
        return `${o.geometry.getAttribute('position').count} ${o.count} ${sum.toFixed(3)}`;
      });
    };
    const now = digest(world('keep').view);
    expect(now.length).toBeGreaterThan(0);
    expect(now).toEqual(digest(world('keep', true).view));
  }, 60000);

  it('the kit masses dress the Foothills cliffs about as fully as the block masses did, and never rise through a path', () => {
    const { L, view } = world('foothills');
    const kitMasses = new Set(KIT_MASSES.map((_, v) => kitMass(v)));
    const blockMasses = new Set(Array.from({ length: ROCK_MASSES }, (_, v) => rockMass(v)));
    const kitFace = faceOf(rockOf(view).kit, kitMasses), blockFace = faceOf(rockOf(world('foothills', true).view).block, blockMasses);
    expect(kitFace, `kit ${kitFace.toFixed(0)} m2 against the blocks' ${blockFace.toFixed(0)}`).toBeGreaterThan(blockFace * 0.9);
    const m = new THREE.Matrix4(), box = new THREE.Box3(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), bad: string[] = [];
    for (const o of rockOf(view).kit) {
      if (!kitMasses.has(o.geometry)) continue;
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m);
        box.copy(o.geometry.boundingBox!).applyMatrix4(m);
        const mesh = new THREE.Mesh(o.geometry);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(m);
        mesh.matrixWorld.copy(m);
        for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++) for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++) {
          const i = z * L.w + x;
          if (L.cells[i] !== Cell.Ground || L.fluid[i] || (L.ground[i] !== Ground.Path && L.ground[i] !== Ground.Stone)) continue;
          ray.set(new THREE.Vector3(x + 0.5, box.max.y + 1, z + 0.5), down);
          const hit = ray.intersectObject(mesh, false)[0], fl = view.floorAt(x + 0.5, z + 0.5);
          if (hit && hit.point.y > fl + 0.05) bad.push(`mass rises ${(hit.point.y - fl).toFixed(2)} over the path at (${x}, ${z})`);
        }
      }
    }
    expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
  }, 60000);
});

describe('the rock paint', () => {
  it('rocks of one paint share one program: the baked map is read off the material, the painted layers bound in', () => {
    const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial(), bare = new THREE.MeshStandardMaterial();
    applyKitRock(a, 'boulder_a', { moss: 0.5 });
    applyKitRock(b, 'mass_d', { moss: 0.3 });
    expect(patchKeys(a)).toEqual(['rockkit']);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const g = patchGraph(a);
    for (const hook of ['color', 'normal', 'roughness', 'ao'] as const) expect(g.hooks.has(hook), hook).toBe(true);
    expect(g.textures.size).toBe(2);
    // (A zone with no moss draws its rock without reading the moss at all.)
    applyKitRock(bare, 'slab_a', { moss: 0 });
    expect(patchKeys(bare)).toEqual(['rockkit:bare']);
    expect(patchGraph(bare).textures.size).toBe(1);
  });

  it('the painted layers are the sizes the game reads them at, and listed with their sources', () => {
    for (const [file, n] of [['rock', 512], ['moss', 256]] as const) {
      const png = readFileSync(`public/textures/rock/${file}.png`);
      expect(png.readUInt32BE(16), file).toBe(n);
      expect(png.readUInt32BE(20), file).toBe(n);
    }
    const licences = readFileSync('public/textures/rock/LICENSES.md', 'utf8');
    for (const file of ['rock.png', 'moss.png']) expect(licences, file).toContain(`\`${file}\``);
  });
});

describe('ore rocks', () => {
  const ORES = ['copper', 'tin', 'iron', 'coal', 'emberite'];
  type Veins = { uRkOre: { value: number }; uRkVein: { value: THREE.Color }; uRkGlint: { value: THREE.Color }; uRkGlow: { value: number } };
  const oreRock = (ore: string) => {
    const p = buildProp(`rock_${ore}`), rock = p.obj.getObjectByName('ore_rock') as THREE.Mesh;
    return { p, rock, mat: rock?.material as THREE.Material, veins: (rock?.material as THREE.Material)?.userData.rockKit as Veins };
  };

  it('each ore is its own kit rock about two units across, its veins painted in, gone dull when mined', () => {
    for (const ore of ORES) {
      const { p, rock, veins } = oreRock(ore);
      expect(rock, ore).toBeDefined();
      expect(rock.geometry).toBe(rockGeometry(`ore_${ore}` as RockName));
      const across = new THREE.Box3().setFromObject(p.obj).getSize(new THREE.Vector3());
      expect(Math.max(across.x, across.z), ore).toBeGreaterThan(1.6);
      expect(Math.max(across.x, across.z), ore).toBeLessThan(2.4);
      expect(veins.uRkOre.value, ore).toBe(1);
      p.setState!('depleted');
      expect(veins.uRkOre.value, `${ore} mined`).toBe(0);
      p.setState!('full');
      expect(veins.uRkOre.value, `${ore} grown back`).toBe(1);
    }
  });

  it('each ore reads by its own vein colour; emberite glows in its veins, and the metals glint', () => {
    const rocks = Object.fromEntries(ORES.map((ore) => [ore, oreRock(ore)]));
    expect(new Set(ORES.map((ore) => rocks[ore].veins.uRkVein.value.getHex())).size).toBe(ORES.length);
    expect(patchGraph(rocks.emberite.mat).hooks.has('emissive')).toBe(true);
    expect(rocks.emberite.veins.uRkGlow.value).toBeGreaterThan(1);
    for (const ore of ['copper', 'tin', 'iron']) {
      expect(rocks[ore].veins.uRkGlint.value.getHex(), ore).not.toBe(0);
      expect(rocks[ore].veins.uRkGlow.value, ore).toBe(0);
    }
  });
});

describe('a rock kit that will not load', () => {
  it('stands down whole: the worlds keep the old block rocks, never a half-painted kit', async () => {
    // (Tests have no server to fetch the kit from, so every part fails here.)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await preloadRocks();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(rockKitReady()).toBe(false);
    const seed = 1000 + 'mine'.length * 97, { kit, block } = rockOf(buildWorldView(ZONES.mine.build(seed), ZONES.mine.theme, seed + 7));
    expect(kit.length).toBe(0);
    expect(block.length).toBeGreaterThan(0);
    await loadRockKit();
  }, 60000);
});
