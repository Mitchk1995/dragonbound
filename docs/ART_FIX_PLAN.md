# Art & feel fix plan (from the 2026-09-30 review)

The owner rated 32 models and map areas and left notes. Average score 2.1 / 5. Four read-only investigations traced every complaint to code. This plan orders the fixes so each phase makes the game visibly better on its own.

## Owner's direction

- **Clean, not bumpy.** The procedural "texture" made everything look fuzzy or felted. Simpler reads better.
- **Plate armour like OSRS.** Bronze, iron and steel share one design and differ only by material. No gold on steel. Emberforged needs a new concept that reads as dragon-forged.
- **Diablo 2 pacing.** Slower, weightier attacks. Holding the mouse keeps attacking, and single clicks still give one deliberate swing. Fast attacks come from gear (uniques), not the base kit.
- **The keep needs a full redesign.** It should be bigger, with real buildings that have a purpose and profession areas. Portals become platforms that project a flowing portal, with no arches.
- **Less symmetry.** Mine, ruin and lair layouts should feel natural.
- **HUD.** No buttons in the top right. The ability bar needs a proper design.

## Root causes

| Complaint | Cause |
|---|---|
| Fuzzy/bumpy everything (goblin felt, bumpy trees, wood-grain hair and bronze, beard striations, kobold texture seams) | One triplanar noise shader (`src/render/surface.ts`) is applied to every model, prop, tree and the ground. Its bump strength is 5-10x too high for the textures in `textures.ts`. Directional patterns flip between faces. The projection restarts at every limb. |
| Metal doesn't look like metal (bronze = wood, steel = gashes) | Every material exports with metalness 0 and there is no environment map, so there are no reflections. The metal texture also paints 8 scratch lines. |
| Steel spikes, gold fangs, nose dent; bronze "samurai" | Three different plate designs per tier (`PLATE_STYLE` in `items.ts`). Steel's trim colour is gold. The chainbody and med helm use banded lamellar shapes. |
| Emberforged "bear armour" | Brown main colour, toothed scale rows that read as fur, horns that read as ears. |
| Flat-top hair, wedge hood, box dragons | The Blender helper kit only offers boxes. The curved-surface tools are locked inside `plate_variants.py`. |
| Staffs through the arm | The staff pivot sits on the forearm axis (`gear.py`, cultist in `minions.py`). |
| Cinderwing = big drakeling; whelp = small drakeling | One `dragon()` builder at three scales. Wings are flat boards. |
| Ugly buildings, kiln, portals, tower | Everything in the world is primitive boxes built in TypeScript (`src/world/props.ts`). No building is a Blender model. |
| Round, symmetric layouts | Zones are made of circles (`Gen.blob`) placed at mirrored, hand-typed coordinates. |
| Repeated crack decal, uniform tiles | One 256px ground atlas repeats every 4 units with no anti-tiling. |
| Lava pancakes, fake water | Fluids are one flat sheet with emission and no reflection. |
| Fighting too fast | The basic attack is capped at 0.5 s with the hit at 0.25 s. Base weapon speeds are 1.2-1.6/s. Skills land in 0.15 s. Enemies are nearly as fast as the player and never stagger. |
| Holding the mouse walks instead of attacking | The hold mode is decided once on mousedown; a near-miss on the enemy becomes "walk" for the whole hold. |
| Inventory icons are tiny | The icon camera fits a bounding sphere, not the silhouette. |

## Phases

### Phase 1: look and feel (in progress)
1. **Clean surfaces.** Turn off the bump on characters, trees and props. Make detail opt-in per material. Add a soft vertical shading gradient so models keep depth. Calm the ground texture. Add a studio environment map so metal and trim actually shine.
2. **D2 combat pacing.** Hold-to-attack with sticky targeting, plus single-click swings. All pacing numbers go in one tuning table. Base attack speeds come down to about 1/s with longer, committed swings. Skills get slower cast times and a cast-speed stat. Enemies slow down and stagger on big hits.
3. **Model quick fixes.** Hero V-neck, kobold floating crest, goblin shorts, golem core, Quartermaster hammer, staff grips (hero, Kindled Ash, cultist). No gold trim on steel. Blender scripts write to their own checkout.
4. **Item icon framing.** Icons fill about 94% of the slot.

### Phase 2: armour and characters
- Move the curved-surface kit into `_common.py`.
- One OSRS-style plate set for bronze, iron and steel, plus a matching mail shirt and med helm.
- New Emberforged concept: obsidian plates with glowing ember seams, dragon-scale rows and a dragon-skull helm.
- Rebuild the uniques on the new plate.
- New hair shells and locks. A proper Warden hood.
- Dragons: a real bat wing, a chibi whelp, and a boss-only Cinderwing (horn crown, heavy head, glowing throat).

