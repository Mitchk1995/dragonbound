# Castle and home island

Part of the design plan; the index and the current direction are in [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md). The castle as built is described in [CASTLE_DESIGN.md](../CASTLE_DESIGN.md) and its plan in [blueprints/castle-v4/](../blueprints/castle-v4/README.md); the October 1–2 rounds that built castles v2 and v3 are in [castle-rounds.md](castle-rounds.md). Newer decisions take precedence over older ones. Record each new decision here, dated, in the same session it is made.

## Where the castle stands (October 3)

- **Castle 1.3× rejected; the castle and every area rethought (October 3, evening).** Mitchell on the 1.3× castle (30 pins, notes in `D:\dragonbound-archive\notes\castle-1-3x`): "the insides are complete trash and the outsides are all too plain and its way too small nothing is the right size the bricks are all different sizes and not lined up". He said every stair, inside and on the climb up, fails: "none of it looks like stairs". The buildings in the castle court "are all horrible too". His direction: "build out of like lego pieces… instead of fucking with textures"; use real LEGO pieces, not invented block sizes. Buildings only: ground, trees and rocks stay painted. The castle's purpose: "the castle is just for the king and whatever royal guards and stuff and really nothing else but quests and maybe some little things". It is not a town; "the town that is the hub is below on the ground". Size: grand but walkable. "We arent even keeping any of the areas really… we are working on the hub town and then designing very large areas… for the 1-10 and very long term stuff." So the order is: the brick kit at the hero's minifigure scale, proven on one town house; then the hub town; then the castle redesigned as the king's seat; then the levels 1–10 areas. Everything below about the castle's stone, stairs, rooms and court buildings is superseded where it conflicts.
- **Castle v4 built (October 3):** all six stages of the approved plan are merged (PRs #78, #81, #82, #83, #85, #86): the ground plan, the great keep, the moat and the rock, the approach and gate front, the north range and the bailey's buildings, and the bailey's grounds. `docs/CASTLE_DESIGN.md` describes it as built and where it departs from the plan. Awaiting Mitchell's look, one area at a time from pictures.
- **Castle:** after the fifth round of notes (see "The new look and the great keep" below), three jobs run side by side:
  the stone finish on the castle as it stands (now reworked for flat-stone towers and stones that stand out), the
  castle-v4 blueprint around the great keep (approved October 3), and the
  woodcutting trees (all six species are built and the game's woods now grow them, awaiting Mitchell's look). The review page,
  https://claude.ai/artifact/N6gcB3FxkqzgARButYqR2p, is where Mitchell pins notes and picks options; a fixed note is
  marked `status: done` and drops off the page. Now the blueprint is approved the castle is rebuilt to it. Stage 1 (the ground plan) is in: the castle's layout lives in
  `src/world/castle/` and its props in `src/world/castleProps/`; the keep and the other buildings stand as plain shells
  in today's style. Stage 3 (moat, water and the rock) is in: the moat stands 2 m under the turf on all four sides and
  in the basin behind the keep, held by a dressed outer bank with a stone coping, the curtain, its towers and the gate's
  drums rising out of it on battered plinths; two springs spill into the basin from arched spouts, a sluice in the west
  bank feeds the west fall through a rock channel, and the moat leaves by the bastion's culvert as the south fall. The
  moat's still water mirrors the walls round it; the crown's edge wanders in bays and spurs, the rim beyond the moat
  grows the island's meadow grass and the turf thins out short of every brink. Awaiting Mitchell's look.
  Stage 6 (the bailey's grounds) is in: the two walled gardens on their stairs' axes (the kitchen garden's four boxed
  vegetable quarters with fruit trained on its walls round a well, the privy garden's lawns with shade maples, benches,
  flower beds, a basin and the rose arbour), each with a gate into its yard and one on its cross walk out to the cour;
  the stable yard and the muster yard furnished; the paddock fenced with its gate on the south walk, an oak, hay, water
  and five horses; the training yard with its archery butts, shooting line, pells and arms racks; the parterre's
  blossom trees now grown trees in pink and white, a lozenge of flowers in each panel and spiral and tiered topiary;
  tall clipped yews along the forecourt and by the garden walks, a tree on each forecourt lawn; the grand stair and
  the garden stairs built in twelve real steps. Carried fixes: the champions stand on the grand stair's cheeks in an
  open-faced plumed helm, the dragon's forelegs are jointed (shoulder, elbow, forearm, paw), the gold diamonds are gone
  from the towers' and the gatehouse's bands and from the fountain and the statues (kept on banners and flags), and the
  flags high on the towers and the gatehouse cast no shadow into the bailey. Awaiting Mitchell's look.
- **Castle, open points:**
  - The rock's ledges currently carry no pines: the cliff scenery is seeded from the layout, so unrelated layout edits reshuffle it.
  - Stage 1 departures from the plan, for the later stages: the wall towers stand 1.7 m out from the curtain's line
    (plan 2.2) so today's walls die into their drums and the walk's doorways fit in them; the north range stands a cell clear of the north curtain (today's
    wall walk overhangs its inner face), so building it hard against the curtain (stage E) needs the walk changed there;
    the keep's galleries are at the walk's level less 6 cm (on a course line); the farm's plots moved 2 m west as well as
    8 m south, clear of the new pool.
  - Stage 3 departures: the moat's outer bank is set out on the cell grid (its splays true diagonals, none more than
    half a metre off the plan), so no step of the bank's earth shows in front of its face; the weir and the culvert's
    mouth under the bridge are not modelled (out of sight under the bridge's south arch); the rock faces of the knolls
    seen from below are still the cliff generator's broad facets.
  - Stage 6 departures: each garden's side gate stands on the garden's cross axis and opens across the lawn to the cour
    (the plan put it on the north walk, where the garden's corner leaves no room for it); the training yard's butts stand
    before the barracks and its pells by the curtain (seen from the play camera, the south curtain hid butts against it);
    the wall towers' drums bulge 0.4 m into the paddock and the training yard, so their fences stop at the drums.

## The new look and the great keep (October 3)

Mitchell's fifth round of castle picture notes (38 notes, kept with their marked pictures in
`D:\dragonbound-archive\notes\castle-round5`) came down to three things, and he picked from Codex paintings
(`D:\dragonbound-archive\codex\castle-grand-options.png`, `stone-options.png`, `trees-options.png`). The trees pick is in [trees.md](trees.md):

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
  **Accepted October 3** after the second pass: one cream stone with deep joints and lit edges, towers laid in flat
  stones, the trim cut from the same stone, and a real window kit (an opening through the wall, leaded glass you see
  through with a cool tint, a lit room behind), which Mitchell liked. Further polish (bluer glass, crisper blocks) comes
  with the castle-v4 build if needed.
- **Everything must make structural sense** (October 3): "it all has to make structural sense". His examples: the walled
  climb up to the landing "doesnt make sense the way it is built" and should have stairs, and the ledge road needs a wall
  on its other side too. He added that the insides of the buildings must work with their outsides, so the interiors are
  no problem to design. Our reading of it: where the way climbs, real stairs (flights, landings, cheek walls, a parapet
  over every drop) rather than a tilted ramp; every built terrace edge a retaining wall (natural rock edges stay rock);
  every bridge on arches or piers; every door onto a floor at its own level; and rooms, floors, stairs and windows that
  fit each building's outside, with the play camera working in every room. The castle-v4 blueprint was revised for this
  and then approved (below).
- **Castle v4 must make structural sense (October 3, notes on the first v4 pictures).** The ramp up to the ledge becomes
  stairs (a stone stair of four flights with level landings); the ledge road has a wall on both sides; the whole plan is
  checked as a mason would build it. Every enterable building's inside must work with its outside, with a simple interior
  plan for each (`docs/blueprints/castle-v4/castle-v4-interiors.png`).
- **Castle v4 plan notes (October 3, pins on the plan).** The moat goes round the back too, so it rings all four sides
  and the keep's back rises out of it; the ledge walk, the lookout and the rock round them are shaped naturally, with the
  walls following and sitting on the natural rock (and the same for the landing and the crown's whole edge). Roofs: pick
  B, steep blue slate roofs as in the painting on the great hall and the chapel; the kitchen and the solar stay flat
  behind battlements so the keep stays the star.
- **Castle v4 approved (October 3, on the decision page).** The revised plan (`docs/blueprints/castle-v4/`) is the plan
  to build, superseding its open choices: slate roofs on the hall and the chapel only, the keep at 28 m (spires 44), one
  waterfall to the stream under the gate terrace (today's west fall off the brink stays), the belvedere and the little west gate gone, today's gatehouse unchanged, the farm
  moved 8 m south.
- **Small fixes carried into the build:** the champions' helmets, fewer gold diamond symbols, a longer flag on the keep,
  no flag shadow from nowhere, the fountain dragon's front legs, more variety in the small garden trees, the sunken tree
  and the grass seam by the landing.
- **Engine choice comes first** (October 3). Mitchell wants the engine (our game, Godot or Unreal) settled first, and the castle's five progress-step items were taken off the decision page because the finished castle supersedes them; the trees, text and character items stay. His 27 notes on the finished castle's hall, chapel, stables and barracks (`D:\dragonbound-archive\notes\castle-round6`) are being fixed now that the engine is settled: bricks that do not line up across faces, tops and corners almost everywhere, a rose window that cuts circles out of the wall, a detached chapel roof, double hall windows, and interiors to rethink (climbable stairs not jammed against walls, no camp fire in the hall, room to dine, furniture clear of doors, no rail line running over doors).
- **Castle 1.3× bigger (pick B, October 3).** Mitchell felt the castle and its things looked small next to the hero. They were built to real-life sizes (1 m stairs, ordinary doors and tables) while the hero is a chunky 2.1 m. Picked from in-game mock-ups at 1×, 1.3× and 1.5×: the whole castle grows 1.3× (the island reshaped to fit), the stone blocks and paving keep their present size (more courses, not bigger blocks), and stairs, tables, benches and rooms are then sized to the hero. 1.5× was rejected: horses towering over him, oversized masonry, walks half as long again. The round 6 interior and facade fixes are built at the new size.

## Round 5 decisions (October 1 evening)

- **Home island v1 and castle v2 are approved to build**, island first, then the castle on its spur. Before building the island, check its proportions against the castle, the camera and walking distances, and adjust until it makes sense.
- **Keep what makes sense, not by habit:** banquet tables only where a room needs them; the red-and-gold banners are not required; the portals stay (liked a lot) but can be moved wherever makes sense. Doors open on click and close behind you; interactive stations are the bank, furnace, anvil, shop and portal circle.

## Follow-up (October 1, late)

- **Home island v1 at its built size is OK.**
- **Props are single solid pieces**, not stacks of blocks: the Great Anvil is one forged piece on a plain stump. Nothing stands on a slab or platform that serves no purpose, and nothing passes through anything else.
- **The forge yard was rebuilt from Codex concepts** (`docs/concepts/`): the anvil and the Emberforge hearth, whose chimney and bellows are part of it.

## Plan the functions before construction (October 1)

**Agreed direction.** Make the castle functional and believable first. Rooms need understandable purposes, sensible connections and purposeful furnishing. Scattered props and duplicate-looking filler should not be justified simply because each object has a different name.

Use a blueprint before construction. Establish both floors, room purposes, circulation, stairs, tower connections, courtyard routes and every doorway destination before facade detail or prop placement. The constructed building should follow the chosen plan.
