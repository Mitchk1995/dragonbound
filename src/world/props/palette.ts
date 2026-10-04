import * as THREE from 'three';
import { PAL } from '../../render/kit';
import { type PaintKind } from '../../render/paint';

/** The props' colours, and the painted pattern (paint.ts) each colour takes when a prop is finished. */

// Masonry: close shades of one stone so walls read as blocks, never as stripes.
export const STONE = 0x8a8478, STONE_L = 0x969086, STONE_D = 0x6e685f, STONE_DD = 0x57524b;
/**
 * Dragonspire Castle's own stone (docs/CASTLE_DESIGN.md, "Colour and materials"): cream limestone
 * for every mass, its trim cut from the same stone (the owner's pick, October 3): the dressed stones
 * of string courses, copings, arches, jambs and sills a shade paler (DRESS), the deep base courses a
 * shade darker, weathered (BASE), and a grey deck for walks and platforms. Blue is kept for the slate
 * of roofs and spires, the doors and the livery. The rest of the world keeps STONE.
 */
export const ASHLAR = 0xc5b79b, ASHLAR_L = 0xd4c8b0, ASHLAR_W = 0xafa38a;
/** The buildings' (and the keep's) ivory, a clear step paler than the honey curtain and towers. */
export const ASHLAR_B = 0xefe3c8;
export const DRESS = ASHLAR_L, BASE = ASHLAR_W, DECK = 0x8a8478;
/** The dark slate inlaid in the wall towers' compass roses. */
export const INLAY = 0x545e6c;
/** Kerbs and borders edging the castle's paving: the paving's own stone a shade darker. */
export const KERB = 0x736d66;
/** A road's flagstones laid as a prop (the climb's paving): the paved ground's own grey. */
export const PAVE = 0x8c8780;
/** The spires: deep slate-navy (the castle's second blue, between the grey dressings and the royal livery). */
export const SLATE_BLUE = 0x34466a;
/** The castle buildings' flat roofs: lead in the spires' slate-navy, laid in a subtle two-tone diamond chequer. */
export const ROOF_BLUE = 0x35476b, ROOF_BLUE_L = 0x3c4f74, ROOF_ROLL = 0x4a5a7c;
/** Gilding laid on stone and slate (bands, friezes, fillets): matt gold leaf, not polished metal. */
export const GILT = 0xd6a646;
/** The lord's livery: royal blue cloth (field and shade) charged and edged in gold (PAL.gold). */
export const HERALD_BLUE = 0x2f5ad0, HERALD_BLUE_D = 0x2442a0;
export const BRICK = 0x9a5a42, BRICK_L = 0xa8664a, BRICK_D = 0x7e4836;
export const WOOD = PAL.wood, WOOD_D = 0x4a3020, WOOD_L = 0x8a6440;
export const SLATE = 0x4e5564, PLASTER = 0xd6cab0, DARK = 0x1c1612;
export const IRON = 0x4a4a52, IRON_L = 0x6e7280;
export const BONE = 0xcbbd9c, BONE_D = 0xa8997a;
export const COAL = 0x161517, OBSIDIAN = 0x1a1418;
/** Old iron gone to rust (the cracked anvil): dull brown iron with a paler pitted face, rust streaks. */
export const RUSTY = 0x5a4842, RUSTY_L = 0x6e5a50, RUST = 0x8a4a2a;
/** The Emberforge's stone: warm dressed sandstone, or soot-blackened while it lies cold. */
export const SAND = [0xa89478, 0xb4a084, 0x9a876c], SOOT = [0x6a645c, 0x5a554f, 0x4c4742], BRICK_SOOT = [0x5a3a30, 0x4a3028, 0x6a4436];
/** Basalt (lair): cooled black rock with slightly lighter weathered tops. */
export const BASALT = 0x2e2626, BASALT_L = 0x453a36, BASALT_D = 0x201a1a;
/** Standing water on a cave floor: dark and glossy (reflects like coal and obsidian). */
export const PUDDLE = 0x1a3238;
/** Rock wet with spray behind and beside a waterfall: darker, with a glossy sheen. */
export const ROCK_WET = 0x444a56;
/** The castle's lamp and lantern metal: dark navy-lacquered iron, picked out in gold. */
export const LAMP_NAVY = 0x27324a;
export const METALS = new Set([IRON, IRON_L, PAL.gold, LAMP_NAVY]);
export const GLOSSY = new Set([COAL, OBSIDIAN]);
/** Cut blocks built as geometry (walls of the tower, forge bricks): painted as chiselled rock, no mortar. */
export const BLOCKS = [0x8b8579, 0x979187, 0x6f6960];

/** Plot markers and restored buildings: each profession's colour. */
export const PLOT_MARK: Record<string, number> = { vault_expanded: PAL.gold, alchemy_lab: 0x5ad07a, rune_altar: 0x6aa8ff, hatchery: 0xffa050 };

