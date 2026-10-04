import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, atan, attribute, cameraPosition, cameraProjectionMatrix, cos, Discard, dot, exp, float, Fn, If, length, mat3, max, min, mix, modelViewMatrix, modelWorldMatrix, normalize, positionGeometry, positionWorld, pow, saturate, select, sin, smoothstep, step, texture, transpose, uv, varying, vec2, vec3, vec4, viewportSize } from 'three/tsl';
import { own, type F, type V2, type V3, type V4 } from '../render/patch';
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

/**
 * What every portal's materials read (their own `portal` property): its clock, its zone colour and
 * its glimpse's palette.
 */
interface PortalLook {
  time: { value: number };
  color: THREE.Color;
  skyTop: THREE.Color;
  skyLow: THREE.Color;
  fog: THREE.Color;
  ground: THREE.Color;
  sil: THREE.Color;
  glow: THREE.Color;
  /** The mote rise (world units). */
  height: number;
}

const look = {
  t: () => own.f('portal.time.value'),
  c: (name: Exclude<keyof PortalLook, 'time' | 'height'>) => own.color(`portal.${name}`),
};

const GROUND = -1.5;
const hash = (x: F) => sin(x.mul(127.1).add(11.7)).mul(43758.5453).fract();
const vnoise = (x: F) => {
  const i = x.floor().toVar(), f0 = x.fract();
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(hash(i), hash(i.add(1)), f);
};
/** The noise texture at its full level (some samples sit in branches, where implicit derivatives fail). */
const tnoise = (p: V2) => texture(noiseTexture(), p).level(float(0)).r;

/** Silhouette height above the ground at x for one layer (k: 0 near, 1 mid, 2 far) of a style. */
function silhouette(style: GlimpseStyle, x: F, k: number): F {
  const s = k * 17.3 + 3;
  switch (style) {
    case GlimpseStyle.Void: {
      // Void: the keep's island with towers and spires on the mid layer; drifting islets beyond.
      if (k === 0) return float(-1);
      if (k === 1) {
        const c = x.div(0.55).floor().toVar(), f = x.div(0.55).fract().toVar();
        const tower = step(0.22, f).mul(step(f, 0.78)).mul(step(abs(x.sub(0.6)), 2.4)).mul(hash(c.add(s)).mul(1.8).add(1)).toVar();
        const spire = max(0, float(1).sub(abs(f.sub(0.5)).mul(3.6))).mul(0.8).mul(step(0.35, hash(c.add(9))));
        return select(abs(x.sub(0.6)).greaterThan(3), float(-1), max(0.2, tower.add(spire.mul(step(0.01, tower)))).add(1));
      }
      const c2 = x.div(3).floor().toVar();
      return select(hash(c2.add(s)).greaterThan(0.55), hash(c2.add(4)).mul(1.2).add(2.2).sub(abs(x.div(3).fract().sub(0.5)).mul(3.2)), float(-1));
    }
    case GlimpseStyle.Cave: {
      // Cave: rubble banks and pillars, walls closing in at the sides.
      const h = vnoise(x.mul(1.4).add(s)).mul(0.9).add(0.3).add(step(0.84, vnoise(x.mul(0.8).add(s * 2))).mul(2.8));
      return max(h.mul(step(1.1, abs(x))), abs(x).sub(2 + k * 1.1).mul(2.4));
    }
    case GlimpseStyle.Forest: {
      // Forest: pines near, a pine ridge mid, mountains far.
      if (k === 2) return vnoise(x.mul(0.35).add(s)).mul(2.6).add(1.8).add(vnoise(x.mul(1.1).add(s)).mul(0.6));
      const w = k === 0 ? 0.9 : 0.6;
      const c = x.div(w).floor(), f = x.div(w).fract();
      const h = hash(c.add(s)).mul(k === 0 ? 1.4 : 0.8).add(k === 0 ? 1.6 : 0.9);
      const tri = float(1).sub(abs(f.sub(0.5)).mul(2)).toVar();
      const tiers = tri.sub(tri.mod(0.34).mul(0.45));
      return h.mul(tiers).add(vnoise(x.mul(0.5).add(s)).mul(0.5)).add(k === 0 ? 0 : 0.6);
    }
    case GlimpseStyle.Water: {
      // Water: broken columns near, a ruined colonnade mid, low hills far.
      if (k === 2) return vnoise(x.mul(0.4).add(s)).mul(0.9).add(0.4);
      const w = k === 0 ? 1.7 : 1.0;
      const c = x.div(w).floor().toVar(), f = x.div(w).fract().toVar();
      const h = hash(c.add(s)).mul(1.6).add(k === 0 ? 1.8 : 1.3).toVar();
      const gone = step(hash(c.add(s + 1)), 0.3);
      const wall = step(0.5, k).mul(step(0.8, hash(c.add(s + 7))));
      const col = step(0.38, f).mul(step(f, 0.62));
      const broken = select(hash(c.add(s + 5)).greaterThan(0.45), float(1).sub(f.sub(0.38).mul(1.6).mul(hash(c.add(2)))), float(1));
      const hh = select(wall.greaterThan(0.5), h.mul(0.55).add(vnoise(x.mul(3)).mul(0.3)), select(col.greaterThan(0.5), h.mul(broken), float(-1)));
      return select(gone.greaterThan(0.5), float(-1), hh);
    }
    default: {
      // Lava: jagged spires.
      const w = k === 0 ? 1.3 : 0.8;
      const c = x.div(w).floor(), f = x.div(w).fract();
      const spike = pow(max(0, float(1).sub(abs(f.sub(0.5)).mul(2))), 1.6).mul(hash(c.add(s)).mul(2.6).add(1.2));
      return spike.add(vnoise(x.mul(0.9).add(s)).mul(k === 2 ? 1.6 : 0.5));
    }
  }
}

