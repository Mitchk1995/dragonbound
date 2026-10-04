# Names are the interface

Part of the art contract ([ART_CONTRACT.md](ART_CONTRACT.md)): what each model file holds and the names the game
reads from it (rig parts, sockets, outfit pieces and materials).

Blender forces unique object names per file, so exports may carry `.001` suffixes; the game strips `.NNN`.
Never name an object ending in three digits.

## Hero base: `hero.glb` (`tools/blender/hero.py`)
Height ~2.0. The starting outfit from the approved concept sheet (October 3): tunic `ROLE_cloth` with its collar and sleeve bands in `ROLE_clothDark` (the tunic's dye, darkened by the game), trousers `ROLE_cloth2`, belt, bracers and boots `ROLE_leather`, skin `ROLE_skin`; no armour slot, no weapon, no hair.

The outfit's extra pieces sit under empties named `outfit_<slot>_*`, and the game hides them while gear fills that slot (`registry.ts` HeroDresser): `outfit_body_*` (collar, the skirt, belt and pouch, strap, the single pauldron, the sleeves) under body armour, `outfit_gloves_*` (bracers) under gloves, `outfit_boots_*` (boots) under boots. The body, arms, hands and legs under them keep the earlier hero's sizes, so every gear piece fits unchanged; `fitcheck.py` `fit_all()` and `tests/character-art.test.ts` check every piece on the hero.

Rig parts (pivots = empties at joints, children are meshes):
`body` (the hip axis, 0.9 up: the body leans about it) → `head`, `armL` (+X side), `armR` (−X side); `legL` (+X),
`legR` (−X) on the root, hinged at the tunic's hem (0.725 up, under the hips). Each arm:
`armX` (shoulder, the upper arm) → `elbowX` (0.28 below, the forearm) → `handX` (the wrist, 0.52 below the shoulder,
the hand), authored straight.

Sockets (empties, gear attaches here with identity transform). The arm sockets all sit at the centre of the hand's
hole (0.655 below the shoulder) while the arm hangs straight, each riding its own part of the arm:
| Socket | Parent | Position (parent-local) | Notes |
|---|---|---|---|
| `sock_head` | `head` | head centre | helmets, hair, beards |
| `sock_chest` | `body` | torso centre | body armour |
| `sock_hips` | `body` | on the hip axis, 0.44 below `sock_chest`; kept level with the legs (anim.ts `levelHips`) | everything below the belt: skirts, flaps, tassets, tabards (`hips.py`) |
| `sock_shoulderL` / `sock_shoulderR` | `body` | top of each shoulder | pauldrons (from body armour files) |
| `sock_upperL` / `sock_upperR` | `armL` / `armR` | the hole's centre, arm hanging | upper-arm armour: sleeves, rerebraces, lames, the pauldron's side block |
| `sock_cuffL` / `sock_cuffR` | `elbowL` / `elbowR` | the hole's centre, arm hanging | glove cuffs, vambraces |
| `sock_handL` | `handL` | centre of the hand's hole | glove L's hand |
| `sock_handR` | `handR` | centre of the hand's hole, rotated (+90° X) so local **+Y runs forward through the hole** when the arm hangs | weapons and tools, along +Y through the hole |
| `sock_gloveR` | `handR` | centre of the hand's hole, unrotated | glove R's hand |
| `sock_footL` / `sock_footR` | `legL` / `legR` | ankle | boots |

## Role materials (recoloured at runtime)
Name materials exactly: `ROLE_skin`, `ROLE_hair`, `ROLE_cloth`, `ROLE_clothDark`, `ROLE_cloth2`, `ROLE_leather`,
`ROLE_metal`, `ROLE_trim`, `ROLE_dark`, `ROLE_glow` (emissive, takes trim colour).
Any other material keeps its authored colour (its painted material: ART_FINISH.md).

## Gear: `gear_<model>.glb`
The file contains one or more empties named after sockets (`sock_chest`, `sock_shoulderL`, …); their children are
attached to the hero's socket of the same name. Metal parts use `ROLE_metal` / `ROLE_trim` / `ROLE_dark` so one
file serves every tier (bronze / iron / steel / emberforged / leather / wood palettes).

| Model id | Sockets | Notes |
|---|---|---|
| `sword` | `sock_handR` | ~1.45 long, blade along +Y: a proper crossguard and a long blade with a bright `ROLE_trim` edge and fuller round a `ROLE_metal` spine (`gear.py` `blade`, `crossguard`) |
| `longsword` | `sock_handR` | ~1.85 long, wider guard, same blade build |
| `pickaxe` | `sock_handR` | head at +Y end |
| `bow` | `sock_handR` | the bow along +Y through the hand (`gear.py` `bow_frame`), turned a quarter round so its string lies on the hand's +X side (`anim.ts` `BOW_STRING`; the draw turns the hand so it faces the archer, and carried the bow turns in the hand so it faces his chest: `bowSpin`), held `BOW_MID` below its middle so the arrow passes over the hand, a straight riser through the hole; its grip (`grip_stack`, the piece named `bow_grip`, at most 0.12 across) centred on the hand, its bands beyond the hand either side, the limbs running on from them end to end (`limbs_round_grip`) |
| `staff` | `sock_handR` | the staff along +Y through the hand (`staff_frame`), its grip in the hole; the game carries it upright, forearm forward; orb/gem uses `ROLE_trim` + `ROLE_glow` |
| `helm_open` | `sock_head` | boxy open-faced helm (box bowl, rim band, nasal bar); face visible; hides hair |
| `helm_full` | `sock_head` | plain cube-over-cube great helm (`gear.py` `great_helm`): shell, top block, a low `ROLE_cloth` crest and a T visor cut right through a face plate standing proud of the shell (`slotted_plate`: a real recess with a lit lower lip, over a dark lining); no rivets, bands or ridges. Every heavy tier wears it (Emberforged adds a crimson crest, horns and a thin ember line in the slit); hides hair and beard |
| `body_chain` | `sock_chest`, `sock_hips`, `sock_shoulderL/R`, `sock_upperL/R` | box mail shirt with a short skirt (on the hips), its rings the mail texture (no studs), block mail shoulder caps, mail sleeves down to the gauntlets |
| `body_plate` | `sock_chest`, `sock_hips`, `sock_shoulderL/R`, `sock_upperL/R` | a few bold blocks, like a toy knight readable at ~100px: chest block over a waist block, belt, gorget, one slab tasset per thigh and one accent (a plain `ROLE_cloth` tabard dyed like the wearer's tunic); block pauldron caps and a plain rerebrace down each upper arm (same as plate set `p`). No lames, ridges, straps, rivets or trim bands |
| `body_leather` | `sock_chest`, `sock_hips`, `sock_shoulderL/R`, `sock_upperL/R` | leather jerkin: stitched panels over a `ROLE_dark` underlayer, collar, chest strap, belt, skirt flaps, stud-rimmed shoulder caps, leather sleeves |
| `gloves` | `sock_handL`, `sock_gloveR`, `sock_cuffL/R` | the hand's LEGO C a size up (`gear.py` `GLOVE`, `GAUNTLET`) on the hand sockets, its open cuff on the forearm sockets, both authored round the hole's centre (off the hero they are joined again: `registry.ts` `joinCuffs`) |
| `boots` | `sock_footL`, `sock_footR` | covers shoe, cuff at shin |
| `u_<unique id>` | as its base | hand-built unique look (own colours allowed; metal parts use `_common.metallic()` so they get the forged-metal finish) |

Body armour covers the upper arm too. Only the pauldron's top block sits on `sock_shoulderX` (it follows the arm by
75%, `anim.ts` SHOULDER_FOLLOW, so it articulates over the joint); the pauldron's side block, the lames, the
rerebrace or mail sleeve and the couter hang on the upper-arm sockets `sock_upperL` / `sock_upperR` (0.655 below the
arm pivot), so they ride the upper arm exactly, never fan away from it and stay put when the elbow bends (`gear.py`
`block_pauldron`, `arm_box`); anything on the forearm (vambraces) hangs on `sock_cuffL` / `sock_cuffR`.
Keep shoulder caps only a little wider than the arm.

Surfaces are textured, not modelled: UVs, baked maps and the painted materials are the finish
([ART_FINISH.md](ART_FINISH.md)). Keep plate shapes plain; never add ridges or rivet rows to make metal read as metal.

Tier plate (full helm, platebody, gauntlets, boots) comes from `tools/blender/plate_variants.py` as
`gear_<model>_<set>.glb`, one set per design (`items.ts` `PLATE_STYLE`): `p` for bronze / iron / steel (one design,
palette only) and `e` for Emberforged (blackened gunmetal, a crimson cloth tabard and crest, and one accent: thin
fixed-colour ember seams glowing in the gaps between the cuirass slabs and under each pauldron, plus the line in the
visor slit). `export_variant('<set>')` writes them straight into `public/models`.

## Hair & beards: `hair_<1..4>.glb`, `beard_<1..3>.glb`
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

## The minifigure body: `minifig.py`
Every humanoid shares one minifigure body, the way LEGO does it (owner, October 4): the hero's own torso, hips, legs,
arms with elbows and C-hands at his sizes (`minifig.figure`), so every gear piece made for the hero fits any humanoid
built on it. Its legs are the hero's (`legs='normal'`: hinged under his hips at their hem, the hips on his level
`sock_hips`, as `hero.py` and `hips.py` build them), LEGO-style short legs about half as long for short races
(`'short'`: built as the hero's, hinged under the hips at their hem, the thighs' tops rounded about the hinge inside
them, the hips level on `sock_hips`), or none where a robe or skirt piece stands in for them (`'robe'`: the body's
pivot is then on the ground, so the robe stays planted when the figure leans). What hangs over short legs ends at the
hips' hem, beside the legs, or between them: at the end of a stride a short leg's foot comes up level with the hinge.
A character gets its identity from its own head (the hero's head cube, or its own), headgear, hair or beard, colours,
robe or skirt pieces and accessories, hung on the hero's sockets plus these attachment points:

| Point | Parent | Position | For |
|---|---|---|---|
| `sock_neck` | `body` | top of the torso, round the neck | mantles, collars, capes, things worn round the neck |
| `sock_back` | `body` | middle of the torso's back | back plates, quivers, things slung on the back |
| `sock_belt` | `body` | centre of the belt line | belts, buckles, pouches, sashes |
| `sock_hips` | `body` | the hip axis, with legs | the hero's hips socket: everything below the belt, armour's skirts and loincloths included (level with the legs, anim.ts `levelHips`) |
| `sock_skirt` | `body` | the hip line, with a robe | robes and skirts |

`minifig.finish` fuses what a character hangs on a fixed point into the rig part it rides, so a figure costs no more
draw calls than its parts; shoulder pads (on `sock_shoulderL/R`, following the arm by 3/4), the level hips, what the
right hand holds and outfit pieces keep their own. A figure that wears gear is built `dressable`: its upper arms, feet,
belt and hips are outfit pieces (`outfit_body_sleeveL/R`, `outfit_boots_L/R`, `outfit_body_belt`, `outfit_body_skirt`)
that come off under the gear that covers them, as the hero's do; so dressed, it takes every gear set as the hero does
(`fitcheck.py fit_all(body=True)` audits a plain one exactly as `fit_all()` audits the hero). Boots are made for the
hero's legs and do not fit short legs, and a character's own head (the goblin's) does not take the hero's helms, as
with LEGO's special heads.
`tests/character-art.test.ts` checks that every figure's sockets, arm joints and hands sit where the hero's do, and
its new attachment points and its feet where the body puts them.

## Enemies/NPCs/props
Goblin Grunt, Kobold Slinger, Ember Cultist and Cinder Priest (`priest.glb`) are built in `minions.py` from their approved concept sheets (October 3); the goblin (short legs) and the cultist (a robe in place of legs) on the minifigure body.
The staffs of the cult and the Warden run through a `sock_handR` empty in the hand, framed by a `staffbody` empty: a
model carrying one, anim.ts carries it upright (forearm level), raised and still upright in the cast. A club, hammer or
other thing at the side hangs on a `weapon` empty in the hand (carried at the side); the kobold's sling on `sling`.
Rig names per `src/render/anim.ts` (humanoid: body/head/armL/armR/elbowL/elbowR/handL/handR/legL/legR/weapon;
quadruped: legFL/legFR/legBL/legBR, neck1.., tail1.., wingL/wingR, jaw). Props are static; origin at ground centre.
