/**
 * VideoEncoder + mp4-muxer によるエクスポートパイプライン（UI非依存）
 *
 * useProjectExport から呼び出されるほか、exportTest ハーネスから単体で使用できる。
 */
import { Muxer, ArrayBufferTarget, StreamTarget } from 'mp4-muxer';

export interface EncodeVideoConfig {
  width: number;
  height: number;
  fps: number;
  /** フレーム数ぶんの timestamp(μs) と描画コールバックを受け取るイテレータ */
  frames: AsyncIterable<{ timestamp: number; bitmap: ImageBitmap }>;
  audioBuffer?: AudioBuffer | null;
  /**
   * 出力チャンクのディスク逐次書き込み用コールバック。指定すると出力全体を
   * メモリに保持せず（ArrayBufferTarget を使わず）逐次書き出す。
   * 指定時は moov 末尾配置（fastStart:false）になる。
   */
  writeChunk?: (data: Uint8Array, position: number) => void | Promise<void>;
}

export interface EncodeResult {
  /** ストリーミング出力時は空（データはディスクへ書き込み済み）。 */
  buffer: ArrayBuffer;
  /** ディスクへ逐次書き出した場合 true。 */
  streamed: boolean;
  codecUsed: string;
  durationMs: number;
  /** エンコード中に観測した encodeQueueSize のピーク（背圧の有効性確認用）。 */
  peakQueueSize: number;
}

// H.264 コーデック候補（Apple Silicon 優先）
const H264_CANDIDATES = [
  'avc1.640028', // High Level 4.0
  'avc1.4d0028', // Main Level 4.0
  'avc1.42E01E', // Baseline Level 3.0
  'avc1.42001f', // Baseline Level 3.1
];

// isConfigSupported は「設定上は可」でも実エンコード時に落ちる場合がある（HW アクセラレータ初期化失敗）。
// 1フレームをエンコードして flush() まで完走できるか確認する。
const probeEncoder = async (config: VideoEncoderConfig): Promise<boolean> => {
  const w = config.width as number;
  const h = config.height as number;
  try {
    let resolved = false;
    const result = await new Promise<boolean>((resolve) => {
      const enc = new VideoEncoder({
        output: () => { if (!resolved) { resolved = true; enc.close(); resolve(true); } },
        error: (e) => { if (!resolved) { resolved = true; console.warn('[VideoExport] probe error:', e.message); resolve(false); } },
      });
      enc.configure(config);

      // 塗りつぶし済み ImageBitmap を VideoFrame ソースに使う（OffscreenCanvas 未描画問題を回避）
      const imageData = new ImageData(w, h);
      createImageBitmap(imageData).then(bitmap => {
        const frame = new VideoFrame(bitmap, { timestamp: 0 });
        enc.encode(frame, { keyFrame: true });
        frame.close();
        bitmap.close();
        // flush() で出力コールバックを確実に呼び出す
        return enc.flush();
      }).then(() => {
        if (!resolved) { resolved = true; try { enc.close(); } catch { /* ignore */ } resolve(true); }
      }).catch(() => {
        if (!resolved) { resolved = true; resolve(false); }
      });
    });
    return result;
  } catch {
    return false;
  }
};

// プロセスライフタイム中にキャッシュ（detect は重いので1回だけ実行）
let cachedCodecResult: { codec: string; config: VideoEncoderConfig } | null | undefined = undefined;

/** テスト用: キャッシュをリセットして再検出を強制する */
export const resetCodecCache = (): void => { cachedCodecResult = undefined; };

export const detectSupportedH264Codec = async (
  width: number,
  height: number,
  fps: number
): Promise<{ codec: string; config: VideoEncoderConfig } | null> => {
  if (cachedCodecResult !== undefined) return cachedCodecResult;

  const encWidth = width % 2 === 0 ? width : width - 1;
  const encHeight = height % 2 === 0 ? height : height - 1;

  // HW → SW の順で試す
  const accelModes: HardwareAcceleration[] = ['prefer-hardware', 'prefer-software', 'no-preference'];

  // latencyMode: 'realtime' は VideoToolbox の max frame delay 制約を緩和する
  const latencyModeFlags: LatencyMode[] = ['quality', 'realtime'];

  for (const codec of H264_CANDIDATES) {
    for (const hardwareAcceleration of accelModes) {
      for (const latencyMode of latencyModeFlags) {
      const config: VideoEncoderConfig = {
        codec,
        width: encWidth,
        height: encHeight,
        bitrate: 10_000_000,
        framerate: fps,
        hardwareAcceleration,
        latencyMode,
      };
      const declared = await VideoEncoder.isConfigSupported(config);
      if (!declared.supported) continue;

      const works = await probeEncoder(config);
      console.log(`[VideoExport] codec=${codec} accel=${hardwareAcceleration} latency=${latencyMode} probe=${works}`);
      if (works) {
        const label = hardwareAcceleration === 'prefer-hardware' ? '🔥 HW (VideoToolbox)' : '🐢 SW (OpenH264)';
        console.log(`[VideoExport] 確定: ${label} codec=${codec} latency=${latencyMode}`);
        cachedCodecResult = { codec, config };
        return cachedCodecResult;
      }
      } // latencyMode loop
    }
  }
  cachedCodecResult = null;
  return null;
};

