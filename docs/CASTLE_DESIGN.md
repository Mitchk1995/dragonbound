# Dragonspire Castle (castle v3) as built

The castle stands on the home island's crown. Its plan is in `src/data/zoneMaps.ts`: `KEEP_BUILDINGS` for the enterable buildings, and the castle constants (`CURTAIN`, `SCREEN`, `GATE`, `POSTERN`, `WARD_GATES`, `TOWERS`, `DONJON`, `FOUNTAIN`, exported for the dev tools as `CASTLE_PLAN`) for the walls, towers, gates and the centrepiece. The same doors, partitions, stairs and furniture footprints drive rendering and collision. Coordinates are island cells; north is negative Z. A range "x a..b" gives cell edges, so the cells are a to b − 1.

## The idea

One great bailey, with no cross wall, laid out on the keep's axis.

- **Main axis, x = 66**, straight up the screen: the gate in the south wall, the avenue, the dragon fountain, the cour d'honneur between the mirrored west wing and barracks, the feast court and the hall's great door.
- **Cross axis, z = 82**: from a champion in a niche on the west wall, through the fountain, to the ward gate in the inner curtain and the stable court beyond.
- **Mirrored about the axis:** the bailey's two side walls (the west curtain and the inner curtain), the west wing and the barracks, the two pavilions framing the great door, the parterre's panels and walks, the south wall's towers and its two wall stairs.
- **Every walk joins another:** the paving inside the curtain is one connected network, and every lawn, garden and yard can be walked into from the gate. Tests hold all of this (`tests/keep.test.ts`).

| Zone | Where (x, z) |
|---|---|
| Residence (donjon, residence range, kitchen) | 43..92, 24..40 |
| Feast court and kitchen yard | 57..101, 36..46 |
| Cour d'honneur | 54..78, 46..66 |
| Great parterre and fountain | 36..97, 66..98 |
| Privy garden | 32..42, 34..65 |
| Bower (rose arbour at the head of the west walk) | 34..41, 36..42 |
| Orchard (behind the kitchen) | 92..100, 24..40 |
| Service ward: kitchen garden (four boxed quarters round a sundial) | 102..119, 23..52 |
| Service ward: training yard (lists and archery ground) | 102..117, 52..72 |
| Service ward: smithy, stables, stable court and paddock | 102..119, 72..100 |

The bailey (x 31..101) is one symmetric enclosure: the west curtain on x = 31 and its mirror, the inner curtain on x = 101, close its sides. East of the inner curtain lies the service ward, walled apart with its own axis (x 110.5) and two gates into the bailey: a small one off the feast court and the main one on the cross axis.

## The outer works

