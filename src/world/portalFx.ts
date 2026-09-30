import * as THREE from 'three';
import { noiseTexture } from '../render/textures';

/**
 * The flowing portal a lit platform projects: a column of scrolling, twisting energy in the zone
 * colour (soft at the top and bottom, brighter at the silhouette), a brighter inner core, a glow
 * pooled on the platform and motes drifting up through it. All additive and emissive, so it
 * feeds bloom and needs no extra point lights.
 */

const COLUMN_VERT = `
  varying vec2 vUv;
  varying float vRim;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;

const COLUMN_FRAG = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uGain;
  uniform vec3 uColor;
  uniform sampler2D uNoise;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    // Two noise layers climbing and twisting around the column at different rates.
    vec2 a = vec2(vUv.x * 2.0 + vUv.y * 0.35 + uTime * 0.05, vUv.y * 0.9 - uTime * uSpeed);
    vec2 b = vec2(vUv.x * 3.0 - vUv.y * 0.5 - uTime * 0.03, vUv.y * 1.6 - uTime * uSpeed * 1.7);
    float n = texture2D(uNoise, a).r * 0.6 + texture2D(uNoise, b).r * 0.4;
    float streak = smoothstep(0.42, 0.72, n);
    float fade = smoothstep(0.0, 0.16, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.4);
    float body = (0.18 + streak * 0.95) * (0.35 + 0.65 * vRim) * fade;
    vec3 col = mix(uColor, vec3(1.0), streak * streak * 0.3);
    gl_FragColor = vec4(col * body * uGain, 1.0);
  }`;

const POOL_FRAG = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = abs(vUv - 0.5) * 2.0;
    float d = max(p.x, p.y) * 0.55 + length(vUv - 0.5) * 0.9;
    float glow = smoothstep(1.0, 0.1, d) * (0.8 + 0.2 * sin(uTime * 2.1));
    gl_FragColor = vec4(uColor * glow * 0.28, 1.0);
  }`;

const MOTE_VERT = `
  uniform float uTime;
  uniform float uHeight;
  attribute float aSeed;
  varying float vFade;
  void main() {
    vec3 p = position;
    float life = fract(aSeed * 7.31 + uTime * (0.16 + aSeed * 0.12));
    p.y += life * uHeight;
    float a = uTime * (0.6 + aSeed) + aSeed * 40.0;
    p.x += sin(a) * 0.12;
    p.z += cos(a) * 0.12;
    vFade = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.65, 1.0, life));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (0.9 + aSeed * 0.8) * 260.0 / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const MOTE_FRAG = `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * a * vFade * 1.6, 1.0);
  }`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

export interface PortalFx {
  obj: THREE.Group;
  tick(t: number): void;
}

/** A portal column standing on a platform whose top is at `baseY`. */
export function buildPortalFx(color: number, baseY: number, radius = 0.95, height = 3.3): PortalFx {
  const obj = new THREE.Group();
  obj.name = 'portal-fx';
  const c = new THREE.Color(color);
  const time = { value: 0 };
  const noise = noiseTexture();
  const column = (r: number, speed: number, gain: number) => {
    const mat = new THREE.ShaderMaterial({
      ...additive, side: THREE.DoubleSide,
      uniforms: { uTime: time, uSpeed: { value: speed }, uGain: { value: gain }, uColor: { value: c }, uNoise: { value: noise } },
      vertexShader: COLUMN_VERT, fragmentShader: COLUMN_FRAG,
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, height, 28, 1, true), mat);
    m.position.y = baseY + height / 2;
    m.renderOrder = 3;
    obj.add(m);
  };
  column(radius, 0.22, 2.1);
  column(radius * 0.48, 0.4, 1.1);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2.6, radius * 2.6).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ ...additive, uniforms: { uTime: time, uColor: { value: c } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: POOL_FRAG }),
  );
  pool.position.y = baseY + 0.02;
  pool.renderOrder = 2;
  obj.add(pool);
  // Motes: fixed seeds, animated entirely in the vertex shader.
  const n = 34, pos: number[] = [], seed: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = ((i * 0.618034) % 1), a = i * 2.39996, r = radius * (0.25 + 0.75 * Math.sqrt(((i * 0.3819) % 1)));
    pos.push(Math.cos(a) * r, baseY + 0.05, Math.sin(a) * r);
    seed.push(s);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
    ...additive, uniforms: { uTime: time, uHeight: { value: height * 1.05 }, uColor: { value: c } }, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
  }));
  motes.frustumCulled = false;
  motes.renderOrder = 4;
  obj.add(motes);
  return { obj, tick: (t) => (time.value = t) };
}
