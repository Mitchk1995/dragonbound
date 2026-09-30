/**
 * The painted look: models carry hand-painted albedo and a soft vertical grade, forged metal reflects the
 * studio environment, and item icons fill their slot. Uses the real exported GLBs.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeItem } from '../src/loot/itemGen';
import { studioEnv, studioRadiance } from '../src/render/env';
import { ICON_PAINT_GAIN, iconSubject } from '../src/render/icons3d';
import { HeroDresser, MODEL_FILES, makeModel, registerModelScene } from '../src/render/registry';
import { patchKeys } from '../src/render/surface';

beforeAll(async () => {
  const loader = new GLTFLoader();
  for (const name of MODEL_FILES) {
    const file = `public/models/${name}.glb`;
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise<any>((res, rej) => loader.parse(ab, '', res, rej));
    registerModelScene(name, gltf.scene);
  }
});

function materials(root: THREE.Object3D) {
  const set = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) set.add(o.material as THREE.MeshStandardMaterial);
  });
  return [...set];
}

function dressed(equip: Record<string, string>) {
  const model = makeModel('hero');
  const items = Object.fromEntries(Object.entries(equip).map(([s, id]) => [s, makeItem(id)]));
  new HeroDresser(model).dress({ name: '', skin: 1, hair: 1, hairColor: 1, beard: 1, cloth: 0, cloth2: 5 }, items);
  return model;
}

const glows = (m: THREE.MeshStandardMaterial) => (m.emissive.r * 0.3 + m.emissive.g * 0.59 + m.emissive.b * 0.11) * m.emissiveIntensity > 0.2;
const recipe = (m: THREE.Material) => m.userData.charPaint as { uPaintW: { value: THREE.Vector4 }; uPaintX: { value: THREE.Vector4 } } | undefined;

describe('models are hand-painted', () => {
  it('every creature, character, hair and gear material is painted (glows excepted) and graded; no bump', () => {
    const roots = ['goblin', 'kobold', 'drakeling', 'cinderwing', 'whelp', 'warden', 'golem'].map((n) => makeModel(n).root);
    roots.push(dressed({ helm: 'steel_fullhelm', body: 'bronze_platebody', gloves: 'iron_gauntlets', boots: 'iron_boots', weapon: 'steel_sword' }).root);
    for (const root of roots) {
      for (const m of materials(root)) {
        const keys = patchKeys(m);
        expect(keys.some((k) => k.startsWith('surface')), `${root.name} ${m.name}: old bump surface`).toBe(false);
        expect(keys, `${root.name} ${m.name}`).toContain('grade:root');
        if (!glows(m) && !m.name.startsWith('ROLE_glow')) expect(keys.some((k) => k.startsWith('cpaint:')), `${root.name} ${m.name} painted`).toBe(true);
      }
    }
  });

  it('merged parts carry one continuous rest frame: a limb\'s pattern lines up with the body at rest', () => {
    const model = makeModel('goblin');
    model.root.updateMatrixWorld(true);
    const inv = model.root.matrixWorld.clone().invert();
    let checked = 0;
    model.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('aRest')) return;
      const pos = o.geometry.attributes.position, rest = o.geometry.attributes.aRest;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 17) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        expect(rest.getX(i)).toBeCloseTo(v.x, 4);
        expect(rest.getY(i)).toBeCloseTo(v.y, 4);
        expect(rest.getZ(i)).toBeCloseTo(v.z, 4);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(20);
  });

  it('creatures take their own recipes: scaled dragons, mossy stone golem', () => {
    const weightsOf = (name: string) => {
      const out: THREE.Vector4[] = [];
      makeModel(name).root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const w = o.geometry.getAttribute('aPaintW');
        if (w) for (let i = 0; i < w.count; i += 3) out.push(new THREE.Vector4().fromBufferAttribute(w, i));
      });
      return out;
    };
    for (const d of ['drakeling', 'kobold', 'cinderwing']) expect(weightsOf(d).some((w) => w.w > 0.3), `${d} scales`).toBe(true);
    const whelp = weightsOf('whelp');
    expect(whelp.some((w) => w.w > 0), 'whelp scales').toBe(true);
    expect(Math.max(...whelp.map((w) => w.w)), 'whelp softer').toBeLessThan(0.25);
    expect(weightsOf('golem').every((w) => w.x > 0.25), 'golem stone').toBe(true);
  });

  it('gear recipes follow the palette: forged tiers paint as metal, leather armour as leather', () => {
    const metalW = (id: string) => materials(dressed({ body: id }).root).filter((m) => m.name.startsWith('ROLE_metal')).map((m) => recipe(m)!.uPaintW.value);
    for (const w of metalW('steel_platebody')) expect(w.y, 'brushed').toBeGreaterThan(w.x);
    for (const w of metalW('leather_body')) expect(w.x, 'mottled').toBeGreaterThan(w.y);
  });

  it('item icons paint softer than the game', () => {
    const { holder } = iconSubject(makeItem('steel_fullhelm'));
    let n = 0;
    holder.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const u = (o.material as THREE.Material).userData.charPaint;
      if (!u) return;
      expect(u.uCharGain.value).toBe(ICON_PAINT_GAIN);
      n++;
    });
    expect(n).toBeGreaterThan(0);
    expect(ICON_PAINT_GAIN).toBeLessThan(1);
  });

  it('the grade follows the model root, so attached gear shares the wearer\'s gradient', () => {
    const model = dressed({ boots: 'iron_boots' });
    model.root.position.y = 3;
    model.root.updateMatrixWorld(true);
    let boot: THREE.Mesh | null = null;
    model.root.traverse((o) => {
      if (!boot && o instanceof THREE.Mesh && o.parent?.name === 'gear:sock_footL') boot = o;
    });
    expect(boot).toBeTruthy();
    const mesh = boot as unknown as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mesh.onBeforeRender(null as any, null as any, null as any, mesh.geometry, mat, null as any);
    const row = mat.userData.gradeRow as THREE.Vector4;
    const p = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const frac = row.dot(new THREE.Vector4(p.x, p.y, p.z, 1));
    // An ankle sits near the bottom of the hero, wherever the hero stands.
    expect(frac).toBeGreaterThan(-0.05);
    expect(frac).toBeLessThan(0.3);
  });
});

describe('metal reads as metal', () => {
  it('forged tiers reflect the studio environment; leather does not', () => {
    const plate = materials(dressed({ body: 'steel_platebody' }).root).filter((m) => m.name.startsWith('ROLE_metal'));
    expect(plate.length).toBeGreaterThan(0);
    for (const m of plate) {
      expect(m.envMap).toBe(studioEnv());
      expect(m.metalness).toBeGreaterThan(0.7);
      expect(m.roughness).toBeGreaterThan(0.25); // rough enough not to sparkle under bloom
    }
    for (const m of materials(dressed({ body: 'leather_body' }).root)) {
      expect(m.envMap, m.name).toBeNull();
      expect(m.metalness, m.name).toBeLessThan(0.2);
    }
  });

  it('unique gear authored as metal reflects too; its other parts stay matte', () => {
    const model = makeModel('hero');
    const crown = { ...makeItem('iron_fullhelm'), unique: 'ashen_crown', rarity: 'unique' } as ReturnType<typeof makeItem>;
    new HeroDresser(model).dress(null, { helm: crown });
    const gear = new Set<THREE.MeshStandardMaterial>();
    model.root.getObjectByName('gear:sock_head')!.traverse((o) => {
      if (o instanceof THREE.Mesh) gear.add(o.material as THREE.MeshStandardMaterial);
    });
    const shiny = [...gear].filter((m) => m.envMap === studioEnv());
    expect(shiny.length).toBeGreaterThan(0);
    for (const m of shiny) expect(m.metalness).toBeGreaterThan(0.7);
    expect([...gear].some((m) => m.envMap === null && m.emissiveIntensity > 0), 'ember glow stays unlit by the studio').toBe(true);
  });

  it('studio environment: warm bright top, dark ground, bounded softbox highlights', () => {
    const up = studioRadiance(new THREE.Vector3(0, 1, 0));
    const down = studioRadiance(new THREE.Vector3(0, -1, 0));
    const side = studioRadiance(new THREE.Vector3(1, 0, 0));
    expect(up[0]).toBeGreaterThan(up[2]); // warm
    expect(up[1]).toBeGreaterThan(side[1]);
    expect(side[1]).toBeGreaterThan(down[1] * 4);
    let peak = 0;
    const d = new THREE.Vector3();
    for (let lat = -80; lat <= 80; lat += 4) {
      for (let lon = 0; lon < 360; lon += 4) {
        const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180;
        d.set(Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b));
        peak = Math.max(peak, ...studioRadiance(d));
      }
    }
    expect(peak).toBeGreaterThan(1.5);
    expect(peak).toBeLessThan(5);
  });
});

describe('item icons fill their slot', () => {
  const fill = (id: string) => {
    const { holder, half } = iconSubject(makeItem(id));
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    return { box, half };
  };

  it.each(['iron_sword', 'bronze_medhelm', 'steel_fullhelm', 'bronze_gauntlets', 'iron_boots', 'copper_ore'])('%s spans ~94% of the icon, centred', (id) => {
    const { box, half } = fill(id);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    expect(Math.max(size.x, size.y) / (half * 2)).toBeCloseTo(0.94, 2);
    expect(Math.abs(c.x) + Math.abs(c.y)).toBeLessThan(1e-3);
  });

  it('gloves and boots are shown as a pair side by side with a small gap', () => {
    for (const id of ['bronze_gauntlets', 'steel_boots']) {
      const { holder } = iconSubject(makeItem(id));
      holder.updateMatrixWorld(true);
      const pieces = holder.children.map((c) => new THREE.Box3().setFromObject(c, true));
      expect(pieces.length, id).toBe(2);
      const [a, b] = pieces[0].min.x < pieces[1].min.x ? pieces : [pieces[1], pieces[0]];
      const gap = b.min.x - a.max.x;
      const w = Math.max(a.max.x - a.min.x, b.max.x - b.min.x);
      expect(gap / w, id).toBeCloseTo(0.1, 2);
    }
  });
});
