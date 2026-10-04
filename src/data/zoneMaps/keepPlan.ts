import type { Vec2 } from '../../types';
import { Gen } from '../../world/gen';
import { Site } from '../../world/castle/site';

// The keep's plan: the portal arches, the hero's stage, the forge yard, the inspect views and the
// island's outline and levels.

export const KEEP_ARCHES: { id: string; angle: number; dormant?: string }[] = [
  { id: 'mine', angle: -150 },
  { id: 'foothills', angle: -126 },
  { id: 'ruin', angle: -102 },
  { id: 'lair', angle: -78 },
  { id: 'mirefen', angle: -54, dormant: 'Mirefen: Chapter 2' },
  { id: 'frostspire', angle: -30, dormant: 'Frostspire: Chapter 3' },
];

/** Open plaza spot in the keep used to stage the hero (character creation, pose tools). */
export const KEEP_STAGE: Vec2 = { x: 171, z: 189 };

/** Camera offsets from KEEP_STAGE used by character creation and the pose tools (x/z only). */
export const STAGE_CAMERAS: Vec2[] = [{ x: -1.4, z: 5.2 }, { x: 0, z: 4.2 }, { x: 4.2, z: 0 }, { x: -4.2, z: 0 }];

/**
 * The forge yard south of the smelter: the lean-to against its south wall (west of the door), the
 * hearth (the Emberforge) under it and the anvil out in front.
 */
export const FORGE = { canopy: { x: 135.2, z: 180.5 }, hearth: { x: 134.9, z: 180.1 }, anvil: { x: 135.4, z: 185.8 } };

/**
 * Inspect views of the island's districts and landmarks and the castle's yards (label, centre, zoom).
 * The harness frames each one through the gameplay camera.
 */
export const KEEP_VIEWS: { label: string; x: number; z: number; zoom: number }[] = [
  { label: 'court', x: 176, z: 178, zoom: 1.35 },
  { label: 'forge-yard', x: 140.6, z: 188, zoom: 1.05 },
  { label: 'anvil-close', x: 135.4, z: 187.2, zoom: 0.65 },
  { label: 'craft-quarter', x: 146, z: 176, zoom: 1.35 },
  { label: 'green', x: 146, z: 198, zoom: 1.15 },
  { label: 'stream-bridge', x: 123, z: 193, zoom: 1.0 },
  { label: 'farm', x: 68, z: 178, zoom: 1.35 },
  { label: 'falls-pool', x: 88, z: 167, zoom: 1.0 },
  { label: 'climb', x: 157.5, z: 167, zoom: 1.2 },
  { label: 'castle-gate', x: 86, z: 138.5, zoom: 1.35 },
  { label: 'castle-bailey', x: 86, z: 94.3, zoom: 1.6 },
  { label: 'castle-fountain', x: 86, z: 92, zoom: 0.9 },
  { label: 'castle-cour', x: 86, z: 72, zoom: 1.2 },
  { label: 'castle-terrace', x: 86, z: 55, zoom: 1.2 },
  { label: 'castle-stables', x: 52, z: 80, zoom: 1.1 },
  { label: 'castle-training', x: 127.6, z: 113.8, zoom: 1.2 },
  { label: 'orchard', x: 244, z: 124, zoom: 1.35 },
  { label: 'market-lane', x: 188, z: 202, zoom: 1.15 },
  { label: 'alchemy-pond', x: 126, z: 220, zoom: 1.2 },
  { label: 'memorial', x: 176.5, z: 229, zoom: 1.15 },
  { label: 'lookout', x: 179, z: 246, zoom: 1.0 },
  { label: 'upland', x: 218, z: 84, zoom: 1.35 },
  { label: 'east-shelf', x: 262, z: 170, zoom: 1.5 },
];

/**
 * The home island (docs/blueprints/home-island-v1): a torn fragment of land drifting in the Veil.
 * Fresh, angular tear faces run along the north and west and one unbridged fracture notch splits the
 * castle's crown from the north-east upland; the older south and east edges are weathered into
 * rounded lobes and headlands. The ground climbs in levels: the lowland round the portal court (0),
 * the east shelf (+3), the castle rock's shoulder (+5), the north-east upland (+7) and the crown
 * (+11), where the castle stands (src/world/castle/: castle v4, the great keep). Cliffs rise wherever
 * two levels meet, except where a road or a stair climbs between them. From the court, roads go:
 * - west along the ore lane to the foot of the castle's stair up the rock's south-east corner, then
 *   along the ledge under the castle's south wall to the gate terrace and the bridge to the gate;
 * - west to the smelter and its forge yard, the farm lane on past the green and over the stream to
 *   the fields, and the spring path up to the pool under the castle's fall;
 * - east to the bank and its side vault, and the east lane on to the orchard and the rune plot, with
 *   the upland lane climbing to the hatchery;
 * - south past the market stalls to the Quartermaster's shop, south-west to the alchemy lab by the
 *   pond, and south through the memorial garden to the lookout on the old south headland.
 * The east shelf, the north-east upland and the south-west terrace are kept open for later.
 */
