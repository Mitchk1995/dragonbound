import * as THREE from 'three';

import { COMBAT_TUNING } from '../data/tuning';
import { bowDrawAmount } from './bowDraw';

export type AttackKind = 'swing' | 'bow' | 'cast' | 'bite' | 'slam' | 'throw';

export interface AnimState {
  /** Current ground speed in units/s. */
  speed: number;
  /** Attack progress 0..1, or -1 when not attacking. */
  attack: number;
  attackKind: AttackKind;
  /** 0..1, decays after taking a hit. */
  hurt: number;
  /** Seconds since death, or -1 while alive. */
  dead: number;
  /** 0..1 how airborne (dragons). */
  fly: number;
  /** Breath/charge wind-up 0..1 or -1. */
  special: number;
}

export const newAnimState = (): AnimState => ({ speed: 0, attack: -1, attackKind: 'swing', hurt: 0, dead: -1, fly: 0, special: -1 });

const ease = (t: number) => t * t * (3 - 2 * t);

const QA = new THREE.Quaternion(), QB = new THREE.Quaternion(), QC = new THREE.Quaternion(), QD = new THREE.Quaternion();
const V1 = new THREE.Vector3();

/** Dragon head/neck levelling and sword wrist angle; tuned against tests/poses.test.ts. */
export const HEAD_LEVEL = 0.35;
export const HEAD_FLY_LEVEL = -0.1;
export const NECK_FLY_EXTEND = 0.25;
export const SWING_WRIST = 1.23;

/** Where the blow lands in every attack animation (see COMBAT_TUNING.impact). */
const IMPACT = COMBAT_TUNING.impact;

/** How far the hanging arms turn out from the body (radians, about Z); tools/blender/fitcheck.py poses with it. */
export const ARM_SPLAY = 0.1;

/** How much of the upper arm's rotation the pauldron follows (see Rig.followShoulders). */
export const SHOULDER_FOLLOW = 0.75;

/** Extra hand-socket rotation during the bow shot so the bow stands upright with the string facing the archer. */
// Found by searching quarter turns with __bowReport: upright through the draw, arrow at the target,
// nock on the draw hand, string behind the grip both drawn and at rest (brace toward the archer).
export const BOW_SOCKET: [number, number, number] = [0, Math.PI / 2, Math.PI / 2];

/**
 * Draw-arm rotation at the anchor: the hand level with the middle of the string, on the arrow line behind the grip.
 * Found by searching the arm's reach in the pose test. The arms have no elbow, so this is the only point on the
 * arrow line the hand can reach; it gets there while the bow comes up, takes the string and holds it to release.
 */
export const BOW_ANCHOR: [number, number] = [-1.58, -1.51];

/** Procedural animation over named rigid parts. */
export class Rig {
  private parts = new Map<string, THREE.Object3D>();
  private baseRot = new Map<THREE.Object3D, THREE.Euler>();
  private basePos = new Map<THREE.Object3D, THREE.Vector3>();
  private phase = 0;
  private time = Math.random() * 10;
  readonly quadruped: boolean;

  constructor(public root: THREE.Object3D, public stride = 2.2) {
    root.traverse((o) => {
      if (o.name && !this.parts.has(o.name)) {
        this.parts.set(o.name, o);
        this.baseRot.set(o, o.rotation.clone());
        this.basePos.set(o, o.position.clone());
      }
    });
    this.quadruped = this.parts.has('legFL');
  }

  part(name: string) {
    return this.parts.get(name);
  }

  private rot(name: string, x = 0, y = 0, z = 0) {
    const p = this.parts.get(name);
    if (!p) return;
    const b = this.baseRot.get(p)!;
    p.rotation.set(b.x + x, b.y + y, b.z + z);
  }

  private offset(name: string, x = 0, y = 0, z = 0) {
    const p = this.parts.get(name);
    if (!p) return;
    const b = this.basePos.get(p)!;
    p.position.set(b.x + x, b.y + y, b.z + z);
  }

