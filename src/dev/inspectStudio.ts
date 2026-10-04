import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { BASES, TIER_ORDER, TIERS, UNIQUES } from '../data/items';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { Rig, newAnimState, type AnimState, type AttackKind } from '../render/anim';
import { BowDraw } from '../render/bowDraw';
import { HeroDresser, MODEL_FILES, hasModel, makeModel } from '../render/registry';
import type { Slot } from '../types';
import { H, W } from './inspectCommon';

// ─── Studio renders (models, gear, animation strips) ────────────────────────

export class Studio {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  /** For cells with `ortho` (the half height they show, in world units): a straight-on view without perspective. */
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private overlay: HTMLElement;
  constructor(private g: Game) {
    this.scene.background = new THREE.Color(0x3b3a40);
    this.scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x4a4038, 1.3));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(4, 8, 6);
    const rim = new THREE.DirectionalLight(0x9ab8ff, 1.2);
    rim.position.set(-6, 5, -6);
    this.scene.add(key, rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(50, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55525a, roughness: 1 }));
    this.scene.add(floor, new THREE.GridHelper(40, 40, 0x6a6670, 0x5e5a64));
    this.overlay = document.createElement('div');
    this.overlay.id = 'inspect-overlay';
  }

  /** Render `cells` into a cols×rows grid on the main canvas, each with its own camera placement. */
  sheet(cells: { label: string; obj: THREE.Object3D; eye: THREE.Vector3; at: THREE.Vector3; ortho?: number }[], cols: number, rows: number) {
    const r = this.g.renderer;
    const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
    this.overlay.innerHTML = '';
    document.body.appendChild(this.overlay);
    const draw = () => {
      r.setScissorTest(true);
      cells.forEach((c, i) => {
        // three.js's Renderer (WebGPU) measures viewports and scissors from the top left, like the labels.
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        r.setViewport(x, y, cw, ch);
        r.setScissor(x, y, cw, ch);
        const cam = c.ortho ? this.ortho : this.cam;
        if (c.ortho) this.ortho.left = -(this.ortho.right = c.ortho * cw / ch), this.ortho.bottom = -(this.ortho.top = c.ortho);
        else this.cam.aspect = cw / ch;
        cam.updateProjectionMatrix();
        cam.position.copy(c.eye);
        cam.lookAt(c.at);
        for (const o of cells) o.obj.visible = o === c;
        r.render(this.scene, cam);
      });
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      return true;
    };
    cells.forEach((c, i) => {
      this.scene.add(c.obj);
      const l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = c.label;
      l.style.left = `${(i % cols) * cw + 4}px`;
      l.style.top = `${Math.floor(i / cols) * ch + 4}px`;
      this.overlay.appendChild(l);
    });
    this.g.debug.hold = draw;
  }

  clear(objs: THREE.Object3D[]) {
    for (const o of objs) o.removeFromParent();
    this.overlay.remove();
    this.g.debug.hold = null;
  }
}

/** Four canonical views around an object of height h (model faces +Z). */
function views(h: number, dist = 2.2): [string, THREE.Vector3][] {
  const d = h * dist, y = h * 0.6;
  return [
    ['front', new THREE.Vector3(0, y, d)],
    ['left', new THREE.Vector3(d, y, 0)],
    ['back', new THREE.Vector3(0, y, -d)],
    ['3/4 top', new THREE.Vector3(-d * 0.7, h * 1.6, d * 0.7)],
  ];
}

/**
 * Camera placement that fits a posed object whole: its bounding sphere, seen from `dir`, fills a
 * studio cell (FOV 38°, cells ~0.9 aspect so the horizontal FOV is the tighter one).
 */
export function fit(o: THREE.Object3D, dir: THREE.Vector3) {
  o.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere());
  const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(19)) * 0.88);
  const dist = (sphere.radius / Math.sin(half)) * 1.04;
  return { eye: sphere.center.clone().add(dir.clone().normalize().multiplyScalar(dist)), at: sphere.center.clone() };
}

const VIEW_DIRS: [string, THREE.Vector3][] = [
  ['front', new THREE.Vector3(0, 0.35, 1)],
  ['left', new THREE.Vector3(1, 0.35, 0)],
  ['back', new THREE.Vector3(0, 0.35, -1)],
  ['3/4 top', new THREE.Vector3(-0.7, 1.1, 0.7)],
];

