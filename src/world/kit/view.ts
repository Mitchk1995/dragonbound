import * as THREE from 'three';
import { shareResource } from '../../render/resources';
import { windowGlass } from '../props';
import type { KitBuild, Placed } from './build';
import type { ElementDef, Part } from './elements';
import { plainGeometry, texturedGeometry } from './geometry';
import { kitMaterial, plantMaterial } from './surfaces';

/**
 * Drawing a build: one instanced mesh per piece shape (its textured parts drawn as one; its glass and
 * glowing glass apart), so a whole street of houses costs the draw calls of one house whatever its
 * stone count. Every textured piece is drawn with the kit's one material (its surface picked by the
 * texture array's layer); each instance takes its piece's colour (`aTint`), and the material gives
 * each its own patch of the texture and a tone of its own from where it stands.
 *
 * What lasts and what a view owns: the shapes' vertex data (built once, below), the kit's material,
 * its texture arrays and the props' models are cached for the session and never freed by a view.
 * Each view draws the shapes through geometries of its own over the cached arrays, so the buffers the
 * renderer uploads for them are the view's alone: freeing a view frees exactly those, its colours and
 * its placements, and nothing another view still draws from. (The renderer destroys every buffer of a
 * geometry when it is disposed, so two views must never draw from one buffer.)
 */

const glowMats = new Map<number, THREE.Material>();
let glass: THREE.Material | null = null;

/** Is a part drawn apart from the kit's textured material (glass, glowing glass, a plant's cards)? */
const plain = (p: Part) => p.look === 'glass' || p.look === 'glow' || p.look === 'card';

function plainMaterial(part: Part): THREE.Material {
  if (part.look === 'glass') return (glass ??= shareResource(windowGlass()));
  if (part.look === 'card') return plantMaterial();
  const c = part.color!;
  let m = glowMats.get(c);
  if (!m) glowMats.set(c, (m = shareResource(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.5 }))));
  return m;
}

/** A batch's shape: a piece's textured parts in one state (or none), or one plain part. */
interface Shape {
  key: string;
  textured: boolean;
  parts: Part[];
  state?: 'shut' | 'open';
}

/** The shapes a piece is drawn in. */
function shapesOf(e: ElementDef): Shape[] {
  const out: Shape[] = [];
  for (const state of [undefined, 'shut', 'open'] as const) {
    const parts = e.parts.filter((p) => p.state === state && !plain(p));
    if (parts.length) out.push({ key: `${e.id}|${state ?? ''}`, textured: true, parts, state });
  }
  e.parts.forEach((p, k) => { if (plain(p)) out.push({ key: `${e.id}#${k}`, textured: false, parts: [p], state: p.state }); });
  return out;
}

/** Each shape's vertex data, built once for the session; views draw it through geometries of their own (own). */
const geoCache = new Map<string, THREE.BufferGeometry>();
function geometry(s: Shape): THREE.BufferGeometry {
  let g = geoCache.get(s.key);
  if (!g) {
    g = s.textured
      ? texturedGeometry(s.parts.map((p) => ({ mesh: p.mesh(), layer: p.look as Exclude<Part['look'], 'glass' | 'glow' | 'card'>, grain: p.grain, color: p.color, whole: p.whole })))
      : plainGeometry(s.parts[0].mesh());
    geoCache.set(s.key, (g = shareResource(g)));
  }
  return g;
}

/**
 * A batch's own geometry: the shape's cached arrays (not copied) in attributes of the batch's own, so
 * the renderer uploads them into buffers only this batch draws and frees them with it; and, for a
 * textured shape, a colour per instance.
 */
function own(shared: THREE.BufferGeometry, count: number, tint: boolean) {
  const g = new THREE.BufferGeometry(), packs = new Map<THREE.InterleavedBuffer, THREE.InterleavedBuffer>();
  // (Attributes packed into one buffer, as the textured shapes' are, stay packed into one of the batch's own.)
  const copy = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    if (!(a instanceof THREE.InterleavedBufferAttribute)) return new THREE.BufferAttribute(a.array, a.itemSize, a.normalized);
    let pack = packs.get(a.data);
    if (!pack) packs.set(a.data, (pack = new THREE.InterleavedBuffer(a.data.array, a.data.stride)));
    return new THREE.InterleavedBufferAttribute(pack, a.itemSize, a.offset, a.normalized);
  };
  for (const [name, a] of Object.entries(shared.attributes)) g.setAttribute(name, copy(a));
  g.setIndex(copy(shared.index!) as THREE.BufferAttribute);
  g.boundingBox = shared.boundingBox;
  g.boundingSphere = shared.boundingSphere;
  if (tint) g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
  return g;
}

