import { execFileSync, spawn } from 'node:child_process';
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
import { parseClearSelectionBeforePlaybackOption } from './lib/realistic-heavy-edit-options.mjs';

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
// IPC発生源（選択デコレーション送信経路 vs. presentフレーム本体経路）を切り分ける
// ための計測専用オプション。既定はfalseで従来どおり選択を維持したまま再生する。
const CLEAR_SELECTION_BEFORE_PLAYBACK = parseClearSelectionBeforePlaybackOption(process.env);
const COLLECT_CHROMIUM_TRACE =
  process.env.UXFD_REALISTIC_HEAVY_EDIT_CHROMIUM_TRACE !== '0';
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
  execFileSync('cargo', ['build', '--manifest-path', RUST_BACKEND_MANIFEST], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const viteStartedAtMs = Date.now();
  log(`Vite起動: ${VITE_PORT}`);
  vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_UXFD_RUST_TIMELINE_SCENE_RPC: '1',
      VITE_UXFD_NATIVE_OVERLAY: '1',
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
      VITE_UXFD_NATIVE_OVERLAY: '1',
      UXFD_NATIVE_OVERLAY: '1',
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
  if (!SKIP_EXPORT) {
    log(`${EXPORT_SECONDS}秒の重量混在シーンを書き出し`);
    exportPreparation = await client.evaluate(`
      window.__UXFD_REALISTIC_HEAVY_EDIT_E2E__.prepareShortExport(${JSON.stringify(EXPORT_SECONDS)})
    `);
    exportRun = await waitForExport();
    exportedFile = inspectExport({
      expectedDurationSeconds: exportPreparation.expectedDurationSeconds,
      expectedFrameCount: exportPreparation.expectedFrameCount,
    });
  }

  const finalSnapshot = await waitForSettledSnapshot();
  const runtimeErrors = collectRuntimeErrors(client);
  const consoleLines = collectConsoleLines(client);
  const missingSourceLines = consoleLines.filter((line) => line.includes('MissingSource'));
  const nativeRenderErrorLines = logLines.filter((line) => (
    line.includes('wgpu uncaptured error')
    || line.includes('Shader validation error')
  ));
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
      && screenshotInspection.ok === true,
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
    seed,
    exercise,
    roundTrip,
    exportPreparation,
    exportRun,
    exportedFile,
    finalSnapshot,
    screenshotInspection,
    processesDuringPlayback,
    chromiumRendererTrace,
    runtimeErrors,
    missingSourceLines,
    nativeRenderErrorLines,
    dialogs: client.dialogs,
  };
  writeFileSync(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
  log(`結果: ${result.passed ? 'PASS' : 'FAIL'} ${RESULT_JSON}`);
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