- **Curtain:** six faces, clockwise from the north-west corner (31, 38), (50, 22.5), (101, 22.5), (120, 36), (120, 100), (31, 100): straight north, east, south and west faces with chamfered north-west and north-east corners and a square south-east corner (a corner tower), and the inner curtain on x = 101 from the north wall to the south wall. 2.2 thick with a wall walk at +7 carried on corbels, full height all round; where it stands between the camera and the hero it dissolves round them, like every tall thing on the island.
- **Towers:** thirteen round towers rising a storey above the wall walk to a corbelled, crenellated parapet ring (the curtain stops at each drum): one at each corner, one midway along the east and the west faces and on the inner curtain (the west one's mirror), and two on the south face either side of the gate. Every tower stands on the crown's level, never down on the road or cliff beside it.
- **Gatehouse:** on the axis in the south face (66, 100): two D-towers standing out from the wall either side of a passage four cells wide under a pointed arch of dressed voussoirs, the portcullis raised in the arch, a machicolated, crenellated block rising a storey over the curtain between the drums, the lord's banner over the arch on the outer face and a flag on each drum (none over the passage, so the view up the avenue stays clear). With the flags on the two south-face towers either side, the gate front flies five in one symmetric composition.
- **Postern:** a narrow gate in the west wall (31, 53) under a pointed arch with a lantern either side, its blue leaves folded back, steps out onto the belvedere.
- **Ward gates:** two gates in the inner curtain, each under a pointed arch with a hood mould, lanterns, blue leaves folded back and a raised crenellated head bearing the lord's crest: off the feast court (z 45) and on the cross axis (z 82).
- **Wall stairs:** two solid stone flights against the south wall's inner face, mirrored either side of the gate, each climbing from the south walk to its south-face tower; and a pair against the north-east wall at the head of the kitchen garden's walk. The wall walk itself is not playable yet.
- **Donjon:** the round tower at the north-west (50, 40), radius 7 and 13 high, touching the west wing, crowned by the castle's one spire. It is solid until stage 2 opens it.

## The approach

The approach road leaves the portal court north-west, climbs to the foot of the castle rock and turns west along a ledge under the south wall, ending on the axis in the middle of the gate terrace. It climbs at one steady grade to the foot of the south wall's east end (beside a dressed retaining wall) and runs level with the crown along the whole ledge, a grass verge between it and the wall. A parapet runs along the road's open side and round the terrace, built in short lengths that step down with the road, a course of cut stone finishing the cliff lip under it; lamp posts stand inside it, and the terrace has the two real lamps. Below the ledge the spring's water falls from a culvert in the rock face into a round pool with reeds and a soft bank, and the stream runs on from it in one unbroken channel to the pond, and from the pond off the island's south edge in a fall into the Veil. The spring path ends at a small gravel landing with a bench looking at the fall. The earth paths outside the castle are drawn along their centre lines, so their edges curve instead of stepping along the cells; the farm lane ends at the hay paddock's gate between stone piers.

## The bailey

Lawn everywhere a walk, court or yard does not pave it. There are no barrels, crates or carts lying about.

- **Avenue:** six wide, paved, from the feast court through the fountain plaza and the gate to the terrace, with paired lamp posts up its length, kerbed along both edges and banded at the gate's threshold and the head of the feast court.
- **Walks:** the terrace walk along the parterre's head, the cross walk, the west walk (the privy garden's central walk, then the parterre's west side), the east lane (the parterre's east side and the service lane), the south walk under the curtain, the wing walks either side of the cour, and short links to the barracks' east door and the postern.
- **Great parterre:** four lawn panels round the round fountain plaza (radius 10.5, so the dragon is seen across open paving from the gate), mirrored about both axes. Each is edged in low clipped box with openings onto the walks, its plaza side cut back as a concave arc with a bench facing the basin; a champion faces the avenue between two flower beds, a blossom or gold tree in each outer corner, clipped cones at the arc's ends.
- **Dragon fountain:** the centrepiece at the crossing of the axes, facing the gate: a round basin with a moulded kerb round a clear pool over a dark floor, a stacked rock island, and the bronze dragon rearing on it, more than twice life size and about 9 high: haunches down, forelegs raised and clawing, wings spread, head thrown up and water pouring from its open jaws. Four small jets arc in from stone pedestals on the kerb's diagonals; foam, spray and spreading rings mark where the water lands. The pool reflects the dragon and a calm sky; its belly is covered in overlapping bronze scales.
- **Cour d'honneur:** lawn panels either side of the avenue between the wings, each with a long flower bed and clipped cones.
- **Great door:** under a pointed arch with dressed voussoirs, a hood mould and a carved tympanum, between two identical square pavilions standing forward of the hall's facade, each rising a storey above the parapet with a lancet on every storey; the hall's front has no other door on the court.
- **Feast court:** two stone champions and two urns before the great door, the well on the kitchen door's axis and the kitchen's woodpile against its wall; it runs on through the north ward gate.
- **Orchard:** six apple trees in a grid in the corner behind the kitchen.
- **West niche:** a champion facing down the cross walk, clipped cones either side, and a long flower border along the wall's foot either side of those.
- **Privy garden:** hedged from the parterre with its gate on the west walk; clipped standard trees in pairs either side of the walk with flower beds in the open between them and a lamp at each end; the postern's cross walk ends at a seat in an arched niche against the wing, answering the postern.
- **Bower:** a rose pergola (three pointed timber arches, climbing roses, a lantern) over a seat at the head of the west walk, standing on the paved court between clipped balls, a clipped yew backdrop behind it; the lawn behind the donjon is a grove of trees.
- **Belvedere:** a paved lookout outside the postern on a headland level with the crown, a parapet round its three open sides, a bench in the middle facing west over the Veil and a lamp either side of the postern.
- **Kitchen garden:** four square quarters, each a lawn panel boxed in clipped box on all four sides with two herb beds, round a cross of walks meeting at a sundial on the ward's axis, a lane round the outside; the north walk climbs to a paved terrace under the north-east wall, the south walk goes on through the training yard's gate.
- **Training yard:** beaten earth with lighter worn lanes, fenced from the kitchen garden with one gate on the ward's axis, a tall yew hedge closing its east side. The lists (north): four pells either side of the aisle and a weapon rack with shields flat against the fence either side of the gate. The archery ground (south), through a gate at the west end of the divider: the shooting line along the divider, three butts with pennants down the range, the archers' bench by the gate.
- **Stable court:** before the smithy and the stables (one range under one parapet): the stable door on the court's axis with the loft door over it, an arched stall opening either side with a half-door and a horse looking out, flowers under them; the grindstone and an anvil either side of the smithy door, the trough before the stable door, a blossom tree in a planter on each stall's line.
- **Paddock:** behind its fence, the gate between stone piers on the stables' axis, the trough just inside it, the field shelter (stone, flat-roofed behind a parapet) against the east wall, two horses before it.

