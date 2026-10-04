import * as THREE from 'three';
import { abs, attribute, cross, dFdx, dFdy, dot, float, fract, int, max, min, mix, normalize, positionGeometry, positionView, select, sign, sin, smoothstep, step, vec3, varying } from 'three/tsl';
import { addPatch, instanceOrigin, type F, type V2, type V3, type V4 } from '../../render/patch';
import { shareResource } from '../../render/resources';
import { loadKitProps } from './props';

/**
 * What the kit's pieces are made of, and how each is drawn: one texture array holds every surface
 * (public/textures/kit/, sourced and toned by tools/kit_textures.py), so every piece of every
 * building is drawn with the same material. Each piece shows its own patch of its surface (an offset
 * from where it stands, and from which stone, tile or board of the piece it is) and a tone of its
 * own, so no two stones in a wall, boards in a floor or tiles on a roof are alike. A piece's colour
 * (the cream of the stone, the brown of the timber) multiplies the texture's painted grain, mottling
 * and wear; its relief comes from the texture's normal map. Nothing is glossy.
 *
 * Nothing is quite square either: every corner of every stone, timber and tile is pulled in by its own
 * small amount, so each is a little irregular, as dressed and hewn things are; its edges are worn
 * lighter and chipped darker here and there, plaster darkens where it meets its frame, grime
 * splashed up from the ground darkens everything near it, and broad patches of weather mottle
 * limewash, stone and tile.
 */

/** The surfaces, in the order of the texture array's layers (and of tools/kit_textures.py). */
export const LAYERS = ['stone', 'plaster', 'oak', 'clay', 'iron', 'cloth'] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * Each surface: metres per repeat of its texture, its roughness, how strongly its relief shows, how
 * much one piece's tone differs from the next, and whether it has a grain (wood); how far its corners
 * are pulled in at most (metres), how wide a band of its edges wears (metres), how much lighter the
 * worn edge and how much darker its chips are (plaster's edge darkens instead), how much grime from
 * the ground it takes, and how strongly it is mottled in broad patches (weather on limewash, a
 * roof's tiles fired a little unevenly).
 */
interface Surface {
  tile: number;
  rough: number;
  relief: number;
  vary: number;
  grain: boolean;
  jitter: number;
  wear: number;
  lip: number;
  chip: number;
  grime: number;
  mottle: number;
}
export const SURFACE: Record<Layer, Surface> = {
  stone: { tile: 1.5, rough: 0.92, relief: 0.85, vary: 0.26, grain: false, jitter: 0.013, wear: 0.05, lip: 0.16, chip: 0.38, grime: 0.42, mottle: 0.2 },
  plaster: { tile: 1.8, rough: 0.96, relief: 0.6, vary: 0.07, grain: false, jitter: 0.004, wear: 0.07, lip: -0.14, chip: 0, grime: 0.35, mottle: 0.45 },
  oak: { tile: 1.1, rough: 0.82, relief: 0.9, vary: 0.16, grain: true, jitter: 0.007, wear: 0.03, lip: 0.14, chip: 0.22, grime: 0.3, mottle: 0.12 },
  clay: { tile: 0.8, rough: 0.86, relief: 0.75, vary: 0.34, grain: false, jitter: 0.009, wear: 0.02, lip: 0.1, chip: 0.25, grime: 0.25, mottle: 0.3 },
  iron: { tile: 0.6, rough: 0.6, relief: 0.9, vary: 0.06, grain: false, jitter: 0.002, wear: 0.012, lip: 0.18, chip: 0, grime: 0.1, mottle: 0.2 },
  cloth: { tile: 0.45, rough: 0.97, relief: 0.6, vary: 0.08, grain: false, jitter: 0, wear: 0, lip: 0, chip: 0, grime: 0.15, mottle: 0.15 },
};

/** The texture's colours are multipliers round this mean (tools/kit_textures.py MEAN): scaled back up by its inverse. */
const GAIN = 1 / 0.45;

/** Added to a vertex's stone, tile or board number to mark a part with a colour of its own (geometry.ts). */
export const FIXED = 512;

interface Maps {
  color: THREE.DataArrayTexture;
  normal: THREE.DataArrayTexture;
  /** The painted plant sprays (shapes/plants.ts). */
  plants: THREE.Texture;
}
let maps: Maps | null = null;
let loading: Promise<Maps> | null = null;

/** One strip of square layers side by side, as a texture array (rows bottom-up, so v runs up each layer). */
async function strip(url: string, srgb: boolean): Promise<THREE.DataArrayTexture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`kit surfaces ${url}: ${res.status}`);
  const img = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'flipY' });
  const S = img.height, n = Math.round(img.width / S);
  if (n !== LAYERS.length) throw new Error(`kit surfaces ${url}: ${n} layers, not ${LAYERS.length}`);
  const canvas = new OffscreenCanvas(img.width, S), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  img.close();
  const data = new Uint8Array(S * S * 4 * n);
  for (let i = 0; i < n; i++) data.set(ctx.getImageData(i * S, 0, S, S).data, i * S * S * 4);
  const tex = new THREE.DataArrayTexture(data, S, S, n);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.name = `kit-${srgb ? 'colour' : 'normal'}`;
  tex.needsUpdate = true;
  return shareResource(tex);
}

