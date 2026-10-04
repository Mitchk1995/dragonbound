import * as THREE from 'three';
import { clamp } from '../../core/rng';
import { shareResource } from '../resources';
import { LEAF_ATLAS, paintLeafAtlas, SOURCED_LEAVES, type LeafKind, type SourcedLeaf } from './leafPaint';

/** The trees' textures: each leaf kind's atlas with its coverage-keeping mipmaps, and the sourced barks, loaded at startup. */

/**
 * Mip levels of a premultiplied RGBA float image (square, a power of two) as straight-alpha bytes.
 * Colour bleeds out into the clear texels (no dark fringe where a leaf's edge is filtered), and each
 * level's alpha is scaled so as many texels pass the alpha test as at full size.
 */
export function coverageMips(img: Float32Array, size: number) {
  const levels: { data: Uint8Array; width: number; height: number }[] = [];
  const cut = 0.5;
  // Straight colour, bled into the clear texels from their neighbours, the rest the mean leaf colour.
  let n = size, rgba = new Float32Array(img.length);
  let mean = [0, 0, 0], wsum = 0;
  for (let i = 0; i < img.length; i += 4) {
    const a = img[i + 3];
    rgba[i + 3] = a;
    if (a > 1e-4) for (let c = 0; c < 3; c++) rgba[i + c] = img[i + c] / a;
    if (a > 0.5) {
      for (let c = 0; c < 3; c++) mean[c] += rgba[i + c];
      wsum++;
    }
  }
  mean = mean.map((m) => m / Math.max(1, wsum));
  let filled = new Uint8Array(n * n).map((_, i) => (img[i * 4 + 3] > 1e-4 ? 1 : 0));
  for (let pass = 0; pass < 6; pass++) {
    const next = filled.slice();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (filled[i]) continue;
      let cnt = 0, r = 0, g = 0, b = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n || !filled[yy * n + xx]) continue;
        const j = (yy * n + xx) * 4;
        r += rgba[j];
        g += rgba[j + 1];
        b += rgba[j + 2];
        cnt++;
      }
      if (!cnt) continue;
      rgba[i * 4] = r / cnt;
      rgba[i * 4 + 1] = g / cnt;
      rgba[i * 4 + 2] = b / cnt;
      next[i] = 1;
    }
    filled = next;
  }
  filled.forEach((f, i) => {
    if (!f) for (let c = 0; c < 3; c++) rgba[i * 4 + c] = mean[c];
  });
  // The share of texels passing the alpha test at full size; each smaller level's alpha is scaled
  // so as many pass (read off the level's alpha histogram).
  const BINS = 4096;
  let target = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= cut) target++;
  target /= rgba.length / 4;
  for (;;) {
    let k = 1;
    if (n !== size) {
      const hist = new Uint32Array(BINS + 1);
      for (let i = 3; i < rgba.length; i += 4) hist[Math.min(BINS, Math.floor(rgba[i] * BINS))]++;
      const want = target * n * n;
      let count = 0, b = BINS;
      while (b > 1 && count + hist[b] < want) count += hist[b--];
      k = clamp(cut / (b / BINS), 0.5, 8);
    }
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(clamp(rgba[i + c], 0, 1) * 255);
      data[i + 3] = Math.round(clamp(rgba[i + 3] * k, 0, 1) * 255);
    }
    levels.push({ data, width: n, height: n });
    if (n === 1) break;
    // Down a level: colour averaged by alpha (the bled colour where all four are clear).
    const m = n / 2, down = new Float32Array(m * m * 4);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      let r = 0, g = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const j = ((y * 2 + oy) * n + x * 2 + ox) * 4, w = rgba[j + 3];
        r += rgba[j] * w;
        g += rgba[j + 1] * w;
        b += rgba[j + 2] * w;
        a += w;
        r0 += rgba[j] / 4;
        g0 += rgba[j + 1] / 4;
        b0 += rgba[j + 2] / 4;
      }
      const i = (y * m + x) * 4;
      down.set(a > 1e-4 ? [r / a, g / a, b / a, a / 4] : [r0, g0, b0, 0], i);
    }
    rgba = down;
    n = m;
  }
  return levels;
}

const leafTex = new Map<LeafKind, THREE.DataTexture>();
const leafImages = new Map<SourcedLeaf, ImageBitmap>();

