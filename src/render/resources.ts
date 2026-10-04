import * as THREE from 'three';

type Resource = THREE.BufferGeometry | THREE.Material | THREE.Texture;
const shared = new WeakSet<Resource>();

/** Cached assets live for the game session, while their per-instance materials remain disposable. */
export function shareResource<T extends Resource>(resource: T): T {
  shared.add(resource);
  return resource;
}

/** Releases an instance without destroying geometry/textures still used by cached assets. */
export function disposeObjects(objects: Iterable<THREE.Object3D>) {
  const owned = new Set<Resource>();
  const instances = new Set<THREE.InstancedMesh>();
  const collect = (resource: Resource) => { if (!shared.has(resource)) owned.add(resource); };
  const collectMaterial = (material: THREE.Material) => {
    if (shared.has(material)) return;
    collect(material);
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) collect(value);
  };
  for (const obj of objects) {
    obj.removeFromParent();
    obj.traverse((node) => {
      // Sprite geometry belongs to three.js and is shared by every sprite; title artwork is owned.
      if (node instanceof THREE.Sprite) { collectMaterial(node.material); return; }
      if (!(node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line)) return;
      if (node instanceof THREE.InstancedMesh) instances.add(node);
      collect(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        collectMaterial(material);
      }
    });
  }
  for (const instance of instances) instance.dispose();
  for (const resource of owned) resource.dispose();
}

export const disposeObject = (object: THREE.Object3D) => disposeObjects([object]);
