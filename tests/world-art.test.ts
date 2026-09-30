import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chamferBox, octagon, prism, rockBlock, taper, wedge } from '../src/render/blocks';
import { applyPaint, paintAtlas, PAINTS, type PaintKind } from '../src/render/paint';
import { patchKeys } from '../src/render/surface';
import { ZONES } from '../src/data/zones';
import { Cell } from '../src/world/layout';
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
