# Dragonspire Keep: two playable floors

The keep is a hall-keep with a working service wing and guard wing downstairs, and private rooms upstairs. Its layout is defined in `KEEP_BUILDINGS` in `src/data/zoneMaps.ts`. The same doors, partitions, stair cells and furniture footprints drive rendering and collision.

## Scale and orientation

The main block is 36 by 20 one-metre cells at world corner `(57, 21)`. North is negative Z, at the top of the floor plans. Five-cell square towers are centred on the four corner cells. The upper floor is 5.2 metres above the ground floor; the outer walls are 9.8 metres high.

The four-cell south entrance opens into the screens passage. A smaller west entrance opens into the kitchen. The broad central bay connects the entrance, feast tables and the Warden's throne on the north dais. This gives the main room a readable direction and keeps service traffic at the south end.

## Room plan

| Position | Ground floor | Upper floor | Purpose |
|---|---|---|---|
| Northwest | Kitchen | Warden's bedchamber | Food preparation below; private quarters above the warm hearth |
| Southwest | Buttery / pantry | Library | Stores close to the hall entrance; books and reading space upstairs |
| North centre | Great hall / dais | Solar | Public gathering and audience downstairs; private sitting and writing upstairs |
| South centre | Screens passage | Map room | Entrance and service circulation below; planning table above |
| Northeast | Armoury | Chapel | Equipment storage and maintenance below; quiet worship above |
| Southeast | Guard room | Stair antechamber | Guards near the main entrance; waiting space at the upper stairhead |

The southwest tower contains the well room and opens only downstairs. The southeast tower holds the great spiral stair, reached from the guard room. The northwest tower holds the back spiral stair, reached from the kitchen. The northeast tower remains masonry.

## Playable stairs and visibility

Walk through a stair-tower doorway and onto its open stair-foot cell to change floors. A short fade switches the player's height, collision grid, mouse ground plane, camera and pet. The arrival point sits outside the stair trigger to prevent an immediate return trip. The zone and its restoration state stay intact.

| Stair | Trigger cell centre (world X/Z) | Arrival outside the door |
|---|---|---|
| Great stair, southeast | `(91.5, 39.5)` | `(91.5, 37.5)` |
| Back stair, northwest | `(58.5, 22.5)` | `(58.5, 24.5)` |

Both stairs work in both directions. Upstairs, only the upper-floor navigation grid is open. Ground-level stations and dropped items are hidden and cannot be selected. Downstairs, their visibility returns. The building cutaway shows furnishings on the selected floor and removes the roof and intervening storey. Stair travel is suspended while paused, already travelling, dead or rooted.

## Verification and floor-plan output

`tests/keep.test.ts` checks that both stairs connect to every walkable upper-floor cell, doors agree with collision, arrivals avoid trigger cells, and cutaways select the correct furnishings. `tests/castle-floors.test.ts` checks real runtime transitions, paused behaviour, stale fade callbacks, invalid upper-floor requests and pet height.

With the Vite development server running, `npm run inspect -- castle` produces:

- `inspect/castle-plan-ground.png` and `inspect/castle-plan-upper.png`, drawn from actual navigation cells and furniture footprints.
- Twelve gameplay-camera room captures, named `castle-ground-*` and `castle-upper-*`.
- A metrics/error report in `inspect/report.json`.

The automated inspection uses a temporary save profile. It does not change the player's desktop save. A human playtest should still walk both stairs, visit all six upper rooms, return downstairs and use the normal hub stations.
