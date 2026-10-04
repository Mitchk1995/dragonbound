# Dragonbound design decisions
*October 4 2026*

Dragonbound is a long-term action RPG with combat led by Diablo II, some Diablo IV influence, richer active skills, and OSRS-style gathering and progression. The immediate design target is a complete, cohesive levels 1–10 region that makes combat, mining, equipment, quests and exploration feel like one adventure.

This reference brings the agreed direction, working ideas and open choices together for continued design. The first region comes first; the world can grow into a much larger adventure after that.

**Decision status:** Agreed direction records the intended experience. Working proposals describe ideas still being shaped. Open decisions need a choice or testing. Existing reference values describe the October 1 catalog and are not final balance for the first region.

**This is the single design plan: this page and its area files in `docs/plan/`.** Any agent (Claude or Codex) that hears a decision from Mitchell records it in its area's file, dated, in the same session, and updates that area's line under "Current direction" when the direction changes; decisions that only live in a chat get lost. Newer direct decisions take precedence over older text. A job reads this page and then only its own area's file.

| Area | File |
|---|---|
| Building kit and approved bakery, hub-town terrain and layout plan, castle as the king's seat | [plan/castle.md](plan/castle.md) |
| The castle's October 1–2 rounds: masonry, doors, windows, banners, the rock, no clipping (in force unless marked superseded) | [plan/castle-rounds.md](plan/castle-rounds.md) |
| Characters, enemies, NPCs and equipment models | [plan/characters.md](plan/characters.md) |
| Dragons | [plan/dragons.md](plan/dragons.md) |
| Trees | [plan/trees.md](plan/trees.md) |
| Interface, painted text and icons | [plan/ui.md](plan/ui.md) |
| The look: light, sky, water, textures and the engine | [plan/look.md](plan/look.md) |
| World, regions, travel and mines | [plan/world.md](plan/world.md) |
| Progression, loot, quests and the first region | [plan/gameplay.md](plan/gameplay.md) |
| Combat, classes and controls | [plan/combat.md](plan/combat.md) |
| The October 1 item catalog (reference, not balance) | [plan/items.md](plan/items.md) |
| Done and superseded entries, and the October 1 source notes | [history/DESIGN_DECISIONS_2026-10-01.md](history/DESIGN_DECISIONS_2026-10-01.md) |

Visual jobs also start from "The look" in [ART_CONTRACT.md](ART_CONTRACT.md). The castle as built is in [CASTLE_DESIGN.md](CASTLE_DESIGN.md).

## Current direction

One line per area; the area's file holds the decisions themselves, in Mitchell's words where he gave them.

