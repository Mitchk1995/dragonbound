import * as THREE from 'three';
import { RenderPipeline, type PassNode, type Renderer, type TextureNode } from 'three/webgpu';
import { abs, clamp, cross, dot, exp, float, Fn, getViewPosition, If, interleavedGradientNoise, max, mix, normalize, pass, perspectiveDepthToViewZ, rtt, screenCoordinate, select, smoothstep, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { F, V2, V3, V4 } from './patch';

/**
 * The frame after the scene: ambient occlusion and the colour grade, then bloom (HDR, only values
 * above ~1 glow: emissives, fire, lava, portals), then tone mapping (the renderer's ACES and
 * exposure) and the display's colour space.
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

const AO_SAMPLES = 12;
const LUMA = vec3(0.2126, 0.7152, 0.0722);

export interface PostQuality {
  /** Multisampling of the scene pass (0 or 4). */
  msaa: number;
  /** Ambient occlusion and the colour grade. */
  shade: boolean;
  bloom: boolean;
  /** With `shade`, the occlusion too (off: the colour grade alone; on by default). */
  occlusion?: boolean;
}

export class PostChain {
  private readonly pipeline: RenderPipeline;
  private readonly scenePass: PassNode;
  /** The camera's projection, as the half-size occlusion pass reads it (its own quad has another camera). */
  private readonly projInv = uniform(new THREE.Matrix4());
  private readonly projScale = uniform(new THREE.Vector2());
  private readonly nearFar = uniform(new THREE.Vector2());
  /** One full-size texel, and one texel of the half-size occlusion. */
  private readonly texel = uniform(new THREE.Vector2());
  private readonly aoTexel = uniform(new THREE.Vector2());
  /** Where the haze covers the occlusion of far things (from the fog). */
  private readonly fade = uniform(new THREE.Vector2(60, 160));
  private quality: PostQuality | null = null;
  private readonly size = new THREE.Vector2();

  constructor(private renderer: Renderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private fog: () => THREE.Fog | null) {
    this.scenePass = pass(scene, camera, { samples: 4 });
    this.pipeline = new RenderPipeline(renderer);
  }

  /** Set what the chain does (a graphics preset); rebuilds it when anything changed. */
  setQuality(q: PostQuality) {
    const was = this.quality;
    if (was && was.msaa === q.msaa && was.shade === q.shade && was.bloom === q.bloom && was.occlusion === q.occlusion) return;
    this.quality = { ...q };
    const rt = this.scenePass.renderTarget;
    this.scenePass.options.samples = q.msaa;
    if (rt.samples !== q.msaa) {
      rt.samples = q.msaa;
      rt.dispose();
    }
    const color = this.scenePass.getTextureNode('output'), depth = this.scenePass.getTextureNode('depth');
    let out: V4 = color as unknown as V4;
    if (q.shade) {
      const ao = q.occlusion === false ? null : rtt(this.occlusion(depth), null, null, { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false, resolutionScale: 0.5 });
      out = this.composite(color, depth, ao as unknown as TextureNode | null);
    }
    if (q.bloom) {
      // (The graded frame drawn once, read by the bloom and the output alike.)
      const graded = q.shade ? rtt(out, null, null, { type: THREE.HalfFloatType, depthBuffer: false }) : out;
      // (Picked up at half size: any smaller and thin bright lines, such as rune inlays, slip between
      // its samples and lose their glow.)
      const glow = bloom(graded, 0.55, 0.5, 0.95);
      out = (graded as V4).add(glow as unknown as V4);
    }
    this.pipeline.outputNode = out;
    this.pipeline.needsUpdate = true;
  }

  /** How many samples the scene pass draws with now. */
  get samples() {
    return this.scenePass.renderTarget.samples;
  }

  /** Draw the frame through the chain. */
  render() {
    const cam = this.camera;
    this.projInv.value.copy(cam.projectionMatrixInverse);
    const pm = cam.projectionMatrix.elements;
    this.projScale.value.set(pm[0], pm[5]);
    this.nearFar.value.set(cam.near, cam.far);
    this.renderer.getDrawingBufferSize(this.size);
    this.texel.value.set(1 / this.size.x, 1 / this.size.y);
    this.aoTexel.value.set(1 / Math.max(1, Math.floor(this.size.x * 0.5)), 1 / Math.max(1, Math.floor(this.size.y * 0.5)));
    const fog = this.fog();
    if (fog) this.fade.value.set(fog.near * 0.6, fog.far * 0.8);
    else this.fade.value.set(1e6, 2e6);
    this.pipeline.render();
  }

