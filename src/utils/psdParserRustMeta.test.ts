import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePsdAsObject } from './psdParser';

// path B prototype: `?psdRustImport=1` should route parsePsdAsObject straight
// to the 'parse-psd-meta' IPC channel, bypassing ag-psd (parsePsdWithWasm)
// entirely. See vm_tuning_research/notes/e2e-path-b-rust-metadata-import.md.
// Test environment is 'node' (see vite.config.ts), so `window` is stubbed
// manually the same way mediaMetadata.test.ts does it.

vi.mock('./psdWasm', () => ({
  parsePsdWithWasm: vi.fn().mockRejectedValue(new Error('should not be called in path B')),
}));

const makeElectronFile = (path: string): File => {
  const file = new File([new Uint8Array(4)], 'sample.psd', { type: 'image/vnd.adobe.photoshop' }) as File & {
    path: string;
  };
  file.path = path;
  return file;
};

const stubWindow = (search: string, invoke: (channel: string, payload: { filePath?: string }) => unknown) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search },
      ipcRenderer: { invoke },
    },
  });
};

describe('parsePsdAsObject (psdRustImport flag)', () => {
  const previousWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  });

  it('routes to parse-psd-meta and skips ag-psd when the flag is set', async () => {
    const invoke = vi.fn(async (channel: string, payload: { filePath?: string }) => {
      expect(channel).toBe('parse-psd-meta');
      expect(payload.filePath).toBe('/tmp/sample.psd');
      return {
        success: true,
        width: 64,
        height: 48,
        nodes: [
          {
            psdId: 42,
            parentPsdId: null,
            isGroup: true,
            name: 'Character',
            width: 64,
            height: 48,
            top: 0,
            left: 0,
            defaultVisible: true,
            order: 0,
          },
          {
            psdId: 1,
            parentPsdId: 42,
            isGroup: false,
            name: 'Face',
            width: 16,
            height: 16,
            top: 4,
            left: 8,
            defaultVisible: true,
            order: 0,
          },
        ],
      };
    });
    stubWindow('?psdRustImport=1', invoke);

    const file = makeElectronFile('/tmp/sample.psd');
    const result = await parsePsdAsObject(file, 3, 1920, 1080);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('parse-psd-meta', { filePath: '/tmp/sample.psd' });
    // Stable Rust-issued ids, same scheme as the pixel-carrying Rust path.
    expect(result.psdObject.rootLayer?.children[0].id).toBe('psd-group-42');
    expect(result.psdObject.rootLayer?.children[0].children[0].id).toBe('psd-layer-1');
    // path B never receives pixels: no ImageBitmap textureSource.
    expect(result.psdObject.rootLayer?.children[0].children[0].textureSource).toBeUndefined();
  });

  it('does not touch parse-psd-meta when the flag is absent', async () => {
    // No flag in the URL: falls through to the normal paths (WASM mocked to
    // reject above, Rust 'parse-psd' fallback, then ag-psd on this invalid
    // fixture) and eventually rejects — the point of this test is only that
    // 'parse-psd-meta' is never dialled.
    const invoke = vi.fn();
    stubWindow('', invoke);

    const file = makeElectronFile('/tmp/sample.psd');
    await expect(parsePsdAsObject(file, 0, 1920, 1080)).rejects.toThrow();

    expect(invoke).not.toHaveBeenCalledWith('parse-psd-meta', expect.anything());
  });
});
