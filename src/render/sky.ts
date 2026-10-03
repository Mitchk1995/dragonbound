import * as THREE from 'three';
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
  uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
  uSunCol: { value: new THREE.Color(1, 0.85, 0.7) },
  uHaze: { value: new THREE.Color(0.8, 0.65, 0.6) },
  /** Tint on the sun's side and away from it. */
  uTintSun: { value: new THREE.Color(1.08, 0.94, 0.86) },
  uTintAway: { value: new THREE.Color(0.86, 0.84, 0.98) },
};

/** The sky dome (radius 180, drawn behind everything, follows the camera). */
export function skyDome(): THREE.Mesh {
  const uTex = { value: skyTex };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { ...SKY_LIGHT, uTex },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      uniform sampler2D uTex;
      uniform vec3 uSunDir, uSunCol, uHaze, uTintSun, uTintAway;
      void main() {
        vec3 d = normalize(vP);
        // The panorama turned so its bright patch faces the sun's bearing.
        float turn = atan(uSunDir.z, uSunDir.x) - ${PANORAMA_SUN.toFixed(1)};
        float lon = atan(d.z, d.x) - turn;
        vec2 uv = vec2(lon / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec3 c = texture2D(uTex, uv).rgb;
        vec2 hz = normalize(d.xz + 1e-5), sz = normalize(uSunDir.xz + 1e-5);
        float side = dot(hz, sz) * 0.5 + 0.5;
        c *= mix(uTintAway, uTintSun, side * side);
        // The horizon melts into the haze (a little brighter towards the sun).
        float band = exp(-abs(d.y) * 9.0);
        c = mix(c, uHaze * mix(0.95, 1.12, side), band * 0.6);
        // The sun: a small bright disc in a soft warm glow.
        float s = max(dot(d, uSunDir), 0.0);
        vec3 sun = uSunCol / max(max(uSunCol.r, uSunCol.g), uSunCol.b);
        c += sun * (smoothstep(0.9994, 0.9997, s) * 1.6 + pow(s, 48.0) * 0.35 + pow(s, 6.0) * 0.08);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  // (The panorama is only needed to draw: the world can be built without it, as the tests do.)
  mat.onBeforeCompile = () => {
    if (!skyTex) throw new Error('the sky is not loaded (preloadSky)');
    uTex.value = skyTex;
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 24), mat);
  sky.renderOrder = -10;
  sky.name = 'sky';
  sky.frustumCulled = false;
  return sky;
}
