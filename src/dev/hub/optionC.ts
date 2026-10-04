import { Ground } from '../../world/layout';
import { cells, CX, door, type HubPlan, Town, WALL } from './plan';

/**
 * Option C, the walled town: a town wall with a gate in each side (west, east and south lead out to
 * the lands, north up to the castle), two main streets crossing at the town cross (the restoration
 * board), a ring road inside the wall, and a quarter for each trade: the bank and the inn in the
 * north-west, the portal ward in the north-east, the smiths in the south-west, the market in the
 * south-east.
 */
export function planC(): HubPlan {
  const t = new Town(4303), G = t.G;
  // The rock comes forward behind the castle stair, so the stair climbs against its face.
  G.plateau(204, 38, 12, 11, 1.2);
  const box = cells(130.05, 70.2, 267, 258), mid = (box.z0 + box.z1) / 2, r = WALL.thick / 2;
  const towers = [
    ...[box.x0 + r, box.x1 - r].flatMap((x) => [box.z0 + r, box.z1 - r].map((z) => ({ x, z, s: WALL.tower }))),
    ...[160, 220].flatMap((x) => [{ x, z: box.z0 + r, s: WALL.tower }, { x, z: box.z1 - r, s: WALL.tower }]),
    ...[99, 157].flatMap((z) => [{ x: box.x0 + r, z, s: WALL.tower }, { x: box.x1 - r, z, s: WALL.tower }]),
  ];
  const gates = [{ x: CX, z: box.z0 }, { x: CX, z: box.z1 }, { x: box.x0, z: mid }, { x: box.x1, z: mid }];
  // The two main streets through the gates, the ring road inside the wall, the cross where they meet.
  t.street([{ x: CX, z: 62 }, { x: CX, z: 194 }], 8);
  t.street([{ x: 122, z: mid }, { x: 258, z: mid }], 8);
  const ring = { x0: box.x0 + 7.5, x1: box.x1 - 7.5, z0: box.z0 + 7.5, z1: box.z1 - 7.5 };
  t.street([{ x: ring.x0, z: ring.z0 }, { x: ring.x1, z: ring.z0 }], 5);
  t.street([{ x: ring.x0, z: ring.z1 }, { x: ring.x1, z: ring.z1 }], 5);
  t.street([{ x: ring.x0, z: ring.z0 }, { x: ring.x0, z: ring.z1 }], 5);
  t.street([{ x: ring.x1, z: ring.z0 }, { x: ring.x1, z: ring.z1 }], 5);
  G.floor(CX, mid, 10, 10, 0, Ground.Stone);
  // Out of the gates: up to the castle stair, and the three roads to the lands.
  t.street([{ x: CX, z: 64 }, { x: 196, z: 59.5 }, { x: 208, z: 57 }, { x: 217, z: 53 }], 5);
  t.street([{ x: 124, z: mid }, { x: 60, z: 130 }, { x: 0, z: 128 }], 6, Ground.Path);
  t.street([{ x: 256, z: mid }, { x: 320, z: 126 }, { x: 380, z: 128 }], 6, Ground.Path);
  t.street([{ x: CX, z: 192 }, { x: 188, z: 220 }, { x: CX, z: 250 }], 6, Ground.Path);
  // The portal ward's court, off the north street.
  G.floor(214, 106, 12, 10, 0, Ground.Stone);
  t.street([{ x: 193, z: 106 }, { x: 203, z: 106 }], 6);
  t.wall({ box, gates, towers });
  // The castle stair climbs west along the rock's face, then turns up into it to the castle gate.
  t.stair({ foot: { x: 213.7, z: 50 }, dir: 'W', width: 4.5, legs: [{ risers: 20 }, { landing: 3 }, { risers: 21 }, { landing: 4.5 }, { turn: 'N' }, { landing: 6 }] });

  // The quarters.
  const bank = t.mass({ box: cells(172.8, 88.65, 28, 36), face: 'E', wall: 8.64, roof: 'hip', walls: 'stone', tiles: 'slate' });
  const inn = t.mass({ box: cells(155.25, 110.7, 36, 28), face: 'S', wall: 8.64, roof: 'gable', walls: 'plaster', tiles: 'clay', chimney: true });
  const quests = door(inn.box, 'S', 2.2);
  G.station('npc', 'warden', quests.x, quests.z, 0, 0.5);
  t.portals(214, 106);
  t.mass({ box: cells(155.25, 137.7, 28, 20), face: 'N', wall: 4.32, roof: 'gable', walls: 'stone', tiles: 'clay', chimney: true });
  t.prop('furnace', 158.6, 135.1, Math.PI, 1.2);
  t.prop('anvil', 164, 135.2, Math.PI, 0.8);
  const shop = t.mass({ box: cells(204.75, 133.2, 24, 20), face: 'N', wall: 6.48, roof: 'gable', walls: 'plaster', tiles: 'clay' });
  for (const x of [224, 231, 238]) t.prop('stall', x, 135, Math.PI, 1.4, x % 3);
  t.prop('board', 195.5, 121.5, 0, 1);
  t.prop('well', 184.5, 134.5, 0, 1.2);
  for (const [x, z] of [[181, 119], [199, 119], [181, 137], [199, 137]]) t.prop('lamp_post', x, z, 0, 0.4);

  // Houses along the ring road and the main streets in every quarter (the first: the finished house).
  t.bakeryHouse(175.95, 139.05, 'E');
  // (Each quarter: along the ring road's inner side, then the main streets' sides.)
  const inner = { x0: ring.x0 + 2.5, x1: ring.x1 - 2.5, z0: ring.z0 + 2.5, z1: ring.z1 - 2.5 }, half = 4;
  for (const [x0, x1] of [[inner.x0, CX - half], [CX + half, inner.x1]]) {
    t.frontage('N', inner.z0, x0, x1);
    t.frontage('S', inner.z1, x0, x1);
  }
  for (const [z0, z1] of [[inner.z0, mid - half], [mid + half, inner.z1]]) {
    t.frontage('W', inner.x0, z0, z1);
    t.frontage('E', inner.x1, z0, z1);
    t.frontage('E', CX - half, z0, z1);
    t.frontage('W', CX + half, z0, z1);
  }
  for (const [x0, x1] of [[inner.x0, CX - half], [CX + half, inner.x1]]) {
    t.frontage('S', mid - half, x0, x1);
    t.frontage('N', mid + half, x0, x1);
  }

  t.spot({ id: 'bank', label: 'Bank', at: door(bank.box, 'E'), tag: { x: 179, z: 96.75 }, kind: 'station' });
  t.spot({ id: 'quests', label: 'Inn: quest givers', at: quests, tag: { x: 163.35, z: 117 }, kind: 'station' });
  t.spot({ id: 'portal', label: 'Portal ward', at: { x: 214, z: 106 }, kind: 'station' });
  t.spot({ id: 'smithy', label: 'Smithy: furnace and anvil', at: { x: 164, z: 133 }, tag: { x: 161.5, z: 142 }, kind: 'station' });
  t.spot({ id: 'shop', label: 'Shop and market', at: door(shop.box, 'N'), tag: { x: 214, z: 138 }, kind: 'station' });
  t.spot({ id: 'board', label: 'Town cross: restoration board', at: { x: 195.5, z: 123.5 }, tag: { x: CX, z: 126 }, kind: 'station' });
  t.spot({ id: 'stair', label: 'Castle stair (41 steps)', at: { x: 216.5, z: 51 }, tag: { x: 202, z: 52 }, kind: 'castle' });
  t.spot({ id: 'castle', label: "The king's castle, 11 m up", at: { x: CX, z: 20 }, kind: 'castle' });
  t.spot({ id: 'exitW', label: 'West gate to the lands', at: { x: 124, z: mid }, kind: 'exit' });
  t.spot({ id: 'exitE', label: 'East gate to the lands', at: { x: 256, z: mid }, kind: 'exit' });
  t.spot({ id: 'exitS', label: 'South gate to the lands', at: { x: CX, z: 192 }, kind: 'exit' });

  return t.finish({
    id: 'c', name: 'C · The walled town',
    idea: 'A walled town of four quarters round the town cross; the west, east and south gates lead to the lands, the north gate up to the castle.',
    heart: { x: CX + 2, z: mid + 6 }, street: { eye: { x: CX + 1.5, z: 181 }, look: { x: CX, z: 52, y: 9 } },
    routes: [['bank', 'smithy'], ['smithy', 'shop'], ['shop', 'portal'], ['portal', 'bank'], ['bank', 'shop'], ['smithy', 'portal'], ['portal', 'stair'], ['portal', 'exitS']],
  }, (x, z) => x > 118 && x < 262 && z > 46 && z < 198);
}
