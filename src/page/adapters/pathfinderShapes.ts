// Tolerant readers for Pathfinder responses.
// Play counts appear as `{ uri: "spotify:track:<id>", playcount: "<digits>" }` in several
// operations (getAlbum, queryArtistOverview, fetchPlaylist, getTrack...): see docs/phase0-findings.md.
// The walker does not depend on the surrounding path, so renamed wrappers keep working.

const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const DIGITS = /^\d{1,15}$/;
const MAX_DEPTH = 40;
const MAX_NODES = 200_000;

function readCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && DIGITS.test(value)) return Number(value);
  return null;
}

/** Track ID → play count for every track object in the response. */
export function extractPlaycounts(json: unknown): Map<string, number> {
  const found = new Map<string, number>();
  let visited = 0;

  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || ++visited > MAX_NODES) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    const uri = record['uri'];
    if (typeof uri === 'string' && 'playcount' in record) {
      const id = TRACK_URI.exec(uri)?.[1];
      const count = readCount(record['playcount']);
      if (id && count !== null) found.set(id, count);
    }
    for (const value of Object.values(record)) {
      if (typeof value === 'object' && value !== null) walk(value, depth + 1);
    }
  };

  walk(json, 0);
  return found;
}