/** Painted albedo per prop colour (explicit where known; judged by hue otherwise). */
export const PAINT_OF = new Map<number, PaintKind>();
const paintAs = (kind: PaintKind, cols: number[]) => cols.forEach((c) => PAINT_OF.set(c, kind));
paintAs('masonry', [STONE, STONE_L, STONE_D, STONE_DD, 0x7e776c, 0x7a7870, 0x6a6860, 0x6e6a66]);
paintAs('rock', [RUSTY, RUSTY_L, RUST, ...BLOCKS, BASALT, BASALT_L, BASALT_D, 0x3a2e24, 0x241e1a, 0x1a1311, 0x0f0b0a, 0x2a1d17, BRICK, BRICK_L, BRICK_D, 0x4a4240, 0x3e3634, 0x554c48, 0x3a3230, 0x3a3232, 0x2a2424, 0x6a6258, 0x6e6a66, 0x3c3834, 0x2e2624, 0x7a7068, 0x6a6058, 0x4a4440, 0x6a5a40, 0x5a4a34, 0x2e2828, 0x241e1e, 0x1e1818]);
paintAs('wood', [WOOD, WOOD_D, WOOD_L, 0x7a5636, 0x94704a, 0x5a3a22, 0x3a2618, 0x5a3a20, 0x4a2e18, 0x8a6a44, 0x5a4a3a, 0x3a2a1e, 0xa08058]);
paintAs('shingle', [SLATE, 0x3e4450, 0x4a6a48, 0x4a4a78, 0x9a5438, 0x3e6a6a, 0x7a4a34]);
paintAs('masonry', [...SAND, ...SOOT]);
paintAs('ashlar', [ASHLAR, ASHLAR_L, ASHLAR_W, ASHLAR_B]);
paintAs('masonry', [KERB, INLAY, DECK, PAVE]);
// (The spires and the slate roofs keep the blocky slate courses they have always been painted in: the
// shingle pattern is too fine to read from the overview.)
paintAs('masonry', [SLATE_BLUE]);
// (Lead is sheet metal, never laid as stones.)
paintAs('soft', [ROOF_BLUE, ROOF_BLUE_L, ROOF_ROLL]);
paintAs('soft', [GILT]);
paintAs('soft', [HERALD_BLUE, HERALD_BLUE_D]);
paintAs('rock', BRICK_SOOT);
paintAs('soft', [0x4b3122]);
paintAs('bone', [BONE, BONE_D, PAL.bone]);
paintAs('plaster', [PLASTER, 0xe8dcc0, 0xc8b070]);
paintAs('hide', [0x8a6a48, 0x6e5238, 0x7a5a3a, 0x5a4230, 0x8a4a34, 0x6a3a2a, 0x8a2424, 0x8a2a1e, 0x7a2020, 0x6a2020, 0xa03030, PAL.leather]);

/** Ivy and climbing roses on the castle's walls: leaf greens (painted as foliage) and the roses' blooms. */
export const CLIMBER_IVY = [0x55862f, 0x67973a, 0x7aa644], CLIMBER_ROSE_LEAF = [0x3e6e30, 0x4a7a36, 0x56863c], CLIMBER_BLOOM = [0xe0507a, 0xf08aa8, 0xf6eee2];
/** The garden trees' leaf (clipped green, pink blossom, gold, apple), painted as foliage like the island's trees. */
export const GARDEN_LEAF = [[0x3e6e2e, 0x4a7a34, 0x56883c], [0xe48aac, 0xf2b4c8, 0xd27298], [0xdcae46, 0xeac460, 0xc8983a], [0x44742f, 0x4f8036, 0x5a8c3e]];
paintAs('foliage', GARDEN_LEAF.flat());
paintAs('foliage', [...CLIMBER_IVY, ...CLIMBER_ROSE_LEAF]);

export function paintFor(hex: number): PaintKind {
  const known = PAINT_OF.get(hex);
  if (known) return known;
  const hsl = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  if (hsl.s < 0.12) return 'rock';
  if (hsl.h > 0.03 && hsl.h < 0.12 && hsl.l < 0.45) return 'wood';
  return 'soft';
}

/** The champions' warm marble. */
export const MARBLE = 0xe2d6c0, MARBLE_D = 0xcab99c, MARBLE_L = 0xefe6d4;
paintAs('plaster', [MARBLE, MARBLE_D, MARBLE_L]);
/**
 * Cast bronze (the dragon and the fountain's spouts), worn gold where hands touch it. The wing
 * membranes are the same casting a value darker (MEMBRANE), never a painted panel of another colour.
 */
export const BRONZE = 0x8a5a2b, BRONZE_D = 0x5c3a1c, BRONZE_L = 0xa8743c, WORN = 0xd0a858, BELLY = 0x96642f, MEMBRANE = 0x74481f;
export const BRONZES = new Set([BRONZE, BRONZE_D, BRONZE_L, WORN, BELLY]);

/**
 * The castle's door wood: oak boards stained in the lord's blue and weathered, each board a shade
 * apart, and the dark seen in the joints between them (the leaf's core).
 */
export const DOOR_STAIN = [0x32496f, 0x3a5079, 0x2c4163], DOOR_CORE = 0x121926;
paintAs('grain', DOOR_STAIN);
