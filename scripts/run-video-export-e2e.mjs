import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = Number(process.env.UXFD_VIDEO_EXPORT_E2E_VITE_PORT ?? 5302);
const DEBUG_PORT = Number(process.env.UXFD_VIDEO_EXPORT_E2E_DEBUG_PORT ?? 9334);
const VIDEO_PATH = process.env.UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH
  ? resolve(process.env.UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH)
  : resolve(ROOT, 'perf/heavy-media/GX010052.MP4');
const AGENT_PROJECT_PATH = process.env.UXFD_VIDEO_EXPORT_E2E_AGENT_PROJECT_PATH
  ? resolve(process.env.UXFD_VIDEO_EXPORT_E2E_AGENT_PROJECT_PATH)
  : null;
const AGENT_PROJECT_SPEC = AGENT_PROJECT_PATH && existsSync(AGENT_PROJECT_PATH)
  ? JSON.parse(readFileSync(AGENT_PROJECT_PATH, 'utf8'))
  : null;
const AGENT_PROJECT_URL_PATH = AGENT_PROJECT_PATH
  ? `/${relative(resolve(ROOT, 'public'), AGENT_PROJECT_PATH).replaceAll('\\', '/')}`
  : null;
const VIDEO_NAME = VIDEO_PATH.split('/').pop() ?? 'video';
const OUTPUT_DIR = resolve(ROOT, '.codex/video-export-e2e');
// エージェント用レシピ経由の実行(AGENT_PROJECT_PATH あり)は、実行のたびに一意なファイル名を使う。
// これにより同じレシピを連続実行しても前回の出力を上書きせず、複数レシピの動画を並べて比較できる。
// USER_DATA_DIR で既に使っている `electron-profile-${process.pid}` の一意化パターンに倣い、
// レシピのベース名(拡張子なし) + プロセスID を組み合わせる(例: focus-tips-e2e-12345.mp4)。
// レシピを伴わない他の呼び出し元(test:video-export:e2e 等)は、従来どおり固定パスを使い続ける。
const AGENT_PROJECT_BASENAME = AGENT_PROJECT_PATH
  ? AGENT_PROJECT_PATH.split('/').pop()?.replace(/\.[^./]+$/, '') ?? 'agent-project'
  : null;
const OUTPUT_MP4 = AGENT_PROJECT_PATH
  ? resolve(OUTPUT_DIR, `${AGENT_PROJECT_BASENAME}-e2e-${process.pid}.mp4`)
  : resolve(OUTPUT_DIR, 'video-export-e2e-output.mp4');
const OUTPUT_FRAME_RGBA = resolve(OUTPUT_DIR, 'video-export-e2e-frame0.rgba');
const RESULT_JSON = resolve(OUTPUT_DIR, 'result.json');
const RESULT_LOG = resolve(OUTPUT_DIR, 'result.log');
const ELECTRON_MAIN_BUNDLE = resolve(ROOT, 'dist-electron/main.js');
const ELECTRON_PRELOAD_BUNDLE = resolve(ROOT, 'dist-electron/preload.js');
const USER_DATA_DIR = process.env.UXFD_VIDEO_EXPORT_E2E_USER_DATA_DIR
  ? resolve(process.env.UXFD_VIDEO_EXPORT_E2E_USER_DATA_DIR)
  : resolve(OUTPUT_DIR, `electron-profile-${process.pid}`);
const OVERALL_TIMEOUT_MS = Number(process.env.UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS ?? 180_000);
const EXPORT_DURATION_SECONDS = Number(
  process.env.UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS
    ?? AGENT_PROJECT_SPEC?.project?.duration
    ?? 1,
);
const REPEAT_EXPORTS = Math.max(1, Math.min(3, Number(process.env.UXFD_VIDEO_EXPORT_E2E_REPEAT_EXPORTS ?? 1)));
const EXPECT_REPEAT_SPEEDUP = process.env.UXFD_VIDEO_EXPORT_E2E_EXPECT_REPEAT_SPEEDUP === '1';
const EXPECT_ENCODER_PATH = process.env.UXFD_VIDEO_EXPORT_E2E_EXPECT_ENCODER_PATH?.trim() || null;
const VIDEO_PATCH = process.env.UXFD_VIDEO_EXPORT_E2E_VIDEO_PATCH_JSON
  ? JSON.parse(process.env.UXFD_VIDEO_EXPORT_E2E_VIDEO_PATCH_JSON)
  : null;
