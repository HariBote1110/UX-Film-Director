/**
 * エクスポートパイプライン自動テストハーネス
 *
 * URL に ?exportTest=1 を付けるか VITE_EXPORT_TEST=1 で起動すると自動実行される。
 * テスト結果は console.log に出力し、window.__exportTestResult に格納される。
 *
 * 使い方:
 *   npm run test:export
 *   → Electron が起動し、テストが自動で走り終了する
 */

import { encodeVideoToMp4, detectSupportedH264Codec, resetCodecCache } from '../utils/videoExportPipeline';
import { decodeVideoStream } from '../utils/videoDecodeStream';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { createFile, DataStream, type ISOFile, type MP4BoxBuffer } from 'mp4box';
import { PlaybackFrameProvider } from '../utils/playbackFrameProvider';

declare global {
  interface Window {
    __exportTestResult?: ExportTestResult;
  }
}

export interface ExportTestResult {
  passed: boolean;
  tests: TestCase[];
  totalMs: number;
}

interface TestCase {
  name: string;
  passed: boolean;
  error?: string;
  detail?: string;
}

const results: TestCase[] = [];

const run = async (name: string, fn: () => Promise<string>): Promise<void> => {
  try {
    const detail = await fn();
    console.log(`[ExportTest] ✅ ${name}`, detail ?? '');
    results.push({ name, passed: true, detail });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    // スタックトレースの先頭5行をエラーメッセージに含める
    const stackLines = err.stack?.split('\n').slice(0, 6).join(' | ') ?? '';
    const error = `${err.message} || stack: ${stackLines}`;
    console.error(`[ExportTest] ❌ ${name}:`, error);
    results.push({ name, passed: false, error });
  }
};

// ── 各テストケース ────────────────────────────────────────────────────────

const testCodecDetection = async (): Promise<string> => {
  // キャッシュをリセットして毎回クリーンな検出を行う（サンドボックス設定変更後も正確に検出）
  resetCodecCache();
  const detected = await detectSupportedH264Codec(1920, 1080, 30);
  if (!detected) throw new Error('H.264 コーデックが見つかりませんでした');
  const hwLabel = detected.config.hardwareAcceleration === 'prefer-hardware' ? '🔥 HW (VideoToolbox)' : '🐢 SW (OpenH264)';
  return `codec=${detected.codec} ${hwLabel}`;
};

const testEncodeBlankFrames = async (): Promise<string> => {
  const W = 640, H = 360, FPS = 30, DURATION_SEC = 1;
  const totalFrames = FPS * DURATION_SEC;

  async function* blankFrames() {
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d')!;
    for (let i = 0; i < totalFrames; i++) {
      ctx.fillStyle = `hsl(${(i / totalFrames) * 360}, 80%, 50%)`;
      ctx.fillRect(0, 0, W, H);
      const bitmap = await createImageBitmap(canvas);
      yield { timestamp: Math.round(i * 1_000_000 / FPS), bitmap };
      bitmap.close();
    }
  }

  const result = await encodeVideoToMp4({
    width: W, height: H, fps: FPS,
    frames: blankFrames(),
  });

  if (result.buffer.byteLength < 1000) throw new Error('出力 MP4 が小さすぎます');
  const fps = Math.round((totalFrames / result.durationMs) * 1000);
  return `codec=${result.codecUsed}, size=${(result.buffer.byteLength / 1024).toFixed(1)}KB, time=${result.durationMs.toFixed(0)}ms, speed=${fps}fps`;
};

const testEncodeFromVideoFile = async (): Promise<string> => {
  const { ipcRenderer } = window as any;
  if (!ipcRenderer) throw new Error('ipcRenderer が利用できません（Electron 以外の環境）');

  const res = await ipcRenderer.invoke('resolve-perf-heavy-video');
  if (!res?.success || !res.filePath) throw new Error('テスト動画が見つかりません（perf/heavy-media/10000kbps_60fps.mp4）');

  const W = 640, H = 360, FPS = 30, SAMPLE_SEC = 2;
  const totalFrames = FPS * SAMPLE_SEC;

  const video = document.createElement('video');
  video.src = `file://${res.filePath}`;
  video.muted = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.oncanplay = () => resolve();
    video.onerror = () => reject(new Error('動画の読み込みに失敗'));
    video.load();
  });

  async function* videoFrames() {
    for (let i = 0; i < totalFrames; i++) {
      const targetTime = i / FPS;
      if (Math.abs(video.currentTime - targetTime) > 0.01) {
        await new Promise<void>(resolve => {
          video.onseeked = () => resolve();
          video.currentTime = targetTime;
        });
      }
      const bitmap = await createImageBitmap(video, { resizeWidth: W, resizeHeight: H });
      yield { timestamp: Math.round(i * 1_000_000 / FPS), bitmap };
      bitmap.close();
    }
  }

  const result = await encodeVideoToMp4({ width: W, height: H, fps: FPS, frames: videoFrames() });
  if (result.buffer.byteLength < 1000) throw new Error('出力 MP4 が小さすぎます');
  const speed = Math.round((totalFrames / result.durationMs) * 1000);
  return `codec=${result.codecUsed}, size=${(result.buffer.byteLength / 1024).toFixed(1)}KB, time=${result.durationMs.toFixed(0)}ms, speed=${speed}fps`;
};