const isSourced = (kind: LeafKind): kind is SourcedLeaf => (SOURCED_LEAVES as readonly string[]).includes(kind);

/** A sourced leaf atlas as premultiplied RGBA floats, rows bottom-up (as paintLeafAtlas). */
function sourcedLeafAtlas(kind: SourcedLeaf) {
  const bmp = leafImages.get(kind);
  if (!bmp) throw new Error(`leaves ${kind} are not loaded (preloadTreeTextures)`);
  const cv = document.createElement('canvas');
  cv.width = cv.height = LEAF_ATLAS;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, LEAF_ATLAS, LEAF_ATLAS);
  const px = ctx.getImageData(0, 0, LEAF_ATLAS, LEAF_ATLAS).data, W = LEAF_ATLAS;
  const img = new Float32Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = ((W - 1 - y) * W + x) * 4, o = (y * W + x) * 4, a = px[i + 3] / 255;
    img[o] = (px[i] / 255) * a;
    img[o + 1] = (px[i + 1] / 255) * a;
    img[o + 2] = (px[i + 2] / 255) * a;
    img[o + 3] = a;
  }
  return img;
}

/**
 * A leaf kind's atlas (built once, shared by every grown tree of that kind). A world built headless
 * (the tests build one, with no images loaded and no canvas to read them through) gets an empty
 * stand-in for a sourced atlas: it is never drawn there.
 */
export function leafAtlas(kind: LeafKind) {
  const made = leafTex.get(kind);
  if (made) return made;
  const headless = typeof document === 'undefined' && isSourced(kind);
  const mips = headless ? [{ data: new Uint8Array(4), width: 1, height: 1 }] : coverageMips(isSourced(kind) ? sourcedLeafAtlas(kind) : paintLeafAtlas(kind), LEAF_ATLAS);
  const tex = new THREE.DataTexture(mips[0].data, mips[0].width, mips[0].height, THREE.RGBAFormat);
  tex.mipmaps = mips;
  tex.generateMipmaps = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tex.name = `leaves-${kind}`;
  leafTex.set(kind, shareResource(tex));
  return tex;
}

// ─── Bark ───────────────────────────────────────────────────────────────────

/**
 * The bark kinds, one per grown kind: an oak's deep furrows, a common broadleaf's shallower ones, a
 * willow's criss-crossing ridges, a maple's grey plates, a yew's red-brown flakes and the magic
 * tree's pale ridges with glowing veins; and the dead ash's: an ash's grey-brown bark, its ridges
 * interlacing round long furrows, and the bare, weathered grey wood under it.
 */
export type BarkKind = 'oak' | 'tree' | 'willow' | 'maple' | 'yew' | 'magic' | 'ash' | 'deadwood';

export const BARK_KINDS: BarkKind[] = ['oak', 'tree', 'willow', 'maple', 'yew', 'magic', 'ash', 'deadwood'];

/** A bark's maps (public/textures/bark/, made by tools/bark_textures.py): its colour and its relief. */
interface BarkMaps {
  map: THREE.Texture;
  normal: THREE.Texture;
}

const barkMaps = new Map<BarkKind, BarkMaps>();

/** Load every bark's maps and every sourced leaf atlas (at startup, before any tree is built). */
export async function preloadTreeTextures() {
  const loader = new THREE.TextureLoader();
  const load = async (file: string, srgb: boolean) => {
    const tex = await loader.loadAsync(`./textures/bark/${file}.jpg`);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.name = `bark-${file}`;
    return shareResource(tex);
  };
  const leaves = async (kind: SourcedLeaf) => {
    const res = await fetch(`./textures/leaves/${kind}.webp`);
    if (!res.ok) throw new Error(`leaves ${kind}: ${res.status}`);
    leafImages.set(kind, await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
  };
  await Promise.all([
    ...BARK_KINDS.map(async (kind) => {
      const [map, normal] = await Promise.all([load(kind, true), load(`${kind}-normal`, false)]);
      barkMaps.set(kind, { map, normal });
    }),
    ...SOURCED_LEAVES.map(leaves),
  ]);
}

export function barkFor(kind: BarkKind) {
  const maps = barkMaps.get(kind);
  if (!maps) throw new Error(`bark ${kind} is not loaded (preloadTreeTextures)`);
  return maps;
}
