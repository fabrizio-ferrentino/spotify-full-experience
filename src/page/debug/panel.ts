// Floating debug panel: lists recent captures and exports anonymized fixtures.
// Lives in a closed shadow root attached to <html>, outside the player's React tree.
// Built with DOM APIs only (no innerHTML), and never shows response values.
import type { CapturedRequest } from '../core/interceptor';
import { exportFixture } from './fixture';
import { getRecords, onRecordsChange } from './recorder';
import { requestTitle } from './requestLog';

const MAX_ROWS = 60;

const STYLE = `
  :host { all: initial; }
  .wrap { position: fixed; right: 16px; bottom: 104px; z-index: 2147483647;
    font: 12px/1.4 system-ui, sans-serif; color: #f0f0f0; }
  button { font: inherit; color: inherit; cursor: pointer; border: 1px solid #555;
    background: #2a2a2a; border-radius: 6px; padding: 3px 8px; }
  button:hover { background: #3a3a3a; }
  .toggle { float: right; font-weight: 700; color: #1ed760; }
  .box { clear: both; margin-top: 6px; width: min(560px, calc(100vw - 32px)); max-height: 50vh;
    display: flex; flex-direction: column; background: #181818; border: 1px solid #444;
    border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
  .box[hidden] { display: none; }
  .head { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid #333; }
  input { flex: 1; font: inherit; color: inherit; background: #222; border: 1px solid #555;
    border-radius: 6px; padding: 3px 6px; }
  ul { list-style: none; margin: 0; padding: 0; overflow: auto; }
  li { display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-bottom: 1px solid #262626; }
  li span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { padding: 6px 8px; color: #b3b3b3; min-height: 1.4em; }
  .error { color: #ff8a80; }
`;

interface PanelState {
  host: HTMLElement;
  list: HTMLUListElement;
  filter: HTMLInputElement;
  status: HTMLElement;
  box: HTMLElement;
  unsubscribe: () => void;
  frame: number | null;
}

let state: PanelState | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

function download(root: ShadowRoot, fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { href: url, download: fileName });
  root.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onExport(root: ShadowRoot, capture: CapturedRequest): void {
  if (!state) return;
  const result = exportFixture(capture);
  if (result.ok) {
    download(root, result.fileName, result.text);
    state.status.className = 'status';
    state.status.textContent = `Exported ${result.fileName}. Move it to test/fixtures/ and review it before committing.`;
  } else {
    state.status.className = 'status error';
    state.status.textContent = `Export refused, still contains: ${result.problems.join(', ')}.`;
  }
}

function render(root: ShadowRoot): void {
  if (!state) return;
  state.frame = null;
  const query = state.filter.value.trim().toLowerCase();
  const rows = [...getRecords()]
    .reverse()
    .filter((capture) => !query || requestTitle(capture).toLowerCase().includes(query))
    .slice(0, MAX_ROWS)
    .map((capture) => {
      const title = requestTitle(capture);
      const exportButton = el('button', { textContent: 'Export', disabled: capture.json === undefined });
      exportButton.addEventListener('click', () => onExport(root, capture));
      const row = el('li');
      row.append(el('span', { textContent: `#${capture.id} ${title}`, title }), exportButton);
      return row;
    });
  state.list.replaceChildren(...rows);
}

function scheduleRender(root: ShadowRoot): void {
  if (!state || state.frame !== null) return;
  state.frame = requestAnimationFrame(() => render(root));
}

export function mountPanel(): void {
  if (state) return;
  const host = el('div');
  host.setAttribute('data-sfe-debug-panel', '');
  const root = host.attachShadow({ mode: 'closed' });

  const toggle = el('button', { className: 'toggle', textContent: 'SFE' });
  const box = el('div', { className: 'box', hidden: true });
  const filter = el('input', { type: 'search', placeholder: 'Filter by operation or endpoint' });
  const clear = el('button', { textContent: 'Clear filter' });
  const list = el('ul');
  const status = el('div', { className: 'status', textContent: 'Only responses with JSON can be exported.' });
  const head = el('div', { className: 'head' });
  head.append(filter, clear);
  box.append(head, list, status);
  const wrap = el('div', { className: 'wrap' });
  wrap.append(toggle, box);
  root.append(el('style', { textContent: STYLE }), wrap);

  toggle.addEventListener('click', () => {
    box.hidden = !box.hidden;
    if (!box.hidden) render(root);
  });
  filter.addEventListener('input', () => render(root));
  clear.addEventListener('click', () => {
    filter.value = '';
    render(root);
  });

  const unsubscribe = onRecordsChange(() => {
    if (!box.hidden) scheduleRender(root);
  });
  state = { host, list, filter, status, box, unsubscribe, frame: null };
  document.documentElement.append(host);
}

export function unmountPanel(): void {
  if (!state) return;
  state.unsubscribe();
  if (state.frame !== null) cancelAnimationFrame(state.frame);
  state.host.remove();
  state = null;
}
