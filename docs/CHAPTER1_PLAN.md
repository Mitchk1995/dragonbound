# Dragonbound: Chapter 1 "The Hidden Keep"

Latest brainstorming and feasibility decisions live in [WORKING_DESIGN_PLAN.md](WORKING_DESIGN_PLAN.md). The user now wants a complete cohesive levels 1-10 region before the proper playthrough; the chapter structure below records current content and the earlier plan, not a final layout for that region.

## Context
v0.1 proved the combat feel, but it was a combat sandbox, not the game we planned. Your playtest feedback:
- **Missing core:** professions, the home base, and progression goals.
- **Visual bugs:** the sword is in the wrong hand, trees vanish abruptly, and icons look like default emojis.
- **UI and presentation:** the slot/skill boxes and the title screen need redesigning, and the hero shouldn't start in armour.
- **Gear:** equipment isn't visible on the character.
- **Gameplay:** respawns are relentless, and Leap Slam glitches when you spam-click.

The design round settled the real structure:
- **Keep:** a hub keep with zones. The ruined keep is restored as a progression track, and it hides in a pocket dimension, a floating island in a starry void.
- **Portals:** they lead out to the dangerous world, to safe gathering areas, and to one-off quest areas. Zones stay cleared until you leave, since each portal trip opens a fresh copy.
- **Professions:** OSRS click-and-wait. Crafted gear is the stepping stone that gets you strong enough to farm the super-rare drops.
- **Look:** carved stone & iron UI. Item icons are rendered from the 3D models, and ability/skill icons are drawn. Gear comes in tier sets plus hand-built models for uniques, all visible on the character.
- **Start:** a 3D title screen, character creation, and a tutorial.
- **Systems:** bank, quests, achievement diary.
- **Vibe:** Gauntlet Legends / FATE, with 1000+ hours of long-term progression. We build a chapter, you play it to completion, and we iterate.

**Chapter 1 goal:** a complete, grindable loop. Keep, then mine portal, then smelt/smith, then gear up, then the Ashen Foothills, then a quest-gated dragon lair, then super-rare drops. Plus keep restoration and a diary to chase.

## Premise
The dragons hunt the last of the Dragonbound. You wake in **Dragonspire Keep**, a ruined fortress hidden on a floating island in a pocket dimension (the Veil). The **Warden**, the keep's last keeper, guides you. A **Portal Circle** of dormant arches is your only way out. Relighting arches and restoring the keep's halls is how the world opens up.

## Chapter 1 Content
**Skills (all to 99, OSRS XP curve):**
- Melee, Ranged, Magic, Hitpoints.
- **Defence:** armour requirements use Defence instead of Hitpoints. Combat automatically trains the equipped weapon style, Hitpoints and Defence; there is no stance selector. See [BALANCE.md](BALANCE.md) for the current XP shares and measured pacing.
- **Mining and Smithing (new).**
- Future skills stay visible but locked.

**Zones:**
1. **Dragonspire Keep (hub, safe):**
   - A floating island over a void skybox with stars and drifting debris.
   - Buildings and stations: bank vault, furnace, anvil, Quartermaster shop (potions, basic tools, sells your loot), Warden NPC, Portal Circle.
   - Ruined halls for later chapters (Alchemy Lab, Rune Altar, Hatchery) are visible, with their restoration costs shown as teasers.
2. **Emberdeep Mine (safe gathering portal):**
   - Cave chambers with Copper, Tin, Iron and Coal rocks. Rocks deplete and respawn, OSRS-style.
   - Rare gem finds while mining, and a mining pet chance (Rock Golem 1/5000-ish).
3. **Ashen Foothills (dangerous hunting portal):**
   - Redesigned as a hand-authored map with distinct areas: goblin camp, kobold warrens, drakeling ridge, cultist shrine.
   - Richer **Emberite** ore veins, dangerous to mine because monsters are around.
   - An instance: cleared stays cleared until you leave. The lair door is sealed.
4. **Quest, "The Cinder Seal"** (quest portal to a hand-built ruin):
   - Recover the seal fragments, then forge the **Cinder Key** (needs Smithing 25 and Emberite bars).
   - That unlocks **Cinderwing's Lair**, and the lair adds a Lair Key-free re-entry portal in the keep.
   - This is the "level X, then item Y, then unlock Z" chain you want.

