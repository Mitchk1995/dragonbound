import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { noiseTexture } from '../render/textures';
import { FONT_SETS } from '../ui/fontGlyphs';
import { drawText, layoutText, loadAtlas } from '../ui/paintedText';

/**
 * The portal a platform projects: an upright oval window that shows a glimpse of the place it
 * leads to, ringed by swirling energy in the zone colour, with motes rising through it and a
 * floating title above naming the destination.
 *
 * The glimpse is not a second render of the world. A small fragment shader paints the destination
 * as a layered landscape (sky, far/mid/near silhouettes, ground or water, fog) from a per-zone
 * palette and style, and traces the real view ray through those layers, so what you see through
 * the portal shifts with parallax as you walk past it, like a real window. It costs a handful of
 * ALU per portal pixel; on the CPU each portal only turns to face the camera.
 */

// ─── Destination glimpses ───────────────────────────────────────────────────

/** How the far side is painted. */
export enum GlimpseStyle {
  /** Floating island under a violet night sky with stars (the keep). */
  Void = 0,
  /** A lantern-lit tunnel with a mine-cart track running off into the glow (the mine). */
  Cave = 1,
  /** Pine ridges and mountains against a sunset sky (the Foothills). */
  Forest = 2,
  /** Broken columns standing in still, reflecting water under a teal sky (the ruin). */
  Water = 3,
  /** Jagged spires over a lava field under a burning sky (the lair). */
  Lava = 4,
}

export interface Glimpse {
  style: GlimpseStyle;
  skyTop: number;
  /** Sky at the horizon (the brightest part of the sky). */
  skyLow: number;
  /** Distance haze: far silhouettes fade to this. */
  fog: number;
  ground: number;
  /** Nearest silhouettes (farther ones blend toward fog). */
  sil: number;
  /** Accents: sun/lantern glow, lit windows, lava, rim light on the silhouettes. */
  glow: number;
}

/** Hand-picked glimpses for the zones that exist; anything else is derived from its theme. */
export const GLIMPSES: Record<string, Glimpse> = {
  keep: { style: GlimpseStyle.Void, skyTop: 0x140c34, skyLow: 0x6a3a7a, fog: 0x40285a, ground: 0x3e6a34, sil: 0x241c34, glow: 0xffc070 },
  mine: { style: GlimpseStyle.Cave, skyTop: 0x2a1c12, skyLow: 0xffb468, fog: 0xc08048, ground: 0xa87e52, sil: 0x3a281c, glow: 0xffb050 },
  foothills: { style: GlimpseStyle.Forest, skyTop: 0x3e4e80, skyLow: 0xf2a878, fog: 0x9a7478, ground: 0x4a6a34, sil: 0x1e2e24, glow: 0xffd8a0 },
  ruin: { style: GlimpseStyle.Water, skyTop: 0x1a2c3c, skyLow: 0x8ac0c0, fog: 0x46686e, ground: 0x184850, sil: 0x1c2a34, glow: 0xe0f4ff },
  lair: { style: GlimpseStyle.Lava, skyTop: 0x1a0604, skyLow: 0xc84a1c, fog: 0x5e1c10, ground: 0x1e1010, sil: 0x140808, glow: 0xff6a20 },
};

/** A glimpse for a destination: hand-picked when known, else read off the zone's theme. */
export function glimpseFor(dest: string, theme?: ZoneTheme): Glimpse {
  const known = GLIMPSES[dest];
  if (known || !theme) return known ?? GLIMPSES.keep;
  const style = theme.lava ? GlimpseStyle.Lava : theme.wallRise ? GlimpseStyle.Cave : theme.ambient === 'void' ? GlimpseStyle.Void : theme.water && theme.wall === 'ruin' ? GlimpseStyle.Water : GlimpseStyle.Forest;
  const ground = Object.values(theme.ground)[0]?.[0] ?? 0x5a6a3c;
  const c = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
  return { style, skyTop: c(theme.bg, 1), skyLow: theme.hemi[0], fog: new THREE.Color(theme.bg).lerp(new THREE.Color(theme.hemi[0]), 0.4).getHex(), ground, sil: c(theme.cliff?.[1] ?? 0x3a3430, 0.5), glow: theme.sun[0] };
}

