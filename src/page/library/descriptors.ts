// Descriptors (genres and moods) of the liked songs, the data behind the desktop app's Liked
// Songs chips. Asked to the player's extended metadata service only for the tracks missing from
// the local cache, 50 per request, spaced like our other requests; kept in storage.local under
// the hashed per-user key, and asked again only when the player's language changes.
import {
  EXTENDED_METADATA_URL,
  EXTENSION_KINDS,
  extendedMetadataBody,
  parseTrackDescriptors,
} from '../adapters/extendedMetadata';
import type { SpclientRequests } from '../core/spclient';
import { MAX_CACHE_TRACKS, type DescriptorCache } from '../../shared/descriptorCache';

/** Tracks per request (checked live: 50 works). */
export const DESCRIPTOR_BATCH = 50;
/** The cache is saved after this many requests, so a long first build survives a reload. */
const SAVE_EVERY = 5;

export interface DescriptorLibraryDeps {
  spclient: SpclientRequests | null;
  /** Hashed per-user storage key, as for the liked songs index. */
  storageKey: () => Promise<string | null>;
  load: (key: string) => Promise<DescriptorCache | null>;
  save: (key: string, cache: DescriptorCache) => void;
  /** The player's language, which the names come in. */
  lang: () => string;
}

export class DescriptorLibrary {
  private cache: DescriptorCache | null = null;
  private key: string | null = null;
  private running: Promise<DescriptorCache | null> | null = null;

  constructor(private readonly deps: DescriptorLibraryDeps) {}

  /** Concept IDs of a track, or undefined when not known yet. */
  conceptsOf(trackId: string): readonly string[] | undefined {
    return this.cache?.tracks[trackId];
  }

  get current(): DescriptorCache | null {
    return this.cache;
  }

  /** Makes sure the descriptors of `trackIds` are known; resolves to the cache (null if unavailable). */
  ensure(trackIds: readonly string[]): Promise<DescriptorCache | null> {
    this.running ??= this.run(trackIds).finally(() => (this.running = null));
    return this.running;
  }

  private async run(trackIds: readonly string[]): Promise<DescriptorCache | null> {
    const key = await this.deps.storageKey();
    if (!key) return null;
    const lang = this.deps.lang();
    if (this.key !== key || !this.cache) {
      this.key = key;
      this.cache = await this.deps.load(key);
    }
    if (!this.cache || this.cache.lang !== lang) this.cache = { v: 1, lang, concepts: {}, tracks: {} };
    const cache = this.cache;
    const missing = trackIds.filter((id) => !(id in cache.tracks)).slice(0, Math.max(0, MAX_CACHE_TRACKS - Object.keys(cache.tracks).length));
    if (!missing.length || !this.deps.spclient) return cache;

    let requests = 0;
    let changed = false;
    for (let i = 0; i < missing.length; i += DESCRIPTOR_BATCH) {
      const batch = missing.slice(i, i + DESCRIPTOR_BATCH);
      const bytes = await this.deps.spclient.postForProtobuf(
        EXTENDED_METADATA_URL,
        extendedMetadataBody(batch.map((id) => `spotify:track:${id}`), EXTENSION_KINDS.TRACK_DESCRIPTOR),
      );
      if (!bytes) break; // try again on a later visit
      let found: ReturnType<typeof parseTrackDescriptors>;
      try {
        found = parseTrackDescriptors(bytes);
      } catch {
        break;
      }
      for (const id of batch) {
        const descriptors = found.get(id) ?? [];
        cache.tracks[id] = descriptors.map((d) => d.concept);
        for (const d of descriptors) cache.concepts[d.concept] ??= { n: d.name, c: d.classes };
      }
      changed = true;
      requests += 1;
      if (requests % SAVE_EVERY === 0) this.deps.save(key, cache);
    }
    if (changed) this.deps.save(key, cache);
    return cache;
  }
}
