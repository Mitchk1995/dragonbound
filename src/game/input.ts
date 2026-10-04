import * as THREE from 'three';
import { holdTarget, pressTarget } from '../combat/holdInput';
import type { AbilityKey } from '../data/abilities';
import { COMBAT_TUNING } from '../data/tuning';
import type { Enemy } from '../entities/enemy';
import type { GroundItem } from '../entities/groundItem';
import type { Interactable } from '../entities/interactable';
import type { Game } from '../game';

/** Mouse and keyboard: what the cursor is over, clicks and holds, skill keys and the zoom wheel. */
export class GameInput {
  /** Game time each skill key last fired (a held key's auto-repeat is throttled to keyRepeat). */
  private keyRepeatAt: Partial<Record<AbilityKey, number>> = {};
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private readonly g: Game) {}

  bind() {
    const g = this.g, c = g.canvas;
    window.addEventListener('mousemove', (e) => {
      if (g.mode === 'create' && e.buttons & 1 && e.target === c) g.previewYaw += e.movementX * 0.012;
      g.mouse.x = e.clientX;
      g.mouse.y = e.clientY;
    });
    c.addEventListener('mousedown', (e) => {
      g.sfx.unlock();
      if (e.button !== 0 || g.mode !== 'play') return;
      g.mouse.down = true;
      g.mouse.holdT = 0;
      g.shiftHeld = e.shiftKey;
      this.onClick(e.shiftKey);
    });
    document.addEventListener('mouseleave', () => {
      g.mouse.x = g.mouse.y = NaN;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && g.mouse.down) this.onRelease();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      g.camZoom = Math.min(1.35, Math.max(0.65, g.camZoom + Math.sign(e.deltaY) * 0.06));
    }, { passive: true });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') g.altHeld = false;
      if (e.key === 'Shift') g.shiftHeld = false;
    });
    window.addEventListener('blur', () => {
      g.altHeld = false;
      g.shiftHeld = false;
      if (g.mouse.down) this.onRelease();
    });
    window.addEventListener('beforeunload', () => g.persist());
  }

  private onKey(e: KeyboardEvent) {
    const g = this.g;
    g.sfx.unlock();
    if (e.key === 'Alt') {
      g.altHeld = true;
      e.preventDefault();
      return;
    }
    if (e.key === 'Shift') g.shiftHeld = true;
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (g.mode !== 'play') {
      g.ui.handleKey(e);
      return;
    }
    const k = e.key.toUpperCase();
    const skillKey = k === 'Q' || k === 'W' || k === 'E' || k === 'R' ? (k as AbilityKey) : null;
    if (e.repeat) {
      // A held skill key recasts, but no faster than keyRepeat and without refusal noise.
      if (!skillKey || g.time - (this.keyRepeatAt[skillKey] ?? -1e9) < COMBAT_TUNING.input.keyRepeat) return;
      this.keyRepeatAt[skillKey] = g.time;
      g.combat.useAbility(skillKey, true);
      return;
    }
    if (g.ui.handleKey(e)) {
      e.preventDefault();
      return;
    }
    if (skillKey) {
      this.keyRepeatAt[skillKey] = g.time;
      g.combat.useAbility(skillKey);
    }
    else if (k === '1') g.items.drinkPotion();
    else if (k === 'T') g.recall();
    else if (k === ' ') {
      g.player.stop();
      g.skilling.stop();
    }
  }

  /** What the cursor is over: an enemy first, then a ground item, then something to use; and the ground under it. */
  updateHover() {
    const g = this.g;
    if (!Number.isFinite(g.mouse.x)) {
      g.hovered = null;
      g.hoveredThing = null;
      if (!g.text.labelHovered) g.hoveredItem = null;
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    this.ndc.set((g.mouse.x / w) * 2 - 1, -(g.mouse.y / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, g.camera);
    const ray = this.raycaster.ray;
    // The ground under the cursor: intersect the level the hero stands on, then settle onto the
    // ground level where the ray lands (a couple of passes are exact on plateaus and close on ramps).
    this.groundPlane.constant = -g.player.pos.y;
    ray.intersectPlane(this.groundPlane, g.ground);
    for (let pass = 0; pass < 3; pass++) {
      this.groundPlane.constant = -g.zone.groundY(g.ground.x, g.ground.z);
      if (!ray.intersectPlane(this.groundPlane, g.ground)) break;
    }
    const center = new THREE.Vector3();
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of g.zone.enemies) {
      if (e.dead || e.untargetable) continue;
      const hgt = e.model.height;
      center.set(e.x, hgt * 0.45, e.z);
      const r = Math.max(e.radius * 1.3, hgt * 0.45, 0.7);
      if (ray.distanceSqToPoint(center) < r * r) {
        const along = ray.origin.distanceTo(center);
        if (along < bestD) {
          bestD = along;
          best = e;
        }
      }
    }
    g.hovered = best;
    g.hoveredThing = null;
    if (best || g.ui.overUI) return;
    let bi: GroundItem | null = null;
    let bd = 0.8 * 0.8;
    for (const it of g.zone.items) {
      if (it.gone || !it.landed || !it.group.visible) continue;
      const d = ray.distanceSqToPoint(center.set(it.x, 0.2, it.z));
      if (d < bd) {
        bd = d;
        bi = it;
      }
    }
    if (bi) g.hoveredItem = bi;
    else if (g.hoveredItem && !g.text.labelHovered) g.hoveredItem = null;
    if (bi) return;
    let bt: Interactable | null = null;
    bestD = Infinity;
    for (const it of g.zone.interactables) {
      if (!it.obj.visible) continue;
      center.set(it.x, it.height * 0.45, it.z);
      const r = Math.max(it.radius, it.height * 0.4);
      if (ray.distanceSqToPoint(center) < r * r) {
        const along = ray.origin.distanceTo(center);
        if (along < bestD) {
          bestD = along;
          bt = it;
        }
      }
    }
    g.hoveredThing = bt;
  }

  private onClick(shift: boolean) {
    const g = this.g, p = g.player, m = g.mouse;
    m.mode = 'none';
    if (p.dead || g.traveling) return;
    if (g.recallT >= 0) g.recallT = -1;
    m.swingsAtPress = p.swings;
    if (shift && g.zone.def.kind !== 'hub') {
      // Attack in place; letting go of Shift mid-hold keeps attacking (never walks).
      m.mode = 'attack';
      this.forceAttack();
      return;
    }
    if (g.hovered) {
      m.mode = 'attack';
      p.attack(g.hovered, true);
      return;
    }
    if (g.hoveredItem) {
      p.pickup(g.hoveredItem);
      return;
    }
    if (g.hoveredThing) {
      p.interact(g.hoveredThing);
      return;
    }
    const near = pressTarget(g.zone.enemies, g.ground);
    if (near) {
      m.mode = 'attack';
      p.attack(near, true);
      return;
    }
    m.mode = 'move';
    p.moveTo(g, g.ground.x, g.ground.z);
    g.fx.moveMarker(g.ground.x, g.ground.z);
  }

  /** Letting go: a click on an enemy that hasn't swung yet still walks up and swings once. */
  private onRelease() {
    const p = this.g.player, m = this.g.mouse;
    m.down = false;
    if (m.mode === 'attack' && p.cmd.kind === 'attack') {
      if (p.swings > m.swingsAtPress) p.stop();
      else p.cmd.hold = false;
    }
    m.mode = 'none';
  }

  updateHeldMouse(dt: number) {
    const g = this.g, p = g.player, m = g.mouse;
    if (!m.down || p.dead) return;
    m.holdT += dt;
    if (g.shiftHeld && m.mode !== 'none' && g.zone.def.kind !== 'hub') {
      m.mode = 'attack';
      if (!p.action && p.attackCd <= 0) this.forceAttack();
      return;
    }
    if (m.mode === 'attack') {
      // Keep swinging; when the target dies pick up the next one near the cursor, or stand ready.
      const cur = p.cmd.kind === 'attack' ? p.cmd.target : null;
      const next = holdTarget(g.zone.enemies, cur, g.hovered, g.ground, p, g.stats.range);
      if (next) p.attack(next, true);
      else if (!p.action) p.faceTo(g.ground.x, g.ground.z);
      return;
    }
    if (m.mode === 'move' && m.holdT > COMBAT_TUNING.input.walkRepeat) {
      m.holdT = 0;
      p.moveTo(g, g.ground.x, g.ground.z);
    }
  }

  private forceAttack() {
    const g = this.g, p = g.player;
    if (p.dash) return;
    p.stop();
    g.skilling.stop();
    p.faceTo(g.ground.x, g.ground.z, true);
    if (!p.action && p.attackCd <= 0) g.combat.startBasicAttack(g.hovered);
  }
}
