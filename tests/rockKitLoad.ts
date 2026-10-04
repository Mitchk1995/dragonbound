import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ROCK_NAMES, registerRockScene, rockKitReady } from '../src/render/rockModels';

/** Load the rock kit from public/models the way the game does (tests have no fetch for it), once. */
export async function loadRockKit() {
  if (rockKitReady()) return;
  const loader = new GLTFLoader();
  for (const name of ROCK_NAMES) {
    const buf = readFileSync(`public/models/rock_${name}.glb`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) => loader.parse(ab, '', res as never, rej));
    registerRockScene(name, gltf.scene);
  }
}
