import { BASES, PETS, UNIQUES } from '../../data/items';
import { DROP_TABLES } from '../../data/dropTables';
import { generateUnique, makeItem } from '../../loot/itemGen';
import { cap, esc, fmt, itemSlot } from '../dom';
import { icon } from '../icons';
import type { Panels } from '../panels';
import { bindSideHead, sideHead } from './sideHead';

/** The collection log's side-panel tab. */
export function collectionPanel(p: Panels) {
  const el = p.ui.panel('collection', 'Collection Log');
  if (!el) return;
  collectionBody(p, el, false);
}

/** The collection log, in the side panel or (`full`) the full-size window: boss and mining finds, pets, the slayer tally. */
export function collectionBody(p: Panels, el: HTMLElement, full: boolean) {
  const { ui, g } = p, s = g.save;
  const table = DROP_TABLES.cinderwing;
  const entry = (id: string, name: string, rate: string, pic: string) => {
    const n = s.collection[id] ?? 0;
    return `<div class="clog ${n ? 'got' : ''}" title="${esc(name)} (${rate})">${pic}<div class="cn">${n ? esc(name) : '???'}</div>${n > 1 ? `<div class="cc">×${n}</div>` : ''}</div>`;
  };
  const boss = [
    ...table.uniques!.map((u) => entry(u.id, UNIQUES[u.id].name, `1/${u.chance}`, itemSlot(generateUnique(Math.random, u.id, 20)))),
    entry('ember_whelp', PETS.ember_whelp.name, `1/${table.pet!.chance}`, `<div class="slot r-unique">${icon('beastmastery', 44)}</div>`),
  ];
  const mining = [
    ...['uncut_sapphire', 'uncut_emerald', 'uncut_ruby'].map((id) => entry(id, BASES[id].name, 'while mining', itemSlot(makeItem(id)))),
    entry('rock_golem', PETS.rock_golem.name, '1/4000 ore', `<div class="slot r-unique">${icon('mining', 44)}</div>`),
  ];
  const bossGot = [...table.uniques!.map((u) => u.id), 'ember_whelp'].filter((id) => s.collection[id]).length;
  const mineGot = ['uncut_sapphire', 'uncut_emerald', 'uncut_ruby', 'rock_golem'].filter((id) => s.collection[id]).length;
  const best = s.stats.bestBossTime;
  const tally = ['goblin', 'kobold', 'drakeling', 'cultist', 'cinder_priest'];
  const html = `
    <div class="csec"><div class="ch">Cinderwing <span>${bossGot}/${table.uniques!.length + 1}</span></div>
    <div class="cstats">Kills <b>${fmt(s.kc.cinderwing ?? 0)}</b> · Personal best <b>${best === null ? '—' : `${Math.floor(best / 60)}:${String(Math.floor(best % 60)).padStart(2, '0')}`}</b></div>
    <div class="cgrid">${boss.join('')}</div></div>
    <div class="csec"><div class="ch">Emberdeep <span>${mineGot}/4</span></div><div class="cgrid">${mining.join('')}</div></div>
    ${s.pets.length ? `<div class="csec"><div class="ch">Pets</div><div class="petrow">Following: <select class="petsel"><option value="">None</option>${s.pets.map((pet) => `<option value="${pet}" ${s.activePet === pet ? 'selected' : ''}>${esc(PETS[pet].name)}</option>`).join('')}</select></div></div>` : ''}
    <div class="csec"><div class="ch">Slayer tally</div><div class="tally">${tally.map((id) => `<span>${esc(cap(id.replace('_', ' ')))}</span><b>${fmt(s.kc[id] ?? 0)}</b>`).join('')}</div>
    <div class="cstats dim">Deaths ${s.stats.deaths} · Played ${Math.floor(s.stats.playtime / 3600)}h ${Math.floor((s.stats.playtime % 3600) / 60)}m</div></div>`;
  ui.body(el, full ? html : `${sideHead(p, 'collection', '<div class="sidetitle">Collection log</div>')}${html}`);
  if (!full) bindSideHead(p, el, 'collection', 'the collection log');
  el.querySelector<HTMLSelectElement>('.petsel')?.addEventListener('change', (e) => g.items.setPet((e.target as HTMLSelectElement).value || null));
}