### Phase 3: world tech and zones
**3a (world pass) is done:** modular block props (`src/render/blocks.ts`), hand-painted albedo for the world (`src/render/paint.ts`: one atlas fetch, box-projected, colour only, reusable for characters later), painted anti-tiled ground, new water and lava, cave walls that climb into darkness, distinct ore rocks, portal platforms with a flowing portal, the Wyrmwood rename and the goblin camp. Still open from this phase: Blender-made props.

**3b (organic layouts) is done:** the mine is lobed caverns on winding tunnels with two loops and dead-end pockets, ore in veins along the walls, and one rock language from floor to top (the wall-foot slabs climb on as bigger painted blocks into the dark). The Foothills lose their square frame: forest thickens toward an uneven rim that climbs in wooded terraces, the mesas step up in tiers, and the cultists have a composed shrine (processional way, obelisks, braziers, banners, a stepped dais with a ritual circle and altar). The Sunken Ruin is an asymmetric drowned city (walled temple precinct, market square with a fountain, a colonnade, drowned houses, slumped causeways) built from a few bold wall pieces, with mirror water that reflects the ruins. The lair's caldera is an irregular floor of lobes behind a thick, uneven rim, entered up a ravine through its east side. Portals turn to face the camera exactly, so they stay oval anywhere on screen.

- Ground anti-tiling and a smooth floor-rock channel (fixes repeated cracks and uniform tiles everywhere).
- A pipeline for Blender-made props (GLB) with ruined/restored states and attached flames and lights.
- Water and lava shaders: reflections, ripples, crusted lava in craters. Cave walls that rise into darkness.
- Portal platform plus a flowing portal effect.
- Re-author the mine (organic caverns, ore veins, distinct ore rocks), Foothills (organic edges, renamed Wyrmwood Foothills, goblin camp kit, shrine, new tower), lair (bigger arena, bone piles, no glowing sticks), and Sunken Ruin (asymmetric drowned city).

### Phase 4: the keep (done)
- A 150×150 island with districts around the portal court: the walled inner keep (gatehouse, great hall, rune and hatchery plots), the smithing quarter (smelter house, anvil yard, Emberforge), the bank and its side vault, the Quartermaster's shop and market, and the alchemy plot.
- Buildings are enterable. One spec per building (`src/data/zoneMaps.ts` `KEEP_BUILDINGS`, types in `src/world/building.ts`) drives both the nav grid (walls block, doorways and floors walk) and the model (`src/world/buildingModel.ts`), so they can never disagree. Stations stand inside (bank counter, furnace, shop counter, Restoration Board).
- When the hero is inside, the roof, gables and the camera-side wall above a clean stone course dissolve away; other walls dissolve around the hero like any occluder.
- The castle keep is the island's centrepiece: two storeys of stone with four corner towers, a corbelled and crenellated parapet round a slate roof, and the great door in a projecting bay. Interior walls (`partitions` in the spec) divide its ground floor into the great hall (throne dais under a gallery, feast tables, fireplace, the stair up), kitchen and stores, guard room, chapel and armoury; the gallery, stair and the floor beam on the standing walls carry the upper floor when the roof lifts.
- Windows are real openings: the wall is laid round the hole, clear tinted glass with a leaded mullion and transom sits in the middle of the wall, and the surround lies flush on both faces (only the outside sill projects).
- Placement is by purpose: the smelter follows the work (ore in by cart from the east door, furnace, casting, bars out by the south door to the anvil yard: anvil, quench trough, grindstone, finished racks), and dressing is grouped per district (kitchen garden by the kitchen door, orchard rows, training yard by the wall stair, stores by the gate).
- Buildings are code-built blocks rather than Blender models: the grid-exact walls, doorways and the cut-away need the spec, and plots swap between ruined foundations and restored buildings on the same footprint.

### Phase 5: HUD
- A D2-style bottom console: health and mana orbs (mana is new: skills cost mana), potion belt, LMB/Q/W/E/RMB skill slots and a mini-menu. No top-right strip.
- Skill icons redrawn as painted, element-tinted tiles that match the world.

## Decisions
- The Ashen Foothills becomes **Wyrmwood Foothills** (display name only; the zone id stays `foothills`, so saves are safe).
- The right HUD orb is **mana**, one pool shared by every weapon style, because the player swaps weapons freely. Skills spend mana. A class-specific resource only makes sense if specialised classes arrive later.
