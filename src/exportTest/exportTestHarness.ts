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
    const error = e instanceof Error ? e.message : String(e);
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
  await run('動画ファイルからのリエンコード (2秒 640×360)', testEncodeFromVideoFile);
  await run('4K 動画 FHD ダウンスケールエンコード (5秒 1920×1080 60fps)', testEncode4KVideo);

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
