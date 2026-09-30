import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyCharPaint, applyGrade, applyGround, applySurface, CHAR_PAINTS, gradeRow, MODEL_GRADE, patchKeys, prepareCharGeometry, propSurface, setCharPaint, setPaintGain } from '../src/render/surface';
import { charTexture, groundTexture, surfaceTexture, SURFACES, type SurfaceKind } from '../src/render/textures';
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

  it('paving: separate stones with dark mortar between them and their own tones', () => {
    const img = px(groundTexture());
    const vals: number[] = [];
    for (let i = 2; i < img.data.length; i += 4) vals.push(img.data[i]);
    const mortar = vals.filter((v) => v < 0.2 * 255).length / vals.length;
    // Joints are a thin network, not a crack-riddled surface.
    expect(mortar).toBeGreaterThan(0.04);
    expect(mortar).toBeLessThan(0.25);
    const faces = vals.filter((v) => v > 0.35 * 255);
    expect(Math.max(...faces) - Math.min(...faces), 'per-stone tone variation').toBeGreaterThan(50);
  });

  it('cave floor never dips into the lava-crevice range (the lair floor glows only at its pools)', () => {
    const img = px(groundTexture());
    let min = 255;
    for (let i = 3; i < img.data.length; i += 4) min = Math.min(min, img.data[i]);
    expect(min / 255).toBeGreaterThan(0.34);
  });

  it('character atlas: every channel tiles, with real contrast', () => {
    const img = px(charTexture());
    const n = img.width - 1;
    for (let c = 0; c < 4; c++) {
      expect(colDiff(img, n, 0, c), `channel ${c}`).toBeLessThan(maxStep(img, colDiff, c) * 1.05 + 2);
      expect(rowDiff(img, n, 0, c), `channel ${c}`).toBeLessThan(maxStep(img, rowDiff, c) * 1.05 + 2);
      let lo = 255, hi = 0, sum = 0;
      for (let i = c; i < img.data.length; i += 4) {
        lo = Math.min(lo, img.data[i]);
        hi = Math.max(hi, img.data[i]);
        sum += img.data[i];
      }
      expect(hi - lo, `channel ${c} contrast`).toBeGreaterThan(60);
      // 0.5 is the base colour: patterns swing both ways, so the model keeps its authored tone.
      expect(sum / (img.data.length / 4) / 255, `channel ${c} mean`).toBeGreaterThan(0.38);
      expect(sum / (img.data.length / 4) / 255, `channel ${c} mean`).toBeLessThan(0.62);
    }
  });
});