/** The plant atlas: painted sprays with clear round them, in their own colours. */
async function plantAtlas(): Promise<THREE.Texture> {
  const tex = await new THREE.TextureLoader().loadAsync('./textures/kit/plants.webp');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.name = 'kit-plants';
  return shareResource(tex);
}

/** Loads the kit's surfaces and its modelled props (once; before any building is drawn). */
export function loadKitSurfaces(): Promise<Maps> {
  loading ??= Promise.all([strip('./textures/kit/surfaces.jpg', true), strip('./textures/kit/surfaces-normal.jpg', false), plantAtlas(), loadKitProps()])
    .then(([color, normal, plants]) => (maps = { color, normal, plants }))
    .catch((err) => {
      // (Not kept: the next building to be drawn tries again.)
      loading = null;
      throw err;
    });
  return loading;
}

let plants: THREE.MeshStandardMaterial | null = null;

/**
 * The material plants are drawn with: their painted sprays cut out by their alpha (soft-edged with
 * multisampling), both faces lit alike, matte.
 */
export function plantMaterial(): THREE.MeshStandardMaterial {
  if (plants) return plants;
  if (!maps) throw new Error('kit surfaces are not loaded (loadKitSurfaces)');
  const m = new THREE.MeshStandardMaterial({ map: maps.plants, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity: 0 });
  m.name = 'kit-plants';
  return (plants = shareResource(m));
}

/** A value per layer, picked by the fragment's layer. */
function perLayer(layer: F, pick: (l: Layer) => number): F {
  let out: F = float(pick(LAYERS[LAYERS.length - 1]));
  for (let i = LAYERS.length - 2; i >= 0; i--) out = select(layer.lessThan(i + 0.5), float(pick(LAYERS[i])), out);
  return out;
}

/** A hash of a point: three values in [0, 1). */
const hash3 = (p: V3): V3 => fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))).mul(43758.5453)) as V3;

let material: THREE.MeshStandardMaterial | null = null;

/**
 * The one material every kit piece is drawn with (its textures must be loaded: loadKitSurfaces).
 * Matte and dielectric; the vertex colour carries the shade of recesses and end grain.
 */
