import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { ZoneTheme } from '../data/zones';
import { glimpseFor } from './portalGlimpse';
import type { PortalLook } from './portalScene';
import { additive, HALO, mote, POOL, PORTAL_H, PORTAL_W, windowNode } from './portalShaders';
import { buildTitle } from './portalTitle';

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
 *
 * The parts: the destination glimpses (portalGlimpse.ts), the landscape painted through the window
 * (portalScene.ts), the window, floor glow and mote shaders (portalShaders.ts) and the floating
 * title (portalTitle.ts); here the facing and the assembly.
 */

export { glimpseFor, GLIMPSES, GlimpseStyle, type Glimpse } from './portalGlimpse';
export { titleLines, type TitleInk } from './portalTitle';

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

const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpFoot = new THREE.Vector3(), tmpCam = new THREE.Vector3();

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
