# Dragonbound working design plan

Updated 2026-10-01 on `feat/recover-round5`. This is a decision record for brainstorming, not an implementation specification. Confirmed direction records the user's intent; candidates need decisions and playtesting. No final upgrade caps, costs, speed numbers, rarity ladder or map layout are agreed.

## Confirmed direction

- Eventually a huge, long-term adventure: Diablo II-led combat with some Diablo IV influence, richer active skills, and OSRS-style gathering/progression grinds.
- Finish a **complete cohesive levels 1-10 region before the proper user playthrough**, then build the next region. Internally we can develop and test pieces. Combat, mines/resources, equipment progression, quests, minibosses, exploration and secrets should form an adventure, rather than separate demonstrations.
- Viable kiting: **very slow early monsters**, comfortable baseline player movement and open room to reposition. Later equipment/magic can improve movement.
- **Functional enemy flinch/hit recovery:** landing a hit briefly interrupts or holds an enemy, buying repositioning time. Evaluate it with pursuit speed and attack cadence/commitment. Exact triggers and heavy-enemy/boss rules remain undecided; blanket heavy-enemy immunity is not accepted.
- Dependable crafted base gear; loot provides rarity, bonuses and eventually skill-changing excitement. **Both crafted and dropped gear can be upgraded.** The endorsed example is a mythic bronze helmet much better than plain crafted bronze and still upgradeable. “Mythic” is an example, not a rarity category already implemented.
- Optional absurdist, overly silly long quest chains: escalating difficult tasks, large rewards, characters, hidden discoveries and a funny/mysterious mix. No quest prose is being settled now.
- Preserve the current portal visuals: the user likes them, and they can be a visual anchor.
- A larger, organic/irregular home island and settlement is the confirmed preference, rather than a large circular island. Its exact outline, scale and district layout remain unchosen.
- Make the castle functional and believable first: rooms need clear purposes rather than duplicate/scattered filler. A king and further story are planned later; this pass does not invent them.
- **Blueprint first, builder follows the plan.** Set floor plans, room functions, circulation and connections before facade/detail or object placement; the builder should not invent a random layout while constructing it. The user is open to nonrectangular castle shapes, towers and wings, but no alternative outline is selected.

## Candidates, not decisions

**Region connections:** actual mine entrances loading underground, different entrances/branches, and possible intra-region portals. Compare surface-return positions and clearing/reset behaviour before choosing a connection model. None is a final layout.

**Tentative lore direction:** a huge rupture/rip randomly scatters regions or kingdoms across dimensions; the home settlement is one surviving fragment, and portals reveal other fragments through adventure. The user agrees with this direction as a working premise, but its relationship to increasing difficulty and dragons is unresolved and need not be solved now. The user's rupture premise takes precedence over the assistant's earlier royal-mage-rescue suggestion; that suggestion is not canon. Existing implemented lore remains the game's background until a separately chosen redesign. No story or code changes follow from recording this idea.

**Combat:** a limited dodge for telegraphed circles is under consideration alongside distinct active skills. Existing style-specific mobility does not settle a shared dodge. Clear ordinary-enemy reactions, repeat-flinch resistance or boss interruption opportunities are candidates. Judge projectiles and charges too: slow walking alone does not establish a fair repositioning window.

**Separate three equipment axes:**

| Axis | Role |
|---|---|
| Material/base | Dependable baseline, material identity and equipment requirements |
| Rarity/bonuses | Exceptional finds and potentially changed skill behaviour |
| Upgrade strength | Resource investment in a chosen item, regardless of crafted/dropped origin |

Mining-funded +1/+2 and further reinforcement, increasing resource investment and milestone glow are possibilities. A shared path with appropriate gathered materials could make a valuable drop **create mining demand**. Crafting remains useful through reliable access to a chosen slot; masterwork already adds excitement.

Candidate safeguards: strengthen base contributions without automatically multiplying every affix; preserve meaningful requirements; compare equally invested items when judging material progression. Later materials/regions must stay desirable, while exceptional early-material loot may beat a plain later-material item. No blanket “bronze can never beat iron” rule is agreed. Cost schedules, ceilings, affix scaling and upgrade transfer/refunds remain open.

## Feasibility against current code