const ADD_MIXED_MEDIA = process.env.UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA === '1';
const ADD_PSD = process.env.UXFD_VIDEO_EXPORT_E2E_ADD_PSD === '1';
const ADD_AVIUTL_GENERATED_EFFECTS = process.env.UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS === '1';
const IMAGE_PATH = resolve(ROOT, 'public/icon.jpg');
const PSD_PATH = process.env.UXFD_VIDEO_EXPORT_E2E_PSD_PATH
  ? resolve(process.env.UXFD_VIDEO_EXPORT_E2E_PSD_PATH)
  : resolve(ROOT, '葵ちゃん.psd');
const AUDIO_WAV = resolve(OUTPUT_DIR, 'mixed-audio.wav');
const PROJECT_FPS = Number(AGENT_PROJECT_SPEC?.project?.fps ?? 60);

let vite = null;
let electron = null;
let finished = false;
const logLines = [];

const log = (message) => {
  const line = `[video-export-e2e] ${message}`;
  logLines.push(line);
  console.log(line);
};

const finish = (code) => {
  if (finished) return;
  finished = true;
  for (const proc of [electron, vite]) {
    if (proc && !proc.killed) proc.kill('SIGTERM');
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
  process.exit(code);
};

process.on('SIGINT', () => finish(130));
process.on('SIGTERM', () => finish(143));

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const waitForPort = async (port, timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.status < 500) return;
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`port ${port} did not become ready`);
};

const waitForDebugTarget = async (timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => (
        target.type === 'page'
        && typeof target.webSocketDebuggerUrl === 'string'
        && typeof target.url === 'string'
        && target.url.startsWith(`http://localhost:${VITE_PORT}/`)
      ));
      if (page) return page;
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error('Electron renderer debug target did not become ready');
};

const electronBundleReady = (startedAtMs) => {
  if (!existsSync(ELECTRON_MAIN_BUNDLE) || !existsSync(ELECTRON_PRELOAD_BUNDLE)) {
    return false;
  }
  const mainStat = statSync(ELECTRON_MAIN_BUNDLE);
  const preloadStat = statSync(ELECTRON_PRELOAD_BUNDLE);
  if (mainStat.mtimeMs < startedAtMs || preloadStat.mtimeMs < startedAtMs) {
    return false;
  }
  const mainSource = readFileSync(ELECTRON_MAIN_BUNDLE, 'utf8');
  const preloadSource = readFileSync(ELECTRON_PRELOAD_BUNDLE, 'utf8');
  return mainSource.includes('rust-backend-audio-waveform-samples')
    && preloadSource.includes('rust-backend-audio-waveform-samples');
};

const waitForElectronBundle = async (startedAtMs, timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (electronBundleReady(startedAtMs)) return;
    await sleep(250);
  }
  throw new Error('Electron bundle did not finish before launching the video export E2E window.');
};

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.dialogs = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveConnect, rejectConnect) => {
      const timer = setTimeout(() => rejectConnect(new Error('CDP websocket timeout')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolveConnect();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        rejectConnect(new Error('CDP websocket failed'));
      }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePending, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolvePending(message.result ?? {});
        return;
      }
      if (message.method) {
        this.events.push(message);
        if (message.method === 'Page.javascriptDialogOpening') {
          this.dialogs.push({
            type: message.params?.type,
            message: message.params?.message ?? '',
          });
          this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        }
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePending, reject) => {
      this.pending.set(id, { resolve: resolvePending, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 90_000);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    let result;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        result = await this.send('Runtime.evaluate', {
          expression,
          awaitPromise,
          returnByValue: true,
          userGesture: true,
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Cannot find default execution context') || attempt === 19) throw error;
        await sleep(250);
      }
    }
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
    }
    return result.result?.value;
  }

  async querySelector(selector) {
    const { root } = await this.send('DOM.getDocument', { depth: 1, pierce: true });
    const { nodeId } = await this.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    return nodeId;
  }

  close() {
    this.socket?.close();
  }
}

const collectConsoleEvents = (client) => client.events
  .filter((event) => event.method === 'Runtime.consoleAPICalled')
  .map((event) => (event.params?.args ?? [])
    .map((arg) => arg.value ?? arg.description ?? '')
    .join(' '));

const collectRuntimeErrors = (client) => client.events
  .filter((event) => event.method === 'Runtime.exceptionThrown')
  .map((event) => {
    const details = event.params?.exceptionDetails;
    return details?.exception?.description
      ?? details?.exception?.value
      ?? details?.text
      ?? 'Runtime exception';
  });

const parseExportedFrameCount = (dialogMessage) => {
  const match = String(dialogMessage ?? '').match(/フレーム:\s*(\d+)/);
  return match ? Number(match[1]) : null;
};

