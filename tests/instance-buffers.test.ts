import * as THREE from 'three';
import { Backend, Renderer, StandardNodeLibrary, WGSLNodeBuilder } from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addPatch, installPatchedMaterials, instanceMatrixNode } from '../src/render/patch';

type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/**
 * A renderer backend that draws nothing but keeps the GPU buffers' books as the WebGPU backend of
 * three.js 0.186 does: one buffer per attribute (an interleaved attribute's lives on its interleaved
 * buffer, and stays recorded there once destroyed), destroyed by destroyAttribute.
 */
// (The renderer's per-object records, which the typings leave out.)
const BackendWithRecords = Backend as unknown as new () => Backend & { get(o: object): object; delete(o: object): void };

class BufferBooks extends BackendWithRecords {
  live = new Set<object>();
  /** Buffers made again over a destroyed one (drawing from it is a GPU error on a real device). */
  stale = 0;
  capabilities = { getUniformBufferLimit: () => 65536 };
  utils = { getTextureSampleData: () => ({ samples: 1, primarySamples: 1, isMSAA: false }) };
  compatibilityMode = false;
  override get coordinateSystem() {
    return THREE.WebGPUCoordinateSystem;
  }
  override getDomElement() {
    return { width: 64, height: 64, style: {}, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  }
  createNodeBuilder(object: THREE.Object3D, renderer: Renderer) {
    return new WGSLNodeBuilder(object, renderer);
  }
  private record(a: Attr) {
    return this.get((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as THREE.InterleavedBufferAttribute).data : a) as { buffer?: { destroyed: boolean } };
  }
  createAttribute(a: Attr) {
    const r = this.record(a);
    if (!r.buffer) this.live.add((r.buffer = { destroyed: false }));
    else if (r.buffer.destroyed) this.stale++;
  }
  createIndexAttribute(a: Attr) {
    this.createAttribute(a);
  }
  createStorageAttribute(a: Attr) {
    this.createAttribute(a);
  }
  destroyAttribute(a: Attr) {
    const buf = this.record(a).buffer!;
    buf.destroyed = true;
    this.live.delete(buf);
    this.delete(a);
  }
}

/** A renderer with the patched materials, and a sun casting shadows. */
async function setup() {
  // (There is no window here: the renderer's frame loop runs when a test draws a frame.)
  let frame: ((t: number) => void) | null = null;
  vi.stubGlobal('self', { requestAnimationFrame: (f: (t: number) => void) => ((frame = f), 1), cancelAnimationFrame() {} });
  const books = new BufferBooks();
  const renderer = new Renderer(books as never, {});
  renderer.library = new StandardNodeLibrary();
  installPatchedMaterials(renderer);
  renderer.shadowMap.enabled = true;
  await renderer.init();
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(64, 64);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  await renderer.setAnimationLoop(() => renderer.render(scene, camera));
  const draw = (n = 1) => {
    // (Each frame, the sun's shadow is drawn before the scene.)
    for (let i = 0; i < n; i++) frame!(0);
  };
  draw();
  return { books, scene, camera, sun, draw };
}

/**
 * An instanced, coloured shadow caster whose patch reads each instance's matrix: per-instance buffers
 * of the patch's (the matrices) and of the renderer's (the colours; for over a thousand instances,
 * its matrices too).
 */
function model(geometry: THREE.BufferGeometry = new THREE.BoxGeometry(), count = 4) {
  const mat = new THREE.MeshStandardMaterial();
  // (All four matrix columns read: they share one GPU buffer.)
  addPatch(mat, {
    key: 'test-instance',
    nodes: (_u, builder) => ({ color: (c) => c.add(instanceMatrixNode(builder)!.mul(vec4(1, 1, 1, 1)).xyz.mul(0.01)) }),
  });
  const mesh = new THREE.InstancedMesh(geometry, mat, count);
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation((i % 4) * 2, 0, Math.floor(i / 4) * 0.01));
    mesh.setColorAt(i, new THREE.Color((i % 4) / 4, 0.5, 0.5));
  }
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Draw meshes for a few frames, then free them as the game does (disposeObjects: mesh, owned geometry, material). */
function cycle(rounds: number, make: () => THREE.InstancedMesh[], { books, scene, draw }: Awaited<ReturnType<typeof setup>>, freeGeometry: boolean) {
  const live = [];
  for (let round = 0; round < rounds; round++) {
    const meshes = make();
    scene.add(...meshes);
    draw(2);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.dispose();
      if (freeGeometry) mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    draw();
    live.push(books.live.size);
  }
  return live;
}

describe('instance buffers live as long as their mesh', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('frees what only a mesh\'s shadow drew, and the renderer\'s own matrices of a large mesh', async () => {
    const r = await setup();
    // (Behind the camera, inside a wide shadow, over ground that takes it: only the shadow pass draws
    // the meshes.)
    const sc = r.sun.shadow.camera;
    [sc.left, sc.right, sc.top, sc.bottom] = [-40, 40, 40, -40];
    sc.updateProjectionMatrix();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial());
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    r.scene.add(ground);
    r.draw();
    const shared = new THREE.BoxGeometry();
    const unseen = (mesh: THREE.InstancedMesh) => (mesh.position.set(0, 0, 25), mesh);
    const live = cycle(4, () => [unseen(model(shared)), unseen(model(shared, 1100))], r, false);
    expect(live).toEqual(live.map(() => live[0]));
    expect(r.books.stale).toBe(0);
  });

  it('a freed instanced shadow caster leaves no GPU buffers behind', async () => {
    const r = await setup();
    const base = r.books.live.size;
    const live = cycle(4, () => [model()], r, true);
    expect(live).toEqual(live.map(() => base));
    expect(r.books.stale).toBe(0);
  });

  it('frees a mesh drawn with a shared geometry when only the mesh is disposed', async () => {
    const r = await setup();
    // (The shared geometry's own buffers stay with it, made in the first round.)
    const shared = new THREE.BoxGeometry();
    const live = cycle(4, () => [model(shared), model(shared, 1100)], r, false);
    expect(live).toEqual(live.map(() => live[0]));
    expect(r.books.stale).toBe(0);
  });

  it('a mesh drawn on after its geometry is disposed (twice) gets fresh buffers, freed with the mesh', async () => {
    const { books, scene, draw } = await setup();
    const base = books.live.size;
    const mesh = model();
    scene.add(mesh);
    draw(2);
    for (let i = 0; i < 2; i++) {
      mesh.geometry.dispose();
      draw(2);
    }
    expect(books.stale).toBe(0);
    mesh.removeFromParent();
    mesh.dispose();
    mesh.geometry.dispose();
    draw();
    expect(books.live.size).toBe(base);
  });
});
