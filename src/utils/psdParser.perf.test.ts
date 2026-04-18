/**
 * PSD 解析のベンチマーク（Node + ag-psd initializeCanvas + DOM モック）。
 * 実アプリは Electron レンダラーだが、readPsd とツリー構築の相対比較に使う。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeCanvas, readPsd } from 'ag-psd';

const PSD_PATH = join(process.cwd(), '葵ちゃん.psd');

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function installAgPsdCanvas(): void {
  initializeCanvas(
    (w, h) =>
      ({
        width: w,
        height: h,
        getContext: () => ({
          createImageData: (w2: number, h2: number) => ({
            data: new Uint8ClampedArray(w2 * h2 * 4),
            width: w2,
            height: h2,
          }),
          putImageData: () => {},
        }),
      }) as unknown as HTMLCanvasElement,
    (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
  );
}

function installDomMocksForParser(): void {
  let blobCounter = 0;
  globalThis.crypto ??= { randomUUID: () => '00000000-0000-4000-8000-000000000000' } as Crypto;
  (globalThis as unknown as { URL: Pick<typeof URL, 'createObjectURL'> }).URL = {
    createObjectURL: () => `blob:mock-${blobCounter++}`,
  } as unknown as typeof URL;

  (globalThis as unknown as { document: Document }).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') {
        throw new Error(`Unexpected tag: ${tag}`);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          putImageData: () => {},
        }),
        toBlob: (cb: (blob: Blob | null) => void) => {
          queueMicrotask(() => cb(new Blob([new Uint8Array([137, 80])])));
        },
      };
    },
  } as unknown as Document;

  (globalThis as unknown as { ImageData: typeof ImageData }).ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  } as unknown as typeof ImageData;

  globalThis.createImageBitmap = async (image: ImageBitmapSource) =>
    image as unknown as ImageBitmap;
}

describe('psdParser performance (葵ちゃん.psd)', () => {
  let arrayBuffer: ArrayBuffer;

  beforeAll(() => {
    installAgPsdCanvas();
    installDomMocksForParser();
    const buf = readFileSync(PSD_PATH);
    arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  afterAll(() => {
    // leave globals; test process exits
  });

  it('readPsd median wall time is recorded', () => {
    const iterations = 15;
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      readPsd(arrayBuffer, {
        skipLayerImageData: false,
        useImageData: true,
        skipThumbnail: true,
        skipCompositeImageData: true,
      });
      times.push(performance.now() - t0);
    }
    const med = median(times);
    console.log('[bench] readPsd skipThumbnail median ms:', med.toFixed(2));
    expect(med).toBeGreaterThan(0);
  });

  it('readPsd: skipThumbnail saves wall time (interleaved legacy vs skip)', () => {
    const iterations = 15;
    const legacyMs: number[] = [];
    const skipMs: number[] = [];
    for (let i = 0; i < iterations; i++) {
      let t0 = performance.now();
      readPsd(arrayBuffer, {
        skipLayerImageData: false,
        useImageData: true,
        skipThumbnail: false,
        skipCompositeImageData: true,
      });
      legacyMs.push(performance.now() - t0);
      t0 = performance.now();
      readPsd(arrayBuffer, {
        skipLayerImageData: false,
        useImageData: true,
        skipThumbnail: true,
        skipCompositeImageData: true,
      });
      skipMs.push(performance.now() - t0);
    }
    const leg = median(legacyMs);
    const sk = median(skipMs);
    const delta = leg - sk;
    console.log('[bench] readPsd median ms (load thumbnail):', leg.toFixed(2));
    console.log('[bench] readPsd median ms (skip thumbnail):', sk.toFixed(2));
    console.log('[bench] readPsd median delta ms (thumb saved):', delta.toFixed(2));
    expect(leg).toBeGreaterThan(0);
    expect(sk).toBeGreaterThan(0);
  });

  it('parsePsdArrayBufferAsObject median wall time is recorded', async () => {
    const { parsePsdArrayBufferAsObject } = await import('./psdParser');
    const iterations = 15;
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const { psdObject } = await parsePsdArrayBufferAsObject(
        arrayBuffer,
        '葵ちゃん.psd',
        0,
        1280,
        720
      );
      expect(psdObject.rootLayer).toBeDefined();
      times.push(performance.now() - t0);
    }
    const med = median(times);
    console.log('[bench] parsePsdArrayBufferAsObject median ms:', med.toFixed(2));
    expect(med).toBeGreaterThan(0);
  });
});
