import * as THREE from 'three';
import { abs, attribute, cameraViewMatrix, clamp, cross, dFdx, dFdy, dot, float, fwidth, If, length, mat3, materialColor, max, min, mix, normalize, positionView, positionWorld, pow, select, sin, smoothstep, sqrt, step, vec2, vec3, vec4 } from 'three/tsl';
import { groundTexture, noiseTexture } from './textures';
import { paintTint } from './paint';
import { rockAtlas, rockFaceN, rockPaint, ROCK_TILE } from './rock';
import { addPatch, rot2, surfaceFrame, type F, type V2, type V3, type V4 } from './patch';
import { heightColor, heightRoughness } from './surfaceDetail';

/**
 * Painted colour drifts on the walkable floor rock (flat, low, rock-splatted ground only), from
 * slow noise fetches: in the lair a fine, low-contrast ash tone (a slightly greyer, lighter film
 * on the ruddy rock; the soot around the roost and the seams is painted into the terrain's
 * vertex colour), in the mine ochre mineral stains and cool damp patches. Nothing elsewhere.
 */
function floorVariation(kind: 'lair' | 'mine', c: V3, mixN: (q: V2) => F, splat: V4, pos: V3, nrm: V3) {
  const rockW = splat.w.div(max(dot(splat, vec4(1)), 0.001));
  const floorW = rockW.mul(float(1).sub(smoothstep(0.2, 0.6, pos.y))).mul(smoothstep(0.8, 0.95, normalize(nrm).y)).toVar();
  const n1 = mixN(pos.xz.mul(0.045).add(vec2(0.61, 0.27))).toVar();
  const n2 = mixN(pos.xz.mul(0.08).add(vec2(0.23, 0.83))).toVar();
  if (kind === 'lair') {
    const nf = mixN(pos.xz.mul(0.19).add(vec2(0.37, 0.11)));
    const ash = smoothstep(0.38, 0.8, nf.mul(0.65).add(n1.mul(0.35))).mul(floorW);
    const ashCol = vec3(dot(c, vec3(0.3, 0.5, 0.2))).mul(vec3(1.14, 1.06, 1.0));
    c.assign(mix(c, ashCol, ash.mul(0.42)));
    c.mulAssign(n2.sub(0.5).mul(0.2).mul(floorW).add(1));
  } else {
    const stain = smoothstep(0.6, 0.66, n1).mul(floorW);
    const damp = smoothstep(0.32, 0.26, n2).mul(floorW);
    c.mulAssign(mix(vec3(1), vec3(1.2, 0.98, 0.74), stain));
    c.mulAssign(mix(vec3(1), vec3(0.8, 0.86, 0.96), damp));
  }
}

/** Height of one cave-rock terrace (terrain.ts builds them; the riser shading below keys to it). */
export const CAVE_TERRACE = 1.0;

/**
 * Paving laid as a designed bond on the cell grid: rows a third of a cell deep along X, each stone
 * two thirds long, every other row's joints over the middle of the stones below. Every cell edge falls
 * on a row joint and on a whole or half stone, so wherever a paved area ends (a cell edge) its stones
 * end whole, and a kerb (a third wide, flush on the paving's side) takes its first row exactly.
 * Rounded, bevelled stones, a tone each, soft broad drift: as the painted paving. Like the castle's
 * dressed stone (paint.ts) each stone has real relief, gentler: `grad` takes the slope of its bevelled
 * edge over the ground (MASON's bump, in world space) and `joint` how much of the fragment is joint,
 * both softened far off (`px`, metres to a pixel). Returns the stone's painted value.
 */
