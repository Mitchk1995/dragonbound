# Art contract: Blender ↔ game

Every model is a Python script in `tools/blender/` using `_common.py`, exported to `public/models/<file>.glb`.
Scripts read and write the checkout named by the `DRAGONBOUND_ROOT` environment variable (else the one two folders
above the script, else `D:\gameplanning`), so set it when working in a worktree. Headless re-export goes through the
heavy-job lock in AGENTS.md, e.g.
`node tools/heavy.cjs D:/pokemon/tools/blender-5.2.2/blender.exe -b --python-expr "exec(open(r'<root>\tools\blender\minions.py').read())"`;
for gear, set `DB_ONLY = ['staff_oak']` before the `exec` to export only those models.
Scripts author inside a root rotated +90° about X, so **all coordinates are three.js: Y up, +Z forward**.
Characters face **+Z**. A +Z-facing character's **right hand is at −X**.

## The look: read this before building or reviewing anything

Every builder, critic and reviewer works from this section. Judge work against this style, not against generic realism
or smoothness. The owner's specific picks are recorded in the plan, one file per area in `docs/plan/`; read the file for the area
you are working on.

**What Dragonbound looks like.** A chunky, stylized fantasy world in the line of Warcraft and Torchlight, seen from a
Diablo-style three-quarter overhead camera. It is bright and colourful, with bold silhouettes that read at play distance
and a handful of strong colours per object rather than fine detail, finished with hand-painted textures that have real
depth. It looks hand-made, not like a photograph.

**Blocky on purpose.** Chamfered blocks, slabs, wedges and tapered beams are the house language for characters, gear,
creatures, statues, horses, props and the castle's architecture; characters stay blocky and modular, like Lego (owner,
October 3). Chunky and blocky is never a defect there, and a reviewer must not ask for it to be smoothed or sculpted.
Organic shapes are used where they read better: wings, hair, cloth, flames, rock, water, terrain, and trees and plants.
Trees are true to size, natural and realistic but softly painted, grown as one piece rather than built from blocks (owner's pick, October 3; `docs/plan/trees.md`): one continuous grown trunk and limbs under a crown of painted leaf sprays, never assembled from primitives. The game's woods and lawns grow them; dead ash and bushes keep their block models for now, and are not a defect in other work. Trees of one species vary a little in shape, turn and size on purpose; that is not the like-objects-in-different-sizes defect. Characters, enemies and NPCs keep the cartoony, blocky look.

**But built, not dumped.** "Blocky" means blocks that are *designed together*: they meet face to face, share edges and
read as one carved or built object. The owner's standing complaint is "shapes placed together instead of stitched into
a shape that makes sense". These are always defects:
- clipping or interpenetration;
- floating or detached parts;
- gaps and visible seams in something that should be continuous (a ring, a border, a base course, a rail, a path);
- one primitive jammed into another;
- misalignment or something off-centre where symmetry is intended;
- like objects in different sizes;
- trim that stops and starts.

Continuous things are one shape: a basin is one turned ring, a hedge border is one outline, a plinth is one band.

**Believable construction.** Things are built as they could really stand and be used: doors tall beside the hero with
handles at hand height, towers that you can walk into from the wall walk, paths that are proper paths with clean edges,
water that comes from somewhere and goes somewhere. "Realistic" in owner notes means *believable and well made*, not
photoreal.

**Surfaces.** Soft stylized shading, and every surface carries a hand-painted texture: stone, wood, bark, leaves, crops,
cloth. Base textures are sourced (Codex image generation in this painted style, or CC0 libraries toned to match, see AGENTS.md); the shader and the material recipes add relief, wear and tone on top. Dressed stone is the owner's pick B (October 3): chunky blocks with recessed dark joints, bevelled and slightly
chipped edges, a lit top edge and a little tone variation block to block. Its relief is drawn in the shader across wall
faces, and wherever a wall's outline shows the stones (tops, corners, arches, tower outlines) they are real blocks standing
proud of the face, so the stones clearly stand out from the play camera. Round towers are laid in flat stones, one flat
face per stone with each course turned half a stone, so they are very slightly many-sided, never smooth cylinders. The
castle is being moved to this finish now: until it lands, the old painted stone is not a defect in other work. A few accents of real material:
- forged metal;
- clear glass with a cool tint that you can genuinely see into;
- running water.

Texture scale is consistent: a few block sizes laid in courses that line up across every wall and tower, nothing
stretched, squeezed or bent round a corner or a curve.

**Structure.** Everything is built as a mason would build it (the owner: "it all has to make structural sense"): where
the way climbs it is real stairs (flights, landings, cheek walls, a parapet over every drop), not a tilted ramp; every
built terrace edge is a retaining wall, while natural rock edges stay rock; every bridge stands on arches or piers; every
door opens onto a floor at its own level; and every building's inside fits its outside (rooms, floors, stairs and
windows agree, and the play camera works in every room).

