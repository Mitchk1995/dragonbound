import { abilityFor, type AbilityKey } from '../data/abilities';
import type { Style } from '../types';

/**
 * HUD layout rules with no DOM in them (unit tested): the always-visible OSRS-style side panel's
 * tabs and hotkeys, which skill slots the Diablo-style console shows, and inventory rearranging.
 */

export type SideTab = 'inventory' | 'equipment' | 'skills' | 'journal' | 'collection' | 'help';

export interface TabDef {
  id: SideTab;
  label: string;
  icon: string;
  key: string;
}

/** Left to right along the top of the side panel. */
export const SIDE_TABS: TabDef[] = [
  { id: 'inventory', label: 'Inventory', icon: 'bag', key: 'I' },
  { id: 'equipment', label: 'Equipment', icon: 'item_body', key: 'C' },
  { id: 'skills', label: 'Skills', icon: 'skills', key: 'K' },
  { id: 'journal', label: 'Journal', icon: 'quest', key: 'J' },
  { id: 'collection', label: 'Collection log', icon: 'collection', key: 'L' },
  { id: 'help', label: 'Controls & settings', icon: 'settings', key: 'Esc' },
];

/** Lower-case key → tab. B (bag) is an alias for the inventory, H for settings. */
export const TAB_KEYS: Record<string, SideTab> = { i: 'inventory', b: 'inventory', c: 'equipment', k: 'skills', j: 'journal', l: 'collection', h: 'help' };

export const isSideTab = (id: string): id is SideTab => SIDE_TABS.some((t) => t.id === id);

export interface SideState {
  tab: SideTab;
  /** Folded down to just its tab row (pressing the open tab's key again, like OSRS). */
  collapsed: boolean;
}

/** Pressing a tab (click or hotkey): switch to it, or fold/unfold the panel if it's already open. */
export function pressTab(s: SideState, tab: SideTab): SideState {
  if (s.tab === tab) return { tab, collapsed: !s.collapsed };
  return { tab, collapsed: false };
}

/** Show a tab no matter what (a bank or shop opening needs the inventory visible). */
export function showTab(_s: SideState, tab: SideTab): SideState {
  return { tab, collapsed: false };
}

/**
 * What Escape does: close a dialogue first, then any station windows; otherwise flip to the
 * settings tab, or back to the inventory if settings is already showing.
 */
export function escapeAction(hasDialogue: boolean, windowsOpen: number, s: SideState): 'dialogue' | 'windows' | SideState {
  if (hasDialogue) return 'dialogue';
  if (windowsOpen > 0) return 'windows';
  if (s.tab === 'help' && !s.collapsed) return { tab: 'inventory', collapsed: false };
  return { tab: 'help', collapsed: false };
}

/** Skill keys the console shows for a style: Q W E always, R only once some skill uses it. */
export function consoleKeys(style: Style): AbilityKey[] {
  const keys: AbilityKey[] = ['Q', 'W', 'E'];
  if (abilityFor(style, 'R')) keys.push('R');
  return keys;
}

/** Drag-rearrange two inventory slots (OSRS swaps them). Returns false if nothing moved. */
export function swapSlots<T>(slots: (T | null)[], from: number, to: number): boolean {
  if (from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length || slots[from] == null) return false;
  [slots[from], slots[to]] = [slots[to], slots[from]];
  return true;
}

/** A press becomes a drag once the mouse travels this far (px) with the button held. */
export const DRAG_THRESHOLD = 6;

/** Fraction (0..1) of a cooldown left, for the console's clock sweep. */
export function cooldownFrac(remaining: number, cooldown: number, cdr: number) {
  const total = cooldown * (1 - cdr);
  return total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
}
