/**
 * Zone maps, one module per zone under zoneMaps/ (the keep's split by stage). Each is composed from
 * big authored shapes (roads, rivers, lakes, clearings, plateaus, forests) with the Gen toolkit: open
 * meadows and long sightlines, landmarks to navigate by, side areas worth detouring for, and a scenery
 * frame so the camera never sees past the edge. Coordinates are in cells (1 cell = 1 unit); +z is
 * south (toward the camera).
 */
export { CASTLE_PLAN } from './zoneMaps/keepCastle';
export { KEEP_BUILDINGS } from './zoneMaps/keepBuildings';
export { FORGE, KEEP_ARCHES, KEEP_STAGE, KEEP_VIEWS, STAGE_CAMERAS } from './zoneMaps/keepPlan';
export { buildKeep } from './zoneMaps/keep';
export { buildMine } from './zoneMaps/mine';
export { buildFoothills } from './zoneMaps/foothills';
export { buildRuin } from './zoneMaps/ruin';
export { buildLair } from './zoneMaps/lair';
