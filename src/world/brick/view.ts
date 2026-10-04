import * as THREE from 'three';
import { studioEnv } from '../../render/env';
import { shareResource } from '../../render/resources';
import { windowGlass } from '../props';
import type { BrickBuild, Placed } from './build';
import type { ElementDef, MatSlot, Part } from './elements';
import { LDU } from './scale';
import { stud } from './shapes';

/**
 * Drawing a build: one instanced mesh per element shape (and per part of a two-colour element), so a
 * whole street of houses costs a few dozen draw calls whatever its brick count. Each instance takes
 * its element's colour. Studs are drawn as one more instanced mesh, one instance per stud that can
 * be seen: a stud under another element is never drawn, and shows again when a cut-away lifts what
 * stood on it.
 */

/**
 * The plastic: glossy moulded ABS. A dielectric with a smooth skin, so soft broad highlights from
 * the sun and a faint sheen of the sky on every face, never a mirror and never a sparkle (a
 * glossier finish puts pinpoint highlights on the bevels that flare in the bloom); the slopes'
 * grained faces are matte.
 */
const MATERIALS: Partial<Record<MatSlot, THREE.Material>> = {};
const glowMats = new Map<number, THREE.Material>();

export const PLASTIC = { roughness: 0.42, envMapIntensity: 0.35, grainRoughness: 0.66, grainEnv: 0.18 };

function material(slot: MatSlot, color?: number): THREE.Material {
  if (slot === 'glow') {
    let m = glowMats.get(color!);
    if (!m) glowMats.set(color!, (m = shareResource(new THREE.MeshStandardMaterial({ color: color!, emissive: color!, emissiveIntensity: 1.2, roughness: 0.3 }))));
    return m;
  }
  let m = MATERIALS[slot];
  if (m) return m;
  if (slot === 'glass') m = windowGlass();
  else {
    const grain = slot === 'grain';
    m = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0, roughness: grain ? PLASTIC.grainRoughness : PLASTIC.roughness,
      envMap: studioEnv(), envMapIntensity: grain ? PLASTIC.grainEnv : PLASTIC.envMapIntensity,
    });
  }
  return (MATERIALS[slot] = shareResource(m));
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geometry(e: ElementDef, k: number, part: Part): THREE.BufferGeometry {
  const id = `${e.id}#${k}`;
  let g = geoCache.get(id);
  if (!g) geoCache.set(id, (g = shareResource(part.mesh().geometry())));
  return g;
}
let studGeo: THREE.BufferGeometry | null = null;

interface Batch {
  mesh: THREE.InstancedMesh;
  items: Placed[];
  state?: 'shut' | 'open';
  /** A part's own colour (a door's iron, a lamp's glass), kept whatever colour the element takes. */
  fixed?: number;
}

interface Stud {
  owner: Placed;
  cover?: Placed;
  m: THREE.Matrix4;
}

const tmp = new THREE.Matrix4(), gone = new THREE.Matrix4(), col = new THREE.Color();

/** `m` shrunk to nothing where it stands (a hidden instance: its batch's bounds stay round the building). */
const shrunk = (m: THREE.Matrix4) => gone.makeScale(0, 0, 0).copyPosition(m);

export class BrickView {
  readonly group = new THREE.Group();
  /** Studs drawn (on top of everything shown, under nothing shown), over all copies. */
  visibleStuds = 0;
  private readonly batches: Batch[] = [];
  private readonly studs: Stud[] = [];
  private readonly studMesh: THREE.InstancedMesh;
  private shown: (p: Placed) => boolean = () => true;
  private readonly copies: THREE.Matrix4[];