| Topic | Already implemented | Extension or unresolved change | Source pointers |
|---|---|---|---|
| Material and rarity | Separate material bases and normal/magic/rare/unique instances; bronze can drop with affixes. | Compatible foundation for the helmet example; no mythic category or promised mythic strength. | [items](../src/data/items.ts), [Item/Rarity](../src/types.ts), [generation](../src/loot/itemGen.ts) |
| Crafting and upgrades | Mining, smelting, smithing, plain crafts and masterwork. No +upgrade field/action. | Shared upgrade transaction, stats/display and save migration. Upgraded plain gear must not stack incorrectly or lose item identity. | [skilling](../src/systems/skilling.ts), [recipes](../src/data/recipes.ts), [stats](../src/combat/stats.ts), [bank stacking](../src/loot/itemGen.ts), [save](../src/save/save.ts) |
| Skill-changing loot | Numeric affixes and fixed abilities per weapon style. | Item-to-ability behaviour modifiers need a new system, not just another stat. | [affixes](../src/data/affixes.ts), [abilities](../src/data/abilities.ts), [combat](../src/systems/combat.ts) |
| Kiting/flinch | Eligible heavy hits/criticals stop ordinary-enemy movement and cancel attacks/telegraphs. Bosses currently do not stagger. Data-driven speeds/cadence and movement-speed boots affix. | Promising foundation, not proof of feel. Decide triggers/repeat resistance; test commitment, knockback, pursuit, charges and projectiles together. Current boss immunity is implementation history, not an approved future rule. | [enemy](../src/entities/enemy.ts), [hit handling](../src/systems/combat.ts), [tuning](../src/data/tuning.ts), [player](../src/entities/player.ts) |
| Dodge | Ranged Evasive Roll, melee Leap Slam, magic control and telegraphed attacks. | Shared limited dodge versus style-specific escape tools remains undecided. | [abilities](../src/data/abilities.ts), [boss AI](../src/ai/boss.ts) |
| Region/mines | Separate keep/mine/Foothills/ruin/lair; travel recreates zones and uses one entry per zone. | Named arrivals and surface/underground persistence or reset policy need work. Returning from a mine currently recreates the surface zone. | [zones](../src/data/zones.ts), [maps](../src/data/zoneMaps.ts), [travel](../src/game.ts), [runtime](../src/world/zone.ts) |
| First-region progression | Tutorial, gathering loop, quest and miniboss/boss content. Current Cinder Seal requires Smithing 25; content extends beyond the proposed band. | Not a completed 1-10 region. Define its level metric and end-to-end progression route before rebalance/repositioning. XP simulations do not measure the whole adventure's duration. | [quests](../src/data/quests.ts), [story](../src/systems/story.ts), [enemies](../src/data/enemies.ts), [balance](BALANCE.md) |
| Optional long chains | Stages, journal, flags/counters; Cinder Seal behaviour is hand-coded. | Reuse the foundation for a short chain; many escalating chains need reusable triggers/rewards. Branching is optional, not a user requirement. | [quests](../src/data/quests.ts), [story](../src/systems/story.ts), [diary](../src/data/diary.ts), [save](../src/save/save.ts) |
| Upgrade visuals | Material palettes/authored glow, including Emberforged. | Milestone appearance is compatible; no upgrade-driven rendering yet. | [palettes](../src/data/items.ts), [gear renderer](../src/render/registry.ts) |

## Visual-cohesion candidates and evidence

Sol viewed the production title/exterior capture, `inspect/browser-checkpoint.png`, and inspected theme/asset code. This Opus pass reviewed code/docs and was not supplied pixels. A later six-image capture set is now available; the user reviewed it and the feedback below records that review. No duplicate screenshots or art changes were made here. Stills do not establish interaction, collision or combat feel.

For a subsequent pixel review: preserve the liked portals and B trees; repeat coherent stone/wood/foliage treatments through landmarks and mine mouths; give cave entrances a readable silhouette/approach; organise sightlines around landmarks and open fighting pockets; concentrate bright accents on portals, discoveries and exceptional rewards. Evaluate these against actual region screenshots, without treating them as an approved new style or final map.

## Screenshot feedback: current captures 1-6

This section records the user's live feedback without replacing prior direction or open questions. The user owns priorities; the order below identifies captures, not implementation priority. Links point to the existing private capture set.

