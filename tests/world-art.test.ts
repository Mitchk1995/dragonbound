import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chamferBox, octagon, prism, rockBlock, taper, wedge } from '../src/render/blocks';
import { applyPaint, paintAtlas, PAINTS, type PaintKind } from '../src/render/paint';
import { patchKeys } from '../src/render/surface';
import { ZONES } from '../src/data/zones';
import { Cell, Ground } from '../src/world/layout';
import { buildProp, PROP_KINDS } from '../src/world/props';

const finite = (geo: THREE.BufferGeometry) => {
  for (const name of ['position', 'normal']) {
    const a = geo.getAttribute(name).array as ArrayLike<number>;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  }
  return true;
};

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
  it('every prop builds with finite geometry and no bumped materials', () => {
    for (const kind of [...PROP_KINDS, 'portal', 'rock_copper', 'rock_tin', 'rock_iron', 'rock_coal', 'rock_emberite']) {
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
    expect(PROP_KINDS).not.toContain('crack');
    buildProp('bones', 2).obj.traverse((o) => {
      if (o instanceof THREE.Mesh) expect((o.material as THREE.MeshStandardMaterial).emissiveIntensity * (o.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
    });
    for (const id of ['keep', 'mine', 'foothills', 'ruin', 'lair']) {
      const L = ZONES[id].build(1000 + id.length * 97);
      expect(L.props.some((p) => p.kind === 'crack')).toBe(false);
    }
  });
  it('ore rocks are about two units across and hide their ore when depleted', () => {
    for (const ore of ['copper', 'tin', 'iron', 'coal', 'emberite']) {
      const p = buildProp(`rock_${ore}`);
      const size = new THREE.Box3().setFromObject(p.obj).getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.z), ore).toBeGreaterThan(1.6);
      expect(Math.max(size.x, size.z), ore).toBeLessThan(2.4);
      p.setState!('depleted');
      const after = new THREE.Box3().setFromObject(p.obj, true);
      expect(after.max.y, ore).toBeLessThan(size.y);
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
    const lib = THREE.ShaderLib.standard;
    const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as any;
    mat.onBeforeCompile(shader, null as any);
    expect(shader.fragmentShader).toContain('q.zy : q.xy');
    expect(shader.fragmentShader).not.toContain('normal = ');
  });
});

describe('zones', () => {
  it('the Foothills are called Wyrmwood Foothills; their id is unchanged', () => {
    expect(ZONES.foothills.id).toBe('foothills');
    expect(ZONES.foothills.name).toBe('Wyrmwood Foothills');
  });
  it('the goblin palisades stand on dry ground', () => {
    const L = ZONES.foothills.build(1000 + 'foothills'.length * 97);
    for (const p of L.props.filter((q) => q.kind === 'palisade')) {
      const half = (p.len ?? 6) / 2, c = Math.cos(p.rot ?? 0), s = Math.sin(p.rot ?? 0);
      for (let t = -half; t <= half; t += 0.5) {
        const x = Math.floor(p.x + c * t), z = Math.floor(p.z - s * t);
        expect(L.fluid[z * L.w + x], `palisade at ${p.x},${p.z}`).toBe(0);
      }
    }
  });
  const build = (id: string) => ZONES[id].build(1000 + id.length * 97);
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
  it('no walkable pocket is cut off from the entry (clicks never target one)', () => {
    for (const id of ['keep', 'mine', 'foothills', 'ruin', 'lair']) {
      const L = ZONES[id].build(1000 + id.length * 97);
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