// ─── Title layout (pure, tested) ────────────────────────────────────────────

/**
 * Break a destination name into one or two title lines: one line if it fits `maxChars`, else the
 * split at a word boundary that makes the longer line shortest ("Wyrmwood Foothills" → two lines).
 */
export function titleLines(name: string, maxChars = 11): string[] {
  const up = name.toUpperCase().trim();
  const words = up.split(/\s+/);
  if (up.length <= maxChars || words.length < 2) return [up];
  let best = [up], bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const len = Math.max(a.length, b.length);
    if (len < bestLen) {
      best = [a, b];
      bestLen = len;
    }
  }
  return best;
}

// ─── Shaders ────────────────────────────────────────────────────────────────

/** The oval's size (world units) and how far the quad extends past it for the outer halo. */
const PORTAL_W = 2.2, PORTAL_H = 3.0, HALO = 1.14;
/**
 * Resting lean (before the first render): the window tips back toward the high gameplay camera.
 * Every render then turns it to face the camera exactly (see `portalFacing`), so the oval keeps its
 * proportions wherever the portal sits on screen: a fixed lean read as a circle near the bottom
 * edge, where the view ray is steeper.
 */
const LEAN = 0.4;
/** How far the title floats above the oval's top, along the window's own up axis. */
const TITLE_GAP = 0.6;

/**
 * Yaw (about world Y, 0 = facing +Z) and lean (tilt back from upright) that turn a window standing
 * at `foot` to face a camera at `cam`, aimed at the window's middle. The lean follows the view
 * ray's elevation, so the oval is always seen face-on (never foreshortened into a circle).
 */
export function portalFacing(foot: { x: number; y: number; z: number }, cam: { x: number; y: number; z: number }) {
  const dx = cam.x - foot.x, dy = cam.y - (foot.y + PORTAL_H / 2), dz = cam.z - foot.z;
  const flat = Math.hypot(dx, dz);
  return { yaw: flat > 1e-4 ? Math.atan2(dx, dz) : 0, lean: Math.max(0, Math.min(1.5, Math.atan2(dy, Math.max(flat, 1e-4)))) };
}

