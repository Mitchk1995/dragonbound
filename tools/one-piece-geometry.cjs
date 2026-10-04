// The geometry behind tools/check-one-piece.cjs: read a .glb's triangles in their rest pose, weld them into
// connected pieces, and measure how deep any piece's surface runs inside another closed piece.
const fs = require('node:fs');

// Vertices this close (in metres) are the same vertex: Blender splits a mesh's vertices along UV and normal seams,
// and a model built as one continuous surface is still one piece once those copies are welded back together.
const WELD = 1e-4;
// Overlap shallower than this (metres) is touching, not passing inside: a piece resting on another, flush faces,
// rounding in the export. Deeper than this, one surface runs inside the other.
const TOUCH = 0.002;
// Surface samples are spread about this far apart (metres), at most SAMPLE_CAP per triangle edge.
const SAMPLE_STEP = 0.01;
const SAMPLE_CAP = 64;

const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** The JSON and binary chunks of a .glb file. */
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a binary glTF`);
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLength).toString('utf8'));
  const binAt = 20 + jsonLength;
  const bin = binAt + 8 <= b.length ? b.subarray(binAt + 8, binAt + 8 + b.readUInt32LE(binAt)) : Buffer.alloc(0);
  const unread = (json.extensionsRequired || []).filter((e) => e !== 'KHR_materials_emissive_strength');
  if (unread.length) throw new Error(`${file}: needs ${unread.join(', ')}, which this check cannot read`);
  return { json, bin };
}

/** An accessor's values as plain numbers, `width` per element. */
function accessor(gltf, index) {
  const { json, bin } = gltf;
  const a = json.accessors[index];
  if (a.sparse) throw new Error('sparse accessors are not supported');
  const Type = COMPONENTS[a.componentType];
  const width = WIDTH[a.type];
  const view = json.bufferViews[a.bufferView];
  const start = bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || width * Type.BYTES_PER_ELEMENT;
  const out = new Float64Array(a.count * width);
  const data = new DataView(bin.buffer);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < width; k++) out[i * width + k] = data[get](start + i * stride + k * Type.BYTES_PER_ELEMENT, true);
  }
  return out;
}

/** Column-major 4x4 matrix of a node's local transform. */
function localMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

/**
 * Every mesh node of a .glb with its triangles in the rest pose (flat xyz triples, three vertices per triangle),
 * its name and the chain of node names from the scene root down to it.
 */
function meshNodes(file) {
  const gltf = readGlb(file);
  const { json } = gltf;
  const out = [];
  const visit = (index, parent, chain) => {
    const node = json.nodes[index];
    const world = multiply(parent, localMatrix(node));
    const names = [...chain, node.name || `node${index}`];
    if (node.mesh !== undefined) {
      const tris = [];
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const pos = accessor(gltf, prim.attributes.POSITION);
        const count = pos.length / 3;
        const idx = prim.indices !== undefined ? accessor(gltf, prim.indices) : Float64Array.from({ length: count }, (_, i) => i);
        for (const i of idx) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          tris.push(world[0] * x + world[4] * y + world[8] * z + world[12],
            world[1] * x + world[5] * y + world[9] * z + world[13],
            world[2] * x + world[6] * y + world[10] * z + world[14]);
        }
      }
      out.push({ name: names[names.length - 1], chain: names, tris: Float64Array.from(tris) });
    }
    for (const child of node.children || []) visit(child, world, names);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of json.scenes[json.scene || 0].nodes) visit(root, identity, []);
  return out;
}

/**
 * Splits triangles (from any number of meshes, each `{ name, tris }`) into connected pieces: triangles that share
 * a welded vertex belong together. Each piece has its triangles, the names of the meshes it came from, its bounds
 * and whether it is closed (every edge shared by exactly two of its triangles), so it has an inside.
 */
function pieces(meshes, weld = WELD) {
  const verts = [];
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const vertexOf = (x, y, z) => {
    const cx = Math.round(x / weld), cy = Math.round(y / weld), cz = Math.round(z / weld);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const v of cells.get(key(cx + dx, cy + dy, cz + dz)) || []) {
        if (Math.abs(verts[v * 3] - x) <= weld && Math.abs(verts[v * 3 + 1] - y) <= weld && Math.abs(verts[v * 3 + 2] - z) <= weld) return v;
      }
    }
    const v = verts.length / 3;
    verts.push(x, y, z);
    const k = key(cx, cy, cz);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(v);
    return v;
  };
  const tris = [];
  for (const [m, mesh] of meshes.entries()) {
    for (let t = 0; t < mesh.tris.length; t += 9) {
      const a = vertexOf(mesh.tris[t], mesh.tris[t + 1], mesh.tris[t + 2]);
      const b = vertexOf(mesh.tris[t + 3], mesh.tris[t + 4], mesh.tris[t + 5]);
      const c = vertexOf(mesh.tris[t + 6], mesh.tris[t + 7], mesh.tris[t + 8]);
      if (a !== b && b !== c && c !== a) tris.push([a, b, c, m]);
    }
  }
  const parent = Array.from({ length: verts.length / 3 }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (const [a, b, c] of tris) { parent[find(b)] = find(a); parent[find(c)] = find(a); }
  const byRoot = new Map();
  for (const t of tris) {
    const r = find(t[0]);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(t);
  }
  return [...byRoot.values()].map((list) => {
    const flat = new Float64Array(list.length * 9);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const edges = new Map();
    const names = new Set();
    list.forEach(([a, b, c, m], i) => {
      names.add(meshes[m].name);
      [a, b, c].forEach((v, k) => {
        for (let d = 0; d < 3; d++) {
          const x = verts[v * 3 + d];
          flat[i * 9 + k * 3 + d] = x;
          if (x < min[d]) min[d] = x;
          if (x > max[d]) max[d] = x;
        }
      });
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const e = p < q ? `${p}_${q}` : `${q}_${p}`;
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    });
    const closed = [...edges.values()].every((n) => n === 2);
    return { tris: flat, names: [...names], min, max, closed };
  });
}

/**
 * A piece's triangles bucketed by where they fall seen along `axis`, so a line along that axis meets only the few
 * in its cell. Cached on the piece.
 */
function columns(piece, axis) {
  piece.columns ||= [];
  if (piece.columns[axis]) return piece.columns[axis];
  const u = (axis + 1) % 3, v = (axis + 2) % 3;
  const n = piece.tris.length / 9;
  const size = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(n))));
  const u0 = piece.min[u], v0 = piece.min[v];
  const su = size / Math.max(piece.max[u] - u0, 1e-9), sv = size / Math.max(piece.max[v] - v0, 1e-9);
  const cell = (x, s, x0) => Math.max(0, Math.min(size - 1, Math.floor((x - x0) * s)));
  const cells = Array.from({ length: size * size }, () => []);
  const t = piece.tris;
  for (let i = 0; i < t.length; i += 9) {
    const iu0 = cell(Math.min(t[i + u], t[i + 3 + u], t[i + 6 + u]), su, u0), iu1 = cell(Math.max(t[i + u], t[i + 3 + u], t[i + 6 + u]), su, u0);
    const iv0 = cell(Math.min(t[i + v], t[i + 3 + v], t[i + 6 + v]), sv, v0), iv1 = cell(Math.max(t[i + v], t[i + 3 + v], t[i + 6 + v]), sv, v0);
    for (let a = iu0; a <= iu1; a++) for (let b = iv0; b <= iv1; b++) cells[a * size + b].push(i);
  }
  return (piece.columns[axis] = { u, v, size, u0, v0, su, sv, cells, cell });
}

/**
 * Signed area test of 2D point (pu, pv) against edge (au, av)->(bu, bv), evaluated from the edge's lower endpoint
 * so the two triangles sharing an edge get exactly opposite values; a point on the edge counts for one side only.
 */
function edgeSide(au, av, bu, bv, pu, pv) {
  let s;
  if (au < bu || (au === bu && av <= bv)) s = (bu - au) * (pv - av) - (bv - av) * (pu - au);
  else s = -((au - bu) * (pv - bv) - (av - bv) * (pu - bu));
  if (s !== 0) return s;
  // On the edge: it belongs to the triangle that runs it downward (or leftward when level), never both.
  return bv < av || (bv === av && bu < au) ? Number.MIN_VALUE : -Number.MIN_VALUE;
}

/** Whether the ray from p along +axis crosses the piece's surface an odd number of times. */
function oddCrossings(piece, axis, p) {
  const g = columns(piece, axis);
  const { u, v } = g;
  const pu = p[u], pv = p[v];
  if (pu < piece.min[u] || pu > piece.max[u] || pv < piece.min[v] || pv > piece.max[v]) return false;
  const t = piece.tris;
  let odd = false;
  for (const i of g.cells[g.cell(pu, g.su, g.u0) * g.size + g.cell(pv, g.sv, g.v0)]) {
    const au = t[i + u], av = t[i + v], ad = t[i + axis];
    let bu = t[i + 3 + u], bv = t[i + 3 + v], bd = t[i + 3 + axis];
    let cu = t[i + 6 + u], cv = t[i + 6 + v], cd = t[i + 6 + axis];
    if ((pu < au && pu < bu && pu < cu) || (pu > au && pu > bu && pu > cu)) continue;
    if ((pv < av && pv < bv && pv < cv) || (pv > av && pv > bv && pv > cv)) continue;
    const area = (bu - au) * (cv - av) - (bv - av) * (cu - au);
    if (area === 0) continue;
    if (area < 0) {
      // Wind it anticlockwise as seen down the axis.
      const su = bu, sv = bv, sd = bd;
      bu = cu; bv = cv; bd = cd; cu = su; cv = sv; cd = sd;
    }
    const wa = edgeSide(bu, bv, cu, cv, pu, pv);
    if (wa <= 0) continue;
    const wb = edgeSide(cu, cv, au, av, pu, pv);
    if (wb <= 0) continue;
    const wc = edgeSide(au, av, bu, bv, pu, pv);
    if (wc <= 0) continue;
    if ((wa * ad + wb * bd + wc * cd) / (wa + wb + wc) > p[axis]) odd = !odd;
  }
  return odd;
}

/** Whether point p is inside closed piece: rays along all three axes, by majority, so one grazing ray can't decide. */
function inside(piece, p) {
  const x = oddCrossings(piece, 0, p), y = oddCrossings(piece, 1, p);
  return x === y ? x : oddCrossings(piece, 2, p);
}

/** Squared distance from p to the triangle at `t` in `tris` (closest point by region, after Ericson). */
function triangleDistance2(tris, t, px, py, pz) {
  const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
  const abx = tris[t + 3] - ax, aby = tris[t + 4] - ay, abz = tris[t + 5] - az;
  const acx = tris[t + 6] - ax, acy = tris[t + 7] - ay, acz = tris[t + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let u = 0, v = 0;
  if (d1 <= 0 && d2 <= 0) { u = 0; v = 0; } else {
    const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) { u = 1; v = 0; }
    else if (d6 >= 0 && d5 <= d6) { u = 0; v = 1; }
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); v = 0; }
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; v = d2 / (d2 - d6); }
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 1 - w; v = w; }
    else { const s = 1 / (va + vb + vc); u = vb * s; v = vc * s; }
  }
  const qx = apx - abx * u - acx * v, qy = apy - aby * u - acy * v, qz = apz - abz * u - acz * v;
  return qx * qx + qy * qy + qz * qz;
}

/** Distance from p to the surface in `tris`, or any value no more than `floor` once it is known to be that close. */
function surfaceDistance(tris, px, py, pz, floor) {
  const stop = floor * floor;
  let best = Infinity;
  for (let t = 0; t < tris.length && best > stop; t += 9) best = Math.min(best, triangleDistance2(tris, t, px, py, pz));
  return Math.sqrt(best);
}

/** Distance between the vertices at j and k in `t`. (A square root, not Math.hypot: it rounds the same on every
 * machine, so the depths do too.) */
function edgeLength(t, j, k) {
  const dx = t[k] - t[j], dy = t[k + 1] - t[j + 1], dz = t[k + 2] - t[j + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * How deep piece `a`'s surface runs inside closed piece `b` (metres; 0 when it stays outside or only touches).
 * Points spread over a's triangles are tested inside/outside b by ray parity; an inside point's depth is its
 * distance to b's surface.
 */
function depthInside(a, b, touch = TOUCH) {
  if (!b.closed) return 0;
  const lo = b.min.map((x) => x + touch), hi = b.max.map((x) => x - touch);
  if (lo.some((x, d) => x >= hi[d] || a.max[d] <= x || a.min[d] >= hi[d])) return 0;
  let deepest = touch;
  const pt = [0, 0, 0];
  const t = a.tris;
  for (let i = 0; i < t.length; i += 9) {
    let outside = false;
    for (let d = 0; d < 3 && !outside; d++) {
      const m = Math.min(t[i + d], t[i + 3 + d], t[i + 6 + d]), M = Math.max(t[i + d], t[i + 3 + d], t[i + 6 + d]);
      outside = M <= lo[d] || m >= hi[d];
    }
    if (outside) continue;
    const longest = Math.max(edgeLength(t, i, i + 3), edgeLength(t, i, i + 6), edgeLength(t, i + 3, i + 6));
    const n = Math.min(SAMPLE_CAP, Math.max(1, Math.ceil(longest / SAMPLE_STEP)));
    for (let p = 0; p <= n; p++) for (let q = 0; q <= n - p; q++) {
      // A lattice over the triangle: its inner points shifted a third of a step off the grid (so they don't land on
      // the edges of a flush neighbour's triangles), its last row along the far edge.
      const u = (p + (p + q < n ? 1 / 3 : 0)) / n, v = (q + (p + q < n ? 1 / 3 : 0)) / n;
      const x = t[i] + (t[i + 3] - t[i]) * u + (t[i + 6] - t[i]) * v;
      const y = t[i + 1] + (t[i + 4] - t[i + 1]) * u + (t[i + 7] - t[i + 1]) * v;
      const z = t[i + 2] + (t[i + 5] - t[i + 2]) * u + (t[i + 8] - t[i + 2]) * v;
      if (x <= lo[0] || x >= hi[0] || y <= lo[1] || y >= hi[1] || z <= lo[2] || z >= hi[2]) continue;
      // Inside b, the point is no further from b's surface than from b's bounds, so it can only beat `deepest`
      // if its bounds are further than that.
      const room = Math.min(x - b.min[0], b.max[0] - x, y - b.min[1], b.max[1] - y, z - b.min[2], b.max[2] - z);
      if (room <= deepest) continue;
      pt[0] = x; pt[1] = y; pt[2] = z;
      if (!inside(b, pt)) continue;
      const depth = surfaceDistance(b.tris, x, y, z, deepest);
      if (depth > deepest) deepest = depth;
    }
  }
  return deepest > touch ? deepest : 0;
}

module.exports = { TOUCH, meshNodes, pieces, oddCrossings, depthInside };
