import { BASES } from '../../data/items';
import type { Item } from '../../types';
import { fmt, itemImg, itemSlot } from '../dom';
import { DRAG_THRESHOLD, swapSlots } from '../hudLayout';
import { icon } from '../icons';
import type { Panels } from '../panels';

/** The inventory, the always-visible side panel tab: its slots, selection, drag and drop, and the coins and Sort. */
export class InventoryPanel {
  /**
   * The item last pressed in the inventory, rimmed in gold as the selection. Held by identity, never by slot, so it
   * follows its item through sorting, swaps and redraws, and lapses once the item leaves the inventory.
   */
  private selected: Item | null = null;
  /** The item being dragged: its slot dims under the ghost, wherever a redraw puts it. */
  private dragItem: Item | null = null;
  /** The slot whose card is showing, and the item it showed. */
  private hoverAt: { i: number; it: Item } | null = null;
  /** Ends the press in progress without acting on it (its ghost removed). */
  private cancelPress: (() => void) | null = null;

  constructor(private p: Panels) {}

  render() {
    const { ui, g } = this.p, s = g.save;
    const el = ui.panel('inventory', 'Inventory');
    if (!el) return;
    if (this.selected && !s.inventory.includes(this.selected)) this.selected = null;
    const inv = s.inventory.map((it, i) => itemSlot(it, `data-inv="${i}"`, it && BASES[it.base]?.kind === 'gear' && g.items.canEquip(it) ? 'unusable' : '')).join('');
    const mode = this.p.bankMode === 'bank' || this.p.bankMode === 'deposit' ? '<span class="modechip">Click to deposit</span>' : this.p.shopOpen ? '<span class="modechip">Click to sell</span>' : '';
    ui.body(el, `
      <div class="invgrid ${mode ? 'moded' : ''}">${inv}</div>
      <div class="invfoot">${mode || `<span class="goldline">${icon('gold', 18)}<span>${fmt(s.gold)}</span></span>`}<button class="sortbtn" data-act="sort">Sort</button></div>`);
    this.markSlots();
    // Redrawn under a showing card: it stays only while its slot still holds the item it describes.
    if (this.hoverAt && s.inventory[this.hoverAt.i] !== this.hoverAt.it) {
      this.hoverAt = null;
      ui.tooltip.hide();
    }
    el.querySelector('[data-act="sort"]')!.addEventListener('click', () => g.items.sort());
    el.querySelectorAll<HTMLElement>('[data-inv]').forEach((c) => {
      const i = Number(c.dataset.inv);
      c.addEventListener('mouseenter', () => {
        const it = g.save.inventory[i];
        if (!it || this.dragItem) return;
        this.hoverAt = { i, it };
        ui.tooltip.item(it, c.getBoundingClientRect(), true, this.invHint(it));
      });
      c.addEventListener('mouseleave', () => {
        this.hoverAt = null;
        ui.tooltip.hide();
      });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('mousedown', (e) => {
        if (!g.save.inventory[i]) return;
        this.hoverAt = null;
        ui.tooltip.hide();
        if (e.button === 2) {
          if (!this.p.bankMode && !this.p.shopOpen) g.items.dropFromInventory(i);
          return;
        }
        if (e.button === 0) this.press(i, e);
      });
    });
  }

  /** Rim the selected item's slot and dim the dragged one's, wherever they sit now. */
  private markSlots() {
    const inv = this.p.g.save.inventory;
    document.querySelectorAll<HTMLElement>('.sidepanel [data-inv]').forEach((c) => {
      const it = inv[Number(c.dataset.inv)];
      c.classList.toggle('sel', !!it && it === this.selected);
      c.classList.toggle('dragfrom', !!it && it === this.dragItem);
    });
  }

  /** The inventory folded or switched away from: forget the selection, end any press and its ghost. */
  clearSelection() {
    this.cancelPress?.();
    this.selected = null;
    this.hoverAt = null;
  }

  private invHint(it: Item) {
    if (this.p.bankMode) return 'Click: deposit · Shift-click: deposit all of it';
    if (this.p.shopOpen) return 'Click: sell to the Quartermaster';
    return `${BASES[it.base]?.kind === 'gear' ? 'Click: equip · ' : ''}Right-click: drop · Drag: move`;
  }

  /**
   * A left press on an inventory item selects it; released in place it's a click (equip / deposit / sell);
   * moved past DRAG_THRESHOLD it becomes an OSRS-style drag that swaps two slots on release. The pressed item is
   * looked up afresh on release, so a redraw or sort under the press never acts on whatever took its slot.
   */
  private press(i: number, e: MouseEvent) {
    const { ui, g } = this.p;
    const it = g.save.inventory[i];
    if (!it) return;
    this.cancelPress?.();
    this.selected = it;
    this.markSlots();
    const x0 = e.clientX, y0 = e.clientY, shift = e.shiftKey;
    let ghost: HTMLElement | null = null;
    const end = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', cancel);
      ghost?.remove();
      this.dragItem = null;
      this.cancelPress = null;
    };
    // The window losing focus mid-press (its release may never arrive) or the inventory folding away.
    const cancel = () => {
      end();
      this.markSlots();
    };
    const move = (ev: MouseEvent) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) >= DRAG_THRESHOLD) {
        if (!g.save.inventory.includes(it)) return cancel();
        this.dragItem = it;
        ghost = document.createElement('div');
        ghost.className = 'dragghost';
        ghost.innerHTML = itemImg(it);
        document.body.appendChild(ghost);
        this.markSlots();
        this.hoverAt = null;
        ui.tooltip.hide();
      }
      if (ghost) ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    };
    const up = (ev: MouseEvent) => {
      const dragged = !!ghost;
      end();
      const from = g.save.inventory.indexOf(it);
      if (dragged) {
        const to = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.sidepanel [data-inv]');
        if (from >= 0 && to && swapSlots(g.save.inventory, from, Number(to.dataset.inv))) g.dirty = true;
        ui.refresh();
        return;
      }
      if (from < 0) return;
      if (this.p.bankMode) g.items.deposit(from, shift);
      else if (this.p.shopOpen) g.items.sell(from);
      else if (BASES[it.base]?.kind === 'gear') g.items.equip(from);
    };
    this.cancelPress = cancel;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', cancel);
  }
}