const WINDOW_VERT = `
  varying vec2 vUv;
  varying vec3 vDir;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // The view ray in the portal's own frame (no scale on portals).
    vDir = transpose(mat3(modelMatrix)) * (wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

/**
 * The window. The destination style (STYLE, 0–4) and open/sealed (OPEN) are compile-time defines,
 * so each program holds only its own scene: one program branching over every style unrolls into a
 * shader the D3D compiler (ANGLE on Windows) chokes on, and the GL context is lost.
 */
const WINDOW_FRAG = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uSkyTop, uSkyLow, uFog, uGround, uSil, uGlow;
  uniform sampler2D uNoise;
  varying vec2 vUv;
  varying vec3 vDir;

  const float GROUND = -1.5;
  float hash(float x) { return fract(sin(x * 127.1 + 11.7) * 43758.5453); }
  float vnoise(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
  // Explicit LOD: some samples sit in branches (implicit derivatives there fail on D3D).
  float tnoise(vec2 p) { return textureLod(uNoise, p, 0.0).r; }

#if OPEN
  // Silhouette height above the ground at x for one layer (k: 0 near, 1 mid, 2 far).
  float silhouette(float x, float k) {
    float s = k * 17.3 + 3.0;
  #if STYLE == 0
    // Void: the keep's island with towers and spires on the mid layer; drifting islets beyond.
    if (k < 0.5) return -1.0;
    if (k < 1.5) {
      if (abs(x - 0.6) > 3.0) return -1.0;
      float c = floor(x / 0.55), f = fract(x / 0.55);
      float tower = step(0.22, f) * step(f, 0.78) * step(abs(x - 0.6), 2.4) * (1.0 + hash(c + s) * 1.8);
      float spire = max(0.0, 1.0 - abs(f - 0.5) * 3.6) * 0.8 * step(0.35, hash(c + 9.0));
      return 1.0 + max(0.2, tower + spire * step(0.01, tower));
    }
    float c2 = floor(x / 3.0);
    return hash(c2 + s) > 0.55 ? 2.2 + hash(c2 + 4.0) * 1.2 - abs(fract(x / 3.0) - 0.5) * 3.2 : -1.0;
  #elif STYLE == 1
    // Cave: rubble banks and pillars, walls closing in at the sides.
    float h = 0.3 + vnoise(x * 1.4 + s) * 0.9 + step(0.84, vnoise(x * 0.8 + s * 2.0)) * 2.8;
    return max(h * step(1.1, abs(x)), (abs(x) - (2.0 + k * 1.1)) * 2.4);
  #elif STYLE == 2
    // Forest: pines near, a pine ridge mid, mountains far.
    if (k > 1.5) return 1.8 + vnoise(x * 0.35 + s) * 2.6 + vnoise(x * 1.1 + s) * 0.6;
    float w = k < 0.5 ? 0.9 : 0.6;
    float c = floor(x / w), f = fract(x / w);
    float h = (k < 0.5 ? 1.6 : 0.9) + hash(c + s) * (k < 0.5 ? 1.4 : 0.8);
    float tri = 1.0 - abs(f - 0.5) * 2.0;
    float tiers = tri - mod(tri, 0.34) * 0.45;
    return (k < 0.5 ? 0.0 : 0.6) + h * tiers + vnoise(x * 0.5 + s) * 0.5;
  #elif STYLE == 3
    // Water: broken columns near, a ruined colonnade mid, low hills far.
    if (k > 1.5) return 0.4 + vnoise(x * 0.4 + s) * 0.9;
    float w = k < 0.5 ? 1.7 : 1.0;
    float c = floor(x / w), f = fract(x / w);
    float h = (k < 0.5 ? 1.8 : 1.3) + hash(c + s) * 1.6;
    float gone = step(hash(c + s + 1.0), 0.3);
    float wall = step(0.5, k) * step(0.8, hash(c + s + 7.0));
    float col = step(0.38, f) * step(f, 0.62);
    float broken = hash(c + s + 5.0) > 0.45 ? 1.0 - (f - 0.38) * 1.6 * hash(c + 2.0) : 1.0;
    float hh = wall > 0.5 ? h * 0.55 + vnoise(x * 3.0) * 0.3 : (col > 0.5 ? h * broken : -1.0);
    return gone > 0.5 ? -1.0 : hh;
  #else
    // Lava: jagged spires.
    float w = k < 0.5 ? 1.3 : 0.8;
    float c = floor(x / w), f = fract(x / w);
    float spike = pow(max(0.0, 1.0 - abs(f - 0.5) * 2.0), 1.6) * (1.2 + hash(c + s) * 2.6);
    return spike + vnoise(x * 0.9 + s) * (k > 1.5 ? 1.6 : 0.5);
  #endif
  }

  vec3 sky(vec3 r) {
    float h = clamp(r.y * 2.2 + 0.1, 0.0, 1.0);
    vec3 c = mix(uSkyLow, uSkyTop, pow(h, 0.7));
    // Below the horizon (only seen past the edge of the keep's island): the abyss.
    c = mix(c, uSkyTop * 0.35, smoothstep(-0.02, -0.3, r.y));
    // Sun / moon / tunnel glow just above the horizon.
    float g = exp(-length(vec2(r.x * 1.3 - 0.18, r.y - 0.05)) * 6.0);
  #if STYLE == 1
    c += uGlow * g * 1.5;
  #else
    c += uGlow * g * 0.45;
  #endif
  #if STYLE == 0 || STYLE == 3 || STYLE == 4
    vec2 q = r.xy / max(0.2, -r.z) * 26.0;
    #if STYLE == 4
      q.y -= uTime * 1.5;
    #endif
    vec2 cell = floor(q);
    float st = hash(cell.x * 7.1 + cell.y * 13.7);
    float dd = length(fract(q) - 0.5);
    #if STYLE == 0
      c += vec3(1.0, 0.95, 1.1) * step(0.93, st) * smoothstep(0.2, 0.0, dd) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 40.0)) * h * 1.4;
    #elif STYLE == 4
      c += vec3(1.6, 0.5, 0.1) * step(0.95, st) * smoothstep(0.18, 0.0, dd);
    #else
      c += vec3(0.9) * step(0.97, st) * smoothstep(0.15, 0.0, dd) * h * 0.6;
    #endif
  #endif
    return c;
  }

  // One silhouette layer (the plane z = -D, haze 0..1): true, with its colour, if the ray from o
  // meets the layer's rock before parameter tLimit.
  bool layer(vec3 o, vec3 r, float tLimit, float k, float D, float haze, inout vec3 c) {
    float t = (D + o.z) / -r.z;
    if (t <= 0.0 || t > tLimit) return false;
    vec3 p = o + r * t;
    float top = GROUND + silhouette(p.x, k);
    if (p.y >= top) return false;
    c = mix(uSil, uFog, haze);
    // Lit rim along the top edge, soft body shading downward.
    c += uGlow * smoothstep(0.09, 0.0, top - p.y) * (0.4 - haze * 0.3);
    c *= 0.8 + 0.2 * smoothstep(GROUND, top, p.y);
  #if STYLE == 0
    if (k > 0.5 && k < 1.5) {
      // Lit windows in the keep's towers.
      vec2 wq = vec2(p.x * 7.0, p.y * 5.0);
      float win = step(0.78, hash(floor(wq.x) * 3.1 + floor(wq.y) * 7.7)) * step(0.35, fract(wq.x)) * step(0.3, fract(wq.y)) * step(GROUND + 1.2, p.y);
      c += uGlow * win * 1.3;
    }
  #elif STYLE == 1
    // Lantern light pooled low on the walls, and a lantern hung on each wall of each layer.
    c += uGlow * 0.22 * (1.0 - smoothstep(GROUND, GROUND + 1.6, p.y)) * (1.0 - haze);
    vec2 lp = vec2(abs(p.x) - (1.75 + k * 1.1), p.y - (GROUND + 1.5));
    c += uGlow * (exp(-dot(lp, lp) * 30.0) * 2.5 + exp(-length(lp) * 3.5) * 0.35) * (1.0 - haze * 0.6);
  #endif
    return true;
  }

  #if STYLE == 1
    #define DEPTH 0.8
  #else
    #define DEPTH 1.0
  #endif

  vec3 scene(vec3 o, vec3 r) {
    float tg = r.y < -0.001 ? (GROUND - o.y) / r.y : 1e5;
    float gz = -r.z * tg;
    float tl = tg;
  #if STYLE == 1
    // Cave ceiling: a low rock roof with hanging teeth, receding into the dark.
    float tc = r.y > 0.001 ? (1.3 + vnoise(o.x * 2.0 + r.x * 9.0) * 0.3 - o.y) / r.y : 1e5;
    tl = min(tg, tc);
  #endif
    vec3 c = vec3(0.0);
    if (layer(o, r, tl, 0.0, 4.5 * DEPTH, 0.12, c)) return c;
    if (layer(o, r, tl, 1.0, 9.0 * DEPTH, 0.42, c)) return c;
    if (layer(o, r, tl, 2.0, 18.0 * DEPTH, 0.7, c)) return c;
  #if STYLE == 1
    if (tc < 1e4) {
      vec3 pc = o + r * tc;
      float teeth = vnoise(pc.x * 2.6) * 0.6 + vnoise(-pc.z * 1.1) * 0.4;
      return mix(uSil * (0.7 + teeth * 0.5), uFog * 0.6, smoothstep(2.0, 16.0, -pc.z));
    }
  #endif
  #if STYLE == 0
    if (abs(o.x + r.x * tg - 0.6) > 3.0 || gz > 11.0) tg = 1e5;
  #endif
    if (tg > 1e4) return sky(r);
    vec3 p = o + r * tg;
    float haze = smoothstep(1.0, 22.0, gz);
  #if STYLE == 3
    // Still water: near and mid layers mirrored and rippled over deep teal, glints on the ripples.
    vec2 rip = vec2(tnoise(p.xz * vec2(0.3, 0.9) + vec2(uTime * 0.02, 0.0)), tnoise(p.xz * vec2(0.5, 1.2) - vec2(0.0, uTime * 0.03))) - 0.5;
    vec3 rr = normalize(vec3(r.x + rip.x * 0.06, -r.y, r.z + rip.y * 0.06));
    vec3 refl = sky(rr);
    if (!layer(p, rr, 1e5, 0.0, 4.5, 0.12, refl)) layer(p, rr, 1e5, 1.0, 9.0, 0.42, refl);
    float fres = 0.3 + 0.6 * pow(1.0 - abs(r.y), 5.0);
    c = mix(uGround, refl * 0.9, fres);
    c += uGlow * pow(max(0.0, tnoise(p.xz * vec2(1.4, 3.0) + uTime * 0.04) - 0.7), 2.0) * 4.0 * (1.0 - haze);
  #elif STYLE == 4
    float n = tnoise(p.xz * 0.3 + vec2(0.0, uTime * 0.01));
    float crack = smoothstep(0.045, 0.0, abs(n - 0.5)) * (1.0 - haze * 0.5);
    c = mix(uGround, vec3(2.4, 0.6, 0.1), crack);
  #else
    c = uGround * (0.75 + tnoise(p.xz * 0.25) * 0.5);
  #if STYLE == 1
    // A mine-cart track running off into the dark: sleepers and two steel rails.
    float rz = fract(p.z * 1.6);
    float sleeper = step(abs(p.x - 0.1), 0.62) * step(rz, 0.35);
    c = mix(c, vec3(0.16, 0.09, 0.05), sleeper);
    float rail = step(abs(abs(p.x - 0.1) - 0.42), 0.05);
    c = mix(c, vec3(0.5, 0.48, 0.46) + uGlow * 0.15, rail);
  #endif
  #endif
    return mix(c, uFog, haze * 0.85);
  }
#endif

  void main() {
    // Oval coordinates: e = 1 on the rim.
    vec2 q = (vUv - 0.5) * 2.0 * ${HALO.toFixed(3)};
    float e = length(q);
    float ang = atan(q.y, q.x + 1e-5);
    float rimN = tnoise(vec2(ang * 0.477 + uTime * 0.07, e * 0.6 - uTime * 0.25));
    float edge = e + (rimN - 0.5) * 0.06;
    if (edge > ${HALO.toFixed(3)}) discard;
    vec3 col;
    float alpha;
  #if OPEN
    float rimN2 = tnoise(vec2(ang * 0.318 - uTime * 0.05, e * 1.3 + uTime * 0.11) + 0.37);
    // Through the window: the view ray, flattened toward the horizon and widened (a virtual
    // eye close behind the surface), swirled near the rim.
    vec3 d = normalize(vDir);
    d.z = -abs(d.z);
    vec3 dc = normalize(vec3(d.x, d.y * 0.22 + 0.06, d.z));
    float swirl = smoothstep(0.55, 1.0, e) * 0.5 * sin(uTime * 0.8 + e * 6.0);
    vec2 s = q * vec2(${(PORTAL_W / 2).toFixed(3)}, ${(PORTAL_H / 2).toFixed(3)});
    s = mat2(cos(swirl), sin(swirl), -sin(swirl), cos(swirl)) * s;
    s += (vec2(tnoise(q * 0.4 + uTime * 0.05), tnoise(q * 0.4 - uTime * 0.04)) - 0.5) * 0.12;
    col = scene(vec3(s, 0.0), normalize(vec3(s, 0.0) + dc * 2.4));
    // The zone colour washes in toward the rim; a bright ring of flowing energy on it.
    col = mix(col, uColor * 0.8, smoothstep(0.72, 0.99, e) * 0.35);
    float ring = smoothstep(0.8, 0.96, edge) * (1.0 - smoothstep(0.98, 1.04, edge));
    float streak = smoothstep(0.45, 0.8, rimN * 0.6 + rimN2 * 0.5);
    col += uColor * ring * (0.8 + streak * 1.8) + vec3(1.0) * ring * streak * 0.3;
    float halo = (1.0 - smoothstep(1.0, ${HALO.toFixed(3)}, edge)) * step(1.0, edge);
    col += uColor * halo * 0.9;
    alpha = edge < 1.0 ? 1.0 : halo * 0.6;
  #else
    // Sealed: a dark, slowly turning membrane with a cold, dim rim.
    float smoke = tnoise(vec2(ang * 0.318 + uTime * 0.01, e * 0.8 - uTime * 0.02));
    col = vec3(0.008, 0.008, 0.011) + vec3(0.022, 0.024, 0.03) * smoke * (1.0 - smoothstep(0.2, 1.0, e));
    float ring = smoothstep(0.86, 0.97, edge) * (1.0 - smoothstep(0.98, 1.03, edge));
    col += vec3(0.1, 0.1, 0.12) * ring * (0.5 + rimN);
    alpha = edge < 1.0 ? 0.92 : 0.0;
  #endif
    gl_FragColor = vec4(col, alpha);
  }`;

