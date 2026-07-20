import { requestRustBackendFontsList, type RustBackendFontsBridge } from './rustBackendFontsControl';

/**
 * fonts.list RPC が利用できない場合（Rust backend 未起動、preload 未更新など）
 * のフォールバック候補。よく使われる代表的なフォントに限定する。
 */
export const DEFAULT_FONT_FAMILIES: readonly string[] = [
  'Arial',
  'Helvetica Neue',
  'Hiragino Sans',
  'Times New Roman',
  'Courier New',
];

/**
 * インストール済みフォントファミリーの選択肢を取得する。
 *
 * rust-backend の fonts.list RPC（cosmic-text の FontSystem 由来）を優先し、
 * RPC が失敗・未対応・空リストのいずれかの場合は静的フォールバックへ落ちる。
 */
export const loadFontFamilyOptions = async (
  bridge?: RustBackendFontsBridge
): Promise<string[]> => {
  try {
    const response = await requestRustBackendFontsList(bridge);
    if (response.success && response.result && response.result.families.length > 0) {
      return response.result.families;
    }
  } catch {
    // フォールバックへ進む。
  }
  return [...DEFAULT_FONT_FAMILIES];
};
