import * as THREE from 'three';
import { COMBAT_TUNING } from '../data/tuning';
import type { AnimState } from './anim';

const REST = new THREE.Vector3();

/** The arrow looses at the attack's impact frame (COMBAT_TUNING.impact). */
const RELEASE = COMBAT_TUNING.impact;
/** Draw amount by which the hand has taken the string (the arrow shows from here on). */
const GRAB = 0.1;
/** The arrow runs from the nock through the bow and this far past it, so its head sits just beyond the bow. */
const ARROW_PAST = 0.14;
/** The arrowhead's length. */
const HEAD = 0.12;

/** Draw amount for the bow attack (anim.ts bowPose draws to it): full draw at release, then snap. */
export function bowDrawAmount(a: number) {
  if (a < 0) return 0;
  if (a < RELEASE) {
    const t = Math.max(0, (a - 0.12) / (RELEASE - 0.12));
    return t * t * (3 - 2 * t);
  }
  return Math.max(0, 1 - (a - RELEASE) / 0.06);
}

/**
 * Makes a held bow feel real: the static string is replaced by two string halves that
 * follow the draw hand, and an arrow is nocked until the shot is released.
 * Works in the bow group's local space, so it follows every pose automatically.
 */
export class BowDraw {
  private bow: THREE.Object3D | null = null;
  private top = new THREE.Vector3();
  private bottom = new THREE.Vector3();
  private rest = new THREE.Vector3();
  private grip = new THREE.Vector3();
  /** Unit direction from the grip back through the string's middle: the arrow line, toward the archer. */
  private back = new THREE.Vector3();
  private strings: THREE.Mesh[] = [];
  private arrow: ReturnType<typeof buildArrow> | null = null;
  private tmp = new THREE.Vector3();
  private m = new THREE.Matrix4();

  constructor(private root: THREE.Object3D) {}

  /** Call after the hero is (re)dressed. Detects a bow in the right hand and rigs its string. */
  attach() {
    this.detach();
    let hand: THREE.Object3D | null = null;
    this.root.traverse((o) => {
      if (o.name === 'gear:sock_handR') hand = o;
    });
    if (!hand) return;
    const group = hand as THREE.Object3D;
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    let stringMesh: THREE.Mesh | null = null;
    let longest = 0;
    const all = new THREE.Box3();
    const v = new THREE.Vector3();
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const box = new THREE.Box3();
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv));
      all.union(box);
      const s = box.getSize(new THREE.Vector3());
      const dims = [s.x, s.y, s.z].sort((a, b) => a - b);
      // The string: a long mesh that is thin in both other directions.
      if (dims[0] < 0.035 && dims[1] < 0.035 && dims[2] > 0.6 && dims[2] > longest) {
        longest = dims[2];
        stringMesh = o;
      }
    });
    if (!stringMesh) return;
    const sm = stringMesh as THREE.Mesh;
    const sb = new THREE.Box3();
    const pos = sm.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) sb.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(sm.matrixWorld).applyMatrix4(inv));
    const size = sb.getSize(new THREE.Vector3());
    const c = sb.getCenter(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    this.top.copy(c);
    this.bottom.copy(c);
    this.top[axis] = sb.max[axis];
    this.bottom[axis] = sb.min[axis];
    this.rest.copy(c);
    // The grip is the bow's centre on the far side from the string.
    const bc = all.getCenter(new THREE.Vector3());
    this.grip.copy(bc);
    this.grip[axis] = c[axis];
    this.back.subVectors(this.rest, this.grip).normalize();
    sm.visible = false;
    this.bow = group;

    const mat = (sm.material as THREE.MeshStandardMaterial).clone();
    for (let k = 0; k < 2; k++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 4).translate(0, 0.5, 0), mat);
      s.castShadow = true;
      s.name = 'bow_string';
      group.add(s);
      this.strings.push(s);
    }
    this.arrow = buildArrow();
    this.arrow.group.name = 'bow_arrow';
    this.arrow.group.visible = false;
    group.add(this.arrow.group);
  }

  detach() {
    for (const s of this.strings) s.removeFromParent();
    this.strings = [];
    this.arrow?.group.removeFromParent();
    this.arrow = null;
    this.bow = null;
  }

  /** Per frame, after the rig has posed the hero. */
  update(anim: AnimState, drawHand: THREE.Object3D | undefined) {
    if (!this.bow) return;
    const drawing = anim.attackKind === 'bow' && anim.attack >= 0;
    const pull = drawing ? bowDrawAmount(anim.attack) : 0;
    // Nock point, in the bow's local space. It always stays on the arrow line through the middle of the string,
    // so the string is one string pulled from its centre and the arrow flies level. The hand takes the string in
    // the first moments of the draw (GRAB of the pull) and holds it at the anchor until release.
    const nock = this.tmp.copy(this.rest);
    if (pull > 0 && drawHand) {
      this.root.updateMatrixWorld(true);
      const hand = drawHand.getWorldPosition(new THREE.Vector3());
      this.m.copy(this.bow.matrixWorld).invert();
      hand.applyMatrix4(this.m);
      const behind = Math.max(0, hand.sub(this.rest).dot(this.back));
      nock.addScaledVector(this.back, behind * Math.min(1, pull / GRAB));
    }
    this.span(this.strings[0], this.top, nock);
    this.span(this.strings[1], this.bottom, nock);
    if (this.arrow) {
      // Visible from the moment the draw hand holds the nock until release.
      const { group, shaft, head } = this.arrow;
      group.visible = drawing && anim.attack < RELEASE && pull > GRAB;
      if (group.visible) {
        // The arrow lies from the nock through the bow, as long as the draw, its head just beyond the bow.
        const dir = REST.copy(this.grip).sub(nock);
        const len = dir.length() || 1;
        group.position.copy(nock);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(len));
        shaft.scale.y = len + ARROW_PAST - HEAD;
        head.position.y = len + ARROW_PAST - HEAD;
      }
    }
  }

  private span(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    mesh.position.copy(a);
    mesh.scale.set(1, Math.max(0.001, len), 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len || 1));
  }
}

/** An arrow along +Y from its nock: a shaft one unit long (scaled to the draw) and its head (placed at the shaft's end). */
function buildArrow() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, flatShading: true, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, flatShading: true, roughness: 0.4, metalness: 0.3 });
  const feather = new THREE.MeshStandardMaterial({ color: 0xd84a2a, flatShading: true, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 5).translate(0, 0.5, 0), wood);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, HEAD, 4).translate(0, HEAD / 2, 0), steel);
  g.add(shaft, head);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.14).translate(0.03, 0.1, 0), feather);
    f.rotation.y = (k / 3) * Math.PI * 2;
    g.add(f);
  }
  g.traverse((o) => (o.castShadow = o instanceof THREE.Mesh));
  return { group: g, shaft, head };
}
