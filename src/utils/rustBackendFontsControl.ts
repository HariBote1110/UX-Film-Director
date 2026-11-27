import type { RustBackendResult } from './rustBackendVideoDecodeControl';

export interface RustBackendFontsListResult {
  families: string[];
}

export interface RustBackendFontsBridge {
  listFonts: () => Promise<RustBackendResult<RustBackendFontsListResult>>;
}

const defaultRustBackendFontsBridge = (): RustBackendFontsBridge => ({
  listFonts: () =>
    window.rustBackend.listFonts() as Promise<RustBackendResult<RustBackendFontsListResult>>,
});

export const requestRustBackendFontsList = (
  bridge: RustBackendFontsBridge = defaultRustBackendFontsBridge()
): Promise<RustBackendResult<RustBackendFontsListResult>> => bridge.listFonts();
