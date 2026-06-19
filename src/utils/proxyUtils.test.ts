import { afterEach, describe, expect, it, vi } from 'vitest';

describe('proxyUtils', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('generates a preview proxy when no neighbouring proxy exists', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ exists: false, proxyPath: '/clips/source.proxy.mp4' })
      .mockResolvedValueOnce({ success: true, proxyPath: '/clips/source.proxy.mp4' });
    vi.stubGlobal('window', { ipcRenderer: { invoke } });

    const { resolveOrGeneratePreviewProxy } = await import('./proxyUtils');
    const proxyPath = await resolveOrGeneratePreviewProxy('/clips/source.MP4');

    expect(proxyPath).toBe('/clips/source.proxy.mp4');
    expect(invoke).toHaveBeenNthCalledWith(1, 'check-proxy', { filePath: '/clips/source.MP4' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'generate-proxy', {
      filePath: '/clips/source.MP4',
      width: 640,
    });
  });

  it('uses an existing preview proxy without regenerating it', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ exists: true, proxyPath: '/clips/source.proxy.mp4' });
    vi.stubGlobal('window', { ipcRenderer: { invoke } });

    const { resolveOrGeneratePreviewProxy } = await import('./proxyUtils');
    const proxyPath = await resolveOrGeneratePreviewProxy('/clips/source.MP4');

    expect(proxyPath).toBe('/clips/source.proxy.mp4');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
