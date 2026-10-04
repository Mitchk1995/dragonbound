import { UNIQUES } from '../data/items';
import type { Game } from '../game';
import { generateItem, generateUnique, makeItem } from '../loot/itemGen';
import { xpForLevel } from '../progression/skills';
import type { LightingEffects } from '../render/post';
import { SKILLS } from '../types';
import type { UI } from './ui';

/** The lighting effects the debug panel switches (render/post.ts), each off until switched on. */
const LIGHTING_TOGGLES: [keyof LightingEffects, string][] = [['bounce', 'Bounce light'], ['contact', 'Contact shading'], ['reflections', 'Reflections'], ['smooth', 'Smooth edges']];

/** The debug panel (F1): test cheats, travel, and the lighting effects' switches. */
export function debugPanel(ui: UI, g: Game) {
  const el = ui.panel('debug', 'Debug (F1)');
  if (!el) return;
  ui.body(el, `
    <div class="debug">
      <label><input type="checkbox" data-d="god" ${g.debug.god ? 'checked' : ''}> God mode</label>
      <label><input type="checkbox" data-d="oneShot" ${g.debug.oneShot ? 'checked' : ''}> One-shot enemies</label>
      <label>Drop rate × <select data-d="drop">${[1, 10, 100, 1000].map((v) => `<option ${g.debug.dropMult === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${LIGHTING_TOGGLES.map(([k, name]) => `<label><input type="checkbox" data-light="${k}" ${g.save.settings.lighting?.[k] ? 'checked' : ''}> ${name}</label>`).join('')}
      <div class="dbtns">
        <button class="btn sm" data-a="lvl">+5 all skills</button>
        <button class="btn sm" data-a="gold">+5,000 gold</button>
        <button class="btn sm" data-a="mats">Starter materials</button>
        <button class="btn sm" data-a="rare">Give rare</button>
        <button class="btn sm" data-a="unique">Give unique</button>
        <button class="btn sm" data-a="portals">Open all portals</button>
        ${['keep', 'mine', 'foothills', 'ruin', 'lair'].map((z) => `<button class="btn sm" data-go="${z}">Go: ${z}</button>`).join('')}
        <button class="btn sm danger" data-a="reset">Reset save</button>
      </div>
    </div>`);
  el.querySelectorAll<HTMLInputElement>('[data-d]').forEach((i) => i.addEventListener('change', () => {
    const d = i.dataset.d!;
    if (d === 'drop') g.debug.dropMult = Number((i as unknown as HTMLSelectElement).value);
    else (g.debug as any)[d] = i.checked;
  }));
  el.querySelectorAll<HTMLInputElement>('[data-light]').forEach((i) => i.addEventListener('change', () => {
    g.setLighting({ ...g.save.settings.lighting, [i.dataset.light!]: i.checked });
  }));
  el.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => g.travel(b.dataset.go!)));
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
    switch (b.dataset.a) {
      case 'lvl':
        for (const k of SKILLS) g.prog.grant(k, (xpForLevel(Math.min(99, g.levels[k] + 5)) - g.save.skills[k]) / g.stats.xpMult + 1);
        break;
      case 'gold':
        g.save.gold += 5000;
        break;
      case 'mats':
        for (const id of ['copper_ore', 'tin_ore', 'iron_ore', 'coal', 'iron_bar', 'steel_bar', 'emberite_ore']) {
          const stack = g.save.bank.find((x) => x.base === id);
          if (stack) stack.qty = (stack.qty ?? 1) + 50;
          else g.save.bank.push({ ...makeItem(id), qty: 50 });
        }
        g.announce('Added 50 of each material to your bank.', 'info');
        break;
      case 'rare':
        g.items.add(generateItem(Math.random, 15, 'rare'));
        break;
      case 'unique': {
        const ids = Object.keys(UNIQUES);
        g.items.add(generateUnique(Math.random, ids[Math.floor(Math.random() * ids.length)], 20));
        break;
      }
      case 'portals':
        Object.assign(g.save.portals, { mine: true, foothills: true, lair: true });
        g.save.keep.lair_arch = true;
        g.save.quests.cinder_seal ??= { stage: 0, done: false };
        g.zone.refreshStations();
        break;
      case 'reset':
        if (confirm('Reset ALL progress? This cannot be undone.')) g.resetSave();
        break;
    }
    g.ui.refresh();
  }));
}
