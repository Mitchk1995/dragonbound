# Art contract: Blender ↔ game

Every model is a Python script in `tools/blender/` using `_common.py`, exported to `public/models/<file>.glb`.
Scripts read and write the checkout named by the `DRAGONBOUND_ROOT` environment variable (else the one two folders
above the script, else `D:\gameplanning`), so set it when working in a worktree. Headless re-export, e.g.:
`blender -b --python-expr "exec(open(r'<root>\tools\blender\minions.py').read())"`; for gear, set
`DB_ONLY = ['staff']` before the `exec` to export only those models.
Scripts author inside a root rotated +90° about X, so **all coordinates are three.js: Y up, +Z forward**.
Characters face **+Z**. A +Z-facing character's **right hand is at −X**.

Style: chunky stylized fantasy low-poly (Warcraft 3 / Torchlight). Chamfered boxes (`box(... bevel=)`), flat shading,
bold silhouettes, oversized hands/weapons/pauldrons, 1–2 accent colours. Keep each model under ~3k triangles.

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
| `sword` | `sock_handR` | ~1.1 long, blade along +Y |
| `longsword` | `sock_handR` | ~1.5 long, wider guard |
| `pickaxe` | `sock_handR` | head at +Y end |
| `bow` | `sock_handR` | vertical bow in hand (counter-rotate −90° X inside the socket) |
| `staff` | `sock_handR` | upright staff through the front of the fist (not down the forearm), top leaning forward; orb/gem uses `ROLE_trim` + `ROLE_glow` |
| `helm_open` | `sock_head` | open-faced helm; face visible; hides hair |
| `helm_full` | `sock_head` | full helm with visor slit; hides hair and beard |
| `body_chain` | `sock_chest`, `sock_shoulderL`, `sock_shoulderR` | rounded mail shirt, short mail sleeves; ring studs, no bands |
| `body_plate` | `sock_chest`, `sock_shoulderL`, `sock_shoulderR` | chunky breastplate + big pauldrons |
| `gloves` | `sock_handL`, `sock_gloveR` | gauntlet cuffs, slightly bigger than bare hands |
| `boots` | `sock_footL`, `sock_footR` | covers shoe, cuff at shin |
| `u_<unique id>` | as its base | hand-built unique look (own colours allowed; metal parts use `_common.metallic()` so they get the forged-metal finish) |

Tier plate (full helm, platebody, gauntlets, boots) comes from `tools/blender/plate_variants.py` as
`gear_<model>_<set>.glb`, one set per design (`items.ts` `PLATE_STYLE`): `p` for bronze / iron / steel (one design,
palette only) and `e` for Emberforged. `export_variant('<set>')` writes them straight into `public/models`.

### Hair & beards: `hair_<1..4>.glb`, `beard_<1..3>.glb`
One `sock_head` empty; meshes use `ROLE_hair`.

### Enemies/NPCs/props
Rig names per `src/render/anim.ts` (humanoid: body/head/armL/armR/legL/legR/weapon; quadruped: legFL/legFR/legBL/legBR,
neck1.., tail1.., wingL/wingR, jaw). Props are static; origin at ground centre.
