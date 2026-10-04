import { Ground } from '../../world/layout';
import { cells, CX, door, type HubPlan, Town } from './plan';

/**
 * Option A, the portal square: one great square is the town's heart, the portal ring in its middle
 * and every station on its edges (the bank and the inn either side of the avenue up to the castle
 * stair, the smithy's forge yard on the west side, the shop on the east). Three roads leave its
 * corners for the lands, lined with houses.
 */
export function planA(): HubPlan {
  const t = new Town(4101), G = t.G;
  // The avenue from the square up to the castle stair, the square, and the three roads out.
  t.street([{ x: CX, z: 64 }, { x: CX, z: 86 }], 10);
  G.floor(CX, 100, 18, 15, 0, Ground.Stone);
  t.street([{ x: 173, z: 108 }, { x: 128, z: 108 }], 7);
  t.street([{ x: 129, z: 108 }, { x: 70, z: 110 }, { x: 0, z: 109 }], 6, Ground.Path);
  t.street([{ x: 207, z: 108 }, { x: 252, z: 108 }], 7);
  t.street([{ x: 251, z: 108 }, { x: 310, z: 106 }, { x: 380, z: 107 }], 6, Ground.Path);
  t.street([{ x: CX, z: 114 }, { x: CX, z: 176 }], 8);
  t.street([{ x: CX, z: 175 }, { x: 188, z: 212 }, { x: CX, z: 250 }], 6, Ground.Path);
  t.stair({ foot: { x: CX, z: 66 }, dir: 'N', width: 6, legs: [{ risers: 14 }, { landing: 3 }, { risers: 14 }, { landing: 3 }, { risers: 13 }] });

  // The stations round the square.
  const bank = t.mass({ box: cells(167.4, 71.55, 36, 28), face: 'S', wall: 8.64, roof: 'hip', walls: 'stone', tiles: 'slate' });
  const inn = t.mass({ box: cells(196.65, 71.55, 36, 28), face: 'S', wall: 8.64, roof: 'gable', walls: 'plaster', tiles: 'clay', chimney: true });
  t.mass({ box: cells(162, 88, 20, 28), face: 'E', wall: 4.32, roof: 'gable', walls: 'stone', tiles: 'clay', chimney: true });
  const shop = t.mass({ box: cells(208.8, 89.1, 20, 24), face: 'W', wall: 6.48, roof: 'gable', walls: 'plaster', tiles: 'clay' });
  t.prop('furnace', 174.6, 91.6, Math.PI / 2, 1.2);
  t.prop('anvil', 174.8, 97.6, Math.PI / 2, 0.8);
  t.portals(CX, 98);
  t.prop('board', CX, 110.5, 0, 1);
  const quests = door(inn.box, 'S', 3);
  G.station('npc', 'warden', quests.x, quests.z, 0, 0.5);
  for (const [x, z] of [[174, 87], [206, 87], [174, 113], [206, 113]]) t.prop('lamp_post', x, z, 0, 0.4);
  t.prop('stall', 203.5, 104, -Math.PI / 2, 1.4, 1);
  t.prop('barrels', 173.6, 102.5, 0, 0.8);
  t.prop('well', 179, 109, 0, 1.2);

  // Houses along the three roads and either side of the bank and the inn (the first: the finished house).
  t.bakeryHouse(175.5, 116.1, 'E');
  t.row(130.05, 94.05, 'S', 4);
  t.row(130.05, 112.05, 'N', 4);
  t.row(218.7, 94.05, 'S', 3);
  t.row(208.8, 112.05, 'N', 4);
  t.row(175.5, 116.1, 'E', 5);
  t.row(195.3, 116.1, 'W', 5);
  t.house(153.9, 72.9, 'S');
  t.house(214.2, 72.9, 'S');

  t.spot({ id: 'bank', label: 'Bank', at: door(bank.box, 'S'), kind: 'station' });
  t.spot({ id: 'smithy', label: 'Smithy: furnace and anvil', at: { x: 177, z: 97.6 }, tag: { x: 166.5, z: 94 }, kind: 'station' });
  t.spot({ id: 'shop', label: 'Shop', at: door(shop.box, 'W'), tag: { x: 213.3, z: 94.5 }, kind: 'station' });
  t.spot({ id: 'portal', label: 'Portal ring', at: { x: CX, z: 98 }, kind: 'station' });
  t.spot({ id: 'board', label: 'Restoration board', at: { x: CX, z: 112.5 }, tag: { x: CX, z: 114 }, kind: 'station' });
  t.spot({ id: 'quests', label: 'Inn: quest givers', at: quests, tag: { x: 204.75, z: 78 }, kind: 'station' });
  t.spot({ id: 'stair', label: 'Castle stair (41 steps)', at: { x: CX, z: 67.5 }, tag: { x: CX, z: 58 }, kind: 'castle' });
  t.spot({ id: 'castle', label: "The king's castle, 11 m up", at: { x: CX, z: 20 }, kind: 'castle' });
  t.spot({ id: 'exitW', label: 'West road to the lands', at: { x: 124, z: 108 }, kind: 'exit' });
  t.spot({ id: 'exitE', label: 'East road to the lands', at: { x: 256, z: 108 }, kind: 'exit' });
  t.spot({ id: 'exitS', label: 'South road to the lands', at: { x: CX, z: 182 }, kind: 'exit' });

  return t.finish({
    id: 'a', name: 'A · The portal square',
    idea: 'One great square is the heart: the portal ring in its middle, every station on its edges, the castle stair straight up the avenue.',
    heart: { x: CX, z: 104 }, street: { eye: { x: CX + 1.5, z: 150 }, look: { x: CX, z: 60, y: 9 } },
    routes: [['bank', 'smithy'], ['smithy', 'shop'], ['shop', 'portal'], ['portal', 'bank'], ['bank', 'shop'], ['smithy', 'portal'], ['portal', 'stair'], ['portal', 'exitS']],
  }, (x, z) => ((x - CX) / 82) ** 2 + ((z - 115) / 70) ** 2 < 1);
}
