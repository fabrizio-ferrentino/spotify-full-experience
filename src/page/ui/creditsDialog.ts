// "View credits" dialog, like the player's: the song's title, then each role group with its
// people (artists link to their page), and the sources at the bottom. Closes with ×, Escape or
// a click outside.
import { artistPath, navigateTo } from '../adapters/spotifyNav';
import type { TrackCredits } from '../adapters/trackShapes';
import { viewLabels } from './format';
import { appLink } from './trackList';
import { el, HOVER, icon, ICONS } from './typography';

const OWN = 'data-sfe-credits';
const SUBDUED = 'color: var(--text-subdued, #b3b3b3)';

export class CreditsDialog {
  private root: HTMLElement | null = null;
  private request = 0;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.root) return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(private readonly textClass: string) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Shows the dialog at once, then the credits when they arrive; `onError` if they don't. */
  open(title: string, load: () => Promise<TrackCredits>, onError: () => void): void {
    this.close();
    const labels = viewLabels();
    // Same layering as the player's dialogs: a dim backdrop over the whole page.
    const root = el('div', 'position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7)');
    root.setAttribute(OWN, '');
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) this.close();
    });
    const panel = el(
      'div',
      'display: flex; flex-direction: column; width: min(480px, calc(100vw - 32px)); max-height: min(640px, calc(100vh - 64px)); border-radius: 8px; background: #282828; box-shadow: 0 16px 24px rgba(0,0,0,0.3)',
      this.textClass,
    );
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', labels.credits);

    const header = el('div', 'display: flex; align-items: flex-start; gap: 16px; padding: 24px 24px 16px; border-bottom: 1px solid rgba(255,255,255,0.1)');
    const heading = el('div', 'flex: 1 1 auto; min-width: 0');
    const name = el('h2', 'margin: 0; font-size: 24px; font-weight: 700; line-height: 1.2');
    name.textContent = labels.credits;
    const subtitle = el('div', 'margin-top: 4px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis');
    subtitle.textContent = title;
    heading.append(name, subtitle);
    const close = el(
      'button',
      'flex: 0 0 32px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer',
    );
    close.type = 'button';
    close.setAttribute('aria-label', labels.close);
    close.append(icon(ICONS.close, 16));
    close.addEventListener('click', () => this.close());
    close.addEventListener('mouseenter', () => (close.style.background = HOVER));
    close.addEventListener('mouseleave', () => (close.style.background = 'transparent'));
    header.append(heading, close);

    const body = el('div', 'flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px 24px 24px');
    const loading = el('p', `${SUBDUED}; margin: 16px 0`);
    loading.textContent = labels.loading;
    body.append(loading);
    panel.append(header, body);
    root.append(panel);
    document.body.append(root);
    this.root = root;
    document.addEventListener('keydown', this.onKey, true);
    close.focus();

    const request = ++this.request;
    load().then(
      (credits) => {
        if (request !== this.request) return;
        if (credits.title) subtitle.textContent = credits.title;
        body.replaceChildren(...this.content(credits));
      },
      () => {
        if (request !== this.request) return;
        this.close();
        onError();
      },
    );
  }

  close(): void {
    this.request += 1;
    document.removeEventListener('keydown', this.onKey, true);
    this.root?.remove();
    this.root = null;
  }

  private content(credits: TrackCredits): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const group of credits.groups) {
      const section = el('section', 'margin-top: 16px');
      if (group.name) {
        const title = el('h3', 'margin: 0 0 8px; font-size: 18px; font-weight: 700');
        title.textContent = group.name;
        section.append(title);
      }
      for (const person of group.people) {
        const row = el('div', 'padding: 6px 0');
        // Artists link to their page inside the app, closing the dialog.
        const path = person.artistId ? artistPath(person.artistId) : null;
        const name = path
          ? appLink(path, 'display: inline-block', () => {
              this.close();
              navigateTo(path);
            })
          : el('div', '');
        name.textContent = person.name;
        const role = el('div', `${SUBDUED}; font-size: 14px`);
        role.textContent = person.role;
        row.append(name, role);
        section.append(row);
      }
      out.push(section);
    }
    if (credits.sources.length) {
      const sources = el('p', `${SUBDUED}; font-size: 14px; margin: 24px 0 0`);
      sources.textContent = `${viewLabels().sources}: ${credits.sources.join(', ')}`;
      out.push(sources);
    }
    return out;
  }
}
