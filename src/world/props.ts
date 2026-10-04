/**
 * The world's props, built in code (props/): every importer reads them from here.
 *
 * - core: the Prop and Builder shapes and the shared blocks (chamfered boxes, rock chunks, block walls, flames, lights);
 * - palette: the props' colours and the painted pattern each takes;
 * - pieces, plants: small parts several families share (ground discs and foam, bone piles; garden plants);
 * - portal, oreRock: the portal platform and the ore rocks, built by their own functions;
 * - landmarks, town, keep, den, cave, ruins, dungeon: the prop families, each a table of builders by kind;
 * - finish: merging a built prop's static meshes, its painted finish and the geometry audit's record;
 * - build: buildProp and the list of kinds;
 * - legacyCastle*: the castle's and the buildings' arches, doors, windows, cloth and trim, to be replaced
 *   by the modular kit (src/world/kit) and deleted with the old building code.
 */
export { type Prop, cb, spread, chunk, slab, type WallSpec, masonry, flame, light, type Builder, lenOf, vOf } from './props/core';
export {
  STONE, STONE_L, STONE_D, STONE_DD, ASHLAR, ASHLAR_L, ASHLAR_W, ASHLAR_B, DRESS, BASE, DECK, INLAY, KERB, PAVE, SLATE_BLUE, ROOF_BLUE, ROOF_BLUE_L, ROOF_ROLL, GILT,
  HERALD_BLUE, HERALD_BLUE_D, BRICK, BRICK_L, BRICK_D, WOOD, WOOD_D, WOOD_L, SLATE, PLASTER, DARK, IRON, IRON_L, COAL, OBSIDIAN, ROCK_WET, LAMP_NAVY, BLOCKS, PLOT_MARK,
  CLIMBER_IVY, CLIMBER_ROSE_LEAF, CLIMBER_BLOOM, GARDEN_LEAF, MARBLE, MARBLE_D, MARBLE_L, BRONZE, BRONZE_D, BRONZE_L, WORN, BELLY, MEMBRANE, DOOR_STAIN, DOOR_CORE,
} from './props/palette';
export { softDisc, brokenFoam } from './props/pieces';
export { PLANT } from './props/plants';
export { mergeStatic, PART_AUDIT, type CourseRecord, type Part, finishProp } from './props/finish';
export {
  BASE_COURSE, oneStone, crownFoot, limb, round, ball, drum, spire, frieze, windowGlass, glassMat, roomMaterial, roomMat, roomPlate, livery, flag, lancet, quoins, BUILDING_FLOOR_LINE,
} from './props/legacyCastleDressing';
export { laidBand, pointedArch, archShape, spandrels, archPane, archStones, dressedArch, archRing, archDressing, archHeight, archInset } from './props/legacyCastleArches';
export { singleDoor, HERO_HEIGHT, DOORS, audit, pointedLeaf, ringHandle, boardedLeaf, pointedDoor } from './props/legacyCastleDoors';
// (Last: build reads the castle's builders (castleProps/), which import this file.)
export { OCCLUDING_PROPS, propKinds, buildProp } from './props/build';
