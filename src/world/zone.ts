import * as THREE from 'three';
import { disposeObject } from '../render/resources';
import { KEEP_ARCHES, ZONES, type ZoneDef } from '../data/zones';
import type { PortalSpec } from './portalFx';
import type { Enemy, PackState } from '../entities/enemy';
import type { GroundItem } from '../entities/groundItem';
import { Interactable } from '../entities/interactable';
import type { Projectile } from '../entities/projectile';
import type { Telegraph } from '../fx/telegraph';
import type { Game } from '../game';
import type { Hazard } from '../systems/combat';
import type { ZoneLayout } from './layout';
import type { BuildingProp } from './buildingModel';
import { stairDest, type BuildingSpec, type Floor } from './building';
import { NavGrid } from './navgrid';
import { buildWorldView, type WorldView } from './worldView';

/** How fast a roof lifts off / settles back (fraction per second). */
const CUT_SPEED = 4;

/**
 * One live instance of a zone. Every portal trip builds a fresh instance and disposes the
 * old one, which is what makes "cleared stays cleared until you leave" work.
 */
export class ZoneRuntime {
  readonly def: ZoneDef;
  readonly layout: ZoneLayout;
  private readonly groundNav: NavGrid;
  private readonly upperNav: NavGrid | null;
  floor: Floor = 0;
  private floorBuilding: BuildingSpec | null = null;
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
  private cut = new Map<BuildingProp, number>();

  constructor(private g: Game, id: string, seed: number) {
    this.def = ZONES[id];
    this.layout = this.def.build(seed);
    this.groundNav = new NavGrid(this.layout.w, this.layout.h, this.layout.cells);
    this.upperNav = this.layout.upper ? new NavGrid(this.layout.w, this.layout.h, this.layout.upper) : null;
    this.view = buildWorldView(this.layout, this.def.theme, seed + 7);
    this.groundNav.y = (x, z) => this.view.floorAt(x, z);
    if (this.upperNav) this.upperNav.y = (x, z) => this.groundY(x, z);
    this.group.add(this.view.group);
    this.enteredAt = g.time;
  }

  /** Movement and collision always use the floor the player can see. */
  get nav() {
    return this.floor && this.upperNav ? this.upperNav : this.groundNav;
  }

  /** Height of the floor the player can see at a point: the ground level, or the upper floor of the building. */
  groundY(x: number, z: number) {
    const b = this.floor ? this.floorBuilding : null;
    return b ? this.view.floorAt(b.x + b.w / 2, b.z + b.d / 2) + (b.storeyH ?? 0) : this.view.floorAt(x, z);
  }

  stairAt(x: number, z: number) {
    if (!this.nav.isWalkable(x, z)) return null;
    for (const building of this.layout.buildings ?? []) {
      if (this.floor && building !== this.floorBuilding) continue;
      const dest = stairDest(building, x, z, this.floor);
      if (dest) return { ...dest, building };
    }
    return null;
  }

  /** Floor changes retain this zone, its stations and its restoration state. */
  setFloor(floor: Floor, building?: BuildingSpec) {
    if (floor && (!this.upperNav || !building?.upper || !building.storeyH || !this.layout.buildings?.includes(building))) return false;
    this.floor = floor;
    this.floorBuilding = floor ? building! : null;
    for (const it of this.interactables) it.obj.visible = floor === 0;
    for (const it of this.items) it.group.visible = floor === 0;
    return true;
  }

