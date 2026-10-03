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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const QA = new THREE.Quaternion(), QB = new THREE.Quaternion(), QC = new THREE.Quaternion(), QD = new THREE.Quaternion();
const V1 = new THREE.Vector3();

/** Dragon head/neck levelling; tuned against tests/poses.test.ts. */
export const HEAD_LEVEL = 0.35;
export const HEAD_FLY_LEVEL = -0.2;
export const NECK_FLY_EXTEND = 0.3;

/** Where the blow lands in every attack animation (see COMBAT_TUNING.impact). */
const IMPACT = COMBAT_TUNING.impact;

/** How far the hanging arms turn out from the body (radians, about Z); tools/blender/fitcheck.py poses with it. */
export const ARM_SPLAY = 0.1;

/** How much of the upper arm's rotation the pauldron follows (see Rig.followShoulders). */
export const SHOULDER_FOLLOW = 0.75;

/**
 * How a humanoid carries what is in its right hand. Every hand is a LEGO hand (tools/blender/_common.py clip_hand):
 * whatever it holds runs through its hole, at right angles to the forearm. 'upright': a staff, carried upright
 * through the hand with the forearm forward; 'bow': a bow, carried the same way but plumb and out from the body
 * (BOW_OUT); 'side': a blade, club or tool, the arm hanging and the wrist tipping it a little down;
 * 'empty': nothing in it (a kobold's sling hangs free). The hero's comes from the weapon (registry.ts HeroDresser,
 * root.userData.hold); a creature's from its model: a part named 'staffbody' is a staff held upright, one named
 * 'weapon' is carried at the side.
 */
export type Hold = 'upright' | 'bow' | 'side' | 'empty';

/** Elbows bend about their X axis, negative bringing the forearm forward (like a raised arm's x), and then turn about
 * the upper arm (y, the Euler order 'YXZ': negative swings the bent forearm toward -X). LEGO arms rest a little
 * bent. */
export const ELBOW_REST = -0.25;
/** The upright and bow holds: the forearm level and forward, high enough that the hand clears belts and hips, so the
 * staff or bow through the hand stands upright... */
export const HOLD_BEND = -1.57;
/** ...the wrist tipping a staff a touch toward the target. */
export const HOLD_WRIST = 0.17;
/** A bow's limbs sweep in toward its string, which lies on the body's side of the hand (BOW_STRING), so a bow is
 * carried out from the body, its lower limb clear of the striding leg: the arm a little further out (BOW_OUT, about
 * Z), the forearm turned out at the elbow (BOW_CARRY, the elbow's turn) and the wrist rolling the bow back to plumb
 * (BOW_PLUMB, about the forearm). */
export const BOW_OUT = 0.2;
export const BOW_CARRY = -0.5;
export const BOW_PLUMB = -0.2;
/** Whether a hold carries its forearm level and forward (a staff or a bow). */
const forearmForward = (hold: Hold) => hold === 'upright' || hold === 'bow';
/** The hand at the side tips its blade or tool a little down (the wrist, about X; positive turns it toward the
 * forearm's line). */
export const SIDE_WRIST = 0.5;

/**
 * Sword swing. The wind-up raises the upper arm forward and up (WIND_ARM) and folds the forearm back over the
 * shoulder (WIND_ELBOW), the wrist cocking the blade up and back in line with the forearm (SWING_WRIST); the strike
 * straightens the arm through the target (STRIKE_ELBOW) and the wrist relaxes after the blow.
 */
export const WIND_ARM = 2.6;
export const WIND_ELBOW = -1.0;
export const SWING_WRIST = 1.3;
export const STRIKE_ELBOW = -0.15;

/** Cast: the staff arm lifts forward (CAST_ARM), the forearm opening out of the hold (CAST_ELBOW) while the wrist
 * keeps the staff upright, leaning at the target (CAST_WRIST); the free hand reaches toward the target (CAST_REACH). */
export const CAST_ARM = 2.1;
export const CAST_ELBOW = -0.1;
export const CAST_WRIST = 0.885;
export const CAST_REACH = 1.7;