  update(dt: number, s: AnimState) {
    this.time += dt;
    const t = this.time;
    const moveAmt = Math.min(1, s.speed / 3);
    this.phase += dt * s.speed * this.stride;
    const sw = Math.sin(this.phase);

    if (s.dead >= 0) {
      const f = ease(Math.min(1, s.dead * 3));
      this.root.rotation.set(this.quadruped ? 0 : -f * Math.PI / 2, 0, this.quadruped ? f * Math.PI / 2 : 0);
      this.root.position.y = (this.quadruped ? 0 : f * 0.3) - Math.max(0, s.dead - 1.2) * 0.8;
      return;
    }
    this.root.rotation.set(0, 0, 0);
    this.root.position.y = 0;

    const breathe = Math.sin(t * 2.2) * 0.02;
    const hurtLean = -s.hurt * 0.3;

    if (this.quadruped) {
      const lift = s.fly * 2.2;
      // Legs tuck up while airborne.
      const tuck = s.fly * 0.9;
      this.rot('legFL', sw * 0.6 * moveAmt * (1 - s.fly) - tuck);
      this.rot('legBR', sw * 0.6 * moveAmt * (1 - s.fly) + tuck);
      this.rot('legFR', -sw * 0.6 * moveAmt * (1 - s.fly) - tuck);
      this.rot('legBL', -sw * 0.6 * moveAmt * (1 - s.fly) + tuck);
      for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) this.offset(leg, 0, lift);
      this.offset('body', 0, Math.abs(sw) * 0.05 * moveAmt + breathe + lift);
      this.rot('body', hurtLean * 0.5);
      for (let i = 1; i <= 6; i++) this.rot(`tail${i}`, Math.sin(t * 1.3 - i * 0.5) * 0.05, Math.sin(t * 2 - i * 0.7) * (0.12 + i * 0.04) * (1 + moveAmt));
      // The neck is authored curving upward; flatten it in flight so the head leads the body.
      for (let i = 1; i <= 3; i++) this.rot(`neck${i}`, Math.sin(t * 1.6 - i) * 0.04 + s.fly * NECK_FLY_EXTEND, Math.sin(t * 0.9 - i) * 0.06);
      const flapSpeed = s.fly > 0.1 ? 9 : moveAmt > 0.2 ? 4 : 1.6;
      const flapAmp = s.fly > 0.1 ? 0.9 : 0.12 + moveAmt * 0.2;
      const flap = Math.sin(t * flapSpeed) * flapAmp;
      this.rot('wingL', 0, 0, -flap);
      this.rot('wingR', 0, 0, flap);
      // Head pitch correction keeps the snout level (verified in tests/poses.test.ts).
      const headPitch = HEAD_LEVEL + s.fly * HEAD_FLY_LEVEL;
      this.rot('head', headPitch);
      this.rot('jaw');

      if (s.special >= 0) {
        // Breath: rear the head back, then thrust forward with the jaw open.
        const up = s.special < 0.6 ? ease(s.special / 0.6) : 1 - ease((s.special - 0.6) / 0.4);
        this.rot('neck1', -0.5 * up);
        this.rot('head', headPitch - 0.2 + 0.3 * (1 - up));
        this.rot('jaw', 0.6);
      }
      if (s.attack >= 0) {
        const a = s.attack;
        if (s.attackKind === 'bite') {
          const lunge = a < 0.5 ? -ease(a / 0.5) * 0.5 : -0.5 + ease((a - 0.5) / 0.5) * 0.9;
          this.rot('neck1', lunge * 0.8);
          this.rot('head', headPitch - lunge * 0.4);
          this.rot('jaw', a < 0.55 ? 0.7 : 0.1);
        } else if (s.attackKind === 'slam') {
          const rear = a < 0.6 ? ease(a / 0.6) : 1 - ease((a - 0.6) / 0.4);
          this.rot('body', -rear * 0.5);
          this.rot('legFL', -rear * 1.2);
          this.rot('legFR', -rear * 1.2);
        }
      }
      return;
    }

    // Humanoid
    this.rot('legL', sw * 0.7 * moveAmt);
    this.rot('legR', -sw * 0.7 * moveAmt);
    this.offset('body', 0, Math.abs(sw) * 0.06 * moveAmt + breathe);
    this.rot('body', hurtLean + moveAmt * 0.08);
    this.rot('head', -moveAmt * 0.05, Math.sin(t * 0.7) * 0.05);
    // The arms hang a little out from the sides (armL is at +X, armR at -X), so the fists clear the hips and skirts.
    this.rot('armL', -sw * 0.5 * moveAmt, 0, ARM_SPLAY);
    this.rot('armR', sw * 0.3 * moveAmt, 0, -ARM_SPLAY);
    this.rot('sock_handR');
    this.rot('tail1', 0, Math.sin(t * 3) * 0.3);
    this.rot('tail2', 0, Math.sin(t * 3 - 0.8) * 0.4);

