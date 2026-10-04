import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { chamferBox, octagon, prism, rockBlock, slabBlock, taper, wedge } from '../src/render/blocks';
import { rockAtlas } from '../src/render/rock';
import { applyPaint, paintAtlas, PAINTS, type PaintKind } from '../src/render/paint';
import { patchKeys } from '../src/render/surface';
import { patchGraph } from './patchGraph';
import { ZONES } from '../src/data/zones';
import { Cell, Ground, type ZoneLayout } from '../src/world/layout';
import { raisedAt } from '../src/world/building';
import { ASHLAR, buildProp, propKinds, spread } from '../src/world/props';

const finite = (geo: THREE.BufferGeometry) => {
  for (const name of ['position', 'normal']) {
    const a = geo.getAttribute(name).array as ArrayLike<number>;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  }
  return true;
};

/** Each zone's layout at its standard seed. Generating them takes seconds, and the tests here only read them,
 *  so each is generated once and shared (rebuilding them per test once ran tests past the 5 s timeout). */
const ZONE_IDS = ['keep', 'mine', 'foothills', 'ruin', 'lair'];
const layouts = new Map<string, ZoneLayout>();
const build = (id: string) => {
  let L = layouts.get(id);
  if (!L) layouts.set(id, (L = ZONES[id].build(1000 + id.length * 97)));
  return L;
};
beforeAll(() => ZONE_IDS.forEach(build), 60_000);

describe('block shapes', () => {
  it('every shape is a closed, flat-shaded hull with finite normals', () => {
    for (const geo of [chamferBox(1, 0.5, 0.8, 0.1), chamferBox(0.1, 2, 0.1, 0.3), wedge(2, 1, 1.5), wedge(2, 1, 1.5, 0.1), taper(1, 1, 0.01, 0.01, 2), rockBlock(3, 1.2, 0.8, 1), prism(0.3, 1), octagon(0.3, 0.05)]) {
      expect(finite(geo)).toBe(true);
      geo.computeBoundingBox();
      expect(geo.boundingBox!.isEmpty()).toBe(false);
    }
  });
  it('a chamfered box keeps its outer size', () => {
    const g = chamferBox(1.2, 0.6, 0.9, 0.08);
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(1.2);
    expect(s.y).toBeCloseTo(0.6);
    expect(s.z).toBeCloseTo(0.9);
  });
});

describe('world props', () => {
  it('runs of merlons and plants are spread evenly, the same distance in from both ends', () => {
    for (const [L, step, clear] of [[10, 1.4, 0.75], [6.2, 1.45, 0.55], [3.2, 0.3, 0.25]]) {
      const u = spread(L, step, clear);
      expect(u[0]).toBeCloseTo(-L / 2 + clear);
      expect(u.at(-1)!).toBeCloseTo(L / 2 - clear);
      for (let i = 1; i < u.length; i++) expect(u[i] - u[i - 1]).toBeCloseTo(u[1] - u[0]);
    }
    expect(spread(1, 1, 0.8)).toEqual([]);
  });
  it('round towers are laid in the dressed stone, flat-shaded stone by stone (never a smooth drum)', () => {
    const keys = new Set<string>();
    let smooth = 0;
    buildProp('round_tower', { len: 3.2, v: 9 }).obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      patchKeys(o.material as THREE.Material).forEach((k) => keys.add(k));
      if (o.material instanceof THREE.MeshStandardMaterial && o.material.color.getHex() === ASHLAR && !o.material.flatShading) smooth++;
    });
    expect([...keys]).toContain('paint:object:ashlar:fit');
    expect(smooth).toBe(0);
  });
  it('every prop builds with finite geometry and no bumped materials', () => {
    for (const kind of [...propKinds(), 'portal', 'rock_copper', 'rock_tin', 'rock_iron', 'rock_coal', 'rock_emberite']) {
      const p = buildProp(kind, kind === 'portal' ? 0xff6a2a : undefined);
      let meshes = 0;
      p.obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        meshes++;
        expect(finite(o.geometry), `${kind} geometry`).toBe(true);
        const keys = patchKeys(o.material as THREE.Material);
        expect(keys.some((k) => k.startsWith('surface:')), `${kind} uses the old bump surface`).toBe(false);
      });
      expect(meshes, kind).toBeGreaterThan(0);
    }
  });
  it('no glowing crack props remain, and bones do not glow', () => {
    expect(propKinds()).not.toContain('crack');
    buildProp('bones', 2).obj.traverse((o) => {
      if (o instanceof THREE.Mesh) expect((o.material as THREE.MeshStandardMaterial).emissiveIntensity * (o.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
    });
    for (const id of ZONE_IDS) {
      const L = build(id);
      expect(L.props.some((p) => p.kind === 'crack')).toBe(false);
    }
  });
  it('a dormant portal is an unlit platform; a lit one projects the portal effect', () => {
    const dark = buildProp('portal', null), lit = buildProp('portal', 0x6ad0c0);
    expect(dark.light).toBeUndefined();
    expect(dark.obj.getObjectByName('portal-fx')).toBeUndefined();
    expect(lit.obj.getObjectByName('portal-fx')).toBeDefined();
  });
});

