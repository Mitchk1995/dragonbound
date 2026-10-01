/**
 * Approved painted artwork: every piece of equipment (the bronze, iron, steel and Emberforged sets, the four bows,
 * the four staves, leather and jewellery) routes to its file by base; all five uniques (the Wyrmbone Harness by its
 * save id `scaleguard`) by their own unique id, ahead of their approved bases; Cleave to its tile. Everything else
 * (materials, quest items, any unknown unique, the other abilities and the basic attacks) keeps its generated icon.
 * The files are the exact supplied bytes: intact RGBA PNGs, 1254×1254 but for the 1536×1024 leather gloves and
 * boots, whose alpha tops out at 254.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/data/abilities';
import { BASES, PIECES, TIER_ORDER, UNIQUES, pieceId } from '../src/data/items';
import { generateUnique, makeItem } from '../src/loot/itemGen';
import { APPROVED_DIR, APPROVED_FILES, abilityArtUrl, itemArtUrl } from '../src/ui/approvedArt';
import type { Item } from '../src/types';
import { BASIC_TILE } from '../src/ui/skillTiles';

const BRONZE: Record<string, string> = {
  bronze_sword: 'bronze-sword-icon-v1.png',
  bronze_longsword: 'bronze-longsword-icon-v1.png',
  bronze_medhelm: 'bronze-medhelm-faceted-icon-v1.png',
  bronze_fullhelm: 'bronze-fullhelm-faceted-icon-v1.png',
  bronze_chainbody: 'bronze-chainbody-icon-v1.png',
  bronze_platebody: 'bronze-platebody-clearance-icon-v1.png',
  bronze_gauntlets: 'bronze-gauntlets-thumbless-icon-v2.png',
  bronze_boots: 'bronze-boots-icon-v1.png',
  bronze_pickaxe: 'bronze-pickaxe-icon-v1.png',
};
const IRON: Record<string, string> = {
  iron_sword: 'iron-sword-icon-v1.png',
  iron_longsword: 'iron-longsword-icon-v1.png',
  iron_medhelm: 'iron-medhelm-icon-v1.png',
  iron_fullhelm: 'iron-fullhelm-icon-v1.png',
  iron_chainbody: 'iron-chainbody-icon-v1.png',
  iron_platebody: 'iron-platebody-icon-v1.png',
  iron_gauntlets: 'iron-gauntlets-icon-v1.png',
  iron_boots: 'iron-boots-icon-v1.png',
  iron_pickaxe: 'iron-pickaxe-clear-margin-icon-v2.png',
};
const STEEL: Record<string, string> = {
  steel_sword: 'steel-sword-icon-v1.png',
  steel_longsword: 'steel-longsword-icon-v1.png',
  steel_medhelm: 'steel-medhelm-icon-v1.png',
  steel_fullhelm: 'steel-full-helm-icon-v1.png',
  steel_chainbody: 'steel_chainbody.png',
  steel_platebody: 'steel-platebody-clearance-v3.png',
  steel_gauntlets: 'steel_gauntlets-v2.png',
  steel_boots: 'steel_boots.png',
  steel_pickaxe: 'steel-pickaxe-icon-v2.png',
};
const EMBER: Record<string, string> = {
  ember_sword: 'ember_sword-icon-v3.png',
  ember_longsword: 'ember_longsword-icon-v2.png',
  ember_medhelm: 'ember_medhelm-icon-v1.png',
  ember_fullhelm: 'ember_fullhelm-icon-v1.png',
  ember_chainbody: 'ember_chainbody-icon-v1.png',
  ember_platebody: 'ember_platebody-icon-v1.png',
  ember_gauntlets: 'ember_gauntlets-icon-v1.png',
  ember_boots: 'ember_boots-icon-v1.png',
  ember_pickaxe: 'ember_pickaxe-icon-v1.png',
};
const BOWS_STAVES: Record<string, string> = {
  worn_bow: 'worn-bow-redesign-v2.png',
  hunter_bow: 'hunter-bow-redesign-v2.png',
  recurve_bow: 'recurve-bow-redesign-v2.png',
  drakebone_bow: 'drakebone-bow-redesign-v2.png',
  oak_staff: 'oak_staff-redesign-v3.png',
  apprentice_staff: 'apprentice_staff-redesign-v5.png',
  runed_staff: 'runed_staff-redesign-v5.png',
  ember_staff: 'ember_staff-redesign-v6.png',
};
const LEATHER: Record<string, string> = {
  leather_cap: 'leather_cap-icon-v1.png',
  leather_body: 'leather_body-icon-v2.png',
  leather_gloves: 'leather_gloves-icon-v1.png',
  leather_boots: 'leather_boots-icon-v1.png',
};
const JEWELLERY: Record<string, string> = {
  bone_amulet: 'bone_amulet-icon-v1.png',
  jade_amulet: 'jade_amulet-icon-v1.png',
  copper_ring: 'copper_ring-icon-v1.png',
  silver_ring: 'silver_ring-icon-v1.png',
};
const ITEMS = { ...BRONZE, ...IRON, ...STEEL, ...EMBER, ...BOWS_STAVES, ...LEATHER, ...JEWELLERY };
/** By exact unique id, with the approved base each sits on. */
const UNIQUE_ART: Record<string, [file: string, base: string]> = {
  cinderfang: ['cinderfang-redesign-v1.png', 'steel_longsword'],
  ashen_crown: ['ashen-crown-redesign-v1.png', 'iron_fullhelm'],
  scaleguard: ['wyrmbone-harness-redesign-v1.png', 'steel_chainbody'],
  emberstring: ['emberstring-aligned-v2.png', 'recurve_bow'],
  kindled_ash: ['kindled-ash-aligned-v2.png', 'runed_staff'],
};
/** Bases that are not equipment, which keep their generated icons. */
const GENERATED = ['bronze_bar', 'copper_ore', 'uncut_ruby', 'cinder_key'];

