import type { Game } from '../game';
import type { Dialogue } from '../systems/story';
import { esc } from './dom';
import { icon } from './icons';
import { paintTree } from './uiText';

/** The conversation box at the bottom of the screen: a speaker, their words and numbered replies. */
export class DialogueBox {
  private current: Dialogue | null = null;

  /** `onOpen` runs each time a conversation opens, follow-ups included. */
  constructor(private g: Game, private root: HTMLElement, private onOpen: () => void) {}

  get isOpen() {
    return !!this.current;
  }

  open(d: Dialogue) {
    this.current = d;
    this.onOpen();
    this.root.innerHTML = `
      <div class="dlg frame">
        <div class="dlg-portrait">${icon(d.portrait === 'warden' ? 'magic' : 'gold', 56)}</div>
        <div class="dlg-main">
          <div class="dlg-name">${esc(d.speaker)}</div>
          <div class="dlg-text">${esc(d.text)}</div>
          <div class="dlg-opts">${d.options.map((o, i) => `<button class="dopt" data-i="${i}"><em>${i + 1}</em> ${esc(o.label)}</button>`).join('')}</div>
        </div>
      </div>`;
    paintTree(this.root);
    this.root.querySelectorAll<HTMLElement>('.dopt').forEach((b) => b.addEventListener('click', () => this.choose(d.options[Number(b.dataset.i)])));
    this.root.querySelector('.dlg')!.addEventListener('mousedown', (e) => e.stopPropagation());
    this.g.sfx.play('ui');
  }

  /** A reply picked by its number key (1 = the first); false when no conversation is open. */
  pickNumber(n: number): boolean {
    if (!this.current) return false;
    const opt = this.current.options[n - 1];
    if (opt) this.choose(opt);
    return true;
  }

  private choose(o: Dialogue['options'][number]) {
    this.close();
    o.run?.();
    const next = o.next?.();
    if (next) this.open(next);
  }

  close() {
    this.current = null;
    this.root.innerHTML = '';
  }
}
