import * as THREE from 'three';
import { ZONES } from '../data/zones';
import type { Game } from '../game';
import { ZoneRuntime } from '../world/zone';

/** Swap in a fresh instance of a zone: the old one is discarded with its effects and labels. */
export function enterZone(g: Game, id: string) {
  g.fx.clear();
  if (g.zoneOrNull) g.zoneOrNull.dispose();
  g.particles.clear();
  g.glow.clear();
  g.text.clear();
  g.ui.clearZoneState();
  const seed = id === 'keep' || id === 'foothills' || id === 'mine' || id === 'ruin' || id === 'lair' ? 1000 + id.length * 97 : Math.floor(Math.random() * 1e6);
  const z = new ZoneRuntime(g, id, seed);
  g.zoneOrNull = z;
  g.scene.add(z.group);
  z.populate();
  const t = z.def.theme;
  const fog = g.scene.fog as THREE.Fog;
  g.scene.background = new THREE.Color(t.bg);
  fog.color.setHex(t.bg);
  fog.near = t.fog[0];
  fog.far = t.fog[1];
  g.relight();
  g.hovered = null;
  g.hoveredItem = null;
  g.hoveredThing = null;
  g.ui.showBoss(null);
}

/** Portal travel with a fade. Leaving a zone discards it; the next visit is a fresh instance. */
export function travel(g: Game, id: string, instant: boolean) {
  if (g.traveling) return;
  const go = () => {
    g.skilling.stop();
    enterZone(g, id);
    const e = g.zone.layout.entry;
    const p = g.player;
    p.pos.set(e.x, 0, e.z);
    p.stop();
    p.queued = null;
    p.dash = null;
    p.action = null;
    p.kbx = p.kbz = 0;
    p.faceTo(e.x, e.z - 10, true);
    g.camPos.copy(p.pos);
    if (g.pet) g.pet.pos.set(e.x + 1, 0, e.z + 1);
    if (id === 'keep') {
      g.save.potions = g.save.potionMax;
      p.hp = Math.max(p.hp, g.stats.maxHp * 0.5);
    }
    g.fx.teleport(e.x, e.z);
    g.prog.recomputeStats();
    g.story.onEnterZone(id);
    g.ui.zoneTitle(ZONES[id].name);
    g.dirty = true;
  };
  if (instant) {
    go();
    return;
  }
  g.traveling = true;
  g.sfx.play('frost', 0.6, 0.7);
  g.ui.fade(() => {
    go();
    g.traveling = false;
  });
}

/** Step onto a tower stair to change floors, emerging outside the other landing's trigger. */
export function tryStairs(g: Game, dt: number) {
  const p = g.player, zone = g.zone;
  if (dt <= 0 || g.traveling || p.dead || p.rooted) return;
  const dest = zone.stairAt(p.x, p.z);
  if (!dest) return;
  p.stop();
  g.skilling.stop();
  g.mouse.down = false;
  g.mouse.mode = 'none';
  g.traveling = true;
  g.ui.fade(() => {
    // A portal trip or a new game must never apply a landing from the zone we left.
    if (g.zone === zone && zone.setFloor(dest.floor, dest.building)) {
      p.pos.set(dest.x, dest.y, dest.z);
      p.queued = null;
      p.kbx = p.kbz = 0;
      g.camPos.copy(p.pos);
      g.hovered = g.hoveredItem = g.hoveredThing = null;
      g.text.clear();
      g.ui.clearZoneState();
      g.ui.zoneTitle(`${zone.def.name}: ${dest.floor ? 'Upper floor' : 'Ground floor'}`);
      if (g.pet) {
        const at = zone.nav.nearestWalkable(dest.x + 1, dest.z) ?? dest;
        g.pet.pos.set(at.x, dest.y, at.z);
      }
      zone.update(0);
    }
    g.traveling = false;
  });
}
