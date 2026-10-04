import * as THREE from 'three';
import { abs, attribute, atan, cameraPosition, cross, dFdx, dFdy, diffuseColor, dot, faceDirection, float, fwidth, mat3, max, mix, modelWorldMatrix, mx_fractal_noise_float, mx_noise_float, normalGeometry, normalize, positionGeometry, positionView, saturate, select, sin, smoothstep, texture, varying, vec2, vec3, vec4 } from 'three/tsl';
import type { NodeBuilder } from 'three/webgpu';
import { addPatch, instanceMatrixNode, instanceOrigin, type F, type UniformReader, type V2, type V3, type V4 } from '../patch';
import type { LeafKind } from './leafPaint';
import { barkFor, leafAtlas, type BarkKind } from './textures';

/** The grown trees' bark and leaf materials, both swaying in the wind. */

/** The world's wind clock (worldView.ts advances it). */
export interface WindClock {
  uWindT: { value: number };
}

/**
 * How far the wind carries a point `at` with a sway weight `w` (0 still .. about 1.5 at the twigs),
 * at wind time `t`, for a tree standing at `ip`. The whole tree leans slowly with the gusts; each
 * bough rocks on its own phase, set by where it is in the crown; every tree has its own phase from
 * where it stands.
 */
function treeSway(at: V3, w: F, t: F, ip: V3): V3 {
  const ph = t.mul(0.9).add(ip.x.mul(0.31)).add(ip.z.mul(0.23)).toVar();
  const gust = sin(t.mul(0.37).add(ip.x.mul(0.05)).add(ip.z.mul(0.03))).mul(0.4).add(0.6).toVar();
  const lean = sin(ph).mul(0.65).add(sin(ph.mul(2.17).add(1.3)).mul(0.35)).mul(gust).toVar();
  const bough = sin(t.mul(1.9).add(dot(at, vec3(0.61, 0.37, 0.53))).add(ip.z.mul(0.7))).mul(gust).toVar();
  return vec3(lean.mul(0.07).add(bough.mul(0.05)), bough.mul(0.03), lean.mul(0.04).add(bough.mul(0.045))).mul(w);
}

/** A grown tree's bark: its sourced maps, how they are laid on the wood, and how it is toned. */
export interface BarkLook {
  kind: BarkKind;
  /** Bark metres up the limb per tile (round it, a tile is the species' bark girth). */
  tile: number;
  /** How strongly the relief lights (1 as sourced), and the colour map's brightness. */
  relief: number;
  gain: number;
  /** Moss in the furrows on the limbs' upper sides and round the damp foot (linear colour). */
  moss: number[];
  /** How brightly the bark's blue veins glow (the magic tree's; none when left out). */
  glow?: number;
  /** A dead tree's: where its bark has fallen away, and the wood under it (none when left out). */
  dead?: DeadWood;
}

/**
 * A dead tree's bare wood (its wood carries `aDead`: treeGrowth/wood.ts). Its bark has loosened and
 * fallen away in long patches running with the grain, the wood under it weathered: little of it near
 * the foot, more up the trunk (from `low` m up to `high` m, by when most is gone), most off its thin
 * branches and round every break, whose splintered ends are paler, fibrous wood.
 */
export interface DeadWood {
  /** The bare wood: its sourced maps (laid on as the bark's) and its colour map's brightness. */
  wood: BarkKind;
  gain: number;
  low: number;
  high: number;
}

/**
 * Turn a scenery material into a grown tree's bark: the bark's sourced colour and relief over the
 * wood's painted shade (vertex colour). Every limb wears it wrapped round in whole tiles (so it
 * never seams, and the furrows converge as the limb tapers, as an oak's do) and running up it by
 * its length, so the furrows follow each limb from its foot to its tip. Over a collar, where a
 * branch or root leaves its parent, the branch's own wrap runs down to the rim of its hole, turned
 * to carry on from the parent's bark there (treeGrowth.ts, woodGeometry): the furrows flow out of
 * the parent into the branch with no seam or cross-grain patch. The relief follows the wrap.
 * Young branches' relief is gentler; moss settles in the furrows on upper sides and round the foot.
 * Limbs and branches sway with their weight. A dead tree's bark has fallen away in places (deadBark).
 */
