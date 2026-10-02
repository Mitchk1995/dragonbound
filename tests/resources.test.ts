import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject, disposeObjects, shareResource } from '../src/render/resources';
import { makeModel, registerModelScene } from '../src/render/registry';
import { GroundItem } from '../src/entities/groundItem';
import { Items } from '../src/systems/items';
import type { Game } from '../src/game';
import { buildTerrain } from '../src/world/terrain';
import { ZONES } from '../src/data/zones';

describe('instance resource cleanup', () => {
  it('releases an instance exactly once even when multiple meshes share its resources', () => {
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const parent = new THREE.Group();
    parent.add(group);
    const releases = [geometry, texture, material].map(resource => vi.spyOn(resource, 'dispose'));
    disposeObject(group);
    expect(group.parent).toBeNull();
    for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
  });

  it('keeps cached geometry and textures while releasing per-instance materials', () => {
    const geometry = shareResource(new THREE.BoxGeometry());
    const texture = shareResource(new THREE.Texture());
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geoRelease = vi.spyOn(geometry, 'dispose'), texRelease = vi.spyOn(texture, 'dispose');
    const matRelease = vi.spyOn(material, 'dispose');
    disposeObject(new THREE.Mesh(geometry, material));
    expect(geoRelease).not.toHaveBeenCalled();
    expect(texRelease).not.toHaveBeenCalled();
    expect(matRelease).toHaveBeenCalledOnce();
  });

  it('deduplicates shared attachment materials across separate roots', () => {
    const material = new THREE.MeshStandardMaterial();
    const release = vi.spyOn(material, 'dispose');
    disposeObjects([new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material)]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases instancing buffers and shader-owned textures', () => {
    const texture = new THREE.Texture();
    const material = new THREE.ShaderMaterial({ uniforms: { image: { value: texture } } });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 3);
    const release = vi.spyOn(mesh, 'dispose'), texRelease = vi.spyOn(texture, 'dispose');
    disposeObject(mesh);
    expect(release).toHaveBeenCalledOnce();
    expect(texRelease).toHaveBeenCalledOnce();
  });

  it('releases portal-title artwork without destroying the sprite geometry used by other portals', () => {
    const texture = new THREE.Texture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
    const geometryRelease = vi.spyOn(sprite.geometry, 'dispose'), textureRelease = vi.spyOn(texture, 'dispose');
    const materialRelease = vi.spyOn(sprite.material, 'dispose');
    disposeObject(sprite);
    expect(geometryRelease).not.toHaveBeenCalled();
    expect(textureRelease).toHaveBeenCalledOnce();
    expect(materialRelease).toHaveBeenCalledOnce();
  });

  it('releases the drowned city reflection target when its terrain is retired', () => {
    const release = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');
    const terrain = buildTerrain(ZONES.ruin.build(123), ZONES.ruin.theme, 123);
    disposeObjects(terrain.meshes);
    expect(release).toHaveBeenCalledOnce();
    release.mockRestore();
  });

  it('removing one loaded creature leaves another creature using its cached model intact', () => {
    const template = new THREE.Group();
    template.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    registerModelScene('goblin', template);
    const first = makeModel('goblin'), second = makeModel('goblin');
    const meshes: THREE.Mesh[] = [];
    second.root.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
    const release = vi.spyOn(meshes[0].geometry, 'dispose');
    const materialRelease = vi.spyOn(first.mats[0], 'dispose');
    disposeObject(first.root);
    expect(release).not.toHaveBeenCalled();
    expect(materialRelease).toHaveBeenCalledOnce();
    expect(second.mats[0]).not.toBe(first.mats[0]);
  });

  it('collecting loot removes its owned resources while reusable coins survive', () => {
    const item = new GroundItem(null, 5, 1, 1, 1, 1);
    item.gone = true;
    const group = new THREE.Group();
    group.add(item.group);
    const coin = item.group.children[0] as THREE.Mesh;
    const coinRelease = vi.spyOn(coin.geometry, 'dispose');
    const game = { zone: { items: [item], group }, player: {}, text: { removeLabel: vi.fn() } } as unknown as Game;
    new Items(game).update(0);
    expect(game.zone.items).toHaveLength(0);
    expect(item.group.parent).toBeNull();
    expect(coinRelease).not.toHaveBeenCalled();
  });
});