/**
 * Bow shot, side-on: the body turns BOW_TURN so the bow shoulder (right, -X) leads, the head turns to look down the
 * arrow and the straight bow arm points the bow at the target, the bow hand turned so the bow stands upright through
 * it with the string toward the archer and the arrow, drawn through the middle of the string (BOW_MID above the
 * hand, gear.py), level and at the target. The draw hand reaches that arrow line (Rig.reach): it takes the string
 * DRAW_GRAB behind the bow's middle while the bow comes up and draws it back to DRAW_ANCHOR, against the cheek, by
 * bending the elbow, the elbow swung toward DRAW_POLE so the arm stays clear of the chest. The string runs through
 * the draw hand's hole and the arrow leaves through the slot of its C.
 */
export const BOW_TURN = Math.PI / 2;
export const BOW_HEAD = 0.85;
/** Where the straight bow arm points, from the right shoulder (body space, unit-free). */
export const BOW_AIM: [number, number, number] = [-0.807, 0.07, 0.586];
/** How the straight bow arm rolls: its local +Z (the inside of its elbow) turned up, so its shoulder armour stays
 * clear of the chest and helm. */
export const BOW_ROLL: [number, number, number] = [0, 1, 0.3];
export const BOW_MID = 0.15;
/** The side of the hand the bow's string lies on, in the hand socket's frame (gear.py bow_frame turns the bow a
 * quarter round in the hand, so carried upright its string runs beside the forearm, not back through it). */
export const BOW_STRING: [number, number, number] = [1, 0, 0];
export const DRAW_GRAB = 1.29;
export const DRAW_ANCHOR = 1.35;
export const DRAW_POLE: [number, number, number] = [1, 0.1, 0.6];

/** Procedural animation over named rigid parts. */
export class Rig {
  private parts = new Map<string, THREE.Object3D>();
  private baseRot = new Map<THREE.Object3D, THREE.Euler>();
  private basePos = new Map<THREE.Object3D, THREE.Vector3>();
  private phase = 0;
  private time = Math.random() * 10;
  readonly quadruped: boolean;
  /** A creature's own hold, from what its model carries (see Hold). */
  private readonly modelHold: Hold;

