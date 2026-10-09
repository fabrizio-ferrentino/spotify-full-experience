// In-memory play counts by track ID. The player refetches album data on every visit,
// so there is no persistent cache (see docs/phase0-findings.md).

const MAX_ENTRIES = 5000;

export class PlaycountStore {
  private readonly counts = new Map<string, number>();

  get(trackId: string): number | undefined {
    return this.counts.get(trackId);
  }

  /** Adds or refreshes counts; returns true when anything changed. */
  ingest(entries: ReadonlyMap<string, number>): boolean {
    let changed = false;
    for (const [trackId, count] of entries) {
      if (this.counts.get(trackId) === count) continue;
      this.counts.delete(trackId); // re-insert to keep the most recent entries last
      this.counts.set(trackId, count);
      changed = true;
    }
    while (this.counts.size > MAX_ENTRIES) {
      const oldest = this.counts.keys().next().value;
      if (oldest === undefined) break;
      this.counts.delete(oldest);
    }
    return changed;
  }

  clear(): void {
    this.counts.clear();
  }

  get size(): number {
    return this.counts.size;
  }
}