const POOL_FRAG = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = abs(vUv - 0.5) * 2.0;
    float d = max(p.x, p.y) * 0.55 + length(vUv - 0.5) * 0.9;
    float glow = smoothstep(1.0, 0.1, d) * (0.8 + 0.2 * sin(uTime * 2.1));
    gl_FragColor = vec4(uColor * glow * 0.3, 1.0);
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
    gl_PointSize = (0.9 + aSeed * 0.8) * 120.0 / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const MOTE_FRAG = `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * a * vFade * 1.4, 1.0);
  }`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpFoot = new THREE.Vector3(), tmpCam = new THREE.Vector3();

// ─── Title ──────────────────────────────────────────────────────────────────

/** A CSS colour for a canvas from a (linear) three.js colour, scaled by `k` in sRGB. */
const css = (c: THREE.Color, k = 1, a = 1) => {
  const s = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const v = (x: number) => Math.round(Math.max(0, Math.min(1, x * k)) * 255);
  return `rgba(${v(s.r)},${v(s.g)},${v(s.b)},${a})`;
};

/**
 * Paint a title into a canvas: the zone's name in the glowing blue alphabet (case as written upper, the way the
 * plates always were), then a small rule with a gem beneath. Locked: the same letters drained to grey stone, no gem,
 * a padlock and the hint under them. `atlas` is the blue alphabet's image; until it arrives only the rule is drawn
 * (the caller repaints when it loads).
 */
