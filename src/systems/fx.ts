import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { atan, Discard, Fn, If, length, positionGeometry, smoothstep, vec4 } from 'three/tsl';
import { own } from '../render/patch';
import { disposeObject } from '../render/resources';
import type { Game } from '../game';
import { PAL } from '../render/kit';

/**
 * A weapon slash's colour (see Fx.arc), shared by every slash: each reads its own sweep off its
 * material. HDR colour (above 1) so bloom catches the edge; soft inner and outer rims.
 */
const ARC = Fn(() => {
  const head = own.f('arcHead'), angle = own.f('arcAngle');
  const r = own.v2('arcR'), p = positionGeometry.xy;
  // 0..1 along the sweep, and 0 inner .. 1 outer.
  const t = atan(p.y, p.x).add(angle.mul(0.5)).div(angle).toVar();
  const rr = length(p).sub(r.x).div(r.y.sub(r.x)).toVar();
  If(t.greaterThan(head), () => {
    Discard();
  });
  // Brightest at the leading edge.
  const trail = smoothstep(head.sub(0.6), head, t).mul(0.85);
  const rim = smoothstep(0, 0.3, rr).mul(smoothstep(1, 0.8, rr));
  return vec4(own.color('arcColor').mul(rr.mul(rr).add(0.3)), trail.mul(rim).mul(own.f('arcFade')));
})();

interface FxMesh {

  obj: THREE.Object3D;
  life: number;
  max: number;
  tick?: (f: number, obj: THREE.Object3D) => void;
}

/** Short-lived visual effects. Everything is parented to the current zone so it's cleaned up on travel. */
export class Fx {
  private list: FxMesh[] = [];

  constructor(private g: Game) {}

  add(obj: THREE.Object3D, life: number, tick?: FxMesh['tick']) {
    this.g.zone.group.add(obj);
    this.list.push({ obj, life, max: life, tick });
  }

  clear() {
    for (const f of this.list) this.dispose(f.obj);
    this.list = [];
  }

  private dispose(obj: THREE.Object3D) {
    disposeObject(obj);
  }

  update(dt: number) {
    for (const f of this.list) {
      f.life -= dt;
      f.tick?.(Math.max(0, f.life / f.max), f.obj);
    }
    this.list = this.list.filter((f) => {
      if (f.life <= 0) this.dispose(f.obj);
      return f.life > 0;
    });
  }