  constructor(public root: THREE.Object3D, public stride = 2.2) {
    root.traverse((o) => {
      if (o.name && !this.parts.has(o.name)) {
        // An elbow bends, then turns about the upper arm (see ELBOW_REST).
        if (o.name === 'elbowL' || o.name === 'elbowR') o.rotation.reorder('YXZ');
        this.parts.set(o.name, o);
        this.baseRot.set(o, o.rotation.clone());
        this.basePos.set(o, o.position.clone());
      }
    });
    this.quadruped = this.parts.has('legFL');
    this.modelHold = this.parts.has('staffbody') ? 'upright' : this.parts.has('weapon') ? 'side' : 'empty';
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

  /** The right hand's hold (see Hold). */
  hold(): Hold {
    return (this.root.userData.hold as Hold | undefined) ?? this.modelHold;
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
      // Rearing for the slam tips the body back about its middle; the tail's root lifts a little more than that, so the
      // tail rides up behind to balance instead of swinging down through the ground.
      const a = s.attack;
      const rear = a >= 0 && s.attackKind === 'slam' ? (a < 0.6 ? ease(a / 0.6) : 1 - ease((a - 0.6) / 0.4)) : 0;
      for (let i = 1; i <= 6; i++) {
        this.rot(`tail${i}`, Math.sin(t * 1.3 - i * 0.5) * 0.05 + (i === 1 ? rear * 0.6 : 0), Math.sin(t * 2 - i * 0.7) * (0.12 + i * 0.04) * (1 + moveAmt));
      }
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
      if (a >= 0) {
        if (s.attackKind === 'bite') {
          const lunge = a < 0.5 ? -ease(a / 0.5) * 0.5 : -0.5 + ease((a - 0.5) / 0.5) * 0.9;
          this.rot('neck1', lunge * 0.8);
          this.rot('head', headPitch - lunge * 0.4);
          this.rot('jaw', a < 0.55 ? 0.7 : 0.1);
        } else if (s.attackKind === 'slam') {
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
    // The arms hang a little out from the sides (armL is at +X, armR at -X), so the hands clear the hips and skirts,
    // and swing with the stride, the elbows bending a little more as each arm swings forward. A staff or bow swings
    // less and keeps its forearm level through the stride, so it stays upright; a bow is carried out from the body.
    const hold = this.hold(), fore = forearmForward(hold), bow = hold === 'bow';
    const swingL = -sw * 0.5 * moveAmt, swingR = sw * (fore ? 0.15 : 0.3) * moveAmt;
    this.rot('armL', swingL, 0, ARM_SPLAY);
    this.rot('armR', swingR, 0, -ARM_SPLAY - (bow ? BOW_OUT : 0));
    this.rot('elbowL', ELBOW_REST + Math.min(0, swingL) * 0.5);
    this.rot('elbowR', fore ? HOLD_BEND - swingR : ELBOW_REST + Math.min(0, swingR) * 0.5, bow ? BOW_CARRY : 0);
    // A blade or tool at the side is carried steady: the wrist counters the arm's swing.
    this.rot('handL');
    this.rot('handR', hold === 'side' ? SIDE_WRIST - swingR : hold === 'upright' ? HOLD_WRIST : 0, bow ? BOW_PLUMB : 0);
    this.rot('tail1', 0, Math.sin(t * 3) * 0.3);
    this.rot('tail2', 0, Math.sin(t * 3 - 0.8) * 0.4);

    if (s.attack >= 0) this.attackPose(s, hold);
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
  private attackPose(s: AnimState, hold: Hold) {
    const a = s.attack;
    // Where the right arm rests in this hold, so every attack starts and ends there.
    const e0 = forearmForward(hold) ? HOLD_BEND : ELBOW_REST;
    const w0 = hold === 'side' ? SIDE_WRIST : hold === 'upright' ? HOLD_WRIST : 0;
    switch (s.attackKind) {
      case 'swing': {
        // Wind up overhead, whip down through the target (mid-strike at the impact), recover.
        const up = IMPACT - 0.1, down = IMPACT + 0.1;
        let x: number, e: number;
        if (a < up) {
          const k = ease(a / up);
          x = -WIND_ARM * k;
          e = lerp(e0, WIND_ELBOW, k);
        } else if (a < down) {
          const k = ease((a - up) / (down - up));
          x = -WIND_ARM + (WIND_ARM - 0.35) * k;
          e = lerp(WIND_ELBOW, STRIKE_ELBOW, k);
        } else {
          // The strike ends with the arm still a little forward so long tools (pickaxe) clear the ground.
          const k = ease((a - down) / (1 - down));
          x = -0.35 * (1 - k);
          e = lerp(STRIKE_ELBOW, e0, k);
        }
        this.rot('armR', x, 0, -ARM_SPLAY);
        this.rot('elbowR', e);
        // Wrist: cock the blade back in line with the forearm in the wind-up, keep it through the impact, relax after.
        const wrist = a < IMPACT ? lerp(w0, SWING_WRIST, ease(Math.min(1, a / up))) : lerp(SWING_WRIST, w0, ease((a - IMPACT) / (1 - IMPACT)));
        this.rot('handR', wrist);
        this.rot('body', a < up ? -0.1 : 0.15, a < up ? 0.3 * ease(a / up) : -0.3 * (1 - a), 0);
        break;
      }
      case 'slam': {
        // Both arms up, the forearms folding back over the head, then down hard, the arms straightening.
        const up = a < IMPACT ? ease(a / IMPACT) : 1 - ease((a - IMPACT) / (1 - IMPACT));
        const x = a < IMPACT ? -3.0 * ease(a / IMPACT) : -3.0 + 2.8 * ease((a - IMPACT) / (1 - IMPACT));
        this.rot('armR', x, 0, -ARM_SPLAY);
        this.rot('armL', x, 0, ARM_SPLAY);
        this.rot('elbowR', lerp(e0, -0.5, up));
        this.rot('elbowL', lerp(ELBOW_REST, -0.5, up));
        this.rot('body', a < IMPACT ? -0.2 : 0.25);
        break;
      }
      case 'bow':
        this.bowPose(a);
        break;
      case 'cast': {
        const lift = a < IMPACT ? ease(a / IMPACT) : 1 - ease((a - IMPACT) / (1 - IMPACT));
        // The staff rises high and forward out of the hold, still upright and leaning at the target; the free hand
        // reaches toward the target.
        this.rot('armR', -CAST_ARM * lift, 0, -ARM_SPLAY);
        this.rot('elbowR', lerp(e0, CAST_ELBOW, lift));
        this.rot('handR', lerp(w0, CAST_WRIST, lift));
        this.rot('armL', -CAST_REACH * lift, 0, ARM_SPLAY);
        this.rot('elbowL', lerp(ELBOW_REST, -0.35, lift));
        this.rot('body', -0.1 * lift);
        break;
      }
      case 'throw': {
        // Wind the arm back over the shoulder, the elbow folded, then whip it forward and straighten it at the release.
        const x = a < IMPACT ? -2.6 * ease(a / IMPACT) : -2.6 + 2.0 * ease((a - IMPACT) / (1 - IMPACT));
        const e = a < IMPACT ? lerp(e0, -1.1, ease(a / IMPACT)) : lerp(-1.1, e0, ease((a - IMPACT) / (1 - IMPACT)));
        this.rot('armR', x);
        this.rot('elbowR', e);
        break;
      }
      case 'bite':
        this.rot('head', -0.4 * Math.sin(a * Math.PI));
        break;
    }
  }

  /** The bow shot (see BOW_TURN). */
  private bowPose(a: number) {
    const raise = ease(Math.min(1, a / 0.2));
    this.root.rotation.y = BOW_TURN * raise;
    this.rot('head', 0, -BOW_TURN * BOW_HEAD * raise);
    const armR = this.parts.get('armR'), sock = this.parts.get('sock_handR');
    if (!this.parts.get('body') || !armR || !sock) return;
    // Bow arm: straight, pointing the bow at the target; its hold turns into the aim as the bow comes up.
    this.pointArm(armR, B.aim.fromArray(BOW_AIM).normalize(), B.front.fromArray(BOW_ROLL), raise);
    this.rot('elbowR', lerp(HOLD_BEND, 0, raise), lerp(BOW_CARRY, 0, raise));
    // Bow hand: the bow upright through it (the hand's +Z up) and its string, on the hand's +X side (BOW_STRING), toward
    // the archer (body +X): the hand's +Y turns to body -Z.
    this.orientHand('R', B.up.set(0, 1, 0), B.back.set(0, 0, -1), raise);
    // Draw hand: onto the arrow line, where it takes the string, then back to the anchor at the cheek, where it holds
    // after the release.
    const s = this.bodySpace(sock, B.m);
    const target = B.target.set(0, BOW_MID, 0).applyMatrix4(s);
    const back = B.back.fromArray(BOW_STRING).transformDirection(s);
    target.addScaledVector(back, lerp(DRAW_GRAB, DRAW_ANCHOR, a < IMPACT ? bowDrawAmount(a) : 1));
    this.reach('L', target, B.pole.fromArray(DRAW_POLE).normalize(), raise);
    // The draw hand turns so the string runs through its hole (the hand's +Z along the bow), continuing its forearm.
    this.orientHand('L', B.up.set(0, 1, 0).transformDirection(s), null, raise);
  }

  /** A part's world matrix in the body's space (written into `out`). */
  private bodySpace(o: THREE.Object3D, out: THREE.Matrix4) {
    const body = this.parts.get('body')!;
    this.root.updateMatrixWorld(true);
    return out.copy(body.matrixWorld).invert().multiply(o.matrixWorld);
  }

  /**
   * Turns an arm (a shoulder pivot on the body, hanging down its local -Y) so it points along `dir` (body space), its
   * local +Z kept as near `front` as it can be, blended in by k from its current rotation.
   */
  private pointArm(arm: THREE.Object3D, dir: THREE.Vector3, front: THREE.Vector3, k: number) {
    const y = R.y.copy(dir).negate();
    const z = R.z.copy(front).projectOnPlane(y).normalize();
    const x = R.x.crossVectors(y, z);
    arm.quaternion.slerp(R.q.setFromRotationMatrix(R.m.makeBasis(x, y, z)), k);
  }

  /**
   * Two-bone reach: turns arm<side> and bends elbow<side> so the centre of the hand's hole lands on `target` (body
   * space), the elbow swung toward `pole`, blended in by k from the pose already set. The wrist is left as it is.
   */
  private reach(side: 'L' | 'R', target: THREE.Vector3, pole: THREE.Vector3, k: number) {
    const arm = this.parts.get(`arm${side}`), elbow = this.parts.get(`elbow${side}`), hand = this.parts.get(`hand${side}`);
    const sock = this.parts.get(side === 'L' ? 'sock_handL' : 'sock_gloveR');
    if (!arm || !elbow || !hand || !sock) return;
    const l1 = elbow.position.length(), l2 = R.x.copy(hand.position).add(sock.position).length();
    const toT = R.t.subVectors(target, this.basePos.get(arm)!);
    const dist = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const tDir = toT.normalize();
    const cosB = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const out = R.o.copy(pole).projectOnPlane(tDir).normalize();
    // The upper arm runs from the shoulder to the elbow, swung toward the pole; the forearm on to the target.
    const u = R.u.copy(tDir).multiplyScalar(cosB).addScaledVector(out, Math.sqrt(1 - cosB * cosB));
    const f = R.f.copy(tDir).multiplyScalar(dist).addScaledVector(u, -l1).normalize();
    const bend = Math.acos(THREE.MathUtils.clamp(u.dot(f), -1, 1));
    // The arm's local -Y runs down the upper arm and its +Z toward the forearm: the elbow bends about X, toward +Z.
    const z = R.z.copy(f).projectOnPlane(u).normalize();
    const y = R.y.copy(u).negate();
    const x = R.x.crossVectors(y, z);
    arm.quaternion.slerp(R.q.setFromRotationMatrix(R.m.makeBasis(x, y, z)), k);
    elbow.rotation.x = lerp(elbow.rotation.x, this.baseRot.get(elbow)!.x - bend, k);
  }

  /**
   * Turns hand<side> (a wrist pivot) so its hole runs along `axis` (body space, the hand's +Z) and its length back
   * along `along` (the hand's +Y, toward the wrist); without `along` the hand only twists on its forearm, its hole as
   * near `axis` as that allows. Blended in by k from the pose already set.
   */
  private orientHand(side: 'L' | 'R', axis: THREE.Vector3, along: THREE.Vector3 | null, k: number) {
    const hand = this.parts.get(`hand${side}`);
    if (!hand?.parent) return;
    const fore = this.bodySpace(hand.parent, R.m2);
    let y: THREE.Vector3, z: THREE.Vector3;
    if (along) {
      z = R.z.copy(axis).normalize();
      y = R.y.copy(along).projectOnPlane(z).normalize();
    } else {
      y = R.y.set(0, 1, 0).transformDirection(fore);
      z = R.z.copy(axis).projectOnPlane(y).normalize();
    }
    const x = R.x.crossVectors(y, z);
    const want = R.q.setFromRotationMatrix(R.m.makeBasis(x, y, z));
    hand.quaternion.slerp(R.q2.setFromRotationMatrix(fore).invert().multiply(want), k);
  }
}

/** Scratch space for the bow pose and its helpers (no allocation per frame). */
const B = {
  aim: new THREE.Vector3(), front: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3(),
  target: new THREE.Vector3(), pole: new THREE.Vector3(), m: new THREE.Matrix4(),
};
const R = {
  x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), t: new THREE.Vector3(), o: new THREE.Vector3(),
  u: new THREE.Vector3(), f: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(),
  m: new THREE.Matrix4(), m2: new THREE.Matrix4(),
};