export function grownBark(mat: THREE.MeshStandardMaterial, wind: WindClock, look: BarkLook) {
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.95;
  mat.color.setRGB(1, 1, 1);
  const uniforms = {
    uWindT: wind.uWindT,
    uBarkTile: { value: look.tile },
    uBarkRelief: { value: look.relief },
    uBarkGain: { value: look.gain },
    uBarkMoss: { value: new THREE.Vector3(look.moss[0], look.moss[1], look.moss[2]) },
    uBarkGlow: { value: look.glow ?? 0 },
    ...(look.dead && { uWoodGain: { value: look.dead.gain }, uLossLow: { value: look.dead.low }, uLossHigh: { value: look.dead.high } }),
  };
  addPatch(mat, {
    // (The maps are looked up when the material is first drawn, so a world can be built without them.)
    key: `grown-bark:${look.kind}${look.dead ? `+${look.dead.wood}` : ''}`,
    uniforms,
    nodes(u, b) {
      const maps = barkFor(look.kind);
      const barkA = attribute('aBarkA', 'vec4') as V4, barkB = attribute('aBarkB', 'vec4') as V4, wood = attribute('aWood', 'vec4') as V4;
      let uv: V2 = vec2(0), nl: V3 = vec3(0), detail: F = float(0);
      return {
        position: (p) => p.add(treeSway(positionGeometry, wood.x, u.f('uWindT'), instanceOrigin(b))),
        color(c) {
          // Round the limb: its angle counted in whole tiles (taken from whichever of two seams lies
          // elsewhere, so the mip level never jumps) plus the wrap's offset; up it, its bark
          // coordinate. A collar takes its branch's wrap, turned toward the parent's bark at the rim
          // (the turn eased in and out, so the furrows bend smoothly from one into the other).
          const collar = (varying(wood.w).setInterpolation('flat') as F).greaterThan(0.5);
          const foot = varying(barkA.w).setInterpolation('flat') as F;
          const w = select(collar, barkB, barkA).toVar();
          const rim = float(1).sub(wood.w).toVar();
          const off = select(collar, foot.add(select(rim.greaterThan(1e-4), w.w.div(rim), float(0)).mul(rim).mul(rim).mul(float(3).sub(rim.mul(2)))), w.w);
          const ang = atan(w.y, w.x).mul(0.15915494).toVar();
          const s1 = ang.mul(w.z).toVar(), s2 = ang.add(1).fract().mul(w.z).toVar();
          uv = vec2(select(fwidth(s1).lessThanEqual(fwidth(s2)), s1, s2).add(off), wood.z.div(u.f('uBarkTile'))).toVar();
          const col = texture(maps.map).sample(uv).rgb.toVar();
          nl = texture(maps.normal).sample(uv).xyz.mul(2).sub(1).toVar();
          // Young branches' relief is gentler.
          detail = smoothstep(0.02, 0.12, wood.y).mul(0.65).add(0.35).toVar();
          const lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          const up = smoothstep(0.3, 0.9, normalize(normalGeometry).y), base = float(1).sub(smoothstep(0.1, 1.2, positionGeometry.y));
          const moss = saturate(up.mul(0.7).add(base.mul(0.6))).mul(float(1).sub(smoothstep(0.04, 0.12, lum)));
          const bark = mix(col, u.v3('uBarkMoss'), moss.mul(0.55)).mul(u.f('uBarkGain'));
          if (!look.dead) return c.mul(bark);
          const bare = deadBark(u, b, uv, wood, bark, look.dead);
          nl = mix(nl, bare.relief, bare.bare).toVar();
          return c.mul(bare.color);
        },
        emissive(e) {
          // A glowing bark's veins: where it runs bluer than its grey.
          const raw = texture(maps.map).sample(uv).rgb;
          const vein = smoothstep(0.03, 0.12, raw.b.sub(max(raw.r, raw.g)));
          return e.add(vec3(0.35, 0.8, 1.0).mul(vein.mul(u.f('uBarkGlow'))));
        },
        normal(n) {
          // The relief along the wrap's own directions on the surface: round the limb (u) and up it (v).
          const q0 = dFdx(positionView), q1 = dFdy(positionView);
          const st0 = dFdx(uv), st1 = dFdy(uv);
          const q1n = cross(q1, n), q0n = cross(n, q0);
          const bu0 = q1n.mul(st0.x).add(q0n.mul(st1.x)).toVar(), bv0 = q1n.mul(st0.y).add(q0n.mul(st1.y)).toVar();
          const bu = select(dot(bu0, bu0).greaterThan(0), normalize(bu0), vec3(0));
          const bv = select(dot(bv0, bv0).greaterThan(0), normalize(bv0), vec3(0));
          const tilt = bu.mul(nl.x).add(bv.mul(nl.y)).mul(u.f('uBarkRelief').mul(detail)).toVar();
          return normalize(n.add(tilt).sub(n.mul(dot(tilt, n))));
        },
      };
    },
  });
}

/**
 * A dead tree's bark and bare wood (DeadWood), from the bark's own colour (moss and brightness on
 * it) at bark coordinate `uv`: the colour, and the bare wood's relief and how bare it is there.
 *
 * Where the bark has gone is a noise laid with the grain (each limb's direction, `aDead`), so the
 * patches run up the limbs, against how far gone the bark is there: little near the foot, more up
 * the trunk, most on the thin branches and round a break. A finer noise tears its edge. The bark's
 * torn edge shows its paler inner bark; the wood just past it, where the bark held on longest, is
 * stained darker. A break's splintered end is pale, fibrous wood. (Over a collar the branch's and its
 * parent's distances from their breaks blend, so a branch leaving a limb just under its break is a
 * little bare at its foot too.)
 */
