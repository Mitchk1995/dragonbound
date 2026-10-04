# The finish: UVs, baked maps and painted materials

How a model's surface is made, after its shape (shapes, names and sockets: [ART_NAMES.md](ART_NAMES.md)). Every
model a script exports through `_common.export` gets the **bake finish** when its file is in `bake.py` `BAKED` (today
the hero, his gear and hair, and the goblin); the rest keep the older paint the game projects on them, until a job adds
them. The method is a professional's for low-poly blocks, all in code: `tools/blender/bake.py`'s module comment is the
reference, and `tests/bake.test.ts` checks the committed outputs (CI does not run Blender).

## What the export does

1. **Detail for the bake only.** A part named `stitch` (leather stitching, `gear.py` `stitches`) is made solid and baked
   into the panel under it (relief, shade and thread colour), then removed; `mail_link` rows are dropped, the mail
   texture draws the rings. Model new fine detail the same way: as named parts the bake takes, never as game geometry.
2. **Weighted normals.** Every part shades smooth under a face-area Weighted Normal modifier: big faces stay flat, each
   chamfer rolls the light round its edge. Unbevelled corners (sharper than 50°) stay hard.
3. **UVs, two maps.** Smart UV Project finds the islands. `tile` (TEXCOORD_0) lays each island flat at true size, in
   metres, square to its part (v up its sides): the painted materials run at one texel density and one way up on every
   piece. `bake` (TEXCOORD_1) is the same islands, unturned, packed into one atlas for the whole model, 200 texels to the
   metre (256 to 1024 square); small islands (corners, studs) take twice their share, and faces buried inside another
   part riding the same rig part take none.
4. **High-poly and bake.** A copy of each part with rounded edges (and its baked-only detail), one per rig part, is
   baked onto the parts with Cycles on the CPU (fixed samples and seed: a re-export reproduces the maps): its normal,
   its occlusion (near and broad, only from parts that move with it), a tone of each island's own, the painted light (a
   face lighter at its top than its foot, tops lit, undersides shaded) and its convex edges.
5. **One map beside the `.glb`**: `<name>.bake.webp` (lossless): normal x and y, the painted value (occlusion x tone x
   light, stored at 0.8 so up to 1.25 fits), and 0.75 + a quarter of the worn edge, less a quarter of the baked-on
   detail (the alpha never drops under 0.5: under a clearer alpha a browser may not keep a texel's colour exactly).

The export warns (`BAKE WARNING`) when two parts' faces lie flush over each other: painted from different places in the
atlas they flicker, so inset one a hair (`gear.py` `GUARD_INSET`).

## How the game paints it

`src/render/charBake.ts` paints a finished model's materials in one shader for all of them: the part's role colour (a
dyed tunic, a tier's metal, a skin tone) times its painted material, warm in its lights and cool in its darks; the baked
value painted in and shading the ambient light; worn edges lighter (bare metal, scuffed leather), first where the grain
stands proud; the baked normal under the material's own relief; stitching in thread colour.

The painted materials are a library of sourced, tileable layers (`public/textures/characters`, made by
`tools/char_textures.py` from Codex paintings; the mail baked from modelled rings by `tools/blender/mail_tile.py`;
sources and licences in its `LICENSES.md`), one texture array. `src/render/charSurfaces.ts` `SURFACES` holds each kind
of surface's recipe (its layer, scale, how far its paint and relief swing, how its edges wear). A part's kind comes from:

- its role and, for gear, the tier's palette (`gearSurface`): forged tiers are plate (the mail shirt mail) with polished
  trim and blackened dark parts, bows and staves wood, leather armour leather over a padded underlayer;
- else the kind its script names: `_common.mat(color, kind='wood')`, or `(color, 'plain')` anywhere a colour goes
  (eyes, mouths and other parts that take no material);
- else its colour (`registry.ts` `fixedPaint`).

## Making or changing one

Re-export a model as usual (ART_CONTRACT.md, through the heavy-job lock); its map is rewritten beside it. Add a kind of
surface by adding its layer (a Codex painting run through `char_textures.py`, listed in `LICENSES.md`) and its recipe.
Judge a change in the game: `npm run inspect -- chartex` captures the hero in every tier, the goblin, each material
close up and a crowd of twenty at the play camera with the frame's cost.
