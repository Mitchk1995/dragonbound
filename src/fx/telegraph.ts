import * as THREE from 'three';

export type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'cone'; r: number; angle: number; dir: number }
  | { kind: 'ring'; r: number; inner: number };

/** Is a point (with its own radius) inside a shape placed at `at`? `dir` is an angle in the XZ plane (atan2(dz, dx)). */
export function shapeContains(shape: Shape, atX: number, atZ: number, px: number, pz: number, pr = 0): boolean {
  const dx = px - atX, dz = pz - atZ;
  const d = Math.hypot(dx, dz);
  switch (shape.kind) {
    case 'circle':
      return d <= shape.r + pr * 0.6;
    case 'ring':
      return d <= shape.r + pr * 0.6 && d >= shape.inner - pr * 0.6;
    case 'cone': {
      if (d > shape.r + pr * 0.6) return false;
      if (d < 0.8) return true;
      let diff = Math.atan2(dz, dx) - shape.dir;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      return Math.abs(diff) <= shape.angle / 2 + Math.atan2(pr, d) * 0.6;
    }
  }
}

function shapeGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape.kind) {
    case 'circle':
      return new THREE.CircleGeometry(shape.r, 40);
    case 'ring':
      return new THREE.RingGeometry(shape.inner, shape.r, 40);
    case 'cone':
      return new THREE.CircleGeometry(shape.r, 24, -shape.angle / 2, shape.angle);
  }
}

/**
 * A ground warning that fills up until it resolves. Every enemy special attack in the game
 * uses one, so danger is always readable before it lands.
 */
export class Telegraph {
  readonly group = new THREE.Group();
  private fill: THREE.Mesh;
  private base: THREE.Mesh;
  t = 0;
  done = false;

  constructor(
    public x: number,
    public z: number,
    public shape: Shape,
    public duration: number,
    public onResolve: (t: Telegraph) => void,
    color = 0xff3a1a,
  ) {
    const geo = shapeGeometry(shape);
    const baseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false });
    this.base = new THREE.Mesh(geo, baseMat);
    this.fill = new THREE.Mesh(geo, fillMat);
    for (const m of [this.base, this.fill]) {
      m.rotation.x = -Math.PI / 2;
      this.group.add(m);
    }
    if (shape.kind !== 'ring') {
      const edge = new THREE.Mesh(
        shape.kind === 'circle' ? new THREE.RingGeometry(shape.r - 0.08, shape.r, 40) : new THREE.RingGeometry(shape.r - 0.1, shape.r, 24, 1, -shape.angle / 2, shape.angle),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      edge.rotation.x = -Math.PI / 2;
      this.group.add(edge);
    }
    this.group.position.set(x, 0.04, z);
    if (shape.kind === 'cone') this.group.rotation.y = -shape.dir;
    this.group.renderOrder = 2;
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    const p = Math.min(1, this.t / this.duration);
    if (this.shape.kind === 'ring') {
      (this.fill.material as THREE.MeshBasicMaterial).opacity = 0.1 + p * 0.45;
    } else {
      const s = Math.max(0.001, p);
      this.fill.scale.set(s, s, 1);
    }
    (this.base.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(this.t * 18) * 0.05;
    if (p >= 1 && !this.done) {
      this.done = true;
      this.onResolve(this);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
