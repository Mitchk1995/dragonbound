import * as THREE from 'three';
import type { Enemy } from '../entities/enemy';
import type { Interactable } from '../entities/interactable';
import type { GroundItem } from '../entities/groundItem';
import type { Game } from '../game';
import type { DigitKind } from './digitGlyphs';
import { isDigitText, paintDigits, paintText, preloadDigits, preloadFonts } from './paintedText';
import { worldTextShows } from './worldTextRule';

interface Floater {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  t: number;
  life: number;
  dx: number;
}

/** The painted digit set for each floater class; the rest (gold pickups) stay text. */
const DIGIT_KINDS: Record<string, DigitKind | undefined> = { dmg: 'white', crit: 'crit', hurt: 'hurt', heal: 'heal' };

/** Floating words ("+30 gold", "+1 potion") are set in the gold alphabet, this many px to the capitals. */
const WORD_CAP = 22;
/** Names over heads: how tall the capitals stand, how far off a name still shows, and how high above the head. */
const NAME_CAP = 19, NAME_RANGE = 14, NAME_LIFT = 0.15;

/** Screen-space overlays anchored to world positions: damage numbers, loot labels, enemy health bars. */
export class WorldText {
  labelHovered = false;
  private floaters: Floater[] = [];
  private labels = new Map<GroundItem, HTMLElement>();
  private bars = new Map<Enemy, HTMLElement>();
  private names = new Map<Interactable, HTMLElement>();
  private v = new THREE.Vector3();
  private layerNums: HTMLElement;
  private layerLabels: HTMLElement;
  private layerBars: HTMLElement;

  constructor(private root: HTMLElement, private g: Game) {
    preloadDigits();
    preloadFonts();
    this.layerBars = this.layer();
    this.layerLabels = this.layer();
    this.layerNums = this.layer();
  }

  private layer() {
    const d = document.createElement('div');
    d.className = 'wlayer';
    this.root.appendChild(d);
    return d;
  }

  private project(x: number, y: number, z: number) {
    this.v.set(x, y, z).project(this.g.camera);
    return {
      x: (this.v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.v.y * 0.5 + 0.5) * window.innerHeight,
      visible: this.v.z < 1,
    };
  }

  damage(amount: number, x: number, y: number, z: number, cls: 'dmg' | 'crit' | 'hurt') {
    if (amount <= 0) return; // fully absorbed hits show no number
    this.float(cls === 'hurt' ? `-${amount}` : String(amount), x, y, z, cls);
  }

  float(text: string, x: number, y: number, z: number, cls: string) {
    const el = document.createElement('div');
    const kind = DIGIT_KINDS[cls];
    const painted = kind !== undefined && isDigitText(text);
    const word = !painted && (cls === 'gold' || cls === 'heal');
    el.className = `floater ${cls}${painted ? ' digits' : word ? ' painted' : ''}`;
    if (painted) paintDigits(el, text, kind);
    else if (word) paintText(el, text, 'gold', WORD_CAP);
    else el.textContent = text;
    this.layerNums.appendChild(el);
    this.floaters.push({ el, x, y, z, t: 0, life: cls === 'crit' ? 1.0 : 0.8, dx: (Math.random() - 0.5) * 40 });
    if (this.floaters.length > 80) this.floaters.shift()!.el.remove();
  }

/** Drop every overlay tied to the previous zone (labels, names, health bars, floating numbers). */
  clear() {
    for (const el of this.labels.values()) el.remove();
    for (const el of this.bars.values()) el.remove();
    for (const el of this.names.values()) el.remove();
    this.names.clear();
    for (const f of this.floaters) f.el.remove();
    this.labels.clear();
    this.bars.clear();
    this.floaters = [];
    this.labelHovered = false;
    this.g.ui.hideTooltip();
  }

  removeLabel(it: GroundItem) {
    this.labels.get(it)?.remove();
    this.labels.delete(it);
    if (this.g.hoveredItem === it) {
      this.g.hoveredItem = null;
      this.labelHovered = false;
      this.g.ui.hideTooltip();
    }
  }