function deadBark(u: UniformReader, b: NodeBuilder, uv: V2, wood: V4, bark: V3, dead: DeadWood) {
  const maps = barkFor(dead.wood);
  const dd = attribute('aDead', 'vec4') as V4;
  const p = positionGeometry, t = normalize(dd.xyz);
  // (Each tree its own patches, from where it stands.)
  const q = p.sub(t.mul(dot(p, t).mul(0.5))).add(instanceOrigin(b).mul(0.37)).toVar();
  const n = mx_fractal_noise_float(q.mul(2.8), 2, 2.2, 0.5).mul(0.95).add(mx_noise_float(q.mul(10)).mul(0.12));
  // (Round its foot, where it stands in the damp, it has kept all its bark.)
  const high = smoothstep(u.f('uLossLow'), u.f('uLossHigh'), p.y).sub(float(1).sub(smoothstep(0.5, 1.5, p.y)).mul(0.3));
  const thin = float(1).sub(smoothstep(0.03, 0.11, wood.y));
  const near = float(1).sub(smoothstep(1, 3.5, dd.w));
  const s = max(high.mul(0.9).add(thin.mul(0.8)), near).add(n).sub(0.6).toVar();
  const aa = max(fwidth(s), 1e-4);
  const bare = smoothstep(aa.negate(), aa, s).toVar();
  const lip = smoothstep(-0.09, -0.01, s).mul(float(1).sub(bare));
  const stain = float(1).sub(smoothstep(0, 0.07, s)).mul(bare);
  const fresh = float(1).sub(smoothstep(0.88, 1, dd.w));
  const raw = texture(maps.map).sample(uv).rgb.mul(u.f('uWoodGain')).toVar();
  const weathered = mix(raw, raw.mul(vec3(0.7, 0.66, 0.6)), stain.mul(0.7));
  const bareWood = mix(weathered, raw.mul(vec3(1.28, 1.16, 0.98)), fresh);
  const barkEdge = mix(bark, bark.mul(vec3(1.3, 1.16, 0.96)), lip.mul(0.6));
  return {
    color: mix(barkEdge, bareWood, bare),
    relief: texture(maps.normal).sample(uv).xyz.mul(2).sub(1).mul(fresh.mul(0.5).add(1)),
    bare,
  };
}

/** Leaves are this much brighter than the atlas's multipliers (it keeps headroom for its light leaves). */
const LEAF_GAIN = 1.3;

/**
 * Turn a scenery material into a grown tree's leaves: a leaf kind's painted atlas, alpha-cut
 * (soft-edged with multisampling), both faces lit by the crown's normals (never darkened as back
 * faces), the instance colour and the crown's painted shade over it. A card seen edge on narrows
 * onto its twig instead of showing as a sliver; each card rides its twig in the wind and flutters
 * at its far edge.
 */
export function grownLeaves(mat: THREE.MeshStandardMaterial, wind: WindClock, kind: LeafKind, glow = 0) {
  mat.map = leafAtlas(kind);
  mat.alphaTest = 0.5;
  mat.side = THREE.DoubleSide;
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.85;
  mat.color.setScalar(LEAF_GAIN);
  addPatch(mat, {
    key: 'grown-leaves',
    uniforms: { uWindT: wind.uWindT, uLeafGlow: { value: glow } },
    nodes(u, b) {
      return {
        position(p) {
          const t = u.f('uWindT');
          const windA = attribute('aWind', 'vec4') as V4, spine = attribute('aSpine', 'vec3') as V3;
          const inst = instanceMatrixNode(b);
          const card = attribute('aCard', 'vec3') as V3;
          const cn = normalize(mat3(modelWorldMatrix).mul(inst ? mat3(inst).mul(card) : card));
          const wp = modelWorldMatrix.mul(inst ? inst.mul(vec4(p, 1)) : vec4(p, 1)).xyz;
          const facing = abs(dot(cn, normalize(cameraPosition.sub(wp))));
          const narrowed = spine.add(p.sub(spine).mul(smoothstep(0.06, 0.3, facing)));
          const flutter = sin(t.mul(6.3).add(dot(windA.xyz, vec3(12.9, 7.3, 9.1)))).mul(0.05).mul(attribute('aFlutter', 'float') as F).mul(windA.w);
          return narrowed.add(treeSway(windA.xyz, windA.w, t, instanceOrigin(b))).add(normalGeometry.mul(flutter));
        },
        // (Both faces take the crown's normal: the back face's flip is undone.)
        normal: (n) => n.mul(faceDirection),
        // A glowing kind's leaves give off their own colour (the magic tree's teal).
        emissive: (e) => e.add(diffuseColor.rgb.mul(u.f('uLeafGlow'))),
      };
    },
  });
}