function sky(style: GlimpseStyle, r: V3): V3 {
  const t = look.t(), top = look.c('skyTop');
  const h = saturate(r.y.mul(2.2).add(0.1)).toVar();
  let c: V3 = mix(look.c('skyLow'), top, pow(h, 0.7));
  // Below the horizon (only seen past the edge of the keep's island): the abyss.
  c = mix(c, top.mul(0.35), smoothstep(-0.02, -0.3, r.y));
  // Sun / moon / tunnel glow just above the horizon.
  const g = exp(length(vec2(r.x.mul(1.3).sub(0.18), r.y.sub(0.05))).mul(-6));
  c = c.add(look.c('glow').mul(g).mul(style === GlimpseStyle.Cave ? 1.5 : 0.45));
  if (style === GlimpseStyle.Void || style === GlimpseStyle.Water || style === GlimpseStyle.Lava) {
    let q = r.xy.div(max(r.z.negate(), 0.2)).mul(26);
    if (style === GlimpseStyle.Lava) q = vec2(q.x, q.y.sub(t.mul(1.5)));
    const cell = q.floor().toVar();
    const st = hash(cell.x.mul(7.1).add(cell.y.mul(13.7))).toVar();
    const dd = length(q.fract().sub(0.5));
    if (style === GlimpseStyle.Void) c = c.add(vec3(1.0, 0.95, 1.1).mul(step(0.93, st).mul(smoothstep(0.2, 0, dd)).mul(sin(t.mul(2).add(st.mul(40))).mul(0.4).add(0.6)).mul(h).mul(1.4)));
    else if (style === GlimpseStyle.Lava) c = c.add(vec3(1.6, 0.5, 0.1).mul(step(0.95, st).mul(smoothstep(0.18, 0, dd))));
    else c = c.add(vec3(0.9).mul(step(0.97, st).mul(smoothstep(0.15, 0, dd)).mul(h).mul(0.6)));
  }
  return c;
}

/**
 * One silhouette layer (the plane z = -D, haze 0..1): whether the ray from o meets the layer's rock
 * before parameter tLimit, and the colour it shows there.
 */
