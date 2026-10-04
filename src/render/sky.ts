import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, asin, atan, clamp, dot, exp, Fn, max, mix, normalize, positionGeometry, pow, renderGroup, smoothstep, texture, uniform, vec2 } from 'three/tsl';
import type { V3 } from './patch';
import { shareResource } from './resources';

/**
 * The island's sky: a painted panorama of clear sky over a sea of soft cloud (public/textures/sky/,
 * made by tools/sky_texture.py), graded to the zone's light. The panorama's own bright patch on the
 * horizon is turned to stand under the sun; the sky is tinted warm on the sun's side and cool away
 * from it, the horizon melts into the zone's haze (the fog colour, so distant land and sky meet with
 * no line), and the sun itself shines through as a soft glow round a small bright disc.
 */

let skyTex: THREE.Texture | null = null;

/** Load the sky panorama (at startup, before any zone is built). */
export async function preloadSky() {
  const tex = await new THREE.TextureLoader().loadAsync('./textures/sky/cloudsea.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: the panorama's wrap seam would pick a tiny mip in a one-pixel line.
  tex.generateMipmaps = false;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.name = 'sky-cloudsea';
  skyTex = shareResource(tex);
}

/** Where the panorama's own bright horizon patch lies (its +x, the middle of the picture). */
const PANORAMA_SUN = 0;

/** The light the sky is graded to; set for each zone (Game.enterZone). */
export const SKY_LIGHT = {
  uSunDir: uniform(new THREE.Vector3(0.5, 0.7, 0.5).normalize()).setGroup(renderGroup),
  uSunCol: uniform(new THREE.Color(1, 0.85, 0.7)).setGroup(renderGroup),
  uHaze: uniform(new THREE.Color(0.8, 0.65, 0.6)).setGroup(renderGroup),
  /** Tint on the sun's side and away from it. */
  uTintSun: uniform(new THREE.Color(1.08, 0.94, 0.86)).setGroup(renderGroup),
  uTintAway: uniform(new THREE.Color(0.86, 0.84, 0.98)).setGroup(renderGroup),
};

/** The sky's colour along the view direction from the dome's centre. */
const skyColor = Fn(() => {
  // (The panorama is only needed to draw: the world can be built without it, as the tests do.)
  if (!skyTex) throw new Error('the sky is not loaded (preloadSky)');
  const L = SKY_LIGHT;
  const d = normalize(positionGeometry).toVar();
  // The panorama turned so its bright patch faces the sun's bearing.
  const turn = atan(L.uSunDir.z, L.uSunDir.x).sub(PANORAMA_SUN);
  const lon = atan(d.z, d.x).sub(turn);
  const uv = vec2(lon.div(Math.PI * 2).add(0.5), asin(clamp(d.y, -1, 1)).div(Math.PI).add(0.5));
  const hz = normalize(d.xz.add(1e-5)), sz = normalize(L.uSunDir.xz.add(1e-5));
  const side = dot(hz, sz).mul(0.5).add(0.5).toVar();
  let c: V3 = texture(skyTex).sample(uv).rgb.mul(mix(L.uTintAway, L.uTintSun, side.mul(side)));
  // The horizon melts into the haze (a little brighter towards the sun).
  const band = exp(abs(d.y).mul(-9));
  c = mix(c, L.uHaze.mul(mix(0.95, 1.12, side)), band.mul(0.6));
  // The sun: a small bright disc in a soft warm glow.
  const s = max(dot(d, L.uSunDir), 0).toVar();
  const sun = L.uSunCol.div(max(max(L.uSunCol.r, L.uSunCol.g), L.uSunCol.b));
  return c.add(sun.mul(smoothstep(0.9994, 0.9997, s).mul(1.6).add(pow(s, 48).mul(0.35)).add(pow(s, 6).mul(0.08))));
});

/** The sky dome (radius 180, drawn behind everything, follows the camera). */
export function skyDome(): THREE.Mesh {
  const mat = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  mat.colorNode = skyColor();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 24), mat);
  sky.renderOrder = -10;
  sky.name = 'sky';
  sky.frustumCulled = false;
  // Always centred on the camera, wherever its group follows (the title's wide orbit would otherwise
  // carry the camera out to the dome's edge).
  sky.onBeforeRender = (_r, _s, camera) => {
    sky.matrixWorld.makeTranslation(camera.matrixWorld.elements[12], camera.matrixWorld.elements[13], camera.matrixWorld.elements[14]);
  };
  return sky;
}
