import { describe, expect, it } from 'vitest';
import { buildMainWindowOptions } from './mainWindowOptions';

// hole-punch方式: preview矩形をBrowserWindow側で透過させるため、ウィンドウ
// 自体をtransparent化する。titleBarStyle: 'hiddenInset'はmacOSでtransparent
// と併用可能（Electron公式のtransparent windowサンプルもhiddenInsetを使用）。
describe('buildMainWindowOptions', () => {
  it('marks the window transparent with a fully transparent background colour', () => {
    const options = buildMainWindowOptions({ isExportTest: false, iconPath: '/tmp/icon.jpg', preloadPath: '/tmp/preload.js' });
    expect(options.transparent).toBe(true);
    expect(options.backgroundColor).toBe('#00000000');
  });

  it('keeps titleBarStyle hiddenInset', () => {
    const options = buildMainWindowOptions({ isExportTest: false, iconPath: '/tmp/icon.jpg', preloadPath: '/tmp/preload.js' });
    expect(options.titleBarStyle).toBe('hiddenInset');
  });

  it('hides the window during export tests to avoid a double window', () => {
    const options = buildMainWindowOptions({ isExportTest: true, iconPath: '/tmp/icon.jpg', preloadPath: '/tmp/preload.js' });
    expect(options.show).toBe(false);
  });
});
