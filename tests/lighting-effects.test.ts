import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { attachmentBytes, NO_EFFECTS, surfaceLayout, type LightingEffects } from '../src/render/post';
import { effectsWater, isEffectsWater, setEffectsBuffers, waterShine } from '../src/render/surfaces';
import { DEFAULT_LIGHTING, loadSave, newSave } from '../src/save/save';

/** Every combination of the four lighting effects. */
const combos: LightingEffects[] = Array.from({ length: 16 }, (_, i) => ({ bounce: !!(i & 1), contact: !!(i & 2), reflections: !!(i & 4), smooth: !!(i & 8) }));

describe('the lighting effects', () => {
  it('draw no surface buffers while all are off (the frame stays as it was)', () => {
    expect(surfaceLayout(NO_EFFECTS)).toEqual([]);
  });

  it('fit their surface buffers in the 32 bytes a pixel every WebGPU device allows, in any combination', () => {
    for (const fx of combos) {
      const layout = surfaceLayout(fx);
      if (fx.bounce || fx.contact || fx.reflections || fx.smooth) expect(layout.map((b) => b.name)).toContain('normal');
      expect(attachmentBytes(layout), JSON.stringify(fx)).toBeLessThanOrEqual(32);
    }
    // (All four together, the most: the frame and facing and colour at four bytes a channel's pixel, gloss, motion.)
    expect(attachmentBytes(surfaceLayout({ bounce: true, contact: true, reflections: true, smooth: true }))).toBe(30);
  });

  it('give each effect the buffers it reads', () => {
    expect(surfaceLayout({ ...NO_EFFECTS, bounce: true }).map((b) => b.name)).toEqual(['normal', 'albedo']);
    expect(surfaceLayout({ ...NO_EFFECTS, reflections: true }).map((b) => b.name)).toEqual(['normal', 'gloss']);
    expect(surfaceLayout({ ...NO_EFFECTS, smooth: true }).map((b) => b.name)).toEqual(['normal', 'velocity']);
  });
});

describe('water for the effects', () => {
  it('writes its depth exactly while the surface buffers are drawn', () => {
    const plain = effectsWater(new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false }));
    const mirrored = effectsWater(new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false }), 0);
    expect(isEffectsWater(plain)).toBe(true);
    expect([waterShine(plain), waterShine(mirrored), waterShine(new THREE.MeshStandardMaterial())]).toEqual([1, 0, 0]);
    setEffectsBuffers(true);
    expect([plain.depthWrite, mirrored.depthWrite]).toEqual([true, true]);
    // (Made while the buffers are drawn: it writes its depth from the start.)
    const late = effectsWater(new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false }));
    expect(late.depthWrite).toBe(true);
    setEffectsBuffers(false);
    expect([plain.depthWrite, mirrored.depthWrite, late.depthWrite]).toEqual([false, false, false]);
    plain.dispose();
    expect(isEffectsWater(plain)).toBe(false);
    mirrored.dispose();
    late.dispose();
  });
});

describe('saved lighting settings', () => {
  const load = (lighting: unknown) => loadSave({ read: async () => JSON.stringify({ ...newSave(), settings: { volume: 0.4, graphics: 'high', lighting } }), write: async () => {}, describe: () => 'test storage' });

  it('start with contact shading, reflections and smooth edges on, in a new save and in one from before they existed', async () => {
    expect(newSave().settings.lighting).toEqual(DEFAULT_LIGHTING);
    expect((await load(undefined))!.settings.lighting).toEqual(DEFAULT_LIGHTING);
    expect(DEFAULT_LIGHTING).toEqual({ bounce: false, contact: true, reflections: true, smooth: true });
  });

  it("keep the player's switches, and defaults for anything else", async () => {
    expect((await load({ bounce: true, smooth: false }))!.settings.lighting).toEqual({ ...DEFAULT_LIGHTING, bounce: true, smooth: false });
    expect((await load({ contact: false, reflections: false }))!.settings.lighting).toEqual({ ...DEFAULT_LIGHTING, contact: false, reflections: false });
    expect((await load({ bounce: 'yes', contact: 1, reflections: false, smooth: false, glow: true }))!.settings.lighting).toEqual({ ...DEFAULT_LIGHTING, reflections: false, smooth: false });
    for (const junk of [null, 'all', 3, ['bounce']]) expect((await load(junk))!.settings.lighting).toEqual(DEFAULT_LIGHTING);
  });
});
