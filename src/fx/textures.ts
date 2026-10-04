import * as THREE from 'three';
import { shareResource } from '../render/resources';
import { PAGES, type PageId } from './sheets';

/**
 * The effects' textures (public/textures/fx/, made by tools/blender/vfx.py), loaded once on first use and shared by
 * every effect for the session. Each is read raw (no premultiplying or colour conversion by the browser: the alpha
 * page is premultiplied already, the masks are data) and kept image-side up (v runs down the picture). A world built
 * headless (the tests, with no images to load) gets empty stand-ins, never drawn there.
 */

/**
 * The mesh effects' paint: greyscale streaks and cloud noise (both tile), a ring, a magic circle, a lightning strip
 * (tiles across), and in colour the frost circle and the sword slash unwrapped into a strip (tail to head along u).
 */
export type MaskId = 'trail' | 'noise' | 'ring' | 'sigil' | 'bolt' | 'frostCircle' | 'slash';

const MASKS: Record<MaskId, { file: string; light: boolean; tile: boolean }> = {
  trail: { file: 'fx-trail.jpg', light: false, tile: true },
  noise: { file: 'fx-noise.jpg', light: false, tile: true },
  ring: { file: 'fx-ring.jpg', light: true, tile: false },
  sigil: { file: 'fx-sigil.jpg', light: true, tile: false },
  bolt: { file: 'fx-bolt.jpg', light: true, tile: true },
  frostCircle: { file: 'fx-frost-circle.jpg', light: true, tile: false },
  slash: { file: 'fx-slash.jpg', light: true, tile: false },
};

const cache = new Map<string, THREE.Texture>();

/** `light`: a picture of light or colour (stored sRGB, read as linear light); otherwise data, read as stored. */
function load(file: string, light: boolean, tile: boolean) {
  const made = cache.get(file);
  if (made) return made;
  const tex = shareResource(new THREE.Texture());
  tex.name = `fx-${file}`;
  tex.flipY = false;
  tex.colorSpace = light ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  cache.set(file, tex);
  if (typeof document !== 'undefined') {
    void fetch(`./textures/fx/${file}`)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`${file}: ${res.status}`))))
      .then((blob) => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'from-image' }))
      .then((bmp) => {
        tex.image = bmp;
        tex.needsUpdate = true;
      })
      .catch((e: unknown) => console.error('effect texture', file, e));
  }
  return tex;
}

/** A page of painted frames (sheets.ts). */
export const pageTexture = (id: PageId) => load(PAGES[id].file, true, false);

export const maskTexture = (id: MaskId) => load(MASKS[id].file, MASKS[id].light, MASKS[id].tile);

/** Start loading every effect texture (at startup, so the first blow of a fight already shows). */
export function preloadEffectTextures() {
  for (const id of Object.keys(PAGES) as PageId[]) pageTexture(id);
  for (const id of Object.keys(MASKS) as MaskId[]) maskTexture(id);
}
