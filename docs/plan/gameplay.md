# Progression, loot, quests and the first region

Part of the design plan; the index and the current direction are in [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md). Combat, classes and controls are in [combat.md](combat.md); the October 1 item catalog is in [items.md](items.md). Newer decisions take precedence over older ones. Record each new decision here, dated, in the same session it is made.

## Round 5 decisions (October 1 evening)

Mitchell's answers on the [Round 5 review page](https://claude.ai/artifact/LYYQ9tn49GokkaidH3zQhe). They take precedence over anything older in the plan.

### The game's scale and shape

- **A thousands-of-hours game that keeps growing.** Levelling should be a real grind: as long as OSRS or longer. Most games make levelling too easy; this one must not.
- **The levels 1–10 region takes about 40 hours**, not 8–12: a big area with lots to do. Its route uses three bands (1–3 near the portal with a miniboss, 4–6 in the open middle with the mine entrance, 7–10 in the deep end with the region boss). "Levels 1–10" means combat level (weapon style, Hitpoints and Defence together); the region is complete when its final boss and core quests are done, not when a number is reached.
- **Main area plus rift dungeons.** The main region is where you progress through the story and quests. Alongside it, **procedural rift dungeons** can be ground for levels and loot: you tear open a temporary dimension to train in (like the Hyperbolic Time Chamber), so slow early levels stay fun because you're also grinding for cooler gear. Procedural areas must still feel purposeful, not random filler. Optional absurd quest chains still apply on top.
- **A main story.** Claude drafts it and evolves it as the game grows; Mitchell is creative director. The dimensional rupture stays the working premise; how it connects to dragons stays open.

### Loot and upgrades

- Rarity: Normal, Magic, Rare, Unique, Mythic. Reinforce +1 to +10 with bars of the item's own metal, rising in cost; no transfer between items.

## Levels 1 to 10 (October 1)

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
## Equipment crafting and loot (October 1)

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
## Quests, characters and discoveries (October 1)

**Agreed direction.** The early region should contain quests, characters, minibosses, exploration and secrets. These should help it feel like an adventure with personality, not a collection of disconnected combat and gathering systems.

Optional long quest chains can become absurd and overly silly, with escalating difficult tasks, substantial rewards, interesting characters, hidden discoveries, and a mixture of humor and mystery. Their optional nature matters; the idea does not require every player to follow every chain to progress.

**Open.** Decide the relationship between the core quest route and optional chains, including which stories or secrets can continue into later regions. Specific NPCs, quest prose, steps, rewards, chain length and branching are not settled. Branching is possible rather than a requirement.

Illustrative quest ideas included a miner missing tools, a creature collecting shiny objects, trading or fighting to resolve the situation, a hidden ore pocket, and a rescued character later opening a stall. These were possible examples, not adopted quest scripts, a named cast or a branching requirement.

The early level 1–2 area with a miniboss and quests was a scale example, not an approved named quest line or fixed reward plan. No specific miniboss roster or encounter order should be inferred from it.
