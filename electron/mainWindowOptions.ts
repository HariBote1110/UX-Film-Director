import type { BrowserWindowConstructorOptions } from 'electron';

export interface BuildMainWindowOptionsInput {
  isExportTest: boolean;
  iconPath: string;
  preloadPath: string;
}

// hole-punch方式（Native_Overlay_Bug_E_Plan.md 系の後継設計）:
// native overlay (child NSWindow) は常に親BrowserWindowの下（NSWindowBelow）
// に常駐する。以前の「obstruction時にoverlayを下げる」方式（Bug E）は親が
// 不透明だと映像が消えてしまうため廃止し、代わりに親BrowserWindow自体を
// transparent化してpreview矩形をCSS側で透過させることで、常にoverlay映像が
// 見えつつHTML UI（トグル、コンテキストメニュー、モーダル等）は自然に
// その上へ重なる。
//
// macOSでは transparent: true と titleBarStyle: 'hiddenInset' は併用できる
// （Electron公式ドキュメントの frameless window サンプルもこの組み合わせを
// 使用している）。backgroundColor は完全透明の8桁ARGB形式 '#00000000' を
// 指定する（Electronのtransparent windowはbackgroundColorのアルファ成分で
// 透明度を制御する）。
export function buildMainWindowOptions(input: BuildMainWindowOptionsInput): BrowserWindowConstructorOptions {
  const { isExportTest, iconPath, preloadPath } = input;
  return {
    width: 1280,
    height: 800,
    icon: iconPath,
    show: !isExportTest, // テスト実行時はウィンドウを非表示（2窓防止）
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      webviewTag: true,
      devTools: !isExportTest,
    },
    titleBarStyle: 'hiddenInset',
  };
}
