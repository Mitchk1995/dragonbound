import * as THREE from 'three';
import { abs, atan, attribute, cameraPosition, cameraProjectionMatrix, cos, Discard, float, Fn, If, length, mat3, max, mix, modelViewMatrix, modelWorldMatrix, normalize, positionGeometry, positionWorld, select, sin, smoothstep, step, transpose, uv, varying, vec2, vec3, vec4, viewportSize } from 'three/tsl';
import { own, type F, type V3, type V4 } from '../render/patch';
import { GlimpseStyle } from './portalGlimpse';
import { look, scene, tnoise } from './portalScene';

// ─── Shaders ────────────────────────────────────────────────────────────────

/** The oval's size (world units) and how far the quad extends past it for the outer halo. */
export const PORTAL_W = 2.2, PORTAL_H = 3.0, HALO = 1.14;

/** The window's colour and alpha, for a glimpse style, open or sealed. */
function windowColor(style: GlimpseStyle, open: boolean) {
  return Fn(() => {
    const t = look.t(), color = look.c('color');
    // Oval coordinates: e = 1 on the rim.
    const q = uv().sub(0.5).mul(2 * HALO).toVar();
    const e = length(q).toVar();
    const ang = atan(q.y, q.x.add(1e-5)).toVar();
    const rimN = tnoise(vec2(ang.mul(0.477).add(t.mul(0.07)), e.mul(0.6).sub(t.mul(0.25)))).toVar();
    const edge = e.add(rimN.sub(0.5).mul(0.06)).toVar();
    If(edge.greaterThan(HALO), () => {
      Discard();
    });
    if (!open) {
      // Sealed: a dark, slowly turning membrane with a cold, dim rim.
      const smoke = tnoise(vec2(ang.mul(0.318).add(t.mul(0.01)), e.mul(0.8).sub(t.mul(0.02))));
      const ring = smoothstep(0.86, 0.97, edge).mul(float(1).sub(smoothstep(0.98, 1.03, edge)));
      const col = vec3(0.008, 0.008, 0.011).add(vec3(0.022, 0.024, 0.03).mul(smoke).mul(float(1).sub(smoothstep(0.2, 1, e)))).add(vec3(0.1, 0.1, 0.12).mul(ring).mul(rimN.add(0.5)));
      return vec4(col, select(edge.lessThan(1), float(0.92), float(0)));
    }
    const rimN2 = tnoise(vec2(ang.mul(0.318).sub(t.mul(0.05)), e.mul(1.3).add(t.mul(0.11))).add(0.37));
    // Through the window: the view ray, flattened toward the horizon and widened (a virtual eye
    // close behind the surface), swirled near the rim.
    const d0 = normalize(varying(transpose(mat3(modelWorldMatrix)).mul(positionWorld.sub(cameraPosition))) as V3);
    const d = vec3(d0.x, d0.y, abs(d0.z).negate());
    const dc = normalize(vec3(d.x, d.y.mul(0.22).add(0.06), d.z));
    const swirl = smoothstep(0.55, 1, e).mul(0.5).mul(sin(t.mul(0.8).add(e.mul(6)))).toVar();
    const s0 = q.mul(vec2(PORTAL_W / 2, PORTAL_H / 2)).toVar();
    const s = vec2(cos(swirl).mul(s0.x).sub(sin(swirl).mul(s0.y)), sin(swirl).mul(s0.x).add(cos(swirl).mul(s0.y)))
      .add(vec2(tnoise(q.mul(0.4).add(t.mul(0.05))), tnoise(q.mul(0.4).sub(t.mul(0.04)))).sub(0.5).mul(0.12)).toVar();
    let col: V3 = scene(style, vec3(s, 0), normalize(vec3(s, 0).add(dc.mul(2.4))));
    // The zone colour washes in toward the rim; a bright ring of flowing energy on it.
    col = mix(col, color.mul(0.8), smoothstep(0.72, 0.99, e).mul(0.35));
    const ring = smoothstep(0.8, 0.96, edge).mul(float(1).sub(smoothstep(0.98, 1.04, edge))).toVar();
    const streak = smoothstep(0.45, 0.8, rimN.mul(0.6).add(rimN2.mul(0.5))).toVar();
    col = col.add(color.mul(ring).mul(streak.mul(1.8).add(0.8))).add(vec3(1).mul(ring).mul(streak).mul(0.3));
    const halo = float(1).sub(smoothstep(1, HALO, edge)).mul(step(1, edge)).toVar();
    col = col.add(color.mul(halo).mul(0.9));
    return vec4(col, select(edge.lessThan(1), float(1), halo.mul(0.6)));
  })();
}

/** One shared program per glimpse style, open and sealed. */
const windows = new Map<string, ReturnType<typeof windowColor>>();
export const windowNode = (style: GlimpseStyle, open: boolean) => {
  const key = `${style}:${open}`;
  let n = windows.get(key);
  if (!n) windows.set(key, (n = windowColor(style, open)));
  return n;
};

/** The floor glow under an open portal. */
export const POOL = Fn(() => {
  const p = abs(uv().sub(0.5)).mul(2);
  const d = max(p.x, p.y).mul(0.55).add(length(uv().sub(0.5)).mul(0.9));
  const glow = smoothstep(1, 0.1, d).mul(sin(look.t().mul(2.1)).mul(0.2).add(0.8));
  return vec4(look.c('color').mul(glow).mul(0.3), 1);
})();

/**
 * Motes rising through an open portal: soft dots on camera-facing quads, from fixed seeds (aMote:
 * where each starts and its seed), animated here.
 */
export const mote = (() => {
  const m = attribute('aMote', 'vec4') as V4;
  const t = look.t(), seed = m.w;
  const life = seed.mul(7.31).add(t.mul(seed.mul(0.12).add(0.16))).fract().toVar();
  const a = t.mul(seed.add(0.6)).add(seed.mul(40)).toVar();
  const p = vec3(m.x.add(sin(a).mul(0.12)), m.y.add(life.mul(own.f('portal.height'))), m.z.add(cos(a).mul(0.12)));
  const fade = smoothstep(0, 0.15, life).mul(float(1).sub(smoothstep(0.65, 1, life)));
  const mv = modelViewMatrix.mul(vec4(p, 1)).toVar();
  // (Sized in pixels as a point sprite was: larger near the camera.)
  const px = seed.mul(0.8).add(0.9).mul(120).div(mv.z.negate());
  const clip = cameraProjectionMatrix.mul(mv).toVar();
  const vertex = vec4(clip.xy.add(positionGeometry.xy.mul(px).mul(2).div(viewportSize).mul(clip.w)), clip.zw);
  const dd = length(uv().sub(0.5)).mul(2);
  const color = vec4(mix(look.c('color'), vec3(1), 0.5).mul(smoothstep(1, 0, dd)).mul(varying(fade) as F).mul(1.4), 1);
  return { vertex, color };
})();

export const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false } as const;
