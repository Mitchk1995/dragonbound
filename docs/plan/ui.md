# Interface, text and icons

Part of the design plan; the index and the current direction are in [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md). Equipment models are in [characters.md](characters.md). Newer decisions take precedence over older ones. Record each new decision here, dated, in the same session it is made.

## October 3

- **Painted lettering, three alphabets** (October 3). Generated with Codex and picked by Mitchell: forged gold for place names and the zone plaque, NPC names over heads, the boss bar and text floaters ("+30 gold"); glowing pale blue for portal titles and other magic text; brown ink with a cream outline for parchment panels. Case is kept as written (portal titles stay capitals, as the plates always were). Menu text followed (see "All game text uses painted alphabets" below). Marks outside the set fall back to the ordinary UI font.
- **Title logo: option C** (October 3, on the decision page): blue enamel letters with a gold rim and a dragon head over the O, on the title screen and the loading screen (PR #70).
- **Title screen: option C, the castle at night** (October 3): lit windows, torches, moonlit mist and the dragon perched on the keep, the logo upper right and the menu on an iron-and-parchment panel lower right. Built in the game after the new keep and the lighting work.
- **Damage numbers are painted digit sprites** (October 3), generated with Codex: white hits, gold crits, red damage taken, green heals. In the game (PRs #71, #72).
- **All game text uses painted alphabets** (October 3). Claude had pushed back that image generation could not do full alphabets; Mitchell overruled it, and it could. Extends the three alphabets above, with a readability fix (PR #75): all menu text too, from one neutral silver alphabet tinted by meaning, palette A (bright, classic): Common off-white, Magic blue, Rare yellow, Epic purple, Legendary orange, Set green; fire orange-red, frost cyan, lightning pale yellow, poison green, good bonuses soft blue (not green, which is poison), penalties red.
- **Text and trees, verdicts** (October 3, decision page). All menu text in the painted alphabet with colours A: approved as built. Text fixes: not yet; pickup floaters ("+30 gold") are too big and bold and must be smaller than NPC names, and the zone plaque's top edge has a messy effect to remove (plus portal titles must not slide under the plaque). The six woodcutting trees: not yet; the roots of the magic tree, yew and willow look wrong (spikes lying on the grass rather than a flare into the ground) and the yew has a stray bare stick poking out of its crown (notes in `D:\dragonbound-archive\notes\trees-round1`).

## Round 5 decisions (October 1 evening)

- **Icons are needed for materials and quest items too**; the ore icons don't look right in the inventory.
- **The inventory must match its approved mockup more closely:** the panel outline, and the icon size and layout (they look small).

## Follow-up (October 1, late)

- **The side panel's tabs stand on top of the panel, bigger, with painted icons** made with Codex (backpack, breastplate, sword and pickaxe, journal, treasure chest, cog), as Mitchell asked; approved, spanning the panel's full width and cut from the same stone and rim as the panel so they blend in.
- **Items never cross their slot's rim:** every item picture fills the same share of its box.
- **All bows lie the same way in their icons:** tilted like the Recurve (top tip to the upper right, string below), which Mitchell liked; the Worn Shortbow, Hunter's Bow and Emberstring icons were turned to match.
- **The 14 material and quest item icons are approved** (ores, bars, uncut gems, the Cinder Seal Fragment and the Cinder Key) and are in the game. Every item now has painted artwork.

## Interface and equipment art (October 1)

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
