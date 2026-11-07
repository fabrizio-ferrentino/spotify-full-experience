// The player's own library writes, reached through its internal service registry: the
// CurationAPI whose curateItems(itemUri, curateContextUris, uncurateContextUris) its "saved in"
// dialog calls. It sends the same applyCurations request we would, and also updates the player's
// in-memory "saved" ticks (Popular rows, now playing bar), which our own requests leave stale
// until a reload. Checked live on 2026-11-07: the registry comes from the `getRegistry()` of a
// React context value above <main>, keyed by symbols described "CurationAPI", "LibraryAPI"...
//
// Lookup only: nothing of the player is changed. Any mismatch returns null, and the caller falls
// back to its own request.

const FIBER_KEY_PREFIX = '__reactFiber$';
const REGISTRY_GETTER = 'getRegistry';
const CURATION_API = 'CurationAPI';
/** <main> sits about 170 levels below the provider of the registry. */
const MAX_DEPTH = 500;

export interface PlayerCuration {
  /** Saves `itemUri` in the `curate` contexts and removes it from the `uncurate` ones; rejects on failure. */
  curateItems(itemUri: string, curate: string[], uncurate: string[]): Promise<unknown>;
}

interface Fiber {
  return?: Fiber | null;
  type?: { _context?: unknown } | string | null;
  memoizedProps?: { value?: unknown } | null;
}

type Loose = Record<string | symbol, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null;
}

/** The player's CurationAPI, found from an element rendered by the player (e.g. <main>). */
export function findPlayerCuration(start: Element | null): PlayerCuration | null {
  try {
    if (!start) return null;
    const key = Object.keys(start).find((name) => name.startsWith(FIBER_KEY_PREFIX));
    let fiber = key ? ((start as unknown as Loose)[key] as Fiber | undefined) : undefined;
    for (let depth = 0; fiber && depth < MAX_DEPTH; depth += 1, fiber = fiber.return ?? undefined) {
      const type = fiber.type;
      if (!isObject(type) || !type._context) continue;
      const value = fiber.memoizedProps?.value;
      if (isObject(value) && typeof value[REGISTRY_GETTER] === 'function') {
        return curationFrom((value[REGISTRY_GETTER] as () => unknown).call(value));
      }
    }
  } catch {
    // The player changed: no access, the caller uses its own request.
  }
  return null;
}

function curationFrom(registry: unknown): PlayerCuration | null {
  if (!isObject(registry) || typeof registry.resolve !== 'function' || !(registry._map instanceof Map)) return null;
  const key = [...(registry._map as Map<unknown, unknown>).keys()].find(
    (entry) => (typeof entry === 'symbol' ? entry.description : entry) === CURATION_API,
  );
  if (key === undefined) return null;
  const api = (registry.resolve as (key: unknown) => unknown).call(registry, key);
  if (!isObject(api) || typeof api.curateItems !== 'function') return null;
  const curateItems = api.curateItems as (itemUri: string, curate: string[], uncurate: string[]) => Promise<unknown>;
  return { curateItems: (itemUri, curate, uncurate) => Promise.resolve(curateItems.call(api, itemUri, curate, uncurate)) };
}