  /**
   * `copies` (offsets in metres) draws the build once at each, in the same batches: a street of one
   * house costs the draw calls of one.
   */
  constructor(readonly build: BrickBuild, copies: THREE.Vector3[] = [new THREE.Vector3()]) {
    this.group.name = 'bricks';
    this.copies = copies.map((c) => new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
    const n = this.copies.length;
    const byEl = new Map<ElementDef, Placed[]>();
    for (const p of build.items) {
      const list = byEl.get(p.el);
      if (list) list.push(p);
      else byEl.set(p.el, [p]);
    }
    for (const [e, items] of byEl) {
      e.parts.forEach((part, k) => {
        const mesh = new THREE.InstancedMesh(geometry(e, k, part), material(part.mat, part.color), items.length * n);
        mesh.name = `${e.id}${k ? `#${k}` : ''}`;
        mesh.castShadow = part.mat !== 'glass' && part.mat !== 'glow';
        mesh.receiveShadow = part.mat !== 'glow';
        for (let c = 0; c < n; c++) items.forEach((p, i) => mesh.setColorAt(c * items.length + i, col.setHex(part.color ?? p.color)));
        this.batches.push({ mesh, items, state: part.state, fixed: part.color });
        this.group.add(mesh);
      });
    }
    // Every stud, with what (if anything) stands on it.
    for (const p of build.items) for (const s of build.studsOf(p)) {
      const m = new THREE.Matrix4().makeTranslation(s[0] * LDU, s[1] * LDU, s[2] * LDU);
      this.studs.push({ owner: p, cover: build.coverOf(s, p), m });
    }
    studGeo ??= shareResource(stud().geometry());
    // (A build with no studs keeps one slot, drawn none of.)
    this.studMesh = new THREE.InstancedMesh(studGeo, material('plastic'), Math.max(1, this.studs.length * n));
    this.studMesh.count = this.studs.length * n;
    this.studMesh.name = 'studs';
    this.studMesh.castShadow = this.studMesh.receiveShadow = true;
    for (let c = 0; c < n; c++) this.studs.forEach((s, i) => this.studMesh.setColorAt(c * this.studs.length + i, col.setHex(s.owner.color)));
    this.group.add(this.studMesh);
    this.setDoor('shut');
    this.setVisible(() => true);
  }

  /** Shows the placements `show` accepts and hides the rest; studs follow what stands on them. */
  setVisible(show: (p: Placed) => boolean) {
    this.shown = show;
    const m = new THREE.Matrix4();
    for (const b of this.batches) {
      this.copies.forEach((c, k) => b.items.forEach((p, i) => {
        const at = this.build.matrix(p, tmp);
        b.mesh.setMatrixAt(k * b.items.length + i, m.multiplyMatrices(c, show(p) ? at : shrunk(at)));
      }));
      b.mesh.instanceMatrix.needsUpdate = true;
      b.mesh.computeBoundingSphere();
      b.mesh.computeBoundingBox();
    }
    let n = 0;
    this.studs.forEach((s, i) => {
      const on = show(s.owner) && !(s.cover && show(s.cover));
      if (on) n++;
      this.copies.forEach((c, k) => this.studMesh.setMatrixAt(k * this.studs.length + i, m.multiplyMatrices(c, on ? s.m : shrunk(s.m))));
    });
    this.studMesh.instanceMatrix.needsUpdate = true;
    this.studMesh.computeBoundingSphere();
    this.visibleStuds = n * this.copies.length;
  }

  /** Draws each placement in the colour `color` gives it (fixed-colour parts keep theirs). */
  recolor(color: (p: Placed) => number) {
    for (const b of this.batches) {
      const fixed = b.fixed;
      this.copies.forEach((_, k) => b.items.forEach((p, i) => b.mesh.setColorAt(k * b.items.length + i, col.setHex(fixed ?? color(p)))));
      b.mesh.instanceColor!.needsUpdate = true;
    }
    this.copies.forEach((_, k) => this.studs.forEach((s, i) => this.studMesh.setColorAt(k * this.studs.length + i, col.setHex(color(s.owner)))));
    this.studMesh.instanceColor!.needsUpdate = true;
  }

  /** The door shut or swung open. */
  setDoor(state: 'shut' | 'open') {
    for (const b of this.batches) if (b.state) b.mesh.visible = b.state === state;
  }

  /**
   * What the view draws: elements and studs placed, draw calls and the triangles of what is shown per
   * frame (before shadows; hidden instances are shrunk to nothing but still pass through the GPU).
   */
  stats() {
    let tris = 0, calls = 0, shown = 0;
    for (const b of this.batches) {
      if (!b.mesh.visible) continue;
      const n = b.items.filter((p) => this.shown(p)).length * this.copies.length;
      shown += n;
      calls++;
      tris += (b.mesh.geometry.index!.count / 3) * n;
    }
    tris += (this.studMesh.geometry.index!.count / 3) * this.visibleStuds;
    return { elements: this.build.items.length, shown, studs: this.visibleStuds, calls: calls + 1, tris: Math.round(tris) };
  }

  dispose() {
    this.group.removeFromParent();
    for (const b of this.batches) b.mesh.dispose();
    this.studMesh.dispose();
  }
}
