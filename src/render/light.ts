import * as THREE from 'three';

/**
 * The world's sunlight: one shadow map fitted to whatever the camera sees, and the haze that
 * gathers with distance.
 *
 * The shadow map is not a fixed box round the hero but the camera's own view, cut to the band of
 * height where the ground and the walls stand and to the shadows' reach, seen from the sun. So the
 * play camera's whole screen has shadows at every zoom, and a camera over the whole castle has them
 * too, with no edge where they stop. While the camera moves, the box keeps its size (rounded up to
 * whole steps, and held while the view still fits) and slides in whole shadow texels, so shadow edges
 * never crawl or shimmer.
 */

/**
 * Towards the sun: from the south-east, about 42° up (a late-afternoon sun). Lower than a midday
 * sun so it rakes across the walls the camera faces and throws long shadows north-west, up and to
 * the left on screen, where they read clearly beyond whatever casts them.
 */
export const SUN_DIR = new THREE.Vector3(13, 16, 12).normalize();

/**
 * The band of height the shadows are fitted to: from a little under the ground at the view's focus
 * (a moat, a sunken path) to the height of the curtain's towers. Higher surfaces (the keep's upper
 * storeys, the spires) still take shadows wherever the band's box reaches them, which in the play
 * view is all but the farthest corner; the box is not grown for them, since every metre of height
 * widens it across the whole view.
 */
const BAND_BELOW = 6, BAND_ABOVE = 26;
/** How tall a caster can stand towards the sun (the keep's spires stand 57 m). */
const CASTER_HEIGHT = 62;
/** Room past the view on every side, so a caster just off screen still throws its shadow in. */
const PAD = 3;
/** The box grows and shrinks in steps of this many metres (a steady size never shimmers). */
const STEP = 4;
/** Width of a shadow's soft edge in metres, at any distance (clamped to a sensible filter in texels). */
const PENUMBRA = 0.1;

const grid = [-1, 0, 1];
const _o = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Vector3();
const _view = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0), _zero = new THREE.Vector3();
const pool = Array.from({ length: 18 }, () => new THREE.Vector3());
const rays = Array.from({ length: 9 }, () => new THREE.Vector3());

/** The box's width and height as last fitted (and the map size they were fitted for). */
const box = { w: 0, h: 0, size: 0 };

/**
 * The box's width (axis 0) or height (1) for a view `span` metres across: rounded up to whole steps,
 * and kept as it was while the view still fits and has not shrunk by two whole steps, so the camera's
 * shake, a step up a stair or a little zoom never flick it between two sizes (each change of size
 * moves every shadow edge by a fraction of a texel).
 */
function held(axis: 0 | 1, span: number, size: number) {
  const key = axis ? 'h' : 'w';
  const need = Math.ceil((span + PAD * 2) / STEP) * STEP;
  if (box.size !== size || need > box[key] || need < box[key] - STEP * 2) box[key] = need;
  box.size = size;
  return box[key];
}

/**
 * Fit the sun's shadow camera to `camera`'s view. `toSun` is the unit direction towards the sun,
 * `groundY` the height of the ground at the view's focus, `reach` how far from the camera shadows
 * still fall. Places the sun and its target, and sets the filter and the biases for the texel size.
 */
