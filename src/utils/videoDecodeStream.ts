/**
 * VideoDecoder + MP4Box によるシークなしフレームストリーム
 *
 * HTMLVideoElement.currentTime によるシーク（遅い）を排除し、
 * ファイルを先頭から1度だけ読んで順次デコードする。
 * VideoFrame は GPU 上に留まるため createImageBitmap より高速。
 *
 * 使い方:
 *   for await (const { frame, timestampUs } of decodeVideoStream(fileUrl)) {
 *     encoder.encode(frame);
 *     frame.close();
 *   }
 */

import { createFile, type ISOFile, type MP4BoxBuffer, type Track } from 'mp4box';

export interface DecodedFrame {
  frame: VideoFrame;
  /** マイクロ秒単位のタイムスタンプ */
  timestampUs: number;
}

export interface DecodeVideoStreamOptions {
  /** デコード終了時刻（秒）。未指定なら末尾まで */
  endSec?: number;
  /** リサイズ後の幅。指定時は VideoDecoder の displayWidth に設定 */
  resizeWidth?: number;
  resizeHeight?: number;
}

/**
 * 指定 URL の動画をシークなしでデコードし VideoFrame を yield する。
 * Electron の webSecurity:false 環境で file:// URL に対応。
 */
export async function* decodeVideoStream(
  fileUrl: string,
  opts: DecodeVideoStreamOptions = {}
): AsyncGenerator<DecodedFrame> {
  const { endSec = Infinity, resizeWidth, resizeHeight } = opts;

  // ── 1. MP4Box でデマックス ─────────────────────────────────────────────
  const mp4: ISOFile = createFile();
  let videoTrackId = -1;
  let timescale = 1;
  let codecString = '';
  let trackWidth = 0;
  let trackHeight = 0;

  const trackReady = new Promise<void>((resolve, reject) => {
    mp4.onReady = (info: any) => {
      const track = info.videoTracks?.[0];
      if (!track) { reject(new Error('動画トラックが見つかりません')); return; }
      videoTrackId = track.id;
      timescale = track.timescale;
      codecString = track.codec ?? '';
      trackWidth = track.video?.width ?? track.track_width ?? 0;
      trackHeight = track.video?.height ?? track.track_height ?? 0;
      mp4.setExtractionOptions(videoTrackId, null, { nbSamples: 100 });
      mp4.start();
      resolve();
    };
    mp4.onError = (e: string) => reject(new Error(`MP4Box error: ${e}`));
  });

  // ── 2. fetch でファイルを逐次読み込み ─────────────────────────────────
  const response = await fetch(fileUrl);
  if (!response.ok || !response.body) throw new Error(`fetch 失敗: ${fileUrl}`);

  let fileOffset = 0;
  const feedPromise = (async () => {
    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) { mp4.flush(); break; }
      const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as MP4BoxBuffer;
      buf.fileStart = fileOffset;
      fileOffset += buf.byteLength;
      mp4.appendBuffer(buf);
    }
  })();

  await trackReady;

  // ── 3. VideoDecoder を初期化 ──────────────────────────────────────────
  const frameQueue: DecodedFrame[] = [];
  let decodeError: Error | null = null;
  let decoderDone = false;
  let resolveWaiter: (() => void) | null = null;
  const notifyWaiter = () => { if (resolveWaiter) { resolveWaiter(); resolveWaiter = null; } };

  const codedWidth = resizeWidth ?? trackWidth;
  const codedHeight = resizeHeight ?? trackHeight;

  const decodeConfig: VideoDecoderConfig = {
    codec: codecString,
    codedWidth: trackWidth,
    codedHeight: trackHeight,
    ...(resizeWidth && resizeHeight ? { displayWidth: resizeWidth, displayHeight: resizeHeight } : {}),
    hardwareAcceleration: 'prefer-hardware',
  };

  // HW → SW フォールバック
  for (const accel of ['prefer-hardware', 'prefer-software'] as HardwareAcceleration[]) {
    decodeConfig.hardwareAcceleration = accel;
    try {
      const s = await VideoDecoder.isConfigSupported(decodeConfig);
      if (s.supported) break;
    } catch { /* try next */ }
  }

  const decoder = new VideoDecoder({
    output: (frame: VideoFrame) => {
      const tsUs = frame.timestamp;
      const tsSec = tsUs / 1_000_000;
      if (tsSec > endSec + 1) { frame.close(); return; }
      frameQueue.push({ frame, timestampUs: tsUs });
      notifyWaiter();
    },
    error: (e: DOMException) => {
      decodeError = new Error(e.message);
      decoderDone = true;
      notifyWaiter();
    },
  });
  decoder.configure(decodeConfig);

  // ── 4. サンプルを VideoDecoder に流す ─────────────────────────────────
  (mp4 as any).onSamples = (_id: number, _ref: unknown, samples: any[]) => {
    for (const s of samples) {
      const tsUs = Math.round((s.cts / timescale) * 1_000_000);
      const durUs = Math.round((s.duration / timescale) * 1_000_000);
      decoder.decode(new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: tsUs,
        duration: durUs,
        data: s.data,
      }));
    }
  };

  feedPromise.then(async () => {
    await decoder.flush();
    decoderDone = true;
    notifyWaiter();
  }).catch((e: unknown) => {
    decodeError = e instanceof Error ? e : new Error(String(e));
    decoderDone = true;
    notifyWaiter();
  });

  // ── 5. フレームを yield ───────────────────────────────────────────────
  while (true) {
    if (decodeError) throw decodeError;

    if (frameQueue.length > 0) {
      frameQueue.sort((a, b) => a.timestampUs - b.timestampUs);
      const item = frameQueue.shift()!;
      if (item.timestampUs / 1_000_000 > endSec + 0.1) { item.frame.close(); break; }
      yield item;
      continue;
    }

    if (decoderDone) break;

    await new Promise<void>((r) => { resolveWaiter = r; });
  }

  // 残りのフレームを解放
  for (const { frame } of frameQueue) frame.close();
  try { decoder.close(); } catch { /* ignore */ }
}
