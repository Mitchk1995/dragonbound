/**
 * The bake finish (tools/blender/bake.py), checked on the committed outputs (CI does not run Blender): every model
 * that takes it has both UV maps, tangents and its baked map beside it; the `tile` map lays each island at true size
 * (so the painted library runs at one texel density on every piece); the `bake` map is the same islands, unturned,
 * packed into the atlas (one tangent frame for both maps); and the painted library is all there, listed with its
 * sources.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { EDGE_BASE, VALUE_SCALE } from '../src/render/charBake';
import { kindIndex, LAYERS, LAYER_SIZE, SURFACES } from '../src/render/charSurfaces';
import { makeModel, MODEL_FILES, registerModelScene } from '../src/render/registry';
import { patchKeys } from '../src/render/surface';

const BAKE_PY = readFileSync('tools/blender/bake.py', 'utf8');
/** The models the finish covers: bake.py BAKED's file-name prefixes. */
const PREFIXES = [.../^BAKED = \(([^)]*)\)/m.exec(BAKE_PY)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const FINISHED = MODEL_FILES.filter((n) => PREFIXES.some((p) => n.startsWith(p)));
/** Models still on the projected paint, until a job gives them the finish. */
const UNFINISHED = ['kobold', 'cultist', 'priest', 'warden', 'quartermaster', 'drakeling'];
const scenes = new Map<string, THREE.Group>();

beforeAll(async () => {
  const loader = new GLTFLoader();
  const parse = async (name: string) => {
    const buf = readFileSync(`public/models/${name}.glb`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return (await new Promise<{ scene: THREE.Group }>((res, rej) => loader.parse(ab, '', res as never, rej))).scene;
  };
  for (const name of [...FINISHED, ...UNFINISHED]) {
    const scene = await parse(name);
    scene.updateMatrixWorld(true);
    scenes.set(name, scene);
    // (A second copy for the registry, which merges and reframes what it registers.)
    registerModelScene(name, await parse(name));
  }
});

const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};

/** A WebP's size (lossless VP8L, as Blender writes it) or a PNG's, from its header. */
function imageSize(file: string): [number, number] {
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  expect(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 16), file).toBe('RIFFWEBPVP8L');
  const bits = b.readUInt32LE(21);
  return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
}

/** Each triangle's corners, in the model's frame and in a UV map. */
function* triangles(mesh: THREE.Mesh, uvName: string) {
  const g = mesh.geometry, pos = g.attributes.position, uv = g.getAttribute(uvName) as THREE.BufferAttribute;
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  for (let t = 0; t < idx.length; t += 3) {
    const k = [idx[t], idx[t + 1], idx[t + 2]];
    yield {
      p: k.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)),
      uv: k.map((i) => new THREE.Vector2().fromBufferAttribute(uv, i)),
    };
  }
}
const area3 = (p: THREE.Vector3[]) => p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).length() / 2;
const area2 = (q: THREE.Vector2[]) => Math.abs((q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[2].x - q[0].x) * (q[1].y - q[0].y)) / 2;
/** Hidden faces (buried inside another part) are left out of the atlas at (-1, -1), (-1, 2) once exported. */
const outOfAtlas = (q: THREE.Vector2[]) => q.every((v) => v.x === -1 && v.y === 2);

