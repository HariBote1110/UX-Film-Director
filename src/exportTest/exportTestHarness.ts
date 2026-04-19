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

import { encodeVideoToMp4, detectSupportedH264Codec } from '../utils/videoExportPipeline';

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
  const detected = await detectSupportedH264Codec(1920, 1080, 30);
  if (!detected) throw new Error('H.264 コーデックが見つかりませんでした');
  return `codec = ${detected.codec}`;
};

const testEncodeBlankFrames = async (): Promise<string> => {
  const W = 640, H = 360, FPS = 30, DURATION_SEC = 1;
  const totalFrames = FPS * DURATION_SEC;

  // 無地フレームを生成するイテレータ
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
    width: W,
    height: H,
    fps: FPS,
    frames: blankFrames(),
  });

  if (result.buffer.byteLength < 1000) throw new Error('出力 MP4 が小さすぎます');
  return `codec=${result.codecUsed}, size=${(result.buffer.byteLength / 1024).toFixed(1)}KB, time=${result.durationMs.toFixed(0)}ms`;
};

const testEncodeFromVideoFile = async (): Promise<string> => {
  // perf/heavy-media の動画を fetch してデコード → 再エンコード
  const candidates = [
    'perf/heavy-media/10000kbps_60fps.mp4',
    '10000kbps_60fps.mp4',
  ];

  let videoUrl: string | null = null;
  for (const path of candidates) {
    try {
      const res = await fetch(path, { method: 'HEAD' });
      if (res.ok) { videoUrl = path; break; }
    } catch { /* try next */ }
  }
  if (!videoUrl) throw new Error('テスト動画が見つかりません（perf/heavy-media/10000kbps_60fps.mp4）');

  const W = 640, H = 360, FPS = 30, SAMPLE_SEC = 2;
  const totalFrames = FPS * SAMPLE_SEC;

  const video = document.createElement('video');
  video.src = videoUrl;
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
  return `source=${videoUrl}, codec=${result.codecUsed}, size=${(result.buffer.byteLength / 1024).toFixed(1)}KB, time=${result.durationMs.toFixed(0)}ms`;
};

// ── エントリーポイント ─────────────────────────────────────────────────────

export const runExportTests = async (): Promise<ExportTestResult> => {
  const t0 = performance.now();
  console.group('[ExportTest] エクスポートパイプライン テスト開始');

  await run('コーデック検出', testCodecDetection);
  await run('無地フレームエンコード (1秒 640×360 30fps)', testEncodeBlankFrames);
  await run('動画ファイルからのリエンコード (2秒)', testEncodeFromVideoFile);

  console.groupEnd();

  const totalMs = performance.now() - t0;
  const passed = results.every(r => r.passed);
  console.log(`[ExportTest] ${passed ? '✅ ALL PASSED' : '❌ SOME FAILED'} (${totalMs.toFixed(0)}ms)`);

  const report: ExportTestResult = { passed, tests: results, totalMs };
  window.__exportTestResult = report;
  return report;
};