function paveLaid(p: V2, px: F, mixN: (q: V2) => F, grad: V2, joint: F): F {
  const rz = p.y.mul(3), r = rz.floor().toVar(), fz = rz.sub(r).toVar();
  const xo = p.x.mul(1.5).add(select(r.mod(2).greaterThan(0.5), float(0.5), float(0))), b = xo.floor().toVar(), fx = xo.sub(b).toVar();
  const dx = min(fx, float(1).sub(fx)).div(1.5).toVar(), dz = min(fz, float(1).sub(fz)).div(3).toVar();
  const rc = 0.05;
  const sg = vec2(select(fx.lessThan(0.5), float(1), float(-1)), select(fz.lessThan(0.5), float(1), float(-1)));
  const corner = dx.lessThan(rc).and(dz.lessThan(rc));
  const cq = vec2(float(rc).sub(dx), float(rc).sub(dz));
  const dir = select(corner, normalize(cq.add(1e-5)).mul(sg), select(dx.lessThan(dz), vec2(sg.x, 0), vec2(0, sg.y)));
  const d = select(corner, float(rc).sub(length(cq)), min(dx, dz)).add(mixN(p.mul(1.7)).sub(0.5).mul(0.012)).toVar();
  const tb = clamp(d.sub(0.014).div(0.035), 0, 1), near = float(1).sub(smoothstep(0.02, 0.07, px)).toVar();
  grad.assign(dir.mul(float(1).sub(tb).mul(2 * 0.011 / 0.035)).mul(near));
  joint.assign(float(1).sub(smoothstep(px.mul(-0.5).add(0.014), px.mul(0.5).add(0.014), d)).mul(mix(0.5, 1, near)));
  const h = sin(dot(vec2(r, b), vec2(127.1, 311.7))).mul(43758.5453).fract();
  const tone = h.sub(0.5).mul(0.3).add(0.54).add(mixN(p.mul(0.09)).sub(0.5).mul(0.1)).add(mixN(p.mul(0.6).add(0.3)).sub(0.5).mul(0.08));
  const faceV = tone.sub(float(1).sub(smoothstep(0.02, 0.07, d)).mul(0.1)).add(float(1).sub(smoothstep(0, 0.05, fz.div(3))).mul(smoothstep(0.02, 0.04, d)).mul(0.06));
  return faceV.sub(0.12).mul(smoothstep(0.008, 0.026, d)).add(0.12);
}

/** Shared clock for animated ground (the refracted, caustic-lit bed under water); terrain ticks it. */
export const GROUND_TIME = { value: 0 };

/**
 * Ground: a four-channel painted atlas (dirt, grass, flagstone, smooth floor rock) projected
 * top-down in world space and blended per vertex by the `aSplat` attribute. Colour only (no
 * bump). Anti-tiling: the atlas is sampled at two scales (the second rotated 37°) and the two are
 * blended by a low-frequency noise mask, so no 4-unit repeat is visible (small flagstones give way
 * to big slabs, and back). Steep faces (and all raised rock where the relief has no grassy top)
 * take the shared painted rock (rock.ts: strata blocks, cracks, grain), projected triplanar from
 * the flat face so it never stretches on tall faces.
 *
 * `cliff`: colour steep faces blend to (slope-based texturing: mesa tops keep their grass).
 * `cave`: towering cave walls (terraced rock mass: lit risers, chiselled faces).
 * `waterY`: the water surface height when the zone has water: the bed below it wobbles as if
 * seen through moving water, takes dancing caustics and fades to the water's colour with depth.
 * `rockTops`: raised relief is rock on top too (false where cliffs carry grassy mesa tops).
 * `sharp`: the geometry carries per-channel colours (`aCol0..3`): ground types then meet along
 *   crisp, natural edges picked by their own painted patterns (a height blend: grass tufts and
 *   pebbles poke through first, grass creeps into the paving's joints), instead of a soft smear.
 * `moss`: moss in the paving's grout lines (the drowned city).
 * `rockMoss`: how far moss spreads over grassy-topped rock (0 patches on the flattest ledges, 1 lush).
 * `laid`: the paving laid as a designed bond (paveLaid) instead of the atlas's flagstones.
 */
