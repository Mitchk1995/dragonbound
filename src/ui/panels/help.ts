import { esc } from '../dom';
import type { Panels } from '../panels';

/** Controls & Settings: the key list, volume and graphics, and save-and-quit. */
export function helpPanel(p: Panels) {
  const { ui, g } = p;
  const el = ui.panel('help', 'Controls & Settings');
  if (!el) return;
  const keys: [string, string][] = [
    ['Click', 'Move · use · attack'], ['Hold', 'Repeat move / attack'], ['Shift', 'Attack in place'],
    ['Q W E', 'Skills (cost mana)'], ['1 · T', 'Potion · Veilstone'], ['I C K', 'Bag · Gear · Skills'],
    ['J L', 'Journal · Collection'], ['Alt · Space', 'Loot labels · Stop'], ['Wheel', 'Zoom'], ['Esc', 'Close · Settings'],
  ];
  ui.body(el, `
    <div class="sechead">Controls</div>
    <div class="keys">${keys.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
    <div class="sechead">Settings</div>
    <div class="setting"><label>Volume</label><input type="range" min="0" max="1" step="0.05" value="${g.save.settings.volume}" class="vol" style="--v:${g.save.settings.volume * 100}%"></div>
    <div class="setting"><label>Graphics</label><select class="gfx">${(['high', 'medium', 'low'] as const).map((q) => `<option value="${q}"${(g.save.settings.graphics ?? 'high') === q ? ' selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></div>
    <div class="btnrow"><button class="btn" data-act="title">Save &amp; quit to title</button></div>`);
  el.querySelector<HTMLInputElement>('.vol')!.addEventListener('input', (e) => {
    const inp = e.target as HTMLInputElement;
    const v = Number(inp.value);
    inp.style.setProperty('--v', `${v * 100}%`);
    g.save.settings.volume = v;
    g.sfx.setVolume(v);
    g.dirty = true;
  });
  el.querySelector<HTMLSelectElement>('.gfx')!.addEventListener('change', (e) => {
    const q = (e.target as HTMLSelectElement).value as 'high' | 'medium' | 'low';
    g.save.settings.graphics = q;
    g.applyGraphics(q);
    g.dirty = true;
  });
  const quit = el.querySelector<HTMLElement>('[data-act="title"]')!;
  quit.addEventListener('click', async () => {
    if (await g.flushSave()) location.reload();
  });
  quit.addEventListener('mouseenter', () => ui.tooltip.text(`<div class="tt-name">Save &amp; quit</div><div class="tt-dim">Progress also saves automatically to your ${esc(g.backend.describe())}.</div>`, quit.getBoundingClientRect()));
  quit.addEventListener('mouseleave', () => ui.tooltip.hide());
}
