import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { zoneLighting } from '../src/render/env';
import { buildProp } from '../src/world/props';
import { GLIMPSES, GlimpseStyle, glimpseFor, makePortal, portalFacing, titleLines } from '../src/world/portalFx';

describe('portal titles', () => {
  it('short names stay on one line; long ones split at the most balanced word break', () => {
    expect(titleLines('Sunken Ruin')).toEqual(['SUNKEN RUIN']);
    expect(titleLines('Mirefen')).toEqual(['MIREFEN']);
    expect(titleLines('Wyrmwood Foothills')).toEqual(['WYRMWOOD', 'FOOTHILLS']);
    expect(titleLines("Cinderwing's Lair")).toEqual(["CINDERWING'S", 'LAIR']);
    expect(titleLines('The Very Long Name Here')).toEqual(['THE VERY LONG', 'NAME HERE']);
  });
});

describe('portal glimpses', () => {
  it('every zone has its own glimpse, and each style is used once', () => {
    for (const id of Object.keys(ZONES)) expect(GLIMPSES[id], id).toBeDefined();
    const styles = Object.values(GLIMPSES).map((g) => g.style);
    expect(new Set(styles).size).toBe(styles.length);
  });
  it('an unknown destination is read off its theme', () => {
    expect(glimpseFor('volcano', { ...ZONES.lair.theme }).style).toBe(GlimpseStyle.Lava);
    expect(glimpseFor('deepmine', { ...ZONES.mine.theme }).style).toBe(GlimpseStyle.Cave);
    expect(glimpseFor('nowhere').style).toBe(GLIMPSES.keep.style);
  });
  it('an open portal shows its window, motes and glow; a sealed one only a dark window', () => {
    const open = makePortal({ dest: 'ruin', color: 0x6ad0c0, name: 'Sunken Ruin', theme: ZONES.ruin.theme }, 0.6)!;
    expect(open.obj.name).toBe('portal-fx');
    const win = open.obj.getObjectByName('portal-window') as THREE.Mesh;
    expect((win.material as THREE.ShaderMaterial).defines).toMatchObject({ STYLE: GlimpseStyle.Water, OPEN: 1 });
    expect(open.obj.getObjectsByProperty('type', 'Points').length).toBe(1);
    const sealed = makePortal({ dest: 'mirefen', color: null, name: 'Mirefen', hint: 'Chapter 2' }, 0.6)!;
    expect(sealed.obj.name).toBe('portal-sealed');
    expect(((sealed.obj.getObjectByName('portal-window') as THREE.Mesh).material as THREE.ShaderMaterial).defines).toMatchObject({ OPEN: 0 });
    expect(sealed.obj.getObjectsByProperty('type', 'Points').length).toBe(0);
  });
  it('the window turns to face the camera whatever way the platform faces', () => {
    const p = buildProp('portal', { dest: 'mine', color: 0xffb050, name: 'Emberdeep Mine' });
    p.obj.rotation.y = 1.1;
    p.obj.updateMatrixWorld(true);
    p.tick!(0);
    p.obj.updateMatrixWorld(true);
    const win = p.obj.getObjectByName('portal-window')!;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(win.getWorldQuaternion(new THREE.Quaternion()));
    // Leans back (normal tilted up) but faces +Z (the camera side), not sideways.
    expect(Math.abs(n.x)).toBeLessThan(1e-6);
    expect(n.z).toBeGreaterThan(0.8);
    expect(n.y).toBeGreaterThan(0.2);
    expect(p.light).toBeDefined();
  });
  it('the window faces the camera exactly, so the oval never foreshortens into a circle', () => {
    // The gameplay camera sits 21 up and 14 back; a portal near the bottom of the screen is seen
    // from much higher overhead than one at the top, and must lean back further.
    const far = portalFacing({ x: 0, y: 0.9, z: 0 }, { x: 0, y: 21, z: 20 });
    const near = portalFacing({ x: 0, y: 0.9, z: 0 }, { x: 0, y: 21, z: 6 });
    expect(near.lean).toBeGreaterThan(far.lean + 0.3);
    expect(far.yaw).toBeCloseTo(0);
    expect(portalFacing({ x: 0, y: 0, z: 0 }, { x: 10, y: 5, z: 0 }).yaw).toBeCloseTo(Math.PI / 2);
    // Rendered from any camera, the window's normal points straight at that camera.
    const p = buildProp('portal', { dest: 'ruin', color: 0x6ad0c0, name: 'Sunken Ruin' });
    p.obj.rotation.y = 0.7;
    p.obj.position.set(3, 0, -2);
    p.obj.updateMatrixWorld(true);
    const win = p.obj.getObjectByName('portal-window') as THREE.Mesh;
    for (const at of [[0, 21, 14], [9, 21, 4], [-6, 12, 18]]) {
      const cam = new THREE.PerspectiveCamera();
      cam.position.set(at[0], at[1], at[2]);
      cam.updateMatrixWorld(true);
      win.onBeforeRender(null as any, null as any, cam, null as any, null as any, null as any);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(win.getWorldQuaternion(new THREE.Quaternion()));
      const mid = new THREE.Vector3(0, 1.5, 0).applyMatrix4(win.matrixWorld);
      const toCam = cam.position.clone().sub(mid).normalize();
      expect(n.dot(toCam), `camera at ${at}`).toBeGreaterThan(0.99);
    }
  });
  it('a sealed keep portal with a destination casts no light', () => {
    const p = buildProp('portal', { dest: 'mirefen', color: null, name: 'Mirefen' });
    expect(p.light).toBeUndefined();
    expect(p.obj.getObjectByName('portal-fx')).toBeUndefined();
    expect(p.obj.getObjectByName('portal-sealed')).toBeDefined();
  });
});

describe('zone lighting', () => {
  it('warms the key, cools the fill, and lets the sun outshine the sky light so shadows read', () => {
    for (const id of Object.keys(ZONES)) {
      const t = ZONES[id].theme, L = zoneLighting(t);
      const warm = (c: THREE.Color) => c.r - c.b;
      expect(warm(L.key), id).toBeGreaterThanOrEqual(warm(new THREE.Color(t.sun[0])) - 1e-6);
      expect(warm(L.fill), id).toBeLessThan(warm(L.key));
      // The bounce from the ground takes on the sunlight's colour.
      const gap = (c: THREE.Color) => Math.hypot(c.r - L.key.r, c.g - L.key.g, c.b - L.key.b);
      expect(gap(L.ground), id).toBeLessThan(gap(new THREE.Color(t.hemi[1])));
      // Outdoors at full contrast the sun carries well over twice the sky light; nowhere is it weaker than before.
      if (!t.wallRise && (t.shade ?? 1) === 1) expect(L.keyIntensity / L.hemiIntensity, id).toBeGreaterThan((2 * t.sun[1]) / t.hemi[2]);
      expect(L.keyIntensity, id).toBeGreaterThanOrEqual(t.sun[1]);
    }
  });
});
