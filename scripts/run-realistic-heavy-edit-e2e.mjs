import { execFileSync, spawn } from 'node:child_process';
import { resolveCargoBin, buildCargoNotFoundHint } from './resolveCargo.mjs';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  CdpClient,
  collectConsoleLines,
  collectRuntimeErrors,
  sleep,
  waitForFreshElectronBundle,
  waitForHttp,
  waitForRendererTarget,
} from './lib/electron-e2e-driver.mjs';
import {
  diffChromiumPerformanceMetrics,
  summariseChromiumRendererTrace,
} from './lib/chromium-renderer-trace.mjs';
import {
  parseClearSelectionBeforePlaybackOption,
  parseCpuThrottleRateOption,
  resolveRealisticHeavyEditRustBackendBinaryProfile,
} from './lib/realistic-heavy-edit-options.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = resolve(ROOT, '.codex/realistic-heavy-edit-e2e');
const RESULT_JSON = resolve(OUTPUT_DIR, 'result.json');
const RESULT_LOG = resolve(OUTPUT_DIR, 'result.log');
const CHROMIUM_TRACE_PATH = resolve(OUTPUT_DIR, 'chromium-renderer-trace.json');
const SCREENSHOT_PATH = resolve(OUTPUT_DIR, 'viewport.png');
const PROJECT_PATH = resolve(OUTPUT_DIR, 'realistic-heavy-edit.uxfd.json');
const EXPORT_PATH = resolve(OUTPUT_DIR, 'realistic-heavy-edit-preview.mp4');
const AUDIO_PATH = resolve(OUTPUT_DIR, 'realistic-heavy-edit-bed.wav');
const VIDEO_PATH = resolve(
  process.env.UXFD_REALISTIC_HEAVY_EDIT_VIDEO_PATH
    ?? resolve(ROOT, 'perf/heavy-media/GX010052.MP4'),
);
const PROXY_PATH = resolve(
  process.env.UXFD_REALISTIC_HEAVY_EDIT_PROXY_PATH
    ?? resolve(ROOT, 'perf/heavy-media/GX010052.proxy.mp4'),
);
const IMAGE_PATH = resolve(
  process.env.UXFD_REALISTIC_HEAVY_EDIT_IMAGE_PATH
    ?? resolve(ROOT, 'public/icon.jpg'),
);
const VITE_PORT = Number(process.env.UXFD_REALISTIC_HEAVY_EDIT_VITE_PORT ?? 5312);
const DEBUG_PORT = Number(process.env.UXFD_REALISTIC_HEAVY_EDIT_DEBUG_PORT ?? 9344);
const TIMEOUT_MS = Number(process.env.UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS ?? 300_000);
const PLAYBACK_MS = Number(process.env.UXFD_REALISTIC_HEAVY_EDIT_PLAYBACK_MS ?? 3_000);
const SCRUB_ITERATIONS = Number(process.env.UXFD_REALISTIC_HEAVY_EDIT_SCRUB_ITERATIONS ?? 360);
const EXPORT_SECONDS = Number(process.env.UXFD_REALISTIC_HEAVY_EDIT_EXPORT_SECONDS ?? 2);
const SKIP_EXPORT = process.env.UXFD_REALISTIC_HEAVY_EDIT_SKIP_EXPORT === '1';
// preview/export画素比較（任意・既定OFF）。有効時はprepareShortExport後の
// プロジェクト状態のままCOMPARE_AT_SECONDSへseekしてプレビュー面を撮影し、
// 書き出しMP4の同時刻フレームとブロック平均で色差を比較する。閾値は
// コーデックノイズとスケーリングぼけを通し、色パイプライン（range/matrix）
// の不一致を落とすための初期値。実測メトリクスは常にresult.jsonへ記録する。
const COMPARE_ENABLED = process.env.UXFD_REALISTIC_HEAVY_EDIT_COMPARE === '1';
const COMPARE_AT_SECONDS = Number(
  process.env.UXFD_REALISTIC_HEAVY_EDIT_COMPARE_AT_SECONDS ?? 1.0,
);
const COMPARE_MAX_MEAN_BLOCK_DIFF = Number(
  process.env.UXFD_REALISTIC_HEAVY_EDIT_COMPARE_MAX_MEAN_DIFF ?? 8,
);
const COMPARE_MAX_P95_BLOCK_DIFF = Number(
  process.env.UXFD_REALISTIC_HEAVY_EDIT_COMPARE_MAX_P95_DIFF ?? 20,
);
const PREVIEW_WINDOW_PATH = resolve(OUTPUT_DIR, 'preview-window.png');
const PREVIEW_FRAME_PATH = resolve(OUTPUT_DIR, 'preview-frame.png');
const PREVIEW_FRAME_LATE_PATH = resolve(OUTPUT_DIR, 'preview-frame-late.png');
const EXPORT_FRAME_PATH = resolve(OUTPUT_DIR, 'export-frame.png');
// 撮影方法: 'seek'（停止seek後に撮影。seekモードでは2.5秒後の遅延撮影も
// 併せて行い、描画遅延か構造的な提示欠落かを切り分ける）か、
// 'play'（手前から再生して目標時刻で止めて撮影。実際に止まった時刻を
// 書き出しフレーム抽出に使う）。
const COMPARE_CAPTURE_MODE =
  process.env.UXFD_REALISTIC_HEAVY_EDIT_COMPARE_CAPTURE === 'play' ? 'play' : 'seek';
