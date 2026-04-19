/**
 * VideoEncoder + mp4-muxer によるエクスポートパイプライン（UI非依存）
 *
 * useProjectExport から呼び出されるほか、exportTest ハーネスから単体で使用できる。
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface EncodeVideoConfig {
  width: number;
  height: number;
  fps: number;
  /** フレーム数ぶんの timestamp(μs) と描画コールバックを受け取るイテレータ */
  frames: AsyncIterable<{ timestamp: number; bitmap: ImageBitmap }>;
  audioBuffer?: AudioBuffer | null;
}

export interface EncodeResult {
  buffer: ArrayBuffer;
  codecUsed: string;
  durationMs: number;
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

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: encWidth, height: encHeight },
    ...(cfg.audioBuffer
      ? { audio: { codec: 'aac', sampleRate: cfg.audioBuffer.sampleRate, numberOfChannels: cfg.audioBuffer.numberOfChannels } }
      : {}),
    fastStart: 'in-memory',
  });

  let rejectEncoding!: (e: Error) => void;
  const encodingError = new Promise<never>((_, reject) => { rejectEncoding = reject; });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { console.error('[VideoExport] VideoEncoder error:', e); rejectEncoding(e); },
  });
  videoEncoder.configure(detected.config);

  for await (const { timestamp, bitmap } of cfg.frames) {
    const frame = new VideoFrame(bitmap, { timestamp });
    const keyFrame = timestamp === 0 || (timestamp % (cfg.fps * 2 * 1_000_000) < (1_000_000 / cfg.fps));
    videoEncoder.encode(frame, { keyFrame });
    frame.close();

    if (videoEncoder.encodeQueueSize > 10) {
      await Promise.race([new Promise(r => setTimeout(r, 0)), encodingError]);
    }
  }

  await Promise.race([videoEncoder.flush(), encodingError]);
  videoEncoder.close();

  if (cfg.audioBuffer) {
    await encodeAudioBufferToMuxer(cfg.audioBuffer, muxer);
  }

  muxer.finalize();
  const { buffer } = target;

  return { buffer, codecUsed: detected.codec, durationMs: performance.now() - t0 };
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
