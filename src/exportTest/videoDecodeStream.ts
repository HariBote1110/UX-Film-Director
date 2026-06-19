/**
 * VideoDecoder + MP4Box によるシークなしフレームストリーム
 *
 * DOM動画要素の currentTime シーク（遅い）を排除し、
 * ファイルを先頭から1度だけ読んで順次デコードする。
 * VideoFrame は GPU 上に留まるため createImageBitmap より高速。
 *
 * 使い方:
 *   for await (const { frame, timestampUs } of decodeVideoStream(fileUrl)) {
 *     encoder.encode(frame);
 *     frame.close();
 *   }
 */

import { createFile, DataStream, type ISOFile, type MP4BoxBuffer } from 'mp4box';

export interface DecodedFrame {
  frame: VideoFrame;
  /** マイクロ秒単位のタイムスタンプ */
  timestampUs: number;
}

export interface DecodeVideoStreamOptions {
  /** デコード開始時刻（秒）。未指定なら 0。この時刻より前のフレームはスキップする */
  startSec?: number;
  /** デコード終了時刻（秒）。未指定なら末尾まで */
  endSec?: number;
  /** リサイズ後の幅。指定時は VideoDecoder の displayWidth に設定 */
  resizeWidth?: number;
  resizeHeight?: number;
}

/** mp4box の sample entry ボックス（avc1/hvc1 等）から VideoDecoder 用 description バイト列を抽出する */
const extractDescription = (sampleEntry: any): ArrayBuffer | undefined => {
  const box = sampleEntry?.avcC || sampleEntry?.hvcC || sampleEntry?.vpcC || sampleEntry?.av1C;
  if (!box) return undefined;
  try {
    const stream = new (DataStream as any)(undefined, 0, (DataStream as any).BIG_ENDIAN);
    box.write(stream);
    // 先頭8バイトはボックスヘッダー（size + type）をスキップ
    return (stream.buffer as ArrayBuffer).slice(8, stream.position);
  } catch {
    return undefined;
  }
};

/**
 * トラックの stsd エントリ（hvc1/avc1 等の SampleEntry）から description を抽出する。
 *
 * 一部ファイル（特に HEVC）では `sample.description` が空になるため、
 * stsd の sample entry を直接参照するほうが堅牢。
 */
