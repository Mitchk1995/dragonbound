import { BEARD_STYLES, CLOTH_COLORS, DEFAULT_APPEARANCE, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '../data/appearance';
import type { Game } from '../game';
import type { Appearance } from '../save/save';
import { SKILLS } from '../types';
import { esc, fmt } from './dom';
import { paintTree, setText } from './uiText';
import { levelForXp } from '../progression/skills';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class Screens {
  private root = document.getElementById('screens')!;
  look: Appearance = { ...DEFAULT_APPEARANCE };

  constructor(private g: Game) {}

  hide() {
    this.root.innerHTML = '';
    this.root.className = '';
  }

  title() {
    const g = this.g;
    const s = g.save;
    const ch = g.hasSave && s.character;
    const total = SKILLS.reduce((t, k) => t + levelForXp(s.skills[k]), 0);
    this.root.className = 'screen title';
    this.root.innerHTML = `
      <div class="title-vignette"></div>
      <div class="logo">
        <img class="logo-main" src="./ui/logo.png" alt="Dragonbound" draggable="false">
        <div class="logo-rule"><span></span>◆<span></span></div>
        <div class="logo-sub">Chapter I · The Hidden Keep</div>
      </div>
      <div class="menu">
        ${ch ? `<button class="mbtn primary" data-m="continue">Continue<small>${esc(s.character!.name)} · total level ${total} · ${fmt(s.stats.playtime / 60)} min played</small></button>` : ''}
        <button class="mbtn ${ch ? '' : 'primary'}" data-m="new">New Game</button>
        <button class="mbtn" data-m="quit">Quit</button>
      </div>
      <div class="title-foot">A chunky ARPG of dragons, forges and very long grinds.</div>`;
    paintTree(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        g.sfx.unlock();
        g.sfx.play('ui');
        const m = b.dataset.m;
        if (m === 'continue') {
          this.hide();
          g.continueGame();
        } else if (m === 'new') {
          if (ch && !confirm(`Start over? ${s.character!.name}'s progress will be replaced.`)) return;
          g.showCreate();
        } else if (m === 'quit') {
          window.close();
        }
      }),
    );
  }

  create() {
    const g = this.g;
    this.look = { ...DEFAULT_APPEARANCE };
    this.root.className = 'screen create';
    this.render();
    g.previewLook(this.look);
  }

  private render() {
    const L = this.look;
    const swatches = (key: keyof Appearance, colors: number[]) =>
      `<div class="swatches">${colors.map((c, i) => `<button class="sw ${L[key] === i ? 'on' : ''}" data-k="${key}" data-v="${i}" style="background:${hex(c)}"></button>`).join('')}</div>`;
    const stepper = (key: keyof Appearance, names: string[]) =>
      `<div class="stepper"><button class="btn sm" data-step="${key}" data-d="-1">◀</button><span>${names[L[key] as number]}</span><button class="btn sm" data-step="${key}" data-d="1">▶</button></div>`;
    this.root.innerHTML = `
      <div class="create-panel frame">
        <div class="ptitle"><span>Forge your hero</span></div>
        <div class="pbody">
          <label class="field">Name<input class="nameinp" maxlength="16" placeholder="Name your hero" value="${esc(L.name)}"></label>
          <div class="field">Skin${swatches('skin', SKIN_TONES)}</div>
          <div class="field">Hair${stepper('hair', HAIR_STYLES)}</div>
          <div class="field">Hair colour${swatches('hairColor', HAIR_COLORS)}</div>
          <div class="field">Beard${stepper('beard', BEARD_STYLES)}</div>
          <div class="field">Tunic${swatches('cloth', CLOTH_COLORS)}</div>
          <div class="field">Trousers${swatches('cloth2', CLOTH_COLORS)}</div>
          <label class="check"><input type="checkbox" class="skip"> Skip the tutorial (you'll get starter gear)</label>
          <div class="btnrow"><button class="btn" data-act="back">Back</button><button class="btn primary" data-act="begin">Begin</button></div>
          <div class="err"></div>
        </div>
      </div>
      <div class="create-hint">Drag to rotate</div>`;
    paintTree(this.root);
    const root = this.root;
    const name = root.querySelector<HTMLInputElement>('.nameinp')!;
    name.addEventListener('input', () => (L.name = name.value));
    name.addEventListener('keydown', (e) => e.stopPropagation());
    root.querySelectorAll<HTMLElement>('.sw').forEach((b) => b.addEventListener('click', () => {
      (L as any)[b.dataset.k!] = Number(b.dataset.v);
      this.refresh();
    }));
    root.querySelectorAll<HTMLElement>('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.step as 'hair' | 'beard';
      const n = k === 'hair' ? HAIR_STYLES.length : BEARD_STYLES.length;
      L[k] = (L[k] + Number(b.dataset.d) + n) % n;
      this.refresh();
    }));
    root.querySelector('[data-act="back"]')!.addEventListener('click', () => {
      this.g.mode = 'title';
      this.g.player.obj.visible = false;
      this.title();
    });
    root.querySelector('[data-act="begin"]')!.addEventListener('click', () => {
      const clean = L.name.trim().replace(/[^\p{L}\p{N} '-]/gu, '');
      if (clean.length < 2) {
        setText(root.querySelector('.err')!, 'Your hero needs a name (2+ letters).');
        return;
      }
      L.name = clean;
      const skip = root.querySelector<HTMLInputElement>('.skip')!.checked;
      this.hide();
      this.g.newGame({ ...L }, skip);
    });
  }

  private refresh() {
    const focusName = document.activeElement?.classList.contains('nameinp');
    this.render();
    if (focusName) this.root.querySelector<HTMLInputElement>('.nameinp')?.focus();
    this.g.previewLook(this.look);
  }
}
