import * as THREE from 'three';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { Rig, newAnimState, type AnimState } from '../render/anim';
import { HeroDresser, makeModel } from '../render/registry';
import type { Item, Slot } from '../types';
import { Studio, fit } from './inspect';

type Shot = (n: string) => Promise<void>;
type Cell = Parameters<Studio['sheet']>[0][number];

const LOOK = { name: '', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
/** The hero's running speed: the stride at its full swing. */
const RUN = 5.6;
/** Stride phases: the right leg forward, then the left. */
const RIGHT = Math.PI / 2, LEFT = -Math.PI / 2;

/** Everything the hero can wear over his legs: the tunic, then each body armour, with the rest of its set. */
const OUTFITS: [string, Partial<Record<Slot, string>>, string?][] = [
  ['tunic', { weapon: 'bronze_sword' }],
  ['chain', { weapon: 'bronze_sword', helm: 'iron_medhelm', body: 'iron_chainbody', gloves: 'iron_gauntlets', boots: 'iron_boots' }],
  ['leather', { weapon: 'hunter_bow', helm: 'leather_cap', body: 'leather_body', gloves: 'leather_gloves', boots: 'leather_boots' }],
  ['steel plate', { weapon: 'steel_longsword', helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' }],
  ['emberforged', { weapon: 'ember_longsword', helm: 'ember_fullhelm', body: 'ember_platebody', gloves: 'ember_gauntlets', boots: 'ember_boots' }],
  ['wyrmbone', { weapon: 'bronze_sword', body: 'steel_chainbody' }, 'scaleguard'],
];

function gear(set: Partial<Record<Slot, string>>, unique?: string): Partial<Record<Slot, Item>> {
  return Object.fromEntries(Object.entries(set).map(([slot, id]) =>
    [slot, slot === 'body' && unique ? ({ ...makeItem(id!), unique, rarity: 'unique' } as Item) : makeItem(id!)]));
}

/** The hero in an outfit, running, caught at `phase` of the stride (with anything else of `extra`: hurt, an attack). */
function runner(set: Partial<Record<Slot, string>>, unique: string | undefined, phase: number, extra: Partial<AnimState> = {}) {
  const m = makeModel('hero');
  const holder = new THREE.Group();
  holder.add(m.root);
  new HeroDresser(m).dress(LOOK, gear(set, unique));
  const rig = new Rig(m.root);
  rig.update(phase / (RUN * rig.stride), { ...newAnimState(), speed: RUN, ...extra });
  return holder;
}

/** A camera `dist` from the skirt, looking at it level from `dir`. */
function hips(root: THREE.Object3D, dir: THREE.Vector3, dist = 2.2) {
  root.updateMatrixWorld(true);
  const at = root.getObjectByName('body')!.getWorldPosition(new THREE.Vector3());
  at.y -= 0.08;
  return { eye: at.clone().add(dir.clone().normalize().multiplyScalar(dist)), at };
}

const SIDE_L = new THREE.Vector3(1, 0.12, 0.04), SIDE_R = new THREE.Vector3(-1, 0.12, 0.04);
const FRONT = new THREE.Vector3(0, 0.25, 1), THREE_Q = new THREE.Vector3(-0.75, 0.4, 0.8), BACK_Q = new THREE.Vector3(0.7, 0.4, -0.8);
const LEVEL_F = new THREE.Vector3(0.05, 0.06, 1), LEVEL_B = new THREE.Vector3(0.05, 0.06, -1);
const LEVEL_L = new THREE.Vector3(1, 0.06, 0.02), LEVEL_R = new THREE.Vector3(-1, 0.06, 0.02);

/**
 * What hangs from the hero's hips, running (explicit suite: `npm run inspect -- skirts`): every outfit mid-stride from
 * the side, front, three-quarter and behind, the hips close up (mid-stride, running just hit, and the sword's wind-up
 * stepping after a target), then the chain and leather outfits running at the play camera.
 */
export async function skirtsSuite(g: Game, shot: Shot) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  const cells: Cell[] = [];
  const flush = async (name: string, cols: number, rows: number) => {
    st.sheet(cells, cols, rows);
    await shot(name);
    st.clear(cells.map((c) => c.obj));
    cells.length = 0;
  };
  for (const [label, set, unique] of OUTFITS) {
    const at = (phase: number, dir: THREE.Vector3, view: string, extra?: Partial<AnimState>) => {
      // Framed on the standing hero, so every cell keeps one scale.
      const cam = fit(runner(set, unique, 0), dir);
      cells.push({ label: `${label} · ${view}`, obj: runner(set, unique, phase, extra), ...cam });
    };
    at(LEFT, SIDE_L, 'left leg forward · side');
    at(LEFT, THREE_Q, 'left leg forward · 3/4');
    at(LEFT, BACK_Q, 'left leg forward · back 3/4');
    at(RIGHT, SIDE_R, 'right leg forward · side');
    at(RIGHT, FRONT, 'right leg forward · front');
    at(RIGHT, THREE_Q, 'right leg forward · 3/4');
    await flush(`skirt-${label.replace(/\s+/g, '_')}`, 3, 2);

    // The skirt close up and level, mid-stride from the front, the side and behind, then from the side running just
    // hit (leaning back) and in the sword's wind-up and strike while stepping after a target.
    const close = (phase: number, dir: THREE.Vector3, view: string, extra?: Partial<AnimState>) => {
      const o = runner(set, unique, phase, extra);
      cells.push({ label: `${label} · ${view}`, obj: o, ...hips(o, dir) });
    };
    close(LEFT, LEVEL_F, 'skirt · left leg forward · front');
    close(LEFT, LEVEL_L, 'skirt · left leg forward · side');
    close(LEFT, LEVEL_B, 'skirt · left leg forward · back');
    close(LEFT, LEVEL_L, 'skirt · running, just hit · side', { hurt: 1 });
    close(RIGHT, LEVEL_R, 'skirt · sword wind-up, stepping · side', { attackKind: 'swing', attack: 0.4 });
    close(RIGHT, LEVEL_R, 'skirt · sword strike, stepping · side', { attackKind: 'swing', attack: 0.5 });
    await flush(`skirt-${label.replace(/\s+/g, '_')}-hips`, 3, 2);
  }
  await playCamera(g, shot);
}

/**
 * A stand-in hero running past the camera in the Foothills, held mid-stride, in the chain and the leather outfits (the
 * player is hidden and the world held still).
 */
async function playCamera(g: Game, shot: Shot) {
  g.travel('foothills', true);
  for (let i = 0; i < 15; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const dais = g.zone.layout.props.find((p) => p.kind === 'ritual_dais')!;
  const spot = new THREE.Vector3(dais.x + 10, 0, dais.z + 2.6);
  spot.y = g.zone.nav.y(spot.x, spot.z);
  g.debug.hold = () => false;
  for (const e of g.zone.enemies) e.obj.removeFromParent();
  g.zone.enemies = [];
  const p = g.player;
  p.obj.visible = false;
  for (const [label, set] of OUTFITS.filter(([l]) => l === 'chain' || l === 'leather')) {
    // Running across the screen, so the stride shows side-on, then toward the camera.
    for (const [facing, way] of [[Math.PI / 2, 'across'], [0, 'toward']] as const) {
      const o = runner(set, undefined, LEFT);
      o.position.copy(spot);
      o.rotation.y = facing;
      g.scene.add(o);
      for (const [zoom, tag] of [[1, 'default'], [0.4, 'close']] as const) {
        g.camZoom = zoom;
        g.camPos.copy(spot);
        g['updateCamera'](0);
        await shot(`skirt-playcam-${label}-${way}-${tag}`);
      }
      o.removeFromParent();
    }
  }
  p.obj.visible = true;
  g.camZoom = 1;
  document.body.classList.remove('inspect-clean');
  g.debug.hold = null;
}