describe('painted albedo', () => {
  for (const kind of Object.keys(PAINTS) as PaintKind[]) {
    it(`${kind}: seamless and calm, with real contrast`, () => {
      const p = PAINTS[kind];
      const img = paintAtlas(p.atlas).image as { data: Uint8Array; width: number };
      const n = img.width, c = p.channel;
      const at = (x: number, y: number) => img.data[(y * n + x) * 4 + c];
      let wrap = 0, inner = 0, min = 255, max = 0;
      for (let y = 0; y < n; y++) {
        wrap += Math.abs(at(n - 1, y) - at(0, y)) + Math.abs(at(y, n - 1) - at(y, 0));
        inner += Math.abs(at(n / 2 - 1, y) - at(n / 2, y)) + Math.abs(at(y, n / 2 - 1) - at(y, n / 2));
        for (let x = 0; x < n; x++) {
          min = Math.min(min, at(x, y));
          max = Math.max(max, at(x, y));
        }
      }
      // The wrap-around seam is no harsher than an ordinary step inside the tile.
      expect(wrap / (2 * n), 'seam').toBeLessThan(inner / (2 * n) * 1.6 + 3);
      expect(max - min, 'contrast').toBeGreaterThan(40);
      // Foliage paints strongest (leaf clumps must read from the gameplay camera); still calm.
      expect(p.amount, 'calm').toBeLessThanOrEqual(0.5);
    });
  }
  it('paint replaces any surface patch in the same slot and keeps V up on side faces', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyPaint(mat, 'masonry', 'world');
    applyPaint(mat, 'wood', 'object');
    expect(patchKeys(mat)).toEqual(['paint:object']);
    // Colour only: the paint leaves the normal alone (only dressed stone carries relief).
    const g = patchGraph(mat);
    expect(g.hooks.has('color')).toBe(true);
    expect(g.hooks.has('normal')).toBe(false);
    expect(g.textures).toContain(paintAtlas(PAINTS.wood.atlas));
  });
});

describe('painted rock', () => {
  it('rock paint is the shared triplanar rock (strata, cracks, grain), colour only', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyPaint(mat, 'rock', 'world');
    expect(patchKeys(mat)).toEqual(['rock:world']);
    const g = patchGraph(mat);
    expect(g.hooks.has('color')).toBe(true);
    expect(g.hooks.has('normal')).toBe(false);
    expect([...g.textures]).toEqual([rockAtlas()]);
  });
  it('code-built rock props (boulders, rubble, ore rocks) are painted as rock', () => {
    for (const kind of ['boulder', 'rubble', 'rock_copper']) {
      const keys = new Set<string>();
      buildProp(kind).obj.traverse((o) => {
        if (o instanceof THREE.Mesh) patchKeys(o.material as THREE.Material).forEach((k) => keys.add(k));
      });
      expect([...keys].some((k) => k.startsWith('rock:')), kind).toBe(true);
    }
  });
  it('the rock atlas is seamless with real contrast in every channel', () => {
    const img = rockAtlas().image as { data: Uint8Array; width: number };
    const n = img.width;
    for (let c = 0; c < 4; c++) {
      const at = (x: number, y: number) => img.data[(y * n + x) * 4 + c];
      let wrap = 0, inner = 0, min = 255, max = 0;
      for (let y = 0; y < n; y++) {
        wrap += Math.abs(at(n - 1, y) - at(0, y)) + Math.abs(at(y, n - 1) - at(y, 0));
        inner += Math.abs(at(n / 2 - 1, y) - at(n / 2, y)) + Math.abs(at(y, n / 2 - 1) - at(y, n / 2));
        for (let x = 0; x < n; x++) {
          min = Math.min(min, at(x, y));
          max = Math.max(max, at(x, y));
        }
      }
      expect(wrap / (2 * n), `seam ${c}`).toBeLessThan((inner / (2 * n)) * 1.6 + 4);
      expect(max - min, `contrast ${c}`).toBeGreaterThan(80);
    }
  });
  it('strata slabs have a flat top and vertical sides (no big diagonal facets from above)', () => {
    const g = slabBlock(31);
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    let top = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.999) top++;
      // Every face is the top, the bottom, a narrow bevel or a vertical side.
      const ny = Math.abs(nrm.getY(i));
      expect(ny < 0.02 || ny > 0.98 || pos.getY(i) > 0.9, `face normal ${ny}`).toBe(true);
    }
    expect(top).toBeGreaterThan(0);
  });
  it('mine puddles are soft-edged shallow water, not a hard disc', () => {
    const p = buildProp('puddle', 0);
    const water = p.obj.getObjectByName('puddle-water') as THREE.Mesh;
    expect(water).toBeDefined();
    const mat = water.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.roughness).toBeLessThan(0.2);
    const col = water.geometry.getAttribute('color');
    expect(col.itemSize).toBe(4);
    let zero = 0, solid = 0;
    for (let i = 0; i < col.count; i++) {
      if (col.getW(i) === 0) zero++;
      if (col.getW(i) > 0.5) solid++;
    }
    expect(zero).toBeGreaterThan(0);
    expect(solid).toBeGreaterThan(0);
  });
});

