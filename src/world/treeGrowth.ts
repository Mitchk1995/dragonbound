/**
 * Grown trees (the 'natural' tree style, trees.ts): a tree is grown from a seed, never assembled
 * from primitives. This is the entry point; the work is split over treeGrowth/.
 *
 * - Growth (pure and seeded): a crown envelope (an irregular dome), a trunk rising through it as
 *   its leader, a few crooked main limbs leaving the trunk low, many side branches reaching out to
 *   the envelope (with a pass that grows a branch into any part of the dome left bare, and none
 *   left reaching out bare to a lone tuft), roots swelling out of the trunk's foot and running down
 *   into the ground, and radii by the pipe model: a limb is as thick as the leaf sprays it carries,
 *   so the wood tapers naturally from the trunk to every tip.
 * - Wood: every limb is a ring-section tube along its smoothed centreline. Where a branch leaves
 *   its parent, the parent's quads under the branch are cut out and the branch's first ring is
 *   stitched to the rim of that hole, so each fork is a real collar flowing out of the parent; the
 *   trunk's foot is rings of its own with the roots' ridges standing out of them. The trunk, roots,
 *   limbs and branches are one connected surface.
 * - Leaves: two crossed cards per spray (now and then a third), set facing the sky and the outside
 *   of the crown, each carrying a spray of the species' leaves (foliage.ts) whose twig springs from
 *   the branch; none hang low enough to brush the hero's head. A weeping tree (the willow) also
 *   lets fall strands from its outer branches: chains of cards hanging plumb to a hem, each strand
 *   swaying as one from its top. Their normals swell out of each
 *   branch's leaf mass and out of the crown, so it lights in soft masses, and their vertex colour
 *   carries a painted shade: a darker inner crown, a cool underside and a warm top.
 */

export { MAGIC, MAPLE, OAK, TREE, WILLOW, YEW, type Species } from './treeGrowth/species';
export { crownDepth, crownNormal, type Crown } from './treeGrowth/crown';
export type { Joint, Limb, Root, Skeleton, Spray } from './treeGrowth/skeleton';
export { growTree } from './treeGrowth/grow';
export { woodGeometry } from './treeGrowth/wood';
export { leafGeometry } from './treeGrowth/leaves';
