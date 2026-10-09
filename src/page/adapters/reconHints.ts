// Field names the Phase 0 reconnaissance looks for (CLAUDE.md §4).
// Matched case-insensitively against whole JSON keys.
export const RECON_HIGHLIGHT_KEYS: readonly string[] = ['playcount', 'uri', 'artists', 'totalcount', 'addedat'];
