import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NodeMaterial } from 'three/webgpu';
import { hash01 } from '../../render/blocks';
import { applyFinish, studioEnv } from '../../render/env';
import { ModelKit } from '../../render/kit';
import { cleanBreaks, COURSE, type GridDir, masonGeometry, type MasonGrid, type MasonOpts, STONE as STONE_LEN } from '../../render/masonry';
import { applyPaint, type PaintKind } from '../../render/paint';
import { BRONZES, GLOSSY, MEMBRANE, METALS, paintFor, PUDDLE, ROCK_WET } from './palette';

// Finishing a built prop: merging its static meshes, laying its stone, its painted finish and the geometry audit's record of its parts.

/**
 * Merge a kit-built prop's static meshes: within each parent group, unnamed meshes sharing a
 * material become one mesh. A palisade drops from ~60 draw calls to 2, a tower from hundreds of
 * blocks to a handful, a portal's rune inlays to one. Groups toggled by setState and named parts
 * animated by tick (flames, seals) stay separate, so behaviour is unchanged.
 */
export function mergeStatic(root: THREE.Object3D, lay?: (m: THREE.Mesh) => MasonOpts | null) {
  const parents = new Set<THREE.Object3D>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.parent && !o.children.length) parents.add(o.parent);
  });
  for (const parent of parents) {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of parent.children) {
      if (!(c instanceof THREE.Mesh) || c.children.length || c.name || Array.isArray(c.material)) continue;
      const m = c.material;
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      const list = groups.get(m) ?? [];
      list.push(c);
      groups.set(m, list);
    }
    for (const [mat, meshes] of groups) {
      // Single meshes are baked too, so every static part shares the prop's own space (painted
      // patterns line up across its parts and follow the prop as a whole).
      // (Dressed stone takes its own stone layout first, in its own space: see masonry.ts.)
      const merged = mergeGeometries(meshes.map((m) => {
        m.updateMatrix();
        const mason = lay?.(m);
        let geo = mason ? masonGeometry(m.geometry, mason).applyMatrix4(m.matrix) : m.geometry.clone().applyMatrix4(m.matrix);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aMason' && k !== 'aMasonK' && k !== 'aMasonF') geo.deleteAttribute(k);
        if (geo.index) geo = geo.toNonIndexed();
        return geo;
      }));
      if (!merged) continue;
      for (const m of meshes) m.removeFromParent();
      parent.add(new THREE.Mesh(merged, mat));
    }
  }
}

/**
 * The geometry audit (tests/castle-geometry.test.ts): while `on`, every finished prop and building
 * keeps the list of its parts as built, before its static meshes are merged, so the audit can test
 * each block against the others (clipping, floating, doors and windows on their walls).
 */
export const PART_AUDIT = { on: false };

/** One dressed-stone part's stone layout (see masonLayout): its bounds and course breaks in the prop's space. */
export interface CourseRecord {
  color: number;
  box: THREE.Box3;
  breaks: number[];
  /** Its course height (the deep base course is laid in its own). */
  course: number;
  /** Laid as one stone, or laying its own stones (voussoirs, kerbs, a band along a run): no courses. */
  single: boolean;
  laid: boolean;
}

/** One built part: its geometry's bounds in its own space, placed by `m` in the prop's space. */
export interface Part {
  /** 'cyl': a cylinder or cone round its own Y axis (radius `r` at its foot, `rTop` at its top); 'box' anything else (its bounds). */
  shape: 'box' | 'cyl';
  m: THREE.Matrix4;
  min: THREE.Vector3;
  max: THREE.Vector3;
  r: number;
  rTop: number;
  color: number;
  /** What the part is, where a rule needs to know (userData.part: 'door-leaf', 'handle', 'glass', 'doorway'…). */
  tag?: string;
  /** Extra facts a tagged part carries (userData.audit: a door's class and size…). */
  info?: Record<string, unknown>;
  /** Effects (water, foam, flames) take no part in the solid checks. */
  fx: boolean;
  /** See-through (glass) or cloth: it hangs on or sits in a solid, but is no solid itself. */
  thin: boolean;
  /** Its bounds are not its body (a ring round a hole, the spandrels round an opening). */
  hollow: boolean;
  /** A ring round its own Y axis: inner radius (its outer radius is `r`). */
  rIn: number;
  /** Which mesh it came from (the boxes one shaped mesh lists share it). */
  mesh: number;
  /** Part of a furnishing inside a building (a table, a cask), not of its architecture. */
  fit: boolean;
  /** A cylinder's number of flat sides (a drum is a polygon: what stands on it stands on a facet). */
  sides?: number;
  /**
   * A drum laid in rings of flat stones, each course turned half a stone on the next (masonry.ts,
   * laidDrum): no one facet runs up it, so what stands on it hugs the round of its corners.
   */
  round?: boolean;
  /** A true box (a block or a chamfered block): its bounds are its faces. */
  box?: boolean;
  /** A drum cut back where doorways open in it: the audit sees the whole drum, the doorways stand in it. */
  notched?: boolean;
}

