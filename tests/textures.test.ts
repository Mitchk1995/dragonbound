import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyCharPaint, applyGrade, applyGround, applySurface, CHAR_PAINTS, type CharPaint, gradeRow, MODEL_GRADE, patchKeys, prepareCharGeometry, propSurface, setCharPaint, setPaintGain } from '../src/render/surface';
import { charTexture, forgeTexture, groundTexture, surfaceTexture, SURFACES, type SurfaceKind } from '../src/render/textures';
import { makeOccludable } from '../src/world/worldView';
import { packAttributes } from '../src/render/patch';
import { patchGraph } from './patchGraph';

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
  it('the character atlas (and the forge atlas for forged metal), colour only, composes with the grade', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyCharPaint(mat, CHAR_PAINTS.metal);
    applyGrade(mat, MODEL_GRADE, 'root');
    expect(patchKeys(mat)).toEqual(['cpaint:uniform', 'grade:root']);
    const g = patchGraph(mat);
    // (The forge atlas is fetched only by forged metal, in its own branch.)
    expect(g.textures).toEqual(new Set([charTexture(), forgeTexture()]));
    expect(g.hooks.has('normal')).toBe(false);
    // Per-vertex recipes are a separate program.
    const vc = new THREE.MeshStandardMaterial();
    applyCharPaint(vc, 'vertex');
    expect(patchKeys(vc)).toEqual(['cpaint:vertex']);
    expect(patchGraph(vc).attributes).toContain('aPaintW');
    expect(vc.customProgramCacheKey()).not.toBe(mat.customProgramCacheKey());
  });

  it('setCharPaint and setPaintGain change the values, not the program', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyCharPaint(mat, CHAR_PAINTS.metal);
    const key = mat.customProgramCacheKey();
    setCharPaint(mat, CHAR_PAINTS.leather);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    setPaintGain(mesh, 0.5);
    const u = (mat as unknown as { patchUniforms: Record<string, { value: { x: number } & number }> }).patchUniforms;
    expect(u.uPaintW.value.x).toBeCloseTo(CHAR_PAINTS.leather.w[0]);
    expect(u.uPaintX.value.x).toBeCloseTo(CHAR_PAINTS.leather.edge);
    expect(u.uCharGain.value).toBe(0.5);
    expect(mat.customProgramCacheKey()).toBe(key);
  });

  it('every recipe is calm: bounded pattern weights', () => {
    for (const [k, p] of Object.entries(CHAR_PAINTS)) {
      expect(Math.max(...p.w), k).toBeLessThanOrEqual(0.36);
      expect(Math.abs(p.edge), k).toBeLessThanOrEqual(0.3);
      expect(Math.abs(p.grad), k).toBeLessThanOrEqual(0.25);
      expect((p as CharPaint).forge ?? 0, k).toBeLessThanOrEqual(1);
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
  it('occlusion + surface on one material: both patches applied, distinct cache key', () => {
    const mat = new THREE.MeshStandardMaterial();
    makeOccludable(mat);
    applySurface(mat, 'stone', 'world');
    expect(patchKeys(mat)).toEqual(['occlude', 'surface:world']);
    expect(mat.customProgramCacheKey()).toBe(`occlude|surface:world[${surfaceTexture('stone').uuid}]`);
    const g = patchGraph(mat);
    // A clean cut-away (a discard, then the edge's alpha for alpha-to-coverage), and the bumped surface.
    expect([...g.hooks]).toEqual(expect.arrayContaining(['discard', 'alpha', 'color', 'roughness', 'normal']));
    expect(mat.alphaToCoverage).toBe(true);
    expect(g.textures).toContain(surfaceTexture('stone'));
  });

  it('re-applying a surface replaces it instead of stacking (bumped or flat)', () => {
    const mat = new THREE.MeshStandardMaterial();
    applySurface(mat, 'stone');
    applySurface(mat, 'cloth');
    expect(patchKeys(mat)).toEqual(['surface:object:flat']);
    expect([...patchGraph(mat).textures]).toEqual([surfaceTexture('cloth')]);
  });

  it('a surface with no bump samples albedo only and leaves the normal alone', () => {
    const mat = new THREE.MeshStandardMaterial();
    applySurface(mat, 'bark', 'world');
    const g = patchGraph(mat);
    expect(g.hooks.has('color')).toBe(true);
    expect(g.hooks.has('normal')).toBe(false);
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
    expect(patchGraph(mat).hooks.has('color')).toBe(true);
    const u = (mat as unknown as { patchUniforms: Record<string, { value: number }> }).patchUniforms;
    expect(u.uGradeLow.value).toBe(0.7);
    expect(u.uGradeTo.value).toBe(1);
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
    const g = patchGraph(mat);
    expect(g.attributes).toContain('aSplat');
    expect(g.textures).toContain(groundTexture());
    // Lair floors get ash drifts and scorch (and glowing crevices), mine floors mineral stains: distinct programs.
    const lair = new THREE.MeshStandardMaterial(), mine = new THREE.MeshStandardMaterial();
    applyGround(lair, 1, 0.55);
    applyGround(mine, 0, 0.3);
    expect(patchGraph(lair).hooks.has('emissive')).toBe(true);
    expect(patchGraph(mine).hooks.has('emissive')).toBe(false);
    expect(patchGraph(lair).nodes.size).toBeGreaterThan(g.nodes.size);
    expect(lair.customProgramCacheKey()).not.toBe(mine.customProgramCacheKey());
    // Sharpened ground: per-channel colours and a height blend (crisp edges, no smeared colours).
    const sharp = new THREE.MeshStandardMaterial();
    applyGround(sharp, 0, 1, 0x7a6a5a, undefined, false, null, undefined, false, true, true);
    expect(patchGraph(sharp).attributes).toContain('aCol3');
    expect(sharp.customProgramCacheKey()).not.toBe(mat.customProgramCacheKey());
  });
});

describe('packing vertex attributes', () => {
  it('interleaves the named attributes into one buffer, values unchanged', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geo.setAttribute('aA', new THREE.Float32BufferAttribute([1, 2, 3], 1));
    geo.setAttribute('aB', new THREE.Float32BufferAttribute([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 4));
    packAttributes(geo, ['aA', 'aB', 'aMissing']);
    const a = geo.getAttribute('aA') as THREE.InterleavedBufferAttribute, b = geo.getAttribute('aB') as THREE.InterleavedBufferAttribute;
    expect(a.isInterleavedBufferAttribute && b.isInterleavedBufferAttribute).toBe(true);
    expect(a.data).toBe(b.data);
    expect(a.data.stride).toBe(5);
    expect([a.offset, b.offset]).toEqual([0, 1]);
    expect([0, 1, 2].map((i) => a.getX(i))).toEqual([1, 2, 3]);
    expect([b.getX(1), b.getY(1), b.getZ(1), b.getW(1)]).toEqual([8, 9, 10, 11]);
    // (Untouched: what was not named.)
    expect((geo.getAttribute('position') as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute).toBeFalsy();
    // Packing again, or a single attribute, changes nothing.
    const data = a.data;
    packAttributes(geo, ['aA', 'aB']);
    expect((geo.getAttribute('aA') as THREE.InterleavedBufferAttribute).data).toBe(data);
    const lone = new THREE.BufferGeometry();
    const only = new THREE.Float32BufferAttribute([1, 2], 1);
    lone.setAttribute('aA', only);
    packAttributes(lone, ['aA', 'aB']);
    expect(lone.getAttribute('aA')).toBe(only);
  });
});