describe('zones', () => {
  it('the Foothills are called Wyrmwood Foothills; their id is unchanged', () => {
    expect(ZONES.foothills.id).toBe('foothills');
    expect(ZONES.foothills.name).toBe('Wyrmwood Foothills');
  });
  it('the goblin palisades stand on dry ground', () => {
    const L = build('foothills');
    for (const p of L.props.filter((q) => q.kind === 'palisade')) {
      const half = (p.len ?? 6) / 2, c = Math.cos(p.rot ?? 0), s = Math.sin(p.rot ?? 0);
      for (let t = -half; t <= half; t += 0.5) {
        const x = Math.floor(p.x + c * t), z = Math.floor(p.z - s * t);
        expect(L.fluid[z * L.w + x], `palisade at ${p.x},${p.z}`).toBe(0);
      }
    }
  });
  const walk = (L: ReturnType<typeof build>, x: number, z: number) => x >= 0 && z >= 0 && x < L.w && z < L.h && L.cells[z * L.w + x] === Cell.Ground;
  it('mine, ruin and lair layouts are not mirror-symmetric', () => {
    for (const id of ['mine', 'ruin', 'lair']) {
      const L = build(id);
      // (The lair is judged on its caldera half: the badlands below are open ground either way.)
      const zMax = id === 'lair' ? 64 : L.h;
      let both = 0, either = 0;
      for (let z = 0; z < zMax; z++) for (let x = 0; x < L.w; x++) {
        const a = walk(L, x, z), b = walk(L, L.w - 1 - x, z);
        if (a && b) both++;
        if (a || b) either++;
      }
      expect(both / either, id).toBeLessThan(0.6);
    }
  });
  it('the drowned city is built from a few bold wall pieces, not per-cell masonry stacks', () => {
    const L = build('ruin');
    expect(L.cells.some((c) => c === Cell.Wall)).toBe(false);
    const walls = L.props.filter((p) => p.kind === 'ruin_wall');
    expect(walls.length).toBeGreaterThan(20);
    for (const p of walls) expect(p.len ?? 0).toBeGreaterThanOrEqual(1.6);
    // Every wall piece builds with only a handful of blocks.
    for (const p of walls.slice(0, 12)) {
      let n = 0;
      buildProp('ruin_wall', { len: p.len, v: p.v }).obj.traverse((o) => (n += o instanceof THREE.Mesh ? 1 : 0));
      expect(n).toBeLessThan(20);
    }
    // The temple, the market fountain and the broken causeways are all there.
    for (const kind of ['temple_dais', 'fountain_ruin', 'sunken_slabs']) expect(L.props.some((p) => p.kind === kind), kind).toBe(true);
  });
  it('the Foothills shrine is composed: a dais, its processional way, obelisks, braziers and banners', () => {
    const L = build('foothills');
    const dais = L.props.find((p) => p.kind === 'ritual_dais')!;
    expect(dais).toBeDefined();
    const near = (kind: string) => L.props.filter((p) => p.kind === kind && Math.hypot(p.x - dais.x, p.z - dais.z) < 30);
    const obelisks = near('obelisk');
    expect(obelisks.length).toBe(4);
    expect(new Set(obelisks.map((o) => o.len))).toEqual(new Set([0, 1, 2]));
    expect(near('brazier').length).toBe(2);
    expect(near('cult_banner').length).toBe(4);
    // The way in is paved, and the cultists stand on it.
    expect(L.ground[Math.floor(dais.z) * L.w + Math.floor(dais.x + 8)]).toBe(Ground.Stone);
    expect(L.packs.some((p) => p.comp.includes('cultist') && Math.hypot(p.x - dais.x, p.z - dais.z) < 15)).toBe(true);
  });
  it('the Foothills rim is organic: the open land does not stop along a straight line', () => {
    const L = build('foothills');
    const firstOpen: number[] = [];
    for (let z = 40; z < L.h - 40; z += 2) {
      let x = 0;
      while (x < L.w && !walk(L, x, z)) x++;
      firstOpen.push(x);
    }
    const mean = firstOpen.reduce((a, b) => a + b, 0) / firstOpen.length;
    const sd = Math.sqrt(firstOpen.reduce((a, b) => a + (b - mean) ** 2, 0) / firstOpen.length);
    expect(sd).toBeGreaterThan(2);
    // Terraced relief: the rim climbs in more than one step.
    const heights = new Set<number>();
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] === Cell.Cliff) heights.add(Math.round(L.elev[i]));
    expect(heights.size).toBeGreaterThanOrEqual(3);
  });
  it('mine ore runs in veins along the cavern walls, every metal well stocked', () => {
    const L = build('mine');
    const count: Record<string, number> = {};
    for (const n of L.nodes) {
      count[n.ore] = (count[n.ore] ?? 0) + 1;
      let wall = Infinity;
      for (let z = Math.floor(n.z - 5); z <= n.z + 5; z++) for (let x = Math.floor(n.x - 5); x <= n.x + 5; x++) {
        if (L.cells[z * L.w + x] === Cell.Wall) wall = Math.min(wall, Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z));
      }
      expect(wall, `${n.ore} at ${n.x},${n.z}`).toBeLessThan(4.5);
      // A vein: another ore rock within a few steps (copper and tin share veins).
      expect(L.nodes.some((m) => m !== n && Math.hypot(m.x - n.x, m.z - n.z) < 6.5), `${n.ore} at ${n.x},${n.z}`).toBe(true);
    }
    for (const ore of ['copper', 'tin', 'iron']) expect(count[ore], ore).toBeGreaterThanOrEqual(8);
    expect(count.coal).toBeGreaterThanOrEqual(7);
  });
  it('the caldera floor is irregular, with room to fight round the roost', () => {
    const L = build('lair');
    const b = L.boss!;
    expect(walk(L, Math.floor(b.x), Math.floor(b.z))).toBe(true);
    // Most of the fighting circle is open floor.
    let open = 0, all = 0;
    for (let z = Math.floor(b.z - b.r); z <= b.z + b.r; z++) for (let x = Math.floor(b.x - b.r); x <= b.x + b.r; x++) {
      if (Math.hypot(x + 0.5 - b.x, z + 2.5 - b.z - 2) > b.r - 4) continue;
      all++;
      if (L.cells[z * L.w + x] !== Cell.Cliff) open++;
    }
    expect(open / all).toBeGreaterThan(0.75);
    // Not a round bowl: how far the floor reaches from the roost varies a lot by direction.
    const reach = Array.from({ length: 16 }, (_, k) => {
      const a = (k / 16) * Math.PI * 2;
      let r = 0;
      while (r < 40 && L.cells[Math.floor(b.z + Math.sin(a) * r) * L.w + Math.floor(b.x + Math.cos(a) * r)] !== Cell.Cliff) r += 0.5;
      return r;
    });
    expect(Math.max(...reach) - Math.min(...reach)).toBeGreaterThan(6);
  });
  /** Walkable cells reachable from the entry (4-connected). */
  const reachable = (L: ReturnType<typeof build>) => {
    const seen = new Uint8Array(L.w * L.h), q = [Math.floor(L.entry.z) * L.w + Math.floor(L.entry.x)];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop()!, x = i % L.w, z = (i - x) / L.w;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (z + dz) * L.w + x + dx;
        if (walk(L, x + dx, z + dz) && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    return seen;
  };
  it('every pack, ore rock and station can be reached from the entry', () => {
    for (const id of ZONE_IDS) {
      const L = build(id), seen = reachable(L);
      const near = (t: { x: number; z: number }) => {
        for (let z = Math.floor(t.z - 2.5); z <= t.z + 2.5; z++) for (let x = Math.floor(t.x - 2.5); x <= t.x + 2.5; x++) {
          if (x >= 0 && z >= 0 && x < L.w && z < L.h && seen[z * L.w + x] && Math.hypot(x + 0.5 - t.x, z + 0.5 - t.z) <= 2.6) return true;
        }
        return false;
      };
      for (const p of L.packs) expect(near(p), `${id} pack at ${p.x},${p.z}`).toBe(true);
      for (const n of L.nodes) expect(near(n), `${id} ${n.ore} at ${n.x},${n.z}`).toBe(true);
      for (const s of L.stations) expect(near(s), `${id} ${s.kind} ${s.id}`).toBe(true);
      if (L.boss) expect(near(L.boss), `${id} boss`).toBe(true);
    }
  });
  /** How much of the walkable cells' bounding box (within rows z0..z1) is walkable, and how the west edge wanders. */
  const outline = (L: ReturnType<typeof build>, z0: number, z1: number) => {
    let x0 = L.w, x1 = 0, open = 0;
    const firstOpen: number[] = [];
    for (let z = z0; z < z1; z++) {
      let first = -1;
      for (let x = 0; x < L.w; x++) if (walk(L, x, z)) {
        open++;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        if (first < 0) first = x;
      }
      if (first >= 0) firstOpen.push(first);
    }
    const mean = firstOpen.reduce((a, b) => a + b, 0) / firstOpen.length;
    const sd = Math.sqrt(firstOpen.reduce((a, b) => a + (b - mean) ** 2, 0) / firstOpen.length);
    return { fill: open / ((x1 - x0 + 1) * (z1 - z0)), sd };
  };
  it('the lair badlands are an organic chain of lobes, not a rectangle', () => {
    const L = build('lair');
    const { fill, sd } = outline(L, 64, 120);
    expect(fill, 'fill of the bounding box').toBeLessThan(0.55);
    expect(sd, 'west edge wander').toBeGreaterThan(4);
    // The ravine up to the caldera stays open and lit by its ember vents.
    expect(L.props.filter((p) => p.kind === 'ember_vent').length).toBeGreaterThanOrEqual(3);
  });
  it('the Foothills meadow sits in a rocky rim: bare rock terraces and outcrops, not a square of trees', () => {
    const L = build('foothills');
    const { fill } = outline(L, 30, L.h - 10);
    expect(fill, 'fill of the bounding box').toBeLessThan(0.72);
    let rockTop = 0;
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] === Cell.Cliff && L.ground[i] === Ground.Cave) rockTop++;
    expect(rockTop, 'bare rock terraces').toBeGreaterThan(2000);
    // Bare ground only where it means something: far less of the meadow is dirt than grass.
    let dirt = 0, grass = 0;
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] === Cell.Ground) {
      if (L.ground[i] === Ground.Dirt) dirt++;
      if (L.ground[i] === Ground.Grass) grass++;
    }
    expect(dirt / grass).toBeLessThan(0.08);
  });
  it('the Foothills end along an organic outline far beyond sight of anywhere the hero walks', () => {
    const L = build('foothills');
    const at = (x: number, z: number) => L.cells[z * L.w + x];
    // Nothing but void at the map's own edge: the rectangle is never part of the land.
    for (let x = 0; x < L.w; x++) expect(at(x, 0) === Cell.Void && at(x, L.h - 1) === Cell.Void).toBe(true);
    for (let z = 0; z < L.h; z++) expect(at(0, z) === Cell.Void && at(L.w - 1, z) === Cell.Void).toBe(true);
    // The landmass's outline wanders: how far in the land starts varies along every side.
    const wander = (vals: number[]) => {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
    };
    const west: number[] = [], south: number[] = [];
    for (let z = 20; z < L.h - 20; z += 2) {
      let x = 0;
      while (x < L.w && at(x, z) === Cell.Void) x++;
      west.push(x);
    }
    for (let x = 20; x < L.w - 20; x += 2) {
      let z = L.h - 1;
      while (z > 0 && at(x, z) === Cell.Void) z--;
      south.push(z);
    }
    expect(wander(west), 'west outline').toBeGreaterThan(2.5);
    expect(wander(south), 'south outline').toBeGreaterThan(2.5);
    // From every walkable cell the void is out of the camera's sight (over 20 cells away), and
    // every walkable cell has room on the south (camera) side.
    const voids: [number, number][] = [];
    for (let z = 0; z < L.h; z += 1) for (let x = 0; x < L.w; x += 1) if (at(x, z) === Cell.Void) {
      const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => x + dx >= 0 && z + dz >= 0 && x + dx < L.w && z + dz < L.h && at(x + dx, z + dz) !== Cell.Void);
      if (inner) voids.push([x, z]);
    }
    for (let z = 0; z < L.h; z += 3) for (let x = 0; x < L.w; x += 3) {
      if (at(x, z) !== Cell.Ground) continue;
      const near = voids.reduce((d, [vx, vz]) => Math.min(d, Math.hypot(vx - x, vz - z)), Infinity);
      expect(near, `void seen from ${x},${z}`).toBeGreaterThan(20);
    }
    // The waterfall feeds the river, and the shrine stands on designed ground (paved forecourt,
    // worn verges, scorch only round its fires), not a bare disc of dirt.
    expect(L.props.some((p) => p.kind === 'waterfall')).toBe(true);
    const dais = L.props.find((p) => p.kind === 'ritual_dais')!;
    let stone = 0, scorch = 0, n = 0;
    for (let z = Math.floor(dais.z - 9); z <= dais.z + 9; z++) for (let x = Math.floor(dais.x - 9); x <= dais.x + 22; x++) {
      if (at(x, z) !== Cell.Ground) continue;
      n++;
      if (L.ground[z * L.w + x] === Ground.Stone) stone++;
      if (L.ground[z * L.w + x] === Ground.Scorch) scorch++;
    }
    expect(stone / n, 'paved').toBeGreaterThan(0.2);
    expect(scorch, 'no scorched disc').toBe(0);
    expect((L.burns ?? []).filter((b) => Math.hypot(b.x - dais.x, b.z - dais.z) < 10).length).toBeGreaterThanOrEqual(2);
  });
  it('the drowned market has its trade knocked down round the edges, with open floor to fight on', () => {
    const L = build('ruin');
    expect(L.props.filter((p) => p.kind === 'stall_ruin').length).toBe(2);
    expect(L.props.some((p) => p.kind === 'well_ruin')).toBe(true);
    expect(L.props.filter((p) => p.kind === 'amphorae').length).toBeGreaterThanOrEqual(3);
    const pack = L.packs.find((p) => p.comp.includes('goblin'))!;
    let open = 0, all = 0;
    for (let z = Math.floor(pack.z - 3); z <= pack.z + 3; z++) for (let x = Math.floor(pack.x - 3); x <= pack.x + 3; x++) {
      all++;
      if (walk(L, x, z)) open++;
    }
    expect(open / all).toBeGreaterThan(0.9);
  });
  it('every home-island building stands on one level (no footprint straddles a slope or cliff)', () => {
    const L = build('keep');
    for (const b of L.buildings ?? []) {
      const levels = new Set<number>();
      // (A raised part of a floor, a dais, stands up from it.)
      for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) levels.add(L.level![z * L.w + x] - raisedAt(b, x, z));
      expect([...levels], b.id).toHaveLength(1);
    }
    const byId = Object.fromEntries((L.buildings ?? []).map((b) => [b.id, b]));
    // The hatchery is up on the north-east upland; the keep on the castle's terrace, the stables on the crown.
    expect(L.level![byId.hatch_plot.z * L.w + byId.hatch_plot.x]).toBe(7);
    expect(L.level![byId.keep.z * L.w + byId.keep.x]).toBe(13.5);
    expect(L.level![byId.stables.z * L.w + byId.stables.x]).toBe(11);
  });
  it('no walkable pocket is cut off from the entry (clicks never target one)', () => {
    for (const id of ZONE_IDS) {
      const L = build(id);
      const seen = new Uint8Array(L.w * L.h), q = [Math.floor(L.entry.z) * L.w + Math.floor(L.entry.x)];
      seen[q[0]] = 1;
      while (q.length) {
        const i = q.pop()!, x = i % L.w, z = (i - x) / L.w;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (z + dz) * L.w + x + dx;
          if (x + dx >= 0 && x + dx < L.w && z + dz >= 0 && z + dz < L.h && !seen[j] && L.cells[j] === Cell.Ground) {
            seen[j] = 1;
            q.push(j);
          }
        }
      }
      for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] === Cell.Ground) expect(seen[i], `${id} cell ${i % L.w},${Math.floor(i / L.w)}`).toBe(1);
    }
  });
});
