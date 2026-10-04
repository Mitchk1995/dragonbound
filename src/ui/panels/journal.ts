import { DIARY_REWARDS, DIARY_TASKS, type DiaryTier } from '../../data/diary';
import { QUESTS } from '../../data/quests';
import { SKILL_INFO } from '../../progression/skills';
import { SKILLS, type SkillId } from '../../types';
import { cap, esc, fmt } from '../dom';
import { icon } from '../icons';
import type { Panels } from '../panels';
import { bindSideHead, sideHead } from './sideHead';

function journalTabs(p: Panels) {
  return `<div class="tabs"><button class="tab ${p.journalTab === 'quests' ? 'on' : ''}" data-jtab="quests">${icon('quest', 18)} Quests</button><button class="tab ${p.journalTab === 'diary' ? 'on' : ''}" data-jtab="diary">${icon('diary', 18)} Diary</button></div>`;
}

function bindJournalTabs(p: Panels, el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('[data-jtab]').forEach((t) => t.addEventListener('click', () => {
    p.journalTab = t.dataset.jtab as 'quests' | 'diary';
    p.journal();
    p.book();
  }));
}

/**
 * The side panel's journal is an OSRS quest list: one line per quest coloured by status (the current
 * step under one in progress), or the diary tiers with their progress. Details live in the full window.
 */
export function journalPanel(p: Panels) {
  const { ui, g } = p, s = g.save;
  const el = ui.panel('journal', 'Journal');
  if (!el) return;
  let body = '';
  if (p.journalTab === 'quests') {
    body = Object.values(QUESTS).map((q) => {
      const st = s.quests[q.id];
      const cls = !st ? 'new' : st.done ? 'done' : 'active';
      const step = st && !st.done ? `<span class="qstep">${esc(q.stages[st.stage]?.text ?? '')}</span>` : !st ? '<span class="qstep">Speak with the Warden.</span>' : '';
      return `<button class="qrow ${cls}" data-quest="${q.id}"><b>${esc(q.name)}</b>${step}</button>`;
    }).join('');
    body += '<div class="qlegend"><span class="new">Not started</span><span class="active">In progress</span><span class="done">Complete</span></div>';
  } else {
    body = (['easy', 'medium', 'hard'] as DiaryTier[]).map((tier) => {
      const tasks = DIARY_TASKS.filter((t) => t.tier === tier);
      const done = tasks.filter((t) => s.diary[t.id]).length;
      const claimed = s.diaryClaimed[tier];
      const ready = done === tasks.length && !claimed;
      return `<button class="drow ${claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}" data-diary="${tier}"><span class="dname">${cap(tier)}</span><span class="dcount">${claimed ? 'Claimed' : ready ? 'Claim!' : `${done}/${tasks.length}`}</span><span class="dbar"><span style="width:${(100 * done) / tasks.length}%"></span></span></button>`;
    }).join('');
  }
  ui.body(el, `${sideHead(p, 'journal', journalTabs(p))}<div class="sidelist">${body}</div>`);
  bindJournalTabs(p, el);
  bindSideHead(p, el, 'journal', 'the journal');
  el.querySelectorAll<HTMLElement>('[data-quest], [data-diary]').forEach((r) => r.addEventListener('click', () => {
    if (p.bookView !== 'journal') ui.openBook('journal');
  }));
}

/** The full journal: every quest's log, requirements and rewards; the diary's tasks and claims. */
export function journalFull(p: Panels, el: HTMLElement) {
  const { ui, g } = p, s = g.save;
  let body = '';
  if (p.journalTab === 'quests') {
    body = Object.values(QUESTS).map((q) => {
      const st = s.quests[q.id];
      const status = !st ? 'Not started' : st.done ? 'Complete' : 'In progress';
      const reqs = q.reqs.map((r) => `<span class="${g.levels[r.skill] >= r.level ? 'ok' : 'no'}">${SKILL_INFO[r.skill].name} ${r.level}</span>`).join(' · ');
      const log = st ? q.stages.slice(0, st.done ? q.stages.length : st.stage + 1).map((x, i) => `<p class="${st.done || i < st.stage ? 'struck' : ''}">${esc(x.text)}</p>`).join('') : '<p>Speak with the Warden in Dragonspire Keep.</p>';
      return `<div class="quest ${st?.done ? 'done' : ''}"><div class="q-head"><b>${esc(q.name)}</b><span class="tag ${st?.done ? 'ok' : ''}">${status}</span></div>
        <div class="q-reqs">Requires: ${reqs}</div>${log}<div class="q-rew">Rewards: ${q.rewards.map(esc).join(' · ')}</div></div>`;
    }).join('');
  } else {
    body = (['easy', 'medium', 'hard'] as DiaryTier[]).map((tier) => {
      const tasks = DIARY_TASKS.filter((t) => t.tier === tier);
      const done = tasks.filter((t) => s.diary[t.id]).length;
      const complete = done === tasks.length;
      const claimed = s.diaryClaimed[tier];
      const lamp = tier === 'easy' && complete && !claimed ? `<select class="lampskill">${SKILLS.map((k) => `<option value="${k}">${SKILL_INFO[k].name}</option>`).join('')}</select>` : '';
      return `<div class="diary"><div class="q-head"><b>${cap(tier)}</b><span class="tag ${complete ? 'ok' : ''}">${done}/${tasks.length}</span></div>
        ${tasks.map((t) => {
          const c = t.check;
          const prog = c.type === 'count' ? ` <i>(${fmt(Math.min(c.n, s.counters[c.key] ?? 0))}/${fmt(c.n)})</i>` : '';
          return `<div class="task ${s.diary[t.id] ? 'done' : ''}">${s.diary[t.id] ? '✔' : '◇'} ${esc(t.text)}${s.diary[t.id] ? '' : prog}</div>`;
        }).join('')}
        <div class="q-rew">Reward: ${DIARY_REWARDS[tier].text.map(esc).join(' · ')}</div>
        ${claimed ? '<div class="tag ok">Claimed</div>' : complete ? `<div class="claimrow">${lamp}<button class="btn" data-claim="${tier}">Claim reward</button></div>` : ''}
      </div>`;
    }).join('');
  }
  ui.body(el, `${journalTabs(p)}${body}`);
  bindJournalTabs(p, el);
  el.querySelectorAll<HTMLElement>('[data-claim]').forEach((b) => b.addEventListener('click', () => {
    const lamp = el.querySelector<HTMLSelectElement>('.lampskill');
    g.story.claimDiary(b.dataset.claim as DiaryTier, (lamp?.value as SkillId) ?? undefined);
  }));
}