/**
 * Every approved file as supplied (inspect/approved-icons/final-approved-assets.json and
 * final-fifty-eight/new-twenty-three-assets-verified.json): SHA-256, width, height and alpha range.
 */
const META: Record<string, [sha256: string, w: number, h: number, alphaMin: number, alphaMax: number]> = {
  'cleave-straight-hilt-v5.png': ['5acc2426d3371020ac915fc0e183ec27d0b4df1e0279525839c7ecb2de8d3142', 1254, 1254, 0, 255],
  'bronze-sword-icon-v1.png': ['5cc413fcd8062302ccc0a6d768423e7f138a0a3e132e27f94f0ebab24a29395a', 1254, 1254, 0, 255],
  'bronze-longsword-icon-v1.png': ['04a1491aed5d4cfd57278005dbdb3ec5b488c5761e8aff340384048b5b008a1a', 1254, 1254, 0, 255],
  'bronze-medhelm-faceted-icon-v1.png': ['3b5c86d464ffe92b5d710efcdb6e9092c07d0f7a0297562e506e518d9c9a84be', 1254, 1254, 0, 255],
  'bronze-fullhelm-faceted-icon-v1.png': ['f77257d115ba387f70c7c4c2aaf16cb09884b9f16fc958aadb80ea4fc87cbdf6', 1254, 1254, 0, 255],
  'bronze-chainbody-icon-v1.png': ['356b8965d84de697b473c120465d0b4abeeff3d24823def907247b1d90aeb496', 1254, 1254, 0, 255],
  'bronze-platebody-clearance-icon-v1.png': ['2e96e4d6bc4e34b5b6f92dd62f3ae6a1470a92e3920a23e5d269f9cfbede4ae0', 1254, 1254, 0, 255],
  'bronze-gauntlets-thumbless-icon-v2.png': ['17b498746b86e6b2d0f4e12a86358d3275013c7fd95ae84deb533d838a8d78c9', 1254, 1254, 0, 255],
  'bronze-boots-icon-v1.png': ['d4e877bb3d531c64fbae5f398c0a466a5a5a5af3c0d24ec1080687357befde8e', 1254, 1254, 0, 255],
  'bronze-pickaxe-icon-v1.png': ['b4494fa4bceb9297cb251782e2275461dc988974521a80c73dda0e173887e34e', 1254, 1254, 0, 255],
  'iron-sword-icon-v1.png': ['e5c47f55d3cccbd7d6cda077fd05bf93d33ca0cba0d541aae0bbf211adefb61b', 1254, 1254, 0, 255],
  'iron-longsword-icon-v1.png': ['2f0f51c8a9087eced0ea961dc810a87f7eda710adc5d4f575f18de6d7632dc94', 1254, 1254, 0, 255],
  'iron-medhelm-icon-v1.png': ['6d331507c0fcb050aa6cd65601cae21a3c5161f986d53d53966e1f469528420f', 1254, 1254, 0, 255],
  'iron-fullhelm-icon-v1.png': ['12159aa284c64d3800818a824645551228d68301bcc9fe7546e5e8b21de390c2', 1254, 1254, 0, 255],
  'iron-chainbody-icon-v1.png': ['0f29d00dbf40a165e8b4f78b75c1037fe5fc10401d687e6ba561fa031268beac', 1254, 1254, 0, 255],
  'iron-platebody-icon-v1.png': ['a1e3b93404c365e93eb2818d09dabd402b218335d60bb078324aedf6530f5123', 1254, 1254, 0, 255],
  'iron-gauntlets-icon-v1.png': ['402bbfc218978268a3e99b8bf70b70d053c9e70ab78c82fbea023ec8ebd8869f', 1254, 1254, 0, 255],
  'iron-boots-icon-v1.png': ['23f82b39bb2e18e269af0c468d82f20a07c1134c587399b74007a41aab8ddc39', 1254, 1254, 0, 255],
  'iron-pickaxe-clear-margin-icon-v2.png': ['6f6977afe228b349e67abe8745968fb333d3823988e791b8246309052c3bdbb3', 1254, 1254, 0, 255],
  'steel-sword-icon-v1.png': ['970fcb452149dbc6dbb1adc68e3240f7a4a19bd372685aa223af4929286a4fc7', 1254, 1254, 0, 255],
  'steel-longsword-icon-v1.png': ['d79281938afe9610e317b62d655b100bf1d99c63936a2d5f2a3aa3c11f79900e', 1254, 1254, 0, 255],
  'steel-medhelm-icon-v1.png': ['5655ed0bc1c8379cc034a525f39ae679e21ab1eb63746d19f4934ec7850a5fc1', 1254, 1254, 0, 255],
  'steel-full-helm-icon-v1.png': ['36d6ceb4209b5d32e56e212754fa31c454c77ab31be5e6344949b12ddd144206', 1254, 1254, 0, 255],
  'steel_chainbody.png': ['cfab8feb26fa5b1edce0251f1c3fc7a79be8ab55caaeb0da6517536cb236a1c7', 1254, 1254, 0, 255],
  'steel-platebody-clearance-v3.png': ['18a55256c8dd0e75e6766af84792a459000c8a7d2f3bb86baa8ae0309ab9c14f', 1254, 1254, 0, 255],
  'steel_gauntlets-v2.png': ['1818b95f40cd2835cdbf5ff30323f2c9314697cdd5b0731615a853e74dc5d268', 1254, 1254, 0, 255],
  'steel_boots.png': ['06883b693148fb8108bb49e6679ad87cf574294b766088e04b4808d0ded8d97d', 1254, 1254, 0, 255],
  'steel-pickaxe-icon-v2.png': ['b45cc4d92e5a32a02e7ce055053d6db55a3597440b3ee17500a26120b2e1e122', 1254, 1254, 0, 255],
  'ember_sword-icon-v3.png': ['3c073879bd42acf8cdc7e0943c6b00b9ded58b544e21c0e46515151b6ad68628', 1254, 1254, 0, 255],
  'ember_longsword-icon-v2.png': ['c37440658b77b6670846ff04f02d6c4075252879d218791893048223fabbbbb9', 1254, 1254, 0, 255],
  'ember_medhelm-icon-v1.png': ['a5100ba1e1e86cbc6d00fe00c7e8dba3718df86e1d21fd56ecfd9f39f83af4b4', 1254, 1254, 0, 255],
  'ember_fullhelm-icon-v1.png': ['ee95c59fd70717204a9fb310ecba7473f9c6fbed20de2923ec3a000519cc6195', 1254, 1254, 0, 255],
  'ember_chainbody-icon-v1.png': ['dc57702c3eea61645281a8cb8709af36356b92ec50bf1efdfadcf5ebc6f60b21', 1254, 1254, 0, 255],
  'ember_platebody-icon-v1.png': ['aa4121d9ff874508c5ee470afc82f3db03b02b284d84dec2848eb5d76cfc1370', 1254, 1254, 0, 255],
  'ember_gauntlets-icon-v1.png': ['cc74b7c11b60761d2658acb5ddf85a96e1bb04e7a6376e01e995e7c13a68ce21', 1254, 1254, 0, 255],
  'ember_boots-icon-v1.png': ['a2717c6c757d00d1b707c0092f4047ab34cf115494b5933c795668d3c80f5559', 1254, 1254, 0, 255],
  'ember_pickaxe-icon-v1.png': ['c1d6064e1af5ab1cde23613e67d1a2d156e8fb2309c57e934fef17ac6e11de2c', 1254, 1254, 0, 255],
  'worn-bow-redesign-v2.png': ['0ebfc3744c9f495235dfdc720199035f27d3a59f8365bc17365d0598ebcb9a74', 1254, 1254, 0, 255],
  'hunter-bow-redesign-v2.png': ['2787da31d85b1216155cf719bf0e229dae8074f2b286ee9da9f67f5369e57a08', 1254, 1254, 0, 255],
  'recurve-bow-redesign-v2.png': ['b2e488cb8f2e9f445079af07f91940ff241f33d7c703fb02dfd38f77815e5c55', 1254, 1254, 0, 255],
  'drakebone-bow-redesign-v2.png': ['cc206451fa061fbd8065d1e30e9b39ebd79a1acfe850c428d30376299ca54b91', 1254, 1254, 0, 255],
  'oak_staff-redesign-v3.png': ['20451688b72a0c41ef4bceb4dffdbb611121df8844d4cce1d7ed830e163ffa7e', 1254, 1254, 0, 255],
  'apprentice_staff-redesign-v5.png': ['e4539bd9f61a1d0c0473bf1bd010653eb15e3a23395f5ac52c69ee28196675e6', 1254, 1254, 0, 255],
  'runed_staff-redesign-v5.png': ['2dd35f392a47383701ac5f7dfc848e570f9abc8f2a79e095f4390bd545512f9b', 1254, 1254, 0, 255],
  'ember_staff-redesign-v6.png': ['0e21631029d13fe67c09b1d5f6497871fc705d9ee86eedc219062efaec28b814', 1254, 1254, 0, 255],
  'leather_cap-icon-v1.png': ['8f118686d856c7cc1bda156b84f43626dc9f49337b601ef042aff15f39b48edc', 1254, 1254, 0, 255],
  'leather_body-icon-v2.png': ['903cf9e71915bedf74ff3d2512c212d6f210bb9324282fc3bac4aefdd8481955', 1254, 1254, 0, 255],
  'leather_gloves-icon-v1.png': ['d4e98e249f7580ac0bd1d4d8c822b516d697ceeba299a2701261d852f88e0dc0', 1536, 1024, 0, 254],
  'leather_boots-icon-v1.png': ['593b4fe93d90cc64351a115908f7b5e8f0a1c91d30c2622cb7dbdd0f3087312f', 1536, 1024, 0, 254],
  'bone_amulet-icon-v1.png': ['06bea1b01c1b0283efbb0734353195da759169dbfb427580f99b904f0a523a79', 1254, 1254, 0, 255],
  'jade_amulet-icon-v1.png': ['bf6a401064f7b850741c5a782ad32d2fb576718b60da2e15a67709f178190411', 1254, 1254, 0, 255],
  'copper_ring-icon-v1.png': ['fe97a199fef12348c504a7dbe45287782b75c3729283a0592f500d2e65f39218', 1254, 1254, 0, 255],
  'silver_ring-icon-v1.png': ['c10c484cc99f82bfc6e21af51d01612daad2e190b6d21ff75b790bdc611733bc', 1254, 1254, 0, 255],
  'cinderfang-redesign-v1.png': ['8263f21d7b2e323e5501829f9c8f7d2f84e857576f694199a5ca564eb7d56a6f', 1254, 1254, 0, 255],
  'ashen-crown-redesign-v1.png': ['841c89225cde9c8ed2c394d94eefcfe5ec9ee7784bb5386cf6cffc3086702846', 1254, 1254, 0, 255],
  'wyrmbone-harness-redesign-v1.png': ['4f44bf17e915d27526d7882fdb16fc6c2ad679035fbefa2bb7b52bc145749862', 1254, 1254, 0, 255],
  'emberstring-aligned-v2.png': ['328b937435c9753650ecb63e2d26886f8eef4a1a07704aac2d3a048d14b5a7a1', 1254, 1254, 0, 255],
  'kindled-ash-aligned-v2.png': ['86d48d2d5d13d5948f00de8fca68f6bb3a2472e0f2f9652f0f894b92bbb6207a', 1254, 1254, 0, 255],
};

