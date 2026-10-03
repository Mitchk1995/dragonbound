# Dragonbound design decisions
*October 3 2026*

Dragonbound is a long-term action RPG with combat led by Diablo II, some Diablo IV influence, richer active skills, and OSRS-style gathering and progression. The immediate design target is a complete, cohesive levels 1–10 region that makes combat, mining, equipment, quests and exploration feel like one adventure.

This reference brings the agreed direction, working ideas and open choices together for continued design. The first region comes first; the world can grow into a much larger adventure after that.

**Decision status:** Agreed direction records the intended experience. Working proposals describe ideas still being shaped. Open decisions need a choice or testing. Existing reference values describe the October 1 catalog and are not final balance for the first region.

**This is the single design plan: this page and its area files in `docs/plan/`.** Any agent (Claude or Codex) that hears a decision from Mitchell records it in its area's file, dated, in the same session, and updates that area's line under "Current direction" when the direction changes; decisions that only live in a chat get lost. Newer direct decisions take precedence over older text. A job reads this page and then only its own area's file.

| Area | File |
|---|---|
| Castle and home island: castle v4, the stone, structural sense, the 1.3× scale, round 6 notes, status and open points | [plan/castle.md](plan/castle.md) |
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

- **Castle:** castle v4, the great keep, is built to the approved plan in one cream, hand-painted chunky stone (accepted October 3). It grows 1.3× with the stone blocks kept their size and stairs, tables and rooms sized to the hero, and his round 6 notes on the hall, chapel, stables and barracks are being fixed at the new size. Everything must make structural sense: real stairs, retaining walls, interiors that fit their outsides.
- **Characters:** blocky and modular, like LEGO. The five redesigned sheets (hero, Goblin Grunt, Kobold Slinger, Ember Cultist, Cinder Priest) are built; every gear piece must fit the new hero. Hands are one-piece LEGO hands with no thumbs, and arms get elbows.
- **Dragons:** the redrawn drakeling and Cinderwing are built; round 3 (paws, Cinderwing's chest scutes and tapered tail, the drakeling's one-piece skull) is in the game awaiting Mitchell's verdict.
- **Trees:** natural, true-size trees grown as one piece, in the woodcutting ladder (tree, oak, willow, maple, yew, magic). The oak and the common tree are approved; the rest grow in the game's woods, with roots that flare into the ground, awaiting his verdict.
- **Interface and text:** all game text in painted alphabets, coloured by meaning (palette A, approved as built); title logo C; the title screen is the castle at night (C), built after the new keep and the lighting; damage numbers are painted digits.
- **The look:** a more natural world, not photoreal, in steps shown before and after: light and sky, then water, then ground, plants and crops. Textures are sourced (Codex or CC0), never painted in code; surface maps B. We stay in the browser (engine pick A), always on the newest tools.
- **World:** multi-level zones with hills, cliffs and heights are wanted, nothing settled yet; the region's mine is a real entrance in the middle band.
- **Progression and loot:** a thousands-of-hours grind; the levels 1–10 region takes about 40 hours in three bands; a main area plus procedural rift dungeons and a main story; rarity Normal to Mythic, reinforcement +1 to +10.
- **Combat:** a class chosen at creation, with skill trees and elements; Space is a dodge roll, Q a health potion, number keys the abilities; flashy hits; solid hits flinch ordinary enemies with no flinch resistance by default.

### Order of work

1. Build the home island, then the castle.
2. Polish the castle, then the rest of the home island, and the characters, one area at a time, each judged by Mitchell from pictures before moving on (October 2).
3. Blueprint the levels 1–10 region.
4. Combat feel pass (mechanics work goes to Codex on GPT 6.1 Sol; Claude keeps design and look).

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