/** 4K 動画 (GX010052.MP4) を 5 秒リエンコードして VideoToolbox の実速度を計測 */
const testEncode4KVideo = async (): Promise<string> => {
  const { ipcRenderer } = window as any;
  if (!ipcRenderer) throw new Error('ipcRenderer が利用できません（Electron 以外の環境）');

  const res = await ipcRenderer.invoke('resolve-4k-test-video');
  if (!res?.success || !res.filePath) throw new Error('4K テスト動画が見つかりません（perf/heavy-media/GX010052.MP4）');

  // 出力は 1920x1080 60fps（FHD ダウンスケール）
  const W = 1920, H = 1080, FPS = 60, SAMPLE_SEC = 5;
  const totalFrames = FPS * SAMPLE_SEC;

  const video = document.createElement('video');
  video.src = `file://${res.filePath}`;
  video.muted = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.oncanplay = () => resolve();
    video.onerror = () => reject(new Error('4K 動画の読み込みに失敗'));
    video.load();
  });

  async function* videoFrames4K() {
    for (let i = 0; i < totalFrames; i++) {
      const targetTime = i / FPS;
      if (Math.abs(video.currentTime - targetTime) > 0.01) {
        await new Promise<void>(resolve => {
          video.onseeked = () => resolve();
          video.currentTime = targetTime;
        });
      }
      const bitmap = await createImageBitmap(video, { resizeWidth: W, resizeHeight: H });
      yield { timestamp: Math.round(i * 1_000_000 / FPS), bitmap };
      bitmap.close();
    }
  }

  const result = await encodeVideoToMp4({ width: W, height: H, fps: FPS, frames: videoFrames4K() });
  if (result.buffer.byteLength < 10_000) throw new Error('出力 MP4 が小さすぎます');

  const elapsedSec = result.durationMs / 1000;
  const speedRatio = (SAMPLE_SEC / elapsedSec).toFixed(1);
  const speed = Math.round((totalFrames / result.durationMs) * 1000);
  return `codec=${result.codecUsed}, size=${(result.buffer.byteLength / 1024 / 1024).toFixed(1)}MB, elapsed=${elapsedSec.toFixed(1)}s, speed=${speed}fps (${speedRatio}x realtime)`;
};

