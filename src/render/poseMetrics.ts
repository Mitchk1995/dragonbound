import * as THREE from 'three';

/**
 * World-space measurements of posed models, used by tests/poses.test.ts (CI) and the dev pose
 * tools. Characters face +Z, so "forward" = +Z, "up" = +Y, the hero's right = -X.
 */

const EXCLUDE = new Set(['bow_string', 'bow_arrow']);

function localBox(group: THREE.Object3D) {
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    for (let p: THREE.Object3D | null = o; p && p !== group; p = p.parent) if (EXCLUDE.has(p.name)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv));
  });
  return box;
}

export interface WeaponFacts {
  /** Unit vector from the hand toward the far end (blade tip, staff head, pick end). */
  dir: THREE.Vector3;
  /** Unit vector of the weapon's second-largest dimension (blade width / edge-to-edge). */
  width: THREE.Vector3;
  /** World position of the far end. */
  tip: THREE.Vector3;
  length: number;
}

/** Facts about whatever is held in the right hand (gear attached to sock_handR). */
export function weaponFacts(root: THREE.Object3D): WeaponFacts | null {
  const group = root.getObjectByName('gear:sock_handR');
  if (!group) return null;
  const box = localBox(group);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const axes = (['x', 'y', 'z'] as const).slice().sort((a, b) => size[b] - size[a]);
  const [longA, widthA] = axes;
  // The hand is the group origin; the far end is whichever extreme is farther from it.
  const sign = Math.abs(box.max[longA]) >= Math.abs(box.min[longA]) ? 1 : -1;
  const dirLocal = new THREE.Vector3();
  dirLocal[longA] = sign;
  const widthLocal = new THREE.Vector3();
  widthLocal[widthA] = 1;
  const tipLocal = box.getCenter(new THREE.Vector3());
  tipLocal[longA] = sign > 0 ? box.max[longA] : box.min[longA];
  return {
    dir: dirLocal.transformDirection(group.matrixWorld),
    width: widthLocal.transformDirection(group.matrixWorld),
    tip: tipLocal.applyMatrix4(group.matrixWorld),
    length: size[longA],
  };
}

/** Where a part's local +Z points in world space (the facing of heads, feet…). */
export function partForward(root: THREE.Object3D, name: string): THREE.Vector3 | null {
  const o = root.getObjectByName(name);
  if (!o) return null;
  o.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld);
}

export function partPosition(root: THREE.Object3D, name: string): THREE.Vector3 | null {
  const o = root.getObjectByName(name);
  if (!o) return null;
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new THREE.Vector3());
}

/** Centre of all visible meshes under a part, in world space. */
export function partCenter(root: THREE.Object3D, name: string): THREE.Vector3 | null {
  const o = root.getObjectByName(name);
  if (!o) return null;
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
}

/**
 * Pauldron coverage: cosine between the arm's direction and joint→pauldron. Capped shoulders
 * are clearly negative (the pauldron sits on the far side of the joint from the arm).
 */
export function shoulderCap(root: THREE.Object3D, side: 'L' | 'R'): number | null {
  const arm = root.getObjectByName(`arm${side}`);
  const sock = root.getObjectByName(`sock_shoulder${side}`);
  const pauldron = sock?.children.find((c) => c.name === `gear:sock_shoulder${side}`);
  if (!arm || !pauldron) return null;
  root.updateWorldMatrix(true, true);
  const joint = arm.getWorldPosition(new THREE.Vector3());
  const armDir = new THREE.Vector3(0, -1, 0).transformDirection(arm.matrixWorld);
  const c = new THREE.Box3().setFromObject(pauldron).getCenter(new THREE.Vector3());
  return c.sub(joint).normalize().dot(armDir);
}

export interface BowFacts {
  upright: boolean;
  /** z of the string's midpoint minus z of the grip: negative = string toward the archer. */
  stringBehindGrip: number;
  arrowVisible: boolean;
  /** z component of the arrow's direction (1 = straight at the target). */
  arrowForward: number | null;
  /** Distance from the nock (end of the string halves) to the draw hand. */
  nockToHand: number | null;
  /** How far the nock sits above the middle of the string, along the bow (0 = pulled from the centre). */
  nockAboveMiddle: number | null;
  /** Vertical component of the arrow's direction (0 = level). */
  arrowRise: number | null;
}

/** Along-the-bow offset of the nock from the middle of the two string halves (each starts at a bow tip). */
function nockHeight(strings: THREE.Mesh[]) {
  const top = strings[0].getWorldPosition(new THREE.Vector3()), bottom = strings[1].getWorldPosition(new THREE.Vector3());
  const nock = strings[0].localToWorld(new THREE.Vector3(0, 1, 0));
  const axis = top.clone().sub(bottom).normalize();
  return nock.sub(top.add(bottom).multiplyScalar(0.5)).dot(axis);
}

export function bowFacts(root: THREE.Object3D, drawHand: THREE.Object3D): BowFacts | null {
  const bow = root.getObjectByName('gear:sock_handR');
  if (!bow) return null;
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  bow.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) meshes.push(o);
  });
  const strings = meshes.filter((m) => m.name === 'bow_string');
  const arrow = bow.getObjectByName('bow_arrow');
  const body = new THREE.Box3();
  for (const m of meshes) {
    let skip = strings.includes(m);
    for (let p: THREE.Object3D | null = m; p && p !== bow; p = p.parent) if (p.name === 'bow_arrow') skip = true;
    if (!skip) body.union(new THREE.Box3().setFromObject(m));
  }
  const size = body.getSize(new THREE.Vector3());
  const grip = meshes.find((m) => (m.material as THREE.Material).name === 'ROLE_leather');
  const gripC = grip ? new THREE.Box3().setFromObject(grip).getCenter(new THREE.Vector3()) : body.getCenter(new THREE.Vector3());
  const mid = strings.length === 2 ? new THREE.Box3().setFromObject(strings[0]).union(new THREE.Box3().setFromObject(strings[1])).getCenter(new THREE.Vector3()) : null;
  const hand = drawHand.getWorldPosition(new THREE.Vector3());
  return {
    upright: size.y > 1.2 && size.y > size.x * 3 && size.y > size.z * 3,
    stringBehindGrip: mid ? mid.z - gripC.z : NaN,
    arrowVisible: !!arrow?.visible,
    arrowForward: arrow?.visible ? new THREE.Vector3(0, 1, 0).transformDirection(arrow.matrixWorld).z : null,
    nockToHand: strings.length ? strings[0].localToWorld(new THREE.Vector3(0, 1, 0)).distanceTo(hand) : null,
    nockAboveMiddle: strings.length === 2 ? nockHeight(strings) : null,
    arrowRise: arrow?.visible ? new THREE.Vector3(0, 1, 0).transformDirection(arrow.matrixWorld).y : null,
  };
}
