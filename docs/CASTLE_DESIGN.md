# Dragonspire Castle (castle v3) as built

The castle stands on the home island's crown. Its plan is in `src/data/zoneMaps.ts`: `KEEP_BUILDINGS` for the enterable buildings, and the castle constants (`CURTAIN`, `GATE`, `POSTERN`, `TOWERS`, `DONJON`, `FOUNTAIN`, exported for the dev tools as `CASTLE_PLAN`) for the walls, towers, gates and the centrepiece. The same doors, partitions, stairs and furniture footprints drive rendering and collision. Coordinates are island cells; north is negative Z. A range "x a..b" gives cell edges, so the cells are a to b − 1.

## The idea

One great bailey, with no cross wall, laid out on the keep's axis.

- **Main axis, x = 66**, straight up the screen: the gate in the south wall, the avenue, the dragon fountain, the cour d'honneur between the mirrored west wing and barracks, the feast court and the hall's great door.
- **Cross axis, z = 82**: from a champion in a niche on the west wall, through the fountain, to the stable yard in the east.
- **Mirrored about the axis:** the west wing and the barracks, the parterre's panels and walks, the south wall's towers and its two wall stairs.
- **Every walk joins another:** the paving inside the curtain is one connected network, and every lawn, garden and yard can be walked into from the gate. Tests hold all of this (`tests/keep.test.ts`).

| Zone | Where (x, z) |
|---|---|
| Residence (donjon, residence range, kitchen) | 43..92, 24..40 |
| Feast court and kitchen yard | 57..101, 36..46 |
| Cour d'honneur | 54..78, 46..66 |
| Great parterre and fountain | 36..97, 66..98 |
| Privy garden | 32..42, 34..65 |
| Donjon bower | 38..56, 24..38 |
| Kitchen garden | 94..119, 27..48 |
| Training yard (lists, pells, butts) | 97..119, 48..70 |
| Service court (smithy, stables, paddock) | 97..119, 70..99 |

## The outer works

- **Curtain:** seven faces, clockwise from the north-west corner (31, 38), (50, 22.5), (100, 22.5), (120, 36), (120, 86), (101, 100), (31, 100): straight north, east, south and west faces with chamfered north-west, north-east and south-east corners. 2.2 thick with a wall walk at +7 and full height all round; where it stands between the camera and the hero it dissolves round them, like every tall thing on the island. About 6,480 cells inside.
- **Towers:** eleven round towers, open-topped at +7 with crenellations to 9 or 10: one at each corner, one midway along the east and the west faces, and two on the south face either side of the gate. Every tower stands on the crown's level, never down on the road or cliff beside it.
- **Gatehouse:** on the axis in the south face (66, 100): two D-towers standing out from the wall either side of a vaulted, portcullised passage.
- **Postern:** a narrow gate in the west wall (31, 52.5), out to the belvedere.
- **Wall stairs:** two solid stone flights against the south wall's inner face, mirrored either side of the gate, each climbing from the south walk to its south-face tower. The wall walk itself is not playable yet.
- **Donjon:** the round tower at the north-west (50, 40), radius 7 and 13 high, touching the west wing. It is solid until stage 2 opens it.

## The approach

The approach road leaves the portal court north-west, climbs to the foot of the castle rock and turns west along a ledge under the south wall, ending on the axis in the middle of the gate terrace. It climbs at one steady grade (about 1 in 6) and reaches the crown's level where the ledge meets the terrace. A parapet runs along the road's open side and round the terrace, built in short lengths that step down with the road; lamp posts stand inside it, and the terrace has the two real lamps. The spring wells up below the ledge among boulders.

## The bailey

Lawn everywhere a walk, court or yard does not pave it. There are no barrels, crates or carts lying about.