export function kitMaterial(): THREE.MeshStandardMaterial {
  if (material) return material;
  if (!maps) throw new Error('kit surfaces are not loaded (loadKitSurfaces)');
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true, envMapIntensity: 0 });
  const { color, normal } = maps;
  addPatch(m, {
    key: 'kit-surface',
    uniforms: { uKitColor: { value: color }, uKitNormal: { value: normal } },
    nodes(u, b) {
      const kit = attribute('aKit', 'vec4') as V4, rel = attribute('aRel', 'vec3') as V3, size = attribute('aHalf', 'vec3') as V3;
      const origin = instanceOrigin(b);
      /** A vertex's stone, tile or board number, its mark for a colour of its own taken off. */
      const subOf = (mark: F) => mark.sub(step(FIXED - 0.5, mark).mul(FIXED));
      const pieceSeed = (sub: F) => origin.add(vec3(sub.mul(17.31), sub.mul(5.77), sub.mul(11.13)));
      let uv: V2 = kit.xy, layer: F = float(0), seed: V3 = vec3(0);
      const at = () => int(layer.add(0.5));
      return {
        position(p) {
          // Each corner pulled in by its own amount (the same for every vertex there, so nothing opens up).
          const pull = hash3(pieceSeed(subOf(kit.w)).add(rel.mul(13.7)));
          const amp = perLayer(kit.z as F, (l) => SURFACE[l].jitter).mul(step(1e-4, size.x));
          return p.sub(sign(rel).mul(pull).mul(amp));
        },
        color(c) {
          layer = varying(kit.z).setInterpolation('flat') as F;
          const mark = varying(kit.w).setInterpolation('flat') as F;
          // A part with a colour of its own carries it in its vertices; the rest take the piece's colour.
          const fixed = step(FIXED - 0.5, mark), sub = subOf(mark);
          const piece = mix(attribute('aTint', 'vec3') as V3, vec3(1), fixed);
          // Which piece (where it stands) and which of its stones, tiles or boards: its own patch and tone.
          seed = hash3(pieceSeed(sub)).toVar();
          uv = kit.xy.add(seed.xy.mul(7.0)).toVar();
          const tex = u.tex('uKitColor').sample(uv).depth(at()).rgb;
          const vary = perLayer(layer, (l) => SURFACE[l].vary);
          const tone = float(1).add(seed.z.sub(0.5).mul(vary));
          const hue = vec3(1).add(seed.sub(0.5).mul(vary.mul(0.35)));
          // Worn edges: within a band of its own box's edges a piece is worn lighter, chipped darker where
          // its texture runs dark (the band measured across the face, to the nearer of its two edges).
          const box = varying(size) as V3, d = box.sub(abs(varying(rel) as V3));
          const lo = min(min(d.x, d.y), d.z), hi = max(max(d.x, d.y), d.z), across = d.x.add(d.y).add(d.z).sub(lo).sub(hi);
          const band = perLayer(layer, (l) => Math.max(1e-4, SURFACE[l].wear));
          const edge = float(1).sub(smoothstep(float(0), band, across)).mul(step(1e-4, box.x));
          const luma = (t: V3) => dot(t, vec3(0.2126, 0.7152, 0.0722));
          const grain = luma(u.tex('uKitColor').sample(uv.mul(1.7).add(0.37)).depth(at()).rgb);
          const chip = edge.mul(float(1).sub(smoothstep(0.3, 0.45, grain)));
          const worn = float(1).add(edge.sub(chip).mul(perLayer(layer, (l) => SURFACE[l].lip))).sub(chip.mul(perLayer(layer, (l) => SURFACE[l].chip)));
          // Grime splashed up from the ground, fading out by about knee height.
          const grime = float(1).sub(smoothstep(0.05, 0.9, origin.y.add(positionGeometry.y))).mul(perLayer(layer, (l) => SURFACE[l].grime));
          // Broad mottling: the texture's own light and dark, blown up five times over, as patches.
          const blot = luma(u.tex('uKitColor').sample(uv.mul(0.19).add(0.61)).depth(at()).rgb).mul(GAIN);
          const mottle = mix(float(1), blot, perLayer(layer, (l) => SURFACE[l].mottle));
          const lit = c.mul(piece).mul(tex).mul(tone.mul(GAIN)).mul(hue).mul(worn).mul(mottle);
          return mix(lit, lit.mul(vec3(0.7, 0.66, 0.58)), grime);
        },
        roughness: () => perLayer(layer, (l) => SURFACE[l].rough),
        normal(n) {
          // The relief along the texture's own directions on the face (from how u and v run across the screen).
          const nl = u.tex('uKitNormal').sample(uv).depth(at()).xyz.mul(2).sub(1);
          const q0 = dFdx(positionView), q1 = dFdy(positionView), st0 = dFdx(uv), st1 = dFdy(uv);
          const q1n = cross(q1, n), q0n = cross(n, q0);
          const bu0 = q1n.mul(st0.x).add(q0n.mul(st1.x)), bv0 = q1n.mul(st0.y).add(q0n.mul(st1.y));
          const bu = select(dot(bu0, bu0).greaterThan(1e-12), normalize(bu0), vec3(0));
          const bv = select(dot(bv0, bv0).greaterThan(1e-12), normalize(bv0), vec3(0));
          const tilt = bu.mul(nl.x).add(bv.mul(nl.y)).mul(perLayer(layer, (l) => SURFACE[l].relief)).toVar();
          return normalize(n.add(tilt).sub(n.mul(dot(tilt, n))));
        },
      };
    },
  });
  m.name = 'kit';
  return (material = shareResource(m));
}
