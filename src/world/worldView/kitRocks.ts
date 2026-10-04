import * as THREE from 'three';
import type { ZoneTheme } from '../../data/zones';
import { Ground } from '../layout';
import { hash01, MOSS_TALL, ROCK_MASSES, rockBlock, rockMass, rockMassMoss, slabBlock } from '../../render/blocks';
import { useStrataRock } from '../../render/rock';
import { applyHeightShade } from '../../render/surface';
import { applyKitRock, type RockLook } from '../../render/rockMaterial';
import { ROCK_KIT, rockGeometry, rockKitReady, type RockName } from '../../render/rockModels';
import { shareResource } from '../../render/resources';
import type { Scatter, Scene } from './scene';

/**
 * The rock kit in the world (render/rockModels.ts): every zone's scattered rock (boulders, scree and rubble, lava
 * rims, the cave walls' stacked slabs and the great masses along its cliffs) is drawn from the kit, each rock picked
 * from its class by where it lies, so no two neighbours repeat. The castle's island keeps its own rock as it stands
 * (the castle is to be rebuilt), and so does any world built before the kit has loaded.
 */
export const usesKit = (theme: ZoneTheme) => theme.wall !== 'castle' && !ROCK_STYLE.blocks && rockKitReady();

/** Dev only: worlds built while `blocks` is set keep the old block rocks everywhere (the inspect suite's before and after). */
export const ROCK_STYLE = { blocks: false };

/**
 * The rock masses seatMass stands against the cliffs (each where its height fits: broad low shoulders, rounded masses,
 * leaning knuckles, tall masses and a spire). The cliff modules are kept for building heights in later areas.
 */
export const KIT_MASSES: RockName[] = [...ROCK_KIT.mass];

const fitted = new Map<string, THREE.BufferGeometry>();

/**
 * A kit rock scaled to the size the old block rock of its place had (`size`: its width, height and depth; null
 * keeps the rock's own proportions with its widest side `width`), centred, its foot at y = 0 or `sink` below it, so
 * every placement keeps its sizes.
 */