const parseEncoderPath = (dialogMessage) => {
  const match = String(dialogMessage ?? '').match(/コーデック:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
};

const calculateExpectedFrameCount = () => Math.round(EXPORT_DURATION_SECONDS * PROJECT_FPS);

const runCommand = (command, args, timeoutMs = 30_000) => new Promise((resolveRun) => {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    resolveRun({
      ok: false,
      code: null,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: `timeout ${timeoutMs}ms\n${Buffer.concat(stderr).toString('utf8')}`,
    });
  }, timeoutMs);
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
  child.on('error', (error) => {
    clearTimeout(timer);
    resolveRun({
      ok: false,
      code: null,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: error.message,
    });
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    resolveRun({
      ok: code === 0,
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    });
  });
});

const hexColourToRgb = (hex) => {
  const value = hex.trim().replace(/^#/, '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const countNearColourPixels = (buffer, hex, tolerance) => {
  const [red, green, blue] = hexColourToRgb(hex);
  let count = 0;
  for (let index = 0; index + 3 < buffer.length; index += 4) {
    if (
      Math.abs(buffer[index] - red) <= tolerance
      && Math.abs(buffer[index + 1] - green) <= tolerance
      && Math.abs(buffer[index + 2] - blue) <= tolerance
      && buffer[index + 3] > 180
    ) {
      count += 1;
    }
  }
  return count;
};

const countNearColourPixelsInRegion = (buffer, width, region, hex, tolerance) => {
  const height = buffer.length / 4 / width;
  if (!Number.isInteger(height)) return 0;
  const [red, green, blue] = hexColourToRgb(hex);
  const minX = Math.max(0, Math.floor(region.x));
  const minY = Math.max(0, Math.floor(region.y));
  const maxX = Math.min(width, Math.ceil(region.x + region.width));
  const maxY = Math.min(height, Math.ceil(region.y + region.height));
  let count = 0;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const index = (y * width + x) * 4;
      if (
        Math.abs(buffer[index] - red) <= tolerance
        && Math.abs(buffer[index + 1] - green) <= tolerance
        && Math.abs(buffer[index + 2] - blue) <= tolerance
        && buffer[index + 3] > 180
      ) {
        count += 1;
      }
    }
  }
  return count;
};

const countGeneratedWaveformBandPixels = (buffer, width) => {
  const height = buffer.length / 4 / width;
  if (!Number.isInteger(height)) return 0;
  const minX = Math.floor(width * 0.45);
  const maxX = Math.ceil(width * 0.95);
  const minY = Math.floor(height * 0.84);
  const maxY = Math.ceil(height * 0.91);
  let count = 0;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const index = (y * width + x) * 4;
      const red = buffer[index];
      const green = buffer[index + 1];
      const blue = buffer[index + 2];
      const alpha = buffer[index + 3];
      if (
        alpha > 180
        && green >= 140
        && green >= red + 35
        && green >= blue + 5
        && blue >= 80
        && blue <= 190
        && red <= 150
      ) {
        count += 1;
      }
    }
  }
  return count;
};

const inspectExportedGeneratedEffectsFrame = async () => {
  if (!ADD_AVIUTL_GENERATED_EFFECTS) {
    return { enabled: false };
  }
  rmSync(OUTPUT_FRAME_RGBA, { force: true });
  const ffmpeg = await runCommand('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    OUTPUT_MP4,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    OUTPUT_FRAME_RGBA,
  ]);
  if (!ffmpeg.ok) {
    return {
      ok: false,
      enabled: true,
      reason: 'ffmpegFrameExtractFailed',
      ffmpeg,
    };
  }
  const frame = readFileSync(OUTPUT_FRAME_RGBA);
  const waveformColour = '#00ff88';
  const particleColour = '#ffffff';
  const getColorSecondaryColour = '#36c2ff';
  const hksyDarkCellColour = '#333333';
  const spotLightWarmColour = '#fff4c2';
  const audioSphereColour = '#36c2ff';
  const frameWidth = 1920;
  const aviUtlInspectionRegions = {
    getColor: { x: 80, y: 120, width: 360, height: 220 },
    hksy: { x: 520, y: 120, width: 360, height: 220 },
    spotLight: { x: 960, y: 120, width: 260, height: 180 },
    audioSphere: { x: 1240, y: 400, width: 420, height: 420 },
  };
  const waveformPixelCount = countGeneratedWaveformBandPixels(frame, frameWidth);
  const particlePixelCount = countNearColourPixels(frame, particleColour, 24);
  const getColorCyanPixelCount = countNearColourPixelsInRegion(
    frame,
    frameWidth,
    aviUtlInspectionRegions.getColor,
    getColorSecondaryColour,
    32
  );
  const hksyDarkCellPixelCount = countNearColourPixelsInRegion(
    frame,
    frameWidth,
    aviUtlInspectionRegions.hksy,
    hksyDarkCellColour,
    18
  );
  const spotLightWarmPixelCount = countNearColourPixelsInRegion(
    frame,
    frameWidth,
    aviUtlInspectionRegions.spotLight,
    spotLightWarmColour,
    48
  );
  const audioSphereCyanPixelCount = countNearColourPixelsInRegion(
    frame,
    frameWidth,
    aviUtlInspectionRegions.audioSphere,
    audioSphereColour,
    32
  );
  const minWaveformPixels = 16;
  const minParticlePixels = 16;
  const minGetColorCyanPixels = 8;
  const minHksyDarkCellPixels = 64;
  const minSpotLightWarmPixels = 16;
  const minAudioSphereCyanPixels = 16;
  return {
    ok: waveformPixelCount >= minWaveformPixels
      && particlePixelCount >= minParticlePixels
      && getColorCyanPixelCount >= minGetColorCyanPixels
      && hksyDarkCellPixelCount >= minHksyDarkCellPixels
      && spotLightWarmPixelCount >= minSpotLightWarmPixels
      && audioSphereCyanPixelCount >= minAudioSphereCyanPixels,
    enabled: true,
    framePath: OUTPUT_FRAME_RGBA,
    byteLength: frame.length,
    frameWidth,
    aviUtlInspectionRegions,
    waveformColour,
    particleColour,
    getColorSecondaryColour,
    hksyDarkCellColour,
    spotLightWarmColour,
    audioSphereColour,
    waveformPixelCount,
    particlePixelCount,
    getColorCyanPixelCount,
    hksyDarkCellPixelCount,
    spotLightWarmPixelCount,
    audioSphereCyanPixelCount,
    minWaveformPixels,
    minParticlePixels,
    minGetColorCyanPixels,
    minHksyDarkCellPixels,
    minSpotLightWarmPixels,
    minAudioSphereCyanPixels,
  };
};

