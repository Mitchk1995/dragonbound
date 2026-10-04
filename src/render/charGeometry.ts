import * as THREE from 'three';

/**
 * Give a model's geometry what the painted shader reads, once at load time:
 * - `aRest`: each vertex in the model root's frame at rest, so patterns run on unbroken across
 *   rig nodes and merged parts (no restart at every joint) yet move rigidly with each limb,
 *   and RestN, its flat face normal in that frame;
 * - `aFace`: its place on its flat face (u, v from the face's corner, face width, height), with
 *   v up the face on side faces and every face oriented the same way (no flipped streaks).
 * Returns a non-indexed copy; the input is left alone.
 */
export function prepareCharGeometry(src: THREE.BufferGeometry, rest: THREE.Matrix4): THREE.BufferGeometry {
  const geo = src.index ? src.toNonIndexed() : src.clone();
  const pos = geo.attributes.position;
  const n = pos.count, tris = Math.floor(n / 3);
  const P = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(rest);
    P[i * 3] = v.x;
    P[i * 3 + 1] = v.y;
    P[i * 3 + 2] = v.z;
  }
  // Group triangles into flat faces: same plane and sharing a corner.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normals: THREE.Vector3[] = [];
  const keys: string[] = [];
  const parent = Int32Array.from({ length: tris }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstAt = new Map<string, number>();
  const q = (x: number) => Math.round(x * 2000);
  for (let t = 0; t < tris; t++) {
    a.fromArray(P, t * 9);
    b.fromArray(P, t * 9 + 3);
    c.fromArray(P, t * 9 + 6);
    const nn = b.clone().sub(a).cross(c.clone().sub(a));
    const len = nn.length();
    if (len < 1e-10) {
      normals.push(new THREE.Vector3(0, 1, 0));
      keys.push(`deg${t}`);
      continue;
    }
    nn.divideScalar(len);
    normals.push(nn);
    const key = `${Math.round(nn.x * 200)},${Math.round(nn.y * 200)},${Math.round(nn.z * 200)},${Math.round(nn.dot(a) * 400)}`;
    keys.push(key);
    for (let k = 0; k < 3; k++) {
      const pk = `${key}|${q(P[t * 9 + k * 3])},${q(P[t * 9 + k * 3 + 1])},${q(P[t * 9 + k * 3 + 2])}`;
      const other = firstAt.get(pk);
      if (other === undefined) firstAt.set(pk, t);
      else parent[find(t)] = find(other);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < tris; t++) {
    const r = find(t);
    const g = groups.get(r) ?? [];
    g.push(t);
    groups.set(r, g);
  }
  const face = new Float32Array(n * 4), fn = new Float32Array(n * 3);
  const U = new THREE.Vector3(), V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(1, 0, 0);
  for (const [r, list] of groups) {
    const nn = normals[r];
    if (Math.abs(nn.y) < 0.7) {
      V.copy(up).addScaledVector(nn, -nn.y).normalize();
      U.crossVectors(V, nn);
    } else {
      U.copy(right).addScaledVector(nn, -nn.x).normalize();
      V.crossVectors(nn, U);
    }
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const t of list) for (let k = 0; k < 3; k++) {
      v.fromArray(P, (t * 3 + k) * 3);
      const pu = v.dot(U), pv = v.dot(V);
      u0 = Math.min(u0, pu);
      u1 = Math.max(u1, pu);
      v0 = Math.min(v0, pv);
      v1 = Math.max(v1, pv);
    }
    for (const t of list) for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      v.fromArray(P, i * 3);
      face.set([v.dot(U) - u0, v.dot(V) - v0, u1 - u0, v1 - v0], i * 4);
      nn.toArray(fn, i * 3);
    }
  }
  geo.setAttribute('aRest', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('aFace', new THREE.BufferAttribute(face, 4));
  geo.setAttribute('aRestN', new THREE.BufferAttribute(fn, 3));
  // A random tone per authored part (each plate is its own part until parts merge), keyed to
  // where it sits, so every copy of a model paints each plate the same.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += P[i * 3];
    cy += P[i * 3 + 1];
    cz += P[i * 3 + 2];
  }
  const k = n ? Math.sin((cx / n) * 127.1 + (cy / n) * 311.7 + (cz / n) * 74.7) * 43758.5453 : 0;
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(k - Math.floor(k)), 1));
  return geo;
}