**Gear loop:**
- **Crafted (fixed stats, reliable):**

  | Tier | Smithing level |
  |---|---|
  | Bronze | 1 |
  | Iron | 15 |
  | Steel | 30 |
  | Emberforged | 40 (Emberite from the dangerous zone) |

  Smithing makes swords, armour pieces and pickaxes. Pickaxe tier affects mining speed.
- **Masterwork:** a small chance at higher Smithing levels to add one random affix, so crafting has its own excitement.
- **Drops:** random-affix gear (Magic/Rare) plus Cinderwing's named uniques and pet, which stay the "real juicy stuff".
- **Honest limit:** in Chapter 1, bows and staves come only from drops and the quest. Fletching and Runecrafting come in later chapters.

**Keep restoration projects** (materials + gold + level):
- Repair the Forge for steel.
- Stoke the Emberforge for Emberforged gear.
- Relight the Lair Arch.
- Expand the Bank.
- Each restored hall visibly changes the keep.

**Other systems:**
- **Bank:** big grid, deposit-all, search.
- **Recall:** Veilstone, a 3s channel that takes you home from anywhere.
- **Achievement diary:** Ashen Foothills Easy/Medium/Hard tasks with rewards, e.g. an extra Emberite chance or a lair teleport.
- **Collection log:** expanded to uniques, pets and rare gathering finds.
- **Quest journal**, and the **Quartermaster** shop as a gold sink.
- **Death:** forgiving. You wake in the keep with nothing lost, and the instance resets.

## Presentation
- **Title screen:** a live 3D scene of the floating keep at dusk with Cinderwing flying past. Menu: Continue / New Game / Settings.
- **Character creation:**
  - Name, skin tone, hair style and colour, beard, clothing colour.
  - A rotating 3D preview.
  - The hero starts in plain clothes with no armour.
- **Tutorial:** Warden dialogue plus an objective tracker. Bank, then the mine portal, mine copper and tin, smelt bronze, smith a bronze sword and equip it, first fight in the Foothills, recall home, then the quest begins.
- **UI kit, "carved stone & iron":**
  - Dark stone panel textures (procedurally generated at startup) and riveted iron corners.
  - Gold filigree dividers and inset stone slots with rarity-coloured bevels.
  - Font: Cinzel (bundled via @fontsource) for headers.
  - Redesigned action bar, orbs, skill tiles and tooltips.
- **Icons:**
  - Item icons are rendered at runtime from the item's own 3D model with its tier recolour (an offscreen three.js camera, cached), so icons always match the gear.
  - Ability and skill icons are a hand-drawn SVG set in one style: bold outline, 2-3 tone shading, glow.
- **Visible equipment:**
  - The hero rig gets sockets (head, chest, shoulders, hands, feet, weapon hand, back).
  - Each slot has 1-2 Blender shapes, recoloured per tier (bronze/iron/steel/emberforged), with a rarity glow.
  - Every named unique gets its own model.
  - Unequipping shows the base clothes.

## Engine Work (reuse and refactor current code)
- **Split `src/game.ts` into systems.**
  - Keep: the loop, camera, FX helpers, combat resolution (`hitEnemy`, `damagePlayer`), loot (`dropItem`/`pickupItem`), progression (`grantXp`) and telegraphs/hazards. These move into `src/systems/{combat,loot,progression}.ts`.
  - New:
    - **`ZoneRuntime`** (`src/world/zone.ts`): loads a `ZoneDef` and owns its entities, nodes, portals, NPCs and stations. `Game.enterZone(id)` tears the current zone down and builds a fresh one.
    - **Zone layouts:** authored as ASCII maps plus seeded decoration (`src/data/zones/*.ts`), replacing `generateLayout`'s single hard-coded map. `NavGrid` (`src/world/navgrid.ts`) is reused unchanged.
    - **Interaction:** a new `Player` command `{kind:'interact', target}` walks up to the target and triggers it. It covers rocks, furnace, anvil, bank, portal, NPCs and stations. Existing `approach()` logic is reused.
    - **Skilling actions:** run on an OSRS-style 0.6s tick (`src/systems/skilling.ts`). Mining: success roll per tick from level, ore and pickaxe. Smithing: make-X queue with per-item ticks.
