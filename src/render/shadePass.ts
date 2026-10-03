import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Ambient occlusion and the colour grade, after the scene and before bloom and tone mapping.
 *
 * The occlusion is worked out from the depth the scene pass already drew (no second pass over the
 * scene, so it costs no draw calls): wherever surfaces close in on a point (a wall's foot, a
 * window's reveal, the gap under a bench, the joint between a tower and the curtain), less of the
 * sky's soft light reaches it and it darkens. That gives the shade its depth, so the sky light can
 * be generous without washing the shadows out. It is worked at half size with a scatter of
 * samples turned per pixel, then smoothed back to full size across each surface (never across a
 * silhouette). It darkens mostly what the sky and the bounce light alone reach: brightly sunlit
 * surfaces keep most of their light, as they would.
 *
 * The grade then lifts the colour a touch, so the painted colours stay rich after tone mapping.
 */

const ignNoise = /* glsl */ `
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const viewPos = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProjInv;
  vec3 viewAt(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    vec4 v = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
    return v.xyz / v.w;
  }
`;

const AO_SAMPLES = 12;

const aoShader = {
  uniforms: {
    tDepth: { value: null as THREE.Texture | null },
    uProjInv: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uTexel: { value: new THREE.Vector2() },
    uOrtho: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform mat4 uProj;
    uniform vec2 uTexel;
    uniform float uOrtho;
    ${viewPos}
    ${ignNoise}
    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
      vec3 P = viewAt(vUv);
      // The surface's normal from its neighbours' depths (the nearer side at an edge, so silhouettes keep theirs).
      vec3 r = viewAt(vUv + vec2(uTexel.x, 0.0)) - P, l = P - viewAt(vUv - vec2(uTexel.x, 0.0));
      vec3 u = viewAt(vUv + vec2(0.0, uTexel.y)) - P, b = P - viewAt(vUv - vec2(0.0, uTexel.y));
      vec3 N = normalize(cross(abs(r.z) < abs(l.z) ? r : l, abs(u.z) < abs(b.z) ? u : b));
      if (dot(N, P) > 0.0) N = -N;
      float dist = -P.z;
      // About a metre round the point in the play view, wider from far away (whole yards darken a little).
      float radius = clamp(dist * 0.035, 0.5, 3.0);
      vec2 rUv = vec2(uProj[0][0], uProj[1][1]) * radius * 0.5 / mix(dist, 1.0, uOrtho);
      float a0 = ign(gl_FragCoord.xy) * 6.2831853;
      float occ = 0.0;
      for (int i = 0; i < ${AO_SAMPLES}; i++) {
        float t = (float(i) + 0.5) / float(${AO_SAMPLES});
        float a = a0 + float(i) * 2.3999632;
        vec3 v = viewAt(vUv + vec2(cos(a), sin(a)) * rUv * t) - P;
        float vv = dot(v, v);
        float fall = max(0.0, 1.0 - vv / (radius * radius));
        occ += max(0.0, dot(N, v) * inversesqrt(vv + 1e-4) - 0.12) * fall;
      }
      gl_FragColor = vec4(vec3(clamp(1.0 - occ * 1.8 / float(${AO_SAMPLES}), 0.0, 1.0)), 1.0);
    }
  `,
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tAO: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uNearFar: { value: new THREE.Vector3() },
    uAoTexel: { value: new THREE.Vector2() },
    uStrength: { value: 0.75 },
    uLitKeep: { value: 0.45 },
    uFade: { value: new THREE.Vector2(60, 160) },
    uSat: { value: 1.08 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tAO;
    uniform vec2 uAoTexel;
    uniform float uStrength, uLitKeep, uSat;
    uniform vec2 uFade;
    uniform sampler2D tDepth;
    // Distance along the view from a depth (x near, y far, z 1 for an orthographic camera).
    uniform vec3 uNearFar;
    float viewZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return uNearFar.z > 0.5 ? uNearFar.x + d * (uNearFar.y - uNearFar.x) : uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x));
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float d = texture2D(tDepth, vUv).x;
      vec3 c = col.rgb;
      if (d < 1.0) {
        float z0 = viewZ(vUv);
        // Smooth the half-size occlusion over a 4 × 4 patch, only from samples at this surface's depth.
        float sum = 0.0, wsum = 0.0;
        for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
          vec2 uv = vUv + (vec2(float(i), float(j)) - 1.5) * uAoTexel;
          float z = viewZ(uv);
          float w = exp(-abs(z - z0) / (z0 * 0.02 + 0.02));
          sum += texture2D(tAO, uv).r * w;
          wsum += w;
        }
        float ao = wsum > 1e-4 ? sum / wsum : 1.0;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // Sunlit surfaces keep more of their light; the haze covers the occlusion of far things.
        float k = uStrength * mix(1.0, uLitKeep, smoothstep(0.3, 1.3, lum)) * (1.0 - smoothstep(uFade.x, uFade.y, z0));
        c *= mix(1.0, ao, k);
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, uSat), 0.0);
      gl_FragColor = vec4(c, col.a);
    }
  `,
};

export class ShadePass extends Pass {
  private aoTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false });
  private aoMat = new THREE.ShaderMaterial({ ...aoShader, uniforms: THREE.UniformsUtils.clone(aoShader.uniforms), depthTest: false, depthWrite: false });
  private compMat = new THREE.ShaderMaterial({ ...compositeShader, uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms), depthTest: false, depthWrite: false });
  private aoQuad = new FullScreenQuad(this.aoMat);
  private compQuad = new FullScreenQuad(this.compMat);
  /** Ambient occlusion on (with it off the colour grade still runs). */
  occlusion = true;

  constructor(private camera: THREE.Camera, private fog: () => THREE.Fog | null) {
    super();
  }

  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width / 2)), h = Math.max(1, Math.round(height / 2));
    this.aoTarget.setSize(w, h);
    this.aoMat.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.compMat.uniforms.uAoTexel.value.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const depth = readBuffer.depthTexture;
    const cam = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const u = this.compMat.uniforms, a = this.aoMat.uniforms;
    const on = this.occlusion && !!depth;
    const strength = u.uStrength.value;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = depth;
    u.uNearFar.value.set(cam.near, cam.far, (cam as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0);
    u.tAO.value = this.aoTarget.texture;
    if (!on) u.uStrength.value = 0;
    const fog = this.fog();
    if (fog) u.uFade.value.set(fog.near * 0.6, fog.far * 0.8);
    else u.uFade.value.set(1e6, 2e6);
    if (on) {
      a.tDepth.value = depth;
      a.uProjInv.value.copy(cam.projectionMatrixInverse);
      a.uProj.value.copy(cam.projectionMatrix);
      a.uOrtho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
      renderer.setRenderTarget(this.aoTarget);
      this.aoQuad.render(renderer);
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compQuad.render(renderer);
    u.uStrength.value = strength;
  }

  dispose() {
    this.aoTarget.dispose();
    this.aoMat.dispose();
    this.compMat.dispose();
    this.aoQuad.dispose();
    this.compQuad.dispose();
  }
}
