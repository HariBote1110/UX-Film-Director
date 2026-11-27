import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preloadSource = () =>
  readFileSync(new URL('../../electron/preload.ts', import.meta.url), 'utf8');

const viteEnvSource = () =>
  readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');

describe('shared video frame upload bridge boundary', () => {
  it('does not expose Electron control-plane pixel payload fallback from preload', () => {
    expect(preloadSource()).toContain('copyIntoUploadBuffer(payload: SharedVideoFrameCopyPayload, target: Uint8Array)');
    expect(preloadSource()).not.toContain('rgbaBytes: target');
    expect(viteEnvSource()).not.toContain('rgbaBytes?: Uint8Array | ArrayBuffer | number[]');
  });

  it('does not keep writable shared-frame naming in the presented-frame preload contract', () => {
    expect(preloadSource()).not.toContain('SharedVideoFrameWritableResult');
  });

  it('exposes the SharedArrayBuffer zero-copy upload entry from preload without echoing pixel bytes', () => {
    // SAB経路: ElectronのcontextBridgeはSAB(バックのview含む)をクローンできない
    // ため、SAB本体はwindow.postMessage（本物の構造化クローン、バッキングメモリ
    // 共有）で一回だけpreloadへ登録し、copy呼び出しはbufferId参照のみを渡す。
    // copiedBytesのような画素ペイロードのエコーバックは一切不要（あってはならない）。
    expect(preloadSource()).toContain('copyIntoSharedUploadBuffer(payload: SharedVideoFrameSharedCopyPayload)');
    expect(preloadSource()).toContain('instanceof SharedArrayBuffer');
    expect(preloadSource()).toContain('uxfd:registerSharedUploadBuffer');
    expect(preloadSource()).toContain('uxfd:sharedUploadBufferRegistered');
    expect(preloadSource()).toContain('sharedUploadUnavailable: true');
    expect(viteEnvSource()).toContain('copyIntoSharedUploadBuffer');
    expect(viteEnvSource()).toContain('sharedUploadBufferId: string');
    expect(viteEnvSource()).toContain('sharedUploadUnavailable?: boolean');
  });

  it('enables the SharedArrayBuffer Chromium feature in the Electron main process', () => {
    const mainSource = readFileSync(new URL('../../electron/main.ts', import.meta.url), 'utf8');
    // appendSwitch('enable-features', ...) は同名スイッチを上書きするため、
    // 既存のCanvasOopRasterizationと同じ1回の呼び出しにまとめて指定すること。
    expect(mainSource).toMatch(/appendSwitch\('enable-features', '[^']*SharedArrayBuffer[^']*'\)/);
    const enableFeaturesCalls = mainSource.match(/appendSwitch\('enable-features'/g) ?? [];
    expect(enableFeaturesCalls).toHaveLength(1);
  });
});