/** VideoDecoder ストリームで H.264 ソース → FHD を再エンコード（シークなし） */
const testEncode4KVideoDecoder = async (): Promise<string> => {
  const ipcRenderer = (window as any).ipcRenderer;
  if (!ipcRenderer) throw new Error('ipcRenderer が利用できません');

  // H.264 プロキシファイルを使用（元の10000kbps_60fps.mp4 は HEVC で VideoDecoder 非対応）
  // GX010052.proxy.mp4 は FFmpeg libx264 で生成した H.264 ファイル
  const res = await ipcRenderer.invoke('resolve-4k-proxy-video');
  if (!res?.success || !res.filePath) throw new Error('H.264 プロキシ動画が見つかりません（perf/heavy-media/GX010052.proxy.mp4）');

  const fileUrl = `file://${res.filePath}`;
  const W = 640, H = 360, SAMPLE_SEC = 5;

  // VideoDecoder→VideoEncoder パイプラインの互換性確認のため SW エンコーダを使用
  // （HW VideoToolbox は OffscreenCanvas 由来の VideoFrame で colorSpace: null エラーが発生するため）
  const swConfig: VideoEncoderConfig = {
    codec: 'avc1.640028',
    width: W, height: H,
    bitrate: 4_000_000,
    framerate: 30,
    hardwareAcceleration: 'prefer-software',
    latencyMode: 'realtime',
  };
  const swSupport = await VideoEncoder.isConfigSupported(swConfig);
  if (!swSupport.supported) throw new Error('SW VideoEncoder が avc1.640028 をサポートしていません');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',
    // 動画タイムスタンプが 0 以外から始まる場合に自動オフセットする
    firstTimestampBehavior: 'offset',
  });

  const BT709_COLOR_SPACE = { primaries: 'bt709' as VideoColorPrimaries, transfer: 'bt709' as VideoTransferCharacteristics, matrix: 'bt709' as VideoMatrixCoefficients, fullRange: false };

  // 最初のキーフレームで decoderConfig が来なかった場合のフォールバック用フラグ
  let decoderConfigReceived = false;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        // WebCodecs が返す meta.decoderConfig は frozen オブジェクトのため直接 mutation 不可。
        // スプレッドで新しいオブジェクトを生成し、colorSpace が null/undefined の場合は BT.709 を補完する。
        let patchedMeta = meta;
        if (meta?.decoderConfig) {
          decoderConfigReceived = true;
          patchedMeta = {
            ...meta,
            decoderConfig: {
              ...meta.decoderConfig,
              colorSpace: meta.decoderConfig.colorSpace ?? BT709_COLOR_SPACE,
            },
          };
        } else if (!decoderConfigReceived && chunk.type === 'key') {
          // SW エンコーダが decoderConfig を返さない場合のフォールバック:
          // ダミーの decoderConfig を注入して mp4-muxer の null クラッシュを防ぐ
          patchedMeta = {
            ...(meta ?? {}),
            decoderConfig: { codec: swConfig.codec, colorSpace: BT709_COLOR_SPACE },
          } as EncodedVideoChunkMetadata;
          decoderConfigReceived = true;
          console.warn('[ExportTest] SW encoder provided no decoderConfig — injecting fallback');
        }
        // EncodedVideoChunk.duration は nullable のため addVideoChunk が duration 検証で throw する場合がある。
        // addVideoChunkRaw を使い、null の場合はフレーム時間でフォールバックする。
        const duration = chunk.duration ?? Math.round(1_000_000 / swConfig.framerate!);
        const rawData = new Uint8Array(chunk.byteLength);
        chunk.copyTo(rawData);
        muxer.addVideoChunkRaw(rawData, chunk.type, chunk.timestamp, duration, patchedMeta);
      } catch (e) {
        // エラーをログに残しつつ再スローして上位に伝播させる
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[ExportTest] addVideoChunkRaw error:', msg);
        throw e;
      }
    },
    error: (e) => { console.error('[ExportTest] VideoEncoder error:', e); },
  });
  encoder.configure(swConfig);

  const t0 = performance.now();
  let frameCount = 0;

  const offscreen = new OffscreenCanvas(W, H);
  const ctx2d = offscreen.getContext('2d')!;

  for await (const { frame, timestampUs } of decodeVideoStream(fileUrl, { endSec: SAMPLE_SEC })) {
    // colorSpace: null フレームでも動く経路: copyTo(RGBA) → ImageData → createImageBitmap
    const srcW = frame.codedWidth || frame.displayWidth;
    const srcH = frame.codedHeight || frame.displayHeight;
    const rawBuf = new ArrayBuffer(srcW * srcH * 4);
    await frame.copyTo(rawBuf, { format: 'RGBA' });
    frame.close();
    const imageData = new ImageData(new Uint8ClampedArray(rawBuf), srcW, srcH);
    const bitmap = await createImageBitmap(imageData, { resizeWidth: W, resizeHeight: H });
    ctx2d.drawImage(bitmap, 0, 0);
    bitmap.close();
    // colorSpace を明示することで、SW エンコーダが meta.decoderConfig.colorSpace を設定できるようにする
    // VideoFrameInit の型定義に colorSpace が含まれていないため as any でキャスト
    const resizedFrame = new VideoFrame(offscreen, {
      timestamp: timestampUs,
      colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    } as any);
    const keyFrame = timestampUs === 0;
    encoder.encode(resizedFrame, { keyFrame });
    resizedFrame.close();
    frameCount++;
  }

  await encoder.flush();
  encoder.close();

  // デコードフレームが 0 件の場合、decoderConfig が設定されず finalize() がクラッシュする
  if (frameCount === 0) throw new Error('decodeVideoStream が 0 フレームを返しました。VideoDecoder または MP4Box の初期化に失敗した可能性があります');

  muxer.finalize();

  const elapsedSec = (performance.now() - t0) / 1000;
  const speedRatio = (SAMPLE_SEC / elapsedSec).toFixed(1);
  const speed = Math.round(frameCount / elapsedSec);
  const sizeMb = (target.buffer.byteLength / 1024 / 1024).toFixed(1);
  return `VideoDecoder パス: codec=${swConfig.codec}, frames=${frameCount}, size=${sizeMb}MB, elapsed=${elapsedSec.toFixed(1)}s, speed=${speed}fps (${speedRatio}x realtime)`;
};

/**
 * 実エクスポート経路の「1フレームあたりコピーコスト」を相対計測する。
 *
 * 同じデコード済みフレームに対し、現行の copy-chain と lean パスを実行し、
 * フェーズ別の累積 ms と実効 fps を出力する。Pixi 自体の描画は含めないが、
 * 現行経路の主因である「中間コピー＋ canvas 読み戻し」を出力解像度で再現する。
 */
