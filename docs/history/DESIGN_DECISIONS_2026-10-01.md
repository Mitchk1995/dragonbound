# Design plan history

Parts of the design plan that are done or superseded, moved out of [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md) on October 3. Background, not direction.

## Working-process decisions (now rules in AGENTS.md)

- **How we work now:** Mitchell now has a larger usage allowance, so parallel jobs (Claude's Workflow tool or several
  agents) are used for implementation where they help, partitioned so they never edit the same code. He wants regular progress in pictures and an honest answer
  when a style is or is not achievable. Visual work comes to him straight from the builder: no separate reviewer or
  critic stage, he judges right away (to save usage).

## Foundation work (October 2)

- Mitchell approved nonvisual foundation work, starting with faster launches, save protection and memory cleanup. The current phase has mostly been visual redesign; this work preserves the existing appearance and gameplay rules while supporting the coming mechanics phase.
- Mitchell also approved improvements to context/file handling and agent development: keep guidance in `AGENTS.md` and this plan, make authoritative context easier to find, keep scratch output from disrupting the game, and provide one consistent, sequential check command. Appearance work continues separately in its own checkout.
- Mitchell requested an independent reviewer followed by automatic merging and cleanup for this work and future work; this is now part of `AGENTS.md` rather than a reminder he needs to repeat.

## Built and since replaced

- **Castle v2 stage 1 is built on the crown** (docs/CASTLE_DESIGN.md): the curtain with its seven towers, the outer and inner gatehouses, the postern, both wards and their yards, the residence range with its open hall and galleries, the kitchen, the west wing, barracks, stables and smithy. The donjon stands solid until stage 2 opens it with the west wing's upper floor; the wall walk is not playable yet.

### Already done before Round 5

Equipment models were rebuilt toward their icons (open collars, cuffs and boot tops; thumbless hands; one model per bow and staff tier), the bow string was kept in the hand, the crown shrunk as a stand-in, the approved HUD, inventory panel and 58 icons are in the game (72 since the materials batch), and combat has no stance selector. Still open from earlier plans: world props built in Blender with ruined and restored states.

## Castle and settlement design (October 1, the castle before v2)

### Plan the functions before construction

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
