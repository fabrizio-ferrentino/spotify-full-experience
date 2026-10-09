// operationName → persisted query hash. Sources, in order of preference (CLAUDE.md §3):
// 1. the player's own traffic, 2. the player's JavaScript bundles, 3. hardcoded known hashes.
import { extractHashes, isPlayerBundle } from '../adapters/bundleHashes';
import { KNOWN_HASHES } from '../adapters/knownHashes';

export type HashSource = 'traffic' | 'bundle' | 'known';

export interface HashEntry {
  hash: string;
  source: HashSource;
  seenAt: number;
}

const SOURCE_ORDER: readonly HashSource[] = ['traffic', 'bundle', 'known'];
const HASH = /^[0-9a-f]{64}$/;

export class HashRegistry {
  private readonly entries = new Map<string, Map<HashSource, HashEntry>>();
  /** Hashes the server refused (PersistedQueryNotFound), per operation. */
  private readonly refused = new Map<string, Set<string>>();
  private bundleScan: Promise<void> | null = null;

  constructor(
    known: Readonly<Record<string, string>> = KNOWN_HASHES,
    private readonly loadBundles: () => Promise<string[]> = loadPlayerBundles,
  ) {
    for (const [operation, hash] of Object.entries(known)) this.set(operation, hash, 'known');
  }

  private set(operation: string, hash: string, source: HashSource): void {
    if (!HASH.test(hash)) return;
    let bySource = this.entries.get(operation);
    if (!bySource) {
      bySource = new Map();
      this.entries.set(operation, bySource);
    }
    bySource.set(source, { hash, source, seenAt: Date.now() });
    // A hash seen again in the player's traffic is valid again.
    if (source === 'traffic') this.refused.get(operation)?.delete(hash);
  }

  /** Records a hash used by the player's own request. */
  observe(operation: string | null, hash: string | null): void {
    if (operation && hash) this.set(operation, hash, 'traffic');
  }

  /** Best usable hash for an operation, skipping refused ones. */
  get(operation: string): HashEntry | null {
    const bySource = this.entries.get(operation);
    const refused = this.refused.get(operation);
    for (const source of SOURCE_ORDER) {
      const entry = bySource?.get(source);
      if (entry && !refused?.has(entry.hash)) return entry;
    }
    return null;
  }

  /** The server does not know this hash any more: try another source next time. */
  refuse(operation: string, hash: string): void {
    let set = this.refused.get(operation);
    if (!set) {
      set = new Set();
      this.refused.set(operation, set);
    }
    set.add(hash);
  }

  /** Scans the player's bundles once for the given operations. */
  async scanBundles(operations: readonly string[]): Promise<void> {
    this.bundleScan ??= (async () => {
      try {
        for (const source of await this.loadBundles()) {
          for (const [operation, hash] of extractHashes(source, operations)) this.set(operation, hash, 'bundle');
        }
      } catch {
        // Source 2 unavailable: sources 1 and 3 remain.
      }
    })();
    await this.bundleScan;
  }

  /** Operation → hash source, for debug mode. */
  describe(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const operation of [...this.entries.keys()].sort()) {
      const entry = this.get(operation);
      out[operation] = entry ? `${entry.source} ${entry.hash.slice(0, 8)}…` : 'refused';
    }
    return out;
  }
}

/** Sources of the player's bundles currently loaded in the page (same CDN the player uses). */
async function loadPlayerBundles(): Promise<string[]> {
  const sources: string[] = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    if (!isPlayerBundle(script.src)) continue;
    try {
      const response = await fetch(script.src);
      if (response.ok) sources.push(await response.text());
    } catch {
      // Skip this bundle.
    }
  }
  return sources;
}