function recordParts(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), parts: Part[] = [];
  let mesh = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    mesh++;
    let fit = false;
    for (let a: THREE.Object3D | null = o; a && a !== g; a = a.parent) if (a.userData.furnishing) fit = true;
    const geo = o.geometry as THREE.BufferGeometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const p = geo as THREE.CylinderGeometry, ring = geo.userData.ring as [number, number] | undefined;
    const laid = geo.userData.drum as { r: number; rTop: number; sides: number } | undefined;
    const cyl = p.type === 'CylinderGeometry' || p.type === 'ConeGeometry' || !!ring;
    const fx = !(mat instanceof THREE.MeshStandardMaterial) || o.name === 'flame';
    // A shape whose bounds are not its body (an arch through a wall, a border round a bed) lists the
    // boxes it fills: [min…, max…] in its own space, or a box turned about Y ({ c, h, ry }).
    type Box = number[] | { c: number[]; h: number[]; ry: number };
    const boxes = (geo.userData.boxes as Box[] | undefined) ?? [[...geo.boundingBox!.min.toArray(), ...geo.boundingBox!.max.toArray()]];
    const base = inv.clone().multiply(o.matrixWorld);
    for (const bx of boxes) parts.push({
      shape: cyl ? 'cyl' : 'box',
      ...(Array.isArray(bx)
        ? { m: base.clone(), min: new THREE.Vector3(bx[0], bx[1], bx[2]), max: new THREE.Vector3(bx[3], bx[4], bx[5]) }
        : { m: base.clone().multiply(new THREE.Matrix4().makeRotationY(bx.ry).setPosition(bx.c[0], bx.c[1], bx.c[2])), min: new THREE.Vector3(-bx.h[0], -bx.h[1], -bx.h[2]), max: new THREE.Vector3(bx.h[0], bx.h[1], bx.h[2]) }),
      r: laid ? laid.r : ring ? ring[1] : cyl ? (p.parameters.radiusBottom ?? (p.parameters as unknown as { radius: number }).radius ?? 0) : 0,
      rTop: laid ? laid.rTop : ring ? ring[1] : cyl ? (p.parameters.radiusTop ?? 0) : 0, rIn: ring ? ring[0] : 0,
      color: mat instanceof THREE.MeshStandardMaterial ? mat.color.getHex() : 0, tag: o.userData.part ?? (o.name === 'glass' || o.name === 'cloth' || o.name === 'room' ? o.name : undefined), info: o.userData.audit, fx,
      thin: !fx && (!!(mat as THREE.Material).transparent || o.name === 'glass' || o.name === 'cloth' || o.name === 'room'), hollow: !!geo.userData.hollow, mesh, fit,
      sides: p.type === 'CylinderGeometry' ? p.parameters.radialSegments : laid?.sides, round: !!laid,
      box: !geo.userData.boxes && (p.type === 'BoxGeometry' || !!geo.userData.box), notched: !!geo.userData.notched,
    });
  });
  g.userData.parts = parts;
}

/** The painted pattern a finished prop's material takes (see finishProp), or null when it takes none. */
function paintKindOf(m: THREE.MeshStandardMaterial): PaintKind | null {
  const hex = m.color.getHex();
  if (m.userData.cloth || METALS.has(hex) || BRONZES.has(hex) || hex === MEMBRANE || hex === ROCK_WET || hex === PUDDLE || GLOSSY.has(hex)) return null;
  return m.emissive.getHex() === 0 || m.emissiveIntensity === 0 ? paintFor(hex) : null;
}

/**
 * The stone layout of a finished prop's dressed stone (masonry.ts): for each part painted as masonry
 * or ashlar, its courses run up from the prop's foot, broken at every band that crosses its faces (a
 * string course, a plinth, a coping: any long, low part laid over it), so the courses fit whole
 * between the bands, every part of one face shares them, and over the last band they run on at one
 * course height. The castle lays all its bands on the course lines (masonry.ts), so its courses are
 * one height everywhere and line up from piece to piece.
 */