function paintTitle(ctx: CanvasRenderingContext2D, name: string, color: number, open: boolean, hint: string, atlas: ImageBitmap | null) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const zc = new THREE.Color(color);
  const lines = titleLines(name);
  const two = lines.length > 1;
  const lay = (cap: number) => {
    ctx.font = `800 ${Math.round(cap / 0.72)}px Cinzel, 'Palatino Linotype', Georgia, serif`;
    return lines.map((l) => layoutText(l, 'blue', cap, { track: 0.04, measure: (c) => ctx.measureText(c).width }));
  };
  let cap = two ? 74 : 84;
  const widest = Math.max(...lay(cap).map((l) => l.width));
  if (widest > W * 0.9) cap = Math.floor((cap * W * 0.9) / widest);
  const laid = lay(cap);
  const size = cap / 0.72;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const gap = size * 1.02;
  const blockH = gap * (lines.length - 1) + size * 0.72;
  const top = (H - 64 - blockH) / 2 + size * 0.72;
  const depth = Math.round(size * 0.11);
  if (atlas) {
    ctx.save();
    if (!open) ctx.filter = 'grayscale(1) brightness(0.75)';
    ctx.fillStyle = open ? '#a8dcff' : '#b0aca6';
    laid.forEach((l, i) => drawText(ctx, atlas, 'blue', l, (W - l.width) / 2, top + i * gap));
    ctx.restore();
  }
  // Rule with a gem (open) or a padlock and the hint (locked).
  const ry = top + (lines.length - 1) * gap + depth + 34;
  const cx = W / 2;
  ctx.lineWidth = 3;
  const rw = Math.min(W * 0.34, 260);
  const rule = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0);
  rule.addColorStop(0, 'rgba(0,0,0,0)');
  rule.addColorStop(0.5, open ? css(new THREE.Color(0xe8c890)) : 'rgb(110,106,102)');
  rule.addColorStop(1, 'rgba(0,0,0,0)');
  if (open) {
    ctx.strokeStyle = rule;
    ctx.beginPath();
    ctx.moveTo(cx - rw, ry);
    ctx.lineTo(cx + rw, ry);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, ry);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = css(zc);
    ctx.shadowBlur = 14;
    ctx.fillStyle = css(zc.clone().lerp(new THREE.Color(1, 1, 1), 0.25));
    ctx.strokeStyle = 'rgba(20,14,10,0.95)';
    ctx.lineWidth = 3;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
  } else {
    ctx.font = `600 46px Cinzel, 'Palatino Linotype', Georgia, serif`;
    (ctx as any).letterSpacing = '4px';
    const label = hint.toUpperCase();
    const tw = ctx.measureText(label).width;
    const lx = cx - (tw + 52) / 2, ly = ry + 6;
    // Padlock: shackle and body, outlined dark like the letters.
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(12,10,10,0.9)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(lx + 16, ly - 8, 10, Math.PI, 0);
    ctx.stroke();
    ctx.strokeRect(lx, ly - 8, 32, 26);
    ctx.strokeStyle = 'rgb(168,164,158)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(lx + 16, ly - 8, 10, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgb(168,164,158)';
    ctx.fillRect(lx, ly - 8, 32, 26);
    ctx.fillStyle = 'rgb(40,38,40)';
    ctx.fillRect(lx + 14, ly, 5, 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(12,10,10,0.9)';
    ctx.strokeText(label, lx + 52, ly + 5);
    ctx.fillStyle = 'rgb(176,172,166)';
    ctx.fillText(label, lx + 52, ly + 5);
  }
}