describe('the bake finish', () => {
  it('covers the hero, his gear and hair, and the goblin; the rest keep their projected paint', () => {
    expect(FINISHED).toEqual(expect.arrayContaining(['hero', 'goblin', 'gear_body_chain', 'gear_body_plate_p', 'gear_body_plate_e', 'hair_1']));
    for (const name of UNFINISHED) {
      for (const m of meshes(scenes.get(name)!)) expect(m.geometry.getAttribute('uv1'), name).toBeUndefined();
      makeModel(name).root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const keys = patchKeys(o.material as THREE.Material);
        expect(keys.some((k) => k.startsWith('csurf:')), `${name} ${o.name}`).toBe(false);
      });
    }
  });

  it('the game reads the painted value and the edge at the scale the bake stores them', () => {
    expect(Number(/^VALUE_SCALE = ([\d.]+)/m.exec(BAKE_PY)![1])).toBe(VALUE_SCALE);
    expect(Number(/^EDGE_BASE = ([\d.]+)/m.exec(BAKE_PY)![1])).toBe(EDGE_BASE);
  });

  it('a part\'s named kind reaches the game: the goblin\'s club is wood, his eyes and mouth plain, his hide goblin skin', () => {
    const kinds = new Set<number>();
    makeModel('goblin').root.traverse((o) => {
      const a = o instanceof THREE.Mesh ? o.geometry.getAttribute('aKind') : undefined;
      if (a) for (let i = 0; i < a.count; i++) kinds.add(Math.round(a.getX(i)));
    });
    for (const k of ['wood', 'plain', 'goblin', 'leather', 'plate'] as const) expect([...kinds], k).toContain(kindIndex(k));
  });

  for (const name of FINISHED) {
    it(`${name}: both UV maps, tangents and a square baked map`, () => {
      for (const m of meshes(scenes.get(name)!)) {
        for (const a of ['normal', 'uv', 'uv1', 'tangent']) expect(m.geometry.getAttribute(a), `${name} ${m.name} ${a}`).toBeDefined();
      }
      const file = `public/models/${name}.bake.webp`;
      expect(existsSync(file), file).toBe(true);
      const [w, h] = imageSize(file);
      expect(w, file).toBe(h);
      expect([256, 512, 1024], file).toContain(w);
    });
  }

  it('the tile map lays every island flat at true size, upright; the bake map is the same islands unturned', () => {
    for (const name of ['hero', 'goblin', 'gear_body_plate_p', 'gear_body_chain', 'hair_2']) {
      let checked = 0;
      for (const m of meshes(scenes.get(name)!)) {
        const tiles = [...triangles(m, 'uv')], bakes = [...triangles(m, 'uv1')];
        tiles.forEach((t, i) => {
          const a = area3(t.p);
          if (a < 1e-4 || outOfAtlas(bakes[i].uv) || area2(bakes[i].uv) < 1e-9) return;
          // Each island is laid on its own plane (triangles within 60 degrees of it), never stretched past true size.
          const k = area2(t.uv) / a;
          expect(k, `${name} ${m.name}: tile area`).toBeLessThan(1.02);
          expect(k, `${name} ${m.name}: tile area`).toBeGreaterThan(0.49);
          // The bake map is the tile map scaled and moved, never turned or mirrored.
          const du = t.uv[1].clone().sub(t.uv[0]), dv = t.uv[2].clone().sub(t.uv[0]);
          const bu = bakes[i].uv[1].clone().sub(bakes[i].uv[0]), bv = bakes[i].uv[2].clone().sub(bakes[i].uv[0]);
          const cross = (p: THREE.Vector2, q: THREE.Vector2) => p.x * q.y - p.y * q.x;
          expect(Math.sign(cross(bu, bv)), `${name} ${m.name}: bake map mirrored`).toBe(Math.sign(cross(du, dv)));
          const s = Math.sqrt(area2(bakes[i].uv) / Math.max(area2(t.uv), 1e-12));
          expect(bu.distanceTo(du.clone().multiplyScalar(s)), `${name} ${m.name}: bake map turned`).toBeLessThan(0.002 + s * 0.01);
          for (const v of bakes[i].uv) {
            expect(v.x).toBeGreaterThanOrEqual(0);
            expect(v.x).toBeLessThanOrEqual(1);
          }
          checked++;
        });
      }
      expect(checked, name).toBeGreaterThan(50);
    }
  });
});

describe('the painted library', () => {
  it('has every layer, at the library\'s size, listed with its source and licence', () => {
    const licences = readFileSync('public/textures/characters/LICENSES.md', 'utf8');
    for (const layer of LAYERS) {
      const file = `public/textures/characters/${layer}.png`;
      expect(imageSize(file), file).toEqual([LAYER_SIZE, LAYER_SIZE]);
      expect(licences, layer).toContain(`\`${layer}.png\``);
    }
  });

  it('every surface paints with a layer the library has (metal with none), at a sensible scale', () => {
    for (const [kind, s] of Object.entries(SURFACES)) {
      if (s.layer !== null) expect(LAYERS, kind).toContain(s.layer);
      expect(s.tile, kind).toBeGreaterThan(0.05);
      expect(s.detail, kind).toBeLessThanOrEqual(1);
    }
  });
});
