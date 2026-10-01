# Dragonspire Castle (castle v2) as built

The castle on the island's crown follows the castle-v2 blueprint in [blueprints/castle-v2](blueprints/castle-v2/). Its plan is in `src/data/zoneMaps.ts`: `KEEP_BUILDINGS` for the enterable buildings, the `CASTLE` constants for the walls, towers and gates. The same doors, partitions, stairs and furniture footprints drive rendering and collision. Blueprint coordinates move onto the island by `(+28, +12)`. North is negative Z.

## The outer works

- **Curtain:** an eight-sided wall following the rock, 2.2 thick with a wall walk at +7. Its camera-side faces (south-east, south and south-west) are drawn cut down to a 1.2 course so the wards stay in view; the north, east and west faces stand full height.
- **Towers:** seven round towers, open-topped at +7 with crenellations to 9 or 10. The west corner at blueprint `(8, 30)` has none.
- **Outer gatehouse:** two round towers standing out from the south-east face either side of a vaulted, portcullised passage 3 wide. The approach ramp climbs to it from the portal court.
- **Cross wall:** a diagonal wall (cut down on the camera side) splitting the castle into the lower ward and the inner court, with the inner gatehouse at its middle.
- **Postern:** a narrow gate in the west wall, out to a path along the crown.
- **Wall stairs:** solid stone flights to the wall walk, one along the cross wall, one along the south-east curtain. The wall walk itself is not playable yet.
- **Donjon:** the round tower at the north-west high corner, radius 7 and 13 high. Stage 1 builds it solid; stage 2 opens it (guard hall, map room, spiral stair).

## The wards

- **Lower ward:** the outer gate's road crosses it to the inner gate. Barracks along the south wall, stables and smithy on the east side, the training lists with their tilting rails, and the flagged muster yard with pells and a weapon rack.
- **Inner court:** the road runs on to the feast court before the great door. The well, the kitchen yard by the kitchen door, the herb garden in the south-west, benches in the feast court.

## Buildings

| Building | Rooms | Notes |
|---|---|---|
| Residence range (`keep`, 27 × 16, two storeys) | Great hall, screens passage, buttery, service passage, pantry | The hall is open to its roof. Upstairs, galleries run round its north and west sides to the minstrel gallery over the screens, and the steward's chamber lies over the service end. The keep's entrance bay, gate tower and banner stand over the great door. |
| Kitchen (9 × 12) | Great kitchen | Tall and open to its roof, two hearths (north and east), it shares its west wall with the residence range through the service passage. |
| West wing (12 × 18) | Guardroom and armory, chapel | Its upper floor (solar, bedchamber) is reached from the donjon in stage 2. |
| Barracks, stables, smithy | One room each | In the lower ward. |

## Stairs and floors

A stair is a straight flight inside a room (`stairs` on a building). On the ground floor its foot row takes you up; upstairs its head row takes you down; the rest of the flight and the stairwell are solid. You arrive beside it on the other floor, outside the trigger. A short fade switches the player's height, collision grid, camera and pet. Rooms open to the roof are `voids` on the upper floor: no floor there, and the hall below stays in view from the galleries.

The residence range's stair climbs north along the screens passage's west side to the minstrel gallery.

## Still to build (stage 2)

- The donjon's interior: the guard hall off the hall's dais, the map room above, and the spiral stair linking them to the roof and the west wing's upper floor.
- The west wing's solar and bedchamber.
- The postern's cliff stair, once the island edge below it is settled.
