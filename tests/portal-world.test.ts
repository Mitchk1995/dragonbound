import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { zoneLighting } from '../src/render/env';
import { buildProp } from '../src/world/props';
import { GLIMPSES, GlimpseStyle, glimpseFor, makePortal, titleLines } from '../src/world/portalFx';

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
  it('a sealed keep portal with a destination casts no light', () => {
    const p = buildProp('portal', { dest: 'mirefen', color: null, name: 'Mirefen' });
    expect(p.light).toBeUndefined();
    expect(p.obj.getObjectByName('portal-fx')).toBeUndefined();
    expect(p.obj.getObjectByName('portal-sealed')).toBeDefined();
  });
});

describe('zone lighting', () => {
  it('warms the key, cools the fill, and keeps the total light about the same', () => {
    for (const id of Object.keys(ZONES)) {
      const t = ZONES[id].theme, L = zoneLighting(t);
      const warm = (c: THREE.Color) => c.r - c.b;
      expect(warm(L.key), id).toBeGreaterThanOrEqual(warm(new THREE.Color(t.sun[0])) - 1e-6);
      expect(warm(L.fill), id).toBeLessThan(warm(L.key));
      const before = t.sun[1] + t.hemi[2], after = L.keyIntensity + L.hemiIntensity + L.fillIntensity;
      expect(after / before, id).toBeGreaterThan(0.95);
      expect(after / before, id).toBeLessThan(1.25);
    }
  });
});
