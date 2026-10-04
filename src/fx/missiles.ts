import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraProjectionMatrix, float, floor, Fn, mix, mod, modelViewMatrix, normalize, positionGeometry, pow, texture, time, uv, vec2, vec3, vec4 } from 'three/tsl';
import { PAL } from '../render/kit';
import type { F, V4 } from '../render/patch';
import { shareResource } from '../render/resources';
import { PAGES, SHEETS, type SheetId } from './sheets';
import { pageTexture } from './textures';

/**
 * What a spell looks like in flight: a painted flipbook on a card facing the camera and laid along its flight on
 * screen (the missile's own forward, +z), looping. The fireball is a ball of fire trailing its flames; the arcane
 * bolt a crackling orb of blue lightning; Cinderwing's meteor a great ball of fire falling. Shared by every missile
 * of a kind.
 */

export type MissileKind = 'fireball' | 'bolt' | 'meteor';

const LOOKS: Record<MissileKind, { sheet: SheetId; length: number; width: number; fps: number; tint: number; gain: number; ahead: number }> = {
  // The painted ball sits at the card's front, its flames trailing behind it.
  fireball: { sheet: 'fireball', length: 1.7, width: 1.0, fps: 20, tint: 0xffffff, gain: 1.3, ahead: 0.28 },
  bolt: { sheet: 'electric', length: 1.0, width: 1.0, fps: 18, tint: PAL.arcane, gain: 1.6, ahead: 0 },
  meteor: { sheet: 'fireball', length: 3.4, width: 2.0, fps: 16, tint: 0xffd8b0, gain: 1.2, ahead: 0.3 },
};

function missileMaterial(kind: MissileKind) {
  const look = LOOKS[kind], sheet = SHEETS[look.sheet], map = pageTexture(sheet.page), grid = float(PAGES[sheet.page].grid);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  m.vertexNode = Fn(() => {
    const at = modelViewMatrix.mul(vec4(0, 0, 0, 1));
    // Along its flight on screen (straight at the camera, any way serves).
    const fwd = modelViewMatrix.mul(vec4(0, 0, 1, 0)).xy;
    const dir = normalize(fwd.add(vec2(1e-4, 0)));
    const side = vec2(dir.y.negate(), dir.x);
    const p = positionGeometry;
    const off = dir.mul(p.x.sub(look.ahead).mul(look.length)).add(side.mul(p.y.mul(look.width)));
    return cameraProjectionMatrix.mul(vec4(at.xy.add(off), at.z, 1));
  })();
  const tint = new THREE.Color(look.tint).multiplyScalar(look.gain);
  m.colorNode = Fn(() => {
    const fi = mod(time.mul(look.fps), sheet.frames).toVar();
    const f0 = floor(fi).toVar();
    const f1 = mod(f0.add(1), sheet.frames);
    const inCell = vec2(uv().x, float(1).sub(uv().y));
    const cell = (f: F) => vec2(float(sheet.col).add(mod(f, 4)), float(sheet.row).add(floor(f.div(4)))).add(inCell).div(grid);
    const paint = mix(texture(map, cell(f0)), texture(map, cell(f1)), fi.sub(f0)) as V4;
    return vec4(paint.rgb.mul(vec3(tint.r, tint.g, tint.b)).add(pow(paint.rgb, vec3(3)).mul(1.2)), 0);
  })();
  m.name = `missile-${kind}`;
  return shareResource(m);
}

const looks = new Map<MissileKind, { geometry: THREE.BufferGeometry; material: THREE.Material }>();

/** A missile kind's card and material (shared): make its mesh from them, turned so +z runs along its flight. */
export function missileLook(kind: MissileKind) {
  let look = looks.get(kind);
  if (!look) {
    const geometry = shareResource(new THREE.PlaneGeometry(1, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(LOOKS[kind].length, LOOKS[kind].width));
    looks.set(kind, (look = { geometry, material: missileMaterial(kind) }));
  }
  return look;
}