  dispose() {
    this.pipeline.dispose();
    this.scenePass.dispose();
  }

  /** The occlusion (1 open .. 0 closed in), for the half-size pass. */
  private occlusion(depth: TextureNode) {
    const { projInv, projScale, texel } = this;
    return Fn(() => {
      const at = uv();
      const out = float(1).toVar();
      const viewAt = (q: V2): V3 => getViewPosition(q, depth.sample(q).r, projInv) as unknown as V3;
      If(depth.sample(at).r.lessThan(1), () => {
        const P = viewAt(at).toVar();
        // The surface's normal from its neighbours' depths (the nearer side at an edge, so silhouettes keep theirs).
        const r = viewAt(at.add(vec2(texel.x, 0))).sub(P).toVar(), l = P.sub(viewAt(at.sub(vec2(texel.x, 0)))).toVar();
        const u = viewAt(at.add(vec2(0, texel.y))).sub(P).toVar(), b = P.sub(viewAt(at.sub(vec2(0, texel.y)))).toVar();
        const n0 = normalize(cross(select(abs(r.z).lessThan(abs(l.z)), r, l), select(abs(u.z).lessThan(abs(b.z)), u, b))).toVar();
        const N = select(dot(n0, P).greaterThan(0), n0.negate(), n0).toVar();
        const dist = P.z.negate().toVar();
        // About a metre round the point in the play view, wider from far away (whole yards darken a little).
        const radius = clamp(dist.mul(0.035), 0.5, 3).toVar();
        const rUv = projScale.mul(radius.mul(0.5).div(dist)).toVar();
        const a0 = interleavedGradientNoise(screenCoordinate.xy).mul(Math.PI * 2).toVar();
        const occ = float(0).toVar();
        for (let i = 0; i < AO_SAMPLES; i++) {
          const t = (i + 0.5) / AO_SAMPLES;
          const a = a0.add(i * 2.3999632).toVar();
          const v = viewAt(at.add(vec2(a.cos(), a.sin()).mul(rUv).mul(t))).sub(P).toVar();
          const vv = dot(v, v).toVar();
          const fall = max(float(1).sub(vv.div(radius.mul(radius))), 0);
          occ.addAssign(max(dot(N, v).mul(vv.add(1e-4).inverseSqrt()).sub(0.12), 0).mul(fall));
        }
        out.assign(clamp(float(1).sub(occ.mul(1.8 / AO_SAMPLES)), 0, 1));
      });
      return vec4(out, out, out, 1);
    })();
  }

  /** The frame with the occlusion (if any) smoothed onto it and the colour graded. */
  private composite(color: TextureNode, depth: TextureNode, ao: TextureNode | null): V4 {
    const { nearFar, aoTexel, fade } = this;
    const strength = 0.75, litKeep = 0.45, sat = 1.08;
    return Fn(() => {
      const at = uv();
      const col = color.sample(at).toVar();
      const c = col.rgb.toVar();
      // Distance along the view from a depth.
      const viewZ = (q: V2): F => (perspectiveDepthToViewZ(depth.sample(q).r, nearFar.x, nearFar.y) as unknown as F).negate();
      if (ao) If(depth.sample(at).r.lessThan(1), () => {
        const z0 = viewZ(at).toVar();
        // Smooth the half-size occlusion over a 4 × 4 patch, only from samples at this surface's depth.
        const sum = float(0).toVar(), wsum = float(0).toVar();
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
          const q = at.add(vec2(i - 1.5, j - 1.5).mul(aoTexel)).toVar();
          const w = exp(abs(viewZ(q).sub(z0)).negate().div(z0.mul(0.02).add(0.02))).toVar();
          sum.addAssign(ao.sample(q).r.mul(w));
          wsum.addAssign(w);
        }
        const occ = select(wsum.greaterThan(1e-4), sum.div(wsum), float(1));
        const lum = dot(c, LUMA);
        // Sunlit surfaces keep more of their light; the haze covers the occlusion of far things.
        const k = mix(1, litKeep, smoothstep(0.3, 1.3, lum)).mul(strength).mul(float(1).sub(smoothstep(fade.x, fade.y, z0)));
        c.mulAssign(mix(1, occ, k));
      });
      const l = dot(c, LUMA);
      return vec4(max(mix(vec3(l), c, sat), 0), col.a);
    })() as unknown as V4;
  }
}
