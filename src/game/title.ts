import * as THREE from 'three';
import type { Game } from '../game';
import { Rig, newAnimState } from '../render/anim';
import { makeModel } from '../render/registry';
import { disposeObject } from '../render/resources';
import { OCCLUDE } from '../world/worldView';

/** The title screen's slow orbit over the island with Cinderwing circling, and the creation preview's camera. */
export class TitleScene {
  private dragon: { obj: THREE.Group; rig: Rig; anim: ReturnType<typeof newAnimState> } | null = null;

  constructor(private readonly g: Game) {}

  buildDragon() {
    const m = makeModel('cinderwing');
    const obj = new THREE.Group();
    obj.add(m.root);
    const anim = newAnimState();
    anim.fly = 1;
    anim.speed = 3;
    this.g.scene.add(obj);
    this.dragon = { obj, rig: new Rig(m.root), anim };
  }

  /** Play begins: the title dragon goes. */
  dispose() {
    if (this.dragon) disposeObject(this.dragon.obj);
    this.dragon = null;
  }

  update(dt: number) {
    const g = this.g;
    if (g.mode === 'create') {
      const p = g.player;
      p.obj.rotation.y = g.previewYaw + Math.sin(g.time * 0.4) * 0.15;
      p.anim.speed = 0;
      p.rig.update(dt, p.anim);
      // Frame the hero right of centre so the creation panel doesn't cover them
      // (debug pose checks centre them instead).
      const off = g.debug.poseView ? 0 : -1.4;
      g.camera.position.set(p.x + off, 2.2, p.z + 5.2);
      g.camera.lookAt(p.x + off, 1.15, p.z);
      OCCLUDE.uOccOn.value = 0;
      for (const f of g.zone.view.followers) f.position.set(p.x, 0, p.z);
      return;
    }
    const L = g.zone.layout;
    const cx = L.w / 2, cz = L.h / 2;
    const t = g.time * 0.05;
    // A slow, high orbit that frames the whole island (about 130 cells across): the inner keep,
    // the districts and the rim all in view, with the fog pushed back so the far side stays clear.
    const R = L.w * 0.62;
    g.camera.position.set(cx + Math.cos(t) * R, L.w * 0.3, cz + Math.sin(t) * R);
    g.camera.lookAt(cx, 0, cz);
    const fog = g.scene.fog as THREE.Fog;
    fog.near = R * 0.9;
    fog.far = R * 3.6;
    OCCLUDE.uOccOn.value = 0;
    const d = this.dragon;
    if (d) {
      const a = g.time * 0.16;
      const r = L.w * 0.44;
      d.obj.position.set(cx + Math.cos(a) * r, 14 + Math.sin(a * 2) * 4, cz + Math.sin(a) * r);
      // Orbiting counter-clockwise: velocity is (-sin a, cos a), so heading = atan2(-sin a, cos a) = -a.
      d.obj.rotation.y = -a;
      d.rig.update(dt, d.anim);
    }
    for (const f of g.zone.view.followers) f.position.set(cx, 0, cz);
  }
}
