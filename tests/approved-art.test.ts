/**
 * Approved painted artwork: every piece of equipment (the bronze, iron, steel and Emberforged sets, the four bows,
 * the four staves, leather and jewellery) routes to its file by base; all five uniques (the Wyrmbone Harness by its
 * save id `scaleguard`) by their own unique id, ahead of their approved bases; Cleave to its tile. Everything else
 * (materials, quest items, any unknown unique, the other abilities and the basic attacks) keeps its generated icon.
 * The files are the approved art scaled to 256 px on the long side (256×256, the leather gloves and boots 256×171),
 * which stays sharp at every size the game shows; the full-size originals are kept outside the repo.
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
 * Every approved file as shipped: SHA-256, width, height and alpha range.
 */
const META: Record<string, [sha256: string, w: number, h: number, alphaMin: number, alphaMax: number]> = {
  'apprentice_staff-redesign-v5.png': ['25cb95819b61a37b9b29f020540a279ad357e45932b9fca4e1617b9463adc93b', 256, 256, 0, 255],
  'ashen-crown-redesign-v1.png': ['4a144f18c03888157fc20296b1907c2274f066fdde6182ff667a5005a932152c', 256, 256, 0, 255],
  'bone_amulet-icon-v1.png': ['e9917c5d0a6ac3935219cec14c05d430cca5fed87ea3e021f7b4c58fe400b149', 256, 256, 0, 255],
  'bronze-boots-icon-v1.png': ['98831f0fbf6b29f3d1607e996a32580c0212c0dee5c723070ca577dbcebc2c6a', 256, 256, 0, 255],
  'bronze-chainbody-icon-v1.png': ['b01713776c40bd045ccf425d62dc863b636dcec9819916dda536f64a9e742bfa', 256, 256, 0, 255],
  'bronze-fullhelm-faceted-icon-v1.png': ['b7771191279a50afdc3e856cb896be6c572a00fed710bfcd1dc28296d48e21e0', 256, 256, 0, 255],
  'bronze-gauntlets-thumbless-icon-v2.png': ['ddb09990efaad287e781698520d9721b9a95c13367683ff7b397201228b193d5', 256, 256, 0, 255],
  'bronze-longsword-icon-v1.png': ['d9bb9c182d8592473d57aad52d7133f46fcb72a72888bcb9eae0841406b8fee1', 256, 256, 0, 255],
  'bronze-medhelm-faceted-icon-v1.png': ['d65ad32779728941590699520bbdc86a99ee1477d379f5f4df8ae4639f6ef73a', 256, 256, 0, 255],
  'bronze-pickaxe-icon-v1.png': ['e77e0cb997a1e4eb6b1ab3cee352976197def044e11976cbf473966b44158bec', 256, 256, 0, 255],
  'bronze-platebody-clearance-icon-v1.png': ['04ae0c97e880a0f9ac460ad13981893a20342427d4533c81c713b5dd2de4db73', 256, 256, 0, 255],
  'bronze-sword-icon-v1.png': ['9e7f9a8ad37ed085370bcc7d15f688fd40a50f44d965804edb438acb13f40b4f', 256, 256, 0, 255],
  'cinderfang-redesign-v1.png': ['8dae251e133f23dd5b4c69a6a0177ef7227b1418cb5febab7efe4f2d0de5dde3', 256, 256, 0, 255],
  'cleave-straight-hilt-v5.png': ['8fa4171348781f7fbca191e6aeb25747f5bfa10eb36ae827dafc0144d4449295', 256, 256, 0, 255],
  'copper_ring-icon-v1.png': ['b7b78f62c238f077dff004f15a8a3dec06b13fa3c0ee8c7f6b943f618fea444e', 256, 256, 0, 255],
  'drakebone-bow-redesign-v2.png': ['2c56465ee15608f3074a04ec51b4ffc589a5cbd64d17eeecb5fa83bab7448c36', 256, 256, 0, 255],
  'ember_boots-icon-v1.png': ['e4d5d9d72f765b5273723973bbce751ceb3dbf1f77fc53bfe3eb5e1ca5bb207e', 256, 256, 0, 255],
  'ember_chainbody-icon-v1.png': ['5d6f714ea647269ad6cc0080f870e12af834b990d6de797d09222ee2d973be59', 256, 256, 0, 255],
  'ember_fullhelm-icon-v1.png': ['80b53c8658ad5153e2dd3ffdd9b2857c17a86d2d0a16cf3336919ca6acb74506', 256, 256, 0, 255],
  'ember_gauntlets-icon-v1.png': ['4ea1258c5cf1697296481471af968812538c4bb9d970b5bd09d0345774780165', 256, 256, 0, 255],
  'ember_longsword-icon-v2.png': ['91a6b5241730e2fda7b095ad1dca61168d0850f410173068cf8c177a5d673631', 256, 256, 0, 255],
  'ember_medhelm-icon-v1.png': ['fe15e0cbc61e65b98f80ef658d3e9e96fc8128a6fa3fc69c0706a856fa3cbdc0', 256, 256, 0, 255],
  'ember_pickaxe-icon-v1.png': ['42924a4a3cd11e3828da12f52f00355919be8188d4040e383491d0b31f593fff', 256, 256, 0, 255],
  'ember_platebody-icon-v1.png': ['4176972246ba4701f3da691079d1ebfa55f5482e068a58e251fdd09bcb859404', 256, 256, 0, 255],
  'ember_staff-redesign-v6.png': ['88c1761243d776fc4019c2793ee62e6b818d8ad5158333ea9d928efd7f26e7be', 256, 256, 0, 255],
  'ember_sword-icon-v3.png': ['3c3c3ff3110a93ae38ec67266b9d14108fd9e832e6f3a11d55fe2ccf17f9fbb1', 256, 256, 0, 255],
  'emberstring-aligned-v2.png': ['eadbe200e65b8d7c45229f9b9af40605816851665a7ac6c315c1dda199a34cc1', 256, 256, 0, 255],
  'hunter-bow-redesign-v2.png': ['a2d17d5e1ec4df221d3e83cd1a10a2baad426fc1c2e723dfbd7c17aed1723809', 256, 256, 0, 255],
  'iron-boots-icon-v1.png': ['c70257c93946e7d66490b1d10b3bce8eca46ad477ef005fd9d7f73312f3208d4', 256, 256, 0, 255],
  'iron-chainbody-icon-v1.png': ['0c6b0071792420daae8dce2224a3c19078a490c6f1a26be7b34bca56ba5a5148', 256, 256, 0, 255],
  'iron-fullhelm-icon-v1.png': ['05c788bbb4d427a0cfc2183f067034c71ecd26bf80b459895749dcb799817e73', 256, 256, 0, 255],
  'iron-gauntlets-icon-v1.png': ['6aa38a2aa6d0333bd4388dc28ccfb90cba3c6ea8c7760ac0889be06941f0b203', 256, 256, 0, 255],
  'iron-longsword-icon-v1.png': ['11e0dfb9ee676aa0a85800a52c38045e656877246546e4d32dfdfba8312f5a2e', 256, 256, 0, 255],
  'iron-medhelm-icon-v1.png': ['1ffa5d13d697551aedabae5bc5d59e5138968bd40069d54c11e99de227eb3722', 256, 256, 0, 255],
  'iron-pickaxe-clear-margin-icon-v2.png': ['30a5565ec7be3e36ebdb834a357735bb3ceb4dd774017e1351cbab1994bd2d51', 256, 256, 0, 255],
  'iron-platebody-icon-v1.png': ['ae71eb915de60c8d797b941ea7e3330c210b7d5b05803165c75af3c15e2ef131', 256, 256, 0, 255],
  'iron-sword-icon-v1.png': ['30ea3272642c934448c777c2c139b4b9f8111184d86701d077b4529b0c57f422', 256, 256, 0, 255],
  'jade_amulet-icon-v1.png': ['8683f9b16795f70bd7382efeb5a87213e9c4739d18c6394bae962ee0ef600987', 256, 256, 0, 255],
  'kindled-ash-aligned-v2.png': ['e3af296a9fd367f91438665ce23cdbb5c99b897271ed9a1416f92dc55339bf54', 256, 256, 0, 255],
  'leather_body-icon-v2.png': ['24b7d0931b05394fe7450f78e88289469dde4ad874341668008701443919a866', 256, 256, 0, 255],
  'leather_boots-icon-v1.png': ['de0b91831d3fd373f5c42b36e7a82347d1025738a3e61e9f6bddba248484f8b3', 256, 171, 0, 255],
  'leather_cap-icon-v1.png': ['c4a0dcb00179dee862caca93b4c624775e77fa73d15f229029f91eecf30cefd9', 256, 256, 0, 255],
  'leather_gloves-icon-v1.png': ['3f35018d1dfcc6f8424fa851c10c222af55621b3eaa04add39f83f30e00ca00c', 256, 171, 0, 255],
  'oak_staff-redesign-v3.png': ['7ca28e816c0672150a80868d3829c5c1900ce309bb01bf1f1a11d9d2eafdea7b', 256, 256, 0, 255],
  'recurve-bow-redesign-v2.png': ['d7b55b9e18543a97b9d2ae1a948559a1caaf35588641f5289e7274e1c1339887', 256, 256, 0, 255],
  'runed_staff-redesign-v5.png': ['a788ada3ac972a22464b4932293eaf49dc863622a93468b7b089f872890e251e', 256, 256, 0, 255],
  'silver_ring-icon-v1.png': ['11e827a9ddc074ea19de09fa585f31a17c393f68668ce427858c15f2c193b638', 256, 256, 0, 255],
  'steel-full-helm-icon-v1.png': ['64e8caa890fadb53621a940ad79321d28087b580453b60cae8b2b59c50aab128', 256, 256, 0, 255],
  'steel-longsword-icon-v1.png': ['5c3e2403e95684544686afc3190bbc043f34996207b46691095caf6adce673ff', 256, 256, 0, 255],
  'steel-medhelm-icon-v1.png': ['2cd2ac075e48690f34d5dd4b1f5a7b422ad0834954a130046935353a623c1a28', 256, 256, 0, 255],
  'steel-pickaxe-icon-v2.png': ['58f1163c918defe4652d0309da8d6fbcb5e5851fe4a628a1b368a90233c0e249', 256, 256, 0, 255],
  'steel-platebody-clearance-v3.png': ['29780a17f836a7a06fb5627c6598a47e6ff738140a04d3326f55d3bf90bb3d78', 256, 256, 0, 255],
  'steel-sword-icon-v1.png': ['fbddaec509382aa710edbcb5bd1a7f8650061629d960dda6669a5a74f9bbc66c', 256, 256, 0, 255],
  'steel_boots.png': ['c4cd3d1f5373e8863e6bf44a1d537af265f848c6c0fd7fff48083041376b17bf', 256, 256, 0, 255],
  'steel_chainbody.png': ['d7b717cd532ff2d74c91c63a8812ed8051a8517a9859a3b17e9a8889f8786dc1', 256, 256, 0, 255],
  'steel_gauntlets-v2.png': ['9d200508b9824bcd194d8950118908e6ad025650fae6813992f5b5e5bf5fa97a', 256, 256, 0, 255],
  'worn-bow-redesign-v2.png': ['d200c7efd1418f38addd7a9c06924bab07704a90f3cf83b27b23675ac93279a2', 256, 256, 0, 255],
  'wyrmbone-harness-redesign-v1.png': ['6e4d69519b696e65d30d84ef228f16e8d9b81303b367c7a88d01f0014fb8ba5e', 256, 256, 0, 255],
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
    expect(Object.values(BASES).filter((b) => b.model?.startsWith('bow_') || b.model?.startsWith('staff_')).map((b) => b.id).sort()).toEqual(Object.keys(BOWS_STAVES).sort());
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

  it('are the exact shipped bytes', () => {
    for (const file of APPROVED_FILES) expect(createHash('sha256').update(read(file)).digest('hex'), file).toBe(META[file][0]);
  });

  it('are PNGs at 256 px: 256×256, the leather gloves and boots 256×171', () => {
    for (const file of APPROVED_FILES) {
      const png = read(file);
      expect(png.subarray(0, 8).toString('hex'), file).toBe('89504e470d0a1a0a');
      expect(png.subarray(12, 16).toString('ascii'), file).toBe('IHDR');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${file} size`).toEqual([META[file][1], META[file][2]]);
    }
    const wide = APPROVED_FILES.filter((f) => META[f][1] !== 256 || META[f][2] !== 256);
    expect(wide.sort()).toEqual(['leather_boots-icon-v1.png', 'leather_gloves-icon-v1.png']);
  });

  it('keep their transparency, decoded pixel by pixel: alpha 0-255', () => {
    for (const file of APPROVED_FILES) {
      const png = read(file);
      // Colour type 6 (truecolour + alpha) or 4 (greyscale + alpha): transparency is in every pixel.
      expect([4, 6], `${file} colour type`).toContain(png[25]);
      expect(alphaRange(png), `${file} alpha`).toEqual([META[file][3], META[file][4]]);
    }
  }, 120_000);
});
