import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import type { ZoneTheme } from '../../data/zones';
import { Cell, type ZoneLayout } from '../layout';
import { smoothNoise, type Terrain } from '../terrain';
import { hash01, MOSS_TALL, ROCK_MASSES } from '../../render/blocks';
import { DEFAULT_WOODS, GROWN, GROWN_KINDS, pickGrown, treeSet, type GrownKind, type TreeKind } from '../trees';
import { instancer } from './materials';

/** Instances of one kind of scenery: their transforms and colours. */
interface Instances {
  m: THREE.Matrix4[];
  c: THREE.Color[];
}

/** Everything a zone's scenery passes need: its layout, theme and terrain, the shared random stream, and where trees go. */
export type Scene = ReturnType<typeof createScene>['scene'];

/**
 * The scenery's shared state. Every pass draws from the one random stream `rng` in a fixed order, so
 * the same seed lays out the same scenery every visit.
 */
export function createScene(layout: ZoneLayout, theme: ZoneTheme, seed: number, group: THREE.Group, terrain: Terrain) {
  const rng = mulberry32(seed);
  const { w, h } = layout;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? Cell.Void : layout.cells[z * w + x]);
  const heightAt = terrain.heightAt, floorAt = terrain.floorAt;
  // (Scratch transform parts every placement composes its matrix from.)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();

  // ─── Trees ────────────────────────────────────────────────────────────────
  // Foliage is flat-shaded facets, painted albedo and per-instance colour; undersides sit in shade.
  // The tree models come from the active style (trees.ts).
  const ts = treeSet();
  // (Round the castle the turning conifers go gold, never rust, so no red fights its blue and gold.)
  const leafPal: Record<TreeKind, number[]> = {
    pine: theme.wall === 'castle' ? [0x3f6b34, 0x4b7a3a, 0x355c2e, 0x7a6a2a, 0xa07e2e] : [0x3f6b34, 0x4b7a3a, 0x355c2e, 0x7a6a2a, 0x8a4a2a],
    grove: [0x5a9a44, 0x6aa84a, 0x4a8a3c, 0xc8a040, 0xb86a8a],
    ash: [0x2a2420, 0x3a3028, 0x1e1a18],
  };
  // Species mix: patches of each kind (noise), weighted by the theme.
  const mix: Partial<Record<TreeKind, number>> = theme.forest ?? { [theme.trees]: 1 };
  const kinds = (Object.keys(mix) as TreeKind[]).filter((k) => (mix[k] ?? 0) > 0);
  const totalW = kinds.reduce((a, k) => a + (mix[k] ?? 0), 0);
  const speciesNoise = smoothNoise(seed + 71);
  const speciesAt = (x: number, z: number): TreeKind => {
    let v = speciesNoise(x * 0.06, z * 0.06) * 0.8 + rng() * 0.2;
    for (const k of kinds) {
      v -= (mix[k] ?? 0) / totalW;
      if (v <= 0) return k;
    }
    return kinds[kinds.length - 1];
  };
  const trees: Record<TreeKind, Instances> = { pine: { m: [], c: [] }, grove: { m: [], c: [] }, ash: { m: [], c: [] } };
  // The natural style: the zone's woods say which grown species stands in for each kind, in groves
  // (a smooth noise picks them), waterside ones by the water (never by lava).
  const woods = ts.natural ? theme.woods ?? DEFAULT_WOODS : null;
  const grown = {} as Record<GrownKind, Instances>;
  for (const g of GROWN_KINDS) grown[g] = { m: [], c: [] };
  const groveNoise = smoothNoise(seed + 101);
  const wet = (x: number, z: number) => {
    if (theme.lava) return false;
    for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
      if (cx >= 0 && cz >= 0 && cx < w && cz < h && layout.fluid[cz * w + cx]) return true;
    }
    return false;
  };
  const grownAt = (x: number, z: number, kind: TreeKind) => {
    const weights = woods?.kinds[kind];
    return weights ? pickGrown(weights, (groveNoise(x * 0.05, z * 0.05) * 4 + hash01(x, z, 13) * 0.3) % 1, wet(x, z)) : null;
  };
  /** A tree at (x, z) (on the ground, or standing at `y`); with `keep` false its draws are made but it is left out. */
  const addTree = (x: number, z: number, scale = 1, y?: number, kind = speciesAt(x, z), keep = true) => {
    // (Grown trees vary less in size: they are true to size. So does a grown dead ash.)
    const g = grownAt(x, z, kind), look = g ? GROWN[g].look : kind === 'ash' ? ts.grown?.ash.look : undefined, [lo, hi] = look?.size ?? [0.8, 1.4];
    const sc = (lo + rng() * (hi - lo)) * scale;
    if (y === undefined) p.set(x + (rng() - 0.5) * 0.3, heightAt(x, z) - 0.05, z + (rng() - 0.5) * 0.3);
    else p.set(x, y - 0.05, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.1, rng() * Math.PI * 2, (rng() - 0.5) * 0.1));
    const tall = rng();
    s.set(sc, sc * (look ? 0.96 + tall * 0.08 : 0.9 + tall * 0.3), sc);
    const mm = m.compose(p, q, s).clone();
    const pal = (g && look && woods?.autumn?.includes(g) ? look.autumn : undefined) ?? look?.palette ?? leafPal[kind];
    const tc = new THREE.Color(pal[rng() < 0.15 ? Math.min(pal.length - 1, 3 + Math.floor(rng() * 2)) : Math.floor(rng() * Math.min(3, pal.length))]);
    tc.offsetHSL(0, 0, (rng() - 0.5) * 0.05);
    if (!keep) return;
    const into = g ? grown[g] : trees[kind];
    into.m.push(mm);
    into.c.push(tc);
  };

  // Loose rocks take the zone's own stone (basalt in the lair, blue-grey in the ruin), not one grey.
  const rockBase = theme.cliff ? new THREE.Color(theme.cliff[0]).lerp(new THREE.Color(0x8a8478), 0.35) : new THREE.Color(0x8a8478);
  const walkable = (x: number, z: number) => {
    const n = at(x, z);
    return n === Cell.Ground || n === Cell.Blocked;
  };
  const nearWalkable = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (walkable(x + dx, z + dz)) return true;
    return false;
  };

  const scene = { layout, theme, seed, rng, w, h, at, terrain, heightAt, floorAt, group, m, q, s, p, e, inst: instancer(group), walkable, nearWalkable, leafPal, rockBase, addTree, ts, woods };
  return { scene, sets: scatter(trees, grown) };
}

