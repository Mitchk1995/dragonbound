import * as THREE from 'three';
import type { Game } from '../game';
import { PAL } from '../render/kit';

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
    obj.removeFromParent();
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
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

  arc(x: number, z: number, dir: number, r: number, angle: number, color: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.55, r, 20, 1, -angle / 2, angle),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    g.position.set(x, 1.0, z);
    g.rotation.y = -dir;
    this.add(g, 0.16, (f) => {
      (m.material as THREE.MeshBasicMaterial).opacity = f * 0.7;
      g.scale.setScalar(1 + (1 - f) * 0.25);
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
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, blending: THREE.AdditiveBlending }));
    this.add(line, 0.18, (f) => ((line.material as THREE.LineBasicMaterial).opacity = f));
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
