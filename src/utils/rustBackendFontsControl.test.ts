import { describe, expect, it } from 'vitest';
import {
  requestRustBackendFontsList,
  type RustBackendFontsBridge,
} from './rustBackendFontsControl';

const bridge = (): {
  calls: unknown[];
  bridge: RustBackendFontsBridge;
} => {
  const calls: unknown[] = [];
  return {
    calls,
    bridge: {
      listFonts: async () => {
        calls.push(['listFonts']);
        return {
          success: true,
          result: { families: ['Arial', 'Hiragino Sans'] },
        };
      },
    },
  };
};

describe('rustBackendFontsControl', () => {
  it('requests the installed font family list through the Rust backend bridge', async () => {
    const mocked = bridge();

    const response = await requestRustBackendFontsList(mocked.bridge);

    expect(response).toEqual({
      success: true,
      result: { families: ['Arial', 'Hiragino Sans'] },
    });
    expect(mocked.calls).toEqual([['listFonts']]);
  });

  it('propagates a failure response from the bridge unchanged', async () => {
    const failingBridge: RustBackendFontsBridge = {
      listFonts: async () => ({ success: false, error: 'rust backend unavailable' }),
    };

    const response = await requestRustBackendFontsList(failingBridge);

    expect(response).toEqual({ success: false, error: 'rust backend unavailable' });
  });
});