- **Avenue:** six wide, paved, from the feast court through the fountain plaza and the gate to the terrace, with paired lamp posts up its length.
- **Walks:** the terrace walk along the parterre's head, the cross walk, the west walk (the privy garden's central walk, then the parterre's west side), the east lane (the parterre's east side and the service lane), the south walk under the curtain, the wing walks either side of the cour, and short links to the barracks' east door and the postern.
- **Great parterre:** four lawn panels round the round fountain plaza, mirrored about both axes. Each is edged in low clipped box with openings onto the walks, its plaza side an arc kept off the plaza; a champion faces the avenue between two flower beds, with clipped cones in its corners.
- **Dragon fountain:** the centrepiece at the crossing of the axes, facing the gate: a round basin with a moulded kerb round a clear pool over a dark floor, a stacked rock island, and the bronze dragon rearing on it, more than twice life size and about 9 high: haunches down, forelegs raised and clawing, wings spread, head thrown up and water pouring from its open jaws. Four small jets arc in from stone pedestals on the kerb's diagonals; foam, spray and spreading rings mark where the water lands. Four benches stand round it on the diagonals.
- **Cour d'honneur:** lawn panels either side of the avenue between the wings, each with a long flower bed and clipped cones.
- **Feast court:** two stone champions before the great door, planters by the screens door, the well on the kitchen door's axis and the kitchen's woodpile against its wall.
- **West niche:** a champion facing down the cross walk, clipped cones either side, and a long flower border along the wall's foot either side of those.
- **Privy garden:** hedged from the parterre with its gate on the west walk; flower beds either side of the walk, a bench looking out to the postern, a champion on a pad at the walk's head.
- **Donjon bower:** a gravel walk from the privy garden's champion up behind the donjon to a seat.
- **Belvedere:** a paved lookout outside the postern with a parapet, a bench and a lamp.
- **Kitchen garden:** herb beds either side of its gravel walk and along the herb path, a bench at the head of each.
- **Training yard:** beaten earth, fenced, closed on the east by the curtain. The lists (north) with the tilt barrier, and the pell and archery yard (south) with its weapon rack, pells and butts, each gated from the east lane.
- **Service court:** the stable yard before the smithy and the stables, the horse trough on the stables door's axis, the grindstone by the smithy door, and a fenced lawn paddock with a haystack.

## Buildings

Every castle building has a flat roof with a crenellated parapet (no pitched roofs); chimneys rise above the parapet and a stone lantern lets the hall's hearth smoke out. Windows are tall lancets with hood moulds, few and placed symmetrically.

| Building | Where | Rooms | Notes |
|---|---|---|---|
| Residence range (`keep`, 27 × 16, two storeys) | 57, 24 | Great hall, screens passage, buttery, service passage, pantry | The great door is on the castle's axis. The hall is open to its roof; upstairs, galleries run round its north and west sides to the minstrel gallery over the screens, and the steward's chamber lies over the service end. |
| Kitchen (9 × 12) | 83, 24 | Great kitchen | Tall and open to its roof, two hearths; it shares its west wall with the residence range. Its door opens on the kitchen yard. |
| West wing (12 × 18) | 42, 47 | Guardroom and armory, chapel | Its upper floor (solar, bedchamber) is reached from the donjon in stage 2. |
| Barracks (12 × 18) | 78, 47 | Guardroom, dormitory | The west wing's mirror across the cour; its east door opens on the lane to the lists. |
| Smithy (6 × 6) | 97, 70 | Forge | At the head of the service court, its door on the stable yard. |
| Stables (17 × 6) | 102, 70 | Stalls | Along the east curtain, sharing the smithy's east wall. |

## Stairs and floors

A stair is a straight flight inside a room (`stairs` on a building). On the ground floor its foot row takes you up; upstairs its head row takes you down; the rest of the flight and the stairwell are solid. You arrive beside it on the other floor, outside the trigger. A short fade switches the player's height, collision grid, camera and pet. Rooms open to the roof are `voids` on the upper floor: no floor there, and the hall below stays in view from the galleries.

The residence range's stair climbs north along the screens passage's west side to the minstrel gallery.

## Grass and water

Every grassy cell on the island grows a continuous shell lawn: clipped short with mower stripes inside the castle, taller in the meadows. Still water in the fountain basin and the waterfall's step pools shares one pool water: a depth tint from pale at the rim to deep at the heart, drifting ripples, rings and broken foam where water lands, the zone's sky reflected toward grazing angles and sun glints on the ripples. The stream, spring and pond use the terrain's water, which has the same ripples, sky reflection, glints and a lace of foam at the shore. Falling water (the dragon's jaws, the jets, the waterfall) pours in long streaks, white with air toward its foot.

## Checking it

`npm run inspect -- bailey` captures the castle for review: an overview and a plan, the approach, every yard and garden through the gameplay camera with the hero standing in it, the fountain and a lawn up close, the island beyond, and the hero by the south wall as it dissolves. It also measures the frame cost at the fountain and in a meadow.

## Still to build

- Stage 2: the donjon's interior (the guard hall off the hall's dais, the map room above, the spiral stair linking them to the roof and the west wing's upper floor), and the west wing's solar and bedchamber.