const testPipelinePhaseBreakdown = async (): Promise<string> => {
  const ipcRenderer = (window as any).ipcRenderer;
  if (!ipcRenderer) throw new Error('ipcRenderer が利用できません');

  const res = await ipcRenderer.invoke('resolve-4k-proxy-video');
  if (!res?.success || !res.filePath) throw new Error('H.264 プロキシ動画が見つかりません（perf/heavy-media/GX010052.proxy.mp4）');
  const fileUrl = `file://${res.filePath}`;

  // 出力は 4K ネイティブ（重い動画をそのまま書き出す代表ケース）。
  // エンコーダは含めない（SW OpenH264 が 4K 非対応のため）。コピー／読み戻し
  // コストのみを単離計測する。encode コストは FHD 計測（HW≈5ms）を参照。
  const W = 3840, H = 2160, SAMPLE_SEC = 2;
  const COLOR = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false } as const;

  // ── 計測 A: 現行 copy-chain（エンコード入力 ImageBitmap を作るまで）────────
  // decode → createImageBitmap(frame) → drawImage → createImageBitmap(canvas)
  const current = { decode: 0, toBitmap: 0, composite: 0, readback: 0, frames: 0 };
  {
    const offscreen = new OffscreenCanvas(W, H);
    const ctx = offscreen.getContext('2d')!;
    let t = performance.now();
    for await (const { frame } of decodeVideoStream(fileUrl, { endSec: SAMPLE_SEC })) {
      current.decode += performance.now() - t; t = performance.now();
      const bitmap = await createImageBitmap(frame); frame.close();
      current.toBitmap += performance.now() - t; t = performance.now();
      ctx.drawImage(bitmap, 0, 0, W, H); bitmap.close();
      current.composite += performance.now() - t; t = performance.now();
      const outBitmap = await createImageBitmap(offscreen, 0, 0, W, H);
      current.readback += performance.now() - t;
      outBitmap.close();
      current.frames++;
      t = performance.now();
    }
  }

  // ── 計測 B: lean パス（エンコード入力 VideoFrame を作るまで）──────────────
  // decode → drawImage(frame 直接) → VideoFrame(canvas 直接)
  const lean = { decode: 0, composite: 0, makeVF: 0, frames: 0 };
  {
    const offscreen = new OffscreenCanvas(W, H);
    const ctx = offscreen.getContext('2d')!;
    let t = performance.now();
    for await (const { frame, timestampUs } of decodeVideoStream(fileUrl, { endSec: SAMPLE_SEC })) {
      lean.decode += performance.now() - t; t = performance.now();
      ctx.drawImage(frame, 0, 0, W, H); frame.close();
      lean.composite += performance.now() - t; t = performance.now();
      const vf = new VideoFrame(offscreen, { timestamp: timestampUs, colorSpace: COLOR } as any);
      lean.makeVF += performance.now() - t;
      vf.close();
      lean.frames++;
      t = performance.now();
    }
  }

  // ── 計測 C: seek 方式のフレーム取得コスト（4K 元動画）────────────────────
  // HTMLVideoElement.currentTime シーク + createImageBitmap を 30 フレーム分計測。
  let seekInfo = 'seek: 計測スキップ';
  try {
    const res4k = await ipcRenderer.invoke('resolve-4k-test-video');
    if (res4k?.success && res4k.filePath) {
      const video = document.createElement('video');
      video.src = `file://${res4k.filePath}`;
      video.muted = true; video.preload = 'auto';
      await new Promise<void>((resolve, reject) => {
        video.oncanplay = () => resolve();
        video.onerror = () => reject(new Error('4K 動画の読み込み失敗'));
        video.load();
      });
      const N = 30, FPS = 60;
      let seekMs = 0, bmpMs = 0;
      let t = performance.now();
      for (let i = 0; i < N; i++) {
        const target = i / FPS;
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = target; });
        seekMs += performance.now() - t; t = performance.now();
        const bmp = await createImageBitmap(video, { resizeWidth: W, resizeHeight: H });
        bmpMs += performance.now() - t; bmp.close(); t = performance.now();
      }
      const seekFps = Math.round(N / ((seekMs + bmpMs) / 1000));
      seekInfo = `SEEK(4K元)=${seekFps}fps/枠 [seek=${(seekMs / N).toFixed(1)} toBitmap=${(bmpMs / N).toFixed(1)} ms]`;
    }
  } catch (e) {
    seekInfo = `seek 計測失敗: ${e instanceof Error ? e.message : String(e)}`;
  }

  const curTotal = current.decode + current.toBitmap + current.composite + current.readback;
  const leanTotal = lean.decode + lean.composite + lean.makeVF;
  const per = (v: number, n: number) => (v / n).toFixed(1);
  // コピーのみの実効スループット（encode 抜き）。
  const curCopyFps = Math.round(current.frames / (curTotal / 1000));
  const leanCopyFps = Math.round(lean.frames / (leanTotal / 1000));

  return [
    `out=${W}x${H} frames=${current.frames}（encode 除外・コピー単離）`,
    `CURRENT(copy-chain)=${curCopyFps}fps相当 [decode=${per(current.decode, current.frames)} toBitmap=${per(current.toBitmap, current.frames)} composite=${per(current.composite, current.frames)} readback=${per(current.readback, current.frames)} ms]`,
    `LEAN(direct)=${leanCopyFps}fps相当 [decode=${per(lean.decode, lean.frames)} composite=${per(lean.composite, lean.frames)} makeVF=${per(lean.makeVF, lean.frames)} ms]`,
    seekInfo,
  ].join('\n         ');
};