export async function modelsSuite(g: Game, shot: (n: string) => Promise<void>, heroOnly = false) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  // Characters and creatures: 4 views each, two models per sheet.
  const units = heroOnly ? [] : MODEL_FILES.filter((n) => hasModel(n) && !n.startsWith('gear_') && !n.startsWith('hair_') && !n.startsWith('beard_') && !n.startsWith('prop_'));
  for (let i = 0; i < units.length; i += 2) {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const name of units.slice(i, i + 2)) {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      new Rig(m.root).update(0, newAnimState());
      for (const [v, dir] of VIEW_DIRS) {
        const obj = v === 'front' ? holder : holder.clone();
        cells.push({ label: `${name} · ${v}`, obj, ...fit(holder, dir) });
        objs.push(obj);
      }
    }
    st.sheet(cells, 4, 2);
    await shot(`model-${units.slice(i, i + 2).join('+')}`);
    st.clear(objs);
  }
  // Hero in each tier set, plus uniques.
  const sets: [string, Partial<Record<Slot, string>>][] = [
    ['plain clothes', {}],
    ...TIER_ORDER.map((t): [string, Partial<Record<Slot, string>>] => [TIERS[t].name, { weapon: `${t}_sword`, helm: `${t}_medhelm`, body: `${t}_chainbody`, gloves: `${t}_gauntlets`, boots: `${t}_boots` }]),
    ...TIER_ORDER.map((t): [string, Partial<Record<Slot, string>>] => [`${TIERS[t].name} plate`, { weapon: `${t}_longsword`, helm: `${t}_fullhelm`, body: `${t}_platebody`, gloves: `${t}_gauntlets`, boots: `${t}_boots` }]),
    ['uniques', Object.fromEntries(Object.values(UNIQUES).map((u) => [BASES[u.base].slot!, u.base])) as Partial<Record<Slot, string>>],
  ];
  for (const [label, gear] of sets) {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [v, eye] of views(2.2, 2.4)) {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      const items = Object.fromEntries(Object.entries(gear).filter(([, id]) => BASES[id!]).map(([s, id]) => [s, makeItem(id!)]));
      if (label === 'uniques') for (const u of Object.values(UNIQUES)) items[BASES[u.base].slot!] = { ...makeItem(u.base), unique: u.id, rarity: 'unique' } as any;
      new HeroDresser(m).dress({ name: '', skin: 1, hair: 2, hairColor: 1, beard: 1, cloth: 0, cloth2: 5 }, items);
      new Rig(m.root).update(0, newAnimState());
      cells.push({ label: `${label} · ${v}`, obj: holder, eye, at: new THREE.Vector3(0, 1.15, 0) });
      objs.push(holder);
    }
    st.sheet(cells, 4, 1);
    await shot(`hero-${label.replace(/\s+/g, '_')}`);
    st.clear(objs);
  }
  // The legendary set up close: each unique weapon in hand with the full set on, the crown, and the whole set from
  // the gameplay camera's pitch (about 56° down) all round.
  {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    const uniqueItem = (id: string) => ({ ...makeItem(UNIQUES[id].base), unique: id, rarity: 'unique' }) as any;
    const dressed = (weapon: string) => {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      const items: Record<string, any> = {};
      for (const u of Object.values(UNIQUES)) if (BASES[u.base].slot !== 'weapon') items[BASES[u.base].slot!] = uniqueItem(u.id);
      items.weapon = uniqueItem(weapon);
      new HeroDresser(m).dress({ name: '', skin: 1, hair: 2, hairColor: 1, beard: 1, cloth: 0, cloth2: 5 }, items);
      new Rig(m.root).update(0, newAnimState());
      objs.push(holder);
      return holder;
    };
    const weapons = Object.values(UNIQUES).filter((u) => BASES[u.base].slot === 'weapon').map((u) => u.id);
    for (const w of weapons) cells.push({ label: `${UNIQUES[w].name}`, obj: dressed(w), eye: new THREE.Vector3(-1.6, 1.7, 2.9), at: new THREE.Vector3(-0.15, 1.2, 0) });
    cells.push({ label: 'Ashen Crown', obj: dressed(weapons[0]), eye: new THREE.Vector3(0.7, 2.3, 1.6), at: new THREE.Vector3(0, 1.95, 0) });
    for (const [label, yaw] of [['game cam · front', 0.5], ['game cam · back', Math.PI + 0.4], ['game cam · left', Math.PI / 2], ['game cam · right', -Math.PI / 2]] as const) {
      const k = 0.36;
      cells.push({ label, obj: dressed(weapons[(cells.length - 4) % weapons.length]), eye: new THREE.Vector3(Math.sin(yaw) * 14 * k, 1 + 21 * k, Math.cos(yaw) * 14 * k), at: new THREE.Vector3(0, 1, 0) });
    }
    st.sheet(cells, 4, 2);
    await shot('hero-uniques-detail');
    st.clear(objs);
  }
  // Every hair style and beard, 3/4 from above (the gameplay angle shows the crown).
  {
    const looks: [string, number, number][] = [['hair 1', 1, 0], ['hair 2', 2, 0], ['hair 3', 3, 0], ['hair 4', 4, 0], ['bald', 0, 0], ['beard 1', 0, 1], ['beard 2', 0, 2], ['beard 3', 0, 3]];
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [label, hair, beard] of looks) {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      new HeroDresser(m).dress({ name: '', skin: 1, hair, hairColor: 1, beard, cloth: 0, cloth2: 5 }, {});
      new Rig(m.root).update(0, newAnimState());
      cells.push({ label, obj: holder, eye: new THREE.Vector3(1.1, 2.9, 1.9), at: new THREE.Vector3(0, 1.8, 0) });
      objs.push(holder);
    }
    st.sheet(cells, 4, 2);
    await shot('hero-hair');
    st.clear(objs);
  }
  // Every hair style from the front and from the side at eye level (the gaps under a shell and the hairline show here).
  {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [view, eye] of [['front', new THREE.Vector3(0, 1.95, 2.3)], ['side', new THREE.Vector3(2.3, 1.95, -0.2)]] as const) {
      for (const hair of [1, 2, 3, 4]) {
        const m = makeModel('hero');
        const holder = new THREE.Group();
        holder.add(m.root);
        new HeroDresser(m).dress({ name: '', skin: 1, hair, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 }, {});
        new Rig(m.root).update(0, newAnimState());
        cells.push({ label: `hair ${hair} · ${view}`, obj: holder, eye, at: new THREE.Vector3(0, 1.85, 0) });
        objs.push(holder);
      }
    }
    st.sheet(cells, 4, 2);
    await shot('hero-hair-front');
    st.clear(objs);
  }
  document.body.classList.remove('inspect-clean');
}