const writeTinyWaveFixture = (audioPath) => {
  const sampleRate = 48000;
  const frames = sampleRate;
  const bytesPerSample = 2;
  const channels = 1;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  writeFileSync(audioPath, buffer);
};

const writeResult = (result) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
};

const clickToolbarButton = async (client, titles) => client.evaluate(`
  (() => {
    const wanted = new Set(${JSON.stringify(titles)});
    const button = [...document.querySelectorAll('button')]
      .find((entry) => wanted.has(entry.getAttribute('title') || ''));
    if (!button) return false;
    button.click();
    return true;
  })()
`);

const clickToolbarTextButton = async (client, labels) => client.evaluate(`
  (() => {
    const wanted = new Set(${JSON.stringify(labels)});
    const button = [...document.querySelectorAll('button')]
      .find((entry) => wanted.has((entry.textContent || '').trim()));
    if (!button) return false;
    button.click();
    return true;
  })()
`);

const setFileInput = async (client, selector, filePath, label) => {
  const inputNodeId = await client.querySelector(selector);
  if (!inputNodeId) throw new Error(`${label} inputが見つかりません。`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: inputNodeId,
    files: [filePath],
  });
};

const waitForTimelineItems = async (client, expectedTexts, timeoutMs = 30000) => client.evaluate(`
  new Promise((resolve) => {
    const expectedTexts = ${JSON.stringify(expectedTexts)};
    const started = Date.now();
    const tick = () => {
      const items = [...document.querySelectorAll('[data-timeline-item="true"]')]
        .map((node) => node.textContent || '');
      const body = document.body.innerText || '';
      const missing = expectedTexts.filter((expected) => !items.some((text) => text.includes(expected)));
      if (missing.length === 0) {
        resolve({ ok: true, items });
        return;
      }
      if (body.includes('Failed to load audio') || body.includes('Failed to load image')) {
        resolve({ ok: false, reason: 'uiFailedToLoad', missing, items, body });
        return;
      }
      if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
        resolve({ ok: false, reason: 'timeout', missing, items, body });
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  })
`);

const addMixedMediaToTimeline = async (client) => {
  if (!ADD_MIXED_MEDIA) {
    return { enabled: false };
  }
  if (!existsSync(IMAGE_PATH)) {
    throw new Error(`image fixture is missing: ${IMAGE_PATH}`);
  }
  writeTinyWaveFixture(AUDIO_WAV);

  const shapeClicked = await clickToolbarButton(client, ['図形の形', 'Shape Type']);
  if (!shapeClicked) throw new Error('図形追加ボタンが見つかりません。');
  const shapeResult = await waitForTimelineItems(client, ['Rectangle']);
  if (!shapeResult?.ok) return { ok: false, enabled: true, stage: 'shape', ...shapeResult };

  const imageClicked = await clickToolbarButton(client, ['Image']);
  if (!imageClicked) throw new Error('画像追加ボタンが見つかりません。');
  await sleep(300);
  await setFileInput(client, 'input[accept="image/*"]', IMAGE_PATH, '画像');
  const imageName = IMAGE_PATH.split('/').pop() ?? 'icon.jpg';
  const imageResult = await waitForTimelineItems(client, ['Rectangle', imageName]);
  if (!imageResult?.ok) return { ok: false, enabled: true, stage: 'image', ...imageResult };

  const audioClicked = await clickToolbarButton(client, ['Audio']);
  if (!audioClicked) throw new Error('音声追加ボタンが見つかりません。');
  await sleep(300);
  await setFileInput(client, 'input[accept="audio/*"]', AUDIO_WAV, '音声');

  const audioName = AUDIO_WAV.split('/').pop() ?? 'mixed-audio.wav';
  const audioResult = await waitForTimelineItems(client, ['Rectangle', imageName, audioName]);
  return { ...audioResult, enabled: true, stage: 'complete' };
};

