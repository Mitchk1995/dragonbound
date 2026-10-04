import * as THREE from 'three';
import { CASTLE_PLAN } from '../../data/zoneMaps';
import type { Game } from '../../game';
import { Cell } from '../../world/layout';
import { grownTrees, grownTriangles, TREE_STYLE } from '../../world/trees';
import { OCCLUDE } from '../../world/worldView';
import { COLORS } from './lineup';
import { besideTree, CLOSE_DIR, frames, freeShot, gameplayCamera, hideEnemies, measure, openField, openGround, overlay, placeSun, plantTree, standHero, type Shot } from './stage';

/** Where the zone's grown oaks stand (their crowns' instances). */
function oaksInZone(g: Game) {
  const crowns = new Set(grownTrees('oak').canopy);
  const at: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  g.zone.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || !crowns.has(o.geometry)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      at.push(new THREE.Vector3().setFromMatrixPosition(m));
    }
  });
  return at;
}

/** Oak colour in the lineup and the staged shots: the grown oaks' first summer green. */
const OAK_GREEN = 0x4f8a3b;

/**
 * The grown oak (style 'natural'):
 * - trees-oak-lineup: its three seeded variants side by side in the Foothills meadow with the hero
 *   and one of the old block trees beside them, through the gameplay camera drawn back to fit;
 * - the keep zone grown in the natural style: trees-oak-landing, the hero beside an oak near the
 *   head of the castle climb through the gameplay camera; trees-oak-landing-view, the same place
 *   from the castle review's landing viewpoint (the picture Mitchell pinned the old trees on);
 * - one oak planted on open ground by the fields under the castle rock: trees-oak-farm through the
 *   gameplay camera, trees-oak-close from a low three-quarter angle with the castle beyond,
 *   trees-oak-close-hero nearer, at the hero's foot, and trees-oak-variants, each variant there;
 * - trees-oak-wood / trees-oak-wood-block: the thickest wood of oaks on the island through the
 *   gameplay camera, and the same spot with the block trees, each with its frame cost (and the
 *   landing's with the block trees too, for comparison).
 */