**The castle and the island.** The castle is becoming a grand royal castle round a dominant great keep (castle v4, in
planning) in cream limestone, its trim cut from the same stone; royal blue slate spires banded in gold, royal blue and gold
livery, flat crenellated roofs and lush gardens. The rock is dark blue-grey, natural, weathered and mossy. Grass is full
lawn, never scattered tufts. Clutter is never random; everything is placed on purpose.

**Characters.** Blocky and modular. Oversized hands, weapons and pauldrons, with one or two accent colours. Keep each
model under about 3k triangles.

**Reviewing.** A critic first states the style above in one line, then looks for construction defects and departures
from the owner's picks. A critic never proposes a different style.

## Building models

**Pipeline (owner's rule):** an image-generated concept (with examples of our art as reference) comes first, the 3D model
is built from that image, then the icon is made from the model. **Every item model matches its approved image**
(`public/icons/approved` until concepts replace them): same silhouette, parts and colours. A model is approved only
from textured, in-game renders shown at the same angle as its image; flat previews don't count. Collars, cuffs and boot tops are open (`open_box`: closed walls round a dark sunk floor). Each bow and
staff tier has its own model.

**Hands are LEGO hands; arms bend at the elbow** (owner, October 3: "it has to be all one shape like a lego hand", never
a thumb). Every humanoid hand (hero, cultist, priest, goblin, Warden, Quartermaster) is one chunky C in one piece
(`_common.clip_hand`): an octagonal ring round a hole, a slot through its C, a short stub up into the wrist. Its hole
runs front to back when the arm hangs, and whatever the hand holds runs through it at right angles to the forearm: a
sword's grip, a club's haft, a staff, a bow, a drawn bowstring. Grips are square, at most 0.12 across, so they fill the
hole (`gear.py`). Gloves and gauntlets are the same C a size up round a hole a hair smaller (the bare hand inside
never shows), their cuffs on the forearm. Kobolds keep their lizard claws. Every humanoid arm is an upper arm, a
forearm and a hand on three pivots, `armX` (shoulder), `elbowX` and `handX` (wrist), authored straight; limbs meeting
at an elbow are rounded about it (`_common.joint_limb`), so the joint stays closed at any bend. The game bends them
(anim.ts): a relaxed bend at rest; a staff carried upright with the forearm level (the "upright" hold, from the weapon
on the hero and from a `staffbody` part on a creature); a bow carried ready in front of the hip, angled down and
forward (the "bow" hold, below); a blade, club or tool at the side, the wrist tipping it down;
the sword's wind-up folds the forearm back over the shoulder and cocks the wrist so the blade rises in line with the
forearm; and the bow draw reaches the string with a two-bone reach (`Rig.reach`), the elbow bent and swung out so the
arm stays clear of the chest.

**A bow's string always faces the archer** (owner, October 4: "holding bow completely backwards", then "still held
wrong"): its limbs curve away from him, carried, drawn and after the shot, and the hand holds it at the grip's middle.
Carried, the bow arm is forward and out from the side, barely swinging, the bow ready in front of the hip, angled down
and forward: back forward, string toward his chest. A bow as deep as the Worn Shortbow's D can face its string to him
only so: at his side its string would pass through his arm or chest, so the deeper the bow, the further out it is held
(`anim.ts` `BOW_OUT_K`). The bow turns in the hand about its grip (`bowSpin`); coming up to shoot it turns to its frame
in `gear.py`, string down the arrow toward the archer. The archer turns side-on into the shot (90°), holds the stance
between shots and lowers back to the carry a moment after the last, every step blended (`Rig.stance`). The draw hand
anchors at the jaw, the arrow just under the chin: a minifigure's chin is out of the hand's reach (its head is as wide
as its shoulders are far apart, and an armoured upper arm swung further across meets the breastplate).

**The bow is measured, never judged by eye** (October 4). `src/render/bowMeasure.ts` reads it from the scene graph in
world space, trusting nothing about how it was authored (tips from the string's ends, riser from its own vertices, its
back as the way from the string through the riser, the grip from the piece named `bow_grip`), and holds it to the
rules: string between riser and archer, toward his chest; limbs bending away; aimed, upright with the aim in its
plane and the archer side-on, his shoulders along the aim; the hand's hole at the grip's middle; drawn, the draw hand
on the nock beside the jaw, the arrow on the string, at the target, beside the riser, past the bow's back; carried,
angled down and forward, back forward; and nothing of bow, string or arrow cutting into him. `tests/bow-audit.test.ts`
plays every bow, in the starting outfit and in plate, frame by frame through standing, a stride, two shots and
lowering, and proves the checks catch a bow turned round, pushed into him or off its grip; the `bow` inspect suite
measures the player in the running game, shooting every way (report.json; a broken rule fails the run), and marks the
bow in its pictures (string red, back blue, arrow head green) from the side and straight down; `bowcheck.py`
`bow_check_all()` checks the string's side and the clipping in Blender.

**Arms never cut into bodies.** Arms hang against the sides of the body and swing past them: anim.ts turns the hanging
arms a little out (`ARM_SPLAY`), and every character's arms sit just outside its torso, belt and robe. On the hero,
body armour's sides stand at x ±0.38 and its sleeves start there (`gear.py` `ARM_IN`, `sleeve`); the tunic's own
sleeves come off under body armour. `fitcheck.py` `arm_clip_all()` poses every humanoid (hero in every gear set,
creatures and town NPCs, and a bow in every kind of armour) as the game does (idle, walk, the frames of each attack, of
the bow draw and of lowering the bow after it), elbows, wrists and the draw's reach included, and measures any arm
cutting into the body; only the goblin's club arm passing behind its ear is allowed (and the draw arm's shoulder dipping
under its cap for the instant the bow comes up). `held_clip_all()` does the same for what the hands carry (every hero
weapon, in the starting outfit and in plate, and every creature's staff, club or hammer): it runs through the holding
hand but cuts into nothing else, so no bow limb in the striding leg, staff foot in a robe or pommel in a forearm.

**Legs never show through what hangs from the hips.** Like a LEGO minifigure's, the hero's legs hinge under his hips,
at the tunic's hem (`hero.py` LEG_HINGE), the top of each thigh rounded about the hinge (`joint_limb`), and everything
below the belt hangs on the hips socket, `sock_hips`: the tunic's skirt, every armour's skirt and the flaps, tassets
and tabard hanging from its belt. The hips stay level with the legs however the body leans (anim.ts `levelHips`), and a
sword swing turns the whole hero rather than twisting his body on his legs, so a striding leg only ever swings below
them. A skirt's top is round about the hip axis up into its belt (`hips.py` `hip_skirt`), so the belt turns over it as
the body leans; whatever hangs from a belt starts behind it (`TUCK`), so no gap opens under the belt in the walk. Legs
hinged that low swing a little further and step a little quicker (anim.ts Rig `swing`, `stride`). Under body armour the
tunic's skirt and belt come off. The goblin and the kobold are built the same way (`minions.py` `GOB_HINGE`,
`KOB_HINGE`): the goblin's seat, belt and loincloth flaps and the kobold's hips, belt, pouches and tail hang on their
`sock_hips`, the thighs rounded about a hinge under them. `skirtcheck.py` `skirt_clip_all()` poses every outfit and
creature through the whole stride at every lean its body takes and in every attack, and measures any leg standing out
through what hangs over it: every hero outfit, the goblin and the kobold measure zero.

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

