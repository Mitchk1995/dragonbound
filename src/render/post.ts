import * as THREE from 'three';
import { BlendMode, DepthTexture, NodeMaterial, QuadMesh, RendererUtils, RenderPipeline, RenderTarget, TextureNode, type Node, type NodeBuilder, type NodeFrame, type PassNode, type Renderer } from 'three/webgpu';
import { abs, clamp, cross, diffuseColor, dot, exp, float, Fn, getViewPosition, If, interleavedGradientNoise, max, mix, mrt, NodeUpdateType, normalize, normalView, output, packNormalToRGB, pass, perspectiveDepthToViewZ, roughness, rtt, sample, screenCoordinate, select, smoothstep, uniform, unpackRGBToNormal, uv, vec2, vec3, vec4, velocity } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { ao as gtao, type default as GTAONode } from 'three/examples/jsm/tsl/display/GTAONode.js';
import SSGINode from 'three/examples/jsm/tsl/display/SSGINode.js';
import { ssr, type default as SSRNode } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { sharpen } from 'three/examples/jsm/tsl/display/SharpenNode.js';
import { traa, type default as TRAANode } from 'three/examples/jsm/tsl/display/TRAANode.js';
import type { F, V2, V3, V4 } from './patch';
import { isEffectsWater, setEffectsBuffers, waterShine } from './surfaces';

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
 *
 * Four more effects can each be switched on (see LightingEffects; all off, the frame is exactly the
 * one above). They read what the scene pass leaves in a few more buffers beside the picture (each
 * surface's facing, colour, gloss and motion), so they too cost no extra draw calls: all their work
 * is on the graphics card.
 */

const AO_SAMPLES = 12;
const LUMA = vec3(0.2126, 0.7152, 0.0722);

/** The screen-space light, each effect its own switch. Off, each leaves the frame as it was. */
export interface LightingEffects {
  /**
   * Bounce light (screen-space global illumination): every lit surface on screen lights what faces
   * it, in its own colour, so sunlit floors and walls throw warm light into rooms, archways and the
   * shade beside them.
   */
  bounce: boolean;
  /** Soft contact shading by ground-truth ambient occlusion (GTAO), in place of the occlusion above. */
  contact: boolean;
  /** Reflections in water and on polished or wet surfaces (screen-space reflections), nowhere else. */
  reflections: boolean;
  /**
   * Smooth edges by temporal anti-aliasing (TRAA) in place of multisampling: each frame is drawn a
   * fraction of a pixel aside and blended with the last, so edges, thin leaves and fine texture stop
   * crawling. It also settles the other effects' grain over a few frames.
   */
  smooth: boolean;
}

export const NO_EFFECTS: LightingEffects = { bounce: false, contact: false, reflections: false, smooth: false };

/** How finely the effects are worked, with the graphics preset. */
export type EffectLevel = 'high' | 'medium' | 'low';

/**
 * Per level: the bounce light's size on screen (1 full, 0.5 half), its slices and steps; the contact
 * shading's size and samples; the reflections' size and how finely they march.
 */
const LEVELS: Record<EffectLevel, { gi: number; giSlices: number; giSteps: number; ao: number; aoSamples: number; ssr: number; ssrQuality: number }> = {
  high: { gi: 0.5, giSlices: 2, giSteps: 10, ao: 0.5, aoSamples: 16, ssr: 0.5, ssrQuality: 0.5 },
  medium: { gi: 0.5, giSlices: 2, giSteps: 8, ao: 0.5, aoSamples: 12, ssr: 0.5, ssrQuality: 0.4 },
  low: { gi: 0.5, giSlices: 1, giSteps: 8, ao: 0.5, aoSamples: 8, ssr: 0.5, ssrQuality: 0.3 },
};

/** The effects' look, tuned for the painted style (see setQuality). */
export const EFFECT_TUNING = {
  /** Bounce light: how far it carries (metres), how strong it is. */
  giRadius: 3.5,
  giIntensity: 7,
  giThickness: 0.6,
  /** Contact shading: how far round a point it looks (metres) and how thick it takes things to be. */
  aoRadius: 1.4,
  aoThickness: 1.5,
  /** Reflections: how far they reach (metres) and how strong they show. */
  ssrDistance: 12,
  ssrThickness: 0.5,
  ssrIntensity: 2.5,
  /** How much of a glossy surface's own colour gives way where something is reflected in it. */
  ssrCover: 0.6,
  /** The reflectivity of water, and of the glossiest dry surface (wet rock, obsidian). */
  waterShine: 0.8,
  glossShine: 0.45,
  /** The sharpen after the smoothing: 0 the most, 2 none. */
  sharpness: 0.35,
};

export interface PostQuality {
  /** Multisampling of the scene pass (0 or 4). */
  msaa: number;
  /** Ambient occlusion and the colour grade. */
  shade: boolean;
  bloom: boolean;
  /** With `shade`, the occlusion too (off: the colour grade alone; on by default). */
  occlusion?: boolean;
  /** The screen-space effects switched on (none by default). */
  effects?: Partial<LightingEffects>;
  /** How finely they are worked (the graphics preset; high by default). */
  level?: EffectLevel;
}

// ─── The surface buffers ────────────────────────────────────────────────────

type Plain = THREE.Material & { isMeshStandardMaterial?: boolean; isMeshPhysicalMaterial?: boolean; metalness?: number };

/** Whether the material being built writes the surface buffers: every solid one, and the water (surfaces.ts). */
function solid(builder: NodeBuilder) {
  const m = builder.material as THREE.Material | null;
  return !m || !m.transparent || isEffectsWater(m);
}

/**
 * A four-channel surface buffer's value from the material being built, and its alpha: 1 for what
 * writes the buffers (it replaces what lay behind), 0 for the rest (the buffer blends by the alpha,
 * so what lies behind it stays).
 */
const surfaceValue = (value: (builder: NodeBuilder) => V3) => Fn((builder: NodeBuilder) => vec4(value(builder), solid(builder) ? 1 : 0))();

/**
 * Gloss, for the reflections: how much the surface reflects (x) and how rough it is (y). The water
 * reflects; dry surfaces only when polished or wet (smooth: wet rock, obsidian, coal), never metal
 * (its studio sheen already shows) and never the matt paint everything else wears. (Two channels, so
 * no alpha to blend by: a see-through thing writes no gloss over what lies behind it.)
 */
const gloss = Fn((builder: NodeBuilder): V2 => {
  const m = builder.material as Plain | null;
  if (!m || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return vec2(0, 1);
  if (isEffectsWater(m)) return vec2(EFFECT_TUNING.waterShine * waterShine(m), roughness);
  if (!solid(builder) || (m.metalness ?? 0) > 0.5) return vec2(0, 1);
  return vec2(float(1).sub(smoothstep(0.12, 0.42, roughness)).mul(EFFECT_TUNING.glossShine), roughness);
});

/**
 * The surface buffers the switched-on effects read, beside the frame itself: facing and colour (a
 * byte a channel, blended by the surface-or-not alpha, see surfaceValue), gloss (reflections, two
 * bytes) and motion (smooth edges, two half floats: where each pixel stood a frame ago, three.js
 * keeping every object's last place; a see-through thing writes its own). All together they fit
 * the 32 bytes a pixel every WebGPU device allows.
 */
function surfaceBuffers(fx: LightingEffects) {
  const outputs: Record<string, Node> = { output };
  const blended = ['normal', 'albedo'];
  outputs.normal = surfaceValue(() => packNormalToRGB(normalView) as V3);
  if (fx.bounce) outputs.albedo = surfaceValue(() => diffuseColor.rgb as unknown as V3);
  if (fx.reflections) outputs.gloss = gloss();
  if (fx.smooth) outputs.velocity = velocity;
  const m = mrt(outputs);
  for (const name of blended) if (outputs[name]) m.setBlendMode(name, new BlendMode(THREE.NormalBlending));
  return m;
}

/**
 * The scene's depth with one sample a pixel, for effects that read four texels at once (GTAO): a
 * multisampled depth cannot be gathered. Before each frame a quad writes sample 0 of each pixel into
 * a plain depth texture (as an RTTNode renders its picture: every copy of this node refers back to it,
 * so it draws once a frame wherever it is read).
 */
class FlatDepth extends TextureNode {
  private readonly rt: RenderTarget;
  private readonly material = new NodeMaterial();
  private readonly quad = new QuadMesh(this.material);
  private state: unknown;
  private readonly drawSize = new THREE.Vector2();
  constructor(source: TextureNode) {
    const rt = new RenderTarget(1, 1, { depthBuffer: true, depthTexture: new DepthTexture(1, 1) });
    super(rt.depthTexture!);
    this.rt = rt;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.material.colorWrite = false;
    this.material.depthFunc = THREE.AlwaysDepth;
    this.material.depthNode = source.sample(uv()).r;
  }
  updateBefore(frame: NodeFrame) {
    const r = frame.renderer!;
    r.getDrawingBufferSize(this.drawSize);
    if (this.rt.width !== this.drawSize.x || this.rt.height !== this.drawSize.y) this.rt.setSize(this.drawSize.x, this.drawSize.y);
    this.state = RendererUtils.resetRendererState(r as never, this.state as never);
    r.setRenderTarget(this.rt);
    this.quad.render(r as never);
    RendererUtils.restoreRendererState(r as never, this.state as never);
    return undefined;
  }
  clone() {
    const n = new TextureNode(this.value, this.uvNode, this.levelNode);
    n.sampler = this.sampler;
    n.referenceNode = this;
    return n as unknown as this;
  }
  dispose() {
    this.rt.dispose();
    this.material.dispose();
    super.dispose();
  }
}

/** SSGI worked at a fraction of the screen's size (its node always works at full size). */
class ScaledSSGI extends SSGINode {
  scale = 1;
  setSize(width: number, height: number) {
    (SSGINode.prototype as unknown as { setSize(w: number, h: number): void }).setSize.call(this, Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }
}

/** The half-size occlusion, as the composite smooths it onto the frame. */
interface Occlusion {
  tex: TextureNode;
  /** Smoothed over a k × k patch of its texels (0: sampled as it is, already smooth). */
  kernel: number;
}

/** The nodes of the effects switched on, kept for tuning and inspection. */
export interface EffectNodes {
  ssgi?: SSGINode;
  gtao?: GTAONode;
  ssr?: SSRNode;
  traa?: TRAANode;
}

export class PostChain {
  private readonly pipeline: RenderPipeline;
  private scenePass!: PassNode;
  /** The camera's projection, as the half-size occlusion pass reads it (its own quad has another camera). */
  private readonly projInv = uniform(new THREE.Matrix4());
  private readonly projScale = uniform(new THREE.Vector2());
  private readonly nearFar = uniform(new THREE.Vector2());
  /** One full-size texel, and one texel of the half-size occlusion. */
  private readonly texel = uniform(new THREE.Vector2());
  private readonly aoTexel = uniform(new THREE.Vector2());
  /** Where the haze covers the occlusion of far things (from the fog). */
  private readonly fade = uniform(new THREE.Vector2(60, 160));
  private quality: string | null = null;
  /** The passes the current chain owns (its own render targets), freed when it is rebuilt. */
  private owned: { dispose(): void }[] = [];
  private readonly size = new THREE.Vector2();
  /** The switched-on effects' nodes (for tuning in development). */
  fx: EffectNodes = {};

  constructor(private renderer: Renderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private fog: () => THREE.Fog | null) {
    this.pipeline = new RenderPipeline(renderer);
  }

  /** Set what the chain does (a graphics preset); rebuilds it when anything changed. */
  setQuality(q: PostQuality) {
    const e = q.effects ?? {};
    const fx: LightingEffects = { bounce: !!e.bounce, contact: !!e.contact, reflections: !!e.reflections, smooth: !!e.smooth };
    const level = LEVELS[q.level ?? 'high'];
    const key = JSON.stringify({ msaa: q.msaa, shade: q.shade, bloom: q.bloom, occlusion: q.occlusion !== false, fx, level: q.level ?? 'high' });
    if (key === this.quality) return;
    this.quality = key;
    this.last = { ...q };
    this.freeOwned();
    this.fx = {};
    const own = <T extends { dispose(): void }>(n: T) => (this.owned.push(n), n);
    const buffers = fx.bounce || fx.contact || fx.reflections || fx.smooth;
    // (Smooth edges replace the multisampling: the two never run together.)
    const samples = fx.smooth ? 0 : q.msaa;
    const scenePass = (this.scenePass = own(pass(this.scene, this.camera, { samples })));
    if (buffers) scenePass.setMRT(surfaceBuffers(fx));
    setEffectsBuffers(buffers);
    const color = scenePass.getTextureNode('output'), depth = scenePass.getTextureNode('depth');
    let normal: Node | null = null, albedo: TextureNode | null = null;
    if (buffers) {
      // (Facing and colour at a byte a channel, gloss in two, motion in two half floats: plenty for
      // light, less to read, and within the bytes a pixel every device allows.)
      const tex = (name: string, type: THREE.TextureDataType, format: THREE.PixelFormat = THREE.RGBAFormat) => {
        Object.assign(scenePass.getTexture(name), { type, format });
        return scenePass.getTextureNode(name);
      };
      const n = tex('normal', THREE.UnsignedByteType);
      normal = sample((at) => unpackRGBToNormal(n.sample(at).rgb));
      if (fx.bounce) albedo = tex('albedo', THREE.UnsignedByteType);
      if (fx.reflections) tex('gloss', THREE.UnsignedByteType, THREE.RGFormat);
      if (fx.smooth) tex('velocity', THREE.HalfFloatType, THREE.RGFormat);
    }
    const cam = this.camera;
    let ao: Occlusion | null = null;
    if (q.shade && q.occlusion !== false) {
      if (fx.contact) {
        // (It reads four depths at once, which a multisampled depth cannot give: then a plain copy.)
        const aoDepth = samples > 0 ? own(new FlatDepth(depth)) : depth;
        const node = (this.fx.gtao = own(gtao(aoDepth, normal!, cam)));
        node.resolutionScale = level.ao;
        node.samples.value = level.aoSamples;
        node.radius.value = EFFECT_TUNING.aoRadius;
        node.thickness.value = EFFECT_TUNING.aoThickness;
        // (With smooth edges its grain turns frame to frame and settles; without, it is smoothed in place.)
        node.useTemporalFiltering = fx.smooth;
        const raw = node.getTextureNode();
        ao = fx.smooth ? { tex: raw, kernel: 4 } : { tex: own(rtt(denoise(raw, depth, normal!, cam), null, null, { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false, resolutionScale: level.ao })) as unknown as TextureNode, kernel: 2 };
      } else {
        ao = { tex: own(rtt(this.occlusion(depth), null, null, { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false, resolutionScale: 0.5 })) as unknown as TextureNode, kernel: 4 };
      }
    }
    let gi: TextureNode | null = null;
    if (fx.bounce) {
      const node = (this.fx.ssgi = own(new ScaledSSGI(color, depth, normal!, cam)));
      node.scale = level.gi;
      node.sliceCount.value = level.giSlices;
      node.stepCount.value = level.giSteps;
      node.radius.value = EFFECT_TUNING.giRadius;
      node.giIntensity.value = EFFECT_TUNING.giIntensity;
      node.thickness.value = EFFECT_TUNING.giThickness;
      // (Sampled over a fixed distance in the world, so the light carries as far at every zoom.)
      node.useScreenSpaceSampling.value = false;
      node.useTemporalFiltering = fx.smooth;
      const raw = node.getGINode() as unknown as TextureNode;
      gi = fx.smooth ? raw : own(rtt(denoise(raw, depth, normal!, cam), null, null, { type: THREE.HalfFloatType, depthBuffer: false, resolutionScale: level.gi })) as unknown as TextureNode;
    }
    let reflection: TextureNode | null = null;
    if (fx.reflections) {
      const g = scenePass.getTextureNode('gloss');
      const node = (this.fx.ssr = own(ssr(color, depth, normal as V3, { metalnessNode: g.r, roughnessNode: g.g, camera: cam }) as unknown as SSRNode));
      node.resolutionScale = level.ssr;
      node.quality.value = level.ssrQuality;
      node.maxDistance.value = EFFECT_TUNING.ssrDistance;
      node.thickness.value = EFFECT_TUNING.ssrThickness;
      node.intensity.value = EFFECT_TUNING.ssrIntensity;
      reflection = node.getTextureNode() as unknown as TextureNode;
    }
    let out: V4 = color as unknown as V4;
    if (q.shade || gi || reflection) out = this.composite(color, depth, ao, gi && albedo ? { gi, albedo } : null, reflection ? { ssr: reflection, gloss: scenePass.getTextureNode('gloss') } : null, q.shade);
    if (fx.smooth) {
      // (The composited frame drawn once, the history blended over it.)
      const frame = own(rtt(out, null, null, { type: THREE.HalfFloatType, depthBuffer: false }));
      const node = (this.fx.traa = own(traa(frame, depth, scenePass.getTextureNode('velocity'), cam)));
      // (Blending frames softens the picture a little: a contrast-adaptive sharpen gives the painted
      // edges and textures back their crispness, as FSR does after its own temporal pass.)
      out = own(sharpen(node, EFFECT_TUNING.sharpness)) as unknown as V4;
    }
    const shown = this.debugView(this.show, { ao, gi, reflection, normal, albedo, motion: fx.smooth ? scenePass.getTextureNode('velocity') : null });
    if (shown) out = shown;
    if (q.bloom) {
      // (The graded frame drawn once, read by the bloom and the output alike.)
      const graded = q.shade && !fx.smooth ? own(rtt(out, null, null, { type: THREE.HalfFloatType, depthBuffer: false })) : out;
      // (Picked up at half size: any smaller and thin bright lines, such as rune inlays, slip between
      // its samples and lose their glow.)
      const glow = own(bloom(graded, 0.55, 0.5, 0.95));
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

  /**
   * Development: show one effect's own buffer instead of the frame ('ao', 'gi', 'reflection',
   * 'normal', 'albedo', 'motion'), or the frame (null). Rebuilds the chain.
   */
  showBuffer(which: string | null) {
    this.show = which;
    this.quality = null;
    if (this.last) this.setQuality(this.last);
  }
  private show: string | null = null;
  private last: PostQuality | null = null;

  private debugView(which: string | null, b: { ao: Occlusion | null; gi: TextureNode | null; reflection: TextureNode | null; normal: Node | null; albedo: TextureNode | null; motion: TextureNode | null }): V4 | null {
    if (!which) return null;
    const at = uv();
    if (which === 'ao' && b.ao) return vec4(vec3(b.ao.tex.sample(at).r), 1) as unknown as V4;
    if (which === 'gi' && b.gi) return vec4(b.gi.sample(at).rgb, 1) as unknown as V4;
    if (which === 'reflection' && b.reflection) return vec4((b.reflection as unknown as V4).rgb, 1) as unknown as V4;
    if (which === 'normal' && b.normal) return vec4((b.normal as unknown as { sample(q: V2): V3 }).sample(at).mul(0.5).add(0.5), 1) as unknown as V4;
    if (which === 'albedo' && b.albedo) return vec4(b.albedo.sample(at).rgb, 1) as unknown as V4;
    if (which === 'motion' && b.motion) return vec4(b.motion.sample(at).xy.mul(40).add(0.5), 0.5, 1) as unknown as V4;
    return null;
  }

  dispose() {
    this.freeOwned();
    this.pipeline.dispose();
    setEffectsBuffers(false);
  }

  private freeOwned() {
    for (const n of this.owned) n.dispose();
    this.owned = [];
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

  /**
   * The frame with the occlusion (if any) smoothed onto it, the bounce light and the reflections
   * (if on) added, and (with `grade`) the colour graded.
   */
  private composite(color: TextureNode, depth: TextureNode, ao: Occlusion | null, bounce: { gi: TextureNode; albedo: TextureNode } | null, reflection: { ssr: TextureNode; gloss: TextureNode } | null, grade: boolean): V4 {
    const { nearFar, aoTexel, fade } = this;
    const strength = 0.75, litKeep = 0.45, sat = 1.08;
    return Fn(() => {
      const at = uv();
      const col = color.sample(at).toVar();
      const c = col.rgb.toVar();
      // Distance along the view from a depth.
      const viewZ = (q: V2): F => (perspectiveDepthToViewZ(depth.sample(q).r, nearFar.x, nearFar.y) as unknown as F).negate();
      if (ao || bounce || reflection) If(depth.sample(at).r.lessThan(1), () => {
        const z0 = viewZ(at).toVar();
        // (The haze covers what the effects do to far things.)
        const near = float(1).sub(smoothstep(fade.x, fade.y, z0)).toVar();
        if (ao) {
          let occ: F;
          if (ao.kernel > 0) {
            // Smooth the half-size occlusion over a k × k patch, only from samples at this surface's depth.
            const sum = float(0).toVar(), wsum = float(0).toVar();
            const h = (ao.kernel - 1) / 2;
            for (let j = 0; j < ao.kernel; j++) for (let i = 0; i < ao.kernel; i++) {
              const q = at.add(vec2(i - h, j - h).mul(aoTexel)).toVar();
              const w = exp(abs(viewZ(q).sub(z0)).negate().div(z0.mul(0.02).add(0.02))).toVar();
              sum.addAssign(ao.tex.sample(q).r.mul(w));
              wsum.addAssign(w);
            }
            occ = select(wsum.greaterThan(1e-4), sum.div(wsum), float(1));
          } else occ = ao.tex.sample(at).r;
          const lum = dot(c, LUMA);
          // Sunlit surfaces keep more of their light; the haze covers the occlusion of far things.
          const k = mix(1, litKeep, smoothstep(0.3, 1.3, lum)).mul(strength).mul(near);
          c.mulAssign(mix(1, occ, k));
        }
        // The light bounced onto the surface, in its own colour.
        if (bounce) c.addAssign(bounce.albedo.sample(at).rgb.mul(bounce.gi.sample(at).rgb).mul(near));
        // What a glossy surface reflects takes the place of part of its own colour (on the water, of the
        // painted sky it reflects): its colour gives way where something stands in the reflection, and
        // the reflection (already weighted by the gloss and the angle) shows over it.
        if (reflection) {
          const r = (reflection.ssr as unknown as V4).toVar();
          const cover = clamp(r.a.mul(2), 0, 1).mul(reflection.gloss.sample(at).r).mul(EFFECT_TUNING.ssrCover).mul(near);
          c.assign(c.mul(float(1).sub(cover)).add(r.rgb.mul(near)));
        }
      });
      if (!grade) return vec4(max(c, 0), col.a);
      const l = dot(c, LUMA);
      return vec4(max(mix(vec3(l), c, sat), 0), col.a);
    })() as unknown as V4;
  }
}
