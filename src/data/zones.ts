import { Ground, type ZoneLayout } from '../world/layout';
import { buildFoothills, buildKeep, buildLair, buildMine, buildRuin } from './zoneMaps';

export { KEEP_ARCHES, KEEP_STAGE } from './zoneMaps';

export type ZoneKind = 'hub' | 'gather' | 'hunt' | 'quest' | 'lair';

export interface ZoneTheme {
  bg: number;
  fog: [number, number];
  hemi: [number, number, number];
  sun: [number, number];
  exposure: number;
  ambient: 'embers' | 'void' | 'cave' | 'ash' | 'none';
  /** Two shades per ground type, blended with noise. */
  ground: Partial<Record<Ground, [number, number]>>;
  trees: 'pine' | 'ash' | 'grove';
  wall: 'castle' | 'cave' | 'ruin';
  /** Ground texture per ground type (0 dirt, 1 grass, 2 flagstone, 3 rock) when it differs from the default. */
  splat?: Partial<Record<Ground, 0 | 1 | 2 | 3>>;
  /** Glowing lava in the ground's deepest crevices. */
  lava?: number;
  /** Cliff/plateau rock colours (two shades blended with noise). */
  cliff?: [number, number];
  /** Water colours: shallow, deep. */
  water?: [number, number];
  /** Tree species mix (weights); defaults to all `trees`. */
  forest?: Partial<Record<'pine' | 'ash' | 'grove', number>>;
  /** Chance of a tree on each interior plateau/cliff-top cell. */
  reliefTrees?: number;
  /** Wildflower colours for grassy meadows. */
  flowers?: number[];
  /** Brightness multiplier for the tops of high relief (caves: rock falls away into darkness). */
  topShade?: number;
  /** Height band (y from, to) over which relief darkens to `topShade`. */
  topRange?: [number, number];
  /** Cave walls: extra height the rock climbs to away from the floor (towering walls, not a plateau). */
  wallRise?: number;
  /** Ground on top of cliffs/mesas (their steep faces are rock); undefined = rock all over. */
  mesaTop?: Ground;
  /** The land dims over its last cells before the Void that ends it (an organic outline). */
  edgeFade?: boolean;
}

export interface ZoneDef {
  id: string;
  name: string;
  kind: ZoneKind;
  theme: ZoneTheme;
  build: (seed: number) => ZoneLayout;
  /** Portal-arch colour in the keep. */
  arch: number;
}

const FOOTHILLS_GROUND: ZoneTheme['ground'] = {
  [Ground.Dirt]: [0x76654a, 0x6a5a42], [Ground.Path]: [0x9a8666, 0x8a7656],
  [Ground.Scorch]: [0x5a4a3a, 0x4a3a2e], [Ground.Arena]: [0x3a2a24, 0x5a2a18],
  [Ground.Grass]: [0x5a7a3a, 0x6a8a44], [Ground.Camp]: [0x6a5a44, 0x5a4a38],
};

export const ZONES: Record<string, ZoneDef> = {
  keep: {
    id: 'keep', name: 'Dragonspire Keep', kind: 'hub', arch: 0xffffff, build: buildKeep,
    theme: {
      // The golden hour: a warm low sun, a soft rose-lilac sky light and a warm bounce, so shade stays
      // readable and the castle's cream stays honey in its shadow; distant land fades into the peach
      // haze of the horizon.
      bg: 0xc39a9c, fog: [70, 160], hemi: [0xc8b8d4, 0x8a7058, 1.9], sun: [0xffcf9a, 2.35], exposure: 1.1,
      ambient: 'void', trees: 'grove', wall: 'castle',
      ground: { [Ground.Grass]: [0x4a7a3a, 0x5a8a44], [Ground.Stone]: [0x928e88, 0x827e78], [Ground.Path]: [0x8a7a5e, 0x7a6a50], [Ground.Dirt]: [0x6e6048, 0x5e5240] },
      // The castle rock and the upland: weathered grey-mauve granite faces (framing the cream castle), grass over their tops.
      cliff: [0x857f80, 0x5f5a60],
      mesaTop: Ground.Grass,
      reliefTrees: 0.04,
      forest: { grove: 0.75, pine: 0.25 },
      flowers: [0xf0d060, 0xe86a8a, 0xb0a0ff, 0xffffff],
      water: [0x4aa0b8, 0x1a4a62],
    },
  },
  mine: {
    id: 'mine', name: 'Emberdeep Mine', kind: 'gather', arch: 0xffb050, build: buildMine,
    theme: {
      bg: 0x0c0908, fog: [26, 60], hemi: [0xaaa49c, 0x3e3026, 1.3], sun: [0xffc88c, 1.65], exposure: 1.35,
      ambient: 'cave', trees: 'pine', wall: 'cave',
      ground: { [Ground.Cave]: [0x5e5042, 0x86725a] },
      cliff: [0x6e5c4a, 0x56463a],
      water: [0x2e7282, 0x0a2632],
      topShade: 0.3,
      topRange: [2.5, 12],
      wallRise: 7,
    },
  },
  foothills: {
    id: 'foothills', name: 'Wyrmwood Foothills', kind: 'hunt', arch: 0xff6a2a, build: buildFoothills,
    theme: {
      bg: 0x3a3440, fog: [46, 110], hemi: [0xb8c8e8, 0x5a4636, 1.25], sun: [0xffe2b8, 2.6], exposure: 1.05,
      ambient: 'embers', trees: 'pine', wall: 'cave', ground: FOOTHILLS_GROUND,
      forest: { pine: 0.55, grove: 0.3, ash: 0.15 },
      reliefTrees: 0.08,
      mesaTop: Ground.Grass,
      edgeFade: true,
      flowers: [0xf0c040, 0xd85a4a, 0xa888ff, 0xf4f0e0],
      cliff: [0x7a6a5a, 0x5a4e44],
      water: [0x4a8aa0, 0x16384a],
    },
  },
  ruin: {
    id: 'ruin', name: 'Sunken Ruin', kind: 'quest', arch: 0x6ad0c0, build: buildRuin,
    theme: {
      bg: 0x141a22, fog: [30, 66], hemi: [0xa8c4d8, 0x34443e, 1.35], sun: [0xd8e8ff, 2.1], exposure: 1.2,
      ambient: 'ash', trees: 'grove', wall: 'ruin',
      ground: { [Ground.Stone]: [0x6a7070, 0x5a6060], [Ground.Grass]: [0x3a5a3a, 0x4a6a44] },
      forest: { grove: 0.7, ash: 0.3 },
      cliff: [0x4a5456, 0x3a4244],
      water: [0x2c8a84, 0x08203a],
    },
  },
  lair: {
    id: 'lair', name: "Cinderwing's Lair", kind: 'lair', arch: 0xff2a1a, build: buildLair,
    theme: {
      bg: 0x1c0a08, fog: [34, 70], hemi: [0xe8b090, 0x4a2418, 1.3], sun: [0xffb07a, 2.6], exposure: 1.2,
      ambient: 'embers', trees: 'ash', wall: 'cave',
      ground: { [Ground.Arena]: [0x5a443c, 0x4a3832], [Ground.Path]: [0x5a4a40, 0x4a3e36], [Ground.Scorch]: [0x4a3a34, 0x3a2e2a] },
      splat: { [Ground.Arena]: 3, [Ground.Path]: 3 },
      cliff: [0x523c32, 0x3e2e28],
      topShade: 0.55,
      topRange: [2.5, 8],
      lava: 1,
    },
  },
};
