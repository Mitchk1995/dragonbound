import * as THREE from 'three';
import { ORES } from '../data/ores';
import { RESTORATION_BY_ID } from '../data/keep';
import type { StationKind } from '../world/layout';
import { buildProp, type Prop } from '../world/props';
import { makeModel } from '../render/registry';
import { Rig, newAnimState } from '../render/anim';

export type InteractKind = StationKind | 'rock';

const NPC_NAMES: Record<string, string> = { warden: 'The Warden', quartermaster: 'Quartermaster Bram' };

/**
 * Anything the player clicks to use: ore rocks, stations, portals, NPCs.
 * The player walks to within `reach` and the Story/Skilling systems take over.
 */
export class Interactable {
  readonly obj = new THREE.Group();
  prop: Prop | null = null;
  state = 'full';
  respawnTicks = 0;
  /** How close the player must stand to use it. */
  reach: number;
  /** Hover-pick radius and label height. */
  radius: number;
  height: number;
  private rig: Rig | null = null;
  private anim = newAnimState();
  private t = Math.random() * 10;

  constructor(public kind: InteractKind, public id: string, public x: number, public z: number, rot = 0, arg?: any) {
    this.obj.position.set(x, 0, z);
    this.obj.rotation.y = rot;
    this.reach = 1.6;
    this.radius = 1;
    this.height = 1.6;
    if (kind === 'rock') {
      this.prop = buildProp(`rock_${id}`, ORES[id].color);
      this.reach = 1.5;
      this.radius = 0.8;
      this.height = 1.3;
    } else if (kind === 'npc') {
      const m = makeModel(id);
      this.obj.add(m.root);
      this.rig = new Rig(m.root);
      this.reach = 2.2;
      this.radius = 0.8;
      this.height = m.height + 0.3;
    } else {
      const propKind: Record<string, string> = {
        portal: 'arch', exit: 'arch', bank: 'bank', furnace: 'furnace', anvil: 'anvil', shop: 'shop', chest: 'chest', gate: 'gate', pedestal: 'pedestal',
      };
      let pk = propKind[kind] ?? 'ruin';
      if (kind === 'restore') pk = id === 'board' ? 'board' : id === 'emberforge' ? 'forgeheart' : 'ruin';
      this.prop = buildProp(pk, arg);
      const sizes: Partial<Record<StationKind, [number, number, number]>> = {
        portal: [2.2, 1.6, 4.2], exit: [2.2, 1.6, 4.2], bank: [3.4, 2.2, 3.6], furnace: [2.6, 1.6, 3.4], anvil: [1.8, 0.9, 1.4],
        shop: [2.8, 1.8, 3], chest: [1.6, 0.7, 1.2], gate: [3.6, 2.5, 5.5], pedestal: [1.6, 0.6, 1.6], restore: [3.6, 2.5, 3.5],
      };
      const [reach, radius, height] = sizes[kind] ?? [2, 1.5, 2];
      this.reach = reach;
      this.radius = radius;
      this.height = height;
      if (kind === 'restore' && id === 'board') {
        this.reach = 1.8;
        this.radius = 1;
        this.height = 2.4;
      }
    }
    if (this.prop) this.obj.add(this.prop.obj);
  }

  get name(): string {
    switch (this.kind) {
      case 'rock':
        return ORES[this.id].name;
      case 'npc':
        return NPC_NAMES[this.id] ?? this.id;
      case 'restore':
        return this.id === 'board' ? 'Restoration Board' : RESTORATION_BY_ID[this.id]?.name ?? 'Ruin';
      case 'portal':
        return 'Portal arch';
      case 'exit':
        return 'Return portal';
      case 'bank':
        return 'Bank vault';
      case 'chest':
        return 'Deposit chest';
      case 'furnace':
        return 'Furnace';
      case 'anvil':
        return 'Anvil';
      case 'shop':
        return "Quartermaster's stall";
      case 'gate':
        return 'Sealed gate';
      case 'pedestal':
        return 'Seal pedestal';
    }
  }

  /** Verb shown on hover, OSRS-style ("Mine", "Talk-to"…). */
  get verb(): string {
    return ({ rock: 'Mine', npc: 'Talk-to', portal: 'Enter', exit: 'Return', bank: 'Bank', chest: 'Deposit', furnace: 'Smelt', anvil: 'Smith', shop: 'Trade', restore: 'Inspect', gate: 'Open', pedestal: 'Search' } as Record<string, string>)[this.kind] ?? 'Use';
  }

  setState(state: string) {
    this.state = state;
    this.prop?.setState?.(state);
  }

  deplete(ticks: number) {
    this.respawnTicks = ticks;
    this.setState('depleted');
  }

  update(dt: number, faceX?: number, faceZ?: number) {
    this.t += dt;
    this.prop?.tick?.(this.t);
    if (this.rig) {
      if (faceX !== undefined && faceZ !== undefined) {
        const target = Math.atan2(faceX - this.x, faceZ - this.z);
        let d = target - this.obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.obj.rotation.y += d * Math.min(1, dt * 3);
      }
      this.rig.update(dt, this.anim);
    }
  }
}