function layer(style: GlimpseStyle, o: V3, r: V3, tLimit: F | number, k: number, D: number, haze: number) {
  const t = o.z.add(D).div(r.z.negate()).toVar();
  const p = o.add(r.mul(t)).toVar();
  const top = silhouette(style, p.x, k).add(GROUND).toVar();
  const hit = t.greaterThan(0).and(t.lessThanEqual(tLimit)).and(p.y.lessThan(top));
  const color = () => {
    const glow = look.c('glow');
    // Lit rim along the top edge, soft body shading downward.
    let c: V3 = mix(look.c('sil'), look.c('fog'), haze).add(glow.mul(smoothstep(0.09, 0, top.sub(p.y)).mul(0.4 - haze * 0.3)));
    c = c.mul(smoothstep(GROUND, top, p.y).mul(0.2).add(0.8));
    if (style === GlimpseStyle.Void && k === 1) {
      // Lit windows in the keep's towers.
      const wq = vec2(p.x.mul(7), p.y.mul(5));
      const win = step(0.78, hash(wq.x.floor().mul(3.1).add(wq.y.floor().mul(7.7)))).mul(step(0.35, wq.x.fract())).mul(step(0.3, wq.y.fract())).mul(step(GROUND + 1.2, p.y));
      c = c.add(glow.mul(win).mul(1.3));
    } else if (style === GlimpseStyle.Cave) {
      // Lantern light pooled low on the walls, and a lantern hung on each wall of each layer.
      c = c.add(glow.mul(0.22).mul(float(1).sub(smoothstep(GROUND, GROUND + 1.6, p.y))).mul(1 - haze));
      const lp = vec2(abs(p.x).sub(1.75 + k * 1.1), p.y.sub(GROUND + 1.5)).toVar();
      c = c.add(glow.mul(exp(dot(lp, lp).mul(-30)).mul(2.5).add(exp(length(lp).mul(-3.5)).mul(0.35))).mul(1 - haze * 0.6));
    }
    return c;
  };
  return { hit, color };
}

