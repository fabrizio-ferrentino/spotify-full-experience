// Extracts persisted query hashes from the player's JavaScript bundles (hash registry source 2).
// In the bundles an operation name is followed, within a short distance, by its sha256 hash
// (checked on 2026-10-10: the extracted hashes matched the live traffic for every operation).

const MAX_GAP = 200;

/** Bundle scripts of the web player, served by its CDN. */
export function isPlayerBundle(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && /(^|\.)spotifycdn\.com$/.test(url.hostname) && url.pathname.endsWith('.js');
  } catch {
    return false;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Operation name → hash for the wanted operations found in a bundle's source. */
export function extractHashes(source: string, operations: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const operation of operations) {
    // Same shape as checked live: the name as a whole word, then the first 64-hex token.
    const pattern = new RegExp(
      `\\W${escapeRegExp(operation)}\\W[\\s\\S]{0,${MAX_GAP}}?(?<![0-9a-f])([0-9a-f]{64})(?![0-9a-f])`,
    );
    const hash = pattern.exec(source)?.[1];
    if (hash) found.set(operation, hash);
  }
  return found;
}