/**
 * プロキシ無しの「生ソース」を VideoDecoder で直接デコードできるかを検証する。
 * useProjectExport の新経路（ソース直接デコード）の前提確認。
 */
const testSourceDirectDecode = async (): Promise<string> => {
  const ipcRenderer = (window as any).ipcRenderer;
  if (!ipcRenderer) throw new Error('ipcRenderer が利用できません');

  // 複数ソースを試し、どのコーデック/サイズが直接デコードできるか確認する。
  const targets: { label: string; channel: string }[] = [
    { label: '10000kbps(107MB)', channel: 'resolve-perf-heavy-video' },
    { label: 'proxy(H.264)', channel: 'resolve-4k-proxy-video' },
  ];

  const SAMPLE_SEC = 2;
  const TIMEOUT_MS = 6000;
  const lines: string[] = [];

  // ハングしても run 全体を完走させるため、各ターゲットを 1 つずつ計測し、
  // タイムアウトを設け、結果は逐次ファイルへ追記する。
  const writeProgress = async () => {
    try {
      await ipcRenderer.invoke('write-test-log', {
        fileName: 'source-decode-probe.log',
        content: `probe @ ${new Date().toISOString()}\n` + lines.map((l) => '  ' + l).join('\n') + '\n',
      });
    } catch { /* ignore */ }
  };

  for (const { label, channel } of targets) {
    const res = await ipcRenderer.invoke(channel);
    if (!res?.success || !res.filePath) { lines.push(`${label}: 見つからず`); await writeProgress(); continue; }
    const fileUrl = `file://${res.filePath}`;

    const probe = async (): Promise<string> => {
      const t0 = performance.now();
      let frames = 0; let firstError = ''; let firstFrameMs = -1;
      try {
        for await (const { frame } of decodeVideoStream(fileUrl, { endSec: SAMPLE_SEC })) {
          if (firstFrameMs < 0) firstFrameMs = performance.now() - t0; // 初フレーム＝起動(moov探索)時間
          frame.close(); frames++;
        }
      } catch (e) { firstError = e instanceof Error ? e.message : String(e); }
      const elapsed = (performance.now() - t0) / 1000;
      const fps = frames > 0 ? Math.round(frames / elapsed) : 0;
      return frames === 0
        ? `${label}: ❌不可 ${firstError ? '|' + firstError : ''}`
        : `${label}: ✅可 frames=${frames} ${fps}fps相当 起動=${firstFrameMs.toFixed(0)}ms ${firstError ? '|後半:' + firstError : ''}`;
    };

    let line: string;
    try {
      line = await Promise.race([
        probe(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
      ]);
    } catch {
      line = `${label}: ⏱️${TIMEOUT_MS}ms 以内に初フレーム到達せず（moov末尾 or HW初期化ハングの疑い）`;
    }
    lines.push(line);
    await writeProgress();
  }
  return lines.join('\n         ');
};

/**
 * HEVC ソースが VideoDecoder でデコードできない原因を段階的に切り分ける。
 * 各段階の結果を hevc-diagnosis.log に逐次追記する（ハングしても途中まで残る）。
 */
const testHevcDecodeDiagnosis = async (): Promise<string> => {
  const ipcRenderer = (window as any).ipcRenderer;
  if (!ipcRenderer) throw new Error('ipcRenderer が利用できません');
  const res = await ipcRenderer.invoke('resolve-perf-heavy-video');
  if (!res?.success || !res.filePath) throw new Error('HEVC サンプルが見つかりません');
  const fileUrl = `file://${res.filePath}`;

  const log: string[] = [];
  const flush = async () => {
    try {
      await ipcRenderer.invoke('write-test-log', {
        fileName: 'hevc-diagnosis.log',
        content: `HEVC 診断 @ ${new Date().toISOString()}\n` + log.map((l) => '  ' + l).join('\n') + '\n',
      });
    } catch { /* ignore */ }
  };
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout(${ms}ms)`)), ms))]);

  const extractDesc = (sampleDescription: any): Uint8Array | undefined => {
    const box = sampleDescription?.hvcC || sampleDescription?.avcC || sampleDescription?.vpcC;
    if (!box) return undefined;
    try {
      const stream = new (DataStream as any)(undefined, 0, (DataStream as any).BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array((stream.buffer as ArrayBuffer).slice(8, stream.position));
    } catch { return undefined; }
  };

  // ── Step 1: MP4Box 解析 ───────────────────────────────────────────────
  const mp4: ISOFile = createFile();
  let codec = '', tw = 0, th = 0, trackId = -1, timescale = 1;
  let firstSampleDesc: any = null;
  let onSamplesCalls = 0;
  const collected: { data: Uint8Array; cts: number; isSync: boolean }[] = [];
  const t0 = performance.now();
  const ready = new Promise<void>((resolve, reject) => {
    mp4.onReady = (info: any) => {
      const tr = info.videoTracks?.[0];
      if (!tr) { reject(new Error('動画トラック無し')); return; }
      trackId = tr.id; codec = tr.codec ?? ''; tw = tr.video?.width ?? 0; th = tr.video?.height ?? 0;
      timescale = tr.timescale ?? 1;
      mp4.setExtractionOptions(trackId, null, { nbSamples: 30 });
      (mp4 as any).onSamples = (_i: number, _r: unknown, samples: any[]) => {
        onSamplesCalls++;
        if (!firstSampleDesc && samples.length) firstSampleDesc = samples[0].description;
        for (const s of samples) {
          if (collected.length >= 30) break;
          if (s.data) collected.push({ data: s.data, cts: s.cts, isSync: !!s.is_sync });
        }
      };
      mp4.start();
      resolve();
    };
    mp4.onError = (e: string) => reject(new Error('MP4Box: ' + e));
  });

  try {
    const response = await fetch(fileUrl);
    if (!response.ok || !response.body) throw new Error('fetch 失敗');
    const reader = response.body.getReader();
    let offset = 0;
    // onReady が来るまで（または 5s）読み続ける
    const feed = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { mp4.flush(); break; }
        const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as MP4BoxBuffer;
        buf.fileStart = offset; offset += buf.byteLength; mp4.appendBuffer(buf);
        if (trackId >= 0 && collected.length >= 30) break; // サンプル収集済み
      }
    })();
    await withTimeout(ready, 5000, 'onReady');
    await withTimeout(feed, 20000, 'sampleCollect').catch(() => {});
    log.push(`Step1 MP4Box: codec="${codec}" ${tw}x${th} onReadyまで=${(performance.now() - t0).toFixed(0)}ms (moov先頭=OK)`);
  } catch (e) {
    log.push(`Step1 MP4Box: ❌ ${e instanceof Error ? e.message : String(e)}（moov末尾でファイル全読み必要の可能性）`);
    await flush();
    return log.join('\n         ');
  }
  await flush();

  // ── Step 2: hvcC description（sample 由来 vs stsd 由来）─────────────────
  const descFromSample = extractDesc(firstSampleDesc);
  const stsdEntry = (mp4 as any).getTrackById?.(trackId)?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const descFromStsd = extractDesc(stsdEntry);
  const desc = descFromStsd ?? descFromSample; // 修正後の本命は stsd 由来
  log.push(`Step2 description: sample由来=${descFromSample ? descFromSample.byteLength + 'B' : '❌'} / stsd由来=${descFromStsd ? descFromStsd.byteLength + 'B' : '❌'}`);
  // 構造を覗く（hvcC がどこにあるか特定するため）
  try {
    const d = firstSampleDesc;
    const keys = d ? Object.keys(d) : [];
    log.push(`  Step2-dbg desc.type=${d?.type} keys=[${keys.join(',')}]`);
    // boxes 配列があれば子ボックス型を列挙
    if (d?.boxes && Array.isArray(d.boxes)) {
      log.push(`  Step2-dbg boxes=[${d.boxes.map((b: any) => b?.type).join(',')}]`);
    }
    // よくある格納先を直接確認
    log.push(`  Step2-dbg hvcC=${!!d?.hvcC} avcC=${!!d?.avcC} config=${!!d?.config} hev1=${!!d?.hev1} hvc1=${!!d?.hvc1}`);
    // トラック全体の mdia 経由でも探す
    const trak = (mp4 as any).getTrackById?.(trackId);
    const stsd = trak?.mdia?.minf?.stbl?.stsd;
    const entry = stsd?.entries?.[0];
    log.push(`  Step2-dbg stsd.entry.type=${entry?.type} entry.hvcC=${!!entry?.hvcC} entryKeys=[${entry ? Object.keys(entry).join(',') : ''}]`);
  } catch (e) {
    log.push(`  Step2-dbg 例外 ${e instanceof Error ? e.message : String(e)}`);
  }
  await flush();

  // ── Step 3: isConfigSupported ─────────────────────────────────────────
  const candidates = [codec, 'hvc1.1.6.L150.90', 'hev1.1.6.L150.90'].filter((c, i, a) => c && a.indexOf(c) === i);
  for (const c of candidates) {
    for (const accel of ['prefer-hardware', 'prefer-software', 'no-preference'] as HardwareAcceleration[]) {
      try {
        const cfg: VideoDecoderConfig = { codec: c, codedWidth: tw, codedHeight: th, hardwareAcceleration: accel, ...(desc ? { description: desc } : {}) };
        const s = await withTimeout(VideoDecoder.isConfigSupported(cfg), 3000, 'isConfigSupported');
        log.push(`Step3 isConfigSupported codec="${c}" accel=${accel}: ${s.supported ? '✅supported' : '❌unsupported'}`);
      } catch (e) {
        log.push(`Step3 isConfigSupported codec="${c}" accel=${accel}: ⏱️/err ${e instanceof Error ? e.message : String(e)}`);
      }
      await flush();
    }
  }

  // ── Step 4: configure + バッファ済みサンプルを decode ───────────────────
  // stsd 由来 description で HW HEVC が実際にフレームを出すか／エラーするかを確認。
  log.push(`Step4 準備: collected=${collected.length} サンプル, onSamples呼び出し=${onSamplesCalls}回, timescale=${timescale}`);
  try {
    let outCount = 0, firstOut = -1, errMsg = '';
    const dec = new VideoDecoder({
      output: (f) => { outCount++; if (firstOut < 0) firstOut = performance.now() - t0; f.close(); },
      error: (e) => { errMsg = e.message; },
    });
    const cfg: VideoDecoderConfig = { codec, codedWidth: tw, codedHeight: th, hardwareAcceleration: 'prefer-hardware', ...(desc ? { description: desc } : {}) };
    dec.configure(cfg);
    let fed = 0;
    for (const s of collected) {
      dec.decode(new EncodedVideoChunk({
        type: s.isSync ? 'key' : 'delta',
        timestamp: Math.round((s.cts / timescale) * 1e6),
        data: s.data,
      }));
      fed++;
    }
    try { await withTimeout(dec.flush(), 5000, 'decoder.flush'); } catch (e) { if (!errMsg) errMsg = (e instanceof Error ? e.message : String(e)); }
    try { dec.close(); } catch { /* ignore */ }
    if (outCount > 0) log.push(`Step4 configure+decode: ✅ ${outCount}フレーム出力 (fed=${fed}, 初フレーム=${firstOut.toFixed(0)}ms)`);
    else if (errMsg) log.push(`Step4 configure+decode: ❌ decoderエラー="${errMsg}" (fed=${fed})`);
    else log.push(`Step4 configure+decode: ⏱️ 0フレーム・無エラー (fed=${fed}) ← HW HEVC が黙って出力しない`);
  } catch (e) {
    log.push(`Step4 configure+decode: ❌ configure throw="${e instanceof Error ? e.message : String(e)}"`);
  }
  await flush();

  return log.join('\n         ');
};

/**
 * PlaybackFrameProvider（rVFC 再生方式）で HEVC を取得できるか検証する。
 * 30fps で 2 秒ぶん getFrame し、取得 fps と取得フレームのユニーク数を計測。
 */
const testPlaybackProviderHevc = async (): Promise<string> => {
  const ipcRenderer = (window as any).ipcRenderer;
  if (!ipcRenderer) throw new Error('ipcRenderer が利用できません');

  const res = await ipcRenderer.invoke('resolve-perf-heavy-video');
  if (!res?.success || !res.filePath) throw new Error('HEVC サンプルが見つかりません');
  const fileUrl = `file://${res.filePath}`;

  // 30fps で 2 秒ぶん（60 枚）を要求。ソースは 60fps なので理想ユニークは ~60。
  const EXPORT_FPS = 30, SAMPLE_SEC = 2;
  const total = EXPORT_FPS * SAMPLE_SEC;
  const lines: string[] = [];

  for (const rate of [1, 2, 3, 4]) {
    const provider = new PlaybackFrameProvider(fileUrl, 0, SAMPLE_SEC, { playbackRate: rate });
    let got = 0;
    const uniq = new Set<unknown>();
    const t0 = performance.now();
    try {
      await Promise.race([
        provider.init(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('init timeout(8s)')), 8000)),
      ]);
      const tf = performance.now();
      for (let i = 0; i < total; i += 1) {
        const localUs = Math.round((i / EXPORT_FPS) * 1_000_000);
        const bmp = await provider.getFrame(localUs);
        if (bmp) { got += 1; uniq.add(bmp); }
      }
      const wallMs = performance.now() - tf;
      const fps = got > 0 ? Math.round(got / (wallMs / 1000)) : 0;
      const coverage = Math.round((uniq.size / total) * 100);
      lines.push(`rate=${rate}x: got=${got}/${total} uniq=${uniq.size}(${coverage}%) ${fps}fps相当 wall=${wallMs.toFixed(0)}ms`);
    } catch (e) {
      lines.push(`rate=${rate}x: ❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      provider.close();
    }
    try {
      await ipcRenderer.invoke('write-test-log', { fileName: 'playback-probe.log', content: lines.map((l) => '  ' + l).join('\n') + '\n' });
    } catch { /* ignore */ }
  }
  return lines.join('\n         ');
};

/**
 * エンコーダ背圧の検証: 生成がエンコードより速い状況（4K・高速生成）でも
 * encodeQueueSize（=メモリ）が無制限に積もらないことを確認する。
 */
const testEncoderBackpressure = async (): Promise<string> => {
  const W = 3840, H = 2160, FPS = 60, TOTAL = 600; // 10秒ぶんを即時供給
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;

  // ImageBitmap を即座に量産するジェネレータ（エンコードより速い供給を模倣）。
  async function* fastFrames() {
    for (let i = 0; i < TOTAL; i += 1) {
      ctx.fillStyle = `hsl(${(i / TOTAL) * 360}, 70%, 50%)`;
      ctx.fillRect(0, 0, W, H);
      const bitmap = await createImageBitmap(canvas);
      yield { timestamp: Math.round(i * 1_000_000 / FPS), bitmap };
      bitmap.close();
    }
  }

  const result = await encodeVideoToMp4({ width: W, height: H, fps: FPS, frames: fastFrames() });
  const speed = Math.round(TOTAL / (result.durationMs / 1000));
  // 背圧が効いていれば peak は MAX_QUEUE(8) 近傍に収まる。壊れていれば TOTAL 近くまで膨らむ。
  const ok = result.peakQueueSize <= 16;
  if (!ok) throw new Error(`背圧が効いていない: peakQueueSize=${result.peakQueueSize}（生成が積もっている）`);
  return `✅ peakQueueSize=${result.peakQueueSize}（上限内） frames=${TOTAL} ${speed}fps相当 size=${(result.buffer.byteLength / 1024 / 1024).toFixed(1)}MB`;
};

// ── エントリーポイント ─────────────────────────────────────────────────────

const formatLogLine = (tc: TestCase): string => {
  const status = tc.passed ? 'PASS' : 'FAIL';
  const detail = tc.detail ?? tc.error ?? '';
  return `  [${status}] ${tc.name}\n         ${detail}`;
};

export const runExportTests = async (): Promise<ExportTestResult> => {
  // results は module スコープで蓄積されるため、再実行時にリセット
  results.length = 0;

  const t0 = performance.now();
  console.group('[ExportTest] エクスポートパイプライン テスト開始');

  await run('コーデック検出（HW/SW 判定）', testCodecDetection);
  await run('無地フレームエンコード (1秒 640×360 30fps)', testEncodeBlankFrames);
  await run('エンコーダ背圧 (4K 高速供給でキュー上限を維持)', testEncoderBackpressure);
  await run('動画ファイルからのリエンコード (2秒 640×360) [seek]', testEncodeFromVideoFile);
  await run('4K 動画 FHD エンコード (5秒 1920×1080 60fps) [seek]', testEncode4KVideo);
  await run('H.264 動画エンコード (5秒 640×360) [VideoDecoder・シークなし]', testEncode4KVideoDecoder);
  await run('パイプライン フェーズ別内訳 (4K 出力・seek vs VideoDecoder)', testPipelinePhaseBreakdown);
  await run('ソース直接デコード可否 (H.264/HEVC)', testSourceDirectDecode);
  await run('rVFC 再生方式で HEVC 取得 (PlaybackFrameProvider)', testPlaybackProviderHevc);
  // 詳細診断は調査用ツール（通常 run から除外、必要時に手動で有効化）。
  void testHevcDecodeDiagnosis;

  console.groupEnd();

  const totalMs = performance.now() - t0;
  const passed = results.every(r => r.passed);
  console.log(`[ExportTest] ${passed ? '✅ ALL PASSED' : '❌ SOME FAILED'} (${totalMs.toFixed(0)}ms)`);

  const report: ExportTestResult = { passed, tests: results, totalMs };
  window.__exportTestResult = report;

  // テスト結果をファイルに書き出す（Claude が直接読めるように）
  const ipcRenderer = (window as any).ipcRenderer;
  if (ipcRenderer) {
    const now = new Date().toISOString();
    const lines = [
      `ExportTest Run: ${now}`,
      `Result: ${passed ? 'ALL PASSED' : 'SOME FAILED'}  (total: ${totalMs.toFixed(0)}ms)`,
      '',
      ...results.map(formatLogLine),
      '',
    ].join('\n');

    const jsonContent = JSON.stringify({ runAt: now, passed, totalMs, tests: results }, null, 2);

    await Promise.all([
      ipcRenderer.invoke('write-test-log', { fileName: 'export-test-results.log', content: lines }),
      ipcRenderer.invoke('write-test-log', { fileName: 'export-test-results.json', content: jsonContent }),
    ]).catch((e: unknown) => console.warn('[ExportTest] ログ書き出し失敗:', e));

    console.log('[ExportTest] 結果を perf/export-test-results.{log,json} に保存しました');

    // テスト専用起動時は結果書き出し後にアプリを終了する
    if (import.meta.env.VITE_EXPORT_TEST === '1') {
      await ipcRenderer.invoke('quit-app', { exitCode: passed ? 0 : 1 });
    }
  }

  return report;
};