- **Data files:** `src/data/{ores,recipes,keep,quests,diary,zones,npcs,shop}.ts`. Extend `items.ts` with tiered crafted bases plus `tier` / `model` fields. Requirements move to Defence.
- **Save v3** (`src/save/save.ts`): retains appearance, bank, keep restorations, quests, diary, tutorial step and new skills; removes the former combat stance. `migrate()` preserves v1 and v2 progress.
- **Models:**
  - `registry.ts` gains gear attachment (`attachGear(heroModel, slot, item)`) and tier recolouring.
  - Runtime icon renderer: `src/render/icons3d.ts`.
  - Tree see-through: a dithered circular cutout shader on foliage and trunk materials (via `onBeforeCompile`) in `worldView.ts`, replacing `TreeOccluder`.
- **UI:**
  - New screens under `src/ui/`: title, create, dialogue, bank, smithing menu, shop, quest journal, diary, keep restoration, objective tracker.
  - `ui.ts` gets split per panel.
  - `style.css` is rebuilt on the stone & iron kit.

## Bug Fixes (from playtest)
- **Sword hand:** swap arm sides. A +Z-facing character's right hand is at −X. Fix it in `render/models.ts` and in `tools/blender/hero.py`.
- **Leap Slam / Roll spam-click:** while `player.dash` is active, store the click as a pending command and re-path from the landing spot in `onEnd`. Today `moveTo` paths from the mid-air position, and the hero walks back.
- **Trees:** replace the instant shrink with the dithered cutout above.
- **Starting kit:** clothes only, no armour.
- **Respawns:** zones are instances, so there are no respawn timers inside a trip.

## Art Production (Blender scripts in `tools/blender/`, same pipeline as v0.1)
- **Characters:**
  - Hero base body with sockets, 4 hair styles, 3 beards.
  - Warden and Quartermaster NPCs.
- **Gear:**
  - Helm ×2, body ×2, gloves, boots, shoulders.
  - Sword ×2 shapes, pickaxe, bow, staff.
  - 5 unique models.
- **Keep:**
  - Floating island rock chunks, keep walls and towers (ruined and restored variants).
  - Bank vault, furnace, anvil, portal arch, shop stall, crates.
- **Mine:** cave wall pieces, ore rocks ×5 (full and depleted states).
- **Quest ruin:** a small prop set.
- **Existing:** reuse the enemy and dragon models, updating their rigs where needed.

## Build Order
I'll build all of Chapter 1, then hand it to you to play through.
1. **Foundations:**
   - Refactor into zones and systems, fix the playtest bugs, Save v2.
   - The UI kit and SVG icon set, the runtime item-icon renderer, visible gear plus the tier recolour, Defence and stances.
   - I'll send you screenshots of the UI kit and the geared hero here, as an early look-check.
2. **Keep & portals:** title screen, character creation, keep island scene, Portal Circle, instancing, recall, bank, shop, NPC dialogue.
3. **Mining & Smithing:** Emberdeep Mine, ore nodes, tick skilling, furnace and anvil menus, crafted tiers, masterwork, pickaxes.
4. **Foothills, quest, diary, restoration:**
   - A redesigned Foothills instance, Emberite veins, the quest area and the Cinder Key chain.
   - The lair portal, the diary, keep restoration projects with visual changes, the tutorial, and balance passes.

## Verification
- **Unit tests (vitest), extending `tests/logic.test.ts`:**
  - Mining success rates and XP/hour by level and pickaxe.
  - Smithing recipes and material costs.
  - Masterwork odds.
  - Save v1 → v2 migration.
  - Pathing checks for every zone (each has a path from its entrance to all portals and nodes).
  - Quest and diary state transitions.
  - Keep restoration cost validation.
- **Simulated playthrough** through the `window.__game` hook in the browser pane:
  - Script the tutorial end to end: create a character, mine, smelt, smith, equip, portal to the Foothills, kill, recall.
  - Then quest to lair, then kill Cinderwing. Assert state after each step, with screenshots of every screen.
- **Electron:** `npm run play`, confirming the save file persists across a restart.
- **Blender:** preview renders for every new model, checked visually. GLB node checks confirm each file exports only its own scene.
- **Then you play Chapter 1**, and we iterate on your notes.
