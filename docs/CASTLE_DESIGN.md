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
| Bower (rose arbour at the head of the west walk) | 34..41, 36..42 |
| Kitchen garden (four quarters round a sundial) | 101..119, 32..49 |
| Training yard (lists and archery lane) | 101..119, 49..70 |
| Service court (smithy, stables, stable yard, paddock) | 101..119, 70..99 |

The formal bailey (x 31..101) is mirrored about the axis: a clipped yew hedge on x = 100.5, the mirror of the west curtain, frames it from the service quarter, open where the cross walk passes into the stable yard.

## The outer works

- **Curtain:** seven faces, clockwise from the north-west corner (31, 38), (50, 22.5), (100, 22.5), (120, 36), (120, 86), (101, 100), (31, 100): straight north, east, south and west faces with chamfered north-west, north-east and south-east corners. 2.2 thick with a wall walk at +7 and full height all round; where it stands between the camera and the hero it dissolves round them, like every tall thing on the island. About 6,480 cells inside.
- **Towers:** eleven round towers rising a storey above the wall walk to a corbelled, crenellated parapet ring (the curtain stops at each drum): one at each corner, one midway along the east and the west faces, and two on the south face either side of the gate. Every tower stands on the crown's level, never down on the road or cliff beside it.
- **Gatehouse:** on the axis in the south face (66, 100): two D-towers standing out from the wall either side of a passage four cells wide under a pointed arch of dressed voussoirs, the portcullis raised in the arch, a machicolated, crenellated block rising a storey over the curtain between the drums, the lord's banner over the arch.
- **Postern:** a narrow gate in the west wall (31, 52.5), out to the belvedere.
- **Wall stairs:** two solid stone flights against the south wall's inner face, mirrored either side of the gate, each climbing from the south walk to its south-face tower. The wall walk itself is not playable yet.
- **Donjon:** the round tower at the north-west (50, 40), radius 7 and 13 high, touching the west wing. It is solid until stage 2 opens it.

## The approach

The approach road leaves the portal court north-west, climbs to the foot of the castle rock and turns west along a ledge under the south wall, ending on the axis in the middle of the gate terrace. It climbs at one steady grade to the foot of the south wall's east end (beside a dressed retaining wall) and runs level with the crown along the whole ledge, a grass verge between it and the wall. A parapet runs along the road's open side and round the terrace, built in short lengths that step down with the road; lamp posts stand inside it, and the terrace has the two real lamps. Below the ledge the spring's water falls from a culvert in the rock face into its pool, and the stream runs on from it unbroken.

## The bailey

Lawn everywhere a walk, court or yard does not pave it. There are no barrels, crates or carts lying about.

- **Avenue:** six wide, paved, from the feast court through the fountain plaza and the gate to the terrace, with paired lamp posts up its length.
- **Walks:** the terrace walk along the parterre's head, the cross walk, the west walk (the privy garden's central walk, then the parterre's west side), the east lane (the parterre's east side and the service lane), the south walk under the curtain, the wing walks either side of the cour, and short links to the barracks' east door and the postern.
- **Great parterre:** four lawn panels round the round fountain plaza, mirrored about both axes. Each is edged in low clipped box with openings onto the walks, its plaza side an arc kept off the plaza; a champion faces the avenue between two flower beds, with clipped cones in its corners.
- **Dragon fountain:** the centrepiece at the crossing of the axes, facing the gate: a round basin with a moulded kerb round a clear pool over a dark floor, a stacked rock island, and the bronze dragon rearing on it, more than twice life size and about 9 high: haunches down, forelegs raised and clawing, wings spread, head thrown up and water pouring from its open jaws. Four small jets arc in from stone pedestals on the kerb's diagonals; foam, spray and spreading rings mark where the water lands. Four benches stand round it on the diagonals.
- **Cour d'honneur:** lawn panels either side of the avenue between the wings, each with a long flower bed and clipped cones.
- **Feast court:** two stone champions before the great door, planters by the screens door, the well on the kitchen door's axis and the kitchen's woodpile against its wall.
- **West niche:** a champion facing down the cross walk, clipped cones either side, and a long flower border along the wall's foot either side of those.
- **Privy garden:** hedged from the parterre with its gate on the west walk; clipped standard trees in pairs either side of the walk with flower beds between them; the postern's cross walk ends at a seat against the wing.
- **Bower:** a rose arbour with its seat at the head of the west walk, in the open, on a paved court between clipped balls; the lawn behind the donjon is a grove of trees.
- **Belvedere:** a paved lookout outside the postern with a parapet, a bench and a lamp.
- **Kitchen garden:** four box-edged quarters of herb beds round a cross of stone walks meeting at a sundial; the walks end at the feast court, a seat under the north wall between blossom trees, a seat against the east wall and the training yard's gate.
- **Training yard:** beaten earth, fenced from the kitchen garden with one gate on its walk, closed by the hedge, the stable range and the curtain. The lists (north) with a row of pells and two weapon racks, a divider with a gate on the same line, and the archery lane (south): three butts at its west end, the shooting line and the archers' bench at the east.
- **Service court:** the stable yard before the smithy and the stables (one range under one parapet, three stall doors), the grindstone against the smithy, blossom trees in planters flanking the paddock gate on the stables' axis; the paddock behind it with a field shelter against the diagonal wall, hay under it, the trough on the gate's axis and two horses.