/** The glimpse along the ray r from o (the portal's own frame: the far side lies toward -z). */
function scene(style: GlimpseStyle, o: V3, r: V3): V3 {
  const depthK = style === GlimpseStyle.Cave ? 0.8 : 1.0;
  const tg = select(r.y.lessThan(-0.001), float(GROUND).sub(o.y).div(r.y), float(1e5)).toVar();
  const gz = r.z.negate().mul(tg).toVar();
  let tl: F = tg;
  let tc: F = float(1e5);
  if (style === GlimpseStyle.Cave) {
    // Cave ceiling: a low rock roof with hanging teeth, receding into the dark.
    tc = select(r.y.greaterThan(0.001), vnoise(o.x.mul(2).add(r.x.mul(9))).mul(0.3).add(1.3).sub(o.y).div(r.y), float(1e5)).toVar();
    tl = min(tg, tc);
  }
  const out = vec3(0).toVar();
  const near = layer(style, o, r, tl, 0, 4.5 * depthK, 0.12), mid = layer(style, o, r, tl, 1, 9 * depthK, 0.42), far = layer(style, o, r, tl, 2, 18 * depthK, 0.7);
  const open = () => {
    if (style === GlimpseStyle.Void) {
      If(abs(o.x.add(r.x.mul(tg)).sub(0.6)).greaterThan(3).or(gz.greaterThan(11)), () => {
        tg.assign(1e5);
      });
    }
    If(tg.greaterThan(1e4), () => {
      out.assign(sky(style, r));
    }).Else(() => {
      const p = o.add(r.mul(tg)).toVar();
      const haze = smoothstep(1, 22, gz).toVar();
      const t = look.t(), ground = look.c('ground');
      let c: V3;
      if (style === GlimpseStyle.Water) {
        // Still water: near and mid layers mirrored and rippled over deep teal, glints on the ripples.
        const rip = vec2(tnoise(p.xz.mul(vec2(0.3, 0.9)).add(vec2(t.mul(0.02), 0))), tnoise(p.xz.mul(vec2(0.5, 1.2)).sub(vec2(0, t.mul(0.03))))).sub(0.5);
        const rr = normalize(vec3(r.x.add(rip.x.mul(0.06)), r.y.negate(), r.z.add(rip.y.mul(0.06)))).toVar();
        const a = layer(style, p, rr, 1e5, 0, 4.5, 0.12), b = layer(style, p, rr, 1e5, 1, 9, 0.42);
        const refl = select(a.hit, a.color(), select(b.hit, b.color(), sky(style, rr)));
        const fres = pow(float(1).sub(abs(r.y)), 5).mul(0.6).add(0.3);
        c = mix(ground, refl.mul(0.9), fres).add(look.c('glow').mul(pow(max(0, tnoise(p.xz.mul(vec2(1.4, 3)).add(t.mul(0.04))).sub(0.7)), 2)).mul(4).mul(float(1).sub(haze)));
      } else if (style === GlimpseStyle.Lava) {
        const n = tnoise(p.xz.mul(0.3).add(vec2(0, t.mul(0.01))));
        const crack = smoothstep(0.045, 0, abs(n.sub(0.5))).mul(float(1).sub(haze.mul(0.5)));
        c = mix(ground, vec3(2.4, 0.6, 0.1), crack);
      } else {
        c = ground.mul(tnoise(p.xz.mul(0.25)).mul(0.5).add(0.75));
        if (style === GlimpseStyle.Cave) {
          // A mine-cart track running off into the dark: sleepers and two steel rails.
          const rz = p.z.mul(1.6).fract();
          const sleeper = step(abs(p.x.sub(0.1)), 0.62).mul(step(rz, 0.35));
          c = mix(c, vec3(0.16, 0.09, 0.05), sleeper);
          const rail = step(abs(abs(p.x.sub(0.1)).sub(0.42)), 0.05);
          c = mix(c, vec3(0.5, 0.48, 0.46).add(look.c('glow').mul(0.15)), rail);
        }
      }
      out.assign(mix(c, look.c('fog'), haze.mul(0.85)));
    });
  };
  const chain = If(near.hit, () => {
    out.assign(near.color());
  }).ElseIf(mid.hit, () => {
    out.assign(mid.color());
  }).ElseIf(far.hit, () => {
    out.assign(far.color());
  });
  if (style === GlimpseStyle.Cave) {
    chain.ElseIf(tc.lessThan(1e4), () => {
      const pc = o.add(r.mul(tc)).toVar();
      const teeth = vnoise(pc.x.mul(2.6)).mul(0.6).add(vnoise(pc.z.mul(-1.1)).mul(0.4));
      out.assign(mix(look.c('sil').mul(teeth.mul(0.5).add(0.7)), look.c('fog').mul(0.6), smoothstep(2, 16, pc.z.negate())));
    }).Else(open);
  } else chain.Else(open);
  return out;
}

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
const windowNode = (style: GlimpseStyle, open: boolean) => {
  const key = `${style}:${open}`;
  let n = windows.get(key);
  if (!n) windows.set(key, (n = windowColor(style, open)));
  return n;
};

/** The floor glow under an open portal. */
const POOL = Fn(() => {
  const p = abs(uv().sub(0.5)).mul(2);
  const d = max(p.x, p.y).mul(0.55).add(length(uv().sub(0.5)).mul(0.9));
  const glow = smoothstep(1, 0.1, d).mul(sin(look.t().mul(2.1)).mul(0.2).add(0.8));
  return vec4(look.c('color').mul(glow).mul(0.3), 1);
})();

/**
 * Motes rising through an open portal: soft dots on camera-facing quads, from fixed seeds (aMote:
 * where each starts and its seed), animated here.
 */