export const ISLAND = {
  w: 322, h: 268,
  // The land's outline (clockwise from the north-west tear); t = fresh tear face, o = old weathered
  // edge. The north-west and north stand out far enough for the castle's crown and the rock round
  // its moat behind the keep.
  outline: [
    [13.2, 52.7, 't'], [11.9, 29.3, 't'], [14.5, 11.1, 't'], [39.2, 5.3, 't'], [60, 1.3, 't'], [86, 0.1, 't'], [112, 2, 't'], [122.4, 7.8, 't'],
    [140.6, 8.5, 't'], [158.8, 16.3, 't'], [166.6, 13.7, 't'], [170.5, 39.7, 't'], [174, 54, 't'], [177.5, 40, 't'], [176, 30, 't'], [192, 28, 't'],
    [212, 34, 't'], [230, 30, 't'], [248, 40, 't'], [262, 38, 'o'], [276, 58, 'o'], [288, 80, 'o'], [298, 104, 'o'], [304, 126, 'o'], [302, 144, 'o'],
    [308, 162, 'o'], [306, 182, 'o'], [296, 198, 'o'], [282, 206, 'o'], [274, 218, 'o'], [278, 232, 'o'], [266, 244, 'o'], [248, 246, 'o'],
    [230, 238, 'o'], [216, 240, 'o'], [202, 246, 'o'], [190, 254, 'o'], [180, 260, 'o'], [172, 254, 'o'], [166, 244, 'o'], [152, 240, 'o'],
    [138, 244, 'o'], [122, 238, 'o'], [100, 230, 'o'], [86, 224, 'o'], [72, 210, 'o'], [52, 204, 'o'], [36, 194, 't'], [24, 182, 't'], [16, 170, 't'],
    [11, 158, 't'], [13.2, 141.1, 't'], [5.4, 125.5, 't'], [10.6, 104.7, 't'], [2.8, 86.5, 't'], [13.2, 70.9, 't'],
  ] as [number, number, string][],
  // Ground levels below the crown, lowest first (each overrides what lies under it; the crown, its
  // edge drawn as the rock's own, is laid over them by the castle's ground).
  levels: [
    { h: 3, poly: [[232, 144], [288, 140], [296, 170], [282, 196], [240, 200], [232, 172]] },
    // (On the east the shoulder runs close under the crown and fans out unevenly, so its cliff and
    // the crown's merge into one broken massif instead of two parallel ribs.)
    {
      h: 5,
      poly: [[19.7, 60.5], [26.2, 34.5], [47, 21.5], [65.2, 11.1], [96.4, 9.8], [117.2, 15.7], [140.6, 13.7], [161.4, 24.1], [156.2, 42.3], [153, 55.3], [160.1, 65.7], [171.8, 76.1],
        [167.9, 86.5], [157.5, 94.3], [153, 104.7], [154.9, 117.7], [148.4, 130.7], [117.2, 141.1], [73, 141.1], [44.4, 138.5], [26.2, 130.7], [15.8, 117.7], [13.2, 86.5]],
    },
    // A knoll rising off that spur, higher than it and set at its own angle (the second outcrop).
    { h: 8, poly: [[149.7, 65.7], [157.5, 69.6], [164, 76.8], [159.5, 82.6], [149.7, 81.3]] },
    { h: 7, poly: [[182, 40], [212, 40], [246, 52], [258, 70], [252, 98], [226, 104], [196, 100], [182, 84]] },
  ],
  court: { x: 176, z: 175 },
  landing: { x: 176, z: 181 },
};

/** The field lane from the end of the farm road west between the vegetable plots to the hay paddock's gate. */
export const FIELD_LANE = [[91, 178.2], [60.6, 178.2], [58.4, 177.7], [57.2, 176.8]];
/** The round viewing bay at the end of the spring path, on the pool's south-west bank. */
export const POOL_BAY = { x: 80.6, z: 165.6 };
/** Where the spring path comes into the viewing bay. */
export const BAY_PATH = { x: 82.6, z: 167.6 };

/** What every stage of the keep's build works on: the generator, its ground levels and the castle's site. */
export interface KeepBuild {
  G: Gen;
  level: Float32Array;
  site: Site;
  w: number;
  h: number;
}
