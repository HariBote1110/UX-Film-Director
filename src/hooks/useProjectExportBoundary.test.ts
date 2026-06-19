import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const useProjectExportSource = () =>
  readFileSync(new URL('./useProjectExport.ts', import.meta.url), 'utf8');

const viewportSource = () =>
  readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

describe('useProjectExport boundary', () => {
  it('does not depend on Pixi application types or refs', () => {
    const code = useProjectExportSource();

    expect(code).not.toContain("import * as PIXI from 'pixi.js'");
    expect(code).not.toContain('PIXI.Application');
    expect(code).not.toContain('pixiAppRef');
  });

  it('does not capture browser canvas frames directly inside the hook body', () => {
    const code = useProjectExportSource();

    expect(code).not.toContain('createImageBitmap(');
  });

  it('receives export canvas access through a provider from the Viewport', () => {
    const code = viewportSource();

    expect(code).toContain(
      'useProjectExport(renderScene, getExportCanvas, getRustExportFrameSource)'
    );
    expect(code).not.toContain('useProjectExport(pixiAppRef');
    expect(useProjectExportSource()).not.toContain('exportFrameOverridesRef');
  });

  it('does not capture ipcRenderer at module load before Electron preload is available', () => {
    const code = useProjectExportSource();

    expect(code).not.toContain('const { ipcRenderer } = window');
    expect(code).toContain('getProjectExportIpcRenderer');
  });
});