const mote = (() => {
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

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false } as const;

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
 * (the caller repaints when it loads). Returns where the lettering and its rule sit, as fractions of the canvas, so the
 * HUD can tell when the title would slide under a panel (ui/worldText.ts).
 */
function paintTitle(ctx: CanvasRenderingContext2D, name: string, color: number, open: boolean, hint: string, atlas: ImageBitmap | null, atlasFailed = false): TitleInk {
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
  } else if (atlasFailed) {
    // The alphabet could not be loaded: plain letters rather than a nameless portal.
    ctx.fillStyle = open ? '#a8dcff' : '#b0aca6';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * gap));
  }
  // Rule with a gem (open) or a padlock and the hint (locked).
  const ry = top + (lines.length - 1) * gap + depth + 34;
  const cx = W / 2;
  ctx.lineWidth = 3;
  const rw = Math.min(W * 0.34, 260);
  const half = Math.max(rw, ...laid.map((l) => l.width / 2), open ? 0 : 200);
  const ink: TitleInk = { left: (cx - half) / W, right: (cx + half) / W, top: (top - cap) / H, bottom: Math.min(1, (ry + (open ? 14 : 36)) / H) };
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
  return ink;
}

/** Where a title's lettering sits on its canvas: fractions of the width (left, right) and height (top, bottom). */
export interface TitleInk { left: number; right: number; top: number; bottom: number }

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
  let atlas: ImageBitmap | null = null, atlasFailed = false;
  const draw = () => {
    ink = paintTitle(ctx, name, color, open, hint, atlas, atlasFailed);
    if (s) s.userData.ink = ink;
    tex.needsUpdate = true;
  };
  let s: THREE.Sprite | null = null, ink: TitleInk | null = null;
  draw();
  // Repaint once the alphabet has loaded, and once the display font has (the first paint may use the fallback serif).
  void loadAtlas(FONT_SETS.blue).then((a) => {
    atlas = a;
    atlasFailed = !a;
    if (!a) console.warn('portal titles: the blue alphabet failed to load');
    draw();
  });
  const fonts = (document as any).fonts as FontFaceSet | undefined;
  if (fonts && !fonts.check("800 64px Cinzel")) void fonts.load("800 64px Cinzel").then(draw, () => {});
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  // Lit titles glow just past the bloom threshold; sealed ones stay matte.
  mat.color.setScalar(open ? 1.12 : 0.9);
  s = new THREE.Sprite(mat);
  s.name = 'portal-title';
  s.userData.ink = ink;
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
  const gl = glimpseFor(spec.dest ?? 'keep', spec.theme);
  const portal: PortalLook = {
    time: { value: 0 }, color: c, height: PORTAL_H * 1.1,
    skyTop: new THREE.Color(gl.skyTop), skyLow: new THREE.Color(gl.skyLow), fog: new THREE.Color(gl.fog), ground: new THREE.Color(gl.ground), sil: new THREE.Color(gl.sil), glow: new THREE.Color(gl.glow),
  };
  const time = portal.time;
  // The window and title turn together to face the camera (see tick); the window pivots on its
  // foot to lean back.
  const facing = new THREE.Group();
  obj.add(facing);
  const winMat = Object.assign(new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }), { portal });
  winMat.colorNode = windowNode(gl.style, open);
  winMat.userData = { style: gl.style, open };
  const win = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL_W * HALO, PORTAL_H * HALO).translate(0, PORTAL_H / 2, 0), winMat);
  win.position.y = baseY + 0.3;
  win.rotation.x = -LEAN;
  win.name = 'portal-window';
  win.renderOrder = 3;
  facing.add(win);
  if (open) {
    const poolMat = Object.assign(new MeshBasicNodeMaterial(additive), { portal });
    poolMat.colorNode = POOL;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), poolMat);
    pool.position.y = baseY + 0.02;
    pool.renderOrder = 2;
    obj.add(pool);
    // Motes rising in front of and around the window: fixed seeds, animated in the vertex shader.
    const n = 16, at: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = (i * 0.618034) % 1, a = i * 2.39996;
      at.push(Math.cos(a) * PORTAL_W * 0.55 * Math.sqrt((i * 0.3819) % 1), baseY + 0.1, Math.sin(a) * 0.45, s);
    }
    const mg = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
    mg.setAttribute('aMote', new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
    mg.instanceCount = n;
    const moteMat = Object.assign(new MeshBasicNodeMaterial(additive), { portal });
    moteMat.vertexNode = mote.vertex;
    moteMat.colorNode = mote.color;
    const motes = new THREE.Mesh(mg, moteMat);
    motes.name = 'portal-motes';
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
