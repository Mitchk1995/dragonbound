/**
 * Grown trees' surfaces (treeGrowth.ts): painted leaf atlases, sourced bark, and the bark and leaf
 * materials that use them, both swaying in the wind.
 *
 * - Leaves: each leaf kind has its own atlas of nine sprays, alpha-cut. The oak's and the common
 *   tree's are painted at startup (oak: lobed leaves in rosettes at the ends of short shoots; oval: a
 *   common broadleaf's leaves set alternately along its shoots); the willow's, maple's, yew's and
 *   magic tree's are sourced (public/textures/leaves/, made by tools/bark_textures.py), each its
 *   sourced spray turned and toned a little differently in every cell. Each leaf takes its own tone between a deep
 *   blue-green and a warm light green, is lit on one half of its midrib, darker at its stalk, with a
 *   pale midrib and a soft shadow on the leaves under it. The colours are multipliers (the instance
 *   colour gives the tree its green or gold), and the mipmaps keep the leaves' coverage, so a crown
 *   never thins out at a distance.
 * - Bark: a sourced, tileable bark for each kind (public/textures/bark/), its colour and its relief,
 *   wrapped round every limb (see grownBark).
 *
 * This is the entry point; the work is split over foliage/.
 */

export { LEAF_ATLAS, oakLeafHalfWidth, ovalLeafHalfWidth, paintLeafAtlas, SOURCED_LEAVES, SPRAY_CELLS, sprayCell, type LeafKind, type PaintedLeaf, type SourcedLeaf } from './foliage/leafPaint';
export { BARK_KINDS, coverageMips, leafAtlas, preloadTreeTextures, type BarkKind } from './foliage/textures';
export { grownBark, grownLeaves, type BarkLook, type WindClock } from './foliage/materials';
