import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePsdWithWasm } from './psdWasm';
import { parsePsdArrayBufferAsObject } from './psdParser';

vi.mock('./psdWasm', () => ({
  parsePsdWithWasm: vi.fn(),
}));

const mockedParsePsdWithWasm = vi.mocked(parsePsdWithWasm);

describe('parsePsdArrayBufferAsObject', () => {
  beforeEach(() => {
    mockedParsePsdWithWasm.mockReset();
  });

  it('uses the WASM PSD metadata path so restored project layer ids stay Rust-stable', async () => {
    mockedParsePsdWithWasm.mockResolvedValue({
      meta: {
        width: 64,
        height: 48,
        depth: 8,
        isPsb: false,
        layers: [{
          name: 'Character',
          top: 0,
          left: 0,
          width: 64,
          height: 48,
          visible: true,
          isGroup: true,
          ownGroupId: 42,
          parentGroupId: null,
          pixelByteLen: 0,
        }, {
          name: 'Face',
          top: 4,
          left: 8,
          width: 16,
          height: 16,
          visible: true,
          isGroup: false,
          ownGroupId: null,
          parentGroupId: 42,
          pixelByteLen: 0,
        }],
      },
      pixels: [new Uint8Array(0), new Uint8Array(0)],
    });

    const result = await parsePsdArrayBufferAsObject(
      new ArrayBuffer(8),
      'restored.psd',
      3,
      1920,
      1080
    );

    expect(mockedParsePsdWithWasm).toHaveBeenCalledTimes(1);
    expect(result.psdObject.rootLayer?.children[0].id).toBe('psd-group-42');
    expect(result.psdObject.rootLayer?.children[0].children[0].id).toBe('psd-layer-1');
    expect(result.psdObject.activeLayerIds).toMatchObject({
      root: true,
      'psd-group-42': true,
      'psd-layer-1': true,
    });
    expect(result.psdObject.layerTree?.[0]).toMatchObject({
      name: 'Character',
      seq: null,
      children: [{
        name: 'Face',
        seq: 'psd-layer-1',
        checked: true,
      }],
    });
  });
});