  moveMarker(x: number, z: number) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x9fe070, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    this.add(ring, 0.35, (f, o) => {
      o.scale.setScalar(1 + (1 - f) * 0.8);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = f * 0.8;
    });
  }

  /**
   * A weapon slash: the arc sweeps in behind a bright leading edge, then trails off. HDR colour
   * (above 1) so bloom catches the edge; soft inner/outer rims so it reads as motion, not a disc.
   */
  arc(x: number, z: number, dir: number, r: number, angle: number, color: number) {
    const r0 = r * 0.45;
    const mat = Object.assign(new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }), {
      arcColor: new THREE.Color(color).multiplyScalar(1.7),
      arcHead: 0,
      arcFade: 1,
      arcAngle: angle,
      arcR: new THREE.Vector2(r0, r),
    });
    mat.colorNode = ARC;
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r, 28, 2, -angle / 2, angle), mat);
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    g.position.set(x, 1.0, z);
    g.rotation.y = -dir;
    const life = 0.3;
    this.add(g, life, (f) => {
      const age = 1 - f; // 0 → 1 over the effect
      mat.arcHead = Math.min(1, age * 3.2); // the sweep completes in ~0.09 s
      mat.arcFade = age < 0.35 ? 1 : 1 - (age - 0.35) / 0.65;
    });
  }

  dustRing(x: number, z: number, r: number, color = 0xb8a88a) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.08, z);
    this.add(m, 0.35, (f) => {
      m.scale.setScalar(r * (1.1 - f * 0.6));
      (m.material as THREE.MeshBasicMaterial).opacity = f * 0.8;
    });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      this.g.particles.spawn(x + Math.cos(a) * r * 0.5, 0.2, z + Math.sin(a) * r * 0.5, Math.cos(a) * r * 2, 1.5 + Math.random() * 2, Math.sin(a) * r * 2, 0.5, 0.2, i % 2 ? color : 0x6a5a48, 8, 3);
    }
  }

  gust(x: number, z: number, dir: number) {
    for (let i = 0; i < 50; i++) {
      const a = dir + (Math.random() - 0.5) * 1.8;
      const sp = 10 + Math.random() * 8;
      this.g.particles.spawn(x, 0.5 + Math.random() * 2, z, Math.cos(a) * sp, 0.5, Math.sin(a) * sp, 0.6, 0.12, 0xd8d0c0, 0, 2);
    }
  }

  fireBurst(x: number, z: number, r: number) {
    const pos = new THREE.Vector3(x, 0.3, z);
    this.g.glow.burst(pos, { count: Math.round(20 + r * 10), color: [PAL.fire, PAL.ember, 0xff3a0a, 0xffe080], speed: r * 3.2, up: 4, life: 0.55, gravity: 2, size: 0.28, spread: r });
    this.g.particles.burst(pos, { count: 10, color: [0x2a2020, 0x4a3a30], speed: r * 2, up: 5, life: 0.8, size: 0.14 });
  }

  lightning(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
    const pts: THREE.Vector3[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = i === 0 || i === n ? 0 : 0.5;
      pts.push(new THREE.Vector3(
        from.x + (to.x - from.x) * t + (Math.random() - 0.5) * j,
        from.y + (to.y - from.y) * t + (Math.random() - 0.5) * j,
        from.z + (to.z - from.z) * t + (Math.random() - 0.5) * j,
      ));
    }
    // WebGL lines are always 1 px wide (invisible at game resolution), so the bolt is geometry:
    // crossed ribbons (horizontal + vertical, readable from the top-down camera), a wide HDR halo
    // for bloom and a thin white-hot core.
    const ribbon = (width: number) => {
      const pos: number[] = [];
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dir = b.clone().sub(a).normalize();
        for (const side of [new THREE.Vector3().crossVectors(dir, up).normalize(), up]) {
          const o = side.clone().multiplyScalar(width / 2);
          const a0 = a.clone().sub(o), a1 = a.clone().add(o), b0 = b.clone().sub(o), b1 = b.clone().add(o);
          for (const v of [a0, b0, b1, a0, b1, a1]) pos.push(v.x, v.y, v.z);
        }
      }
      return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    };
    const group = new THREE.Group();
    const mats = [
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aa8ff).multiplyScalar(1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf4ff).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    ];
    group.add(new THREE.Mesh(ribbon(0.32), mats[0]), new THREE.Mesh(ribbon(0.08), mats[1]));
    this.add(group, 0.22, (f) => {
      mats[0].opacity = f * 0.45;
      // A quick double flicker, like a real strike.
      mats[1].opacity = f * (f > 0.55 && f < 0.7 ? 0.25 : 1);
    });
    this.g.glow.burst(new THREE.Vector3(to.x, to.y, to.z), { count: 8, color: [0xcfe8ff, 0x6aa8ff], speed: 5, up: 1, life: 0.25, gravity: 0, size: 0.1 });
  }

  /** Sparks from a pickaxe or hammer strike. */
  sparks(x: number, y: number, z: number, color = 0xffd080) {
    this.g.glow.burst(new THREE.Vector3(x, y, z), { count: 8, color: [color, 0xffffff], speed: 3, up: 3, life: 0.35, gravity: 6, size: 0.06 });
  }

  /** Swirl of light for portal travel and recall. */
  teleport(x: number, z: number, color = 0x9ab8ff) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      this.g.glow.spawn(x + Math.cos(a) * 0.8, 0.2 + Math.random() * 0.4, z + Math.sin(a) * 0.8, -Math.sin(a) * 2, 3 + Math.random() * 3, Math.cos(a) * 2, 0.9, 0.1, i % 2 ? color : 0xffffff, -1, 0.5);
    }
  }
}