| Shot | Current capture | Recorded feedback and next assessment |
|---|---|---|
| 1 | [01-portal-hub.png](https://chatgpt.com/api/library/files/libfile_c4a34c2e2c84819194416fd921dd2d26/download) | Preserve the liked portal visuals. Assess their connection to purposeful hub routes; no redesign of the portals was requested. |
| 2 | [02-castle-exterior-path.png](https://chatgpt.com/api/library/files/libfile_54b3aa1ad1808191af6f97098ae27091/download) | Likes castle silhouette and red/gold banners. Courtyard needs coherent purpose. Generally likes a training yard plus a working/supply courtyard linked by worn paths, with well/planting/main-door detail; exact layout is not final. Wants an actual clickable castle door that swings open. Closing remains tentative. Questions odd openings on the left tower versus the right, unclear doorway destinations and door-leaf/frame fit; dislikes repeated office-like windows. Floor functions/connections should lead the facade design. |
| 3 | [03-emberdeep-mine-interior.png](https://chatgpt.com/api/library/files/libfile_2b3193922854819199165e634a685bdf/download) | Mine interior is broadly okay. Ores feel randomly scattered: organise distinct ore-specific veins/pockets rather than mixing every ore in the same patch, and keep nodes out of walking lanes. Ore mouseover clarity needs an interaction check, not a judgment from this still. |
| 4 | [04-castle-downstairs-great-hall.png](https://chatgpt.com/api/library/files/libfile_c41c87522e7481919906542f3d1c9b63/download) | Likes food/banquet tables; dislikes haphazard rotated triangles atop the throne. Stair access is not visually apparent, although functional floor travel exists. Fireplace on the left appears underdetailed; texture/material diagnosis is unresolved. Room/furnishing purposes are unclear, and bags look awkwardly away from walls. Low visible walls look hoppable and expose adjacent rooms. Two throne-flanking lectern/light-stand-like props have unclear purpose. See architectural notes below. |
| 5 | [05-castle-upstairs-map-room.png](https://chatgpt.com/api/library/files/libfile_7cea9c2e1af8819194cc1f6fd5c08348/download) | No separate map-room verdict was supplied in this feedback. Keep it available to assess stair arrival, room purpose and the same wall/cutaway concerns; do not infer approval or add invented criticism. |
| 6 | [06-foothills-combat-equipped.png](https://chatgpt.com/api/library/files/libfile_4d64680676d081918b94c93448778e67/download) | No separate combat/gear verdict was supplied here. Cross-capture HUD feedback below applies. Existing kiting/flinch goals still require the focused interactive playthrough. |

**Shared bottom HUD:** semi-okay, but the user wants a cleaner, more deliberate fantasy style. Agrees with simplifying stacked chunky frames around health/mana orbs, consistent icon scale/style, better spacing and readable key labels, while retaining fantasy identity. One imagegen concept was generated and [saved privately](https://chatgpt.com/api/library/files/libfile_46170cfc99a081918b4a37e8d9f365bb/download); user delivery/review is in progress and no HUD design has been accepted. Do not generate a duplicate concept. Consistent generated skill/item icons later are a candidate after the direction is chosen, not an approved replacement of the current icon system.

**Downstairs architecture and prop readability:** preserve banquet-table appeal; a coherent throne ornament, a visibly believable stair connection and purposeful storage placement are candidate responses. Functional tower stairs and upper-floor travel already exist ([stairs](../src/world/building.ts), [travel](../src/game.ts)); the request is to make that connection legible in the architecture. The renderer builds full-height partitions and cuts them down for the camera ([buildingModel](../src/world/buildingModel.ts), `CUT_H`). Investigate full-height architecture versus its cutaway presentation before treating the screenshot as proof of knee-high physical walls. The current great-hall layout labels the two dais-flanking fittings as `brazier` ([zoneMaps](../src/data/zoneMaps.ts)); their intended purpose is not reading clearly. Recognisable braziers are one candidate, not a fixed user decision. Inspect the fireplace's geometry/materials more closely before deciding whether detail, texture or lighting is the problem.

**Additional room-purpose feedback:** the user questions the great-hall fireplace plus the apparent left-room fireplace, loose logs/crates/supplies floating away from walls, and an armour-display side room with no clear function. The source intends a hall `fireplace`, a west kitchen `hearth_oven`, service storage and an east armoury with stands/racks/workbench/grindstone; those distinctions are not sufficiently legible in the reviewed view. Do not justify duplicate-looking filler solely because a prop has a name in the data.

**Focused next layout proposal — candidate, not a remodel approval:**

| Existing area | Purpose to make clear | Candidate layout response |
|---|---|---|
| Great hall | Communal dining/gathering | Preserve food and banquet tables; give the main hearth a clear role and the dais a coherent restrained ornament. Do not introduce a king or story explanation to excuse the furnishing. |
| West service wing | Kitchen and pantry supplying the hall | Make the cooking oven visually distinct from the hall fireplace. Group logs by the working hearth and sacks/crates at purposeful wall-side storage, with believable access and clear routes; remove/reconsider redundant-looking filler in the proposal. |
| East guard/armoury wing | Equipment storage/maintenance supporting guards and the proposed training yard | Organise racks, tools and a repair work area around that workflow. Armour stands should support it rather than read as an arbitrary display gallery. Exact furniture selection and station interactivity remain decisions. |
| Courtyard and stair approaches | Working/supply routes and legible access between floors | Connect proposed yard functions to the appropriate rooms with worn paths; make each stair entrance and architectural ascent recognisable. Retain the liked exterior silhouette/banners/portals. No final positions or courtyard plan are selected. |

Next design action: prepare and review an actual castle blueprint covering both floors, room purposes, stair/tower connections, courtyard circulation and where each doorway leads. Consider nonrectangular massing/towers/wings as alternatives, not an approved replacement of the liked castle character. Derive openings and window placement from the rooms; check door-leaf/frame fit and tower-opening consistency before facade polish. Distinguish full-height architecture from camera cutaways, and avoid filling empty space with another hearth, crate or armour stand without a reason. Implementation should follow the chosen blueprint, not improvise the plan. The separate castle-blueprint assignment (`01a0f574`) is already underway; this notes pass does not duplicate it or launch another review.

**Feedback checklist for the next chosen visual checkpoint:**

- Retain portals, castle silhouette, red/gold banners and banquet-table appeal.
- Make courtyard functions/routes and the main entrance coherent; design clickable opening-door behaviour, leaving closing open.
- Group ores into recognisable vein/pocket identities clear of routes; test hover and interaction.
- Establish a cleaner HUD direction from the already-generated concept before changing icons.
- Make throne decoration, stair access, room boundaries, storage and light/hearth props readable at the gameplay camera.

This is a recorded design backlog, not permission to implement all items, rebuild, rerun captures or start another Claude review.

## Open decisions

1. What does “1-10” measure, and what completes the region beyond reaching that number?
2. Connection/reset model, mine placement and return positions?
3. Flinch triggers, repeat-interruption rules and heavy/boss responses?
4. Shared limited dodge or distinct escapes; relationship to movement, commitment and warnings?
5. Rarity vocabulary, upgrade inputs/scaling, and exceptional early loot versus later materials?
6. Reliable early equipment for each style? Current smithing mainly supports metal melee gear/tools.
7. Core quests versus optional chains/secrets that can grow across regions?
8. How should the tentative dimensional rupture connect to dragons and increasing difficulty? Leave this open rather than solving the full lore now.

## Next design and QA step

Jimmy coordinates a first-region brief: the connected adventure loop, connection/reset alternatives, equipment axes and kiting/hit-recovery rules. Opus reasons about design/cohesion; Sol implements only a subsequently chosen small slice. Internal development can be partial; the proper user playthrough waits for the cohesive region. These notes authorise no gameplay implementation.

Per meaningful checkpoint: applicable automated checks once, then **one short focused agent playthrough**, then the user judges feel. Retest failures or changed behaviour; avoid exhaustive repeated runs. Recovery already passed typecheck, 331 tests and build; documentation changes do not warrant another heavy run.

Parent-verified cloud browser controls are available. Next prerequisite: privately transfer the **exact current browser build**, without public deployment:

- Complete existing `dist/` snapshot: HTML, bundled scripts/CSS/fonts and models. Identify it with base commit, dirty-checkpoint notes and file hashes; rebuilding clean main would omit recovery changes.
- Private cloud-accessible static HTTP origin, working WebGL and browser input. The cloud cannot reach this PC's localhost directly. Relative Vite asset paths support static transfer; the production browser game needs neither Electron nor a gameplay backend.
- Isolated browser profile/save; associate notes/captures with that snapshot. Browser storage is separate from desktop saves. Production has no development Electron inspection API, so use a focused interactive pass.

No game upload, hosting, deployment, rebuild or new heavy job occurs for this planning request. When private transfer is ready, target the checkpoint's change (for combat: functional flinch, repositioning and a telegraphed attack), not every map.

## Repository hygiene

Read-only audit, 2026-10-01: origin is `Mitchk1995/dragonbound`; local main, cached origin/main and live GitHub main all match `54b8745` (PR #43). GitHub returned **no open PRs**. Active `feat/recover-round5` has no upstream and contains uncommitted recovery work; it is not a clean or published checkout.

Inventory: 82 local branches, 37 registered worktrees, including five locked original round-five worktrees. Original worktrees/variants remain preserved. Counts do not prove what is obsolete or safe to delete. No fetch, push, merge, reset, deletion or unlock was performed.

Keep decisions in this plan and the review trail in [CODEX-CLAUDE.md](CODEX-CLAUDE.md). Reconcile recovery into reviewable work before adding more feature branches; keep numerical tuning in data and PR scope aligned with final changes. Cleanup/publishing are separate authorised actions.
