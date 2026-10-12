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
