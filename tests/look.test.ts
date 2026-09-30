/**
 * The clean look: models are flat colour with a soft vertical grade, forged metal reflects the
 * studio environment, and item icons fill their slot. Uses the real exported GLBs.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeItem } from '../src/loot/itemGen';
import { studioEnv, studioRadiance } from '../src/render/env';
import { iconSubject } from '../src/render/icons3d';
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

describe('models are clean', () => {
  it('no creature, character, hair or gear material carries a surface texture; all are graded', () => {
    const roots = ['goblin', 'kobold', 'drakeling', 'cinderwing', 'whelp', 'warden', 'golem'].map((n) => makeModel(n).root);
    roots.push(dressed({ helm: 'steel_fullhelm', body: 'bronze_platebody', gloves: 'iron_gauntlets', boots: 'iron_boots', weapon: 'steel_sword' }).root);
    for (const root of roots) {
      for (const m of materials(root)) {
        expect(patchKeys(m).some((k) => k.startsWith('surface')), `${root.name} ${m.name}`).toBe(false);
        expect(patchKeys(m), `${root.name} ${m.name}`).toContain('grade:root');
      }
    }
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
