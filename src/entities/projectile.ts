import * as THREE from 'three';
import { missileLook } from '../fx/missiles';
import { shareResource } from '../render/resources';
import type { Enemy } from './enemy';

export type ProjectileKind = 'arrow' | 'bolt' | 'fireball' | 'rock';

export interface ProjectileOpts {
  kind: ProjectileKind;
  owner: 'player' | 'enemy';
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  dmg: number;
  crit?: boolean;
  range: number;
  pierce?: number;
  aoe?: number;
  source?: Enemy;
  onHitSlow?: boolean;
}

const geos: Partial<Record<ProjectileKind, THREE.BufferGeometry>> = {};
const mats: Partial<Record<ProjectileKind, THREE.Material>> = {};

function visual(kind: ProjectileKind): THREE.Mesh {
  // Spells are painted flames and lightning (fx/missiles.ts), laid along their flight.
  if (kind === 'bolt' || kind === 'fireball') {
    const look = missileLook(kind);
    return new THREE.Mesh(look.geometry, look.material);
  }
  if (!geos[kind]) {
    switch (kind) {
      case 'arrow':
        geos[kind] = new THREE.BoxGeometry(0.06, 0.06, 0.8);
        mats[kind] = new THREE.MeshBasicMaterial({ color: 0xf0e0c0 });
        break;
      case 'rock':
        geos[kind] = new THREE.DodecahedronGeometry(0.16, 0);
        mats[kind] = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, flatShading: true });
        break;
    }
    shareResource(geos[kind]!);
    shareResource(mats[kind]!);
  }
  return new THREE.Mesh(geos[kind], mats[kind]);
}

export class Projectile {
  readonly mesh: THREE.Mesh;
  traveled = 0;
  dead = false;
  hit = new Set<Enemy>();
  pierceLeft: number;

  constructor(public o: ProjectileOpts) {
    this.mesh = visual(o.kind);
    this.mesh.position.set(o.x, o.kind === 'rock' ? 1.0 : 1.2, o.z);
    this.mesh.rotation.y = Math.atan2(o.dirX, o.dirZ);
    this.pierceLeft = o.pierce ?? 0;
  }

  get x() {
    return this.mesh.position.x;
  }
  get z() {
    return this.mesh.position.z;
  }

  step(dt: number) {
    const d = this.o.speed * dt;
    this.mesh.position.x += this.o.dirX * d;
    this.mesh.position.z += this.o.dirZ * d;
    this.traveled += d;
    if (this.o.kind === 'rock') this.mesh.rotation.x += dt * 10;
    if (this.o.kind === 'rock') this.mesh.position.y = 1.0 + Math.sin((this.traveled / this.o.range) * Math.PI) * 0.8;
    if (this.traveled >= this.o.range) this.dead = true;
  }
}