function masonLayout(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const parts: { mesh: THREE.Mesh; box: THREE.Box3; mason: boolean; color: number; square: boolean }[] = [];
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !(o.material instanceof THREE.MeshStandardMaterial) || o.material.transparent) return;
    const geo = o.geometry as THREE.BufferGeometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const kind = paintKindOf(o.material), m = inv.clone().multiply(o.matrixWorld), e = m.elements;
    // (Square: upright and turned about Y by right angles only.)
    const square = Math.abs(e[1]) < 1e-4 && Math.abs(e[9]) < 1e-4 && (Math.abs(e[0]) < 1e-4 || Math.abs(e[2]) < 1e-4);
    parts.push({ mesh: o, box: geo.boundingBox!.clone().applyMatrix4(m), mason: kind === 'masonry' || kind === 'ashlar', color: o.material.color.getHex(), square });
  });
  const stone = parts.filter((p) => p.mason);
  if (!stone.length) return () => null;
  // The courses count up from the ground the prop stands on (its origin), where its walling reaches it
  // (a foundation sunk below it, a floor or a threshold laid a hair into it, moves no course), or from
  // the walling's own foot where that stands clear above it.
  const walling = stone.filter((p) => p.box.max.y - p.box.min.y >= 0.2);
  const foot = Math.max(0, Math.min(...(walling.length ? walling : stone).map((p) => p.box.min.y)));
  // A band is a long, low course of stone (a sill or a lintel is no course, and lays none of its own
  // into the walling).
  const bands = stone.filter((p) => p.box.max.y - p.box.min.y <= 0.8 && Math.max(p.box.max.x - p.box.min.x, p.box.max.z - p.box.min.z) >= 2);
  const of = new Map<THREE.Mesh, (typeof parts)[number]>(parts.map((p) => [p.mesh, p]));
  // A prop with its own block grid (a castle building): every face of one stone in one plane is laid as
  // one face, from end to end of the stretch the coplanar faces make together where they touch (side by
  // side, or one standing on the other: a wall's courses over its stub; never a parapet and a base course
  // that only share a plane far apart in height). A stretch shorter than a stone and a half (a pier's
  // front, a reveal) is laid from its own ends instead.
  const grid = g.userData.masonGrid as MasonGrid | undefined;
  type Piece = (typeof parts)[number];
  // (Each plane found once: a face within PLANE_TOL of a plane already found is laid in it, so faces a
  // hair apart never split into two planes with their own joints. Its parts are grouped into the
  // stretches they make, each stretch's reach along the plane.)
  const PLANE_TOL = 0.012, GAP = 0.05;
  type Stretch = { parts: Piece[]; lo: number; hi: number };
  const planes: { dir: GridDir; plane: number; color: number; groups: Stretch[] }[] = [];
  const level = (a: Piece, b: Piece) => a.box.min.y <= b.box.max.y + 0.02 && b.box.min.y <= a.box.max.y + 0.02;
  const gridReach = (dir: GridDir, plane: number, lo: number, hi: number, p: Piece): [number, number] | null => {
    const along = dir === 'pz' || dir === 'mz', run = along ? 'x' : 'z';
    let entry = planes.find((q) => q.dir === dir && q.color === p.color && Math.abs(q.plane - plane) < PLANE_TOL);
    if (!entry) {
      const ax = along ? 'z' : 'x', far = dir === 'pz' || dir === 'px';
      // (A piece that lays its own stones, an arch's ring or a jamb, sets out no plane of walling.)
      const inPlane = stone.filter((q) => q.square && q.color === p.color && !q.mesh.geometry.getAttribute('aMason') && Math.abs((far ? q.box.max[ax] : q.box.min[ax]) - plane) < PLANE_TOL);
      const touch = (a: Piece, b: Piece) => a.box.min[run] <= b.box.max[run] + GAP && b.box.min[run] <= a.box.max[run] + GAP && level(a, b);
      const groups: Stretch[] = [];
      for (const q of inPlane) {
        const hit = groups.filter((gr) => gr.parts.some((o) => touch(o, q)));
        for (const gr of hit) groups.splice(groups.indexOf(gr), 1);
        groups.push({ parts: [q, ...hit.flatMap((gr) => gr.parts)], lo: Math.min(q.box.min[run], ...hit.map((gr) => gr.lo)), hi: Math.max(q.box.max[run], ...hit.map((gr) => gr.hi)) });
      }
      entry = { dir, plane, color: p.color, groups };
      planes.push(entry);
    }
    // The stretch the part itself stands in (or, for a face of it inside its bounds, the one at its height there).
    const gr = entry.groups.find((q) => q.parts.includes(p)) ?? entry.groups.find((q) => q.lo <= hi + GAP && q.hi >= lo - GAP && q.parts.some((o) => level(o, p)));
    const reach: [number, number] = [Math.min(gr?.lo ?? lo, lo), Math.max(gr?.hi ?? hi, hi)];
    return reach[1] - reach[0] >= 1.5 * STONE_LEN - 0.01 ? reach : null;
  };
  return (mesh: THREE.Mesh): MasonOpts | null => {
    const p = of.get(mesh);
    if (!p?.mason) return null;
    const b = p.box, dx = b.max.x - b.min.x, dz = b.max.z - b.min.z, alongX = dx >= dz;
    // (Across its faces, and along them.)
    const ax = alongX ? 'z' : 'x', run = alongX ? 'x' : 'z';
    // (A part laid in the deliberate other size names its course height and stone length, and is
    // laid in courses of its own: see `deep`.)
    const course = mesh.userData.course as number | undefined, stoneLen = mesh.userData.stone as number | undefined;
    const ys = course ? [foot, b.min.y, b.max.y] : [foot];
    // (A band is one course of its own: its foot and top lie on course lines, the same lines the
    // walling behind it is laid to, so a course standing proud round a drum lines up with its stones.
    // A strip of walling under or over an opening is no band: it lies flush on the walling of its own
    // stone over or under it, in the courses of the wall it is part of.)
    const strip = stone.some((q) => q !== p && q.color === p.color && Math.abs(q.box.min[ax] - b.min[ax]) < 0.03 && Math.abs(q.box.max[ax] - b.max[ax]) < 0.03 && (Math.abs(q.box.min.y - b.max.y) < 0.02 || Math.abs(q.box.max.y - b.min.y) < 0.02) && Math.min(q.box.max[run], b.max[run]) - Math.max(q.box.min[run], b.min[run]) > 0.05);
    if (!course && b.max.y - b.min.y <= 0.8 && !strip) ys.push(b.min.y, b.max.y);
    if (!course) for (const q of bands) {
      if (q === p || q.box.min.y <= b.min.y + 0.02 && q.box.max.y >= b.max.y - 0.02) continue;
      const qb = q.box;
      if (qb.max.x < b.min.x - 0.3 || qb.min.x > b.max.x + 0.3 || qb.max.z < b.min.z - 0.3 || qb.min.z > b.max.z + 0.3) continue;
      // It crosses the part's face: it stands proud of it, against it. (A floor, a deck or a roof
      // reaching in from it is no band on it, nor is the walling laid flush beside it.)
      const outA = qb.max[ax] - b.max[ax], outB = b.min[ax] - qb.min[ax];
      if (Math.max(outA, outB) < 0.03 || outA > 0.6 || outB > 0.6) continue;
      // (A thin strip, a gutter's edge or a threshold, is no course, but for a coping laid on its top.)
      if (qb.max.y - qb.min.y < 0.15 && Math.abs(qb.min.y - b.max.y) > 0.02) continue;
      const cover = alongX ? Math.min(qb.max.x, b.max.x) - Math.max(qb.min.x, b.min.x) : Math.min(qb.max.z, b.max.z) - Math.max(qb.min.z, b.min.z);
      if (cover < 0.7 * (alongX ? dx : dz)) continue;
      ys.push(qb.min.y, qb.max.y);
    }
    // The whole face a square part is laid in: the parts of its stone and its wall's thickness that
    // run on from it edge to edge, along X and along Z.
    const reach = (ax: 'x' | 'z') => {
      const ox = ax === 'x' ? 'z' : 'x';
      const row = stone.filter((q) => q.square && q.color === p.color && Math.abs(q.box.min[ox] - b.min[ox]) < 0.05 && Math.abs(q.box.max[ox] - b.max[ox]) < 0.05);
      let lo = b.min[ax], hi = b.max[ax], grew = true;
      while (grew) {
        grew = false;
        for (const q of row) if (q.box.min[ax] < lo - 1e-6 && q.box.max[ax] >= lo - 0.05 || q.box.max[ax] > hi + 1e-6 && q.box.min[ax] <= hi + 0.05) {
          lo = Math.min(lo, q.box.min[ax]);
          hi = Math.max(hi, q.box.max[ax]);
          grew = true;
        }
      }
      return [lo, hi];
    };
    // (A part cut from a mass round an opening names the mass's whole face: see `carved`.)
    const named = mesh.userData.face as MasonOpts['face'];
    const [x0, x1] = named ? [named.x0, named.x1] : reach('x'), [z0, z1] = named ? [named.z0, named.z1] : reach('z');
    const face = named ?? (p.square ? { x0, x1, z0, z1 } : undefined);
    const c = b.getCenter(new THREE.Vector3());
    // (A part no bigger than one stone, a merlon, a quoin, a voussoir, is laid as one stone.)
    const single = !!mesh.userData.oneStone || (!named && Math.max(dx, dz) <= STONE_LEN * 1.3 && b.max.y - b.min.y <= 0.8);
    // (On a prop with its own block grid, every course runs on from the foot at one height: its bands
    // lie on the course lines, so none is fitted to them.)
    const breaks = grid ? [foot] : cleanBreaks(ys.filter((y) => y >= foot - 1e-6));
    const opts: MasonOpts = { single, face, course, stone: stoneLen, m: inv.clone().multiply(mesh.matrixWorld), breaks, seed: Math.floor((face ? hash01(x0, x1, z0 + z1, p.color) : hash01(c.x, c.y, c.z)) * 97) };
    // (A band standing out round the foot names where its joints start along it: see footBand.)
    const from = mesh.userData.gridFrom as Partial<MasonGrid> | undefined;
    if (grid && p.square) opts.grid = { g: { ...grid, ...from }, at: (dir, plane, lo, hi) => gridReach(dir, plane, lo, hi, p), foot };
    if (PART_AUDIT.on) (g.userData.courses ??= []).push({ color: p.color, box: b.clone(), breaks: opts.breaks, course: course ?? COURSE, single, laid: !!mesh.geometry.getAttribute('aMason') || !!mesh.geometry.getAttribute('aLay') } satisfies CourseRecord);
    return opts;
  };
}

