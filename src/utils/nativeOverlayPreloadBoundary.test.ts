import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('native overlay preload boundary', () => {
  it('exposes a thin nativeOverlay renderer API through preload IPC only', () => {
    const preload = readFileSync(resolve(root, 'electron/preload.ts'), 'utf8');

    expect(preload).toContain("contextBridge.exposeInMainWorld('nativeOverlay'");
    expect(preload).toContain('nativeOverlayIpcChannels.attach');
    expect(preload).toContain('nativeOverlayIpcChannels.detach');
    expect(preload).toContain('nativeOverlayIpcChannels.presentSharedFrame');
    expect(preload).toContain('nativeOverlayIpcChannels.capabilities');
    expect(preload).not.toContain('UXFD_NATIVE_OVERLAY_MODULE');
  });

  it('declares the renderer nativeOverlay API shape without frame bytes', () => {
    const envTypes = readFileSync(resolve(root, 'src/vite-env.d.ts'), 'utf8');

    expect(envTypes).toContain('nativeOverlay: {');
    expect(envTypes).toContain('attach: (payload: {');
    expect(envTypes).toContain('detach: (payload: {');
    expect(envTypes).toContain('presentSharedFrame: (payload: {');
    expect(envTypes).toContain('getCapabilities: () => Promise<{');
    expect(envTypes).not.toContain('pixels: Uint8Array');
    expect(envTypes).not.toContain('frameBytes');
    expect(envTypes).not.toContain('nativeOverlay: ArrayBuffer');
    expect(envTypes).not.toContain('nativeOverlay: string');
  });
});
