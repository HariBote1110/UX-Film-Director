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
  await run('動画ファイルからのリエンコード (2秒 640×360) [seek]', testEncodeFromVideoFile);
  await run('4K 動画 FHD エンコード (5秒 1920×1080 60fps) [seek]', testEncode4KVideo);
  await run('H.264 動画エンコード (5秒 640×360) [VideoDecoder・シークなし]', testEncode4KVideoDecoder);
  await run('パイプライン フェーズ別内訳 (4K 出力・seek vs VideoDecoder)', testPipelinePhaseBreakdown);

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
