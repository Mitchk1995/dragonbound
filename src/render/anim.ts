import * as THREE from 'three';

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
      this.rot('body', hurtLean * 0.5 - s.fly * 0.15);
      for (let i = 1; i <= 6; i++) this.rot(`tail${i}`, Math.sin(t * 1.3 - i * 0.5) * 0.05, Math.sin(t * 2 - i * 0.7) * (0.12 + i * 0.04) * (1 + moveAmt));
      for (let i = 1; i <= 3; i++) this.rot(`neck${i}`, Math.sin(t * 1.6 - i) * 0.04, Math.sin(t * 0.9 - i) * 0.06);
      const flapSpeed = s.fly > 0.1 ? 9 : moveAmt > 0.2 ? 4 : 1.6;
      const flapAmp = s.fly > 0.1 ? 0.9 : 0.12 + moveAmt * 0.2;
      const flap = Math.sin(t * flapSpeed) * flapAmp;
      this.rot('wingL', 0, 0, -flap);
      this.rot('wingR', 0, 0, flap);
      this.rot('head');
      this.rot('jaw');

      if (s.special >= 0) {
        // Breath: rear the head back, then thrust forward with the jaw open.
        const up = s.special < 0.6 ? ease(s.special / 0.6) : 1 - ease((s.special - 0.6) / 0.4);
        this.rot('neck1', -0.5 * up);
        this.rot('head', 0.2 + 0.3 * (1 - up));
        this.rot('jaw', 0.6);
      }
      if (s.attack >= 0) {
        const a = s.attack;
        if (s.attackKind === 'bite') {
          const lunge = a < 0.5 ? -ease(a / 0.5) * 0.5 : -0.5 + ease((a - 0.5) / 0.5) * 0.9;
          this.rot('neck1', lunge * 0.8);
          this.rot('head', -lunge * 0.4);
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
    this.rot('armL', -sw * 0.5 * moveAmt, 0, -0.08);
    this.rot('armR', sw * 0.5 * moveAmt, 0, 0.08);
    this.rot('tail1', 0, Math.sin(t * 3) * 0.3);
    this.rot('tail2', 0, Math.sin(t * 3 - 0.8) * 0.4);

    if (s.attack < 0) return;
    const a = s.attack;
    switch (s.attackKind) {
      case 'swing': {
        // Wind up overhead, whip down through the target, recover.
        let x: number;
        if (a < 0.4) x = -3.2 * ease(a / 0.4);
        else if (a < 0.6) x = -3.2 + 3.0 * ease((a - 0.4) / 0.2);
        else x = -0.2 * (1 - ease((a - 0.6) / 0.4));
        this.rot('armR', x, 0, 0.1);
        this.rot('body', a < 0.4 ? -0.1 : 0.15, a < 0.4 ? 0.3 * ease(a / 0.4) : -0.3 * (1 - a), 0);
        break;
      }
      case 'slam': {
        const x = a < 0.5 ? -3.0 * ease(a / 0.5) : -3.0 + 2.8 * ease((a - 0.5) / 0.5);
        this.rot('armR', x);
        this.rot('armL', x);
        this.rot('body', a < 0.5 ? -0.2 : 0.25);
        break;
      }
      case 'bow': {
        const draw = a < 0.6 ? ease(a / 0.6) : 1 - ease((a - 0.6) / 0.4);
        this.rot('armL', -Math.PI / 2, 0.2);
        this.rot('armR', -Math.PI / 2 + 0.2 * draw, -0.3 - 0.5 * draw);
        this.rot('body', 0, -0.3);
        break;
      }
      case 'cast': {
        const lift = a < 0.5 ? ease(a / 0.5) : 1 - ease((a - 0.5) / 0.5);
        this.rot('armR', -1.2 - 1.0 * lift);
        this.rot('armL', -1.0 - 0.8 * lift);
        this.rot('body', -0.1 * lift);
        break;
      }
      case 'throw': {
        const x = a < 0.5 ? -2.6 * ease(a / 0.5) : -2.6 + 2.0 * ease((a - 0.5) / 0.5);
        this.rot('armR', x);
        break;
      }
      case 'bite':
        this.rot('head', -0.4 * Math.sin(a * Math.PI));
        break;
    }
  }
}