// IPC発生源（選択デコレーション送信経路 vs. presentフレーム本体経路）を切り分ける
// ための計測専用オプション。既定はfalseで従来どおり選択を維持したまま再生する。
const CLEAR_SELECTION_BEFORE_PLAYBACK = parseClearSelectionBeforePlaybackOption(process.env);
// CPUスロットリング倍率（既定1=スロットリングなし）。低スペック機での余裕度を
// 測るための任意オプション。詳細な制約はparseCpuThrottleRateOptionのコメントと
// 適用箇所（Emulation.setCPUThrottlingRate呼び出し）のコメントを参照。
const CPU_THROTTLE_RATE = parseCpuThrottleRateOption(process.env);
const COLLECT_CHROMIUM_TRACE =
  process.env.UXFD_REALISTIC_HEAVY_EDIT_CHROMIUM_TRACE !== '0';
// ネイティブオーバーレイの有効/無効（既定は有効で従来どおり）。
// preview/export画素比較はDOM canvas経由でプレビューを撮影するため、
// ネイティブオーバーレイが唯一の表示サーフェスになる構成では成立しない。
// 比較を行う場合は '0' を指定してフォールバックプレゼンター経路で実行する。
// （オーバーレイ側の画素そのものの検証は、ネイティブreadbackの全フレーム
// 取得が前提になるため別課題。）
const NATIVE_OVERLAY_ENABLED =
  process.env.UXFD_REALISTIC_HEAVY_EDIT_NATIVE_OVERLAY !== '0';
const NATIVE_OVERLAY_ENV = NATIVE_OVERLAY_ENABLED ? '1' : '0';
const USER_DATA_DIR = resolve(
  process.env.UXFD_REALISTIC_HEAVY_EDIT_USER_DATA_DIR
    ?? resolve(OUTPUT_DIR, `electron-profile-${process.pid}`),
);
const MAIN_BUNDLE = resolve(ROOT, 'dist-electron/main.js');
const PRELOAD_BUNDLE = resolve(ROOT, 'dist-electron/preload.js');
const NATIVE_OVERLAY_BUILD = resolve(ROOT, 'scripts/build-native-overlay-addon.mjs');
const SHARED_FRAME_BUILD = resolve(ROOT, 'scripts/build-shared-video-frame-node-addon.mjs');
const RUST_BACKEND_MANIFEST = resolve(ROOT, 'rust-backend/Cargo.toml');

let vite = null;
let electron = null;
let client = null;
const logLines = [];

const log = (message) => {
  const line = `[realistic-heavy-edit-e2e] ${message}`;
  logLines.push(line);
  console.log(line);
};

const writeWaveFixture = (filePath, durationSeconds = 8, sampleRate = 48_000) => {
  const frameCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = frameCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time * 4, (durationSeconds - time) * 4);
    const value = Math.sin(time * Math.PI * 2 * 220) * 0.16
      + Math.sin(time * Math.PI * 2 * 330) * 0.08;
    buffer.writeInt16LE(Math.round(value * envelope * 32767), 44 + index * 2);
  }
  writeFileSync(filePath, buffer);
};

