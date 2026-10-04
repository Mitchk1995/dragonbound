import type { Game } from '../game';
import { GROWN_KINDS, TREE_STYLE, TREE_STYLES, treeSet, treeTriangles, type GrownKind, type TreeKind } from '../world/trees';
import { grownSuite } from './treeLineup/grown';
import { ladderSuite } from './treeLineup/ladder';
import { lineup, scout } from './treeLineup/lineup';
import { oakSuite } from './treeLineup/oak';
import { rootsSuite } from './treeLineup/roots';
import { zoneShot, type Shot } from './treeLineup/stage';

/**
 * Dev only (inspect suite `trees`): the trees of trees.ts in the real game renderer with game
 * lighting. Captures:
 * - a lineup of every canopy variant (green / pink blossom / autumn gold crowns, the pines, and the
 *   old faceted trees for reference) from the gameplay camera, and each tree close up from a low
 *   3/4 angle;
 * - tree-heavy views at the gameplay camera: the Foothills forest edge, deep forest and rim, the
 *   keep island's lawn and rim, the Sunken Ruin; the Foothills spots also with the faceted
 *   fallback, with frame time and triangle counts (report.json `trees`);
 * - the grown oak (style 'natural', see oakSuite): beside the hero and an old block tree, close
 *   up, by the castle in the keep zone and in a wood, with frame cost and draw counts
 *   (report.json `trees.oak`).
 * - a grown kind's progress (`trees:grown:<kind>`, see grownSuite): beside the hero and an oak on the
 *   lawn under the castle walls through the gameplay camera, and close up.
 * - the whole woodcutting ladder (`trees:ladder`, see ladderSuite): its six species in two shapes
 *   each, every new species close up, and a forest of the Foothills as it ships, with frame costs.
 * - the roots and crowns (`trees:roots`, see rootsSuite): every shape of every species low at its
 *   foot and from the side, and grown trees where the ground falls away round them.
 * `trees:oak` captures only the oak; `trees:scout` captures candidate spots instead (to pick the views).
 */

/** Hero spots for the zone views (picked with trees:scout). */
const VIEWS: { zone: string; label: string; x: number; z: number; zoom?: number }[] = [
  { zone: 'foothills', label: 'edge', x: 70.5, z: 154.5 },
  { zone: 'foothills', label: 'forest', x: 0, z: 0 },
  { zone: 'foothills', label: 'rim', x: 0, z: 0 },
  { zone: 'keep', label: 'lawn', x: 68.5, z: 80.5 },
  { zone: 'keep', label: 'rim', x: 0, z: 0 },
  { zone: 'ruin', label: 'grove', x: 0, z: 0 },
];

export async function treesSuite(g: Game, shot: Shot, opts: string[]) {
  const report: Record<string, unknown> = {};
  report.triangles = Object.fromEntries(TREE_STYLES.map((s) => [s, treeTriangles(s)]));
  report.variants = Object.fromEntries((['grove', 'pine'] as TreeKind[]).map((k) => [k, treeSet('block').canopy[k].length]));
  const shipped = TREE_STYLE.value;
  if (opts[0] === 'grown' && GROWN_KINDS.includes(opts[1] as GrownKind)) return { ...report, grown: await grownSuite(g, shot, opts[1] as GrownKind) };
  if (opts[0] === 'ladder') return { ...report, ladder: await ladderSuite(g, shot) };
  if (opts[0] === 'roots') return { ...report, roots: await rootsSuite(g, shot) };
  if (opts.includes('scout')) {
    await scout(g, shot);
    return report;
  }
  report.oak = await oakSuite(g, shot);
  if (opts.includes('oak')) return report;
  await lineup(g, shot);
  const frame: Record<string, unknown> = {};
  for (const v of VIEWS) {
    for (const style of v.zone === 'foothills' ? TREE_STYLES : [shipped]) {
      const name = `trees-${v.zone}-${v.label}${style === shipped ? '' : `-${style}`}`;
      frame[name] = await zoneShot(g, shot, v.zone, style, v, name, v.zone === 'foothills');
    }
  }
  report.frame = frame;
  TREE_STYLE.value = shipped;
  return report;
}