    if (s.attack >= 0) this.attackPose(s);
    this.followShoulders();
  }

  /**
   * Pauldrons live on the torso's shoulder sockets but must ride the upper arm: rotate each
   * shoulder socket by most of its arm's rotation (plate articulates, it doesn't fully follow).
   */
  private followShoulders() {
    for (const side of ['L', 'R']) {
      const arm = this.parts.get(`arm${side}`);
      const sock = this.parts.get(`sock_shoulder${side}`);
      if (!arm || !sock || arm.parent !== sock.parent) continue;
      // The arm's rotation away from rest, partially applied (slerp from identity).
      const armBaseQ = QA.setFromEuler(this.baseRot.get(arm)!);
      const delta = QB.copy(armBaseQ).invert().multiply(arm.quaternion);
      const partial = QC.identity().slerp(delta, SHOULDER_FOLLOW);
      const turn = QD.copy(armBaseQ).multiply(partial).multiply(QA.copy(armBaseQ).invert());
      // Orbit the pauldron around the shoulder joint (the arm's pivot) and turn it with the arm.
      const armPos = this.basePos.get(arm)!, sockPos = this.basePos.get(sock)!;
      sock.position.copy(V1.copy(sockPos).sub(armPos).applyQuaternion(turn).add(armPos));
      sock.quaternion.copy(turn).multiply(QB.setFromEuler(this.baseRot.get(sock)!));
    }
  }

  /**
   * Attack poses over progress 0..1. Every kind is built around IMPACT (the frame the game
   * resolves the hit): a long wind-up before it, a fast strike through it, a follow-through after.
   */
  private attackPose(s: AnimState) {
    const a = s.attack;
    switch (s.attackKind) {
      case 'swing': {
        // Wind up overhead, whip down through the target (mid-strike at the impact), recover.
        const up = IMPACT - 0.1, down = IMPACT + 0.1;
        let x: number;
        if (a < up) x = -3.2 * ease(a / up);
        else if (a < down) x = -3.2 + 2.85 * ease((a - up) / (down - up));
        // The strike ends with the arm still a little forward so long tools (pickaxe) clear the ground.
        else x = -0.35 * (1 - ease((a - down) / (1 - down)));
        this.rot('armR', x, 0, -ARM_SPLAY);
        // Wrist: cock the blade back over the head in the windup, keep it through the impact, relax after.
        const wrist = a < IMPACT ? SWING_WRIST * ease(Math.min(1, a / up)) : SWING_WRIST * (1 - ease((a - IMPACT) / (1 - IMPACT)));
        this.rot('sock_handR', wrist);
        this.rot('body', a < up ? -0.1 : 0.15, a < up ? 0.3 * ease(a / up) : -0.3 * (1 - a), 0);
        break;
      }
      case 'slam': {
        const x = a < IMPACT ? -3.0 * ease(a / IMPACT) : -3.0 + 2.8 * ease((a - IMPACT) / (1 - IMPACT));
        this.rot('armR', x, 0, -ARM_SPLAY);
        this.rot('armL', x, 0, ARM_SPLAY);
        this.rot('body', a < IMPACT ? -0.2 : 0.25);
        break;
      }
      case 'bow': {
        // Side-on archer stance: the bow shoulder (right, -X) turns to lead, the bow arm points
        // straight at the target, the draw hand anchors under the chin on the same line, and the
        // head turns to look down the arrow. Verified numerically with __bowReport (dev/poseCheck).
        const raise = ease(Math.min(1, a / 0.2));
        const draw = bowDrawAmount(a);
        this.root.rotation.y = (Math.PI / 2) * raise;
        this.rot('armR', 0, 0, (-Math.PI / 2) * raise);
        this.rot('sock_handR', BOW_SOCKET[0] * raise, BOW_SOCKET[1] * raise, BOW_SOCKET[2] * raise);
        // Draw arm: up to the anchor on the arrow line while the bow rises; it holds the string there to release.
        this.rot('armL', BOW_ANCHOR[0] * raise, 0, BOW_ANCHOR[1] * raise);
        this.rot('head', 0, (-Math.PI / 2) * 0.85 * raise);
        break;
      }
      case 'cast': {
        const lift = a < IMPACT ? ease(a / IMPACT) : 1 - ease((a - IMPACT) / (1 - IMPACT));
        const armX = -1.2 - 1.0 * lift;
        this.rot('armR', armX);
        // Keep the staff mostly upright, leaning slightly toward the target at the peak.
        this.rot('sock_handR', -armX + 0.35);
        this.rot('armL', -1.0 - 0.8 * lift);
        this.rot('body', -0.1 * lift);
        break;
      }
      case 'throw': {
        const x = a < IMPACT ? -2.6 * ease(a / IMPACT) : -2.6 + 2.0 * ease((a - IMPACT) / (1 - IMPACT));
        this.rot('armR', x);
        break;
      }
      case 'bite':
        this.rot('head', -0.4 * Math.sin(a * Math.PI));
        break;
    }
  }
}