- **Rethinking everything (October 3, evening):** the castle and every area are being rethought; none of today's areas is precious. **Buildings are built from a modular kit of pieces on one grid** at the hero's minifigure scale, so sizes and courses always line up. It is LEGO's building logic, not literal LEGO (October 4): no studs or snap parts, any shape a building needs, and every piece textured. The kit is for logic, not the look: buildings, furniture and props look natural and real, like the trees; only the characters stay blocky minifigures (October 4). The second bakery is approved and proves the kit (October 4). Next is the **hub town on the ground below the castle** (the hub: bank, smithy, shop, portals, quest givers), then the castle, then the very large levels 1–10 areas. The town's three built layout options were rejected; one drawn terrain and layout plan with cross-sections awaits Mitchell's verdict before anything is built.
- **Castle:** the king's seat: the king, his royal guards, quests and little else for now. It is not a town or a hub. Grand to look at but walkable, with only the rooms it needs. Castle 1.3× was rejected (interiors, stairs, stone and the court buildings all failed). It will be redesigned and rebuilt from the building kit after the hub town, with one drawn terrain and layout plan approved before construction. Everything must make structural sense: real stairs that lead somewhere, and interiors that fit their outsides.
- **Characters:** blocky and modular, like LEGO. The five redesigned sheets (hero, Goblin Grunt, Kobold Slinger, Ember Cultist, Cinder Priest) are built; every gear piece must fit the new hero. Every humanoid's hands are one-piece LEGO hands with no thumbs and its arms bend at elbows, in the game awaiting Mitchell's verdict; so are the hero's minifigure hips (the legs hinge under level hips, so no leg shows through any skirt), the goblin's and kobold's hips built the same way, and the bow fixed to face the archer in every state, proved by measurement every frame (October 4, Mitchell: "holding bow completely backwards", then "still held wrong"): carried ready in front of the hip, angled down and forward, back forward, string toward him, the hand on the middle of its grip; drawn side-on with the hand at the jaw (the chin is out of a minifigure's reach). The hero, his gear and the goblin have UVs, baked maps and painted materials; the goblin's textures are approved, and the hero's metal was rejected and awaits correction (October 4).
- **Dragons:** the redrawn drakeling and Cinderwing are built; round 3 (paws, Cinderwing's chest scutes and tapered tail, the drakeling's one-piece skull) is in the game awaiting Mitchell's verdict.
- **Trees:** natural, true-size trees grown as one piece, in the woodcutting ladder (tree, oak, willow, maple, yew, magic). The oak and the common tree are approved; the rest grow in the game's woods, with roots that flare into the ground, awaiting his verdict.
- **Interface and text:** all game text in painted alphabets, coloured by meaning (palette A, approved as built); title logo C; the title screen is the castle at night (C), built after the new keep and the lighting; damage numbers are painted digits.
- **The look:** a more natural world, not photoreal, in steps shown before and after: light and sky, then water, then ground, plants and crops. Textures are sourced (Codex or CC0), never painted in code; surface maps B. We stay in the browser (engine pick A), always on the newest tools.
- **World:** multi-level zones with hills, cliffs and heights are wanted, nothing settled yet; the region's mine is a real entrance in the middle band.
- **Progression and loot:** a thousands-of-hours grind; the levels 1–10 region takes about 40 hours in three bands; a main area plus procedural rift dungeons and a main story; rarity Normal to Mythic, reinforcement +1 to +10.
- **Combat:** a class chosen at creation, with skill trees and elements; Space is a dodge roll, Q a health potion, number keys the abilities; flashy hits; solid hits flinch ordinary enemies with no flinch resistance by default.

### Order of work

0. **The immediate code cleanup is complete (October 4).** The inspection harness, shared Blender helpers and gear builders are split into focused files within the size limit. Checks, model equivalence and live game inspection passed without changing the game's look or rules. The castle and old building files and their tests remain until the castle is rebuilt from the kit.
1. The building kit is proven by the second bakery, approved October 4; the town will need more kinds of house and a better oven.
2. The hub town on the ground below the castle: one drawn terrain and layout plan with cross-sections awaits Mitchell's verdict. Build nothing until it is approved, then one piece at a time.
3. The castle as the king's seat, with one drawn plan approved before construction.
4. The very large levels 1–10 areas, then the long-term world.
5. Characters, one area at a time, each judged by Mitchell from pictures before moving on (October 2).
6. Combat feel pass (Claude does the mechanics too; Codex access is ending, October 4).

Later: the Ashen Crown redesign, reinforcement, slower levelling (after the region and classes are designed), small fixes.

## Decisions still to make

Answered in Round 5 (see the Round 5 sections of [gameplay.md](plan/gameplay.md), [combat.md](plan/combat.md), [world.md](plan/world.md) and [castle.md](plan/castle.md)): the meaning of levels 1–10 and region completion, the route and its length, the levels 1–2 area as the first concrete design, mine entrances and resets, flinch, dodge, rarity and reinforcement, early-item strength, starting gear (by class), core and optional content (main area plus rift dungeons), island and castle selection, doors and stations.

Still open:
1. The class roster, each class's skill tree, the element system and how classes and elements mix.
2. How rift dungeons are generated, rewarded and kept purposeful.
3. The levels 1–2 area in full: its miniboss, quests and secret.
4. The XP curve and numbers that make the region take about 40 hours.
5. Skill-icon colours, once classes and elements exist.
6. How the dimensional rupture connects to dragons and difficulty (can stay open).
