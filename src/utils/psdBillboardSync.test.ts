import { describe, expect, it, vi } from 'vitest';
import type { PsdObject, TimelineObject } from '../types';
import {
  activeLayerIdsForPsdBillboard,
  fetchPsdCompositeRgba,
  psdBillboardCacheKey,
  selectWorldPlacedPsdBillboards,
  type PsdRenderCompositeIpc,
} from './psdBillboardSync';

const basePsd = (patch: Partial<PsdObject> = {}): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'standing.psd',
  layer: 2,
  startTime: 1,
  duration: 4,
  x: 400,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 400,
  endY: 120,
  easing: 'linear',
  src: 'blob:psd',
  filePath: '/tmp/standing.psd',
  width: 512,
  height: 768,
  scale: 1,
  activeLayerIds: { 'face-open': true },
  ...patch,
});

describe('selectWorldPlacedPsdBillboards', () => {
  it('keeps only PSD objects with worldPlacement.enabled true', () => {
    const placed = basePsd({
      id: 'placed',
      worldPlacement: {
        enabled: true,
        position: { x: 0, y: 0, z: 0 },
        rotationYDeg: 0,
        scale: 1,
        billboard: true,
      },
    });
    const disabled = basePsd({
      id: 'disabled',
      worldPlacement: {
        enabled: false,
        position: { x: 0, y: 0, z: 0 },
        rotationYDeg: 0,
        scale: 1,
        billboard: true,
      },
    });
    const noPlacement = basePsd({ id: 'no-placement' });
    const objects: TimelineObject[] = [placed, disabled, noPlacement];

    expect(selectWorldPlacedPsdBillboards(objects).map((o) => o.id)).toEqual(['placed']);
  });
});

describe('activeLayerIdsForPsdBillboard', () => {
  it('returns only the enabled layer ids in deterministic (sorted) order', () => {
    const psd = basePsd({
      activeLayerIds: { 'layer-b': true, 'layer-a': true, 'layer-c': false },
    });

    expect(activeLayerIdsForPsdBillboard(psd)).toEqual(['layer-a', 'layer-b']);
  });

  it('returns an empty array when activeLayerIds is absent', () => {
    const psd = basePsd({ activeLayerIds: undefined });

    expect(activeLayerIdsForPsdBillboard(psd)).toEqual([]);
  });
});

describe('psdBillboardCacheKey', () => {
  it('changes when the active layer set changes', () => {
    const a = basePsd({ activeLayerIds: { 'face-open': true } });
    const b = basePsd({ activeLayerIds: { 'face-closed': true } });

    expect(psdBillboardCacheKey(a)).not.toBe(psdBillboardCacheKey(b));
  });

  it('is stable for the same file path and active layer set', () => {
    const a = basePsd({ activeLayerIds: { 'face-open': true } });
    const b = basePsd({ id: 'different-object-id', activeLayerIds: { 'face-open': true } });

    expect(psdBillboardCacheKey(a)).toBe(psdBillboardCacheKey(b));
  });
});

describe('fetchPsdCompositeRgba', () => {
  it('returns null when the PSD object has no filePath', async () => {
    const ipc: PsdRenderCompositeIpc = { invoke: vi.fn() };
    const psd = basePsd({ filePath: undefined });

    const composite = await fetchPsdCompositeRgba(ipc, psd);

    expect(composite).toBeNull();
    expect(ipc.invoke).not.toHaveBeenCalled();
  });

  it('returns the IPC RGBA buffer as a Uint8Array without requiring Canvas2D', async () => {
    const pixelData = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]).buffer;
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      width: 2,
      height: 1,
      pixelData,
    });
    const ipc: PsdRenderCompositeIpc = { invoke };
    const psd = basePsd({ activeLayerIds: { 'face-open': true } });

    const composite = await fetchPsdCompositeRgba(ipc, psd);

    expect(invoke).toHaveBeenCalledWith('render-psd-composite', {
      filePath: '/tmp/standing.psd',
      activeLayerIds: ['face-open'],
    });
    expect(composite).toMatchObject({ width: 2, height: 1 });
    expect(composite?.data).toBeInstanceOf(Uint8Array);
    expect(composite?.data.buffer).toBe(pixelData);
    expect(composite?.data.byteOffset).toBe(0);
    expect(composite?.data.byteLength).toBe(8);
  });

  it('omits activeLayerIds from the request when there are none enabled', async () => {
    const pixelData = new Uint8Array([0, 0, 0, 0]).buffer;
    const invoke = vi.fn().mockResolvedValue({ success: true, width: 1, height: 1, pixelData });
    const ipc: PsdRenderCompositeIpc = { invoke };
    const psd = basePsd({ activeLayerIds: {} });

    await fetchPsdCompositeRgba(ipc, psd);

    expect(invoke).toHaveBeenCalledWith('render-psd-composite', {
      filePath: '/tmp/standing.psd',
    });
  });

  it('returns null when the backend reports failure', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: false, error: 'boom' });
    const ipc: PsdRenderCompositeIpc = { invoke };
    const psd = basePsd();

    const composite = await fetchPsdCompositeRgba(ipc, psd);

    expect(composite).toBeNull();
  });

  it('rejects an RGBA buffer whose byte length does not match its dimensions', async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      width: 2,
      height: 1,
      pixelData: new Uint8Array([255, 0, 0, 255]).buffer,
    });
    const ipc: PsdRenderCompositeIpc = { invoke };

    await expect(fetchPsdCompositeRgba(ipc, basePsd())).resolves.toBeNull();
  });

  it.each([
    { width: -1, height: -1 },
    { width: 0.5, height: 2 },
  ])(
    'rejects non-positive or fractional dimensions ($width x $height)',
    async ({ width, height }) => {
      const invoke = vi.fn().mockResolvedValue({
        success: true,
        width,
        height,
        pixelData: new Uint8Array([255, 0, 0, 255]).buffer,
      });
      const ipc: PsdRenderCompositeIpc = { invoke };

      await expect(fetchPsdCompositeRgba(ipc, basePsd())).resolves.toBeNull();
    }
  );
});
