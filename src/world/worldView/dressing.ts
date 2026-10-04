import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildProp, KERB, OCCLUDING_PROPS, type Prop } from '../props';
import { applyPaint } from '../../render/paint';
import { laidRun } from '../../render/masonry';
import { KERB_W, kerbStones } from '../kerbStones';
import { hash01 } from '../../render/blocks';
import { occludeAll } from './occlusion';
import { fitProp } from './legacyBuildings';
import type { Scene } from './scene';

/**
 * The kerbs edging paving against lawns and gravel (layout.kerbs): each run one continuous border of
 * the paving's stone a shade darker, its joints laid in it (laidRun), standing a hair proud of the
 * ground, a corner stone where two runs turn (see kerbStones), all one merged mesh.
 */
export function layKerbs(scene: Scene) {
  const { layout, heightAt, floorAt, group } = scene;
  if (layout.kerbs?.length) {
    const km = new THREE.Matrix4();
    const parts = kerbStones(layout.kerbs).map((kb) => {
      const g = laidRun(kb.len, KERB_W, 0.12, kb.n, Math.floor(hash01(kb.x, kb.z) * 97));
      g.applyMatrix4(km.makeRotationY(kb.rot).setPosition(kb.x, Math.max(floorAt(kb.x, kb.z), heightAt(kb.x, kb.z)), kb.z));
      return g;
    });
    const kerbMat = new THREE.MeshStandardMaterial({ color: KERB, roughness: 0.9, flatShading: true });
    applyPaint(kerbMat, 'masonry', 'object');
    const kerbMesh = new THREE.Mesh(mergeGeometries(parts)!, kerbMat);
    kerbMesh.receiveShadow = true;
    kerbMesh.name = 'kerbs';
    group.add(kerbMesh);
  }
}

/** The layout's props, each standing on the ground (or the height it gives). */
export function placeProps(scene: Scene) {
  const { layout, heightAt, floorAt, group } = scene;
  const props: Prop[] = [];
  for (const pr of layout.props) {
    const prop = pr.kind.startsWith('fit_') ? fitProp(pr.kind, pr.len) : buildProp(pr.kind, pr.v === undefined && pr.bend === undefined && !pr.opt ? pr.len : { len: pr.len, v: pr.v, bend: pr.bend, opt: pr.opt });
    prop.obj.position.set(pr.x, pr.y ?? Math.max(floorAt(pr.x, pr.z), heightAt(pr.x, pr.z)), pr.z);
    prop.obj.rotation.y = pr.rot ?? 0;
    if (pr.s) prop.obj.scale.setScalar(pr.s);
    if (OCCLUDING_PROPS.has(pr.kind)) occludeAll(prop.obj);
    group.add(prop.obj);
    props.push(prop);
  }
  return props;
}
