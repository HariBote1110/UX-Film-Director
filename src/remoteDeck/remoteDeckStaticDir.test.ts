import { describe, expect, it } from 'vitest';
import { resolveRemoteDeckStaticDir } from '../../electron/remoteDeckStaticDir';

describe('resolveRemoteDeckStaticDir', () => {
  it('uses resourcesPath in packaged builds (extraResources layout)', () => {
    expect(
      resolveRemoteDeckStaticDir({
        isPackaged: true,
        resourcesPath: '/Applications/UXFD.app/Contents/Resources',
        appDirname: '/Applications/UXFD.app/Contents/Resources/app.asar/dist-electron',
      }),
    ).toBe('/Applications/UXFD.app/Contents/Resources/remote-deck-ui');
  });

  it('uses the repo-relative dist directory during development', () => {
    expect(
      resolveRemoteDeckStaticDir({
        isPackaged: false,
        resourcesPath: '/whatever',
        appDirname: '/Users/dev/UX-Film-Director/dist-electron',
      }),
    ).toBe('/Users/dev/UX-Film-Director/remote-deck-ui/dist');
  });
});

describe('electron-builder packaging of the deck UI', () => {
  it('bundles remote-deck-ui/dist via extraResources and builds it in the build script', async () => {
    const { readFileSync } = await import('node:fs');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

    const entry = (packageJson.build.extraResources as Array<{ from: string; to: string }>).find(
      (resource) => resource.to === 'remote-deck-ui',
    );
    expect(entry?.from).toBe('remote-deck-ui/dist');

    expect(packageJson.scripts.build).toContain('remote-deck:build');
    // electron-builder の前にデッキ UI がビルドされていること
    expect(packageJson.scripts.build.indexOf('remote-deck:build')).toBeLessThan(
      packageJson.scripts.build.indexOf('electron-builder'),
    );
  });
});