export async function oakSuite(g: Game, shot: Shot) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  out.triangles = grownTriangles('oak');
  g.debug.timeScale = 0;
  document.body.classList.add('inspect-clean');

  // The lineup, in an open stretch of the Foothills meadow.
  TREE_STYLE.value = 'block';
  g.travel('foothills', true);
  await frames(20);
  hideEnemies(g);
  g.zone.group.traverse((o) => {
    if (o.name === 'tree' || o.name === 'bush') o.visible = false;
  });
  const c = openField(g, 9), hAt = g.zone.view.heightAt;
  const stage = new THREE.Group();
  g.zone.group.add(stage);
  const oaks = [0, 1, 2].map((v) => plantTree(g, stage, 'oak', c.x + (v - 1) * 13.5, c.z - 2.5, v, 0.6 + v * 1.9, OAK_GREEN));
  const block = plantTree(g, stage, 'block', c.x + 22, c.z + 3, 0, 0.35, COLORS[0].color);
  standHero(g, c.x - 6.8, c.z + 3.2, 1.55);
  g.debug.hold = () => {
    OCCLUDE.uOccOn.value = 0;
    gameplayCamera(g, c.x + 1.5, hAt(c.x, c.z), c.z + 0.5, 1.55);
    return false;
  };
  await frames(3);
  const ov = overlay();
  const toScreen = (v: THREE.Vector3) => {
    const p = v.clone().project(g.camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  oaks.forEach((o, i) => {
    const sp = toScreen(o.pos.clone().add(new THREE.Vector3(0, 0, 7.5)));
    ov.label(`grown oak ${i + 1}`, sp.x - 40, sp.y);
  });
  const bs = toScreen(block.pos.clone().add(new THREE.Vector3(0, 0, 2.5)));
  ov.label('old block tree', bs.x - 45, bs.y);
  await shot('trees-oak-lineup');
  ov.el.remove();
  out.lineup = await measure(g);
  // The wind: the first oak close through the gameplay camera at two moments 1.4 s apart.
  for (const [name, t] of [['trees-oak-sway-a', 10], ['trees-oak-sway-b', 11.4]] as const) {
    g.debug.hold = () => {
      OCCLUDE.uOccOn.value = 0;
      g.zone.view.tick(t);
      gameplayCamera(g, oaks[0].pos.x, oaks[0].pos.y, oaks[0].pos.z + 1, 0.62);
      return false;
    };
    await shot(name);
  }
  g.debug.hold = null;
  stage.removeFromParent();

  // The keep zone grown in the natural style.
  TREE_STYLE.value = 'natural';
  for (const k of Object.keys(g.save.keep)) g.save.keep[k] = true;
  g.travel('keep', true);
  await frames(20);
  hideEnemies(g);
  const inKeep = oaksInZone(g);
  out.keepOaks = inKeep.length;
  const P = CASTLE_PLAN;
  /** The oak nearest (x, z) with open ground beside it on its own level, and that spot. */
  const oakNear = (x: number, z: number) => {
    for (const o of [...inKeep].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))) {
      const spot = besideTree(g, o);
      if (spot) return { o, spot };
    }
    return null;
  };
  // Beside an oak near the head of the climb, the castle beyond.
  const landing = oakNear(P.gate.x + 48, P.gate.z + 8);
  if (landing) {
    standHero(g, landing.spot.x, landing.spot.z);
    await frames(4);
    await shot('trees-oak-landing');
    out.landing = { oak: [landing.o.x, landing.o.z], hero: [landing.spot.x, landing.spot.z], ...(await measure(g)) };
  }
  const y0 = g.zone.groundY(P.fountain.x, P.fountain.z);
  g.player.obj.visible = false;
  await freeShot(g, shot, 'trees-oak-landing-view', new THREE.Vector3(P.gate.x + 72, y0 + 12, P.gate.z + 22), new THREE.Vector3(P.gate.x + 50, y0 + 2, P.gate.z + 6), 24);
  g.player.obj.visible = true;

  // One oak planted on open ground by the fields, under the castle rock.
  const field = openGround(g, P.gate.x + 10, P.gate.z + 20, 14, 7.5);
  if (field) {
    const staged = new THREE.Group();
    g.zone.group.add(staged);
    const planted = [0, 1, 2].map((v) => plantTree(g, staged, 'oak', field.x, field.z, v, 2.2, OAK_GREEN));
    const solo = (v: number) => planted.forEach((p, i) => p.meshes.forEach((mesh) => (mesh.visible = i === v)));
    solo(0);
    const oak = planted[0].pos, spot = besideTree(g, oak) ?? { x: oak.x - 6.5, z: oak.z };
    const foot = standHero(g, spot.x, spot.z);
    await frames(4);
    await shot('trees-oak-farm');
    out.farm = { oak: [oak.x, oak.z], hero: [spot.x, spot.z] };
    const look = oak.clone().add(new THREE.Vector3(0, 4.6, 0));
    await freeShot(g, shot, 'trees-oak-close', look.clone().addScaledVector(CLOSE_DIR, 24), look, 20);
    await freeShot(g, shot, 'trees-oak-close-hero', foot.clone().add(new THREE.Vector3(1.5, 1.8, 9)), oak.clone().add(new THREE.Vector3(-1, 3.6, 0)), 20);
    // Each variant there in turn, from the same angle, side by side in one picture.
    const cv = g.renderer.domElement, sheet = document.createElement('canvas');
    sheet.width = cv.width;
    sheet.height = cv.height;
    Object.assign(sheet.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '1999' });
    const ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#1c1a1e';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    g.player.obj.visible = false;
    for (let v = 0; v < planted.length; v++) {
      solo(v);
      let done = false;
      // (Copied out in the same frame it is drawn: the canvas is cleared once shown.)
      g.debug.hold = () => {
        if (done) return true;
        OCCLUDE.uOccOn.value = 0;
        g.camera.position.copy(look).addScaledVector(CLOSE_DIR, 25);
        g.camera.lookAt(look);
        placeSun(g, look.x, look.z);
        g.draw();
        const w = cv.width / 3, h = cv.height * 0.6, sw = cv.height * (w / h);
        ctx.drawImage(cv, (cv.width - sw) / 2, 0, sw, cv.height, v * w, cv.height * 0.2, w, h);
        done = true;
        return true;
      };
      await frames(3);
    }
    document.body.appendChild(sheet);
    const ov2 = overlay();
    planted.forEach((_, i) => ov2.label(`grown oak ${i + 1}`, (i * innerWidth) / 3 + 8, innerHeight * 0.2 + 8));
    await shot('trees-oak-variants');
    ov2.el.remove();
    sheet.remove();
    g.player.obj.visible = true;
    g.debug.hold = null;
    staged.removeFromParent();
  }

  // The thickest wood of oaks on the island (with land all round, not at the rim), then the same
  // spot with the block trees.
  const L = g.zone.layout;
  const landAround = (x: number, z: number) => {
    for (let dz = -16; dz <= 16; dz += 4) for (let dx = -20; dx <= 20; dx += 4) {
      const cx = Math.floor(x + dx), cz = Math.floor(z + dz);
      if (cx < 0 || cz < 0 || cx >= L.w || cz >= L.h || L.cells[cz * L.w + cx] === Cell.Void) return false;
    }
    return true;
  };
  const wood = inKeep.reduce((b, p) => {
    const n = inKeep.filter((q) => q.distanceTo(p) < 16).length;
    return n > b.n && landAround(p.x, p.z) ? { p, n } : b;
  }, { p: inKeep[0], n: 0 });
  const inWood = besideTree(g, wood.p, 3.5) ?? { x: wood.p.x + 3.5, z: wood.p.z };
  standHero(g, inWood.x, inWood.z);
  await frames(4);
  await shot('trees-oak-wood');
  out.wood = { at: [inWood.x, inWood.z], oaksWithin16m: wood.n, ...(await measure(g)) };
  TREE_STYLE.value = 'block';
  g.travel('keep', true);
  await frames(20);
  hideEnemies(g);
  standHero(g, inWood.x, inWood.z);
  await frames(4);
  await shot('trees-oak-wood-block');
  out.woodBlock = await measure(g);
  if (landing) {
    standHero(g, landing.spot.x, landing.spot.z);
    await frames(4);
    out.landingBlock = await measure(g);
  }

  document.body.classList.remove('inspect-clean');
  g.camZoom = 1;
  g.debug.timeScale = 1;
  TREE_STYLE.value = shipped;
  return out;
}
