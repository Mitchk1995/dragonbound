import * as THREE from 'three';

/**
 * The tied hair's tail (tools/blender/hair.py hair_3): a part of its own, on a pivot named PONYTAIL at the foot of the
 * leather tie, under the head's socket. It turns with the tie as the head turns (turned against the head, it would twist
 * against its tie and cut into the band), but hangs from it with gravity however the head nods, and follows that hang
 * with a little follow-through: a damped spring that lags and overshoots a touch when the head or the character turns.
 * As the head turns (a quarter round when aiming a bow), the tie comes round over the shoulder, so the tail leans back
 * (PONYTAIL_BACK) and a little out (PONYTAIL_OUT) over the shoulder, as far as the tie has come round to it, instead of
 * hanging down through it. Leaning back, the body swings away from the tail; leaning forward (a slam), it would swing
 * into it, so there the tail rests on the back and leans with it.
 * tools/blender/animpose.py `ponytail` mirrors it, settled, for the clipping audit (tools/blender/haircheck.py).
 */
export const PONYTAIL = 'ponytail';
export const PONYTAIL_BACK = THREE.MathUtils.degToRad(55);
export const PONYTAIL_OUT = THREE.MathUtils.degToRad(10);
/** The spring: its natural frequency (radians a second) and damping ratio (under 1, so it overshoots a little). */
export const PONYTAIL_FREQ = 9;
export const PONYTAIL_DAMP = 0.4;

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const S = {
  q: new THREE.Quaternion(), root: new THREE.Quaternion(), inv: new THREE.Quaternion(), part: new THREE.Quaternion(),
  hang: new THREE.Quaternion(), swing: new THREE.Quaternion(), v: new THREE.Vector3(), down: new THREE.Vector3(),
  acc: new THREE.Vector3(),
};

/**
 * How the tail hangs in the root's frame (the character's own axes: Y up, +Z its front), for the head turned by `turn`
 * (radians about the vertical from the body's front; negative: to its right): turned with the head, then leaning back
 * and out over the shoulder the tie has come round to (at -sin(turn) along X).
 */
export function ponytailHang(turn: number, out = new THREE.Quaternion()) {
  const s = Math.sin(turn);
  out.setFromAxisAngle(Z, -PONYTAIL_OUT * s).multiply(S.q.setFromAxisAngle(X, PONYTAIL_BACK * Math.abs(s)));
  return out.multiply(S.q.setFromAxisAngle(Y, turn));
}

/** The tail under a head's socket, if the hair worn there has one (attached hair hangs in a group on the socket). */
function find(sock: THREE.Object3D | undefined) {
  for (const group of sock?.children ?? []) for (const c of group.children) if (c.name === PONYTAIL) return c;
  return null;
}

/** A part's axis `axis` (its own frame) in the root's frame, given the root's inverse world rotation `inv`. */
const inRoot = (part: THREE.Object3D, axis: THREE.Vector3, inv: THREE.Quaternion) =>
  S.v.copy(axis).applyQuaternion(S.q.copy(inv).multiply(part.getWorldQuaternion(S.part)));

/** Swings a character's ponytail each frame (anim.ts Rig.update, after the pose). */
export class Ponytail {
  private tail: THREE.Object3D | null = null;
  /** Where the tail's hang axis points (world) and how fast it is swinging. */
  private readonly dir = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();

  update(root: THREE.Object3D, head: THREE.Object3D | undefined, body: THREE.Object3D | undefined,
    sock: THREE.Object3D | undefined, dt: number) {
    const tail = find(sock);
    if (!tail?.parent || !head) {
      this.tail = null;
      return;
    }
    const inv = S.inv.copy(root.getWorldQuaternion(S.root)).invert();
    // How far the body leans forward against the character (the tail rests on its back), and the head's turn.
    const up = body ? inRoot(body, Y, inv) : S.v.copy(Y);
    const target = S.hang.copy(S.root).multiply(S.swing.setFromAxisAngle(X, Math.max(0, Math.atan2(up.z, up.y))));
    const front = inRoot(head, Z, inv);
    target.multiply(ponytailHang(Math.atan2(front.x, front.z), S.swing));
    // Where the tail should hang (world): its hang axis there, and the spring following it.
    const down = S.down.set(0, -1, 0).applyQuaternion(target);
    if (tail !== this.tail) {
      // (A new tail, as the hero is dressed: it starts settled.)
      this.tail = tail;
      this.dir.copy(down);
      this.vel.set(0, 0, 0);
    } else {
      const h = Math.min(dt, 1 / 30), w = PONYTAIL_FREQ;
      S.acc.copy(down).sub(this.dir).multiplyScalar(w * w).addScaledVector(this.vel, -2 * PONYTAIL_DAMP * w);
      this.vel.addScaledVector(S.acc, h);
      this.dir.addScaledVector(this.vel, h).normalize();
    }
    // The hang, swung from its axis to where the spring has it, into the tail's parent's frame.
    S.swing.setFromUnitVectors(down, this.dir).multiply(target);
    tail.quaternion.copy(tail.parent.getWorldQuaternion(S.part).invert().multiply(S.swing));
  }
}