/**
 * Finish a kit-built prop: merge static meshes, give materials their look (shiny metal, glossy
 * coal, painted albedo) and set shadow flags.
 */
export function finishProp(g: THREE.Object3D, kits: ModelKit[]) {
  if (PART_AUDIT.on) recordParts(g);
  mergeStatic(g, masonLayout(g));
  for (const m of kits.flatMap((k) => k.mats)) {
    // Iron and gold fittings shine; coal and obsidian are glossy; grey masonry gets a gentle
    // stone detail (lined up in world space); everything else stays clean flat colour.
    const hex = m.color.getHex();
    if (m.userData.cloth) continue;
    if (METALS.has(hex)) applyFinish(m, 'metal');
    else if (BRONZES.has(hex)) {
      // Cast bronze: polished metal, so the low sun and the studio's softboxes put hot highlights on
      // the ridges, horns and spine plates while the hollows stay dark.
      // (Smooth-shaded over its broad facets, so the body catches the light as curved metal; the
      // hollows take a darker patina from the paint.)
      applyPaint(m, 'soft', 'object');
      Object.assign(m, { metalness: 0.9, roughness: 0.25, envMap: studioEnv(), envMapIntensity: 1.7, flatShading: false });
      m.userData.smooth = true;
      m.needsUpdate = true;
    } else if (hex === MEMBRANE) {
      // The wing membranes: the same bronze a value darker, a little less polished, so their backs
      // read as warm bronze (not black) where they face away from the sky.
      applyPaint(m, 'soft', 'object');
      Object.assign(m, { metalness: 0.75, roughness: 0.32, envMap: studioEnv(), envMapIntensity: 1.5 });
      m.needsUpdate = true;
    }
    else if (hex === ROCK_WET) {
      // Wet rock: the rock's own paint, darker, with a soft sheen of the sky on it.
      applyPaint(m, 'rock', 'object');
      Object.assign(m, { roughness: 0.32, metalness: 0.08, envMap: studioEnv(), envMapIntensity: 0.6 });
      m.needsUpdate = true;
    } else if (hex === PUDDLE) {
      // Still water: dark teal (the mine's water colour) with a sheen of the cave light, no texture.
      Object.assign(m, { roughness: 0.08, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.55 });
      m.needsUpdate = true;
    } else if (GLOSSY.has(hex)) {
      Object.assign(m, { roughness: 0.2, metalness: 0.25, envMap: studioEnv(), envMapIntensity: 1.1 });
      m.needsUpdate = true;
    } else if (m.emissive.getHex() === 0 || m.emissiveIntensity === 0) {
      applyPaint(m, paintFor(hex), 'object');
    }
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.userData.smooth) o.geometry = toCreasedNormals(o.geometry, Math.PI / 3.2);
    if (o instanceof THREE.Mesh) {
      const fx = o.material instanceof NodeMaterial;

      o.castShadow = !fx && !(o.material as THREE.Material).userData.decal;
      o.receiveShadow = !fx;
    }
  });
}