const readImageDimensions = (filePath) => {
  const bytes = readFileSync(filePath);
  const isPng = bytes.length >= 24
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (isPng) {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const segmentLength = bytes.readUInt16BE(offset + 2);
      const isStartOfFrame = (
        marker >= 0xc0
        && marker <= 0xcf
        && ![0xc4, 0xc8, 0xcc].includes(marker)
      );
      if (isStartOfFrame && segmentLength >= 7) {
        return {
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      }
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }
  throw new Error(`PNG/JPEG dimensions could not be read: ${filePath}`);
};

const processSample = () => {
  try {
    const output = execFileSync('ps', ['-axo', 'pid,ppid,%cpu,%mem,rss,command'], {
      encoding: 'utf8',
    });
    return output.split('\n')
      .filter((line) => line.includes(USER_DATA_DIR) || line.includes('uxfd-rust-backend'))
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return [`ps failed: ${error instanceof Error ? error.message : String(error)}`];
  }
};

const collectChromiumRendererTrace = async (operation) => {
  if (!COLLECT_CHROMIUM_TRACE) {
    return {
      value: await operation(),
      summary: { collected: false, reason: 'disabled' },
    };
  }
  const eventStartIndex = client.events.length;
  await client.send('Performance.enable');
  const metricsBefore = await client.send('Performance.getMetrics');
  await client.send('Tracing.start', {
    categories: [
      'blink.user_timing',
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'toplevel',
      'v8',
    ].join(','),
    transferMode: 'ReportEvents',
  });
  let value;
  try {
    value = await operation();
  } finally {
    await client.send('Tracing.end');
  }
  const completionStartedAt = Date.now();
  while (
    Date.now() - completionStartedAt < 10_000
    && !client.events.slice(eventStartIndex).some(
      (event) => event.method === 'Tracing.tracingComplete',
    )
  ) {
    await sleep(25);
  }
  const traceEvents = client.events
    .slice(eventStartIndex)
    .filter((event) => event.method === 'Tracing.dataCollected')
    .flatMap((event) => event.params?.value ?? []);
  const metricsAfter = await client.send('Performance.getMetrics');
  writeFileSync(
    CHROMIUM_TRACE_PATH,
    `${JSON.stringify({ traceEvents })}\n`,
    'utf8',
  );
  return {
    value,
    summary: {
      collected: true,
      traceEventCount: traceEvents.length,
      path: CHROMIUM_TRACE_PATH,
      performanceMetrics: diffChromiumPerformanceMetrics(
        metricsBefore.metrics ?? [],
        metricsAfter.metrics ?? [],
      ),
      ...summariseChromiumRendererTrace(traceEvents),
    },
  };
};

const inspectExport = ({ expectedDurationSeconds, expectedFrameCount }) => {
  const stat = existsSync(EXPORT_PATH)
    ? { exists: true, size: statSync(EXPORT_PATH).size }
    : { exists: false, size: 0 };
  let probe = null;
  if (stat.exists) {
    try {
      const output = execFileSync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,nb_frames:format=duration',
        '-of', 'json',
        EXPORT_PATH,
      ], { encoding: 'utf8' });
      probe = JSON.parse(output);
    } catch (error) {
      probe = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  const stream = probe?.streams?.[0] ?? null;
  const actualDurationSeconds = Number(probe?.format?.duration);
  const actualFrameCount = Number(stream?.nb_frames);
  const geometryMatches = stream?.width === 1920 && stream?.height === 1080;
  const durationMatches = Number.isFinite(actualDurationSeconds)
    && Math.abs(actualDurationSeconds - expectedDurationSeconds) <= 0.05;
  const frameCountMatches = Number.isFinite(actualFrameCount)
    && Math.abs(actualFrameCount - expectedFrameCount) <= 1;
  return {
    ...stat,
    probe,
    expectedDurationSeconds,
    expectedFrameCount,
    actualDurationSeconds,
    actualFrameCount,
    geometryMatches,
    durationMatches,
    frameCountMatches,
    ok: stat.exists
      && stat.size > 10_000
      && geometryMatches
      && durationMatches
      && frameCountMatches,
  };
};

const inspectScreenshot = (filePath) => {
  const png = PNG.sync.read(Buffer.from(readFileSync(filePath)));
  let colourfulPixelCount = 0;
  let visiblePixelCount = 0;
  const xStart = Math.floor(png.width * 0.07);
  const xEnd = Math.floor(png.width * 0.68);
  const yStart = Math.floor(png.height * 0.05);
  const yEnd = Math.floor(png.height * 0.49);
  for (let y = yStart; y < yEnd; y += 2) {
    for (let x = xStart; x < xEnd; x += 2) {
      const offset = (y * png.width + x) * 4;
      const red = png.data[offset];
      const green = png.data[offset + 1];
      const blue = png.data[offset + 2];
      if (red + green + blue > 45) visiblePixelCount += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 24) {
        colourfulPixelCount += 1;
      }
    }
  }
  return {
    ok: visiblePixelCount >= 1_000 && colourfulPixelCount >= 250,
    width: png.width,
    height: png.height,
    visiblePixelCount,
    colourfulPixelCount,
  };
};

// 実ピクセル矩形でPNGを切り抜く。矩形は端数切り捨て＋画像範囲へクランプする。
const cropPng = (png, rect) => {
  const x0 = Math.max(0, Math.min(png.width - 1, Math.floor(rect.x)));
  const y0 = Math.max(0, Math.min(png.height - 1, Math.floor(rect.y)));
  const x1 = Math.max(x0 + 1, Math.min(png.width, Math.ceil(rect.x + rect.width)));
  const y1 = Math.max(y0 + 1, Math.min(png.height, Math.ceil(rect.y + rect.height)));
  const out = new PNG({ width: x1 - x0, height: y1 - y0 });
  for (let y = y0; y < y1; y += 1) {
    const srcStart = (y * png.width + x0) * 4;
    const srcEnd = (y * png.width + x1) * 4;
    png.data.copy(out.data, (y - y0) * out.width * 4, srcStart, srcEnd);
  }
  return out;
};