  /** Spawn everything; called after the zone is registered on the game. */
  populate() {
    const g = this.g, L = this.layout;
    for (const n of L.nodes) {
      const rock = new Interactable('rock', n.ore, n.x, n.z, Math.random() * 6);
      rock.obj.position.y = this.view.floorAt(n.x, n.z);
      this.addInteractable(rock);
    }
    for (const s of L.stations) {
      const arg = this.stationArg(s.kind, s.id);
      const it = new Interactable(s.kind, s.id, s.x, s.z, s.rot ?? 0, arg);
      it.obj.position.y = this.view.floorAt(s.x, s.z);
      if (s.kind === 'portal') it.state = arg?.color != null ? 'lit' : 'dark';
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

  private stationArg(kind: string, id: string): PortalSpec | undefined {
    if (kind === 'exit') return { dest: 'keep', name: ZONES.keep.name, color: 0x5a8aff, theme: ZONES.keep.theme };
    if (kind === 'portal') {
      const dest = ZONES[id], dormant = KEEP_ARCHES.find((a) => a.id === id)?.dormant;
      const open = this.g.story.portalState(id).open;
      return {
        dest: id, theme: dest?.theme, color: open ? dest?.arch ?? 0xffffff : null,
        name: dest?.name ?? dormant?.split(':')[0] ?? id[0].toUpperCase() + id.slice(1),
        hint: dormant?.split(':')[1]?.trim() ?? 'Sealed',
      };
    }
    return undefined;
  }

  /** Re-sync station visuals with save state (lit arches, restored halls, taken fragments, open gate). */
  refreshStations() {
    const s = this.g.save;
    for (const b of this.view.buildings) if (b.spec.restore) b.setState?.(s.keep[b.spec.restore] ? 'restored' : 'ruined');
    for (const it of [...this.interactables]) {
      if (it.kind === 'portal') {
        const lit = this.g.story.portalState(it.id).open;
        if (lit !== (it.state === 'lit')) {
          // Rebuild the arch so the swirl and light match.
          disposeObject(it.obj);
          const fresh = new Interactable('portal', it.id, it.x, it.z, it.obj.rotation.y, this.stationArg('portal', it.id));
          fresh.obj.position.y = it.obj.position.y;
          fresh.state = lit ? 'lit' : 'dark';
          this.interactables[this.interactables.indexOf(it)] = fresh;
          this.group.add(fresh.obj);
        }
      } else if (it.kind === 'restore' && it.id !== 'board') {
        it.setState(s.keep[it.id] ? 'restored' : 'ruined');
      } else if (it.kind === 'anvil') {
        it.setState(s.keep.anvil_reforged ? 'restored' : 'ruined');
      } else if (it.kind === 'chest') {
        it.setState(s.keep.mine_chest ? 'restored' : 'none');
      } else if (it.kind === 'pedestal') {
        it.setState(s.counters[`frag${it.id}`] ? 'taken' : 'full');
      } else if (it.kind === 'gate') {
        it.setState(s.quests.cinder_seal?.done ? 'open' : 'sealed');
      }
    }
  }

  /** How far the roof is off the building the hero stands in (0 outdoors .. 1 inside). */
  get indoors() {
    let k = 0;
    for (const v of this.cut.values()) k = Math.max(k, v);
    return k;
  }

  update(dt: number) {
    const p = this.g.player;
    for (const it of this.interactables) it.update(dt, it.kind === 'npc' && p.distTo(it) < 6 ? p.x : undefined, p.z);
    for (const f of this.view.followers) f.position.set(p.x, 0, p.z);
    // Roofs lift off the building the hero is standing in (instantly while time is frozen).
    const play = this.g.mode === 'play';
    for (const b of this.view.buildings) {
      const want = play && b.contains(p.x, p.z) ? 1 : 0;
      const cur = this.cut.get(b) ?? 0;
      const next = dt > 0 ? cur + Math.sign(want - cur) * Math.min(Math.abs(want - cur), dt * CUT_SPEED) : want;
      this.cut.set(b, next);
      b.setCut(next, b.spec === this.floorBuilding ? this.floor : 0);
      b.tick?.(this.g.time);
    }
    for (const pr of this.view.props) pr.tick?.(this.g.time);
    this.view.tick(this.g.time);
  }

  dispose() {
    disposeObject(this.group);
    this.cut.clear();
  }
}
