# Dragonbound design decisions
*October 3 2026*

Dragonbound is a long-term action RPG with combat led by Diablo II, some Diablo IV influence, richer active skills, and OSRS-style gathering and progression. The immediate design target is a complete, cohesive levels 1–10 region that makes combat, mining, equipment, quests and exploration feel like one adventure.

This reference brings the agreed direction, working ideas and open choices together for continued design. The first region comes first; the world can grow into a much larger adventure after that. The item appendix preserves an existing catalog snapshot separately from the new progression decisions.

**Decision status:** Agreed direction records the intended experience. Working proposals describe ideas still being shaped. Open decisions need a choice or testing. Existing reference values describe the October 1 catalog and are not final balance for the first region.

**This is the single design plan.** Any agent (Claude or Codex) that hears a decision from Mitchell records it here, in the same session; decisions that only live in a chat get lost. Newer direct decisions take precedence over older text, so record what changed, in the section below or in place.

## The new look and the great keep (October 3)

Mitchell's fifth round of castle picture notes (38 notes, kept with their marked pictures in
`D:\dragonbound-archive\notes\castle-round5`) came down to three things, and he picked from Codex paintings
(`D:\dragonbound-archive\codex\castle-grand-options.png`, `stone-options.png`, `trees-options.png`):

- **A grand castle: pick B, "Great keep".** The castle must be grand and epic, with the main building the clear star and
  every other building smaller and lower; the castle may grow ("we can expand the area if needed"). A massive square keep
  with four corner turrets rising high above the walls and a great hall joined to it; towers evenly and symmetrically
  spaced; stables with a paddock where the horses have room; a moat round the walls that flows down to the river, with
  walls on both sides of the approach where it runs along the ledge. Windows should be artistic and varied, never
  copy-paste, and the glass clear with a cool tint you can see into. Today's donjon and the tower beside the main building go
  or change. The painting is mood, not a blueprint: Mitchell asked for the layout to be scrutinised and designed with our
  own taste ("usually they are kind of generic"). The plan comes first as a blueprint (castle v4) for his approval.
- **Stone: pick B, "Hand-painted chunky".** One stone system for the whole castle instead of spot fixes: real depth
  (bump-mapped joints and chipped, bevelled edges with a lit top edge), only a few block sizes laid in courses that line
  up everywhere, and trim, kerbs and borders cut from the same stone rather than stuck-on blocks in another colour (his
  note on the blue-grey quoins; the dark corbel blocks go too). After the first work-in-progress pictures he added two
  things. Round towers are laid in flat stones, never a smooth cylinder ("brick buildings cant be fully round"): each
  stone is one flat face with its joints on the facet edges, each course turned half a stone, so a tower is very slightly
  many-sided and no brick bends. And the stones must clearly stand out from the play camera: deeper joints and stronger
  shading, and real blocks standing proud of the wall wherever its outline shows the stones (tops, corners, arches,
  tower outlines), since painted depth cannot change an outline.
