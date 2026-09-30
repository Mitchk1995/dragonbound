import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyGround, applySurface, patchKeys } from '../src/render/surface';
import { groundTexture, surfaceTexture, SURFACES, type SurfaceKind } from '../src/render/textures';
import { makeOccludable } from '../src/world/worldView';

const px = (t: THREE.Texture) => t.image as { data: Uint8Array; width: number; height: number };

/** Mean absolute difference between two columns (channel c). */
function colDiff(img: ReturnType<typeof px>, a: number, b: number, c = 0) {
  let sum = 0;
  for (let y = 0; y < img.height; y++) sum += Math.abs(img.data[(y * img.width + a) * 4 + c] - img.data[(y * img.width + b) * 4 + c]);
  return sum / img.height;
}
function rowDiff(img: ReturnType<typeof px>, a: number, b: number, c = 0) {
  let sum = 0;
  for (let x = 0; x < img.width; x++) sum += Math.abs(img.data[(a * img.width + x) * 4 + c] - img.data[(b * img.width + x) * 4 + c]);
  return sum / img.width;
}

type Diff = typeof colDiff;
/** The harshest step between neighbouring columns/rows inside the texture. */
function maxStep(img: ReturnType<typeof px>, diff: Diff, c = 0) {
  let m = 0;
  for (let i = 0; i < img.width - 1; i++) m = Math.max(m, diff(img, i, i + 1, c));
  return m;
}

describe('procedural textures', () => {
  for (const kind of Object.keys(SURFACES) as SurfaceKind[]) {
    it(`${kind}: tiles without a visible seam and has real detail`, () => {
      const img = px(surfaceTexture(kind));
      const n = img.width - 1;
      // The wrap-around step (last→first texel) must be no harsher than steps inside the texture.
      expect(colDiff(img, n, 0), 'horizontal seam').toBeLessThan(maxStep(img, colDiff) * 1.05 + 2);
      expect(rowDiff(img, n, 0), 'vertical seam').toBeLessThan(maxStep(img, rowDiff) * 1.05 + 2);
      let min = 255, max = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        min = Math.min(min, img.data[i]);
        max = Math.max(max, img.data[i]);
      }
      expect(max - min, 'contrast').toBeGreaterThan(40);
    });
  }

  it('ground atlas: every channel tiles', () => {
    const img = px(groundTexture());
    const n = img.width - 1;
    for (let c = 0; c < 4; c++) {
      expect(colDiff(img, n, 0, c), `channel ${c}`).toBeLessThan(maxStep(img, colDiff, c) * 1.05 + 2);
      expect(rowDiff(img, n, 0, c), `channel ${c}`).toBeLessThan(maxStep(img, rowDiff, c) * 1.05 + 2);
    }
  });
});

describe('shader patches compose', () => {
  const compile = (mat: THREE.Material) => {
    const lib = THREE.ShaderLib.standard;
    const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as any;
    mat.onBeforeCompile(shader, null as any);
    return shader;
  };

  it('occlusion + surface on one material: both patches applied, distinct cache key', () => {
    const mat = new THREE.MeshStandardMaterial();
    makeOccludable(mat);
    applySurface(mat, 'stone', 'world');
    expect(patchKeys(mat)).toEqual(['occlude', 'surface:world']);
    expect(mat.customProgramCacheKey()).toBe('occlude|surface:world');
    const s = compile(mat);
    expect(s.fragmentShader).toContain('occBayer');
    expect(s.fragmentShader).toContain('surfSample(surfGrad)');
    expect(s.fragmentShader).toContain('surfBump(normal');
    expect(s.uniforms.uSurfTex.value).toBe(surfaceTexture('stone'));
    expect(s.uniforms.uOccOn).toBeDefined();
  });

  it('re-applying a surface replaces it instead of stacking', () => {
    const mat = new THREE.MeshStandardMaterial();
    applySurface(mat, 'metal');
    applySurface(mat, 'cloth');
    expect(patchKeys(mat)).toEqual(['surface:object']);
    expect(compile(mat).uniforms.uSurfTex.value).toBe(surfaceTexture('cloth'));
  });

  it('ground patch reads the splat attribute', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyGround(mat);
    const s = compile(mat);
    expect(s.vertexShader).toContain('attribute vec4 aSplat');
    expect(s.fragmentShader).toContain('uGroundTex');
  });
});