interface Batch {
  mesh: THREE.InstancedMesh;
  items: Placed[];
  state?: 'shut' | 'open';
  tint?: THREE.InstancedBufferAttribute;
}

/**
 * Does a piece cast a shadow? Floors lie on what is under them and small things (bread, a candle, a
 * stool) cast too little to see from the play camera; leaving them out saves a pass over each in
 * every shadow map.
 */
const casts = (e: ElementDef) => e.kind !== 'floor' && e.kind !== 'fill' && !(e.kind === 'detail' && e.h < 3 && e.w * e.d <= 4);

const tmp = new THREE.Matrix4(), gone = new THREE.Matrix4(), at = new THREE.Matrix4(), col = new THREE.Color();

/** `m` shrunk to nothing where it stands (a hidden instance: its batch's bounds stay round the building). */
const shrunk = (m: THREE.Matrix4) => gone.makeScale(0, 0, 0).copyPosition(m);

export class KitView {
  readonly group = new THREE.Group();
  private readonly batches: Batch[] = [];
  private shown: (p: Placed) => boolean = () => true;
  private readonly copies: THREE.Matrix4[];

  /**
   * `copies` (placements in the view, metres) draws the build once at each, in the same batches: a
   * street of one house costs the draw calls of one. The kit's surfaces must be loaded (loadKitSurfaces).
   */
  constructor(readonly build: KitBuild, copies: THREE.Matrix4[] = [new THREE.Matrix4()]) {
    this.group.name = 'building';
    this.copies = copies;
    const n = this.copies.length;
    const byEl = new Map<ElementDef, Placed[]>();
    for (const p of build.items) {
      const list = byEl.get(p.el);
      if (list) list.push(p);
      else byEl.set(p.el, [p]);
    }
    for (const [e, items] of byEl) for (const s of shapesOf(e)) {
      const count = items.length * n, geo = own(geometry(s), count, s.textured);
      const mesh = new THREE.InstancedMesh(geo, s.textured ? kitMaterial() : plainMaterial(s.parts[0]), count);
      mesh.name = s.key;
      mesh.castShadow = s.textured && casts(e);
      mesh.receiveShadow = s.textured || s.parts[0].look !== 'glow';
      const batch: Batch = { mesh, items, state: s.state, tint: s.textured ? (geo.getAttribute('aTint') as THREE.InstancedBufferAttribute) : undefined };
      this.batches.push(batch);
      this.group.add(mesh);
    }
    this.recolor((p) => p.color);
    this.setDoor('shut');
    this.setVisible(() => true);
  }

  /** Shows the placements `show` accepts and hides the rest. */
  setVisible(show: (p: Placed) => boolean) {
    this.shown = show;
    for (const b of this.batches) {
      this.copies.forEach((c, k) => b.items.forEach((p, i) => {
        const m = this.build.matrix(p, tmp);
        b.mesh.setMatrixAt(k * b.items.length + i, at.multiplyMatrices(c, show(p) ? m : shrunk(m)));
      }));
      b.mesh.instanceMatrix.needsUpdate = true;
      b.mesh.computeBoundingSphere();
      b.mesh.computeBoundingBox();
    }
  }

  /**
   * Draws each placement in the colour `color` gives it in each copy (so each house of a street can
   * have its own roof and timbers); parts with a colour of their own keep it.
   */
  recolor(color: (p: Placed, copy: number) => number) {
    for (const b of this.batches) {
      if (!b.tint) continue;
      this.copies.forEach((_, k) => b.items.forEach((p, i) => {
        col.setHex(color(p, k));
        b.tint!.setXYZ(k * b.items.length + i, col.r, col.g, col.b);
      }));
      b.tint.needsUpdate = true;
    }
  }

  /** The doors shut or swung open. */
  setDoor(state: 'shut' | 'open') {
    for (const b of this.batches) if (b.state) b.mesh.visible = b.state === state;
  }

  /**
   * What the view draws: pieces placed, draw calls and the triangles of what is shown per frame
   * (before shadows; hidden instances are shrunk to nothing but still pass through the GPU).
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
    return { pieces: this.build.items.length, shown, calls, tris: Math.round(tris) };
  }

  /** Frees what the view alone owns: its batches' geometries (their buffers and colours) and placements. */
  dispose() {
    this.group.removeFromParent();
    for (const b of this.batches) {
      b.mesh.geometry.dispose();
      b.mesh.dispose();
    }
    this.batches.length = 0;
  }
}