## Buildings

Every castle building has a flat roof with a crenellated parapet (no pitched roofs); chimneys rise above the parapet and a stone lantern lets the hall's hearth smoke out. Windows are tall pointed lancets (a two-centred arch cut into the wall, one warm leaded pane or stained glass, a slender mullion, a hood mould following the arch), few and placed symmetrically; the donjon's are the same.

| Building | Where | Rooms | Notes |
|---|---|---|---|
| Residence range (`keep`, 27 × 16, two storeys) | 57, 24 | Great hall, screens passage, buttery, service passage, pantry | The great door is on the castle's axis. The hall is open to its roof; upstairs, galleries run round its north and west sides to the minstrel gallery over the screens, and the steward's chamber lies over the service end. |
| Kitchen (9 × 12) | 83, 24 | Great kitchen | Tall and open to its roof, two hearths; it shares its west wall with the residence range. Its door opens on the kitchen yard. |
| West wing (12 × 18) | 42, 47 | Guardroom and armory, chapel | Its upper floor (solar, bedchamber) is reached from the donjon in stage 2. |
| Barracks (12 × 18) | 78, 47 | Guardroom, dormitory | The west wing's mirror across the cour; its east door opens on the lane to the lists. |
| Smithy (6 × 6) | 102, 72 | Forge | At the west end of the stable range, its door on the stable court. |
| Stables (12 × 6) | 107, 72 | Stalls | Sharing the smithy's east wall, running to the east curtain. |

## Stairs and floors

A stair is a straight flight inside a room (`stairs` on a building). On the ground floor its foot row takes you up; upstairs its head row takes you down; the rest of the flight and the stairwell are solid. You arrive beside it on the other floor, outside the trigger. A short fade switches the player's height, collision grid, camera and pet. Rooms open to the roof are `voids` on the upper floor: no floor there, and the hall below stays in view from the galleries.

The residence range's stair climbs north along the screens passage's west side to the minstrel gallery.

## Colour and materials

The castle is built in its own stone, so it reads as one royal composition against the gardens, the paving and the rock. The palette lives in `src/world/props.ts` (the rest of the world keeps its plain grey-brown stone).