const extractDescriptionFromTrack = (mp4: ISOFile, trackId: number): ArrayBuffer | undefined => {
  try {
    const trak = (mp4 as any).getTrackById?.(trackId);
    const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
    return entry ? extractDescription(entry) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * 指定 URL の動画をシークなしでデコードし VideoFrame を yield する。
 * Electron の webSecurity:false 環境で file:// URL に対応。
 */
export async function* decodeVideoStream(
  fileUrl: string,
  opts: DecodeVideoStreamOptions = {}
): AsyncGenerator<DecodedFrame> {
  const { startSec = 0, endSec = Infinity, resizeWidth, resizeHeight } = opts;
  const startUs = Math.round(startSec * 1_000_000);

  // ── 1. MP4Box でデマックス ─────────────────────────────────────────────
  const mp4: ISOFile = createFile();
  let videoTrackId = -1;
  let timescale = 1;
  let codecString = '';
  let trackWidth = 0;
  let trackHeight = 0;

  // onSamples が onReady より早く呼ばれる競合状態を防ぐため、
  // デコーダ準備完了前に来たサンプルを一時バッファに蓄積する。
  const sampleBacklog: any[] = [];
  let decoderReady = false;
  let dispatchSamples: ((samples: any[]) => void) | null = null;
  // H.264 など AVC 形式では最初のサンプルの description から avcC を取得する必要がある
  let descriptionBuffer: ArrayBuffer | undefined;
  let descriptionResolved = false;
  let resolveDescription!: () => void;
  const descriptionReady = new Promise<void>(r => { resolveDescription = r; });

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

      // description（avcC/hvcC 等）は stsd エントリから直接抽出する。
      // HEVC では sample.description が空になることがあるため、こちらが堅牢。
      const trackDesc = extractDescriptionFromTrack(mp4, videoTrackId);
      if (trackDesc) {
        descriptionBuffer = trackDesc;
        descriptionResolved = true;
        resolveDescription();
      }

      // onSamples をここで登録（mp4.start() より前）。
      // デコーダがまだ未初期化の場合はバックログに蓄積し、
      // 準備完了後に dispatchSamples() 経由で処理する。
      (mp4 as any).onSamples = (_id: number, _ref: unknown, samples: any[]) => {
        // stsd から取れなかった場合のフォールバック（一部 AVC 等）
        if (!descriptionResolved && samples.length > 0) {
          descriptionBuffer = extractDescription(samples[0].description);
          descriptionResolved = true;
          resolveDescription();
        }
        if (decoderReady && dispatchSamples) {
          dispatchSamples(samples);
        } else {
          sampleBacklog.push(...samples);
        }
      };

      mp4.start();
      resolve();
    };
    mp4.onError = (e: string) => reject(new Error(`MP4Box error: ${e}`));
  });

  // ── フレーム供給と背圧の状態 ──────────────────────────────────────────
  const frameQueue: DecodedFrame[] = [];
  let decodeError: Error | null = null;
  let decoderDone = false;
  let resolveWaiter: (() => void) | null = null;
  const notifyWaiter = () => { if (resolveWaiter) { resolveWaiter(); resolveWaiter = null; } };
  let decoder: VideoDecoder | undefined;

  // 背圧: デコード済み/デコード待ちフレームが溜まりすぎないよう供給を絞る。
  // これが無いと消費(エンコード)より速くデコードが進み、4K フレーム(~12MB)が
  // frameQueue に無制限に積まれて長尺で数十GB に膨れる。
  const HIGH_WATER = 24;
  let resolveDrain: (() => void) | null = null;
  const pendingCount = () => frameQueue.length + (decoder?.decodeQueueSize ?? 0) + sampleBacklog.length;
  const waitForDrain = () => new Promise<void>((r) => { resolveDrain = r; });
  const notifyDrain = () => { if (resolveDrain) { resolveDrain(); resolveDrain = null; } };

  // ── 2. fetch でファイルを逐次読み込み ─────────────────────────────────
  const response = await fetch(fileUrl);
  if (!response.ok || !response.body) throw new Error(`fetch 失敗: ${fileUrl}`);

  let fileOffset = 0;
  const feedPromise = (async () => {
    const reader = response.body!.getReader();
    while (true) {
      // 背圧: 高水位を超えている間は読み込み（=サンプル供給=デコード）を止める。
      while (pendingCount() > HIGH_WATER && !decoderDone) {
        await waitForDrain();
      }
      const { done, value } = await reader.read();
      if (done) { mp4.flush(); break; }
      const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as MP4BoxBuffer;
      buf.fileStart = fileOffset;
      fileOffset += buf.byteLength;
      mp4.appendBuffer(buf);
    }
  })();

  await trackReady;

  // description が得られるまで待機（最初の onSamples コールバックまで）
  await descriptionReady;

  // ── 3. VideoDecoder を初期化 ──────────────────────────────────────────
  const decodeConfig: VideoDecoderConfig = {
    codec: codecString,
    codedWidth: trackWidth,
    codedHeight: trackHeight,
    ...(resizeWidth && resizeHeight ? { displayWidth: resizeWidth, displayHeight: resizeHeight } : {}),
    ...(descriptionBuffer ? { description: descriptionBuffer } : {}),
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

  decoder = new VideoDecoder({
    output: (frame: VideoFrame) => {
      const tsUs = frame.timestamp;
      const tsSec = tsUs / 1_000_000;
      // 範囲外フレームは破棄。デコード待ちが減るので供給を再開させる。
      if (tsSec > endSec + 1) { frame.close(); notifyDrain(); return; }
      // startSec より前のフレームはスキップ（offset 対応）
      if (tsUs < startUs) { frame.close(); notifyDrain(); return; }
      frameQueue.push({ frame, timestampUs: tsUs });
      notifyWaiter();
    },
    error: (e: DOMException) => {
      decodeError = new Error(e.message);
      decoderDone = true;
      notifyWaiter();
      notifyDrain();
    },
  });
  decoder.configure(decodeConfig);

  // ── 4. サンプルを VideoDecoder に流す ─────────────────────────────────
  const sendSamples = (samples: any[]) => {
    for (const s of samples) {
      const tsUs = Math.round((s.cts / timescale) * 1_000_000);
      const durUs = Math.round((s.duration / timescale) * 1_000_000);
      decoder!.decode(new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: tsUs,
        duration: durUs,
        data: s.data,
      }));
    }
    // mp4box が保持する使用済みサンプルデータを解放（蓄積防止）。
    const last = samples[samples.length - 1];
    if (last && typeof last.number === 'number') {
      try { (mp4 as any).releaseUsedSamples(videoTrackId, last.number); } catch { /* ignore */ }
    }
  };

  // デコーダ準備完了：バックログを処理してから、以降のサンプルを直接処理する
  dispatchSamples = sendSamples;
  decoderReady = true;
  if (sampleBacklog.length > 0) {
    sendSamples(sampleBacklog.splice(0));
  }

  feedPromise.then(async () => {
    await decoder!.flush();
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
      // 1 枚消費したので供給(背圧)を再開させる。
      notifyDrain();
      if (item.timestampUs / 1_000_000 > endSec + 0.1) { item.frame.close(); break; }
      yield item;
      continue;
    }

    if (decoderDone) break;

    await new Promise<void>((r) => { resolveWaiter = r; });
  }

  // 残りのフレームを解放
  for (const { frame } of frameQueue) frame.close();
  try { decoder?.close(); } catch { /* ignore */ }
}
