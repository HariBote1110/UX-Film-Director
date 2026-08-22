import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePsdAsObject } from './psdParser';

// R5-3: `parsePsdAsObject` routes unconditionally to the 'parse-psd-meta' IPC
// channel — no ag-psd, no URL flag gate. See
// progress/rust-source-of-truth-r5-psd-unification.md.
// Test environment is 'node' (see vite.config.ts), so `window` is stubbed
// manually the same way mediaMetadata.test.ts does it.
//
// R5-4: the ag-psd fallback path (`./psdWasm`) this test used to mock no
// longer exists in `psdParser.ts` at all — the module itself was deleted.

const makeElectronFile = (path: string): File => {
  const file = new File([new Uint8Array(4)], 'sample.psd', { type: 'image/vnd.adobe.photoshop' }) as File & {
    path: string;
  };
  file.path = path;
  return file;
};

const stubWindow = (invoke: (channel: string, payload: { filePath?: string }) => unknown) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search: '' },
      ipcRenderer: { invoke },
    },
  });
};

describe('parsePsdAsObject (single psd.parseMeta RPC path)', () => {
  const previousWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  });

  it('routes straight to parse-psd-meta and skips ag-psd', async () => {
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
    stubWindow(invoke);

    const file = makeElectronFile('/tmp/sample.psd');
    const result = await parsePsdAsObject(file, 3, 1920, 1080);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('parse-psd-meta', { filePath: '/tmp/sample.psd' });
    // Stable Rust-issued ids, same scheme as the pixel-carrying Rust path.
    expect(result.psdObject.rootLayer?.children[0].id).toBe('psd-group-42');
    expect(result.psdObject.rootLayer?.children[0].children[0].id).toBe('psd-layer-1');
    // Meta-only path never receives pixels: no ImageBitmap textureSource.
    expect(result.psdObject.rootLayer?.children[0].children[0].textureSource).toBeUndefined();
  });

  it('throws a clear Japanese error when the RPC reports failure, without falling back to ag-psd', async () => {
    const invoke = vi.fn(async () => ({
      success: false,
      error: 'malformed PSD header',
    }));
    stubWindow(invoke);

    const file = makeElectronFile('/tmp/broken.psd');
    await expect(parsePsdAsObject(file, 0, 1920, 1080)).rejects.toThrow('PSDファイルの解析に失敗しました');

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('parse-psd-meta', { filePath: '/tmp/broken.psd' });
  });

  it('throws a clear Japanese error when window.ipcRenderer is unavailable (non-Electron)', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { search: '' } },
    });

    const file = makeElectronFile('/tmp/sample.psd');
    await expect(parsePsdAsObject(file, 0, 1920, 1080)).rejects.toThrow('Electron 環境でのみ利用できます');
  });

  it('throws a clear Japanese error when the file has no filesystem path', async () => {
    const invoke = vi.fn();
    stubWindow(invoke);

    const file = new File([new Uint8Array(4)], 'sample.psd', { type: 'image/vnd.adobe.photoshop' });
    await expect(parsePsdAsObject(file, 0, 1920, 1080)).rejects.toThrow('Electron 環境でのみ利用できます');
    expect(invoke).not.toHaveBeenCalled();
  });
});