const art = (file: string) => `./${APPROVED_DIR}/${file}`;
const asUnique = (id: string, base: string): Item => ({ ...makeItem(base), unique: id, rarity: 'unique' });

/**
 * A PNG's alpha range, decoded from its pixels: the IDAT stream inflated and unfiltered row by row. Truecolour or
 * greyscale with alpha, 8 or 16 bits, not interlaced; a 16-bit alpha is read by its high byte.
 */
function alphaRange(png: Buffer): [number, number] {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), depth = png[24], type = png[25], interlace = png[28];
  if ((type !== 6 && type !== 4) || (depth !== 8 && depth !== 16) || interlace !== 0) throw new Error(`unsupported PNG: type ${type}, depth ${depth}, interlace ${interlace}`);
  const bpp = ((type === 6 ? 4 : 2) * depth) / 8, stride = w * bpp, alphaAt = bpp - depth / 8;
  const idat: Buffer[] = [];
  for (let o = 8; o + 8 <= png.length; ) {
    const len = png.readUInt32BE(o), kind = png.toString('ascii', o + 4, o + 8);
    if (kind === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    if (kind === 'IEND') break;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== h * (stride + 1)) throw new Error(`${raw.length} bytes of pixels for ${w}×${h}`);
  let lo = 255, hi = 0;
  // The row above the first is all zeros. Writes wrap mod 256, as the filters are defined.
  let up: Uint8Array = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const at = y * (stride + 1), line = raw.subarray(at + 1, at + 1 + stride);
    switch (raw[at]) {
      case 0:
        break;
      case 1:
        for (let i = bpp; i < stride; i++) line[i] += line[i - bpp];
        break;
      case 2:
        for (let i = 0; i < stride; i++) line[i] += up[i];
        break;
      case 3:
        for (let i = 0; i < stride; i++) line[i] += ((i >= bpp ? line[i - bpp] : 0) + up[i]) >> 1;
        break;
      case 4:
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? line[i - bpp] : 0, b = up[i], c = i >= bpp ? up[i - bpp] : 0;
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          line[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        break;
      default:
        throw new Error(`row ${y}: filter ${raw[at]}`);
    }
    for (let i = alphaAt; i < stride; i += bpp) {
      const v = line[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    up = line;
  }
  return [lo, hi];
}

describe('approved item artwork', () => {
  for (const [id, file] of Object.entries(ITEMS)) {
    it(`${id} shows ${file}, whatever its rarity`, () => {
      expect(BASES[id]?.kind, id).toBe(id.endsWith('_pickaxe') ? 'tool' : 'gear');
      for (const rarity of ['normal', 'magic', 'rare'] as const) {
        const item: Item = { ...makeItem(id), rarity };
        expect(itemArtUrl(item), rarity).toBe(art(file));
      }
    });
  }

  it('the four tiers are covered piece for piece, the Emberforged sword included', () => {
    for (const [tier, set] of [['bronze', BRONZE], ['iron', IRON], ['steel', STEEL], ['ember', EMBER]] as const)
      expect(Object.keys(set).sort(), tier).toEqual(PIECES.map((p) => pieceId(tier, p.key)).sort());
    for (const p of PIECES) for (const t of TIER_ORDER) expect(itemArtUrl(makeItem(pieceId(t, p.key))), `${t} ${p.key}`).not.toBeNull();
  });

  it('every gauntlet route is the approved thumbless file, one per tier; the leather gloves have their own', () => {
    const gauntlets = APPROVED_FILES.filter((f) => f.includes('gauntlets'));
    expect(gauntlets.sort()).toEqual(['bronze-gauntlets-thumbless-icon-v2.png', 'ember_gauntlets-icon-v1.png', 'iron-gauntlets-icon-v1.png', 'steel_gauntlets-v2.png']);
    for (const t of TIER_ORDER) expect(itemArtUrl(makeItem(pieceId(t, 'gauntlets'))), t).toBe(art(ITEMS[pieceId(t, 'gauntlets')]));
    expect(itemArtUrl(makeItem('leather_gloves'))).toBe(art('leather_gloves-icon-v1.png'));
  });

  it('the bows and staves, leather and jewellery are exactly the bases of those models and slots', () => {
    expect(Object.values(BASES).filter((b) => b.model === 'bow' || b.model === 'staff').map((b) => b.id).sort()).toEqual(Object.keys(BOWS_STAVES).sort());
    expect(Object.keys(BASES).filter((id) => id.startsWith('leather_')).sort()).toEqual(Object.keys(LEATHER).sort());
    expect(Object.values(BASES).filter((b) => b.slot === 'amulet' || b.slot === 'ring').map((b) => b.id).sort()).toEqual(Object.keys(JEWELLERY).sort());
  });

  it('every equipment base has artwork; materials and quest items keep their generated icons', () => {
    const equipment = Object.values(BASES).filter((b) => b.kind === 'gear' || b.kind === 'tool').map((b) => b.id);
    expect(equipment.sort()).toEqual(Object.keys(ITEMS).sort());
    const others = Object.keys(BASES).filter((id) => !(id in ITEMS));
    for (const id of GENERATED) expect(others).toContain(id);
    for (const id of others) {
      expect(BASES[id].kind, id).not.toMatch(/^(gear|tool)$/);
      expect(itemArtUrl(makeItem(id)), id).toBeNull();
    }
  });
});

describe('approved unique artwork', () => {
  it('every unique is approved, on the base the art was approved against', () => {
    expect(Object.keys(UNIQUES).sort()).toEqual(Object.keys(UNIQUE_ART).sort());
    for (const [id, [, base]] of Object.entries(UNIQUE_ART)) expect(UNIQUES[id].base, id).toBe(base);
    // The Wyrmbone Harness keeps its save id.
    expect(UNIQUES.scaleguard.name).toBe('Wyrmbone Harness');
  });

  for (const [id, [file, base]] of Object.entries(UNIQUE_ART)) {
    it(`${id} shows ${file}, not its approved base's ${ITEMS[base]}`, () => {
      expect(ITEMS[base], base).toBeDefined();
      expect(itemArtUrl(asUnique(id, base))).toBe(art(file));
      expect(itemArtUrl(generateUnique(Math.random, id, 20))).toBe(art(file));
      // Its base, without the unique, still shows the base's own file.
      expect(itemArtUrl(makeItem(base))).toBe(art(ITEMS[base]));
      expect(file).not.toBe(ITEMS[base]);
    });
  }

  it('an unknown unique falls back to its rendered icon on any base', () => {
    for (const id of [...Object.keys(ITEMS), ...GENERATED]) {
      expect(itemArtUrl({ base: id, unique: 'any' }), id).toBeNull();
      expect(itemArtUrl(asUnique('not_a_unique', id)), id).toBeNull();
    }
  });

  it('a unique id is not a base route, nor a base id a unique route', () => {
    for (const id of Object.keys(UNIQUE_ART)) expect(itemArtUrl({ base: id }), id).toBeNull();
    for (const id of Object.keys(ITEMS)) expect(itemArtUrl({ base: 'steel_longsword', unique: id }), id).toBeNull();
  });
});

describe('approved ability artwork', () => {
  it('only Cleave has artwork; the other skills and the basic attacks keep their painted glyphs', () => {
    expect(ABILITIES.cleave).toBeDefined();
    expect(abilityArtUrl('cleave')).toBe(art('cleave-straight-hilt-v5.png'));
    for (const id of Object.keys(ABILITIES)) if (id !== 'cleave') expect(abilityArtUrl(id), id).toBeNull();
    for (const b of Object.values(BASIC_TILE)) expect(abilityArtUrl(b.id), b.id).toBeNull();
  });
});

describe('approved files', () => {
  const read = (file: string) => readFileSync(join('public', APPROVED_DIR, file));

  it('are exactly the fifty-eight supplied (52 base items, 5 uniques, Cleave), each in public/', () => {
    const uniqueFiles = Object.values(UNIQUE_ART).map(([file]) => file);
    expect(Object.keys(ITEMS)).toHaveLength(52);
    expect(new Set(Object.values(ITEMS)).size).toBe(52);
    expect(uniqueFiles).toHaveLength(5);
    expect([...APPROVED_FILES].sort()).toEqual([...Object.values(ITEMS), ...uniqueFiles, 'cleave-straight-hilt-v5.png'].sort());
    expect(APPROVED_FILES).toHaveLength(58);
    expect(new Set(APPROVED_FILES).size).toBe(58);
    expect(Object.keys(META).sort()).toEqual([...APPROVED_FILES].sort());
    // Nothing unapproved sits in the folder alongside them.
    expect(readdirSync(join('public', APPROVED_DIR)).sort()).toEqual([...APPROVED_FILES].sort());
  });

  it('are the exact supplied bytes', () => {
    for (const file of APPROVED_FILES) expect(createHash('sha256').update(read(file)).digest('hex'), file).toBe(META[file][0]);
  });

  it('are PNGs at their supplied sizes: 1254×1254, the leather gloves and boots 1536×1024', () => {
    for (const file of APPROVED_FILES) {
      const png = read(file);
      expect(png.subarray(0, 8).toString('hex'), file).toBe('89504e470d0a1a0a');
      expect(png.subarray(12, 16).toString('ascii'), file).toBe('IHDR');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${file} size`).toEqual([META[file][1], META[file][2]]);
    }
    const wide = APPROVED_FILES.filter((f) => META[f][1] !== 1254 || META[f][2] !== 1254);
    expect(wide.sort()).toEqual(['leather_boots-icon-v1.png', 'leather_gloves-icon-v1.png']);
  });

  it('keep their supplied alpha, decoded pixel by pixel: 0-255, the leather gloves and boots 0-254', () => {
    for (const file of APPROVED_FILES) {
      const png = read(file);
      // Colour type 6 (truecolour + alpha) or 4 (greyscale + alpha): transparency is in every pixel.
      expect([4, 6], `${file} colour type`).toContain(png[25]);
      expect(alphaRange(png), `${file} alpha`).toEqual([META[file][3], META[file][4]]);
    }
  }, 120_000);
});
