# Art contract: Blender ↔ game

Every model is a Python script in `tools/blender/` using `_common.py`, exported to `public/models/<file>.glb`.
Scripts read and write the checkout named by the `DRAGONBOUND_ROOT` environment variable (else the one two folders
above the script, else `D:\gameplanning`), so set it when working in a worktree. Headless re-export, e.g.:
`blender -b --python-expr "exec(open(r'<root>\tools\blender\minions.py').read())"`; for gear, set
`DB_ONLY = ['staff_oak']` before the `exec` to export only those models.
Scripts author inside a root rotated +90° about X, so **all coordinates are three.js: Y up, +Z forward**.
Characters face **+Z**. A +Z-facing character's **right hand is at −X**.

Style: chunky stylized fantasy low-poly (Warcraft 3 / Torchlight). Flat shading, bold silhouettes, oversized
hands/weapons/pauldrons, 1–2 accent colours. Keep each model under ~3k triangles.

**Pipeline (owner's rule):** an image-generated concept (with examples of our art as reference) comes first, the 3D model
is built from that image, then the icon is made from the model. **Every item model matches its approved image**
(`public/icons/approved` until concepts replace them): same silhouette, parts and colours. A model is approved only
from textured, in-game renders shown at the same angle as its image; flat previews don't count. Collars, cuffs and boot tops are open (`open_box`: closed walls round a dark sunk floor). Characters have no
thumbs, so gloves and gauntlets are thumbless mitten blocks. Each bow and staff tier has its own model.

Mostly blocky and modular, not dogmatically: use organic shapes where they look better (e.g. bat wings, hair,
trees, flames). Blocks are the default where scripted geometry shines (armour, helms, weapons, NPC/enemy bodies,
belts, trims): chamfered boxes (`box(... bevel=)`), stacked slabs, wedges and tapered blocks (`beam`), cut gems
(`facet_gem`) — a helm is a cube over the head cube, plate is stacked chamfered slabs, a pauldron is a block cap over
the shoulder corner with lames stepping down the arm. Use angled panels or organic shapes wherever they read better
than a box (hoods and cloth drapes, wing membranes, tapering horns and claws, hair and beards, flames). Pick the
shape that looks best, not the most boxy one, and don't square off things that already look good. Avoid smooth
lofted domes, superellipse shells and fine curved detail on characters: they look wrong when slightly off.

## Names are the interface
Blender forces unique object names per file, so exports may carry `.001` suffixes; the game strips `.NNN`.
Never name an object ending in three digits.

### Hero base: `hero.glb` (`tools/blender/hero.py`)
Height ~2.0. Plain clothes only (tunic `ROLE_cloth`, trousers `ROLE_cloth2`, belt/shoes `ROLE_leather`, skin `ROLE_skin`), no armour, no weapon, no hair.

Rig parts (pivots = empties at joints, children are meshes):
`body` (hips pivot) → `head`, `armL` (+X side), `armR` (−X side); `legL` (+X), `legR` (−X) on the root.

Sockets (empties, gear attaches here with identity transform):
| Socket | Parent | Position (parent-local) | Notes |
|---|---|---|---|
| `sock_head` | `head` | head centre | helmets, hair, beards |
| `sock_chest` | `body` | torso centre | body armour |
| `sock_shoulderL` / `sock_shoulderR` | `body` | top of each shoulder | pauldrons (from body armour files) |
| `sock_handL` | `armL` | palm centre | gauntlet L |
| `sock_handR` | `armR` | palm centre, rotated (+90° X) so local **+Y points forward** when the arm hangs | weapons, tools, gauntlet R uses `sock_gloveR` |
| `sock_gloveR` | `armR` | palm centre, unrotated | gauntlet R |
| `sock_footL` / `sock_footR` | `legL` / `legR` | ankle | boots |

### Role materials (recoloured at runtime)
Name materials exactly: `ROLE_skin`, `ROLE_hair`, `ROLE_cloth`, `ROLE_cloth2`, `ROLE_leather`,
`ROLE_metal`, `ROLE_trim`, `ROLE_dark`, `ROLE_glow` (emissive, takes trim colour).
Any other material keeps its authored colour.

### Gear: `gear_<model>.glb`
The file contains one or more empties named after sockets (`sock_chest`, `sock_shoulderL`, …); their children are
attached to the hero's socket of the same name. Metal parts use `ROLE_metal` / `ROLE_trim` / `ROLE_dark` so one
file serves every tier (bronze / iron / steel / emberforged / leather / wood palettes).

| Model id | Sockets | Notes |
|---|---|---|
| `sword` | `sock_handR` | ~1.45 long, blade along +Y: a proper crossguard and a long blade with a bright `ROLE_trim` edge and fuller round a `ROLE_metal` spine (`gear.py` `blade`, `crossguard`) |
| `longsword` | `sock_handR` | ~1.85 long, wider guard, same blade build |
| `pickaxe` | `sock_handR` | head at +Y end |
| `bow` | `sock_handR` | vertical bow in hand (counter-rotate −90° X inside the socket) |
| `staff` | `sock_handR` | upright staff through the front of the fist (not down the forearm), top leaning forward; orb/gem uses `ROLE_trim` + `ROLE_glow` |
| `helm_open` | `sock_head` | boxy open-faced helm (box bowl, rim band, nasal bar); face visible; hides hair |
| `helm_full` | `sock_head` | plain cube-over-cube great helm (`gear.py` `great_helm`): shell, top block, a low `ROLE_cloth` crest and a T visor cut right through a face plate standing proud of the shell (`slotted_plate`: a real recess with a lit lower lip, over a dark lining); no rivets, bands or ridges. Every heavy tier wears it (Emberforged adds a crimson crest, horns and a thin ember line in the slit); hides hair and beard |
| `body_chain` | `sock_chest`, `sock_shoulderL/R`, `sock_handL`, `sock_gloveR` | box mail shirt with a skirt block, fine staggered rows of flat links (no studs), block mail shoulder caps, mail sleeves down to the gauntlets |
| `body_plate` | `sock_chest`, `sock_shoulderL/R`, `sock_handL`, `sock_gloveR` | a few bold blocks, like a toy knight readable at ~100px: chest block over a waist block, belt, gorget, one slab tasset per thigh and one accent (a plain `ROLE_cloth` tabard dyed like the wearer's tunic); block pauldron caps and a plain rerebrace down each upper arm (same as plate set `p`). No lames, ridges, straps, rivets or trim bands |
| `body_leather` | `sock_chest`, `sock_shoulderL/R`, `sock_handL`, `sock_gloveR` | leather jerkin: stitched panels over a `ROLE_dark` underlayer, collar, chest strap, belt, skirt flaps, stud-rimmed shoulder caps, leather sleeves |
| `gloves` | `sock_handL`, `sock_gloveR` | gauntlet cuffs, slightly bigger than bare hands |
| `boots` | `sock_footL`, `sock_footR` | covers shoe, cuff at shin |
| `u_<unique id>` | as its base | hand-built unique look (own colours allowed; metal parts use `_common.metallic()` so they get the forged-metal finish) |

Body armour covers the upper arm too. Only the pauldron's top block sits on `sock_shoulderX` (it follows the arm by
75%, `anim.ts` SHOULDER_FOLLOW, so it articulates over the joint); the pauldron's side block, the lames, the
rerebrace or mail sleeve and the couter hang on the palm sockets `sock_handL` / `sock_gloveR` (0.63 below the arm
pivot), so they ride the upper arm exactly and never fan away from it (`gear.py` `block_pauldron`, `arm_box`).
Keep shoulder caps only a little wider than the arm.

Forged metal is textured by the game, not by extra geometry: `ROLE_metal` / `ROLE_dark` of forged palettes (and
`metallic()` unique parts) get the painted forge recipe (`surface.ts` `forge`, `textures.ts` `forgeTexture`): soft
hammer marks and draw-marks, a lighter worn lip on every edge and bevel, grime along each plate's foot and a tone of
its own per plate. Keep plate shapes plain; never add ridges or rivet rows to make metal read as metal.

Tier plate (full helm, platebody, gauntlets, boots) comes from `tools/blender/plate_variants.py` as
`gear_<model>_<set>.glb`, one set per design (`items.ts` `PLATE_STYLE`): `p` for bronze / iron / steel (one design,
palette only) and `e` for Emberforged (blackened gunmetal, a crimson cloth tabard and crest, and one accent: thin
fixed-colour ember seams glowing in the gaps between the cuirass slabs and under each pauldron, plus the line in the
visor slit). `export_variant('<set>')` writes them straight into `public/models`.

### Hair & beards: `hair_<1..4>.glb`, `beard_<1..3>.glb`
One `sock_head` empty; meshes use `ROLE_hair`. Every hairstyle is ONE sculpted hair mesh (`hair.py` `Mass`), never a base
cap with wigs or locks stacked on top: a grid of flow lines over the scalp from the hairline to a pole (crown whorl or
nape), shaped only by moving its points (volume, lock ridges, tips, spikes; the tied style's tail carries on from the
pole in the same surface; only its leather tie is a separate part). The head is a cube, so the scalp is a rounded box
that wraps its corners; `check_cover` refuses a mass that would let the head show through above the hairline (bald
patches), and `tests/character-art.test.ts` checks the exported hair from outside and that each style is one mesh.
The edge of the hair sits on the skin (`hug`: the closer a point is to the hairline, the more it is pulled onto the
head), so no shell floats off the head with a dark gap under it, and `even_rim` spaces the flow lines evenly along
the hairline. Every hairline point must be reachable from the pole without crossing bare skin: with a pole low behind
the head the side lines run level, so the temples cannot come lower than the hair over the ear.

### Enemies/NPCs/props
Rig names per `src/render/anim.ts` (humanoid: body/head/armL/armR/legL/legR/weapon; quadruped: legFL/legFR/legBL/legBR,
neck1.., tail1.., wingL/wingR, jaw). Props are static; origin at ground centre.