/** A camera-facing title sprite (null outside a browser, e.g. in tests). */
function buildTitle(name: string, color: number, open: boolean, hint: string): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let atlas: ImageBitmap | null = null;
  const draw = () => {
    paintTitle(ctx, name, color, open, hint, atlas);
    tex.needsUpdate = true;
  };
  draw();
  // Repaint once the alphabet has loaded, and once the display font has (the first paint may use the fallback serif).
  void loadAtlas(FONT_SETS.blue).then((a) => {
    atlas = a;
    draw();
  });
  const fonts = (document as any).fonts as FontFaceSet | undefined;
  if (fonts && !fonts.check("800 64px Cinzel")) void fonts.load("800 64px Cinzel").then(draw, () => {});
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  // Lit titles glow just past the bloom threshold; sealed ones stay matte.
  mat.color.setScalar(open ? 1.12 : 0.9);
  const s = new THREE.Sprite(mat);
  s.name = 'portal-title';
  s.scale.set(3.8, (3.8 * 384) / 1024, 1);
  s.renderOrder = 6;
  return s;
}

// ─── Assembly ───────────────────────────────────────────────────────────────

export interface PortalFx {
  obj: THREE.Group;
  tick(t: number): void;
}

export interface PortalSpec {
  /** Destination zone id (drives the glimpse). */
  dest?: string;
  /** Zone colour when open; null = sealed/dormant. */
  color: number | null;
  /** Title text (the destination's name); no title when absent. */
  name?: string;
  /** Destination theme, for glimpses of zones without a hand-picked one. */
  theme?: ZoneTheme;
  /** Shown under a sealed portal's title ("Sealed", "Chapter 2"…). */
  hint?: string;
}

