import * as THREE from 'three';
import type { Game } from '../game';
import { LIGHT_BALANCE, zoneLighting, type ZoneLighting } from '../render/env';
import { fitSunShadow, SUN_DIR } from '../render/light';
import { SKY_LIGHT } from '../render/sky';

/**
 * How far the sun's shadows reach: at least this near (the play camera sees less), at most this far
 * (a view over the whole island leaves the far side to the haze).
 */
const SHADOW_REACH = [80, 160] as const;

/** The zone's light (the sun, the sky and bounce light, the fill, the sky dome), fitted to the view. */
export class ViewLight {
  /** The zone's lights (relight), before the indoor softening. */
  private lit: ZoneLighting | null = null;
  private readonly lookDir = new THREE.Vector3();
  private readonly fillFrom = new THREE.Vector3(-18, 14, -6);

  constructor(private readonly g: Game) {}

  /** Light the scene for the current zone's theme. */
  relight() {
    const g = this.g, t = g.zone.def.theme, lit = zoneLighting(t);
    this.lit = lit;
    g.sun.color.copy(lit.key);
    g.sun.intensity = lit.keyIntensity;
    g.hemi.color.copy(lit.sky);
    g.hemi.groundColor.copy(lit.ground);
    g.hemi.intensity = lit.hemiIntensity;
    g.fill.color.copy(lit.fill);
    g.fill.intensity = lit.fillIntensity;
    g.renderer.toneMappingExposure = t.exposure * LIGHT_BALANCE.exposure;
    SKY_LIGHT.uSunDir.value.copy(SUN_DIR);
    SKY_LIGHT.uSunCol.value.copy(lit.key);
    SKY_LIGHT.uHaze.value.setHex(t.bg);
  }

  /**
   * Light the current view: the sun's shadows fitted to everything the camera sees (the play
   * camera, the title's orbit or a free camera alike), the cool fill from the side away from it.
   */
  fit() {
    const g = this.g, cam = g.camera, d = cam.getWorldDirection(this.lookDir);
    // The ground under the middle of the view (a couple of steps onto the terrain).
    let y = g.player.pos.y, x = cam.position.x, z = cam.position.z;
    for (let i = 0; i < 2 && d.y < -0.05; i++) {
      const t = (y - cam.position.y) / d.y;
      x = cam.position.x + d.x * t;
      z = cam.position.z + d.z * t;
      const h = g.zoneOrNull?.view.heightAt(x, z);
      if (h !== undefined && Number.isFinite(h)) y = h;
    }
    const dist = Math.hypot(x - cam.position.x, y - cam.position.y, z - cam.position.z);
    const fog = g.scene.fog as THREE.Fog | null;
    const [near, far] = SHADOW_REACH;
    const reach = Math.min(fog ? fog.far : Infinity, THREE.MathUtils.clamp(dist * 1.6, near, far));
    fitSunShadow(g.sun, cam, SUN_DIR, y, reach);
    g.fill.position.copy(g.sun.target.position).add(this.fillFrom);
    // Inside a building (its roof lifted for the camera) the light is the room's: the sun falls
    // in softly and the sky light, as through its windows, fills it evenly.
    const lit = this.lit;
    if (lit) {
      const k = g.zoneOrNull?.indoors ?? 0;
      g.sun.intensity = lit.keyIntensity * (1 - 0.65 * k);
      g.hemi.intensity = lit.hemiIntensity * (1 + 0.8 * k);
    }
  }
}
