# Blueprints

Each folder holds the finished plan pictures and the design data a builder follows. Approve or change a blueprint before anyone builds it. castle-v2 and home-island-v1 are approved and built: the island in full, the castle in stages (see [CASTLE_DESIGN.md](../CASTLE_DESIGN.md) for what stands). castle-v4 is approved (October 3) and waiting to be built.

## castle-v4: the great keep (approved)

The owner's pick B, "Great keep", made into a plan of our own. A massive square keep with four spired corner turrets (28 m, spires 44 m) stands on the gate's axis with its back in the moat, with the great hall and a chapel lower either side on a raised terrace under steep slate roofs. Below it is one symmetric bailey: walled kitchen and privy gardens, the stables and the barracks facing each other across the dragon fountain, the paddock and the training yard. Twelve evenly spaced towers project into a moat on all four sides, and the rock round it has natural edges with the ledge walls following the brink. The moat falls to the stream under the gate terrace, the ledge road runs between two walls, and a stone stair of four flights climbs the rock to it. Every building has a simple interior plan that fits its outside.

Pictures: `castle-v4-plan.png`, `castle-v4-interiors.png` (inside every building), `castle-v4-massing.png` (today's overview angle) and `castle-v4-massing-camera.png` (the play camera, including the stair and the lookout, and one view of the moat behind the keep). The owner's choices are in its `README.md`. `design.json` holds every element and the build stages. `plan.py` (Pillow) draws the plan and the interiors from it and lays out the camera sheet; `massing.py` (Blender 5.2, run through the heavy-job lock) renders the blocks.

## castle-v2: Dragonspire Keep redesign

A spur castle on an irregular rock lip. An eight-sided curtain wall follows the ground and is split by a diagonal cross wall into two wards:

- **Lower ward:** garrison, tilting lists, stables and smithy, entered by a bent approach to a twin-towered gatehouse in the south-east.
- **Upper inner court:** feast court, kitchen yard, well and herb garden.

The residence is an L-shaped range hinged on a round keep tower (donjon) at the north-west high point: the great hall along the north wall, a two-storey kitchen, and a private wing down the west wall. A back gate and cliff stair sit on the west side.

Pictures: `castle-v2-overview.png`, `castle-v2-ground.png` (ground floor), `castle-v2-upper.png` (upper floor), `castle-v2-wallwalk.png` (wall walk).

## home-island-v1: the home island

A torn fragment of land, about three times the current island. Fresh tear faces run along its north and west edges, with an unbridged fracture notch; older lobes and a headland lie east and south. Castle-v2 sits on the raised north-west spur above a low central portal court with the services grouped around it. An east shelf, the north-east upland and a south-west terrace are kept free for later.

Pictures: `home-island-topdown.png` and `home-island-oblique.png`. The designer's notes are in `REVIEW.txt`.

The agents' working files (scripts, reference copies, earlier drafts, check logs) are archived in `D:\dragonbound-archive\blueprints-full-2026-10-01`.
