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
**3a (world pass) is done:** modular block props (`src/render/blocks.ts`), hand-painted albedo for the world (`src/render/paint.ts`: one atlas fetch, box-projected, colour only, reusable for characters later), painted anti-tiled ground, new water and lava, cave walls that climb into darkness, distinct ore rocks, portal platforms with a flowing portal, the Wyrmwood rename and the goblin camp. Still open from this phase: organic re-layouts of the mine, Foothills, lair and ruin, and Blender-made props.

- Ground anti-tiling and a smooth floor-rock channel (fixes repeated cracks and uniform tiles everywhere).
- A pipeline for Blender-made props (GLB) with ruined/restored states and attached flames and lights.
- Water and lava shaders: reflections, ripples, crusted lava in craters. Cave walls that rise into darkness.
- Portal platform plus a flowing portal effect.
- Re-author the mine (organic caverns, ore veins, distinct ore rocks), Foothills (organic edges, renamed Wyrmwood Foothills, goblin camp kit, shrine, new tower), lair (bigger arena, bone piles, no glowing sticks), and Sunken Ruin (asymmetric drowned city).

### Phase 4: the keep
- About a 150×150 island with districts: great hall, smithing quarter, bank and vault, market, portal court, and profession lots.
- Every building is a Blender model with ruined and restored states.

### Phase 5: HUD
- A D2-style bottom console: health and mana orbs (mana is new: skills cost mana), potion belt, LMB/Q/W/E/RMB skill slots and a mini-menu. No top-right strip.
- Skill icons redrawn as painted, element-tinted tiles that match the world.

## Decisions
- The Ashen Foothills becomes **Wyrmwood Foothills** (display name only; the zone id stays `foothills`, so saves are safe).
- The right HUD orb is **mana**, one pool shared by every weapon style, because the player swaps weapons freely. Skills spend mana. A class-specific resource only makes sense if specialised classes arrive later.