export const encodeVideoToMp4 = async (cfg: EncodeVideoConfig): Promise<EncodeResult> => {
  const t0 = performance.now();
  const encWidth = cfg.width % 2 === 0 ? cfg.width : cfg.width - 1;
  const encHeight = cfg.height % 2 === 0 ? cfg.height : cfg.height - 1;

  const detected = await detectSupportedH264Codec(cfg.width, cfg.height, cfg.fps);
  if (!detected) throw new Error('VideoEncoder H.264 がこの環境でサポートされていません');

  // ストリーミング出力時はディスクへ逐次書き込む。onData は同期呼び出しのため、
  // チャンクをキューに積んで非同期(IPC)書き込みを直列ドレインする。
  const streaming = typeof cfg.writeChunk === 'function';
  let writeError: Error | null = null;
  const writeQueue: { data: Uint8Array; position: number }[] = [];
  let draining = false;
  const drainWrites = async () => {
    if (draining) return;
    draining = true;
    try {
      while (writeQueue.length > 0) {
        const { data, position } = writeQueue.shift()!;
        await cfg.writeChunk!(data, position);
      }
    } catch (e) {
      writeError = e instanceof Error ? e : new Error(String(e));
    } finally {
      draining = false;
    }
  };

  const arrayTarget = streaming ? null : new ArrayBufferTarget();
  const streamTarget = streaming
    ? new StreamTarget({
        onData: (data: Uint8Array, position: number) => {
          // data は再利用バッファのビューのことがあるため必ずコピーする。
          writeQueue.push({ data: data.slice(), position });
          void drainWrites();
        },
        chunked: true,
      })
    : null;

  const muxer = new Muxer({
    target: (streamTarget ?? arrayTarget) as ArrayBufferTarget,
    video: { codec: 'avc', width: encWidth, height: encHeight },
    ...(cfg.audioBuffer
      ? { audio: { codec: 'aac', sampleRate: cfg.audioBuffer.sampleRate, numberOfChannels: cfg.audioBuffer.numberOfChannels } }
      : {}),
    // ストリーミング時は moov 末尾配置（逐次書き込み・メモリ非保持）。
    fastStart: streaming ? false : 'in-memory',
  });

  let rejectEncoding!: (e: Error) => void;
  const encodingError = new Promise<never>((_, reject) => { rejectEncoding = reject; });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      // WebCodecs が返す meta.decoderConfig は frozen オブジェクトのため直接 mutation 不可。
      // スプレッドで新しいオブジェクトを生成し、colorSpace が null の場合は BT.709 を補完する。
      let patchedMeta = meta;
      if (meta?.decoderConfig) {
        patchedMeta = {
          ...meta,
          decoderConfig: {
            ...meta.decoderConfig,
            colorSpace: meta.decoderConfig.colorSpace ?? {
              primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false,
            },
          },
        };
      }
      muxer.addVideoChunk(chunk, patchedMeta);
    },
    error: (e) => { console.error('[VideoExport] VideoEncoder error:', e); rejectEncoding(e); },
  });
  videoEncoder.configure(detected.config);

  // エンコーダのキューが捌けるのを実際に待つための待機関数。
  // dequeue イベント（キュー減少時に発火）を待ち、非対応環境では短いポーリングで代替する。
  const waitForDequeue = () => Promise.race([
    new Promise<void>((resolve) => {
      const enc = videoEncoder as unknown as {
        addEventListener?: (t: string, cb: () => void, o?: { once: boolean }) => void;
        removeEventListener?: (t: string, cb: () => void) => void;
      };
      if (typeof enc.addEventListener === 'function') {
        const onDeq = () => { enc.removeEventListener?.('dequeue', onDeq); resolve(); };
        enc.addEventListener('dequeue', onDeq, { once: true });
        // dequeue が来ない環境・取りこぼし対策のフォールバック。
        setTimeout(() => { enc.removeEventListener?.('dequeue', onDeq); resolve(); }, 100);
      } else {
        setTimeout(resolve, 10);
      }
    }),
    encodingError,
  ]);

  // 背圧: 生成がエンコードより速いとき、エンコーダ内部キューに VideoFrame が
  // 無制限に積もってメモリが膨張する。キューが上限以下になるまで送出を止める。
  const MAX_QUEUE = 8;
  let peakQueueSize = 0;

  // 段のオーバーラップ（パイプライン化）:
  // VideoFrame は ImageBitmap からデータをコピーして生成されるため、生成直後に
  // 「次フレームの取得・描画(=iterator.next())」を開始でき、現フレームのエンコードや
  // 背圧待ちと並行に走らせられる。これで「取得+描画」と「エンコード」の直列を解消する。
  const iterator = cfg.frames[Symbol.asyncIterator]();
  let pending = iterator.next();
  while (true) {
    const { value, done } = await pending;
    if (done) break;

    // ImageBitmap を VideoFrame へコピー（この時点で bitmap への依存が切れる）。
    const frame = new VideoFrame(value.bitmap, { timestamp: value.timestamp });
    // 次フレームの生成を即開始（エンコード/背圧待ちと並行）。
    // ジェネレータ側は yield 再開時に自身の bitmap を close するが、既にコピー済みで安全。
    pending = iterator.next();

    // 背圧: キューが捌けるまで送出を待つ（この待ち時間も次フレーム生成と重なる）。
    while (videoEncoder.encodeQueueSize > MAX_QUEUE) {
      await waitForDequeue();
    }
    if (videoEncoder.encodeQueueSize > peakQueueSize) peakQueueSize = videoEncoder.encodeQueueSize;

    const keyFrame = value.timestamp === 0 || (value.timestamp % (cfg.fps * 2 * 1_000_000) < (1_000_000 / cfg.fps));
    videoEncoder.encode(frame, { keyFrame });
    frame.close();
  }

  await Promise.race([videoEncoder.flush(), encodingError]);
  videoEncoder.close();
  if (peakQueueSize > 0) console.log(`[VideoExport] peak encodeQueueSize = ${peakQueueSize}`);

  if (cfg.audioBuffer) {
    await encodeAudioBufferToMuxer(cfg.audioBuffer, muxer);
  }

  muxer.finalize();

  if (streaming) {
    // finalize() による最終チャンク（moov 等）の書き込み完了を待つ。
    await drainWrites();
    while (writeQueue.length > 0 || draining) {
      await new Promise((r) => setTimeout(r, 5));
      await drainWrites();
    }
    if (writeError) throw writeError;
    return { buffer: new ArrayBuffer(0), streamed: true, codecUsed: detected.codec, durationMs: performance.now() - t0, peakQueueSize };
  }

  const { buffer } = arrayTarget!;
  return { buffer, streamed: false, codecUsed: detected.codec, durationMs: performance.now() - t0, peakQueueSize };
};

// ── オーディオエンコード ────────────────────────────────────────────────────

const encodeAudioBufferToMuxer = async (
  audioBuffer: AudioBuffer,
  muxer: Muxer<ArrayBufferTarget>
): Promise<void> => {
  const { sampleRate, numberOfChannels, length: totalSamples } = audioBuffer;
  const frameSize = 1024;

  const config: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: 128_000 };
  const support = await AudioEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error('AudioEncoder AAC not supported');

  await new Promise<void>((resolve, reject) => {
    const encoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: reject,
    });
    encoder.configure(config);

    let offset = 0;
    while (offset < totalSamples) {
      const count = Math.min(frameSize, totalSamples - offset);
      const planar = new Float32Array(count * numberOfChannels);
      for (let ch = 0; ch < numberOfChannels; ch++) {
        planar.set(audioBuffer.getChannelData(ch).subarray(offset, offset + count), ch * count);
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: count,
        numberOfChannels,
        timestamp: Math.round(offset * 1_000_000 / sampleRate),
        data: planar,
      });
      encoder.encode(audioData);
      audioData.close();
      offset += count;
    }
    encoder.flush().then(() => { encoder.close(); resolve(); }).catch(reject);
  });
};