| Part | Colour | Where |
|---|---|---|
| Ashlar | cream limestone `0xcdc0a3`; sunlit `0xdacfb5`; weathered `0xb8aa8e` | Every mass: the curtain, the towers' and the donjon's drums, the gatehouse, the pavilions, the castle buildings, parapets, merlons, chimneys and turrets. Pale blocks for jambs, sills, mullions, voussoirs and keystones; weathered for the lowest course above each plinth, the wall walk's inner rail and stair risers. |
| Dressings | blue-grey `0x737e8e`; dark `0x56606e`; light `0x8592a2` | Continuous lines and frames: string courses and tower bands, one coping under the merlons (never a cap per merlon), corbels, machicolations, hood moulds and label stops, buttress set-offs, lamp bases. The dark one for plinths, battered bases, passage floors and kerbs; the light one for the second quoin tone and the inlay bands. |
| Decks | warm grey `0x8a8478` | Wall walks, tower platforms and roof decks; the roofs' leads stay cool slate. |
| Livery | royal blue `0x2848a0` (shade `0x1c3272`) and gold | Banners hang from rods with gold side strips, a gold dragon diamond and a two-point swallowtail edged in gold; flags fly from poles with a gold stripe at the hoist and a swallowtail. The lord's crest (a blue shield rimmed in gold) heads the ward gates; the gatehouse's keystone bears a small one; the great door's tympanum is deep blue with the gold diamond. The great doors are oak with gilt hinges, studs and ring; the postern's and ward gates' leaves are blue. Inside, the hall's rugs and cushions stay crimson. |

- **Ceremonial arches:** the gatehouse's outer arch and the great door have voussoirs alternating pale ashlar and blue-grey under a blue-grey hood; the other gates' are plain pale ashlar.
- **The spire:** the donjon alone carries a spire, a 24-sided cone of deep blue slate (`0x3e5472`) standing inside its merlon ring on a blue-grey eave, about 11 high, with a gold finial and the lord's banner on a pole above it. Every other tower keeps its crenellated top. It belongs to the donjon, so it dissolves with it.
- **Stained glass:** three lights and a head piece between dark leading, each glowing in its own colour: sapphire either side of gold under a gold head in the pavilions' upper lancets and the lancet over the great door; sapphire either side of ruby under an emerald head in the chapel's south gable. Every other window keeps its warm glow.
- **Ivy and roses:** ten climbers (`wall_climber`), leaf clusters flat to the face, dense at the foot and thinning to a ragged top, following a drum's curve where they grow on one: roses on the curtain behind the bower and either side of the privy garden's seat niche, ivy either side of the postern, on the bailey faces of the two mid-wall towers, on the outer faces of the south face's towers and on the donjon's drum over the bower's court. None on the gatehouse, the pavilions, the hall's front or the service ward.
- **Kerbs:** blue-grey slabs edge the avenue from the gate to the feast court and the cross walk across the parterre, broken wherever another walk crosses, and ring the fountain plaza (open where the four walks come in); paler inlay bands cross the avenue at the gate's threshold and the head of the feast court.
- **Ground:** the castle's paving is a cool flagstone (`0x928e88`), so the walls stay the warmest stone, and the castle rock is a weathered grey-mauve granite (`0x857f80`) that frames them.

The stone is painted like all masonry, as blocks of varied tone; the ashlar is painted a little stronger and is damp and cooler at its foot, brightening upward.

## Grass, water and sky

The Veil is lit at the golden hour: a warm, low sun, a lilac sky warming to peach at the horizon, a sea of soft cloud below the island's edge, a bright sky bounce so shade stays readable. No stars.


Every grassy cell on the island grows a continuous shell lawn: clipped short with mower stripes inside the castle, taller in the meadows. Still water in the fountain basin and the waterfall's step pools shares one pool water: a depth tint from pale at the rim to deep at the heart, drifting ripples, rings and broken foam where water lands, the zone's sky reflected toward grazing angles (calmed, so it reads as sky, not blotches) and soft sun glints on the ripples. The stream, spring and pond use the terrain's water, which has the same ripples, sky reflection, glints and a lace of foam at the shore. Falling water (the dragon's jaws, the jets, the waterfall) pours in long streaks, white with air toward its foot.

## Checking it

`npm run inspect -- bailey` captures the castle for review: an overview and a plan, the approach, the architecture up close (the hall's front, the gatehouse's outer face, the gate front, a wall tower, the donjon and its spire, the north skyline, the roses behind the bower), every yard and garden through the gameplay camera with the hero standing in it, the fountain and a lawn up close, the island beyond, and the hero by the south wall as it dissolves. It also measures the frame cost at the fountain and in a meadow.

## Still to build

- Stage 2: the donjon's interior (the guard hall off the hall's dais, the map room above, the spiral stair linking them to the roof and the west wing's upper floor), and the west wing's solar and bedchamber.
