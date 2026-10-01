# Dragonbound design decisions
*October 1 2026*

Dragonbound is a long-term action RPG with combat led by Diablo II, some Diablo IV influence, richer active skills, and OSRS-style gathering and progression. The immediate design target is a complete, cohesive levels 1–10 region that makes combat, mining, equipment, quests and exploration feel like one adventure.

This reference brings the agreed direction, working ideas and open choices together for continued design. The first region comes first; the world can grow into a much larger adventure after that. The item appendix preserves an existing catalog snapshot separately from the new progression decisions.

**Decision status:** Agreed direction records the intended experience. Working proposals describe ideas still being shaped. Open decisions need a choice or testing. Existing reference values describe the October 1 catalog and are not final balance for the first region.

**This is the single design plan.** Any agent (Claude or Codex) that hears a decision from Mitchell records it here, in the same session; decisions that only live in a chat get lost. Newer direct decisions take precedence over older text, so record what changed, in the section below or in place.

## Updates since this document

Afternoon of October 1, 2026, after Dot's document was written.

- **3D item models match their approved icons.** Done in the game for every piece of equipment and every unique: open collars, cuffs and boot tops with a dark inside; thumbless gloves and gauntlets; one model per bow tier and per staff tier; bone horns on the Emberforged helm. New items get an approved icon first, then a model that matches it ([art contract](ART_CONTRACT.md)).
- **Hands: needs Mitchell's confirmation.** Mitchell said "our characters have no thumbs", so the hero's and the cultist's thumbs were removed. This document says thumbless gauntlets "do not change the base hero's anatomy". Confirm which stands; restoring the thumbs is a small change.
- **Ashen Crown: redesign.** The open circlet built to match its icon looked too big and weird in the game. It has been shrunk as a stand-in. Next: a new crown design generated with Codex (concept, then icon), reviewed by Mitchell, then a matching model.
- **Bow draw fixed.** The string now stays in the drawing hand through the whole draw. Before, it floated between the bow and the hand until the moment of release.
- **Image generation.** Use Codex image generation for design work when it helps (concepts, icons, mockups). Mitchell reviews images in batches before anything is integrated (see "Generated icons tied to the equipment").
- **Already in the game:** the approved cleaner HUD, the approved inventory panel and all 58 approved equipment icons; combat with no stance selector; the current two-floor keep. The castle-v2 and home-island-v1 blueprints exist as proposals only ([blueprints](blueprints/)).
- **Still open from earlier plans:** world props built in Blender with ruined and restored states.

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

Preserve the liked portals and banquet-table appeal, and carry forward useful details such as the red-and-gold banners where they fit the new castle. The full castle redesign remains the controlling architectural direction. Consistent materials, foliage, landmarks and restrained placement of bright accents are possible tools for that work.

The preferred tree option recorded as B is part of the existing visual reference. Exact regional style and layout still need to be judged in context. An isolated still cannot establish interaction, collision, travel pacing or combat feel.

## Decisions still to make

The following choices remain open. They should be resolved as connected parts of the first region and its home settlement rather than silently filled in during construction.
1. What does levels 1–10 measure, and what marks completion of the region beyond reaching a number?
1. What is the connected route through encounters, gathering, equipment, quests and discoveries, and how long should the full adventure take?
1. Which early enemies, minibosses, quests and rewards belong in each part of the region? The level 1–2 example still needs a concrete design.
1. Where are mine entrances and return points, and what persists or resets during travel?
1. What flinch triggers, recovery times and repeat-interruption rules create fair kiting? How do heavy enemies and bosses respond?
1. Does every style receive a shared limited dodge, or do distinct escape tools provide the answer? How do warnings and attack commitment fit?
1. What are the final rarity names, reinforcement materials, costs, scaling and limits? Do upgrades transfer or refund?
1. How strong can an exceptional early-material item become relative to equally invested later gear, and how do affixes scale?
1. How does each combat style reliably obtain early equipment, especially ranged and magic?
1. Which quests form the core route, which chains remain optional, and which secrets continue into future regions?
1. What island footprint and castle blueprint are selected? Confirm the revised training-yard clearance and wall-walk stairs, courtyard circulation, door destinations and room functions.
1. Can castle doors also close, and which workstations or furnishings are interactive?
1. What final skill-icon background colors and tier-specific equipment shapes should be used?
1. How does the dimensional rupture connect to dragons and increasing difficulty? This can remain open while the first region develops.

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