export function fitSunShadow(sun: THREE.DirectionalLight, camera: THREE.PerspectiveCamera, toSun: THREE.Vector3, groundY: number, reach: number) {
  // (In whole metres, so walking over uneven ground never nudges the box.)
  groundY = Math.round(groundY);
  camera.updateMatrixWorld();
  _o.setFromMatrixPosition(camera.matrixWorld);
  // Nine rays across the view (corners, edge middles, centre).
  let k = 0, rise = -1;
  for (const gy of grid) for (const gx of grid) {
    const r = rays[k++].set(gx, gy, 0.5).unproject(camera).sub(_o).normalize();
    rise = Math.max(rise, r.y);
  }
  // (Nothing above the camera can be seen while every ray looks down, so then the band stops at its height.)
  const yLo = groundY - BAND_BELOW, yHi = Math.max(yLo + 1, Math.min(groundY + BAND_ABOVE, rise < 0 ? _o.y : Infinity));
  const far = Math.min(camera.far, reach);
  let n = 0;
  // Where each ray crosses the height band.
  for (const ray of rays) {
    let t0 = camera.near, t1 = far;
    if (Math.abs(ray.y) > 1e-5) {
      const ta = (yLo - _o.y) / ray.y, tb = (yHi - _o.y) / ray.y;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    } else if (_o.y < yLo || _o.y > yHi) continue;
    if (t1 <= t0) continue;
    pool[n++].copy(_o).addScaledVector(ray, t0);
    pool[n++].copy(_o).addScaledVector(ray, t1);
  }
  if (!n) pool[n++].copy(_o).setY(groundY);
  // Into the sun's frame: x and y across its beams, z along them (towards the sun).
  _view.lookAt(toSun, _zero, Math.abs(toSun.y) > 0.99 ? _p.set(0, 0, 1) : _up);
  _inv.copy(_view).invert();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity, z0 = Infinity;
  for (let i = 0; i < n; i++) {
    const q = pool[i].applyMatrix4(_inv);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
  }
  const size = sun.shadow.mapSize.x;
  const w = held(0, x1 - x0, size), h = held(1, y1 - y0, size);
  const tx = w / size, ty = h / size;
  // The centre slides in whole texels.
  const cx = Math.round((x0 + x1) / 2 / tx) * tx, cy = Math.round((y0 + y1) / 2 / ty) * ty;
  // The sun stands back from the band's nearest point by as far as a beam takes to climb from under
  // the band to the tallest caster, so anything standing towards the sun (off screen too) still casts.
  const back = (BAND_BELOW + CASTER_HEIGHT) / Math.max(toSun.y, 0.25) + 5;
  _c.set(cx, cy, z1 + back).applyMatrix4(_view);
  const sc = sun.shadow.camera;
  sc.left = -w / 2;
  sc.right = w / 2;
  sc.bottom = -h / 2;
  sc.top = h / 2;
  sc.near = 1;
  sc.far = z1 - z0 + back + 5;
  sc.updateProjectionMatrix();
  sun.position.copy(_c);
  sun.target.position.copy(_c).addScaledVector(toSun, -1);
  sun.target.updateMatrixWorld();
  // A soft edge of the same width at every distance; normal offset and depth bias in step with the texel.
  const texel = Math.max(tx, ty);
  sun.shadow.radius = THREE.MathUtils.clamp(PENUMBRA / texel, 1.2, 5);
  sun.shadow.normalBias = THREE.MathUtils.clamp(texel * 2.6, 0.035, 0.12);
  sun.shadow.bias = -0.06 / sc.far;
}

/**
 * Distance haze (aerial perspective), patched into every built-in material's fog once, before any
 * material compiles. The scene's Fog keeps its meaning (near: where the haze begins to show, far:
 * where it has swallowed everything), but it gathers smoothly with distance instead of in a band,
 * so the far side of the view is a little paler and softer, never cut off. Towards the sun the haze
 * glows with the sunlight's warmth; away from it, it stays the cooler sky colour.
 */
export function hazeFog() {
  const C = THREE.ShaderChunk;
  if (C.fog_fragment.includes('haze-fog')) return;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogView;');
  C.fog_vertex = C.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogView = mvPosition.xyz;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogView;');
  // Lit materials declare the lights first: mark that the sun's direction can be read.
  C.lights_pars_begin += '\n#define HAZE_SUN\n';
  C.fog_fragment = `// haze-fog
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		vec3 hazeColor = fogColor;
	#else
		// Thin at first, then thicker: about 5% at the near edge, 60% halfway out, 95% at the far edge.
		float hazeD = length( vFogView );
		float hazeT = max( hazeD - fogNear * 0.8, 0.0 ) / max( fogFar - fogNear * 0.8, 1.0 );
		float fogFactor = 1.0 - exp( - 3.0 * hazeT * hazeT );
		vec3 hazeColor = fogColor;
		#if defined( HAZE_SUN ) && NUM_DIR_LIGHTS > 0
			vec3 hazeSun = directionalLights[ 0 ].color;
			float hazeGlow = pow( max( dot( normalize( vFogView ), directionalLights[ 0 ].direction ), 0.0 ), 4.0 );
			hazeColor = mix( fogColor, fogColor * ( 0.75 + 0.5 * hazeSun / max( max( hazeSun.r, hazeSun.g ), max( hazeSun.b, 1e-3 ) ) ), hazeGlow * 0.6 );
		#endif
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor, fogFactor );
#endif
`;
}