- **Trees: pick B, "Natural".** Redo the trees at true size, no longer blocky, as the woodcutting ladder in RuneScape's
  order: tree, oak, willow, maple, yew, magic. After seeing the first grown oak he chose the natural, realistic look
  ("i kinda like the realistic one") and dropped the cartoony and mixed versions planned for comparison. The rest of the
  ladder follows in the same style. Cartoony and blocky stay for the characters, enemies and NPCs, because that is what
  Claude models well. Each species is grown from one recipe in three or four shapes, and every placed tree is turned
  and sized a little differently. That way a wood never looks copy-pasted, yet an oak still reads as an oak at a glance,
  which woodcutting needs (Claude's proposal, October 3; Mitchell had wondered whether they should all be the same).
  Everything else should get a nice texture too, the crops and plants included.
- **A more natural world, not photoreal** (October 3). Mitchell asked about going more realistic for the plants, water,
  lighting and sky ("we dont need to go crazy right away, i do want it looking nice") and left the cohesion to Claude.
  The direction is natural proportions, materials and light, still softly painted, so the blocky characters belong in
  it, as they do in the LEGO games. Photoreal is out of reach with how we build, and it would make them look pasted in.
  It comes in small steps, each shown to him as before-and-after pictures, starting once the stone and the trees land:
  1. Light and sky: a warmer sun, softer shadows, a little haze in the distance, and a real sky with clouds.
  2. Water: reflections, depth and foam on the moat, the falls and the streams.
  3. Ground, grass, plants and crops, grown like the oak.
- **Textures are sourced, not painted in code** (October 3). Mitchell: "why would you have to manually do it when you have codex for image gen and many free sources". Bark, stone, ground, grass, rock and leaves come from Codex image generation in the game's painted style or from free CC0 libraries (Poly Haven, ambientCG) toned to match, made tileable and checked in the game; code places them and adds depth and light. Characters keep their blocky painted look. First use: the oak's bark, after his note that the branches "look like bones".
- **Everything must make structural sense** (October 3): "it all has to make structural sense". His examples: the walled
  climb up to the landing "doesnt make sense the way it is built" and should have stairs, and the ledge road needs a wall
  on its other side too. He added that the insides of the buildings must work with their outsides, so the interiors are
  no problem to design. Our reading of it: where the way climbs, real stairs (flights, landings, cheek walls, a parapet
  over every drop) rather than a tilted ramp; every built terrace edge a retaining wall (natural rock edges stay rock);
  every bridge on arches or piers; every door onto a floor at its own level; and rooms, floors, stairs and windows that
  fit each building's outside, with the play camera working in every room. The castle-v4 blueprint is revised for this
  before he approves it.
- **Characters stay blocky and modular, like Lego.** Mitchell knows complex organic shapes are Claude's weak spot when
  built from pieces; trees are where we leave blocks behind, grown as one piece.
- **Small fixes carried into the build:** the champions' helmets, fewer gold diamond symbols, a longer flag on the keep,
  no flag shadow from nowhere, the fountain dragon's front legs, more variety in the small garden trees, the sunken tree
  and the grass seam by the landing.
- **How we work now:** Mitchell now has a larger usage allowance, so parallel jobs (Claude's Workflow tool or several
  agents) are used for implementation where they help, partitioned so they never edit the same code. He wants regular progress in pictures and an honest answer
  when a style is or is not achievable. Visual work comes to him straight from the builder: no separate reviewer or
  critic stage, he judges right away (to save usage).

## Foundation work (October 2)

- Mitchell approved nonvisual foundation work, starting with faster launches, save protection and memory cleanup. The current phase has mostly been visual redesign; this work preserves the existing appearance and gameplay rules while supporting the coming mechanics phase.
- Mitchell also approved improvements to context/file handling and agent development: keep guidance in `AGENTS.md` and this plan, make authoritative context easier to find, keep scratch output from disrupting the game, and provide one consistent, sequential check command. Appearance work continues separately in its own checkout.
- Mitchell requested an independent reviewer followed by automatic merging and cleanup for this work and future work; this is now part of `AGENTS.md` rather than a reminder he needs to repeat.

## Round 5 decisions (October 1 evening)

Mitchell's answers on the [Round 5 review page](https://claude.ai/artifact/LYYQ9tn49GokkaidH3zQhe). They take precedence over anything older in this document; sections below that they change are marked.

### The game's scale and shape

- **A thousands-of-hours game that keeps growing.** Levelling should be a real grind: as long as OSRS or longer. Most games make levelling too easy; this one must not.
- **The levels 1–10 region takes about 40 hours**, not 8–12: a big area with lots to do. Its route uses three bands (1–3 near the portal with a miniboss, 4–6 in the open middle with the mine entrance, 7–10 in the deep end with the region boss). "Levels 1–10" means combat level (weapon style, Hitpoints and Defence together); the region is complete when its final boss and core quests are done, not when a number is reached.
- **Main area plus rift dungeons.** The main region is where you progress through the story and quests. Alongside it, **procedural rift dungeons** can be ground for levels and loot: you tear open a temporary dimension to train in (like the Hyperbolic Time Chamber), so slow early levels stay fun because you're also grinding for cooler gear. Procedural areas must still feel purposeful, not random filler. Optional absurd quest chains still apply on top.
- **A main story.** Claude drafts it and evolves it as the game grows; Mitchell is creative director. The dimensional rupture stays the working premise; how it connects to dragons stays open.

### Classes, builds and controls (new)

- **Classes.** You choose a class at character creation, and more advanced classes can be picked up later. This replaces "every style gets early gear somehow": your class decides your starting kit.
- **Builds are the heart of replay.** Skill trees inside each class, elements and elemental combinations, mixed classes and elements, many viable builds (Chronomancer-style variety). Every new character should feel like a different game. Balance needs a good way to test builds.
- **A summoner class later**, built around dragon whelplings and summons.
- **Controls:** Space is a dodge roll toward the cursor (shared by every class; it replaces "shared dodge vs per-style escapes"), Q drinks a health potion, number keys fire abilities, with a limited number of abilities on the bar. Movement must feel nice.
- **Combat looks flashy:** strong hit effects and good damage numbers.
- **Flinch:** solid hits flinch ordinary enemies; heavy enemies build a stagger meter; bosses stagger at set moments. Don't add flinch resistance by default: in Diablo II you can keep a zombie flinching as long as you keep hitting it, and resistance could break fast attack speeds. Revisit only if playtesting shows a problem.
- **Unique and exceptional items carry extra effects:** cool combos, elemental effects, unique abilities. A fully reinforced mythic bronze item can match a plain iron one, not a plain steel one.
- **Skill-icon colours** wait until classes and elements are designed.

### Loot and upgrades

- Rarity: Normal, Magic, Rare, Unique, Mythic. Reinforce +1 to +10 with bars of the item's own metal, rising in cost; no transfer between items.

### World, island and castle

- **Home island v1 and castle v2 are approved to build**, island first, then the castle on its spur. Before building the island, check its proportions against the castle, the camera and walking distances, and adjust until it makes sense.
- **Mine:** the region's mine is a real entrance in the middle band; you come back out where you went in; enemies respawn on a timer and ore regrows per rock. Ore goes into the walls as veins, one ore per vein, with a better look: no single ore in two distinct colours, no chunky multi-coloured lumps. Fix the anvil and the smithy yard as part of the island rebuild.
- **Keep what makes sense, not by habit:** banquet tables only where a room needs them; the red-and-gold banners are not required; the portals stay (liked a lot) but can be moved wherever makes sense. Doors open on click and close behind you; interactive stations are the bank, furnace, anvil, shop and portal circle.

### Art pipeline and approval

- **New pipeline:** image generation (with examples of our art as reference) produces the item concept, the 3D model is built from that image, then the icon is made from the model. Mitchell reviews images in batches.
- **No 3D model is approved yet.** Before approving a model, Mitchell needs proof: in-game, textured renders shown at the same angle as the approved image. Flat untextured previews don't count.
- **Current model problems to fix:** the bows don't match their images at all; the staves can't be judged without textures; gauntlet shapes and textures aren't good enough; Emberforged armour and the uniques don't look as good as their image-gen versions; helmets were missing from the review; the leather body's front strap should be removed; the Ashen Crown needs a real redesign (its approved icon image exists as a starting point).
- **Characters have no thumbs**, which suits the art style. Real hands may come later when characters are improved.
- **Icons are needed for materials and quest items too**; the ore icons don't look right in the inventory.
- **The inventory must match its approved mockup more closely:** the panel outline, and the icon size and layout (they look small).
- **Bow draw:** the draw must pull one string from its middle, with the arrow level and pointing at the target.

### Order of work

1. Build the home island, then the castle.
2. Polish the castle, then the rest of the home island, and the characters, one area at a time, each judged by Mitchell from pictures before moving on (October 2).
3. Blueprint the levels 1–10 region.
4. Combat feel pass (mechanics work goes to Codex on GPT 6.1 Sol; Claude keeps design and look).

Where things stand (October 3):
- **Castle:** after the fifth round of notes (see "The new look and the great keep" above), three jobs run side by side:
  the stone finish on the castle as it stands (now reworked for flat-stone towers and stones that stand out), the
  castle-v4 blueprint around the great keep (now revised for stairs, walls, structural sense and interiors), and the
  woodcutting trees (the natural oak is done; the other five follow in its style). The review page,
  https://claude.ai/artifact/N6gcB3FxkqzgARButYqR2p, is where Mitchell pins notes and picks options; a fixed note is
  marked `status: done` and drops off the page. Once the blueprint is approved the castle is rebuilt to it; the new
  trees then replace the forests and garden trees.
- **Castle, open points:**
  - The rock's ledges currently carry no pines: the cliff scenery is seeded from the layout, so unrelated layout edits reshuffle it.
  - The short ore lane from the climb to the minecart ends short of the climb's west wall. Where it should join is undecided (the castle-v4 plan may move it anyway).
- **Characters** come after the castle and stay blocky and modular. The work is on branch `art/character-polish` (stages A–D, plus part of the first critique round). Re-create its worktree from that branch to continue.

Later: the Ashen Crown redesign, reinforcement, slower levelling (after the region and classes are designed), small fixes.

### Follow-up (October 1, late)

- **Home island v1 at its built size is OK.**
- **Props are single solid pieces**, not stacks of blocks: the Great Anvil is one forged piece on a plain stump. Nothing stands on a slab or platform that serves no purpose, and nothing passes through anything else.
- **The forge yard was rebuilt from Codex concepts** (`docs/concepts/`): the anvil and the Emberforge hearth, whose chimney and bellows are part of it.
- **The four bows were rebuilt from Codex turnarounds of their approved icons** (`docs/concepts/bow-*.jpg`): each bow's limbs are one smooth piece with the icon's curve and depth, with pointed tips. Mitchell liked the Worn Shortbow and the Hunter's Bow; the Recurve and the Drakebone needed better shape and detail, so they were remade from limb shapes traced off their icons (true recurves: the limbs swing toward the string and the tips curl away).
- **The side panel's tabs stand on top of the panel, bigger, with painted icons** made with Codex (backpack, breastplate, sword and pickaxe, journal, treasure chest, cog), as Mitchell asked; approved, spanning the panel's full width and cut from the same stone and rim as the panel so they blend in.
- **Items never cross their slot's rim:** every item picture fills the same share of its box.
- **All bows lie the same way in their icons:** tilted like the Recurve (top tip to the upper right, string below), which Mitchell liked; the Worn Shortbow, Hunter's Bow and Emberstring icons were turned to match.
- **Castle v2 stage 1 is built on the crown** (docs/CASTLE_DESIGN.md): the curtain with its seven towers, the outer and inner gatehouses, the postern, both wards and their yards, the residence range with its open hall and galleries, the kitchen, the west wing, barracks, stables and smithy. The donjon stands solid until stage 2 opens it with the west wing's upper floor; the wall walk is not playable yet.
- **Castle v3, from Mitchell's second walk round (October 2):** one big bailey with no middle wall, clearly larger; the bronze dragon, much bigger, as the centrepiece fountain on the gate-to-great-door axis; designed, connected paths and gardens; full lawn grass, not tufts; realistic water. Then: the castle buildings should match the colourful gardens and look more royal (Claude chose cream stone with blue-grey trim and royal blue and gold livery; superseded October 3: the trim is now cut from the same stone); the castle rock must look like a natural mountain, not the same shape stacked.
- **Castle look, from Mitchell's first walk round** (docs/CASTLE_DESIGN.md):
  - No house-style pitched roofs on castle buildings: every one has a flat roof behind a crenellated parapet.
  - Fewer, better windows: tall lancets, placed symmetrically.
  - The walls on the camera side stand full height (they dissolve round the hero like other tall things) instead of being cut down, which read as missing walls.
  - The wards are lush lawn, not patchy dirt, and designed as gardens. The inner court has a tiered fountain with running water, flower beds, clipped topiary, benches, two stone champions at the great door and a hedged privy garden. A bronze dragon greets you inside the outer gate.
  - No random barrels, crates or carts lying about.
- **Castle v3: one bailey, redesigned after Mitchell's second walk round** (October 2; docs/CASTLE_DESIGN.md). He found the grass a scatter of tufts, the paths disconnected, the water unrealistic, the yard's placement random (the dragon stood in the archery range), the yard too small and cut in half for no reason. Decided:
  - One bailey with no cross wall, and a larger yard (the curtain encloses about 43% more).
  - The gate on the keep's axis: gate, avenue, fountain, cour d'honneur, feast court and great door in one straight line, with the yards and gardens mirrored about it.
  - The dragon as the centrepiece, bigger, on a fountain at the crossing of the axes.
  - Every path connected into one network, with nothing placed at random.
  - Full grass on every lawn, island-wide, instead of scattered tufts.
  - Realistic water in the fountain, the stream and the pond.
  - Built: the layout (curtain, towers, gatehouse, approach along the ledge, buildings, walks, gardens and yards), the full grass, the dragon fountain (the bronze dragon rearing on its rock, water pouring from its jaws, jets from the kerb) and the realistic water in its basin and the waterfall's pools.
- **The castle's architecture made colourful and royal to match the gardens** (October 2; docs/CASTLE_DESIGN.md, "Colour and materials"). Mitchell found the yard beautiful with colour but the walls, towers and buildings one flat brown mass, and asked for the buildings to match its vibrance and look more royal ("do what you think would look good"). Decided and built:
  - Cream limestone for every castle mass (curtain, towers, gatehouse, donjon, pavilions and the castle buildings), with blue-grey dressings: string courses, one continuous coping under the merlons, corbels, machicolations, hood moulds, quoins and plinths. Trim runs as continuous lines and frames, never as per-block dots. (Superseded October 3: the dressings, quoins and plinths are cut from the same cream stone and the corbel blocks go; see "The new look and the great keep".)
  - Blue and gold livery replaces red: royal blue banners and flags edged and charged in gold (swallowtails, the gold dragon diamond), the lord's crest on the ward gates, a deep blue tympanum over the great door, gilt fittings on the great doors and blue leaves on the postern and ward gates. The gate front flies five flags in a symmetric composition. Rugs, cushions and runners inside stay crimson.
  - Spires in a hierarchy (revised after the critique round, under Mitchell's "do what you think would look good"; the donjon-only spire left the skyline a row of identical drums): the donjon's great royal-blue spire, banded in gold with four lit lucarnes; a spire over the great door's tower on the castle's axis; the six corner towers a stage taller than the wall towers, each with a blue-slate spire, gold finial and pennant. The wall towers between them stay flat and crenellated, their platforms paved as compass roses.
  - Pitched roofs on castle buildings stay rejected.
  - The great door is framed by two round masses (October 2, critique round 4, under Mitchell's "do what you think would look good"): a slim round stair turret east of the door, in the donjon's language with a spire a stage lower than the door tower's, answers the donjon's drum on the west.
  - Every castle window is a plain window: dark or softly lit glass in the lancet frame with its stone surround, no stained-glass patterns (Mitchell, October 2: "they shouldn't have random designs on them, it should be windows"). Ivy and climbing roses on ten chosen wall faces, mirrored where the plan is; dressed blue-grey kerbs wherever a lawn or gravel meets the paving; cooler paving and a dark blue-grey castle rock so the cream walls stand off both. (Superseded October 3: kerbs are cut from the same stone as the walls, and the glass is clear with a cool tint you can see into.)
  - Building roofs are designed surfaces seen from the play camera: blue lead in a two-tone diamond chequer inside a pale stone band and a gilt fillet, glazed lanterns with slate caps, roof gardens of box in planters on the two wings. The buildings take a paler cream than the curtain and towers; every curtain run carries the lord's banner on its outer face, and a gilt diamond frieze rings the gatehouse and corner towers.
  - The approach climbs to a level landing and turns through an outer gate (crenellated, portcullis, bartizans with spires, the lord's banner) onto the ledge road; the spring now breaks out of a mossy cleft in the rock and falls in two drops.
  - The garden trees are built in the same leafy blocks as the island's trees, one foliage language everywhere. (Superseded October 3: the island's trees are being redone as natural, realistic grown trees, Mitchell's pick after the first oak, and the garden trees follow that look.)
- **Castle review notes from pictures, two rounds** (Mitchell, October 2; docs/CASTLE_DESIGN.md). Decided and built:
  - The fountain's dragon is pick A: a chunky, blocky bronze sentinel sitting upright like a guardian lion, wings folded, head high, thick block legs carrying it, gold horns, spines and claws, water pouring from its open jaws.
  - Seeing the hero behind walls is pick D: a soft-edged upright rounded-rectangle window round the hero, feathered into the wall, the rest of the wall solid (replacing the round cut-away).
  - Every junction is deliberate: walls die cleanly into drums with evenly spaced merlons, every pointed arch closes on a keystone and an apex stone, the pavilions run out to the range's corners, the kitchen continues the range's front at full height under one parapet.
  - Doors fill their doorways: closed blue leaves under a lintel with a deep blue tympanum filling the arch above, the gate-close treatment, on every castle door and gate.
  - One cohesive banner and flag shape, each a single painted cloth: long banners with a deep swallowtail edged in gold, flags with a gold hoist and a forked fly.
  - Windows are real leaded glass that catches the sky, the mullion running the full light; the court wings have fewer, symmetric windows.
  - The stone's blocks keep one size on every face and run round the drums without stretching. (Refined October 3: a few block sizes, laid in courses that line up everywhere; drums are laid in flat stones, very slightly many-sided.)
  - Recognisable plants in the beds (tulips, rose bushes, lavender, delphiniums and daisies; cabbages, lettuces, carrots and leeks), blocky horses, a neater champion's helm comb, the training yard centred between matching towers, wider kitchen-garden lanes, the orchard bench clear of the tower, one continuous spring fall, and real lawn instead of loose grass tufts on the island.
- **Castle review notes, third round: no clipping, nothing floating, things stitched into real shapes** (Mitchell, October 2). He found clipping and placement problems everywhere, "shapes placed together instead of stitched into a shape that makes sense". Decided and built (this supersedes the round-two door, window and mullion entries above):
  - Every tower meets the curtain's wall walk at a real doorway (a single blue door in a dressed frame); a stair tower with its own door replaces the square turret that clipped the north-east wall; the gatehouse's drums stand on the wall's line, each with its doorway; the ward gates carry the walk over them.
  - Continuous things are one built shape: the fountain basin and coping are turned rings, box borders are one mitred outline per bed (no clumps), each building's plinth and base courses run as one band round its footprint, the climb's kerb walls and paving each run unbroken from the court to the landing (superseded October 3: the climb gets real stairs), fence rails run post to post, each gate is one arched wall, arches close on one apex stone.
  - Doors by purpose, one size each, all tall beside the hero (about 2.1): a building's door is a pair of pointed leaves 2 wide reaching 4 high; towers, the stair tower and the roof houses take one single pointed leaf 1.3 by 3; every leaf carries an iron ring at hand height (1.05); no gold straps. The kitchen garden's door is a single door.
  - Windows are clear glass tinted blue with one soft sheen of the sky over a dim room, no mullion.
  - Banners and flags are one blue all over. Arrow loops are framed cross loops, regular, on the towers' outer faces only; the curtain's faces stay plain between banners. The verge outside the walls is lawn like inside.
  - The fountain keeps only the dragon's stream (no side spouts). The donjon is smaller, clear of the corner tower and the wall, its windows one kind per storey (small, tall, broad) at one height over each band, looking out over the cour and the bower; its lucarnes are bedded in the spire.
  - The stables stand free on the stable court's axis, door in the middle between the two stalls, lanes either side, clear of the ward gate; the smithy is gone (owner-confirmed: smithing lives outside the castle walls). The landing's parapet meets the outer gate on its jamb, clear of the opening.
  - A geometry audit in the tests (tests/castle-geometry.test.ts) fails on any clipping not listed as a deliberate joint, anything floating, a door or window wrong for its wall or the hero, rock through a walk or the masonry, a building crowding a gate, a gap in a lawn's kerb, or two blocks of one stone overlapping face to face.
- **Castle review notes, fourth round: intentional masonry and landscaping polish** (Mitchell, October 2). Decided:
  - Masonry is laid as a mason would: courses line up with edges, openings and bands, with no sliced bricks at edges. Paving is laid out to fit its area. Kerbs and outer edges are single one-by-one header stones that turn every corner with no gaps. Two-tone dressings and the dark base course run unbroken to the ground (superseded October 3: no two-tone dressings; the base course is the same stone, a tone darker). Bands clear the window heads and never cross a stone awkwardly.
  - Doors are realistic wood: planks, grain and iron, stained in the blue livery rather than flat bright blue. The stone above a door is stone. Windows are very light and clearly see-through with only a slight blue tint.
  - Every door lines up with the path or wall walk that leads to it.
  - The landing's side gate is removed; the main gate is the only way in. Garden corners are filled in, no tower overlaps a garden edge, and kitchen beds start as dirt straight away with no slab or stray outline.
  - Grass blades are finer, with the lawn just as full. The flat ground at the foot of the rock gets the same grass, and the plants on the rock get distinct, recognisable models.
  - Every change is checked from several camera angles, not just the review view.
- **The castle rock, and every cliff, rebuilt as natural rock** (October 2; docs/CASTLE_DESIGN.md, "The castle rock"). Mitchell found the mountain unnatural, "the same shape stacked on each other", and asked for natural structures around it. Decided and built:
  - Cliffs are cut on natural bedding: tall beds and the odd thin one, dipping and wandering across the land, so no two faces step alike; the faces are weathered back into bays and stand out as buttresses, lean into overhangs and are cut back under ledges.
  - The rock is painted as weathered stone, not courses: big fractured facets, long vertical joints, a few broken bedding lines, dark rain streaks and ochre stains, moss in patches on the ledges.
  - Mitchell picked style C for the rock (October 2): dark blue-grey rock heavily softened by moss, rounded weathered shoulders and big irregular masses of different sizes, pines and ferns on the ledges and the lip, waterfalls with mist; never rows of same-size columns or caps. Built as a kit of ten rounded rock masses overlapped at very different sizes along every face, moss over their crowns, with no masonry footing between the road and the rock, and a second spring falling off the west buttress into the Veil.
  - Boulders lie fallen at the foot and scree spills out over the grass; grass, pines, ferns and moss grow on the ledges and along the top lip.
  - Spurs of the castle rock run out over the ground at its foot at irregular intervals, so the rock stands on great roots instead of a straight wall. None reaches a road, a kept lawn, the spring or the farm.
  - The mine's cave walls keep their stacked strata (they are a quarried, layered place).
  - The island's side is one closed shell of rock from the land's edge down to its underside (no sky through it); no rock floats beside the castle, and the drifting islets in the Veil are a few grass-capped clusters far out, bobbing slowly.
- **The 14 material and quest item icons are approved** (ores, bars, uncut gems, the Cinder Seal Fragment and the Cinder Key) and are in the game. Every item now has painted artwork.

### Already done before Round 5

Equipment models were rebuilt toward their icons (open collars, cuffs and boot tops; thumbless hands; one model per bow and staff tier), the bow string was kept in the hand, the crown shrunk as a stand-in, the approved HUD, inventory panel and 58 icons are in the game (72 since the materials batch), and combat has no stance selector. Still open from earlier plans: world props built in Blender with ruined and restored states.

## Levels 1 to 10

### The first complete adventure

**Agreed direction.** Finish the whole connected levels 1–10 region before Mitchell's proper playthrough, then move on to the next region. Development and internal testing can happen in smaller pieces, but the player-facing milestone is the cohesive adventure.

The first portal should lead to a region worth spending time in. Early areas should be larger, more open and more exploratory than the small existing maps. The goal is meaningful low-level progression with reasons to travel, gather, fight, discover things and return to useful places.

The region brings these parts together:
- Combat encounters with room to kite and reposition, and difficulty that can build as the player progresses.
- Mines and resources connected to the region rather than feeling like unrelated demonstrations.
- Dependable equipment access, exciting drops and a reason to invest gathered resources in gear.
- Quests and characters that give the area personality.
- Minibosses and other meaningful challenges.
- Exploration, hidden discoveries and secrets.
- Routes and journeys that contribute to the pacing instead of putting every activity within immediate reach.

### Progression ideas under consideration

**Agreed general loop.** Fight near the entrance, gather ore, upgrade a weapon worth keeping, and push farther into tougher territory. The user endorsed this relationship between gathering and combat progression.

**Working proposals.** Reinforcement could use +1, +2 and later upgrades. Increasingly difficult enemies would create a reason to strengthen equipment, while larger resource investments would give gathering lasting value. A glow at upgrade milestones is an optional visual expression of that investment. No fixed upgrade at every level, first-upgrade speed or maximum plus level is settled.

The region could contain smaller difficulty bands or subareas. One example discussed was a level 1–2 area with a miniboss, quests and room to expand. That is an illustration of how even early progression can have depth, not a fixed assignment of content to levels 1 and 2 or a settled schedule for levels 3 through 10.

Mine entrances could lead into underground areas, with different entrances or branches. Portals inside a region are also possible. The surface, mines and return routes should be planned as parts of the same place before choosing exact transitions.

### What the range still needs to mean

**Open.** The meaning of “1–10” must be defined: overall adventure or combat progression, individual skills, or a combination. Reaching a number also needs to be distinguished from completing the region's adventure.

The exact XP curve, time to complete the region, enemy roster, miniboss roster, quest order, rewards and level-by-level unlocks remain open. There is no agreed ten-row progression chart. The next progression design should connect these choices rather than assume the current item requirements already settle them.

The existing reference material includes equipment requirements above 10 and a Cinder Seal progression gate at Smithing 25. Those values need to be reconciled with the chosen meaning of the early region. They are not a decision to require Smithing 25 in the new first-region route.

### Questions for a complete first region
- What is the intended route through combat, gathering, equipment and quests, and where can the player make meaningful choices?
- What does the player need before each harder area, and can every intended combat style obtain dependable early gear?
- How do mines, surface routes and return points connect? What remains cleared or resets when changing areas?
- Which challenges and discoveries establish that the region is complete, beyond reaching level 10?
- Does time spent travelling, exploring and gathering make the region enjoyable at the intended pace?

## Combat and movement

### The intended feel

**Agreed direction.** Combat should feel closest to Diablo II, with some Diablo IV influence and more active skill use than a left-click and right-click pair. Dragonbound should retain its own systems rather than copy a complete ruleset from either game.

Kiting must work in practice. Early monsters should be very slow, the player's baseline movement should feel comfortable, and encounters need enough open room to create distance. Later armor, magic items or other equipment can improve movement, but basic repositioning should not depend on first finding a speed bonus.

Melee play should still require attention to health and enemy behavior. Movement, attack commitment and the time available to react need to be considered together. Slow enemy walking alone does not establish a fair encounter if projectiles, charges or attack timing remove the repositioning window.

### Functional flinch and hit recovery

**Agreed direction.** Landing a hit should briefly interrupt or hold an enemy so that the player gains real time to reposition. A visible reaction without a gameplay effect would not satisfy the intended Diablo II-like relationship between hitting and kiting.

**Open.** Decide which hits trigger flinch, how long recovery lasts, how repeated hits interact, and how heavy enemies and bosses respond. The discussion did not settle blanket immunity for heavy enemies or bosses. Existing behavior should not silently become the design rule.

**Working proposals.** Clear ordinary-enemy hit reactions, some resistance to repeated interruption, and particular boss interruption opportunities are possible approaches. They should be judged alongside pursuit speed, attack cadence, knockback, commitment, charges and projectiles.

### Dodge and active skills

A dodge or escape answer for telegraphed danger, especially circular attacks, is wanted as a design problem to solve. A limited shared dodge remains under consideration alongside distinct style-specific escape tools. The exact control, resource, timing and availability rules are open.

The existing reference includes ranged Evasive Roll, melee Leap Slam and magic control. Those examples do not decide whether every style should also receive the same dodge. They are useful points of comparison while deciding how each style avoids damage.

The desired richer skill usage does not yet set the number of hotbar slots, cooldowns, resource costs, unlock cadence or a complete ability list. Eventually, exceptional loot may change how skills behave rather than only add numerical bonuses.

### How combat should be judged

Use a short focused interactive playthrough for the behavior being changed, followed by Mitchell's judgment of the feel. Automated checks can help catch problems, but still images and numerical simulations cannot establish that kiting, attack commitment or dodging is enjoyable.

The combat review should pay particular attention to whether a landed hit creates an actual opening, whether the player can escape pursuit, and whether telegraphed attacks leave a usable response window. Recheck changed or failed behavior rather than repeatedly replaying everything.

## Equipment crafting and loot

### Dependable crafts and exciting finds

**Agreed direction.** Crafted base equipment should provide dependable access to gear. Dropped loot should supply rarity, bonuses and, eventually, effects that make skills more exciting. Both crafted and dropped equipment can be upgraded.

The endorsed example is a very powerful “mythic bronze helmet” that is much better than ordinary crafted bronze and remains eligible for upgrades. “Mythic” describes the example; the final rarity vocabulary and ladder are still open.

This keeps mining relevant even after a good drop. Finding a valuable item can create a new reason to gather resources and invest in it. Crafting keeps a separate practical role by giving the player a reliable way to obtain a chosen slot instead of depending entirely on random drops.

### Separate the equipment questions

The working framework separates three dimensions that should be considered independently:

| Dimension | Design role |
|---|---|
| Material or base | Baseline strength, material identity and equipment requirements |
| Rarity and bonuses | Exceptional finds, affixes and possible changes to skill behavior |
| Upgrade strength | Resource investment in a chosen item, whether crafted or dropped |

This is a useful framework for the design, not a finalized mathematical formula. A material name alone should not be treated as the entire measure of an item's quality.

### Reinforcement proposals and balance questions

**Working proposals.** Mining-funded +1 and +2 reinforcement can extend to later investment. The cost could rise as the item becomes stronger, and milestone glow could communicate a meaningful upgrade. A shared reinforcement path could use appropriate gathered materials for both crafted equipment and drops.

Candidate safeguards include strengthening the base contribution without automatically multiplying every affix, preserving meaningful equipment requirements, and comparing items with similar amounts of investment. These are proposals to test, not settled caps or formulas.

Later materials and regions still need to be desirable. At the same time, an exceptional early-material item may outperform an ordinary later-material item. No blanket rule that bronze can never beat iron has been agreed.

**Open.** Final reinforcement materials, costs, maximum upgrade level, scaling, affix interaction, transfer or refunds, and visual milestones all need decisions. The exact strength of a special early drop against later equipment also remains open.

### Early equipment for each combat style

Reliable early gear is needed for each intended combat style. The existing smithing reference mainly covers metal melee gear and tools, so dependable ranged and magic acquisition should be designed explicitly rather than assumed to follow the same route.

The existing catalog includes metal gear, bows, staffs, leather equipment, jewelry, tools and named uniques. Those names and historical requirements are retained in the appendix. They do not commit the first region to every item or determine when each one should appear.

Masterwork is part of the existing crafting reference and can offer excitement alongside dependable crafts. Its odds, relationship to rarity and future reinforcement balance are not settled by the design discussion.

## World regions and travel

### A larger exploratory world

**Agreed direction.** The game should grow into a very large, long-term adventure, with several portals and later regions added over time. There is no requirement to build the entire eventual world before completing the first region.

The home island and settlement should become larger and more organic or irregular, plausibly reading as land torn out of another place. A large circular island is not the preferred direction. The exact shoreline, scale, districts and map layout remain open.

**Reviewed island proposal.** A larger irregular floating island, raised northwest castle site, central portal and service space, and room for farms and future expansion received positive directional feedback. The northwest site and specific placements remain proposals. Fields, cottages, gardens, a pond and an alchemy area shown in an illustration are not a mandatory approved district roster.

Travel itself is part of the game. OSRS-style journeys contribute to enjoyment and pacing, and making everything too convenient risks making progression feel too fast. Distances and useful connections should preserve that experience rather than optimize every journey away. No numerical travel time, blanket ban on shortcuts or particular fast-travel system is agreed.

Banking, crafting or smithing, and portals are useful settlement functions. The final service roster, locations, ownership, NPC identities and shop inventories remain open. Service placement should not become a convenience cluster purely to remove walking.

### Portals and connected mines

Preserve the current portal visuals, which are liked and can provide a recognizable visual anchor. Portal appearance approval does not determine the final map, travel network or lore rules.

**Working proposals.** Place mines inside the main progression regions in the player's experience, using believable entrances that load underground spaces. Different entrances, branching mines and occasional intra-region portals are possible connection models.

**Open.** Decide where the player returns to the surface, whether a return uses the same entrance, and what happens to enemies, resources and cleared areas when travelling. Named arrival positions, region persistence and reset behavior need to be designed together.

The existing reference treats the keep, mine, Foothills, ruin and lair as separate areas and recreates zones on travel. That history should not be mistaken for a final connection model for the cohesive first region.

### Mine layout and resource readability

The reviewed mine interior is broadly acceptable. The important improvement is resource organization: recognizable ore-specific veins or pockets, rather than every ore mixed into the same patch. Resource nodes should stay out of walking lanes.

Mine mouths and approaches should be readable in the wider region. Repeated stone, wood and foliage treatments, clear entrance silhouettes, landmarks and open fighting pockets are possible ways to improve cohesion; they are visual proposals rather than a chosen final regional style.

Other mine ideas include embedding ore in walls, timber supports, tool marks and a mine cart to suggest a worked space. These remain optional visual proposals, not a required prop list.

Ore hover feedback and interaction clarity require a live check. A screenshot cannot show whether the player can identify, select and mine the intended node comfortably.

### The dimensional rupture premise

**Working story direction.** A huge rupture or rip randomly scatters areas or kingdoms across dimensions. The home settlement is one surviving fragment, and travelling through portals can reveal other fragments through the adventure.

This is the preferred working premise, but its relationship to dragons, increasing difficulty and the locations of other kingdoms remains open. The full story does not need to be solved immediately.

The earlier royal-mage-rescue suggestion is not canon. The rupture idea takes precedence as the working direction. Existing background lore is not automatically rewritten merely by recording this premise.

## Castle and settlement design

### Plan the functions before construction

**Agreed direction.** Make the castle functional and believable first. Rooms need understandable purposes, sensible connections and purposeful furnishing. Scattered props and duplicate-looking filler should not be justified simply because each object has a different name.

Use a blueprint before construction. Establish both floors, room purposes, circulation, stairs, tower connections, courtyard routes and every doorway destination before facade detail or prop placement. The constructed building should follow the chosen plan.

The latest direction is a complete castle redesign, including the footprint, courtyard and defensive walls. The old rectangular shell is not a constraint. Use actual castle references and fit the game's art; towers, wings and differentiated spaces are possible parts of the solution. Earlier praise of the existing silhouette does not override this later redesign instruction.

Redesign the island before constructing the castle so the building, its approach and the surrounding space fit the setting. The exact castle site remains dependent on the island decision.

**Replacement blueprint proposal.** The newer plan shows an irregular walled enclosure, two courtyards, an L-shaped residence and a round keep, with overview, ground-floor and upper-floor sheets. It received tentative feedback that it could work, alongside a concern about the training area overlapping the inner wall.

Later plan revisions were reported to address training-yard clearance and disconnected wall-walk stairs. The revised plan still needs final acceptance; those revisions do not establish that an in-game castle has been constructed.

A king and further story are planned later. They should not be invented now to explain otherwise unclear rooms or furnishings.

### Exterior and courtyard

Retain useful visual qualities such as the red-and-gold banners where they fit the new design, while allowing the complete footprint and defensive enclosure to change. The courtyard should have recognizable uses and routes rather than simply fill space around the building.

A training yard and a working or supply courtyard linked by worn paths were generally liked as a direction. A well, planting and main-entrance detail can support that plan. Their exact arrangement is still open.

The main castle entrance should have an actual clickable door that swings open. Door-closing behavior remains tentative. Door leaves should plausibly fit and close the openings they belong to, and every doorway should visibly lead somewhere.

The left tower's unclear openings, inconsistent relationship to the right tower, uncertain destinations and repeated office-like windows were criticized. Floor functions and connections should explain the placement of windows, doors and tower openings before exterior polish.

### Great hall and throne area

**Candidate room program.** A great hall, kitchen and pantry, storage, guard or armoury work area, and obvious upstairs access are discussed functions rather than a final approved room list. The following room ideas describe how to make their roles legible in the replacement plan.

Keep the appeal of the food and banquet tables. A hall should read as a place for communal dining or gathering, with a clear role for the main hearth and a coherent dais.

The haphazard rotated triangular ornament above the throne was disliked. A more restrained, coherent ornament is a candidate response. The two throne-flanking light-stand or lectern-like props also lacked an obvious purpose in the reviewed view; their intended brazier function needs to read visually if that function is retained.

The fireplace on the left appeared underdetailed. Whether the problem is geometry, material, texture or lighting needs closer visual examination rather than an assumed fix.

### Kitchen service spaces and storage

The west service wing is intended to support the hall as kitchen and pantry. The cooking oven should look and function distinctly from the great-hall fireplace, so the spaces do not read as duplicated hearths with no purpose.

Logs belong near the working hearth, and sacks, crates and supplies should be grouped in purposeful, accessible storage locations, usually with a believable relationship to walls and working areas. Keep routes clear instead of scattering storage into circulation space.

Furnishings should explain the activity of the room. Redundant-looking objects should be reconsidered when the plan is reviewed, rather than retained simply because there is empty floor space.

### Armoury guard spaces and the yard

The east guard or armoury wing should read as equipment storage and maintenance that supports guards and the proposed training yard. Racks, tools, a repair area and work surfaces can express that workflow.

Armour stands should support the room's practical purpose rather than make it look like an arbitrary display gallery. The exact furniture and which stations are interactive remain decisions.

Courtyard routes should connect the relevant working areas to the rooms that support them. The revised training-yard clearance and wall-walk stair connections need to be checked in the chosen plan before treating it as final.

### Stairs walls and the gameplay camera

Stair access and arrival points should be visually apparent. Existing floor travel alone does not make the architecture understandable; the player should be able to recognize how a stair connects one floor or tower to another.

The reviewed walls looked low enough to hop over and exposed adjacent rooms. Full-height physical walls and the camera's cutaway presentation must be distinguished before changing the building. The desired outcome is legible room boundaries at the gameplay camera without an implausibly low-walled castle.

The upstairs map-room image did not receive a separate room-specific verdict. Its stair arrival, room purpose and cutaway treatment should be assessed against the same principles without assuming an approval or criticism that was never given.

## Quests characters and discoveries

**Agreed direction.** The early region should contain quests, characters, minibosses, exploration and secrets. These should help it feel like an adventure with personality, not a collection of disconnected combat and gathering systems.

Optional long quest chains can become absurd and overly silly, with escalating difficult tasks, substantial rewards, interesting characters, hidden discoveries, and a mixture of humor and mystery. Their optional nature matters; the idea does not require every player to follow every chain to progress.

**Open.** Decide the relationship between the core quest route and optional chains, including which stories or secrets can continue into later regions. Specific NPCs, quest prose, steps, rewards, chain length and branching are not settled. Branching is possible rather than a requirement.

Illustrative quest ideas included a miner missing tools, a creature collecting shiny objects, trading or fighting to resolve the situation, a hidden ore pocket, and a rescued character later opening a stall. These were possible examples, not adopted quest scripts, a named cast or a branching requirement.

The early level 1–2 area with a miniboss and quests was a scale example, not an approved named quest line or fixed reward plan. No specific miniboss roster or encounter order should be inferred from it.

## Interface and equipment art

### HUD and inventory direction

**Agreed direction.** Keep a deliberate fantasy interface while making the bottom health, mana and skill area cleaner. Simplify stacked chunky framing around the orbs, improve spacing, keep key labels readable, and make icon scale and style consistent.

The cleaner HUD redesign was subsequently liked and accepted as the direction. Earlier notes saying no HUD had been accepted are superseded by that later approval. This approval concerns the interface; incidental world changes visible in a mockup are not part of it.

The first implemented HUD was rejected because thinner outlines did not match the approved image. A corrected actual screenshot was then judged much better. Visual fidelity to the accepted design matters; passing interface tests alone does not establish visual acceptance.

The inventory mockup was approved, with a later instruction to proceed. Its accepted panel direction includes a clearer Inventory header, restrained dark-and-gold treatment, better padding and selection clarity, and a separate footer for the existing coins and Sort controls. The existing 4 by 7 grid was preserved in that proposal. This does not introduce new storage capacity, stacking, sorting or equipment-slot rules.

The later approval covered the latest reviewed set of 57 equipment icons together with the inventory mockup. Design approval does not itself establish that those assets or the final inventory interface have been integrated. Other screens, including the equipment screen, remain a broader UI goal until their own specific designs are reviewed.

### Generated icons tied to the equipment

Generate equipment icons with the actual 3D equipment as reference, keeping the recognizable shape, materials, colors and distinguishing features. A polished illustrated treatment is welcome, provided it still matches what the player equips and reads well at inventory size.

A generic initial icon study was rejected because it did not match the game. The later reference-based, faceted and steel-color direction was accepted as a style, while individual assets still required corrections.

Review icons in batches rather than one at a time. Mitchell reviews the images before an approved batch is handed over for integration. Preserve that review step; an encouraging reaction to one element does not approve every detail in a batch.

Transparent item art allows the interface to choose its background. For later skill icons, category or elemental background colors are a direction to explore. A specific melee, ranged, magic or elemental color palette is not yet settled. One unapproved palette proposal uses muted rust-red for melee, forest green for ranged, violet for magic and teal for support, with small elemental accents, charcoal equipment backgrounds and rarity on borders. These are options for review, not the final color system.

Weapons should be generated upright and straight-on; rotation can be applied in the game if desired. The straight source art makes alignment easier to judge.

### Geometry and construction checks
- Swords need aligned blades, center stripes or fullers, hilts, grips and pommels. Tips should not bend or drift off-axis.
- Daggers need straight tips. Staff shafts and end caps should align without crooked or slanted ends.
- Bow grips and limbs should align and look like believable connected construction.
- Crowns should be symmetrical where the design calls for symmetry.
- A Cleave arc should correspond to the actual sword swing instead of reading as a detached decorative sweep.
- Gauntlet icons and the intended gauntlet appearance should not show projecting thumbs, in keeping with the character-model reference. This does not change the base hero's anatomy.
- Armor needs an open neck or top so it could plausibly be worn, while also reading as a dropped ground item.
- Leather straps must attach to real anchors instead of floating across the chest.

Arm-to-torso clipping is a visual quality concern. A corrected image can be accepted while the underlying model still needs attention; image approval should not be treated as proof that model geometry was fixed.

### Tier variation and unique equipment

Bow tiers should not be identical copies. Color changes and meaningful shape variation are allowed, and approved redesigned bows or staffs can serve as references for future model changes.

Staff tiers also need clear distinctions. Potion-like staff tops and slanted shaft ends were disliked. The informal description of a green staff as “crooked” was not a request for a curved design.

Unique items should look noticeably more distinctive and more impressive than ordinary gear. Their identity should survive at small icon size rather than rely on background effects alone.

The revised sword, bow and staff set received approval, and corrected leather armor was approved and later reaffirmed. These approvals do not retroactively accept earlier rejected geometry or establish that every asset has been imported.

### Visual continuity

Preserve the liked portals and banquet-table appeal. The red-and-gold banners became blue and gold in the castle's colour pass (October 2), and crimson stays inside on the hall's cloth. The full castle redesign remains the controlling architectural direction. Consistent materials, foliage, landmarks and restrained placement of bright accents are possible tools for that work.

The block-tree prototype recorded as B (stepped canopies) was the earlier visual reference; the trees are being redone (October 3). Exact regional style and layout still need to be judged in context. An isolated still cannot establish interaction, collision, travel pacing or combat feel.

## Decisions still to make

Answered in Round 5 (see "Round 5 decisions"): the meaning of levels 1–10 and region completion, the route and its length, the levels 1–2 area as the first concrete design, mine entrances and resets, flinch, dodge, rarity and reinforcement, early-item strength, starting gear (by class), core and optional content (main area plus rift dungeons), island and castle selection, doors and stations.

Still open:
1. The class roster, each class's skill tree, the element system and how classes and elements mix.
2. How rift dungeons are generated, rewarded and kept purposeful.
3. The levels 1–2 area in full: its miniboss, quests and secret.
4. The XP curve and numbers that make the region take about 40 hours.
5. Skill-icon colours, once classes and elements exist.
6. How the dimensional rupture connects to dragons and difficulty (can stay open).

## Existing item reference

The following catalog is an October 1, 2026 reference snapshot. It preserves names and recorded values for comparison while the new early-region progression is designed. These values are not the approved levels 1–10 balance or a promise that every listed item belongs in that region.

The snapshot contains 57 equipment entries: 48 base gear items, four pickaxes and five named uniques. Fourteen additional material and quest entries bring the full item reference to 71 entries.

### Material tier fields

The equip requirement refers to the relevant skill: Melee for metal weapons, Defence for metal armor and Mining for pickaxes. It is not a universal player or region level. The smithing base and piece offset are separate catalog fields, not a complete recipe definition.

| Material | Equip skill level | Smithing base | XP per bar | Tier min item level |
|---|---|---|---|---|
| Bronze | 1 | 1 | 12.5 | 1 |
| Iron | 10 | 15 | 25 | 4 |
| Steel | 20 | 30 | 37.5 | 9 |
| Emberforged | 30 | 40 | 60 | 15 |

### Metal equipment names

Each row identifies all four exact material variants. Shared shapes do not erase the material differences.

| Bronze | Iron | Steel | Emberforged |
|---|---|---|---|
| Bronze Sword | Iron Sword | Steel Sword | Emberforged Sword |
| Bronze Longsword | Iron Longsword | Steel Longsword | Emberforged Longsword |
| Bronze Med Helm | Iron Med Helm | Steel Med Helm | Emberforged Med Helm |
| Bronze Full Helm | Iron Full Helm | Steel Full Helm | Emberforged Full Helm |
| Bronze Chainbody | Iron Chainbody | Steel Chainbody | Emberforged Chainbody |
| Bronze Platebody | Iron Platebody | Steel Platebody | Emberforged Platebody |
| Bronze Gauntlets | Iron Gauntlets | Steel Gauntlets | Emberforged Gauntlets |
| Bronze Boots | Iron Boots | Steel Boots | Emberforged Boots |
| Bronze Pickaxe | Iron Pickaxe | Steel Pickaxe | Emberforged Pickaxe |

### Piece crafting reference

| Piece | Slot or type | Smithing offset | Bar count |
|---|---|---|---|
| Sword | weapon | 0 | 1 |
| Longsword | weapon | 6 | 2 |
| Med Helm | helm | 2 | 1 |
| Full Helm | helm | 7 | 2 |
| Chainbody | body | 9 | 3 |
| Platebody | body | 13 | 5 |
| Gauntlets | gloves | 4 | 1 |
| Boots | boots | 5 | 1 |
| Pickaxe | tool | 0 | 2 |

### Metal base stat reference

Damage, armor, speed and swingTicks are captured base fields. Speed and swingTicks are reproduced without an invented unit conversion. Minimum item level is a separate item field and must not be read as the player requirement.

| Piece | Bronze | Iron | Steel | Emberforged |
|---|---|---|---|---|
| Sword | 3–6 damage speed 1.25 min item 1 | 5–9 damage speed 1.25 min item 4 | 7–13 damage speed 1.25 min item 9 | 10–17 damage speed 1.25 min item 15 |
| Longsword | 5–9 damage speed 1 min item 2 | 7–13 damage speed 1 min item 5 | 10–18 damage speed 1 min item 10 | 14–24 damage speed 1 min item 16 |
| Med Helm | 2 armor min item 1 | 4 armor min item 4 | 6 armor min item 9 | 9 armor min item 15 |
| Full Helm | 3 armor min item 2 | 6 armor min item 5 | 9 armor min item 10 | 13 armor min item 16 |
| Chainbody | 4 armor min item 3 | 8 armor min item 6 | 12 armor min item 11 | 17 armor min item 17 |
| Platebody | 6 armor min item 4 | 11 armor min item 7 | 16 armor min item 12 | 23 armor min item 18 |
| Gauntlets | 1 armor min item 2 | 2 armor min item 5 | 4 armor min item 10 | 6 armor min item 16 |
| Boots | 1 armor min item 2 | 2 armor min item 5 | 4 armor min item 10 | 6 armor min item 16 |
| Pickaxe | swingTicks 5 | swingTicks 4 | swingTicks 4 | swingTicks 3 |

### Bows and staffs

“None listed” means the captured item has no requirement field. It is not a separate design decision that the item unlocks at skill level 1.

| Weapon | Requirement | Damage | Speed | Min item level |
|---|---|---|---|---|
| Worn Shortbow | None listed | 2–5 | 1.1 | 1 |
| Hunter's Bow | Ranged 10 | 4–8 | 1.1 | 4 |
| Recurve Bow | Ranged 20 | 6–11 | 1.05 | 9 |
| Drakebone Bow | Ranged 30 | 8–15 | 1.05 | 15 |
| Apprentice Staff | None listed | 3–6 | 1 | 1 |
| Oak Staff | Magic 10 | 5–10 | 1 | 4 |
| Runed Staff | Magic 20 | 7–14 | 0.95 | 9 |
| Emberwood Staff | Magic 30 | 10–18 | 0.95 | 15 |

### Leather and jewelry

| Item | Slot | Requirement | Armor | Min item level |
|---|---|---|---|---|
| Leather Cap | Helm | None listed | 2 | 1 |
| Leather Body | Body | None listed | 4 | 1 |
| Leather Gloves | Gloves | None listed | 1 | 1 |
| Leather Boots | Boots | None listed | 1 | 1 |
| Bone Amulet | Amulet | None listed | None listed | 1 |
| Jade Amulet | Amulet | None listed | None listed | 6 |
| Copper Ring | Ring | None listed | None listed | 1 |
| Silver Ring | Ring | None listed | None listed | 6 |

### Named unique equipment

The catalog records these names and base mappings. It does not define their complete special powers here. Wyrmbone Harness is the current display name of the entry with the legacy internal name Scaleguard; those are not two separate current uniques.

| Unique | Base item | Requirement | Min item level |
|---|---|---|---|
| Cinderfang | Steel Longsword | Melee 20 | 10 |
| Emberstring | Recurve Bow | Ranged 20 | 9 |
| Staff of Kindled Ash | Runed Staff | Magic 20 | 9 |
| Ashen Crown | Iron Full Helm | Defence 10 | 5 |
| Wyrmbone Harness | Steel Chainbody | Defence 20 | 11 |

### Materials and quest objects

| Group | Exact catalog names |
|---|---|
| Ores and resources | Copper Ore, Tin Ore, Iron Ore, Coal, Emberite Ore |
| Bars | Bronze Bar, Iron Bar, Steel Bar, Emberforged Bar |
| Gems | Uncut Sapphire, Uncut Emerald, Uncut Ruby |
| Quest objects | Cinder Seal Fragment, Cinder Key |

Mining XP, yields, respawn timing, smelting ratios, acquisition locations, complete recipes and quest rewards are not defined by these name and item-field tables. They remain separate progression-design work.

## Source notes

All dates and times in these notes are UTC. The design record is current through the October 1 conversations covered below. Later direct approvals take precedence over earlier provisional approval status.
- October 1, 2026, 01:39–01:42: game identity, Diablo II and IV influences, OSRS-style progression, kiting, larger areas, mining within portal regions and the initial levels 1–10 proposal.
- October 1, 2026, 02:24–02:34: connected first region, upgrade-funded mining, possible difficulty bands and a level 1–2 miniboss example, completing the region before the proper playthrough, slow enemies, exceptional bronze loot, functional flinch and focused playtesting.
- October 1, 2026, 03:00–03:22: castle and mine screenshot feedback, functional room planning, blueprint-first construction, organic island direction, the dimensional rupture premise, cleaner HUD approval and equipment-based generated icons.
- Working design plan, version 2, updated October 1, 2026 at 03:18: consolidated confirmed direction, candidates, open decisions and detailed castle and region notes. Its earlier HUD approval status is superseded by the later conversation.
- Existing equipment model reference catalog and companion report, October 1, 2026 at 05:22: exact item names, captured material and equipment fields, catalog coverage and naming distinctions.
- October 1, 2026, 03:57–05:45: rejection of the generic icon study and mismatched HUD, complete castle and defensive-wall redesign, corrected HUD approval, replacement-blueprint review, island-before-castle order, model-referenced icon style, armor construction, tier variation and distinctive uniques.
- October 1, 2026, 14:03–14:57: reviewed island proposal, tentative skill-background palette, journey-based pacing correction, revised castle-plan status, equipment-art approval and upright weapon generation.
- October 1, 2026, 15:03–16:03: leather strap correction, approved inventory design, approval covering the latest reviewed 57 equipment icons and inventory mockup, and reaffirmed leather armor approval.
