import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT_FAMILIES, loadFontFamilyOptions } from './fontFamilyOptions';
import type { RustBackendFontsBridge } from './rustBackendFontsControl';

describe('fontFamilyOptions', () => {
  it('returns the backend font family list when the RPC succeeds', async () => {
    const bridge: RustBackendFontsBridge = {
      listFonts: async () => ({
        success: true,
        result: { families: ['Courier New', 'Hiragino Sans', 'Meiryo'] },
      }),
    };

    const families = await loadFontFamilyOptions(bridge);

    expect(families).toEqual(['Courier New', 'Hiragino Sans', 'Meiryo']);
  });

  it('falls back to the static list when the RPC reports failure', async () => {
    const bridge: RustBackendFontsBridge = {
      listFonts: async () => ({ success: false, error: 'rust backend unavailable' }),
    };

    const families = await loadFontFamilyOptions(bridge);

    expect(families).toEqual([...DEFAULT_FONT_FAMILIES]);
  });

  it('falls back to the static list when the RPC returns an empty family list', async () => {
    const bridge: RustBackendFontsBridge = {
      listFonts: async () => ({ success: true, result: { families: [] } }),
    };

    const families = await loadFontFamilyOptions(bridge);

    expect(families).toEqual([...DEFAULT_FONT_FAMILIES]);
  });

  it('falls back to the static list when the bridge is unavailable and throws', async () => {
    const bridge: RustBackendFontsBridge = {
      listFonts: async () => {
        throw new Error('IPC channel missing');
      },
    };

    const families = await loadFontFamilyOptions(bridge);

    expect(families).toEqual([...DEFAULT_FONT_FAMILIES]);
  });
});