// 指定矩形内をblocksX×blocksYの格子に分け、各ブロックのRGB平均を返す。
// 生ピクセル単位ではなくブロック平均で比べることで、プレビューの
// スケーリングぼけとエンコードノイズを平均化し、面全体の色のズレだけを拾う。
const blockMeans = (png, rect, blocksX, blocksY) => {
  const means = [];
  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const x0 = Math.floor(rect.x + (rect.width * bx) / blocksX);
      const x1 = Math.max(x0 + 1, Math.floor(rect.x + (rect.width * (bx + 1)) / blocksX));
      const y0 = Math.floor(rect.y + (rect.height * by) / blocksY);
      const y1 = Math.max(y0 + 1, Math.floor(rect.y + (rect.height * (by + 1)) / blocksY));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * png.width + x) * 4;
          r += png.data[offset];
          g += png.data[offset + 1];
          b += png.data[offset + 2];
          count += 1;
        }
      }
      means.push([r / count, g / count, b / count]);
    }
  }
  return means;
};

// プレビュー切り抜きと書き出しフレームを比較する。プレビュー面の矩形が
// プロジェクトのアスペクトと完全一致しない場合に備え、書き出しフレームの
// アスペクトをプレビュー側へ中央フィットさせた部分矩形だけを対象にする。
const comparePreviewAndExportFrames = (previewPng, exportPng) => {
  const blocksX = 48;
  const blocksY = 27;
  const exportAspect = exportPng.width / exportPng.height;
  let fitWidth = previewPng.width;
  let fitHeight = Math.round(fitWidth / exportAspect);
  if (fitHeight > previewPng.height) {
    fitHeight = previewPng.height;
    fitWidth = Math.round(fitHeight * exportAspect);
  }
  const fitRect = {
    x: Math.floor((previewPng.width - fitWidth) / 2),
    y: Math.floor((previewPng.height - fitHeight) / 2),
    width: fitWidth,
    height: fitHeight,
  };
  const previewMeans = blockMeans(previewPng, fitRect, blocksX, blocksY);
  const exportMeans = blockMeans(
    exportPng,
    { x: 0, y: 0, width: exportPng.width, height: exportPng.height },
    blocksX,
    blocksY,
  );
  const diffs = previewMeans.map((mean, index) => {
    const other = exportMeans[index];
    return (
      Math.abs(mean[0] - other[0])
      + Math.abs(mean[1] - other[1])
      + Math.abs(mean[2] - other[2])
    ) / 3;
  });
  const sorted = [...diffs].sort((a, b) => a - b);
  const meanBlockDiff = diffs.reduce((total, value) => total + value, 0) / diffs.length;
  const p95BlockDiff = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const maxBlockDiff = sorted[sorted.length - 1];
  return {
    blocksX,
    blocksY,
    fitRect,
    meanBlockDiff,
    p95BlockDiff,
    maxBlockDiff,
    thresholds: {
      maxMeanBlockDiff: COMPARE_MAX_MEAN_BLOCK_DIFF,
      maxP95BlockDiff: COMPARE_MAX_P95_BLOCK_DIFF,
    },
    ok: meanBlockDiff <= COMPARE_MAX_MEAN_BLOCK_DIFF
      && p95BlockDiff <= COMPARE_MAX_P95_BLOCK_DIFF,
  };
};

const waitForHarness = async () => client.evaluate(`
  new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__) {
        resolve({ ok: true });
        return;
      }
      if (Date.now() - startedAt > 20000) {
        resolve({ ok: false, body: document.body.innerText });
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  })
`);