export function applyGround(mat: THREE.MeshStandardMaterial, lava = 0, topShade = 1, cliff: number | null = null, topRange: [number, number] = [0.8, 3.4], cave = false, waterY: number | null = null, waterTint = 0x2e6a70, rockTops = true, sharp = false, moss = false, rockMoss = 0, laid = false) {
  const wet = waterY !== null;
  const uniforms = {
    uTime: GROUND_TIME,
    uWaterY: { value: waterY ?? 0 },
    uWaterTint: { value: new THREE.Color(waterTint) },
    uLava: { value: lava },
    uTopShade: { value: topShade },
    uTopRange: { value: new THREE.Vector2(...topRange) },
    uCliff: { value: new THREE.Color(cliff ?? 0x6a5e52) },
    uRockMoss: { value: rockMoss },
    uGroundTex: { value: groundTexture() },
    uRockTex: { value: rockAtlas(cave ? 'strata' : 'natural') },
    uRockScale: { value: 1 / ROCK_TILE },
    uPaintAmt: { value: 0.28 },
    uMixTex: { value: noiseTexture() },
    // Painted tonal variation only (no bump). The value (surfH) still drives the cliff tint and
    // the lava crevice glow below.
    uSurfScale: { value: 0.25 },
    uSurfAlbedo: { value: 0.42 },
  };
  addPatch(mat, {
    key: `ground4${laid ? ':laid' : ''}${lava > 0 ? ':lava' : ''}${topShade < 1 ? ':shade' : ''}${cliff !== null ? ':cliff' : ''}${cave ? ':cave' : ''}${wet ? ':wet' : ''}${rockTops ? ':tops' : ''}${sharp ? ':sharp' : ''}${moss ? ':moss' : ''}`,
    uniforms,
    nodes(u, b) {
      const pos = positionWorld;
      let nrm: V3 = vec3(0, 1, 0);
      const gTex = u.tex('uGroundTex'), mixT = u.tex('uMixTex'), rockT = u.tex('uRockTex');
      const S = u.f('uSurfScale'), alb = u.f('uSurfAlbedo'), time = u.f('uTime'), waterY = u.f('uWaterY');
      const mixN = (q: V2) => mixT.sample(q).r;
      const splat = attribute('aSplat', 'vec4') as V4;
      // The ground weights after sharpening, the atlas sample and the height (set by the colour).
      let gK: V4 = vec4(0), surfH: F = float(0.5), paveGrad: V2 = vec2(0), paveJoint: F = float(0);
      return {
        color(c) {
          nrm = surfaceFrame('world', b).nrm;
          if (laid) {
            paveGrad = vec2(0).toVar();
            paveJoint = float(0).toVar();
          }
          const k = splat.div(max(dot(splat, vec4(1)), 0.001)).toVar();
          const w0 = pow(abs(normalize(nrm)), vec3(6));
          const w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
          // Top: the splatted atlas at two scales, blended by a slow noise mask.
          const p = pos.xz.toVar();
          // (How many metres a pixel spans, taken before any branch.)
          const pavePx = laid ? length(fwidth(p)).toVar() : float(0);
          if (wet) {
            // Under water the bed is seen through moving ripples: its pattern wobbles.
            const sub = smoothstep(waterY.add(0.02), waterY.sub(0.12), pos.y);
            p.addAssign(vec2(mixN(p.mul(0.21).add(vec2(time.mul(0.03), 0))), mixN(p.mul(0.17).add(vec2(0.5, time.mul(0.025))))).sub(0.5).mul(0.3).mul(sub));
          }
          const t1 = gTex.sample(p.mul(S)).toVar();
          const t2 = gTex.sample(rot2(p, 0.7986, 0.6018, -0.6018, 0.7986).mul(S.mul(0.348)).add(vec2(0.31, 0.57))).toVar();
          const m = smoothstep(0.36, 0.64, mixN(p.mul(0.019).add(vec2(0.13, 0.71))));
          const t = mix(t1, t2, m).toVar();
          // Beaten earth: a third sample at another scale and angle, blended in by a finer mask, so
          // no stain repeats on a visible grid across a big yard.
          If(k.x.greaterThan(0.001), () => {
            const m3 = smoothstep(0.3, 0.7, mixN(p.mul(0.083).add(vec2(0.57, 0.21))));
            const t3 = gTex.sample(rot2(p, 0.3256, 0.9455, -0.9455, 0.3256).mul(S.mul(0.61)).add(vec2(0.73, 0.19))).r;
            t.x.assign(mix(mix(t1.r, t2.r, 0.5), t3, m3));
          });
          // Paving is laid square to the world and never cross-faded (two overlaid layouts read
          // as cracked mud): one unrotated sample with an 8-unit tile, or (laid) the designed bond.
          If(k.z.greaterThan(0.001), () => {
            t.z.assign(laid ? paveLaid(p, pavePx, mixN, paveGrad, paveJoint) : gTex.sample(p.mul(S.mul(0.5))).b);
          });
          if (sharp) {
            // Height blend: each ground type rises by its own pattern (grass clumps, pebbles, paving
            // stones stand proud of their joints); within a narrow band of the highest the types mix,
            // below it they drop out. Edges are crisp but follow the paint, never the grid.
            const hk = k.add(t.sub(0.5).mul(1.2).mul(step(0.001, k))).toVar();
            const top = max(max(hk.x, hk.y), max(hk.z, hk.w));
            const kk = max(hk.sub(top.sub(0.03)), 0).toVar();
            k.assign(kk.div(max(dot(kk, vec4(1)), 1e-4)));
          }
          gK = k;
          const h = dot(t, k).toVar();
          surfH = h;
          // Most ground is flat: skip the side projections there; steep faces take a calm drift (the
          // rock pattern itself is painted after the colour).
          If(w.y.lessThanEqual(0.985), () => {
            const s = S.mul(0.8);
            const rx = rockT.sample(pos.zy.mul(s)).a, rz = rockT.sample(pos.xy.mul(s)).a;
            h.assign(h.mul(w.y).add(rx.mul(w.x).add(rz.mul(w.z)).mul(0.6)).add(w.x.add(w.z).mul(0.2)));
          });
          if (sharp) {
            // Each ground type in its own colour, by the sharpened weights.
            const col = (i: number) => attribute(`aCol${i}`, 'vec3') as V3;
            c.assign(vec3(materialColor).mul(col(0).mul(k.x).add(col(1).mul(k.y)).add(col(2).mul(k.z)).add(col(3).mul(k.w))));
          }
          if (moss) {
            // Moss in the paving's joints, in patches: dark green where the mortar is.
            const joint = float(1).sub(smoothstep(0.16, 0.3, t.b));
            const patchM = smoothstep(0.42, 0.62, mixN(pos.xz.mul(0.07).add(vec2(0.7, 0.2))));
            const mossK = joint.mul(k.z).mul(patchM.mul(0.65).add(0.35)).mul(smoothstep(-0.05, 0.05, pos.y.add(0.1)));
            c.assign(mix(c, vec3(0.07, 0.12, 0.05), mossK.mul(0.85)));
          }
          // Painterly: warm lights, cool darks (and, laid, the paving's joints deep and dark).
          c.assign(heightColor(c, h, alb).mul(paintTint(h, u.f('uPaintAmt'))));
          if (laid) c.mulAssign(mix(1, 0.6, paveJoint.mul(k.z)));
          if (lava > 0) floorVariation('lair', c, mixN, splat, pos, nrm);
          else if (topShade < 1) floorVariation('mine', c, mixN, splat, pos, nrm);
          // Rock, in order: the cliff colour on steep faces, the painted rock, cave risers, the climb
          // into darkness, and last the drowned bed's absorption.
          const gn = normalize(nrm).toVar();
          const steep = smoothstep(0.42, 0.78, float(1).sub(abs(gn.y))).toVar();
          // Steep faces take the cliff rock colour whatever the vertex colour (mesa tops stay grassy).
          if (cliff !== null) c.assign(mix(c, u.v3('uCliff').mul(h.mul(0.4).add(0.8)), steep));
          const rockK = max(steep, smoothstep(0.45, 1, pos.y).mul(rockTops ? float(1) : smoothstep(0.45, 0.8, splat.w.div(max(dot(splat, vec4(1)), 0.001))))).toVar();
          If(rockK.greaterThan(0.001), () => {
            const fn = rockFaceN(pos).toVar();
            c.assign(rockPaint(rockT, u.f('uRockScale'), c, pos, fn, rockK));
            if (cave) return;
            // Weathered outdoor rock: dark rain streaks run down the faces (long, thin, broken), broad
            // ochre and cool stains drift across them, and (grassy tops) moss and grass on the ledges.
            const aw = abs(fn).toVar();
            const stx = mixN(vec2(pos.z.mul(0.12).add(0.3), pos.y.mul(0.01)));
            const stz = mixN(vec2(pos.x.mul(0.12).add(0.7), pos.y.mul(0.01)));
            const streak = stx.mul(aw.x).add(stz.mul(aw.z)).div(max(aw.x.add(aw.z), 0.001));
            const faceK = steep.mul(rockK).mul(float(1).sub(smoothstep(0.35, 0.7, aw.y))).toVar();
            c.mulAssign(float(1).sub(smoothstep(0.45, 0.75, streak).mul(faceK).mul(0.32)));
            const drift2 = mixN(pos.xz.mul(0.021).add(vec2(pos.y.mul(0.017), 0.4)));
            c.mulAssign(mix(vec3(0.92, 0.97, 1.06), vec3(1.12, 1.0, 0.8), smoothstep(0.3, 0.75, drift2).mul(faceK).add(float(1).sub(faceK).mul(0.5))));
            // One big weathering gradient up every face: warmer and darker toward the damp foot,
            // cooler and lighter toward the sunlit crown; the faces lifted a little overall so those
            // turned from the sun read as shaded rock, never black.
            const hk = smoothstep(-1, 13, pos.y);
            c.mulAssign(mix(mix(vec3(1), vec3(0.9, 0.86, 0.8), faceK), mix(vec3(1), vec3(1.04, 1.06, 1.12), faceK), hk).mul(faceK.mul(0.12).add(1)));
            if (rockTops) return;
            // Moss laid from straight above in world space: only on faces that face up (the geometry's
            // own normal, not the painted facets, so it never traces the strata), in broad patches with
            // a ragged edge, soil and grit speckled through it. Lush rock (uRockMoss) carries it over
            // most tops and down the rounded shoulders.
            const mossN = mixN(pos.xz.mul(0.19).add(vec2(0.13, 0.77)));
            const mossP = mixN(pos.xz.mul(0.035).add(vec2(0.52, 0.31)));
            const edgeN = mixN(pos.xz.mul(0.6).add(vec2(0.21, 0.44))).toVar();
            const rm = u.f('uRockMoss');
            const mossUp = mix(0.78, 0.5, rm), mossCut = mix(0.6, 0.36, rm);
            const mossK = smoothstep(mossUp, mossUp.add(0.17), gn.y).mul(smoothstep(mossCut, mossCut.add(0.12), mossP.add(edgeN.sub(0.5).mul(0.22)))).mul(rockK);
            const mossC = mix(mix(vec3(0.13, 0.2, 0.07), vec3(0.21, 0.3, 0.1), mossN), vec3(0.24, 0.2, 0.15), smoothstep(0.62, 0.8, edgeN).mul(0.6));
            c.assign(mix(c, mossC, mossK.mul(0.8)));
          });
          if (cave && topShade < 1) {
            // Cave walls' terrace risers: dark in the crease at their foot, catching light on the lip
            // at their top, so each terrace reads as a slab of rock standing on the one below.
            const steepF = smoothstep(0.3, 0.65, float(1).sub(abs(gn.y))).mul(smoothstep(0.5, 1.1, pos.y));
            const tf = pos.y.div(CAVE_TERRACE).fract();
            c.mulAssign(mix(1, mix(0.62, 1.1, smoothstep(0.02, 0.8, tf)), steepF));
          }
          if (topShade < 1) {
            // Rock falls away into darkness as it climbs (eased in caves, so the first ledges stay readable).
            const range = u.v2('uTopRange');
            const climb = smoothstep(range.x, range.y, pos.y);
            c.mulAssign(mix(1, u.f('uTopShade'), cave ? sqrt(climb) : climb));
          }
          if (wet) {
            // The drowned bed: absorbed toward the water colour with depth.
            const dW = waterY.sub(pos.y);
            c.assign(mix(c, c.mul(0.5).add(u.v3('uWaterTint').mul(0.35)), smoothstep(0.02, 0.5, dW)));
          }
          return c;
        },
        roughness: (r) => heightRoughness(r, surfH, alb),
        normal: laid || (cave && topShade < 1) ? (n) => {
          if (cave) {
            // Chiselled risers, calm tops: steep rock takes its flat face normal (hard-edged facets),
            // the ledge tops keep the smooth normal, so the mass reads as cut strata.
            const fn = normalize(cross(dFdx(positionView), dFdy(positionView)));
            const st = smoothstep(0.35, 0.7, float(1).sub(abs(normalize(nrm).y))).mul(smoothstep(0.5, 1.1, pos.y));
            return normalize(mix(n, fn, st.mul(0.85)));
          }
          // The paving stones' bevelled edges bend the normal where the ground lies flat.
          const paveK = smoothstep(0.97, 0.99, normalize(nrm).y).mul(gK.z);
          return normalize(n.sub(mat3(cameraViewMatrix).mul(vec3(paveGrad.x, 0, paveGrad.y)).mul(paveK)));
        } : undefined,
        emissive: wet || lava > 0 ? (e) => {
          let out = e;
          if (lava > 0) {
            // Lava pools in the floor rock's deepest fissures, pulsing slowly. Emissive, so it glows
            // regardless of lighting (and feeds bloom).
            const rockW = splat.w.div(max(dot(splat, vec4(1)), 0.001));
            const crev = smoothstep(0.34, 0.16, surfH).mul(rockW).mul(smoothstep(0.9, 0.97, normalize(nrm).y)).mul(float(1).sub(smoothstep(0.15, 0.5, pos.y)));
            const pulse = sin(pos.x.mul(0.7).add(pos.z.mul(0.5))).mul(0.25).add(0.75);
            out = out.add(vec3(1.0, 0.32, 0.06).mul(crev.mul(pulse).mul(2.2).mul(u.f('uLava'))));
          }
          if (wet) {
            // Caustics dance across the drowned bed (brightest in the shallows): two drifting ridged
            // layers multiplied, a fine web of light, like sun through ripples.
            const d = waterY.sub(pos.y).toVar();
            const sub = smoothstep(0.02, 0.14, d);
            const cp = pos.xz;
            const ca = mixN(cp.mul(0.62).add(vec2(time.mul(0.03), time.mul(0.011))));
            const cb = mixN(cp.mul(0.81).add(vec2(0.37, 0.61)).sub(vec2(time.mul(0.012), time.mul(0.027))));
            const caus = pow(float(1).sub(abs(ca.mul(2).sub(1))).mul(float(1).sub(abs(cb.mul(2).sub(1)))), 5);
            const shallow = float(1).sub(smoothstep(0.05, 0.4, d));
            out = out.add(vec3(0.7, 0.95, 0.88).mul(caus.mul(shallow).mul(sub).mul(0.3)));
          }
          return out;
        } : undefined,
      };
    },
  });
}
