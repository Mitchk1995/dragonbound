import type * as THREE from 'three';
import { abs, dot, exp, float, If, length, max, min, mix, normalize, pow, saturate, select, sin, smoothstep, step, texture, vec2, vec3 } from 'three/tsl';
import { own, type F, type V2, type V3 } from '../render/patch';
import { noiseTexture } from '../render/textures';
import { GlimpseStyle } from './portalGlimpse';

// ─── The glimpse: a layered landscape traced along the view ray ─────────────

/**
 * What every portal's materials read (their own `portal` property): its clock, its zone colour and
 * its glimpse's palette.
 */
export interface PortalLook {
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

export const look = {
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
export const tnoise = (p: V2) => texture(noiseTexture(), p).level(float(0)).r;

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
export function scene(style: GlimpseStyle, o: V3, r: V3): V3 {
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
