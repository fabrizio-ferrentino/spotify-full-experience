// Feature: "Plays" column on album pages, fed passively by the player's own Pathfinder responses.
import { extractPlaycounts } from '../../adapters/pathfinderShapes';
import type { PageInfo } from '../../adapters/routes';
import { SELECTORS } from '../../adapters/spotifyDom';
import { frameScheduler, whenAvailable } from '../../core/dom';
import type { CapturedRequest } from '../../core/interceptor';
import { debugLog, debugWarn } from '../../debug/log';
import { formatCount, label } from '../../ui/format';
import { PlaycountColumn } from './column';
import { PlaycountStore } from './store';

export class PlaycountsFeature {
  private enabled = false;
  /** Title width chosen by the user (from the settings), null for the default layout. */
  private titleWidth: number | null = null;
  private onAlbumPage = false;
  private readonly store = new PlaycountStore();
  private column: PlaycountColumn | null = null;
  private mainObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cancelWait: (() => void) | null = null;
  private warnedLayout = false;
  private readonly scheduler = frameScheduler(() => this.sync());

  /** @param persistTitleWidth stores the title width chosen by dragging (via the bridge). */
  constructor(private readonly persistTitleWidth: (width: number | null) => void = () => {}) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    if (this.onAlbumPage) this.start();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.stop();
    this.store.clear();
  }

  setTitleWidth(width: number | null): void {
    if (width === this.titleWidth) return;
    this.titleWidth = width;
    if (this.onAlbumPage) this.scheduler.schedule();
  }

  onPageChange(page: PageInfo): void {
    this.onAlbumPage = page.kind === 'album';
    this.warnedLayout = false;
    if (this.enabled && this.onAlbumPage) this.start();
    else this.stop();
  }

  onCapture(capture: CapturedRequest): void {
    if (!this.enabled || capture.kind !== 'pathfinder' || capture.json === undefined) return;
    const counts = extractPlaycounts(capture.json);
    if (counts.size && this.store.ingest(counts)) {
      debugLog(`playcounts: ${counts.size} counts from ${capture.operationName ?? 'unnamed operation'}`);
      if (this.onAlbumPage) this.scheduler.schedule();
    }
  }

  teardown(): void {
    this.disable();
  }

  private start(): void {
    if (this.mainObserver || this.cancelWait) {
      this.scheduler.schedule();
      return;
    }
    this.cancelWait = whenAvailable<HTMLElement>(SELECTORS.main, (main) => {
      this.cancelWait = null;
      if (!this.enabled || !this.onAlbumPage) return;
      // Scoped to the page content; our own writes are idempotent, so they settle immediately.
      this.mainObserver = new MutationObserver(() => this.scheduler.schedule());
      this.mainObserver.observe(main, { childList: true, subtree: true });
      this.scheduler.schedule();
    });
  }

  private stop(): void {
    this.cancelWait?.();
    this.cancelWait = null;
    this.scheduler.cancel();
    this.mainObserver?.disconnect();
    this.mainObserver = null;
    this.detachColumn();
  }

  private detachColumn(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.column?.hide();
    this.column = null;
  }

  /** Follows the current track list (React may swap it) and re-renders the column. */
  private sync(): void {
    if (!this.enabled || !this.onAlbumPage) return;
    const list = document.querySelector<HTMLElement>(`${SELECTORS.main} ${SELECTORS.trackList}`);
    if (list !== this.column?.list) {
      this.detachColumn();
      if (!list) return;
      this.column = new PlaycountColumn(
        list,
        {
          lookup: (id) => this.store.get(id),
          label: () => label('playcounts'),
          format: (value) => formatCount(value),
          titleWidth: () => this.titleWidth,
          saveTitleWidth: (width) => {
            this.titleWidth = width;
            this.persistTitleWidth(width);
          },
        },
        undefined,
        () => this.scheduler.schedule(),
      );
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.scheduler.schedule());
        this.resizeObserver.observe(list);
      }
    }
    const column = this.column;
    if (!column) return;
    const wasShown = column.shown;
    column.render();
    if (column.shown && !wasShown) debugLog('playcounts: column shown');
    if (!column.shown && !this.warnedLayout && list?.querySelector(SELECTORS.trackRow) && this.store.size) {
      // Rows and data exist but the column stays hidden: narrow window, or the layout changed.
      this.warnedLayout = true;
      debugWarn('playcounts: column hidden (narrow list or no data for these rows)');
    }
  }
}
