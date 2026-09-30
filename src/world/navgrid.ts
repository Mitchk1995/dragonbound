import type { Vec2 } from '../types';

/** Walkability grid with 1-unit cells, A* pathfinding and circle collision. */
export class NavGrid {
  constructor(public w: number, public h: number, public blocked: Uint8Array) {}

  isBlocked(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return true;
    return this.blocked[cz * this.w + cx] !== 0;
  }

  isWalkable(x: number, z: number): boolean {
    return !this.isBlocked(Math.floor(x), Math.floor(z));
  }

  /** True if a circle of radius r can travel in a straight line from a to b. */
  lineClear(ax: number, az: number, bx: number, bz: number, r = 0.3): boolean {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / 0.25);
    const nx = -(bz - az) / (dist || 1), nz = (bx - ax) / (dist || 1);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (!this.isWalkable(x, z)) return false;
      if (r > 0 && (!this.isWalkable(x + nx * r, z + nz * r) || !this.isWalkable(x - nx * r, z - nz * r))) return false;
    }
    return true;
  }

  /** Closest walkable cell centre to a point, searching outward in rings. */
  nearestWalkable(x: number, z: number, maxR = 8): Vec2 | null {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!this.isBlocked(cx, cz)) return { x, z };
    for (let r = 1; r <= maxR; r++) {
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.isBlocked(cx + dx, cz + dz)) continue;
          const px = cx + dx + 0.5, pz = cz + dz + 0.5;
          const d = Math.hypot(px - x, pz - z);
          if (d < bestD) {
            bestD = d;
            best = { x: px, z: pz };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** A* over 8-connected cells (no corner cutting), then string-pulled. Returns waypoints excluding the start. */
  findPath(sx: number, sz: number, tx: number, tz: number, maxNodes = 6000): Vec2[] | null {
    const target = this.nearestWalkable(tx, tz);
    if (!target) return null;
    if (this.lineClear(sx, sz, target.x, target.z)) return [target];

    const w = this.w;
    const start = Math.floor(sz) * w + Math.floor(sx);
    const goal = Math.floor(target.z) * w + Math.floor(target.x);
    const gx = goal % w, gz = Math.floor(goal / w);
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const heap = new MinHeap();
    const hfn = (i: number) => {
      const dx = Math.abs((i % w) - gx), dz = Math.abs(Math.floor(i / w) - gz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    g.set(start, 0);
    heap.push(start, hfn(start));
    const closed = new Set<number>();
    let expanded = 0;
    let found = false;

    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (++expanded > maxNodes) break;
      const cx = cur % w, cz = Math.floor(cur / w);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (this.isBlocked(nx, nz)) continue;
          if (dx && dz && (this.isBlocked(cx + dx, cz) || this.isBlocked(cx, cz + dz))) continue;
          const ni = nz * w + nx;
          const ng = g.get(cur)! + (dx && dz ? 1.414 : 1);
          if (ng < (g.get(ni) ?? Infinity)) {
            g.set(ni, ng);
            came.set(ni, cur);
            heap.push(ni, ng + hfn(ni));
          }
        }
      }
    }
    if (!found) return null;

    const cellsPath: Vec2[] = [];
    for (let c: number | undefined = goal; c !== undefined && c !== start; c = came.get(c)) {
      cellsPath.push({ x: (c % w) + 0.5, z: Math.floor(c / w) + 0.5 });
    }
    cellsPath.reverse();
    cellsPath[cellsPath.length - 1] = target;
    return this.smooth(sx, sz, cellsPath);
  }

  private smooth(sx: number, sz: number, pts: Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    let ax = sx, az = sz;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineClear(ax, az, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      ax = pts[j].x;
      az = pts[j].z;
      i = j + 1;
    }
    return out;
  }

  /** Push a circle out of any blocked cells it overlaps. Mutates and returns pos. */
  resolveCircle(pos: { x: number; z: number }, r: number) {
    for (let iter = 0; iter < 2; iter++) {
      const x0 = Math.floor(pos.x - r), x1 = Math.floor(pos.x + r);
      const z0 = Math.floor(pos.z - r), z1 = Math.floor(pos.z + r);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (!this.isBlocked(cx, cz)) continue;
          const nx = Math.max(cx, Math.min(pos.x, cx + 1));
          const nz = Math.max(cz, Math.min(pos.z, cz + 1));
          let dx = pos.x - nx, dz = pos.z - nz;
          const d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-5) {
            // Centre is inside the cell: push out along the shortest axis.
            const left = pos.x - cx, right = cx + 1 - pos.x, down = pos.z - cz, up = cz + 1 - pos.z;
            const m = Math.min(left, right, down, up);
            if (m === left) pos.x = cx - r;
            else if (m === right) pos.x = cx + 1 + r;
            else if (m === down) pos.z = cz - r;
            else pos.z = cz + 1 + r;
            continue;
          }
          dx /= d;
          dz /= d;
          pos.x = nx + dx * r;
          pos.z = nz + dz * r;
        }
      }
    }
    return pos;
  }
}

class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, prio: number) {
    this.items.push(item);
    this.prios.push(prio);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p] <= this.prios[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!;
    const lastP = this.prios.pop()!;
    if (this.items.length) {
      this.items[0] = lastI;
      this.prios[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.prios[l] < this.prios[m]) m = l;
        if (r < this.items.length && this.prios[r] < this.prios[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
  }
}
