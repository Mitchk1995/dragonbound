import * as THREE from 'three';
import { ZONES, type ZoneDef } from '../data/zones';
import type { Enemy, PackState } from '../entities/enemy';
import type { GroundItem } from '../entities/groundItem';
import { Interactable } from '../entities/interactable';
import type { Projectile } from '../entities/projectile';
import type { Telegraph } from '../fx/telegraph';
import type { Game } from '../game';
import type { Hazard } from '../systems/combat';
import type { ZoneLayout } from './layout';
import { NavGrid } from './navgrid';
import { buildWorldView, type WorldView } from './worldView';

/**
 * One live instance of a zone. Every portal trip builds a fresh instance and disposes the
 * old one, which is what makes "cleared stays cleared until you leave" work.
 */
export class ZoneRuntime {
  readonly def: ZoneDef;
  readonly layout: ZoneLayout;
  readonly nav: NavGrid;
  readonly group = new THREE.Group();
  readonly view: WorldView;
  enemies: Enemy[] = [];
  items: GroundItem[] = [];
  projectiles: Projectile[] = [];
  telegraphs: Telegraph[] = [];
  hazards: Hazard[] = [];
  interactables: Interactable[] = [];
  packs: PackState[] = [];
  arena: { x: number; z: number; r: number } | null = null;
  readonly enteredAt: number;

  constructor(private g: Game, id: string, seed: number) {
    this.def = ZONES[id];
    this.layout = this.def.build(seed);
    this.nav = new NavGrid(this.layout.w, this.layout.h, this.layout.cells);
    this.view = buildWorldView(this.layout, this.def.theme, seed + 7);
    this.group.add(this.view.group);
    this.enteredAt = g.time;
  }

  /** Spawn everything; called after the zone is registered on the game. */
  populate() {
    const g = this.g, L = this.layout;
    for (const n of L.nodes) this.addInteractable(new Interactable('rock', n.ore, n.x, n.z, Math.random() * 6));
    for (const s of L.stations) {
      const arg = this.stationArg(s.kind, s.id);
      const it = new Interactable(s.kind, s.id, s.x, s.z, s.rot ?? 0, arg);
      if (s.kind === 'portal') it.state = arg ? 'lit' : 'dark';
      this.addInteractable(it);
    }
    this.refreshStations();
    for (const p of L.packs) {
      const pack: PackState = { x: p.x, z: p.z, comp: p.comp, members: [], respawnT: 0 };
      this.packs.push(pack);
      g.combat.spawnPack(pack);
    }
    if (L.boss) {
      this.arena = { x: L.boss.x, z: L.boss.z + 2, r: L.boss.r };
      const b = g.combat.spawnEnemy(L.boss.id, L.boss.x, L.boss.z, null);
      b.faceTo(L.boss.x, L.boss.z + 10, true);
    }
  }

  private addInteractable(it: Interactable) {
    this.interactables.push(it);
    this.group.add(it.obj);
  }

  private stationArg(kind: string, id: string) {
    if (kind === 'exit') return 0x9ab8ff;
    if (kind === 'portal') return this.g.story.portalState(id).open ? ZONES[id]?.arch ?? 0xffffff : null;
    return undefined;
  }

  /** Re-sync station visuals with save state (lit arches, restored halls, taken fragments, open gate). */
  refreshStations() {
    const s = this.g.save;
    for (const it of [...this.interactables]) {
      if (it.kind === 'portal') {
        const lit = this.g.story.portalState(it.id).open;
        if (lit !== (it.state === 'lit')) {
          // Rebuild the arch so the swirl and light match.
          it.obj.removeFromParent();
          const fresh = new Interactable('portal', it.id, it.x, it.z, it.obj.rotation.y, this.stationArg('portal', it.id));
          fresh.state = lit ? 'lit' : 'dark';
          this.interactables[this.interactables.indexOf(it)] = fresh;
          this.group.add(fresh.obj);
        }
      } else if (it.kind === 'restore' && it.id !== 'board') {
        it.setState(s.keep[it.id] ? 'restored' : 'ruined');
      } else if (it.kind === 'chest') {
        it.setState(s.keep.mine_chest ? 'restored' : 'none');
      } else if (it.kind === 'pedestal') {
        it.setState(s.counters[`frag${it.id}`] ? 'taken' : 'full');
      } else if (it.kind === 'gate') {
        it.setState(s.quests.cinder_seal?.done ? 'open' : 'sealed');
      }
    }
  }

  update(dt: number) {
    const p = this.g.player;
    for (const it of this.interactables) it.update(dt, it.kind === 'npc' && p.distTo(it) < 6 ? p.x : undefined, p.z);
    for (const f of this.view.followers) f.position.set(p.x, 0, p.z);
    this.view.tick(this.g.time);
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}