/** Scenery is gathered here by the passes, then drawn as instanced meshes (draw.ts). */
export type Scatter = ReturnType<typeof scatter>;

function scatter(trees: Record<TreeKind, Instances>, grown: Record<GrownKind, Instances>) {
  const list = () => [] as THREE.Matrix4[], cols = () => [] as THREE.Color[];
  return {
    trees, grown,
    rocks: list(), rockCols: cols(),
    rims: list(), rimCols: cols(),
    walls: list(), wallCols: cols(),
    under: list(), underCols: cols(),
    bushes: list(), bushCols: cols(),
    flowers: list(), flowerCols: cols(),
    reeds: list(),
    // Cave walls: stacked strata at their foot, the odd dark crevice, bigger slabs climbing behind.
    strata: list(), strataCols: cols(),
    crevices: list(),
    // Loose rock on cave and caldera floors, and scree under the outdoor cliffs.
    debris: list(), debrisCols: cols(),
    mass: list(), massCols: cols(),
    // The outdoor rock masses by variant, their moss by variant and by how tall they stand.
    rockMasses: Array.from({ length: ROCK_MASSES }, list), rockMassCols: Array.from({ length: ROCK_MASSES }, cols),
    mossMats: Array.from({ length: ROCK_MASSES }, () => MOSS_TALL.map(list)), mossCols: Array.from({ length: ROCK_MASSES }, () => MOSS_TALL.map(cols)),
    ferns: list(), fernCols: cols(),
    ledgeTufts: list(), ledgeTuftCols: cols(),
    cushions: list(), cushionCols: cols(),
  };
}

/** The island's underside in its own rock (the cliff's darker tone), never a dead brown-black. */
export function underTones(theme: ZoneTheme) {
  return [new THREE.Color(theme.cliff?.[1] ?? 0x5e544a).multiplyScalar(0.85), new THREE.Color(theme.cliff?.[0] ?? 0x7a6e62).multiplyScalar(0.8)];
}