const waitForExport = async () => {
  const clicked = await client.evaluate(`
    (() => {
      const button = [...document.querySelectorAll('button')].find((entry) => (
        (entry.textContent || '').includes('動画出力')
        || (entry.textContent || '').includes('Export')
      ));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) return { ok: false, reason: 'exportButtonMissing' };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 240_000) {
    const completion = client.dialogs.find((dialog) => (
      dialog.message.includes('エクスポート完了')
      || dialog.message.includes('エクスポート失敗')
    ));
    if (completion) {
      return {
        ok: completion.message.includes('エクスポート完了'),
        durationMs: Date.now() - startedAt,
        dialog: completion,
      };
    }
    await sleep(500);
  }
  return { ok: false, reason: 'exportTimeout', durationMs: Date.now() - startedAt };
};

// export直後はscene再評価が飛行中になり得るため、presenterとRust timelineの
// 双方がreadyへ戻ることを整定条件とする。10秒で戻らない場合はタイムアウト時点の
// 状態をそのまま記録して原因を追える形で残す。
const waitForSettledSnapshot = async () => client.evaluate(`
  new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      const snapshot = window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.snapshot();
      const settled = snapshot.ok === true
        && snapshot.rustTimelineStatus === 'ready'
        && snapshot.presenterStatus === 'ready';
      if (settled || Date.now() - startedAt > 10000) {
        resolve({ ...snapshot, settled, settleWaitMs: Date.now() - startedAt });
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  })
`);

// preview/export比較の前半: 目標時刻へseekし、整定を待ってからプレビュー面の
// 矩形でウィンドウ撮影を切り抜く。失敗した場合は理由を記録してcaptured:false
// を返し、呼び出し側で比較全体をFAILにできるようにする（無言スキップしない）。
const capturePreviewFrameForCompare = async () => {
  const requestedSeconds = Math.max(
    0.05,
    Math.min(EXPORT_SECONDS - 0.05, COMPARE_AT_SECONDS),
  );
  let seek;
  let atSeconds = requestedSeconds;
  if (COMPARE_CAPTURE_MODE === 'play') {
    seek = await client.evaluate(`
      window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.playAndPauseAt(${JSON.stringify(requestedSeconds)})
    `);
    const actual = seek?.snapshot?.currentTime;
    if (typeof actual === 'number' && Number.isFinite(actual)) {
      atSeconds = actual;
    }
  } else {
    seek = await client.evaluate(`
      window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.seekTo(${JSON.stringify(requestedSeconds)})
    `);
  }
  if (!seek?.ok) {
    return {
      ok: false,
      captured: false,
      reason: 'seekFailed',
      captureMode: COMPARE_CAPTURE_MODE,
      atSeconds,
      seek,
    };
  }
  const settled = await waitForSettledSnapshot();
  const rect = await client.evaluate(`
    window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.previewRect()
  `);
  if (!rect?.ok) {
    return {
      ok: false,
      captured: false,
      reason: 'previewRectFailed',
      hint: rect?.visibility === 'hidden'
        ? 'プレビュー面が非表示です。ネイティブオーバーレイ提示中はDOM canvasに画素が無いため、比較は UXFD_REALISTIC_HEAVY_EDIT_NATIVE_OVERLAY=0 のフォールバック経路で実行してください。'
        : null,
      captureMode: COMPARE_CAPTURE_MODE,
      atSeconds,
      seek,
      rect,
    };
  }
  const captureCroppedFrame = async (windowPath, framePath) => {
    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(windowPath, Buffer.from(shot.data, 'base64'));
    const windowPng = PNG.sync.read(Buffer.from(readFileSync(windowPath)));
    const scaleX = windowPng.width / rect.innerWidth;
    const scaleY = windowPng.height / rect.innerHeight;
    const deviceRect = {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    };
    const frame = cropPng(windowPng, deviceRect);
    writeFileSync(framePath, PNG.sync.write(frame));
    return deviceRect;
  };
  const deviceRect = await captureCroppedFrame(PREVIEW_WINDOW_PATH, PREVIEW_FRAME_PATH);
  // seekモードのみ: 同じ状態のまま2.5秒後にもう一度撮る。遅延撮影で合成が
  // 現れるなら描画タイミングの問題、現れないなら構造的な提示欠落。
  let lateCapture = null;
  if (COMPARE_CAPTURE_MODE === 'seek') {
    await sleep(2_500);
    await captureCroppedFrame(PREVIEW_WINDOW_PATH, PREVIEW_FRAME_LATE_PATH);
    lateCapture = { previewFrameLate: PREVIEW_FRAME_LATE_PATH, delayMs: 2_500 };
  }
  // 書き出し自体はplayhead位置に依存しないが、従来フロー（prepareShortExport
  // 直後はcurrentTime=0）と条件を揃えるため、先頭へ戻してから書き出しへ進む。
  const backToStart = await client.evaluate(`
    window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.seekTo(0)
  `);
  return {
    ok: false,
    captured: true,
    pendingExport: true,
    captureMode: COMPARE_CAPTURE_MODE,
    requestedSeconds,
    atSeconds,
    seek,
    settledSnapshot: settled,
    rect,
    deviceRect,
    backToStart,
    lateCapture,
    previewFrame: PREVIEW_FRAME_PATH,
    previewWindow: PREVIEW_WINDOW_PATH,
  };
};

// preview/export比較の後半: 書き出しMP4から同時刻フレームを抽出し、
// ブロック平均の色差メトリクスで判定する。
const finishPreviewExportCompare = (partial) => {
  try {
    execFileSync('ffmpeg', [
      '-y',
      '-ss', String(partial.atSeconds),
      '-i', EXPORT_PATH,
      '-frames:v', '1',
      EXPORT_FRAME_PATH,
    ], { stdio: 'pipe' });
  } catch (error) {
    return {
      ...partial,
      ok: false,
      reason: 'exportFrameExtractFailed',
      error: String(error?.message ?? error),
    };
  }
  const previewPng = PNG.sync.read(Buffer.from(readFileSync(PREVIEW_FRAME_PATH)));
  const exportPng = PNG.sync.read(Buffer.from(readFileSync(EXPORT_FRAME_PATH)));
  const metrics = comparePreviewAndExportFrames(previewPng, exportPng);
  let lateMetrics = null;
  if (partial.lateCapture && existsSync(PREVIEW_FRAME_LATE_PATH)) {
    const latePng = PNG.sync.read(Buffer.from(readFileSync(PREVIEW_FRAME_LATE_PATH)));
    lateMetrics = comparePreviewAndExportFrames(latePng, exportPng);
  }
  return {
    ...partial,
    ...metrics,
    lateMetrics,
    exportFrame: EXPORT_FRAME_PATH,
    ok: metrics.ok,
  };
};

const stopProcesses = () => {
  client?.close();
  for (const child of [electron, vite]) {
    if (child && !child.killed) child.kill('SIGTERM');
  }
};

const main = async () => {
  for (const [label, path] of [
    ['video', VIDEO_PATH],
    ['image', IMAGE_PATH],
  ]) {
    if (!existsSync(path)) throw new Error(`${label} fixture is missing: ${path}`);
  }

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(USER_DATA_DIR, { recursive: true });
  writeWaveFixture(AUDIO_PATH);

  log('ネイティブ描画・共有フレーム・Rust backendを再ビルド');
  execFileSync(process.execPath, [NATIVE_OVERLAY_BUILD], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [SHARED_FRAME_BUILD], { cwd: ROOT, stdio: 'inherit' });
  const cargoBin = resolveCargoBin();
  try {
    execFileSync(cargoBin, ['build', '--manifest-path', RUST_BACKEND_MANIFEST], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.error(buildCargoNotFoundHint('run-realistic-heavy-edit-e2e'));
    }
    throw err;
  }

  const viteStartedAtMs = Date.now();
  log(`Vite起動: ${VITE_PORT}`);
  vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_UXFD_RUST_TIMELINE_SCENE_RPC: '1',
      VITE_UXFD_NATIVE_OVERLAY: NATIVE_OVERLAY_ENV,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  vite.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  await waitForHttp(`http://localhost:${VITE_PORT}/`);
  await waitForFreshElectronBundle({
    mainBundle: MAIN_BUNDLE,
    preloadBundle: PRELOAD_BUNDLE,
    startedAtMs: viteStartedAtMs,
  });

  log(`Electron起動: debug=${DEBUG_PORT}`);
  electron = spawn(resolve(ROOT, 'node_modules/.bin/electron'), [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '.',
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `http://localhost:${VITE_PORT}/?realisticHeavyEditE2e=1`,
      UXFD_VIDEO_EXPORT_E2E_SAVE_PATH: EXPORT_PATH,
      VITE_UXFD_NATIVE_OVERLAY: NATIVE_OVERLAY_ENV,
      UXFD_NATIVE_OVERLAY: NATIVE_OVERLAY_ENV,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  electron.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  electron.stderr.on('data', (chunk) => log(chunk.toString().trim()));

  const target = await waitForRendererTarget({
    debugPort: DEBUG_PORT,
    urlPrefix: `http://localhost:${VITE_PORT}/`,
  });
  client = new CdpClient(target.webSocketDebuggerUrl, TIMEOUT_MS);
  await client.connect();
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');

  // NOTE: Emulation.setCPUThrottlingRate はrenderer processのmain threadのみを
  // 遅くするCDPコマンドである。Electron main process・Rust backendプロセス・
  // GPUはこれによって一切遅くならないため、「遅い実機のシミュレーション」には
  // ならない。あくまでrenderer main threadの余裕度だけを狙い撃ちで測るための
  // 限定的な手段であり、CPU_THROTTLE_RATE!==1で測った結果を「低スペック機で
  // どう動くか」の答えとして扱ってはならない。measured exerciseの前、CDP接続
  // 確立後というできるだけ早いタイミングで適用する。
  if (CPU_THROTTLE_RATE !== 1) {
    log(`CPUスロットリングを適用: rate=${CPU_THROTTLE_RATE}（renderer main threadのみ、他プロセス・GPUは対象外）`);
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
  }

  const ready = await waitForHarness();
  if (!ready?.ok) throw new Error(`renderer harness did not become ready: ${JSON.stringify(ready)}`);

  const imageDimensions = readImageDimensions(IMAGE_PATH);
  const paths = {
    videoPath: VIDEO_PATH,
    proxyPath: existsSync(PROXY_PATH) ? PROXY_PATH : undefined,
    audioPath: AUDIO_PATH,
    imagePath: IMAGE_PATH,
    imageWidth: imageDimensions.width,
    imageHeight: imageDimensions.height,
  };
  log('重量プロジェクトを生成');
  const seed = await client.evaluate(`
    window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.seed(${JSON.stringify(paths)})
  `);

  log('スクラブ・複製・Undo/Redo・シーン切替・再生を実行');
  const exercisePromise = collectChromiumRendererTrace(() => client.evaluate(`
      window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.exercise({
        scrubIterations: ${JSON.stringify(SCRUB_ITERATIONS)},
        playbackMs: ${JSON.stringify(PLAYBACK_MS)},
        clearSelectionBeforePlayback: ${JSON.stringify(CLEAR_SELECTION_BEFORE_PLAYBACK)}
      })
    `));
  await sleep(Math.min(1_500, Math.max(500, PLAYBACK_MS / 2)));
  const processesDuringPlayback = processSample();
  const tracedExercise = await exercisePromise;
  const exercise = tracedExercise.value;
  const chromiumRendererTrace = tracedExercise.summary;

  log('保存形式の直列化・復元を検証');
  const roundTrip = await client.evaluate(`
    window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.roundTrip()
  `);
  const projectText = await client.evaluate(`
    window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.serialiseProject()
  `);
  writeFileSync(PROJECT_PATH, projectText, 'utf8');

  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  const screenshotInspection = inspectScreenshot(SCREENSHOT_PATH);

  let exportPreparation = { ok: true, skipped: true };
  let exportRun = { ok: true, skipped: true };
  let exportedFile = { ok: true, skipped: true };
  let previewExportCompare = { ok: true, skipped: true };
  if (!SKIP_EXPORT) {
    log(`${EXPORT_SECONDS}秒の重量混在シーンを書き出し`);
    exportPreparation = await client.evaluate(`
      window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.prepareShortExport(${JSON.stringify(EXPORT_SECONDS)})
    `);
    if (COMPARE_ENABLED) {
      // prepareShortExport後の状態（全オブジェクトの尺・開始時刻が書き出し用に
      // 揃った状態）でプレビューを撮る。書き出しと評価条件を一致させるため、
      // 撮影は必ずこの後・書き出し実行の前に行う。
      previewExportCompare = await capturePreviewFrameForCompare();
    }
    exportRun = await waitForExport();
    exportedFile = inspectExport({
      expectedDurationSeconds: exportPreparation.expectedDurationSeconds,
      expectedFrameCount: exportPreparation.expectedFrameCount,
    });
    if (COMPARE_ENABLED && previewExportCompare.captured === true) {
      previewExportCompare = exportedFile?.ok === true
        ? finishPreviewExportCompare(previewExportCompare)
        : { ...previewExportCompare, ok: false, reason: 'exportFailed' };
    }
  }

  const finalSnapshot = await waitForSettledSnapshot();
  const runtimeErrors = collectRuntimeErrors(client);
  const consoleLines = collectConsoleLines(client);
  const missingSourceLines = consoleLines.filter((line) => line.includes('MissingSource'));
  const nativeRenderErrorLines = logLines.filter((line) => (
    line.includes('wgpu uncaptured error')
    || line.includes('Shader validation error')
  ));
  const rustBackendBinaryPath = process.env.UXFD_RUST_BACKEND_BIN ?? null;
  const result = {
    passed: seed?.ok === true
      && exercise?.ok === true
      && roundTrip?.ok === true
      && exportPreparation?.ok === true
      && exportRun?.ok === true
      && exportedFile?.ok === true
      && runtimeErrors.length === 0
      && missingSourceLines.length === 0
      && nativeRenderErrorLines.length === 0
      && finalSnapshot?.ok === true
      && screenshotInspection.ok === true
      && (!COMPARE_ENABLED || previewExportCompare?.ok === true),
    paths: {
      video: VIDEO_PATH,
      proxy: existsSync(PROXY_PATH) ? PROXY_PATH : null,
      image: IMAGE_PATH,
      audio: AUDIO_PATH,
      project: PROJECT_PATH,
      screenshot: SCREENSHOT_PATH,
      export: SKIP_EXPORT ? null : EXPORT_PATH,
      chromiumRendererTrace: COLLECT_CHROMIUM_TRACE ? CHROMIUM_TRACE_PATH : null,
    },
    rustBackendBinary: {
      path: rustBackendBinaryPath,
      profile: resolveRealisticHeavyEditRustBackendBinaryProfile(rustBackendBinaryPath),
    },
    // scope: 'rendererMainThreadOnly' — Emulation.setCPUThrottlingRateはrenderer
    // processのmain threadのみを遅くし、Electron main process・Rust backend・
    // GPUは対象外である。rate!==1の結果を「低スペック機の再現」として読んでは
    // ならない。詳細はCDP呼び出し箇所とparseCpuThrottleRateOptionのコメントを参照。
    cpuThrottle: {
      rate: CPU_THROTTLE_RATE,
      scope: 'rendererMainThreadOnly',
    },
    nativeOverlayEnabled: NATIVE_OVERLAY_ENABLED,
    seed,
    exercise,
    roundTrip,
    exportPreparation,
    exportRun,
    exportedFile,
    previewExportCompare: COMPARE_ENABLED ? previewExportCompare : { skipped: true },
    finalSnapshot,
    screenshotInspection,
    processesDuringPlayback,
    chromiumRendererTrace,
    runtimeErrors,
    missingSourceLines,
    nativeRenderErrorLines,
    dialogs: client.dialogs,
  };
  if (COMPARE_ENABLED) {
    log(`previewExportCompare: ok=${previewExportCompare?.ok} meanBlockDiff=${previewExportCompare?.meanBlockDiff} p95BlockDiff=${previewExportCompare?.p95BlockDiff} maxBlockDiff=${previewExportCompare?.maxBlockDiff} reason=${previewExportCompare?.reason ?? 'none'}`);
  }
  writeFileSync(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
  log(`結果: ${result.passed ? 'PASS' : 'FAIL'} ${RESULT_JSON}`);
  // shared renderer presenter のフル再起動回数（約28ms/回のコストと見積もられて
  // いる）を常設の診断指標として出す。詳細は
  // src/e2e/realisticHeavyEditPresenterRestarts.ts のファイル冒頭コメントを参照。
  // PASS/FAIL判定には影響させない。
  const presenterRestarts = exercise?.presenterRestarts ?? null;
  if (presenterRestarts) {
    log(`presenterRestarts.duringPlayback=${presenterRestarts.duringPlayback} (before=${presenterRestarts.before} / after=${presenterRestarts.after})`);
  }
  // 有効性ゲート: rAFがスロットリングされていると回数系の性能指標
  // （rafSampleCount/rafMeanMs/Viewport commits/layoutCount等）が桁違いに
  // 悪化するのに機能的な正しさは影響を受けず総合PASSしてしまう。ここでは
  // 総合PASS/FAILの判定自体は変えない（機能的な正しさは別問題であり、
  // スロットリングを理由にE2Eを失敗させたいわけではない）。あくまで
  // 「性能指標を比較に使ってよいか」を目立つ警告として出すだけに留める。
  const playbackClockHealth = exercise?.playbackClockHealth ?? null;
  if (playbackClockHealth && playbackClockHealth.healthy === false) {
    log('警告: 再生計測がスロットリングされている可能性があります。今回の性能指標（rafSampleCount/rafMeanMs等）を比較・改善判定に使ってはいけません。');
    log(`警告理由: ${playbackClockHealth.reason} / 実測 rafSampleCount=${exercise.rafSampleCount} rafMeanMs=${exercise.rafMeanMs}`);
    log('警告: 他アプリがElectronウィンドウを隠していないか・ウィンドウがバックグラウンドへ回っていないかを確認したうえで、この重量E2Eを測り直してください。');
  }
  // engage遅延（startScenePlayback≒presentSceneMs）が起動時1回限りのコールド
  // コストか再生開始毎の恒常コストかを切り分けるための計測。詳細は
  // src/e2e/realisticHeavyEditSecondPlaybackStart.ts のファイル冒頭コメントを参照。
  // PASS/FAIL判定には影響させない。
  const secondPlaybackStart = exercise?.secondPlaybackStart ?? null;
  if (secondPlaybackStart?.observed) {
    log(`secondPlaybackStart: totalMs=${secondPlaybackStart.totalMs} presentSceneMs=${secondPlaybackStart.presentSceneMs} isFirstStartSinceLaunch=${secondPlaybackStart.isFirstStartSinceLaunch}`);
  } else {
    log('secondPlaybackStart: 観測されませんでした（2回目のstartPlaybackサンプルが記録されていません）。');
  }
  stopProcesses();
  process.exit(result.passed ? 0 : 1);
};

const timeout = setTimeout(() => {
  log(`全体タイムアウト: ${TIMEOUT_MS}ms`);
  stopProcesses();
  process.exit(124);
}, TIMEOUT_MS);

main()
  .catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    log(`失敗: ${message}`);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
    stopProcesses();
    process.exit(1);
  })
  .finally(() => clearTimeout(timeout));
