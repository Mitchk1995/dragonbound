import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraProjectionMatrix, dot, float, floor, Fn, fract, length, mix, mod, modelViewMatrix, modelWorldMatrix, positionGeometry, pow, sin, texture, time, uv, vec2, vec3, vec4 } from 'three/tsl';
import type { F, V4 } from '../render/patch';
import { shareResource } from '../render/resources';
import { PAGES, SHEETS, type SheetId } from './sheets';
import { pageTexture } from './textures';

/**
 * Fires burning in the world (torches, braziers, campfires, hearths, the forge): a painted flame flipbook on a card
 * that always faces the camera and stands on its point, looping at 16 frames a second with each frame blended into
 * the next. Every fire starts its loop at a place of its own (from where it stands), so no two flicker together. One
 * shared card and material per size (a torch's narrow flame, a fire's broad one): a fire costs one small draw, and
 * nothing on the CPU (the loop runs on the renderer's clock).
 */

/** The card's height for a flame of scale 1 (the painted flame fills the lower part of its cell). */
const CARD = 1.25;
const FPS = 16;
/** How much nearer the camera a flame of scale 1 is drawn (world units). */
const PULL = 0.45;

/** Light added; hottest at the heart. */
function fireMaterial(sheetId: SheetId) {
  const sheet = SHEETS[sheetId], page = PAGES[sheet.page], map = pageTexture(sheet.page), grid = float(page.grid);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  // (Each fire's own phase, from where it stands.)
  const phase = Fn(() => {
    const at = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xz;
    return fract(sin(dot(at, vec2(12.9898, 78.233))).mul(43758.5453));
  });
  m.vertexNode = Fn(() => {
    // Facing the camera from the fire's foot, as tall as the fire's scale (its world scale, parents and all). The
    // foot is drawn a little nearer the camera along its own line of sight (so on the same spot of the screen), so
    // a flame stands in front of the lip of its bowl, hearth or oven mouth rather than inside it.
    const scale = length(modelWorldMatrix.mul(vec4(1, 0, 0, 0)).xyz).toVar();
    const at = modelViewMatrix.mul(vec4(0, 0, 0, 1)).xyz.toVar();
    const foot = at.mul(float(1).sub(scale.mul(PULL).div(length(at))));
    const off = vec2(positionGeometry.x.mul(0.8), positionGeometry.y.add(0.5)).mul(scale.mul(CARD));
    return cameraProjectionMatrix.mul(vec4(foot.xy.add(off), foot.z, 1));
  })();
  m.colorNode = Fn(() => {
    const fi = mod(time.mul(FPS).add(phase().mul(sheet.frames)), sheet.frames).toVar();
    const f0 = floor(fi).toVar();
    const f1 = mod(f0.add(1), sheet.frames);
    const inCell = vec2(uv().x.mul(0.8).add(0.1), float(1).sub(uv().y));
    const at = (f: F) => vec2(float(sheet.col).add(mod(f, 4)), float(sheet.row).add(floor(f.div(4)))).add(inCell).div(grid);
    const paint = mix(texture(map, at(f0)), texture(map, at(f1)), fi.sub(f0)) as V4;
    return vec4(paint.rgb.mul(1.15).add(pow(paint.rgb, vec3(3)).mul(0.9)), 0);
  })();
  m.name = `fire-${sheetId}`;
  return shareResource(m);
}

let card: THREE.PlaneGeometry | null = null;
const materials = new Map<SheetId, MeshBasicNodeMaterial>();

/**
 * A fire's flame at (x, y, z) of `parent`, `s` its scale (1: a hearth's; a torch's is about 0.6). Broad fires (s ≥ 1)
 * burn the bonfire's flames, smaller ones the torch's. Named 'flame': an effect, never merged or audited as a solid.
 */
export function fireCard(parent: THREE.Object3D, x: number, y: number, z: number, s: number) {
  if (!card) {
    card = shareResource(new THREE.PlaneGeometry(1, 1));
    // (The card turns to face the camera from its foot: its bounds are a ball round all it can cover.)
    card.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CARD / 2, 0), CARD * 0.75);
  }
  const sheet: SheetId = s >= 1 ? 'bonfire' : 'torch';
  let mat = materials.get(sheet);
  if (!mat) materials.set(sheet, (mat = fireMaterial(sheet)));
  const mesh = new THREE.Mesh(card, mat);
  mesh.name = 'flame';
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(s);
  mesh.renderOrder = 21;
  parent.add(mesh);
  return mesh;
}