const addPsdToTimeline = async (client) => {
  if (!ADD_PSD) {
    return { enabled: false };
  }
  if (!existsSync(PSD_PATH)) {
    throw new Error(`PSD fixture is missing: ${PSD_PATH}`);
  }

  const psdClicked = await clickToolbarTextButton(client, ['PSD']);
  if (!psdClicked) throw new Error('PSD追加ボタンが見つかりません。');
  await sleep(300);
  await setFileInput(client, 'input[accept=".psd"]', PSD_PATH, 'PSD');
  const psdName = PSD_PATH.split('/').pop() ?? 'standing.psd';
  const psdResult = await waitForTimelineItems(client, [psdName], 90000);
  const parseFailedDialog = client.dialogs.find((dialog) => (
    dialog.message.includes('Failed to parse PSD file')
    || dialog.message.includes('psd.parse')
  ));
  if (parseFailedDialog) {
    return {
      ok: false,
      enabled: true,
      stage: 'psd',
      reason: 'parseFailedDialog',
      dialog: parseFailedDialog,
      ...psdResult,
    };
  }
  return { ...psdResult, enabled: true, stage: 'complete', psdPath: PSD_PATH };
};

const addAviUtlGeneratedEffectsToTimeline = async (client) => {
  if (!ADD_AVIUTL_GENERATED_EFFECTS) {
    return { enabled: false };
  }

  const hookResult = await client.evaluate(`
    window.__UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS__?.(${JSON.stringify(EXPORT_DURATION_SECONDS)}) ?? null
  `);
  if (!hookResult?.ok) {
    return { ok: false, enabled: true, stage: 'hook', hookResult };
  }
  const timelineNames = Array.isArray(hookResult.timelineNames) && hookResult.timelineNames.length > 0
    ? hookResult.timelineNames
    : ['Audio waveform R', '標準パーティクル', 'GetColor V2R ドットフィールド', 'hksyチェッカー/グリッド', '93 SpotLight Probe', '93音声玉'];
  const timelineResult = await waitForTimelineItems(client, timelineNames, 30000);
  return {
    ...timelineResult,
    enabled: true,
    stage: 'complete',
    hookResult,
    timelineNames,
  };
};

const shortenAllObjectsForExport = async (client) => client.evaluate(`
  window.__UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__?.(${JSON.stringify(EXPORT_DURATION_SECONDS)}) ?? null
`);

