import { describe, expect, it } from 'vitest';
import { EXTENSION_KINDS, extendedMetadataBody, readProto } from '../../src/page/adapters/extendedMetadata';

describe('extended metadata', () => {
  it('builds the player request body with numeric kinds', () => {
    expect(extendedMetadataBody(['spotify:track:x'], EXTENSION_KINDS.TRACK_DESCRIPTOR)).toEqual({
      entityRequest: [{ entityUri: 'spotify:track:x', query: [{ extensionKind: 6, etag: '' }] }],
    });
  });

  it('reads protobuf fields, nested messages and text', () => {
    // field 1 = varint 150; field 2 = message { field 1 = "rock" }; field 3 = float 0.5
    const inner = [0x0a, 4, ...new TextEncoder().encode('rock')];
    const float = new Uint8Array(new Float32Array([0.5]).buffer);
    const bytes = new Uint8Array([0x08, 0x96, 0x01, 0x12, inner.length, ...inner, 0x1d, ...float]);
    expect(readProto(bytes)).toEqual([
      { field: 1, varint: 150 },
      { field: 2, message: [{ field: 1, text: 'rock' }] },
      { field: 3, fixed: 0.5 },
    ]);
    expect(() => readProto(new Uint8Array([0x0a, 10, 1]))).toThrow();
  });
});