## Buildings

Every castle building has a flat roof with a crenellated parapet (no pitched roofs); chimneys rise above the parapet and a stone lantern lets the hall's hearth smoke out. Windows are tall lancets with hood moulds, few and placed symmetrically.

| Building | Where | Rooms | Notes |
|---|---|---|---|
| Residence range (`keep`, 27 × 16, two storeys) | 57, 24 | Great hall, screens passage, buttery, service passage, pantry | The great door is on the castle's axis. The hall is open to its roof; upstairs, galleries run round its north and west sides to the minstrel gallery over the screens, and the steward's chamber lies over the service end. |
| Kitchen (9 × 12) | 83, 24 | Great kitchen | Tall and open to its roof, two hearths; it shares its west wall with the residence range. Its door opens on the kitchen yard. |
| West wing (12 × 18) | 42, 47 | Guardroom and armory, chapel | Its upper floor (solar, bedchamber) is reached from the donjon in stage 2. |
| Barracks (12 × 18) | 78, 47 | Guardroom, dormitory | The west wing's mirror across the cour; its east door opens on the lane to the lists. |
| Smithy (6 × 6) | 101, 70 | Forge | At the west end of the stable range, its door on the stable yard. |
| Stables (13 × 6) | 106, 70 | Stalls | Sharing the smithy's east wall, running to the east curtain. |

## Stairs and floors

A stair is a straight flight inside a room (`stairs` on a building). On the ground floor its foot row takes you up; upstairs its head row takes you down; the rest of the flight and the stairwell are solid. You arrive beside it on the other floor, outside the trigger. A short fade switches the player's height, collision grid, camera and pet. Rooms open to the roof are `voids` on the upper floor: no floor there, and the hall below stays in view from the galleries.

The residence range's stair climbs north along the screens passage's west side to the minstrel gallery.

## Grass and water

Every grassy cell on the island grows a continuous shell lawn: clipped short with mower stripes inside the castle, taller in the meadows. Still water in the fountain basin and the waterfall's step pools shares one pool water: a depth tint from pale at the rim to deep at the heart, drifting ripples, rings and broken foam where water lands, the zone's sky reflected toward grazing angles and sun glints on the ripples. The stream, spring and pond use the terrain's water, which has the same ripples, sky reflection, glints and a lace of foam at the shore. Falling water (the dragon's jaws, the jets, the waterfall) pours in long streaks, white with air toward its foot.

## Checking it

`npm run inspect -- bailey` captures the castle for review: an overview and a plan, the approach, every yard and garden through the gameplay camera with the hero standing in it, the fountain and a lawn up close, the island beyond, and the hero by the south wall as it dissolves. It also measures the frame cost at the fountain and in a meadow.

## Still to build

- Stage 2: the donjon's interior (the guard hall off the hall's dais, the map room above, the spiral stair linking them to the roof and the west wing's upper floor), and the west wing's solar and bedchamber.