const runVideoExportAttempt = async (client, attemptIndex) => {
  client.dialogs.length = 0;
  log(`動画出力を開始(${attemptIndex}/${REPEAT_EXPORTS}): ${OUTPUT_MP4}`);
  const exportStartTimeMs = Date.now();
  const exportClicked = await client.evaluate(`
    (() => {
      const buttons = [...document.querySelectorAll('button')];
      const button = buttons.find((entry) => (entry.textContent || '').includes('動画出力'))
        ?? buttons.find((entry) => (entry.textContent || '').includes('Export'));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!exportClicked) throw new Error('動画出力ボタンが見つかりません。');

  const startedExportWait = Date.now();
  let exportResult = null;
  const progressSamples = [];
  while (Date.now() - startedExportWait < 120000) {
    const dialog = client.dialogs.find((entry) => (
      entry.message.includes('エクスポート完了')
      || entry.message.includes('エクスポート失敗')
    ));
    const progressSnapshot = await client.evaluate(`
      (() => ({
        dataset: { ...document.documentElement.dataset },
        exportModalText: document.querySelector('.export-modal')?.textContent || null,
        body: document.body.innerText || '',
      }))()
    `).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    if (progressSamples.length < 40) {
      progressSamples.push({
        elapsedMs: Date.now() - exportStartTimeMs,
        exportModalText: progressSnapshot.exportModalText ?? null,
      });
    }
    if (dialog) {
      exportResult = {
        ok: dialog.message.includes('エクスポート完了'),
        reason: dialog.message.includes('エクスポート完了') ? 'completionDialog' : 'failureDialog',
        dialog,
        progressSnapshot,
      };
      break;
    }
    await sleep(500);
  }
  exportResult ??= {
    ok: false,
    reason: 'exportTimeout',
    progressSnapshot: await client.evaluate(`
      (() => ({
        dataset: { ...document.documentElement.dataset },
        exportModalText: document.querySelector('.export-modal')?.textContent || null,
        body: document.body.innerText || '',
      }))()
    `).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    })),
  };
  const exportDurationMs = Date.now() - exportStartTimeMs;
  const exportedFrameCount = parseExportedFrameCount(exportResult.dialog?.message);
  const encoderPath = parseEncoderPath(exportResult.dialog?.message);
  const expectedFrameCount = calculateExpectedFrameCount();
  const frameCountMatchesDuration = typeof exportedFrameCount === 'number'
    && Math.abs(exportedFrameCount - expectedFrameCount) <= 1;
  const exportFramesPerSecond = exportedFrameCount && exportDurationMs > 0
    ? exportedFrameCount / (exportDurationMs / 1000)
    : null;
  const exportUsedDirectTranscode = client.dialogs.some((dialog) => (
    dialog.message.includes('Rust backend direct transcode')
  ));

  await sleep(500);
  const outputStat = existsSync(OUTPUT_MP4)
    ? {
      exists: true,
      size: statSync(OUTPUT_MP4).size,
    }
    : { exists: false, size: 0 };

  return {
    attemptIndex,
    outputPath: OUTPUT_MP4,
    outputStat,
    exportDurationMs,
    exportedFrameCount,
    encoderPath,
    expectedFrameCount,
    frameCountMatchesDuration,
    exportFramesPerSecond,
    exportUsedDirectTranscode,
    exportResult,
    progressSamples,
    dialogs: [...client.dialogs],
  };
};

const main = async () => {
  if (AGENT_PROJECT_PATH && (!existsSync(AGENT_PROJECT_PATH) || !AGENT_PROJECT_URL_PATH || AGENT_PROJECT_URL_PATH.startsWith('/..'))) {
    throw new Error(`agent project must be a readable file under public/: ${AGENT_PROJECT_PATH}`);
  }
  if (!AGENT_PROJECT_PATH && !existsSync(VIDEO_PATH)) {
    throw new Error(`video fixture is missing: ${VIDEO_PATH}`);
  }

  // エージェント用レシピの実行では、OUTPUT_DIR 配下に過去の一意な出力 mp4 が残っている可能性があるため
  // ディレクトリごと削除しない(結果としてレシピごとの出力を積み上げて比較できる)。
  // 従来どおりの呼び出し元(固定パス運用)では、これまでと同じくディレクトリを丸ごと作り直す。
  if (!AGENT_PROJECT_PATH) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  rmSync(USER_DATA_DIR, { recursive: true, force: true });
  mkdirSync(USER_DATA_DIR, { recursive: true });
  log(`Vite 起動: port=${VITE_PORT}`);
  const viteStartedAtMs = Date.now();
  vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  vite.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  vite.on('error', (error) => log(`Vite error: ${error.message}`));
  await waitForPort(VITE_PORT);
  await waitForElectronBundle(viteStartedAtMs);

  log(`Electron 起動: remote-debugging-port=${DEBUG_PORT}`);
  electron = spawn(resolve(ROOT, 'node_modules/.bin/electron'), [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '.',
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `http://localhost:${VITE_PORT}/?videoExportE2e=1${AGENT_PROJECT_URL_PATH ? `&agentProject=${encodeURIComponent(AGENT_PROJECT_URL_PATH)}` : ''}`,
      UXFD_VIDEO_EXPORT_E2E_SAVE_PATH: OUTPUT_MP4,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  electron.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  electron.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  electron.on('error', (error) => log(`Electron error: ${error.message}`));

  const timeout = setTimeout(() => {
    log(`timeout ${OVERALL_TIMEOUT_MS}ms`);
    finish(124);
  }, OVERALL_TIMEOUT_MS);

  const target = await waitForDebugTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');

  let loadResult = null;
  let videoObject = null;
  if (AGENT_PROJECT_PATH) {
    loadResult = await client.evaluate(`
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const state = document.documentElement.dataset.uxfdAgentProject;
          if (state === 'loaded') {
            resolve({ ok: true, mode: 'agentProject' });
            return;
          }
          if (state === 'error') {
            resolve({ ok: false, reason: 'agentProjectLoadFailed', body: document.body.innerText });
            return;
          }
          if (Date.now() - started > 30000) {
            resolve({ ok: false, reason: 'agentProjectLoadTimeout', body: document.body.innerText });
            return;
          }
          setTimeout(tick, 200);
        };
        tick();
      })
    `);
    if (!loadResult?.ok) {
      throw new Error(`エージェント用レシピの読み込みに失敗しました: ${JSON.stringify(loadResult)}`);
    }
  } else {
    await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const buttons = [...document.querySelectorAll('button')];
        const createButton = buttons.find((button) => (button.textContent || '').includes('作成'));
        if (createButton) {
          createButton.click();
          resolve({ ok: true, created: true });
          return;
        }
        if (document.querySelector('button[title="Video"]')) {
          resolve({ ok: true, created: false });
          return;
        }
        if (Date.now() - started > 10000) {
          resolve({ ok: false, body: document.body.innerText });
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    })
    `);

    const ready = await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector('button[title="Video"]')) {
          resolve({ ok: true });
          return;
        }
        if (Date.now() - started > 10000) {
          resolve({ ok: false, body: document.body.innerText });
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    })
    `);
    if (!ready?.ok) throw new Error(`Video追加ボタンの表示待ちに失敗しました: ${JSON.stringify(ready)}`);

    await client.evaluate(`document.querySelector('button[title="Video"]')?.click()`);
    await sleep(300);
    const inputNodeId = await client.querySelector('input[accept="video/*"]');
    if (!inputNodeId) throw new Error('動画inputが見つかりません。');
    log(`動画inputへ実ファイルを設定: ${VIDEO_PATH}`);
    await client.send('DOM.setFileInputFiles', {
      nodeId: inputNodeId,
      files: [VIDEO_PATH],
    });

    loadResult = await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const items = [...document.querySelectorAll('[data-timeline-item="true"]')].map((node) => node.textContent || '');
        const body = document.body.innerText || '';
        const diagnostics = [...document.querySelectorAll('[data-uxfd-shared-renderer-presenter-status], [data-uxfd-shared-renderer-presenter-video-owner]')]
          .map((node) => ({ ...node.dataset }));
        const hasTimelineVideo = items.some((text) => text.includes(${JSON.stringify(VIDEO_NAME)}));
        const presenterReady = diagnostics.some((entry) => (
          entry.uxfdSharedRendererPresenterStatus === 'ready'
          && entry.uxfdSharedRendererPresenterVideoOwner === 'sharedRenderer'
        ));
        if (hasTimelineVideo && presenterReady) {
          resolve({ ok: true, items, diagnostics });
          return;
        }
        if (body.includes('Failed to load video') || body.includes('Failed to load')) {
          resolve({ ok: false, reason: 'uiFailedToLoad', items, body, diagnostics });
          return;
        }
        if (Date.now() - started > 120000) {
          resolve({ ok: false, reason: 'timeout', items, body, diagnostics });
          return;
        }
        setTimeout(tick, 250);
      };
      tick();
    })
    `);
    if (!loadResult?.ok) {
      throw new Error(`動画読み込みに失敗しました: ${JSON.stringify(loadResult)}`);
    }
    const durationShortened = await client.evaluate(`
    window.__UXFD_VIDEO_EXPORT_E2E_SET_VIDEO_DURATION__?.(${JSON.stringify(EXPORT_DURATION_SECONDS)}) ?? false
    `);
    if (!durationShortened) {
      throw new Error('動画export E2E用の短尺化に失敗しました。');
    }
    if (VIDEO_PATCH) {
      const patchApplied = await client.evaluate(`
      window.__UXFD_VIDEO_EXPORT_E2E_PATCH_FIRST_VIDEO__?.(${JSON.stringify(VIDEO_PATCH)}) ?? false
      `);
      if (!patchApplied) {
        throw new Error(`動画export E2E用の配置patchに失敗しました: ${JSON.stringify(VIDEO_PATCH)}`);
      }
    }
    videoObject = await client.evaluate(`
      window.__UXFD_VIDEO_EXPORT_E2E_GET_FIRST_VIDEO__?.() ?? null
    `);
  }
  const mixedMediaResult = await addMixedMediaToTimeline(client);
  if (ADD_MIXED_MEDIA && !mixedMediaResult?.ok) {
    throw new Error(`混在メディア追加に失敗しました: ${JSON.stringify(mixedMediaResult)}`);
  }
  const psdMediaResult = await addPsdToTimeline(client);
  if (ADD_PSD && !psdMediaResult?.ok) {
    throw new Error(`PSDメディア追加に失敗しました: ${JSON.stringify(psdMediaResult)}`);
  }
  const aviUtlGeneratedEffectsResult = await addAviUtlGeneratedEffectsToTimeline(client);
  if (ADD_AVIUTL_GENERATED_EFFECTS && !aviUtlGeneratedEffectsResult?.ok) {
    throw new Error(`AviUtl生成効果追加に失敗しました: ${JSON.stringify(aviUtlGeneratedEffectsResult)}`);
  }
  const shouldShortenAllObjects = ADD_MIXED_MEDIA || ADD_PSD || ADD_AVIUTL_GENERATED_EFFECTS;
  const mixedMediaDurationResult = shouldShortenAllObjects
    ? await shortenAllObjectsForExport(client)
    : null;
  if (shouldShortenAllObjects && !mixedMediaDurationResult?.ok) {
    throw new Error(`混在メディア短尺化に失敗しました: ${JSON.stringify(mixedMediaDurationResult)}`);
  }

  const exportAttempts = [];
  for (let attemptIndex = 1; attemptIndex <= REPEAT_EXPORTS; attemptIndex += 1) {
    exportAttempts.push(await runVideoExportAttempt(client, attemptIndex));
  }
  const firstAttempt = exportAttempts[0];
  const lastAttempt = exportAttempts[exportAttempts.length - 1];
  const repeatSpeedupObserved = exportAttempts.length >= 2
    && exportAttempts[1].exportDurationMs < exportAttempts[0].exportDurationMs;
  const repeatSpeedupRatio = exportAttempts.length >= 2 && exportAttempts[0].exportDurationMs > 0
    ? exportAttempts[1].exportDurationMs / exportAttempts[0].exportDurationMs
    : null;
  const directTranscodeRequired = (ADD_MIXED_MEDIA || ADD_PSD) && !ADD_AVIUTL_GENERATED_EFFECTS;
  const runtimeErrors = collectRuntimeErrors(client);
  const generatedEffectsFrameInspection = await inspectExportedGeneratedEffectsFrame();
  const result = {
    passed: Boolean(
      exportAttempts.every((attempt) => (
        attempt.outputStat.exists
        && attempt.outputStat.size > 0
        && attempt.dialogs.some((dialog) => dialog.message.includes('エクスポート完了'))
        && attempt.frameCountMatchesDuration
        && (!EXPECT_ENCODER_PATH || attempt.encoderPath === EXPECT_ENCODER_PATH)
      ))
      && (!ADD_MIXED_MEDIA || mixedMediaResult?.ok)
      && (!ADD_PSD || psdMediaResult?.ok)
      && (!ADD_AVIUTL_GENERATED_EFFECTS || aviUtlGeneratedEffectsResult?.ok)
      && (!shouldShortenAllObjects || mixedMediaDurationResult?.ok)
      && (!directTranscodeRequired || exportAttempts.every((attempt) => attempt.exportUsedDirectTranscode))
      && (!EXPECT_REPEAT_SPEEDUP || repeatSpeedupObserved)
      && runtimeErrors.length === 0
      && generatedEffectsFrameInspection?.ok !== false
    ),
    videoPath: AGENT_PROJECT_PATH ? null : VIDEO_PATH,
    agentProjectPath: AGENT_PROJECT_PATH,
    outputPath: OUTPUT_MP4,
    outputStat: lastAttempt.outputStat,
    exportDurationSeconds: EXPORT_DURATION_SECONDS,
    repeatExports: REPEAT_EXPORTS,
    expectRepeatSpeedup: EXPECT_REPEAT_SPEEDUP,
    expectEncoderPath: EXPECT_ENCODER_PATH,
    videoPatch: VIDEO_PATCH,
    videoObject,
    mixedMediaResult,
    psdMediaResult,
    aviUtlGeneratedEffectsResult,
    generatedEffectsFrameInspection,
    mixedMediaDurationResult,
    directTranscodeRequired,
    exportAttempts,
    repeatSpeedupObserved,
    repeatSpeedupRatio,
    exportDurationMs: firstAttempt.exportDurationMs,
    exportedFrameCount: firstAttempt.exportedFrameCount,
    expectedFrameCount: firstAttempt.expectedFrameCount,
    frameCountMatchesDuration: firstAttempt.frameCountMatchesDuration,
    exportFramesPerSecond: firstAttempt.exportFramesPerSecond,
    exportUsedDirectTranscode: firstAttempt.exportUsedDirectTranscode,
    loadResult,
    exportResult: firstAttempt.exportResult,
    progressSamples: firstAttempt.progressSamples,
    dialogs: exportAttempts.flatMap((attempt) => attempt.dialogs),
    consoleLines: collectConsoleEvents(client),
    runtimeErrors,
    processLines: logLines,
  };
  writeResult(result);
  log(JSON.stringify(result, null, 2));

  client.close();
  clearTimeout(timeout);
  finish(result.passed ? 0 : 1);
};

main().catch((error) => {
  writeResult({
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  });
  log(`失敗: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  finish(1);
});