export async function animsSuite(g: Game, shot: (n: string) => Promise<void>) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  // Rest, wind-up, peak, impact (0.55), follow-through.
  const times = [-1, 0.15, 0.3, 0.44, 0.55, 0.66, 0.8, 0.95];
  const heroSets: [string, string, AttackKind, string?][] = [
    ['emberforged slam', 'ember_longsword', 'slam', 'ember'], ['bronze swing', 'bronze_sword', 'swing', 'bronze'],
    ['sword swing', 'steel_sword', 'swing'], ['longsword slam', 'steel_longsword', 'slam'],
    ['bow', 'worn_bow', 'bow'], ['staff cast', 'apprentice_staff', 'cast'], ['pickaxe', 'steel_pickaxe', 'swing'],
  ];
  for (const [label, weapon, kind, tier = 'steel'] of heroSets) {
    for (const side of ['left', 'front'] as const) {
      const cells: Parameters<Studio['sheet']>[0] = [];
      const objs: THREE.Object3D[] = [];
      for (const t of times) {
        const m = makeModel('hero');
        const holder = new THREE.Group();
        holder.add(m.root);
        const dresser = new HeroDresser(m);
        dresser.dress(null, { weapon: makeItem(weapon), body: makeItem(`${tier}_platebody`), helm: makeItem(`${tier}_fullhelm`), gloves: makeItem(`${tier}_gauntlets`), boots: makeItem(`${tier}_boots`) });
        const bow = new BowDraw(m.root);
        bow.attach();
        const rig = new Rig(m.root);
        const s: AnimState = { ...newAnimState(), attackKind: kind, attack: t };
        rig.update(0, s);
        bow.update(s, dresser.socket('sock_handL'));
        const eye = side === 'left' ? new THREE.Vector3(6.2, 1.9, 0.6) : new THREE.Vector3(0.6, 1.9, 6.2);
        cells.push({ label: `${label} t=${t}`, obj: holder, eye, at: new THREE.Vector3(0, 1.55, 0) });
        objs.push(holder);
      }
      st.sheet(cells, 4, 2);
      await shot(`anim-hero-${label.replace(/\s+/g, '_')}-${side}`);
      st.clear(objs);
    }
  }
  // Walk cycle.
  {
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    const m0 = makeModel('hero');
    for (let k = 0; k < 8; k++) {
      const m = makeModel('hero');
      const holder = new THREE.Group();
      holder.add(m.root);
      new HeroDresser(m).dress(null, { weapon: makeItem('steel_sword') });
      const rig = new Rig(m.root);
      const s: AnimState = { ...newAnimState(), speed: 5.6 };
      for (let f = 0; f <= k * 3; f++) rig.update(1 / 60, s);
      cells.push({ label: `walk frame ${k * 3}`, obj: holder, eye: new THREE.Vector3(4.6, 1.6, 0.4), at: new THREE.Vector3(0, 1.1, 0) });
      objs.push(holder);
    }
    void m0;
    st.sheet(cells, 4, 2);
    await shot('anim-hero-walk');
    st.clear(objs);
  }
  // Creatures: idle, walk, attack, hurt/death, flight.
  for (const name of Object.values(ENEMIES).map((e) => e.model).filter((v, i, a) => a.indexOf(v) === i && hasModel(v))) {
    const states: [string, Partial<AnimState>, number][] = [
      ['idle', {}, 0.5], ['walk', { speed: 3 }, 0.4], ['attack 0.3', { attack: 0.3 }, 0], ['attack 0.55', { attack: 0.55 }, 0],
      ['hurt', { hurt: 1 }, 0], ['dead 0.6s', { dead: 0.6 }, 0], ['fly', { fly: 1, speed: 3 }, 0.8], ['fly 1.4s', { fly: 1, speed: 3 }, 1.4],
    ];
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [label, a, secs] of states) {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      const rig = new Rig(m.root);
      const s = { ...newAnimState(), ...a };
      rig.update(0, s);
      for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, s);
      cells.push({ label: `${name} ${label}`, obj: holder, ...fit(holder, new THREE.Vector3(1, 0.45, 0.5)) });
      objs.push(holder);
    }
    st.sheet(cells, 4, 2);
    await shot(`anim-${name}`);
    st.clear(objs);
  }
  // Pets are cosmetic followers (Pet.follow): the whelp hovers, the golem walks.
  const pets: [string, [string, Partial<AnimState>, number][]][] = [
    ['whelp', [['hover', { fly: 0.35 }, 0.2], ['hover 0.6s', { fly: 0.35 }, 0.6], ['hover 1.1s', { fly: 0.35 }, 1.1], ['follow', { fly: 0.35, speed: 5 }, 0.3], ['follow 0.7s', { fly: 0.35, speed: 5 }, 0.7], ['follow fast', { fly: 0.35, speed: 10 }, 0.5]]],
    ['golem', [['idle', {}, 0.5], ['idle 1.5s', {}, 1.5], ['walk', { speed: 3 }, 0.2], ['walk 0.45s', { speed: 3 }, 0.45], ['walk 0.7s', { speed: 3 }, 0.7], ['run', { speed: 8 }, 0.4]]],
  ];
  for (const [name, states] of pets) {
    if (!hasModel(name)) continue;
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [label, a, secs] of states) {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      const rig = new Rig(m.root);
      const st2 = { ...newAnimState(), ...a };
      for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, st2);
      cells.push({ label: `pet ${name} ${label}`, obj: holder, ...fit(holder, new THREE.Vector3(1, 0.45, 0.5)) });
      objs.push(holder);
    }
    st.sheet(cells, 3, 2);
    await shot(`anim-pet-${name}`);
    st.clear(objs);
  }
  document.body.classList.remove('inspect-clean');
}
