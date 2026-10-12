// The player's extended metadata service (checked live on 2026-10-12): `POST
// …/extended-metadata/v0/extended-metadata`, JSON body `{ entityRequest: [{ entityUri, query: [{
// extensionKind, etag }] }] }` with numeric kinds, protobuf response (`accept:
// application/protobuf`). Kind numbers come from the player's own enum.
import { SPCLIENT_WG } from './trackShapes';

export const EXTENDED_METADATA_URL = `${SPCLIENT_WG}/extended-metadata/v0/extended-metadata`;

/** Extension kinds from the player's enum (web-player bundle, 2026-10-12). */
export const EXTENSION_KINDS = {
  TRACK_DESCRIPTOR: 6,
} as const;

export function extendedMetadataBody(entityUris: readonly string[], kind: number): Record<string, unknown> {
  return { entityRequest: entityUris.map((entityUri) => ({ entityUri, query: [{ extensionKind: kind, etag: '' }] })) };
}

export type ProtoField =
  | { field: number; varint: number }
  | { field: number; text: string }
  | { field: number; message: ProtoField[] }
  | { field: number; bytes: number; hex?: string }
  | { field: number; fixed: number };

/**
 * Generic protobuf reader for debug mode: field numbers with values; length-delimited fields
 * read as a nested message when they parse as one, else as text when printable, else as a
 * byte count (with the bytes in hex when short, e.g. packed enums). Throws on malformed input.
 */
export function readProto(bytes: Uint8Array, depth = 0): ProtoField[] {
  const out: ProtoField[] = [];
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length) throw new Error('truncated varint');
      const byte = bytes[i++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return result;
      shift += 7;
      if (shift > 63) throw new Error('varint too long');
    }
  };
  while (i < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (field === 0) throw new Error('field 0');
    if (wire === 0) out.push({ field, varint: varint() });
    else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4;
      if (i + size > bytes.length) throw new Error('truncated fixed');
      const view = new DataView(bytes.buffer, bytes.byteOffset + i, size);
      out.push({ field, fixed: size === 4 ? view.getFloat32(0, true) : view.getFloat64(0, true) });
      i += size;
    } else if (wire === 2) {
      const length = varint();
      if (i + length > bytes.length) throw new Error('truncated bytes');
      const chunk = bytes.subarray(i, i + length);
      i += length;
      out.push(readChunk(field, chunk, depth));
    } else throw new Error(`wire type ${wire}`);
  }
  return out;
}

function readChunk(field: number, chunk: Uint8Array, depth: number): ProtoField {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(chunk);
  const printable = chunk.length > 0 && /^[\p{L}\p{N}\p{P}\p{Zs}\p{S}]+$/u.test(text);
  if (depth < 8 && !printable) {
    try {
      const message = readProto(chunk, depth + 1);
      if (message.length) return { field, message };
    } catch {
      // Not a message.
    }
  }
  if (printable) return { field, text };
  const hex = chunk.length <= 16 ? [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ') : undefined;
  return hex === undefined ? { field, bytes: chunk.length } : { field, bytes: chunk.length, hex };
}

/** One field of a protobuf message, without interpretation. */
interface RawField {
  field: number;
  wire: number;
  int: number;
  bytes: Uint8Array | null;
}

function rawFields(bytes: Uint8Array): RawField[] {
  const out: RawField[] = [];
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length || shift > 63) throw new Error('bad varint');
      const byte = bytes[i++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return result;
      shift += 7;
    }
  };
  while (i < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) out.push({ field, wire, int: varint(), bytes: null });
    else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4;
      if (i + size > bytes.length) throw new Error('truncated');
      out.push({ field, wire, int: 0, bytes: bytes.subarray(i, i + size) });
      i += size;
    } else if (wire === 2) {
      const length = varint();
      if (i + length > bytes.length) throw new Error('truncated');
      out.push({ field, wire, int: 0, bytes: bytes.subarray(i, i + length) });
      i += length;
    } else throw new Error(`wire type ${wire}`);
  }
  return out;
}

const decoder = new TextDecoder();
const text = (f: RawField | undefined) => (f?.wire === 2 && f.bytes ? decoder.decode(f.bytes) : '');

/** Packed varints (or a single one) of a repeated enum field. */
function packedInts(f: RawField): number[] {
  if (f.wire === 0) return [f.int];
  if (f.wire !== 2 || !f.bytes) return [];
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const byte of f.bytes) {
    value += (byte & 0x7f) * 2 ** shift;
    if (byte & 0x80) shift += 7;
    else {
      out.push(value);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

export interface TrackDescriptor {
  /** Concept ID (from `spotify:concept:<id>`). */
  concept: string;
  /** Display name, in the request's language. */
  name: string;
  /** Classes: 1 = genre, 2 = mood (others not mapped). */
  classes: number[];
  weight: number;
}

const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const CONCEPT_URI = /^spotify:concept:([A-Za-z0-9]{22})$/;

/**
 * TRACK_DESCRIPTOR response (checked live on 2026-10-12): `2 (repeated) { 2: kind, 3 (repeated)
 * { 2: entity uri, 3: Any { 2: { 1 (repeated) { 1: id, 2: weight (float), 3: classes (packed),
 * 4: concept uri, 5: display name } } } } }`. Tracks without descriptors map to []. Throws on
 * malformed protobuf.
 */
export function parseTrackDescriptors(bytes: Uint8Array): Map<string, TrackDescriptor[]> {
  const out = new Map<string, TrackDescriptor[]>();
  for (const array of rawFields(bytes).filter((f) => f.field === 2 && f.bytes)) {
    const arrayFields = rawFields(array.bytes!);
    const kind = arrayFields.find((f) => f.field === 2 && f.wire === 0)?.int;
    if (kind !== undefined && kind !== EXTENSION_KINDS.TRACK_DESCRIPTOR) continue;
    for (const entity of arrayFields.filter((f) => f.field === 3 && f.bytes)) {
      const entityFields = rawFields(entity.bytes!);
      const trackId = TRACK_URI.exec(text(entityFields.find((f) => f.field === 2)))?.[1];
      if (!trackId) continue;
      const any = entityFields.find((f) => f.field === 3 && f.bytes);
      const value = any ? rawFields(any.bytes!).find((f) => f.field === 2 && f.bytes) : undefined;
      const descriptors: TrackDescriptor[] = [];
      for (const item of value ? rawFields(value.bytes!).filter((f) => f.field === 1 && f.bytes) : []) {
        const fields = rawFields(item.bytes!);
        const concept = CONCEPT_URI.exec(text(fields.find((f) => f.field === 4)))?.[1];
        const name = text(fields.find((f) => f.field === 5)) || text(fields.find((f) => f.field === 1));
        if (!concept || !name) continue;
        const weightField = fields.find((f) => f.field === 2 && f.wire === 5);
        const weight = weightField?.bytes ? new DataView(weightField.bytes.buffer, weightField.bytes.byteOffset, 4).getFloat32(0, true) : 0;
        descriptors.push({ concept, name, classes: fields.filter((f) => f.field === 3).flatMap(packedInts), weight });
      }
      out.set(trackId, descriptors);
    }
  }
  return out;
}
