// Builds the list of JSON paths of a value: keys and leaf types only, never values.
// Arrays are collapsed as `[]` and their elements merged.

export interface PathEntry {
  path: string;
  /** Leaf types seen at this path: string, number, boolean, null, empty-array, empty-object. */
  types: string[];
  highlighted: boolean;
}

export interface PathMap {
  entries: PathEntry[];
  truncated: boolean;
}

export interface PathMapOptions {
  highlightKeys?: readonly string[];
  maxEntries?: number;
  maxDepth?: number;
  /** Array elements inspected per array; enough to catch heterogeneous items. */
  maxArrayItems?: number;
}

const IDENTIFIER_KEY = /^[A-Za-z_$][\w$-]{0,63}$/;
const BASE62_ID = /^[A-Za-z0-9]{22}$/;

/** Keys that look like data (IDs, URIs, free text) are masked, since they are values in disguise. */
export function maskKey(key: string): string {
  if (BASE62_ID.test(key) && /\d/.test(key)) return '<id>';
  if (!IDENTIFIER_KEY.test(key)) return '<key>';
  return key;
}

function leafType(value: unknown): string | null {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length === 0 ? 'empty-array' : null;
  if (typeof value === 'object') return Object.keys(value).length === 0 ? 'empty-object' : null;
  return typeof value;
}

export function buildPathMap(value: unknown, options: PathMapOptions = {}): PathMap {
  const highlightKeys = (options.highlightKeys ?? []).map((key) => key.toLowerCase());
  const maxEntries = options.maxEntries ?? 3000;
  const maxDepth = options.maxDepth ?? 40;
  const maxArrayItems = options.maxArrayItems ?? 50;

  const types = new Map<string, Set<string>>();
  let truncated = false;

  const add = (path: string, type: string) => {
    let set = types.get(path);
    if (!set) {
      if (types.size >= maxEntries) {
        truncated = true;
        return;
      }
      set = new Set();
      types.set(path, set);
    }
    set.add(type);
  };

  const walk = (node: unknown, path: string, depth: number) => {
    const leaf = leafType(node);
    if (leaf !== null) {
      add(path, leaf);
      return;
    }
    if (depth >= maxDepth) {
      add(path, 'max-depth');
      truncated = true;
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node.slice(0, maxArrayItems)) walk(item, `${path}[]`, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      walk(child, `${path}.${maskKey(key)}`, depth + 1);
    }
  };

  walk(value, '$', 0);

  const isHighlighted = (path: string) => {
    const keys = path.toLowerCase().split(/[.[\]]+/);
    return keys.some((key) => highlightKeys.some((wanted) => key.includes(wanted)));
  };

  const entries = [...types.entries()]
    .map(([path, set]) => ({ path, types: [...set].sort(), highlighted: isHighlighted(path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { entries, truncated };
}

export function formatPathEntry(entry: PathEntry): string {
  return `${entry.path}: ${entry.types.join(' | ')}`;
}