export function kitGeo(name: RockName, size: [number, number, number] | null, width = 1, sink = 0) {
  const key = `${name}:${size ?? width}:${sink}`;
  let geo = fitted.get(key);
  if (geo) return geo;
  const src = rockGeometry(name)!;
  const b = src.boundingBox!, d = b.getSize(new THREE.Vector3());
  const k = size ? [size[0] / d.x, size[1] / d.y, size[2] / d.z] : Array(3).fill(width / Math.max(d.x, d.z));
  geo = src.clone().translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(k[0], k[1], k[2]).translate(0, -sink, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  fitted.set(key, shareResource(geo));
  return geo;
}

/** How far a kit mass's flared foot is sunk into the ground it stands on, as a share of its standing height. */
const MASS_SINK = 0.2;

/**
 * A kit mass at the old masses' unit size (seatMass scales it to its place): its crown 1 above the ground, its flared
 * foot sunk below it (so it rises out of the ground, and seats as close under a ledge as the block masses' steep sides
 * did), and as broad as the old block masses stood within their unit footprint (their jittered, squashed rings filled
 * about this much of it).
 */
export const kitMass = (v: number) => kitGeo(KIT_MASSES[v], [0.9, 1 + MASS_SINK, 0.8], 1, MASS_SINK);

/**
 * How tall a place a kit mass stands at in its own proportions, as seatMass measures a place (its height over its
 * width scale, `T / (W * sqrt(dr))`): fitted to the unit size, a mass is drawn in to 0.9 by 0.8 across and a share of
 * its height is sunk.
 */
const talls = new Map<RockName, number>();
export function kitMassTall(name: RockName) {
  let t = talls.get(name);
  if (t === undefined) {
    const s = rockGeometry(name)!.boundingBox!.getSize(new THREE.Vector3());
    talls.set(name, (t = ((s.y / Math.sqrt(s.x * s.z)) * Math.sqrt(0.9 * 0.8)) / (1 + MASS_SINK)));
  }
  return t;
}

/**
 * The kit masses (their indices in KIT_MASSES) that stand nearest their own proportions in a place `tall` high for its
 * width, the nearest first: the three nearest (seatMass picks one at random, so the faces vary along a cliff, and tries
 * the others where its first will not fit).
 */
export function kitMassPool(tall: number) {
  return KIT_MASSES.map((n, i) => ({ i, d: Math.abs(Math.log(kitMassTall(n) / tall)) })).sort((a, b) => a.d - b.d).slice(0, 3).map((c) => c.i);
}

/** How the zone's rock is painted: moss as its ground allows (none in caves or by lava), in its grass's green. */
export function rockLook(theme: ZoneTheme): RockLook {
  const grass = theme.ground[Ground.Grass] ?? [0x5a7a3a, 0x6a8a44];
  const mossColor = new THREE.Color(grass[0]).lerp(new THREE.Color(0x6a8a34), 0.45);
  const moss = theme.lava || theme.wallRise ? 0 : theme.wall === 'ruin' ? 0.65 : theme.mesaTop !== undefined ? 0.5 : 0.3;
  return { moss, mossColor };
}

/** Split instances among a class's rocks by where each stands (the same rock every visit, no pattern along a row). */
function byVariant(names: readonly RockName[], mats: THREE.Matrix4[], cols: THREE.Color[] | null) {
  const out = names.map(() => ({ m: [] as THREE.Matrix4[], c: [] as THREE.Color[] }));
  const at = new THREE.Vector3();
  mats.forEach((mm, i) => {
    at.setFromMatrixPosition(mm);
    const v = Math.floor(hash01(at.x, at.z, 77) * names.length) % names.length;
    out[v].m.push(mm);
    if (cols) out[v].c.push(cols[i]);
  });
  return out;
}

/** Draw the zone's scattered rock: the kit's, or round the castle the block rocks it stands on. */
export function drawRocks(scene: Scene, sets: Scatter) {
  if (usesKit(scene.theme)) drawKitRocks(scene, sets);
  else drawBlockRocks(scene, sets);
}

/** Rock lying on the land (the geometry audit checks none of it rises through a walk or the masonry). */
const rocky = (made: THREE.InstancedMesh[] | undefined) => made?.forEach((m) => (m.userData.rock = true));

/** The zone's scattered rock from the kit. */
function drawKitRocks(scene: Scene, sets: Scatter) {
  const { theme, inst } = scene;
  const { rocks, rockCols, rims, rimCols, strata, strataCols, mass, massCols, debris, debrisCols, rockMasses, rockMassCols } = sets;
  const look = rockLook(theme);
  // (Each kind fades out of the way of the camera and casts shadows as its block rock did.)
  const draw = (names: readonly RockName[], size: [number, number, number] | null, width: number, mats: THREE.Matrix4[], cols: THREE.Color[], occlude: boolean, shadow: boolean, cave = false) =>
    byVariant(names, mats, cols).flatMap(({ m, c }, i) => inst(kitGeo(names[i], size, width), m, c, 0, occlude, undefined, shadow, undefined, (mat) => {
      applyKitRock(mat, names[i], look);
      // Cave slabs fade into the dark with height like the rock mass behind them.
      if (cave && theme.wallRise) applyHeightShade(mat, theme.topShade ?? 1, ...(theme.topRange ?? [2.5, 12]));
    }) ?? []);
  // Boulders keep the old blocks' size (about 1.2 across); scree and rubble a unit stone; lava rims angular blocks.
  rocky(draw(ROCK_KIT.boulder, null, 1.2, rocks, rockCols, true, true));
  draw(['boulder_c', 'boulder_d'], null, 1.1, rims, rimCols, false, true);
  rocky(draw(ROCK_KIT.stone, null, 1, debris, debrisCols, false, false));
  // The cave walls' slabs: a unit footprint from the floor up (as the stacked strata are laid).
  draw(ROCK_KIT.slab, [1, 1, 1], 1, strata, strataCols, true, true, true);
  draw(ROCK_KIT.slab, [1, 1, 1], 1, mass, massCols, true, false, true);
  // The masses along the cliffs, by the variant seatMass chose.
  KIT_MASSES.forEach((name, v) => rocky(inst(kitMass(v), rockMasses[v], rockMassCols[v], 0, true, undefined, true, undefined, (mat) => applyKitRock(mat, name, look))));
}

/** The block rocks (chunky faceted hulls, two shapes alternating, sunk into the ground): the castle island's. */
function drawBlockRocks(scene: Scene, sets: Scatter) {
  const { theme, inst, ts } = scene;
  const { rocks, rockCols, rims, rimCols, strata, strataCols, debris, debrisCols, mass, massCols, rockMasses, rockMassCols, mossMats, mossCols } = sets;
  const half = <T>(list: T[], odd: number) => list.filter((_, i) => i % 2 === odd);
  rocky(inst(rockBlock(7, 1.25, 1.0, 1.1), half(rocks, 0), half(rockCols, 0), 0, true, 'rock'));
  rocky(inst(rockBlock(8, 1.1, 1.05, 1.2), half(rocks, 1), half(rockCols, 1), 0, true, 'rock'));
  inst(rockBlock(9, 1.1, 1.0, 1.0), rims, rimCols, 0, false, 'rock');
  // Cave slabs fade into the dark with height exactly like the rock mass behind them.
  const caveShade = (mat: THREE.MeshStandardMaterial) => {
    if (!theme.wallRise) return;
    applyHeightShade(mat, theme.topShade ?? 1, ...(theme.topRange ?? [2.5, 12]));
    useStrataRock(mat);
  };
  inst(slabBlock(31), half(strata, 0), half(strataCols, 0), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(32), half(strata, 1), half(strataCols, 1), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(34), half(mass, 0), half(massCols, 0), 0, true, 'rock', false, undefined, caveShade);
  inst(slabBlock(35), half(mass, 1), half(massCols, 1), 0, true, 'rock', false, undefined, caveShade);
  rocky(inst(rockBlock(33, 1, 0.8, 1), debris, debrisCols, 0, false, 'rock', false));
  for (let v = 0; v < ROCK_MASSES; v++) {
    rocky(inst(rockMass(v), rockMasses[v], rockMassCols[v], 0, true, 'rock'));
    MOSS_TALL.forEach((tall, tb) => rocky(inst(rockMassMoss(v, tall), mossMats[v][tb], mossCols[v][tb], 0, true, ts.paint.grove, false)));
  }
}
