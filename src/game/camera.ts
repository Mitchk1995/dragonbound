import type { Game } from '../game';
import { OCCLUDE } from '../world/worldView';

/** The play camera: eases after the hero at the chosen zoom, shakes on impacts, and fades what hides them. */
export function followCamera(g: Game, dt: number) {
  const p = g.player.pos, cam = g.camera;
  g.camPos.lerp(p, 1 - Math.exp(-dt * 8));
  const z = g.camZoom;
  cam.position.set(g.camPos.x, g.camPos.y + 21 * z, g.camPos.z + 14 * z);
  if (g.shakeT > 0) {
    g.shakeT -= dt;
    const m = g.shakeMag * Math.min(1, g.shakeT * 4);
    cam.position.x += (Math.random() - 0.5) * m;
    cam.position.y += (Math.random() - 0.5) * m;
    cam.position.z += (Math.random() - 0.5) * m;
  }
  cam.lookAt(g.camPos.x, g.camPos.y + 1, g.camPos.z);
  OCCLUDE.uOccOn.value = 1;
  OCCLUDE.uOccPlayer.value.copy(p);
  OCCLUDE.uOccCam.value.copy(cam.position);
}
