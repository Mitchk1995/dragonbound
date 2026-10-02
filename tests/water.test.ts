import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildProp } from '../src/world/props';
import { arc, crossedRibbons, pour } from '../src/world/water';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('falling water paths', () => {
  it('a jet arc starts and ends on its points and peaks at the asked rise', () => {
    const pts = arc(V(4.6, 1.0, 0), V(3.3, 0.55, 0), 0.6, 40);
    expect(pts[0].distanceTo(V(4.6, 1.0, 0))).toBeLessThan(1e-9);
    expect(pts[pts.length - 1].distanceTo(V(3.3, 0.55, 0))).toBeLessThan(1e-9);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(1.6, 2);
  });
  it('a pour leaves the jaw and lands where asked, always falling after its lift', () => {
    const a = V(0, 9, 2), b = V(0, 0.55, 4.4), pts = pour(a, b, 0.7, 24);
    expect(pts[0].distanceTo(a)).toBeLessThan(1e-9);
    expect(pts[pts.length - 1].distanceTo(b)).toBeLessThan(1e-6);
    for (let i = 1; i < pts.length; i++) expect(pts[i].z).toBeGreaterThan(pts[i - 1].z);
  });
  it('crossed ribbons are two strips with finite geometry and the full length', () => {
    const pts = pour(V(0, 9, 2), V(0, 0.55, 4.4), 0.7, 10);
    const { geo, len } = crossedRibbons(pts, 0.3, 0.42);
    expect(geo.getAttribute('position').count).toBe(2 * 2 * pts.length);
    expect(len).toBeGreaterThan(8.45);
    expect([...(geo.getAttribute('position').array as Float32Array)].every(Number.isFinite)).toBe(true);
  });
});

describe('the dragon fountain', () => {
  const p = buildProp('dragon_fountain');
  const box = new THREE.Box3().setFromObject(p.obj);
  it('stands about nine high, its dragon within reach of the basin', () => {
    expect(box.max.y).toBeGreaterThan(8.5);
    expect(box.max.y).toBeLessThan(10.5);
    expect(box.max.x).toBeLessThan(6.5);
    expect(box.min.x).toBeGreaterThan(-6.5);
  });
  it('pours from the jaws into the pool and animates', () => {
    const names = new Set<string>();
    p.obj.traverse((o) => names.add(o.name));
    for (const n of ['fountain-pool', 'fountain-stream', 'foam-spread', 'foam', 'spray']) expect(names.has(n), n).toBe(true);
    expect(p.tick).toBeTypeOf('function');
    p.tick!(1.5);
  });
});
