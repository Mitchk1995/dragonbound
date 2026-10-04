import { Fluid, Ground } from '../../world/layout';
import { CELL } from '../../world/kit/scale';
import { cells, CX, door, HOUSE_CELLS, type HubPlan, snap, Town } from './plan';

/** The high street's middle line: x along it at z (the street bends gently east through the market). */
const mid = (z: number) => (z <= 100 ? CX : z <= 128 ? CX + ((z - 100) / 28) * 4 : z <= 158 ? CX + 4 : CX + 4 - ((Math.min(z, 176) - 158) / 18) * 3);
/** The ground falls from 4 m under the castle stair to the river. */
const level = (z: number) => (z <= 70 ? 4 : z >= 160 ? 0 : (4 * (160 - z)) / 90);

/**
 * Option B, the high street: one street runs down from the foot of the castle stair to the river,
 * falling 4 m as it goes, and everything is on it in order: the bank and the guildhall (the
 * restoration board) on the castle place at the top, the shop and the inn on the market half way,
 * the smithy by the river, then over the bridge to the portal ring and the road out.
 */
export function planB(): HubPlan {
  const t = new Town(4202, level), G = t.G;
  const high = t.street([{ x: CX, z: 64 }, { x: CX, z: 100 }, { x: CX + 4, z: 128 }, { x: CX + 4, z: 158 }, { x: CX + 1, z: 176 }], 9);
  G.floor(CX, 77, 14, 9, 0, Ground.Stone);
  G.floor(193, 121, 12, 13, 0, Ground.Stone);
  t.street([{ x: 186, z: 161 }, { x: 150, z: 161 }, { x: 90, z: 160 }, { x: 0, z: 161 }], 5, Ground.Path);
  t.street([{ x: 198, z: 161 }, { x: 250, z: 161 }, { x: 380, z: 160 }], 5, Ground.Path);
  t.street([{ x: CX + 1, z: 176 }, { x: CX, z: 205 }, { x: CX, z: 250 }], 6, Ground.Path);
  G.river([{ x: 0, z: 171 }, { x: 70, z: 167 }, { x: 140, z: 171 }, { x: CX, z: 170 }, { x: 240, z: 167 }, { x: 310, z: 172 }, { x: 380, z: 168 }], 8, Fluid.Water, [high], [], 'bridge_stone');
  G.clearing(CX, 194, 11, Ground.Stone, 0);
  // Back lanes behind the high street's houses, up from the river road.
  for (const x of [159, 225]) {
    t.street([{ x, z: 90 }, { x, z: 159 }], 4, Ground.Path);
  }
  t.stair({ foot: { x: CX, z: 66 }, dir: 'N', width: 6, legs: [{ risers: 14 }, { landing: 3 }, { risers: 14 }, { landing: 3 }, { risers: 13 }] });

  // The castle place: the bank, the guildhall with the restoration board before it.
  const bank = t.mass({ box: cells(162.9, 68.85, 28, 36), face: 'E', wall: 8.64, roof: 'hip', walls: 'stone', tiles: 'slate' });
  t.mass({ box: cells(204.75, 69.75, 28, 32), face: 'W', wall: 7.56, roof: 'gable', walls: 'stone', tiles: 'slate' });
  t.prop('board', 201.6, 77.4, -Math.PI / 2, 1);
  // The market: the shop and the inn, stalls between.
  const shop = t.mass({ box: cells(171.45, 109.35, 20, 24), face: 'E', wall: 6.48, roof: 'gable', walls: 'plaster', tiles: 'clay' });
  const inn = t.mass({ box: cells(205.65, 117, 24, 36), face: 'W', wall: 8.64, roof: 'gable', walls: 'plaster', tiles: 'clay', chimney: true });
  const quests = door(inn.box, 'W', 3);
  G.station('npc', 'warden', quests.x, quests.z, -Math.PI / 2, 0.5);
  t.prop('stall', 186, 128, Math.PI / 2, 1.4, 1);
  t.prop('stall', 200, 112, -Math.PI / 2, 1.4, 2);
  t.prop('well', 196.5, 131, 0, 1.2);
  // The smithy by the river, its forge yard on the street.
  t.mass({ box: cells(176.4, 144.9, 20, 28), face: 'E', wall: 4.32, roof: 'gable', walls: 'stone', tiles: 'clay', chimney: true });
  t.prop('furnace', 187.4, 148.2, Math.PI / 2, 1.2);
  t.prop('anvil', 187.6, 153.6, Math.PI / 2, 0.8);
  t.portals(CX, 194);
  for (const [x, z] of [[177, 86], [203, 86], [182, 135], [204, 108]]) t.prop('lamp_post', x, z, 0, 0.4);

  // Houses either side of the high street (the first: the finished house), along the river road and by the portals.
  const side = (z0: number, west: boolean) => {
    const m = mid(z0 + (HOUSE_CELLS.w * CELL) / 2), off = 4.5 + 1.35;
    return west ? t.house(snap(m - off - HOUSE_CELLS.d * CELL), z0, 'E') : t.house(snap(m + off), z0, 'W');
  };
  t.bakeryHouse(snap(mid(92) - 5.85 - HOUSE_CELLS.d * CELL), 87.3, 'E');
  for (const w of [true, false]) for (let z0 = 86.4; z0 < 150;) z0 += side(snap(z0), w) ? HOUSE_CELLS.w * CELL + 0.9 : CELL;
  for (const x of [159, 225]) {
    t.frontage('E', x - 2, 93, 157);
    t.frontage('W', x + 2, 93, 157);
  }
  t.frontage('S', 158.5, 100, 186);
  t.frontage('S', 158.5, 198, 280);
  t.frontage('E', 187, 205, 240);
  t.frontage('W', 193, 205, 240);

  t.spot({ id: 'bank', label: 'Bank', at: door(bank.box, 'E'), tag: { x: 169, z: 77 }, kind: 'station' });
  t.spot({ id: 'board', label: 'Guildhall: restoration board', at: { x: 199.4, z: 77.4 }, tag: { x: 211, z: 77 }, kind: 'station' });
  t.spot({ id: 'shop', label: 'Shop', at: door(shop.box, 'E'), tag: { x: 176, z: 114.75 }, kind: 'station' });
  t.spot({ id: 'quests', label: 'Inn: quest givers', at: quests, tag: { x: 211, z: 125 }, kind: 'station' });
  t.spot({ id: 'smithy', label: 'Smithy: furnace and anvil', at: { x: 189.8, z: 153.6 }, tag: { x: 180.9, z: 151 }, kind: 'station' });
  t.spot({ id: 'portal', label: 'Portal ring', at: { x: CX, z: 194 }, kind: 'station' });
  t.spot({ id: 'stair', label: 'Castle stair (41 steps)', at: { x: CX, z: 67.5 }, tag: { x: CX, z: 58 }, kind: 'castle' });
  t.spot({ id: 'castle', label: "The king's castle, 11 m up", at: { x: CX, z: 20 }, kind: 'castle' });
  t.spot({ id: 'exitS', label: 'South road to the lands', at: { x: CX, z: 226 }, kind: 'exit' });
  t.spot({ id: 'exitW', label: 'River road west', at: { x: 120, z: 161 }, kind: 'exit' });
  t.spot({ id: 'exitE', label: 'River road east', at: { x: 262, z: 161 }, kind: 'exit' });

  return t.finish({
    id: 'b', name: 'B · The high street',
    idea: 'One high street falls from the castle stair to the river, every station on it in turn; over the bridge, the portal ring and the road out.',
    heart: { x: 193, z: 124 }, street: { eye: { x: CX + 2.5, z: 164 }, look: { x: CX, z: 58, y: 9 } },
    routes: [['bank', 'smithy'], ['smithy', 'shop'], ['shop', 'portal'], ['portal', 'bank'], ['bank', 'shop'], ['smithy', 'portal'], ['portal', 'stair'], ['portal', 'exitS']],
  }, (x, z) => ((x - CX) / 70) ** 2 + ((z - 135) / 92) ** 2 < 1);
}