### Role materials (recoloured at runtime)
Name materials exactly: `ROLE_skin`, `ROLE_hair`, `ROLE_cloth`, `ROLE_clothDark`, `ROLE_cloth2`, `ROLE_leather`,
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
| `bow` | `sock_handR` | the bow along +Y through the hand (`gear.py` `bow_frame`), turned a quarter round so its string lies on the hand's +X side (`anim.ts` `BOW_STRING`; the draw turns the hand so it faces the archer, and carried the bow turns in the hand so it faces his chest: `bowSpin`), held `BOW_MID` below its middle so the arrow passes over the hand, a straight riser through the hole; its grip (`grip_stack`, the piece named `bow_grip`, at most 0.12 across) centred on the hand, its bands beyond the hand either side, the limbs running on from them end to end (`limbs_round_grip`) |
| `staff` | `sock_handR` | the staff along +Y through the hand (`staff_frame`), its grip in the hole; the game carries it upright, forearm forward; orb/gem uses `ROLE_trim` + `ROLE_glow` |
| `helm_open` | `sock_head` | boxy open-faced helm (box bowl, rim band, nasal bar); face visible; hides hair |
| `helm_full` | `sock_head` | plain cube-over-cube great helm (`gear.py` `great_helm`): shell, top block, a low `ROLE_cloth` crest and a T visor cut right through a face plate standing proud of the shell (`slotted_plate`: a real recess with a lit lower lip, over a dark lining); no rivets, bands or ridges. Every heavy tier wears it (Emberforged adds a crimson crest, horns and a thin ember line in the slit); hides hair and beard |
| `body_chain` | `sock_chest`, `sock_hips`, `sock_shoulderL/R`, `sock_upperL/R` | box mail shirt with a short skirt (on the hips), fine staggered rows of flat links (no studs), block mail shoulder caps, mail sleeves down to the gauntlets |
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
Goblin Grunt, Kobold Slinger, Ember Cultist and Cinder Priest (`priest.glb`) are built in `minions.py` from their approved concept sheets (October 3).
The staffs of the cult and the Warden run through a `sock_handR` empty in the hand, framed by a `staffbody` empty: a
model carrying one, anim.ts carries it upright (forearm level), raised and still upright in the cast. A club, hammer or
other thing at the side hangs on a `weapon` empty in the hand (carried at the side); the kobold's sling on `sling`.
Rig names per `src/render/anim.ts` (humanoid: body/head/armL/armR/elbowL/elbowR/handL/handR/legL/legR/weapon;
quadruped: legFL/legFR/legBL/legBR, neck1.., tail1.., wingL/wingR, jaw). Props are static; origin at ground centre.
