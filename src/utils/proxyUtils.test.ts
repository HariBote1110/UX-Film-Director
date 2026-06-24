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

  it('treats above-FHD sources (4K) as needing a proxy and FHD-or-below as not', async () => {
    const { shouldGenerateProxyForResolution } = await import('./proxyUtils');

    // FHD 以下はプロキシ不要
    expect(shouldGenerateProxyForResolution(1920, 1080)).toBe(false);
    expect(shouldGenerateProxyForResolution(1280, 720)).toBe(false);
    // FHD を超える素材（4K, QHD, 縦長 4K 等）はプロキシ必要
    expect(shouldGenerateProxyForResolution(3840, 2160)).toBe(true);
    expect(shouldGenerateProxyForResolution(2560, 1440)).toBe(true);
    expect(shouldGenerateProxyForResolution(1080, 1920)).toBe(false);
    expect(shouldGenerateProxyForResolution(2160, 3840)).toBe(true);
  });

  it('skips proxy generation for FHD sources when source resolution is provided', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ exists: false, proxyPath: '/clips/source.proxy.mp4' });
    vi.stubGlobal('window', { ipcRenderer: { invoke } });

    const { resolveOrGeneratePreviewProxy } = await import('./proxyUtils');
    const proxyPath = await resolveOrGeneratePreviewProxy('/clips/source.MP4', undefined, {
      width: 1920,
      height: 1080,
    });

    expect(proxyPath).toBeUndefined();
    // check-proxy のみ呼ばれ、generate-proxy は呼ばれない
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenNthCalledWith(1, 'check-proxy', { filePath: '/clips/source.MP4' });
  });

  it('generates a proxy for 4K sources when source resolution is provided', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ exists: false, proxyPath: '/clips/source.proxy.mp4' })
      .mockResolvedValueOnce({ success: true, proxyPath: '/clips/source.proxy.mp4' });
    vi.stubGlobal('window', { ipcRenderer: { invoke } });

    const { resolveOrGeneratePreviewProxy } = await import('./proxyUtils');
    const proxyPath = await resolveOrGeneratePreviewProxy('/clips/source.MP4', undefined, {
      width: 3840,
      height: 2160,
    });

    expect(proxyPath).toBe('/clips/source.proxy.mp4');
    expect(invoke).toHaveBeenNthCalledWith(2, 'generate-proxy', {
      filePath: '/clips/source.MP4',
      width: 640,
    });
  });

  it('reuses an existing proxy for FHD sources regardless of resolution gating', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ exists: true, proxyPath: '/clips/source.proxy.mp4' });
    vi.stubGlobal('window', { ipcRenderer: { invoke } });

    const { resolveOrGeneratePreviewProxy } = await import('./proxyUtils');
    const proxyPath = await resolveOrGeneratePreviewProxy('/clips/source.MP4', undefined, {
      width: 1920,
      height: 1080,
    });

    expect(proxyPath).toBe('/clips/source.proxy.mp4');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