/**
 * A portal standing on a platform whose top is at `baseY`: the window, its motes and floor glow
 * when open (group 'portal-fx'), a dark membrane when sealed (group 'portal-sealed'), and the
 * floating title when the spec has a name. Null when there is nothing to show (a sealed portal
 * with no destination).
 */
export function makePortal(spec: PortalSpec, baseY: number): PortalFx | null {
  const open = spec.color !== null;
  if (!open && !spec.dest && !spec.name) return null;
  const obj = new THREE.Group();
  obj.name = open ? 'portal-fx' : 'portal-sealed';
  const c = new THREE.Color(spec.color ?? 0x888890);
  const time = { value: 0 };
  const noise = noiseTexture();
  const gl = glimpseFor(spec.dest ?? 'keep', spec.theme);
  const col = (hex: number) => ({ value: new THREE.Color(hex) });
  // The window and title turn together to face the camera (see tick); the window pivots on its
  // foot to lean back.
  const facing = new THREE.Group();
  obj.add(facing);
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(PORTAL_W * HALO, PORTAL_H * HALO).translate(0, PORTAL_H / 2, 0),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      defines: { STYLE: gl.style, OPEN: open ? 1 : 0 },
      uniforms: {
        uTime: time, uColor: { value: c },
        uSkyTop: col(gl.skyTop), uSkyLow: col(gl.skyLow), uFog: col(gl.fog), uGround: col(gl.ground), uSil: col(gl.sil), uGlow: col(gl.glow),
        uNoise: { value: noise },
      },
      vertexShader: WINDOW_VERT, fragmentShader: WINDOW_FRAG,
    }),
  );
  win.position.y = baseY + 0.3;
  win.rotation.x = -LEAN;
  win.name = 'portal-window';
  win.renderOrder = 3;
  facing.add(win);
  if (open) {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ ...additive, uniforms: { uTime: time, uColor: { value: c } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: POOL_FRAG }),
    );
    pool.position.y = baseY + 0.02;
    pool.renderOrder = 2;
    obj.add(pool);
    // Motes rising in front of and around the window: fixed seeds, animated in the vertex shader.
    const n = 16, pos: number[] = [], seed: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = (i * 0.618034) % 1, a = i * 2.39996;
      pos.push(Math.cos(a) * PORTAL_W * 0.55 * Math.sqrt((i * 0.3819) % 1), baseY + 0.1, Math.sin(a) * 0.45);
      seed.push(s);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const motes = new THREE.Points(mg, new THREE.ShaderMaterial({ ...additive, uniforms: { uTime: time, uHeight: { value: PORTAL_H * 1.1 }, uColor: { value: c } }, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG }));
    motes.frustumCulled = false;
    motes.renderOrder = 4;
    obj.add(motes);
  }
  const title = spec.name ? buildTitle(spec.name, spec.color ?? 0x888890, open, spec.hint ?? 'Sealed') : null;
  if (title) facing.add(title);
  let bob = 0;
  // The title rides just above the oval's top, along the window's up axis (so it keeps the same
  // gap on screen however far the window leans), bobbing gently.
  const lean = (a: number) => {
    win.rotation.x = -a;
    if (title) title.position.set(0, baseY + 0.3 + (PORTAL_H + TITLE_GAP) * Math.cos(a) + bob, -(PORTAL_H + TITLE_GAP) * Math.sin(a));
  };
  lean(LEAN);
  const objYaw = () => tmpE.setFromQuaternion(obj.getWorldQuaternion(tmpQ), 'YXZ').y;
  // Every render (each camera: gameplay, map, previews) turns the window to face that camera, so
  // the oval never foreshortens into a circle. This runs before three.js builds the window's
  // model-view matrix, so the new pose shows in the same frame.
  win.onBeforeRender = (_r, _s, cam) => {
    facing.localToWorld(tmpFoot.set(0, baseY + 0.3, 0));
    const f = portalFacing(tmpFoot, cam.getWorldPosition(tmpCam));
    facing.rotation.y = f.yaw - objYaw();
    lean(f.lean);
    facing.updateMatrixWorld(true);
  };
  return {
    obj,
    tick: (t) => {
      time.value = t;
      // Before any render: face the fixed gameplay camera (which always looks along -Z), so a
      // platform on the side of an arc never shows its portal edge-on.
      // (The next render refines this to face the real camera.)
      facing.rotation.y = -objYaw();
      bob = Math.sin(t * 1.3) * (open ? 0.07 : 0.03);
    },
  };
}
