import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, cameraProjectionMatrix, modelViewMatrix, positionGeometry, vec4 } from 'three/tsl';

export interface BurstOpts {
  count: number;
  color: number | number[];
  speed?: number;
  up?: number;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  spread?: number;
}

/** Radial falloff sprite for additive glow particles (bright core, soft edge). */
function softDot() {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const v = Math.max(0, 1 - d);
    const a = Math.round(255 * (v * v * 0.7 + Math.pow(v, 8) * 0.3));
    data.set([a, a, a, 255], (y * n + x) * 4);
  }
  const t = new THREE.DataTexture(data, n, n);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Pooled particles on a single InstancedMesh. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private p: Float32Array;
  private v: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private spin: Float32Array;
  private col: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private t = new THREE.Vector3();
  private c = new THREE.Color();
  /** Glow particles: each one's centre and size (the billboard faces the camera from there). */
  private bill: THREE.InstancedBufferAttribute | null = null;

  constructor(private max: number, additive: boolean) {
    const opts = {
      transparent: additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive,
      map: additive ? softDot() : null,
    };
    // Solid particles are chunky cubes (debris, sparks); glow particles are soft camera-facing discs.
    let mat: THREE.Material, geo: THREE.BufferGeometry;
    if (additive) {
      geo = new THREE.PlaneGeometry(1, 1);
      this.bill = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      geo.setAttribute('aBill', this.bill);
      const glow = new MeshBasicNodeMaterial(opts);
      const bill = attribute('aBill', 'vec4');
      const mv = modelViewMatrix.mul(vec4(bill.xyz, 1));
      glow.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(bill.w).mul(2.2)), mv.zw));
      mat = glow;
    } else {
      geo = new THREE.BoxGeometry(1, 1, 1);
      mat = new THREE.MeshBasicMaterial(opts);
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.col = new Float32Array(max * 3);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.spin[i] = Math.random() * 6;
    this.c.setHex(color);
    this.col.set([this.c.r, this.c.g, this.c.b], i * 3);
  }

  burst(pos: THREE.Vector3, o: BurstOpts) {
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    const speed = o.speed ?? 4;
    for (let k = 0; k < o.count; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (o.spread ?? 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn(
        pos.x + Math.cos(a) * r * 0.3, pos.y, pos.z + Math.sin(a) * r * 0.3,
        Math.cos(a) * sp, (o.up ?? 3) * (0.5 + Math.random()), Math.sin(a) * sp,
        (o.life ?? 0.6) * (0.6 + Math.random() * 0.8), (o.size ?? 0.15) * (0.6 + Math.random() * 0.8),
        colors[k % colors.length], o.gravity ?? 9, o.drag ?? 1.5,
      );
    }
  }

  /** Drop every live particle (zone change: effects never carry over). */
  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        this.copy(this.n, i);
        continue;
      }
      const j = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[j] *= d;
      this.v[j + 1] = this.v[j + 1] * d - this.grav[i] * dt;
      this.v[j + 2] *= d;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.05 && this.grav[i] > 0) {
        this.p[j + 1] = 0.05;
        this.v[j + 1] *= -0.3;
        this.v[j] *= 0.6;
        this.v[j + 2] *= 0.6;
      }
      const f = this.life[i] / this.maxLife[i];
      const sc = this.size[i] * Math.min(1, f * 2.5);
      this.spin[i] += dt * 5;
      this.e.set(this.spin[i], this.spin[i] * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.set(sc, sc, sc);
      this.t.set(this.p[j], this.p[j + 1], this.p[j + 2]);
      this.m.compose(this.t, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.bill?.setXYZW(i, this.t.x, this.t.y, this.t.z, sc);
      this.c.setRGB(this.col[j], this.col[j + 1], this.col[j + 2]);
      this.mesh.setColorAt(i, this.c);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.bill) this.bill.needsUpdate = true;

  }

  private copy(from: number, to: number) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) {
      this.p[to * 3 + k] = this.p[from * 3 + k];
      this.v[to * 3 + k] = this.v[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.spin[to] = this.spin[from];
  }
}