describe('character painting', () => {
  const compile = (mat: THREE.Material) => {
    const lib = THREE.ShaderLib.standard;
    const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as any;
    mat.onBeforeCompile(shader, null as any);
    return shader;
  };

  it('one atlas fetch, colour only, composes with the grade', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyCharPaint(mat, CHAR_PAINTS.metal);
    applyGrade(mat, MODEL_GRADE, 'root');
    expect(patchKeys(mat)).toEqual(['cpaint:uniform', 'grade:root']);
    const s = compile(mat);
    expect(s.fragmentShader.match(/texture2D\(uCharTex/g)).toHaveLength(1);
    expect(s.fragmentShader).not.toContain('normal = ');
    expect(s.uniforms.uCharTex.value).toBe(charTexture());
    // Per-vertex recipes are a separate program.
    const vc = new THREE.MeshStandardMaterial();
    applyCharPaint(vc, 'vertex');
    expect(patchKeys(vc)).toEqual(['cpaint:vertex']);
    expect(compile(vc).vertexShader).toContain('attribute vec4 aPaintW');
  });

  it('setCharPaint and setPaintGain change the uniforms, not the program', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyCharPaint(mat, CHAR_PAINTS.metal);
    const key = mat.customProgramCacheKey();
    setCharPaint(mat, CHAR_PAINTS.leather);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    setPaintGain(mesh, 0.5);
    const s = compile(mat);
    expect(s.uniforms.uPaintW.value.x).toBeCloseTo(CHAR_PAINTS.leather.w[0]);
    expect(s.uniforms.uPaintX.value.x).toBeCloseTo(CHAR_PAINTS.leather.edge);
    expect(s.uniforms.uCharGain.value).toBe(0.5);
    expect(mat.customProgramCacheKey()).toBe(key);
  });

  it('every recipe is calm: bounded pattern weights', () => {
    for (const [k, p] of Object.entries(CHAR_PAINTS)) {
      expect(Math.max(...p.w), k).toBeLessThanOrEqual(0.36);
      expect(Math.abs(p.edge), k).toBeLessThanOrEqual(0.3);
      expect(Math.abs(p.grad), k).toBeLessThanOrEqual(0.25);
    }
    // Faces stay clean.
    expect(Math.max(...CHAR_PAINTS.skin.w)).toBeLessThanOrEqual(0.06);
    expect(CHAR_PAINTS.skin.edge).toBe(0);
  });

  it('face coordinates: v runs up every side face (no flipped direction), edges measured on the face', () => {
    const rest = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const geo = prepareCharGeometry(new THREE.BoxGeometry(0.4, 1, 0.6), rest);
    expect(geo.index).toBeNull();
    const pos = geo.attributes.position, face = geo.attributes.aFace, r = geo.attributes.aRest, fn = geo.attributes.aRestN;
    for (let i = 0; i < pos.count; i++) {
      // Rest frame = the given transform.
      expect(r.getY(i)).toBeCloseTo(pos.getY(i) + 2);
      const u = face.getX(i), v = face.getY(i), w = face.getZ(i), h = face.getW(i);
      expect(u).toBeGreaterThanOrEqual(-1e-6);
      expect(u).toBeLessThanOrEqual(w + 1e-6);
      if (Math.abs(fn.getY(i)) < 0.5) {
        // Side faces: full height, v = height above the face's foot.
        expect(h).toBeCloseTo(1);
        expect(v).toBeCloseTo(pos.getY(i) + 0.5);
      } else {
        expect([w, h].sort()).toEqual([0.4, 0.6].map((x) => expect.closeTo(x, 5)));
      }
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

  it('re-applying a surface replaces it instead of stacking (bumped or flat)', () => {
    const mat = new THREE.MeshStandardMaterial();
    applySurface(mat, 'stone');
    applySurface(mat, 'cloth');
    expect(patchKeys(mat)).toEqual(['surface:object:flat']);
    expect(compile(mat).uniforms.uSurfTex.value).toBe(surfaceTexture('cloth'));
  });

  it('a surface with no bump samples albedo only and leaves the normal alone', () => {
    const mat = new THREE.MeshStandardMaterial();
    applySurface(mat, 'bark', 'world');
    const s = compile(mat);
    expect(s.fragmentShader).toContain('surfSample(surfGrad)');
    expect(s.fragmentShader).not.toContain('surfBump(normal');
    // One texture fetch per projection plane instead of three.
    expect(s.fragmentShader).not.toContain('uv + vec2(SURF_E');
  });

  it('only rock is bumped; every other kind is quiet', () => {
    for (const [kind, p] of Object.entries(SURFACES)) {
      if (kind !== 'stone') expect(p.bump, kind).toBe(0);
      expect(p.albedo, kind).toBeLessThanOrEqual(0.15);
    }
    expect(SURFACES.stone.bump).toBeLessThanOrEqual(0.25);
  });

  it('grade: darkens toward the base, in root or local space', () => {
    const mat = new THREE.MeshStandardMaterial();
    makeOccludable(mat);
    applyGrade(mat, MODEL_GRADE, 'root');
    applyGrade(mat, { low: 0.7, from: 0, to: 1 }, 'local');
    expect(patchKeys(mat)).toEqual(['occlude', 'grade:local']);
    const s = compile(mat);
    expect(s.vertexShader).toContain('vGrade = transformed.y');
    expect(s.fragmentShader).toContain('smoothstep(uGradeFrom, uGradeTo, vGrade)');
  });

  it('grade row: world position → height fraction of the model root, whatever its transform', () => {
    const root = new THREE.Group();
    root.position.set(3, 2, -1);
    root.rotation.y = 1.1;
    root.scale.setScalar(2);
    const parent = new THREE.Group();
    parent.position.y = 0.5;
    parent.add(root);
    parent.updateMatrixWorld(true);
    const row = gradeRow(root, 1.5, new THREE.Vector4());
    const frac = (local: THREE.Vector3) => row.dot(new THREE.Vector4(...local.applyMatrix4(root.matrixWorld).toArray(), 1));
    expect(frac(new THREE.Vector3(0.4, 0, 0.3))).toBeCloseTo(0);
    expect(frac(new THREE.Vector3(-0.2, 1.5, 0.1))).toBeCloseTo(1);
    expect(frac(new THREE.Vector3(0, 0.75, 0))).toBeCloseTo(0.5);
  });

  it('props: only low-saturation grey gets stone detail', () => {
    expect(propSurface(new THREE.Color(0x8a8478))).toBe('stone');
    expect(propSurface(new THREE.Color(0x6b4426))).toBeNull(); // wood
    expect(propSurface(new THREE.Color(0xc0392b))).toBeNull(); // banner cloth
    expect(propSurface(new THREE.Color(0xeee4cc))).toBeNull(); // bone
  });

  it('ground patch reads the splat attribute', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyGround(mat);
    const s = compile(mat);
    expect(s.vertexShader).toContain('attribute vec4 aSplat');
    expect(s.fragmentShader).toContain('uGroundTex');
    expect(s.fragmentShader).not.toMatch(/float (ash|stain)/);
    // Lair floors get ash drifts and scorch, mine floors mineral stains: distinct programs.
    const lair = new THREE.MeshStandardMaterial(), mine = new THREE.MeshStandardMaterial();
    applyGround(lair, 1, 0.55);
    applyGround(mine, 0, 0.3);
    expect(compile(lair).fragmentShader).toContain('float ash');
    expect(compile(mine).fragmentShader).toContain('float stain');
    expect(lair.customProgramCacheKey()).not.toBe(mine.customProgramCacheKey());
  });
});