  update(dt: number) {
    if (!worldTextShows(this.g.mode)) {
      // Title, creation or any other menu-only state: drop whatever play left behind and draw nothing.
      if (this.floaters.length || this.labels.size || this.bars.size || this.names.size) this.clear();
      return;
    }
    for (const f of this.floaters) {
      f.t += dt;
      const p = this.project(f.x, f.y, f.z);
      const k = f.t / f.life;
      const rise = 50 * (1 - Math.pow(1 - Math.min(1, k * 1.5), 2));
      f.el.style.transform = `translate(${p.x + f.dx * k}px, ${p.y - rise}px) translate(-50%, -50%) scale(${f.el.classList.contains('crit') ? 1.4 - Math.min(0.4, k) : 1})`;
      f.el.style.opacity = String(Math.min(1, (1 - k) * 3));
    }
    this.floaters = this.floaters.filter((f) => {
      if (f.t >= f.life) f.el.remove();
      return f.t < f.life;
    });
    this.updateLabels();
    this.updateBars();
    this.updateNames();
  }

  private updateLabels() {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const entries: { it: GroundItem; el: HTMLElement; x: number; y: number }[] = [];
    for (const it of this.g.zone.items) {
      if (it.gone || !it.landed) continue;
      const show = this.g.altHeld || (it.item && it.item.rarity !== 'normal') || this.g.hoveredItem === it;
      let el = this.labels.get(it);
      if (!show) {
        if (el) el.style.display = 'none';
        continue;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = `ilabel ${it.item ? 'r-' + it.item.rarity : 'gold'}`;
        el.textContent = it.labelText;
        el.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (e.button === 0) this.g.player.pickup(it);
        });
        el.addEventListener('mouseenter', () => {
          this.labelHovered = true;
          this.g.hoveredItem = it;
          if (it.item) this.g.ui.showItemTooltip(it.item, el!.getBoundingClientRect(), true);
        });
        el.addEventListener('mouseleave', () => {
          this.labelHovered = false;
          this.g.ui.hideTooltip();
        });
        this.layerLabels.appendChild(el);
        this.labels.set(it, el);
      }
      el.style.display = '';
      el.classList.toggle('hover', this.g.hoveredItem === it);
      const p = this.project(it.x, 0.5, it.z);
      entries.push({ it, el, x: p.x, y: p.y - 22 });
    }
    // Simple stacking so overlapping labels stay readable.
    entries.sort((a, b) => b.y - a.y);
    for (const e of entries) {
      const w = e.el.offsetWidth || 80, h = 20;
      let y = e.y;
      for (let tries = 0; tries < 12; tries++) {
        const hit = placed.find((r) => Math.abs(r.x - e.x) < (r.w + w) / 2 && Math.abs(r.y - y) < h);
        if (!hit) break;
        y = hit.y - h;
      }
      placed.push({ x: e.x, y, w, h });
      e.el.style.transform = `translate(${e.x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  /** The name of every nearby NPC, in gold lettering just over its head. */
  private updateNames() {
    const pl = this.g.player;
    const seen = new Set<Interactable>();
    for (const it of this.g.zone.interactables) {
      if (it.kind !== 'npc' || !it.obj.visible || Math.hypot(it.x - pl.x, it.z - pl.z) > NAME_RANGE) continue;
      const p = this.project(it.x, it.height + NAME_LIFT, it.z);
      if (!p.visible) continue;
      seen.add(it);
      let el = this.names.get(it);
      if (!el) {
        el = document.createElement('div');
        el.className = 'npcname';
        paintText(el, it.name, 'gold', NAME_CAP);
        this.layerBars.appendChild(el);
        this.names.set(it, el);
      }
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
    for (const [it, el] of this.names) {
      if (!seen.has(it)) {
        el.remove();
        this.names.delete(it);
      }
    }
  }

  private updateBars() {
    const seen = new Set<Enemy>();
    for (const e of this.g.zone.enemies) {
      if (e.dead || e.def.behavior === 'boss' || (e.hp >= e.maxHp && this.g.hovered !== e)) continue;
      seen.add(e);
      let el = this.bars.get(e);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = '<div></div>';
        this.layerBars.appendChild(el);
        this.bars.set(e, el);
      }
      const p = this.project(e.x, e.model.height + 0.4, e.z);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      (el.firstChild as HTMLElement).style.width = `${(100 * Math.max(0, e.hp)) / e.maxHp}%`;
    }
    for (const [e, el] of this.bars) {
      if (!seen.has(e)) {
        el.remove();
        this.bars.delete(e);
      }
    }
  }
}
