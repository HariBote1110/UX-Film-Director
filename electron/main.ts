import { app, BrowserWindow, ipcMain, dialog, screen, shell, type WebContents } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { buildOrderedPerfHeavyVideoPaths } from '../src/perf/perfHeavyVideo';
import { serialisePerfAgentPayload, type PerfHarnessAgentPayload } from '../src/perf/perfAgentPayload';
import { PERFORMANCE_CSV_HEADER_LINE } from '../src/perf/performanceReport';
import { validateProxyDuration } from '../src/utils/proxyValidation';

// Phase 7 (W7) Phase 3実機検証: presenter/overlay切替の視覚的直接証拠
// （CDPスクリーンショット）を非対話SSHセッションからも取得できるよう、
// `UXFD_REMOTE_DEBUG_PORT`を明示指定したときだけChrome DevTools Protocol
// をopt-inで有効化する（既定では付与しない、本番/通常dev起動には一切
// 影響しない）。`app.commandLine.appendSwitch`はapp readyより前に
// 呼ぶ必要がある。
if (process.env.UXFD_REMOTE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.UXFD_REMOTE_DEBUG_PORT);
  app.commandLine.appendSwitch('remote-debugging-address', '0.0.0.0');
  // 新しめのChromiumはDevTools HTTPエンドポイントへの接続元Originを
  // 検証し、許可されていないと即座にソースを閉じる（レスポンス無し）。
  // SSHローカルポートフォワード越しの接続もこれに引っかかるため、
  // 明示的に許可する。
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}
import {
  buildFfmpegNotFoundMessage,
  resolveFfmpegPath as resolveFfmpegPathFromDeps,
  resolveFfprobePath as resolveFfprobePathFromDeps,
} from '../src/utils/ffmpegResolve';
import {
  abortRustVideoEncodeViaBackend,
  finishRustVideoEncodeViaBackend,
  startRustVideoEncodeViaBackend,
  transcodeRustVideoViaBackend,
  writeRustVideoEncodeFrameViaBackend,
  writeRustVideoEncodeNativeFrameViaBackend,
  writeRustVideoEncodeResidentSceneFrameViaBackend,
} from './rustVideoEncodeBackendBridge';
import { rustVideoEncodeIpcChannels } from './rustVideoEncodeIpc';
import { createNativeOverlayMainBridge } from './nativeOverlayMainBridge';
import { registerNativeOverlayIpcHandlers } from './nativeOverlayIpc';
import { formatNativeOverlayDiagnosticLog } from './nativeOverlayDiagnosticLog';
import { writeToRustBackendStdin } from './rustBackendStdinWrite';
import {
  buildRemoteDeckConnectionInfo,
  forwardRemoteDeckCommands,
  startRemoteDeckServer,
  type RemoteDeckServer,
} from './remoteDeckServer';
import { remoteDeckIpcChannels } from '../shared/remoteDeckProtocol';
import { resolveRemoteDeckStaticDir } from './remoteDeckStaticDir';
import { buildMainWindowOptions } from './mainWindowOptions';
import { DEFAULT_REMOTE_DECK_LAYOUT } from '../shared/remoteDeckLayout';
import {
  createRustScenePlaybackController,
  type RustScenePlaybackEvaluation,
  type RustScenePlaybackStartPayload,
} from './rustScenePlaybackController';

// --- GPU Acceleration Flags ---
// 高画質動画の再生負荷を下げるための重要な設定
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// WebGPU を明示的に有効化
app.commandLine.appendSwitch('enable-unsafe-webgpu');
// Canvas の GPU ラスタライズを有効化 + SharedArrayBuffer をrendererで有効化。
// SharedArrayBufferはプレビューフレーム受け渡しのzero-copy化
// (src/utils/sharedVideoFrameUploadBridge.ts) に必要。COOP/COEPヘッダによる
// cross-origin isolation は dev(vite) / prod(file://) の両方に別々の仕掛けが
// 要るため、両方で一様に効くChromium featureスイッチを使う。
// 注意: enable-features スイッチは同名の後勝ち上書きになるため、
// 必ずこの1回のappendSwitch呼び出しにカンマ区切りでまとめること。
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,SharedArrayBuffer');
// WebGPU presenter / shared renderer のGPU利用を安定させる
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
// 開発時のみ: UXFD_REMOTE_DEBUG_PORT を設定すると CDP (Chrome DevTools Protocol) を
// 開放し、Terminal から renderer の console 読取・JS 評価による診断ができる。
// 未設定なら何も起きない（配布ビルドでは設定しないこと）。
if (!app.isPackaged && process.env.UXFD_REMOTE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.UXFD_REMOTE_DEBUG_PORT);
}

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
let rustBackendProcess: ChildProcessWithoutNullStreams | null = null;
let rustNextRequestId = 1;
let rustStdoutBuffer = '';

type PendingRustRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
};

type RustRpcResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

class RustBackendRpcError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code: number | undefined) {
    super(message);
    this.name = 'RustBackendRpcError';
    this.code = code;
  }
}

type RustBackendEvent = {
  event?: string;
  payload?: unknown;
};

const rustPendingRequests = new Map<number, PendingRustRequest>();

// VITE_EXPORT_TEST=1 のとき devtools を非表示にして余分なウィンドウを出さない
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

const ffmpegResolveDeps = {
  platform: process.platform,
  env: process.env,
  existsSync: (candidate: string) => fs.existsSync(candidate),
  homedir: () => os.homedir(),
};

const resolveDefaultFfmpegPath = () => resolveFfmpegPathFromDeps(ffmpegResolveDeps);

const resolveDefaultFfprobePath = () => resolveFfprobePathFromDeps(ffmpegResolveDeps);

const toNodeBuffer = (value: unknown): Buffer | null => {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) {
    return Buffer.from(value);
  }

  return null;
};

const getRustBackendBinaryName = () => {
  return process.platform === 'win32' ? 'uxfd-rust-backend.exe' : 'uxfd-rust-backend';
};

const getRustBackendCandidates = () => {
  const binaryName = getRustBackendBinaryName();
  const candidates: string[] = [];

  if (process.env.UXFD_RUST_BACKEND_BIN) {
    candidates.push(process.env.UXFD_RUST_BACKEND_BIN);
  }

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'rust-backend', binaryName));
    candidates.push(path.join(process.resourcesPath, binaryName));
  } else {
    const appPath = app.getAppPath();
    candidates.push(path.join(appPath, 'rust-backend', 'target', 'debug', binaryName));
    candidates.push(path.join(appPath, 'rust-backend', 'target', 'release', binaryName));
  }

  return candidates;
};

const resolveRustBackendPath = () => {
  for (const candidate of getRustBackendCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const COREML_TRACKER_BINARY = 'uxfd-coreml-tracker';

const getCoreMlTrackerCandidates = (): string[] => {
  const candidates: string[] = [];

  if (process.env.UXFD_COREML_TRACKER_BIN) {
    candidates.push(process.env.UXFD_COREML_TRACKER_BIN);
  }

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'macos-coreml-tracker', COREML_TRACKER_BINARY));
    candidates.push(path.join(process.resourcesPath, COREML_TRACKER_BINARY));
  } else {
    const appPath = app.getAppPath();
    candidates.push(path.join(appPath, 'macos-coreml-tracker', '.build', 'release', COREML_TRACKER_BINARY));
    candidates.push(path.join(appPath, 'macos-coreml-tracker', '.build', 'debug', COREML_TRACKER_BINARY));
  }

  return candidates;
};

const resolveCoreMlTrackerPath = (): string | null => {
  for (const candidate of getCoreMlTrackerCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const normaliseFsPathForCoreMl = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed.startsWith('file:')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const runCoreMlTrackerCli = (payload: Record<string, unknown>, timeoutMs: number = 900_000): Promise<unknown> => {
  const trackerPath = resolveCoreMlTrackerPath();
  if (!trackerPath) {
    return Promise.reject(
      new Error(
        'uxfd-coreml-tracker binary not found. Run "swift build -c release" in macos-coreml-tracker/ or set UXFD_COREML_TRACKER_BIN.'
      )
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(trackerPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdoutText = '';
    let stderrText = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('uxfd-coreml-tracker timed out.'));
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdoutText += chunk;
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderrText += chunk;
      });
    }

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdoutText.trim().split(/\r?\n/).filter(Boolean).pop();
      if (line) {
        try {
          const parsed = JSON.parse(line) as { ok?: boolean; error?: string };
          if (parsed && parsed.ok === false && typeof parsed.error === 'string') {
            reject(new Error(parsed.error));
            return;
          }
        } catch {
          // fall through to generic handling
        }
      }

      if (code !== 0) {
        const detail = stderrText.trim() || stdoutText.trim() || `exit code ${code ?? 'null'}`;
        reject(new Error(`uxfd-coreml-tracker failed: ${detail}`));
        return;
      }

      if (!line) {
        reject(new Error('uxfd-coreml-tracker returned empty stdout.'));
        return;
      }

      try {
        resolve(JSON.parse(line));
      } catch (error) {
        reject(new Error(`uxfd-coreml-tracker returned invalid JSON: ${String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(payload), 'utf8');
    child.stdin.end();
  });
};

const rejectAllRustPending = (reason: string) => {
  rustPendingRequests.forEach((pending, id) => {
    clearTimeout(pending.timeout);
    pending.reject(new Error(reason));
    rustPendingRequests.delete(id);
  });
};

const RUST_BACKEND_STATUS_CHANNEL = 'rust-backend-status';

// rust-backend sidecar が異常終了/エラーになったことを renderer へ通知する。
// ensureRustBackendProcess は次回リクエスト時に自動で再spawnするため、ここでは
// 「今失敗した」ことをユーザーへ気付かせるための最小限の通知に留める。
const notifyRustBackendCrashed = (reason: string) => {
  win?.webContents.send(RUST_BACKEND_STATUS_CHANNEL, { status: 'crashed', reason });
};

const handleRustStdout = (chunk: string) => {
  rustStdoutBuffer += chunk;
  const lines = rustStdoutBuffer.split('\n');
  rustStdoutBuffer = lines.pop() ?? '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let response: RustRpcResponse | RustBackendEvent;
    try {
      response = JSON.parse(line) as RustRpcResponse | RustBackendEvent;
    } catch (error) {
      console.error(`[RustBackend] Invalid response JSON: ${line}`);
      continue;
    }

    if (!('id' in response)) {
      if (response.event === 'encode.transcodeVideo.progress') {
        win?.webContents.send(rustVideoEncodeIpcChannels.transcodeVideoProgress, response.payload);
      }
      continue;
    }
    if (typeof response.id !== 'number') {
      continue;
    }

    const pending = rustPendingRequests.get(response.id);
    if (!pending) {
      continue;
    }

    clearTimeout(pending.timeout);
    rustPendingRequests.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result ?? null);
    } else {
      pending.reject(new RustBackendRpcError(
        response.error?.message ?? 'Rust backend returned an error',
        response.error?.code,
      ));
    }
  }
};

const ensureRustBackendProcess = () => {
  if (rustBackendProcess && !rustBackendProcess.killed) {
    return rustBackendProcess;
  }

  const rustBackendPath = resolveRustBackendPath();
  if (!rustBackendPath) {
    throw new Error(
      `Rust backend binary not found. Build it with "cargo build --manifest-path rust-backend/Cargo.toml" or set UXFD_RUST_BACKEND_BIN.`
    );
  }

  const child = spawn(rustBackendPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // The per-frame whole-frame CRC32 in decode.requestFrame is a test
      // oracle, not a runtime integrity check (the shared-ring write/read
      // CRC still guards the frame handoff), so skip it in the app.
      UXFD_DISABLE_DECODE_CHECKSUM: process.env.UXFD_DISABLE_DECODE_CHECKSUM ?? '1',
    },
  });
  if (!child.stdout || !child.stderr || !child.stdin) {
    throw new Error('Failed to start Rust backend stdio streams.');
  }

  const backend = child as ChildProcessWithoutNullStreams;
  backend.stdout.setEncoding('utf8');
  backend.stderr.setEncoding('utf8');

  backend.stdout.on('data', (chunk: string) => {
    handleRustStdout(chunk);
  });

  backend.stderr.on('data', (chunk: string) => {
    const text = chunk.trim();
    if (text) console.log(`[RustBackend] ${text}`);
  });

  backend.on('error', (error) => {
    console.error('Rust backend process error:', error);
    rejectAllRustPending(`Rust backend process error: ${error.message}`);
    notifyRustBackendCrashed(`Rust backend process error: ${error.message}`);
  });

  backend.on('exit', (code, signal) => {
    rustBackendProcess = null;
    const reason = `Rust backend exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
    rejectAllRustPending(reason);
    // ensureRustBackendProcess は次回呼び出し時に rustBackendProcess が
    // null/killed であれば自動的に再spawnするため、ここでは状態のクリアと
    // renderer への通知のみ行う（明示的なリトライループは持たない）。
    notifyRustBackendCrashed(reason);
  });

  rustBackendProcess = backend;
  return backend;
};

const callRustBackend = (method: string, params: unknown = {}, timeoutMs = 8000): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    let backend: ChildProcessWithoutNullStreams;

    try {
      backend = ensureRustBackendProcess();
    } catch (error) {
      reject(error as Error);
      return;
    }

    const requestId = rustNextRequestId++;
    const timeout = setTimeout(() => {
      rustPendingRequests.delete(requestId);
      reject(new Error(`Rust backend request timed out: ${method}`));
    }, timeoutMs);

    rustPendingRequests.set(requestId, {
      resolve,
      reject,
      timeout,
    });

    const payload = JSON.stringify({ id: requestId, method, params }) + '\n';
    // sidecar が既に落ちている状態（wgpu panic 直後など）で stdin へ書き込むと
    // EPIPE が発生しうる。write() のコールバックに加えて 'error' イベントも
    // ハンドルしないと、その EPIPE が Uncaught Exception として Electron main
    // プロセスごとクラッシュさせる（実機で観測済み）。
    writeToRustBackendStdin(backend.stdin, payload, (error) => {
      const pending = rustPendingRequests.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      rustPendingRequests.delete(requestId);
      reject(new Error(`Failed to write request to Rust backend: ${error.message}`));
    });
  });
};

function createWindow() {
  const vitePublicPath = process.env.VITE_PUBLIC ?? path.join(__dirname, '../public')
  const distPath = process.env.DIST ?? path.join(__dirname, '../dist')

  // アイコン画像のパスを設定 (publicフォルダ内の 'icon.jpg' を参照)
  // ※ 実際のファイル名が 'icon.jpeg' の場合は修正してください
  const iconPath = path.join(vitePublicPath, 'icon.jpg')

  // macOS用のDockアイコン設定
  if (process.platform === 'darwin') {
    app.dock.setIcon(iconPath)
  }

  const isExportTest = process.env['VITE_EXPORT_TEST'] === '1';
  win = new BrowserWindow(buildMainWindowOptions({
    isExportTest,
    iconPath,
    preloadPath: path.join(__dirname, 'preload.js'),
  }))

  // Enable SharedArrayBuffer for WASM Worker parallel PSD decompression.
  // SharedArrayBuffer requires Cross-Origin-Opener-Policy: same-origin and
  // Cross-Origin-Embedder-Policy: require-corp (COOP/COEP) headers.
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      },
    });
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(distPath, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  if (rustBackendProcess && !rustBackendProcess.killed) {
    rustBackendProcess.kill();
  }
})

app.whenReady().then(() => {
  createWindow()

  // --- Remote Control Deck server (Remote_Control_Deck_Plan.md Phase 2) ---
  // LAN 内スマホからの WebSocket command を renderer の CommandBus へ転送する。
  // 起動失敗（ポート枯渇等）はリモートデッキ機能のみ無効化し、本体は継続。
  let remoteDeckServer: RemoteDeckServer | null = null;
  // ユーザー編集可能なボタンレイアウト定義（Phase 6）
  const remoteDeckLayoutFilePath = path.join(app.getPath('userData'), 'remote-deck-layout.json');
  startRemoteDeckServer({
    // パッケージ時は extraResources（Resources/remote-deck-ui）、開発時は
    // npm run remote-deck:build の成果物。未ビルド時はプレースホルダへ
    // 自動フォールバック。
    staticDir: resolveRemoteDeckStaticDir({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appDirname: __dirname,
    }),
    layoutFilePath: remoteDeckLayoutFilePath,
  })
    .then((server) => {
      remoteDeckServer = server;
      forwardRemoteDeckCommands(server, (channel, message) => {
        win?.webContents.send(channel, message);
      });
    })
    .catch((error) => {
      console.warn('Remote deck server failed to start:', error);
    });
  ipcMain.handle(remoteDeckIpcChannels.getConnectionInfo, () =>
    remoteDeckServer ? buildRemoteDeckConnectionInfo(remoteDeckServer) : null)
  // renderer が push する選択コンテキストを接続中のデッキへブロードキャスト
  ipcMain.on(remoteDeckIpcChannels.state, (_event, payload) => {
    remoteDeckServer?.broadcastState(payload);
  })
  // 接続管理（Phase 6）
  ipcMain.handle(remoteDeckIpcChannels.listConnections, () =>
    remoteDeckServer?.listConnections() ?? [])
  ipcMain.handle(remoteDeckIpcChannels.disconnectClient, (_event, payload: { id?: string }) =>
    typeof payload?.id === 'string' ? remoteDeckServer?.disconnectClient(payload.id) ?? false : false)
  ipcMain.handle(remoteDeckIpcChannels.regenerateToken, () => {
    if (!remoteDeckServer) return null;
    remoteDeckServer.regenerateToken();
    return buildRemoteDeckConnectionInfo(remoteDeckServer);
  })
  ipcMain.handle(remoteDeckIpcChannels.openLayoutFile, async () => {
    // 初回はデフォルトレイアウトを書き出してから Finder/Explorer で表示する
    if (!fs.existsSync(remoteDeckLayoutFilePath)) {
      fs.writeFileSync(
        remoteDeckLayoutFilePath,
        JSON.stringify(DEFAULT_REMOTE_DECK_LAYOUT, null, 2),
        'utf8'
      );
    }
    shell.showItemInFolder(remoteDeckLayoutFilePath);
    return { path: remoteDeckLayoutFilePath };
  })
  app.on('before-quit', () => {
    void remoteDeckServer?.close();
    remoteDeckServer = null;
  })

  // --- IPC Handlers ---
  const nativeOverlayBridge = createNativeOverlayMainBridge({
    env: process.env,
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath,
    resolveNativeWindowHandle: (windowId) => BrowserWindow.fromId(windowId)?.getNativeWindowHandle() ?? null,
    resolveBackingScaleFactor: (windowId) => {
      const targetWindow = BrowserWindow.fromId(windowId)
      return targetWindow ? screen.getDisplayMatching(targetWindow.getBounds()).scaleFactor : null
    },
    logDiagnostic: (eventName, payload) => console.info(formatNativeOverlayDiagnosticLog(eventName, payload)),
  });
  registerNativeOverlayIpcHandlers(ipcMain, nativeOverlayBridge, {
    resolveWindowIdFromEvent: (event) => {
      const sender = typeof event === 'object' && event !== null && 'sender' in event
        ? (event as { sender?: WebContents }).sender
        : undefined
      return sender ? BrowserWindow.fromWebContents(sender)?.id ?? null : null
    },
    logDiagnostic: (eventName, payload) => console.info(formatNativeOverlayDiagnosticLog(eventName, payload)),
  })
  const rustScenePlaybackController = createRustScenePlaybackController({
    evaluateScene: async (payload) =>
      (await callRustBackend('scene.evaluate', payload, 8_000)) as RustScenePlaybackEvaluation,
    presentScene: (payload) => nativeOverlayBridge.presentScene(payload),
    emit: (state) => {
      win?.webContents.send('rust-backend-scene-playback-ui-state', state);
    },
  });
  ipcMain.handle(
    'rust-backend-scene-playback-start',
    async (event, payload: Omit<RustScenePlaybackStartPayload, 'windowId'>) => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id ?? -1;
      return rustScenePlaybackController.start({ ...payload, windowId });
    },
  );
  ipcMain.handle('rust-backend-scene-playback-pause', () =>
    rustScenePlaybackController.pause());
  ipcMain.handle('rust-backend-scene-playback-stop', () =>
    rustScenePlaybackController.stop());
  app.on('before-quit', () => {
    rustScenePlaybackController.stop();
  });

  ipcMain.handle('save-project-file', async (_event, payload: { data?: string; defaultName?: string }) => {
    const data = typeof payload?.data === 'string' ? payload.data : '';
    if (!data) {
      return { success: false, error: '保存データが必要です。' };
    }

    const defaultName = typeof payload?.defaultName === 'string' && payload.defaultName.trim() !== ''
      ? payload.defaultName.trim()
      : 'project.uxfd.json';

    const { filePath } = await dialog.showSaveDialog({
      title: 'プロジェクトを保存',
      defaultPath: defaultName,
      filters: [{ name: 'UXFD Project', extensions: ['json', 'uxfd'] }],
    });

    if (!filePath) {
      return { success: false, cancelled: true };
    }

    try {
      fs.writeFileSync(filePath, data, 'utf8');
      return { success: true, filePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('open-project-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'プロジェクトを開く',
      properties: ['openFile'],
      filters: [{ name: 'UXFD Project', extensions: ['json', 'uxfd'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }

    const filePath = result.filePaths[0];
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return { success: true, filePath, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('resolve-perf-heavy-video', async () => {
    const candidates = buildOrderedPerfHeavyVideoPaths(app.getAppPath(), path.join);
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        return {
          success: true as const,
          filePath,
          fileName: path.basename(filePath),
        };
      }
    }
    return { success: false as const };
  });

  ipcMain.handle('resolve-4k-test-video', async () => {
    const base = app.getAppPath();
    const candidates = [
      path.join(base, 'perf', 'heavy-media', 'GX010052.MP4'),
      path.join(base, '..', 'perf', 'heavy-media', 'GX010052.MP4'),
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) return { success: true as const, filePath };
    }
    return { success: false as const };
  });

  ipcMain.handle('read-file-bytes', async (_event, payload: { filePath?: string }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath) {
      return { success: false, error: 'filePath が必要です。' };
    }

    try {
      const data = fs.readFileSync(filePath);
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return { success: true, data: buffer };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('materialise-media-file', async (_event, payload: { fileName?: string; data?: unknown }) => {
    const sourceBuffer = toNodeBuffer(payload?.data);
    if (!sourceBuffer || sourceBuffer.byteLength === 0) {
      return { success: false, error: 'data が必要です。' };
    }

    const rawFileName = typeof payload?.fileName === 'string' && payload.fileName.trim() !== ''
      ? payload.fileName.trim()
      : 'media.bin';
    const parsed = path.parse(path.basename(rawFileName));
    const safeBase = parsed.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'media';
    const safeExt = parsed.ext.replace(/[^A-Za-z0-9.]/g, '').slice(0, 16);
    const directory = path.join(os.tmpdir(), 'uxfd-media-import');
    const filePath = path.join(
      directory,
      `${safeBase}-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`
    );

    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(filePath, sourceBuffer);
      return { success: true, filePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('append-performance-csv', async (_event, payload: { fileName?: string; lines?: string }) => {
    const fileName = typeof payload?.fileName === 'string' && payload.fileName.trim() !== ''
      ? payload.fileName.trim()
      : 'harness-runs.csv';
    const lines = typeof payload?.lines === 'string' ? payload.lines : '';

    const directory = path.join(app.getPath('userData'), 'performance-reports');
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, fileName);

    try {
      const exists = fs.existsSync(filePath);
      const isEmpty = !exists || fs.statSync(filePath).size === 0;
      if (isEmpty) {
        fs.appendFileSync(filePath, PERFORMANCE_CSV_HEADER_LINE, 'utf8');
      }
      fs.appendFileSync(filePath, lines, 'utf8');
      return { success: true, filePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('perf-harness-agent-done', async (_event, payload: unknown) => {
    const agentPayload = payload as PerfHarnessAgentPayload;
    const outputDir = typeof process.env.UXFD_PERF_OUTPUT_DIR === 'string' && process.env.UXFD_PERF_OUTPUT_DIR.trim() !== ''
      ? path.resolve(process.env.UXFD_PERF_OUTPUT_DIR.trim())
      : process.cwd();
    const outputPath = path.join(outputDir, 'perf-agent-output.json');

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, serialisePerfAgentPayload(agentPayload), 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[perf] Failed to write ${outputPath}:`, message);
    }

    const marker = JSON.stringify({
      type: 'uxfd-perf-result',
      success: agentPayload.success,
      runId: agentPayload.runId,
      csvFilePath: agentPayload.csvFilePath,
      jsonFilePath: outputPath,
      rowCount: agentPayload.rows.length,
      errorMessage: agentPayload.errorMessage,
    });
    console.log(`UXFD_PERF_RESULT_JSON:${marker}`);

    // Phase 7 (W7) Phase 3実機検証: 需要駆動staged attachのnv12バック
    // グラウンド構築完了（最大約60秒）はperfハーネスの完了（数秒〜十数秒）
    // より後に起こるため、既定のperfハーネス完了後の自動終了だと
    // nv12Readyログを観測する前にアプリごと終了してしまう。
    // `UXFD_PERF_KEEP_ALIVE=1` を明示的に指定したときだけ自動終了を
    // スキップする（既定挙動は変更しない、既存のperfハーネス自動化を
    // 壊さないための opt-in）。
    if (process.env.UXFD_PERF_KEEP_ALIVE === '1') {
      return { success: true, jsonFilePath: outputPath };
    }
    const exitCode = agentPayload.success ? 0 : 1;
    setTimeout(() => {
      app.exit(exitCode);
    }, 250);

    return { success: true, jsonFilePath: outputPath };
  });

  ipcMain.handle('perf-harness-trace-marker', async (_event, payload: { marker?: string }) => {
    const marker = typeof payload?.marker === 'string' ? payload.marker.trim() : '';
    if (
      marker.startsWith('UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN')
      || marker.startsWith('UXFD_NATIVE_OVERLAY_STEADY_TRACE_END')
    ) {
      console.log(marker);
      return { success: true };
    }
    return { success: false, error: 'unsupported perf trace marker' };
  });

  ipcMain.handle('save-temp-audio', async (event, buffer: ArrayBuffer) => {
    try {
      const tempPath = path.join(os.tmpdir(), `uxfilm_audio_${Date.now()}.wav`);
      fs.writeFileSync(tempPath, Buffer.from(buffer));
      return { success: true, path: tempPath };
    } catch (e) {
      console.error('Failed to save temp audio:', e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('delete-temp-file', async (_event, payload: { filePath?: string }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath) {
      return { success: false, error: 'filePath が必要です。' };
    }

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('export-audio-mp3', async (_event, payload: { wavBuffer?: unknown }) => {
    const wavBuffer = toNodeBuffer(payload?.wavBuffer);
    if (!wavBuffer || wavBuffer.byteLength === 0) {
      return { success: false, error: 'wavBuffer が必要です。' };
    }

    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Audio (MP3)',
      defaultPath: 'output.mp3',
      filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }]
    });

    if (!filePath) {
      return { success: false, reason: 'cancelled' };
    }

    const tempWavPath = path.join(
      os.tmpdir(),
      `uxfilm_audio_${Date.now()}_${Math.random().toString(16).slice(2)}.wav`
    );

    try {
      fs.writeFileSync(tempWavPath, wavBuffer);
      const ffmpegPath = resolveDefaultFfmpegPath();

      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn(
          ffmpegPath,
          ['-y', '-i', tempWavPath, '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', filePath],
          { stdio: ['ignore', 'ignore', 'pipe'] }
        );

        let stderrText = '';
        ffmpeg.stderr.setEncoding('utf8');
        ffmpeg.stderr.on('data', (chunk: string) => {
          stderrText += chunk;
        });

        ffmpeg.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            reject(
              new Error(
                buildFfmpegNotFoundMessage({ platform: process.platform, binaryLabel: 'ffmpeg' })
              )
            );
            return;
          }
          reject(new Error(`ffmpeg の起動に失敗しました: ${error.message}`));
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderrText.trim() || `ffmpeg が異常終了しました (code=${code ?? 'null'})`));
        });
      });

      return { success: true, filePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      try {
        if (fs.existsSync(tempWavPath)) {
          fs.unlinkSync(tempWavPath);
        }
      } catch {
        // no-op
      }
    }
  });

  // 指定ファイルの再生時間（秒）を probe する。失敗時は null を返し、
  // 呼び出し側で「検証できない＝旧来どおりフォールバック」を選べるようにする。
  const probeDurationSecondsForValidation = async (filePath: string): Promise<number | null> => {
    try {
      const probed = await callRustBackend('media.probe', {
        filePath,
        ffprobePath: resolveDefaultFfprobePath(),
      }, 15000) as { duration?: unknown } | null;
      const duration = probed && typeof probed.duration === 'number' ? probed.duration : null;
      return duration;
    } catch (error) {
      console.warn(`[proxy-validation] ffprobe によるプロキシ検証に失敗しました（フォールバックします）: ${filePath}`, error);
      return null;
    }
  };

  // プロキシファイルが存在するか確認する（インポート時の自動検出用）。
  // 隣接する .proxy.mp4 は外部ツール製・古い生成物の可能性があるため、
  // 再生時間がオリジナルと一致するかを検証してから採用する。
  ipcMain.handle('check-proxy', async (_event, payload: { filePath?: string }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath) return { exists: false };
    const ext = path.extname(filePath);
    const proxyPath = filePath.slice(0, -ext.length) + '.proxy.mp4';
    if (!fs.existsSync(proxyPath)) return { exists: false, proxyPath };

    const [originalDurationSeconds, proxyDurationSeconds] = await Promise.all([
      probeDurationSecondsForValidation(filePath),
      probeDurationSecondsForValidation(proxyPath),
    ]);

    // どちらか probe できなかった場合は検証不能なため、従来どおり存在確認のみで採用する。
    if (originalDurationSeconds === null || proxyDurationSeconds === null) {
      return { exists: true, proxyPath };
    }

    const validation = validateProxyDuration({ originalDurationSeconds, proxyDurationSeconds });
    if (!validation.valid) {
      console.warn(`[proxy-validation] 不正なプロキシを拒否しました: ${proxyPath} (${validation.reason})`);
      return { exists: false, invalidProxyPath: proxyPath, reason: validation.reason };
    }

    return { exists: true, proxyPath };
  });

  // プレビュー用プロキシを生成する（FFmpeg libx264、全Iフレーム、低解像度）
  ipcMain.handle('generate-proxy', async (_event, payload: { filePath?: string; width?: number }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath) return { success: false, error: 'filePath が必要です' };
    const ext = path.extname(filePath);
    const proxyPath = filePath.slice(0, -ext.length) + '.proxy.mp4';
    try {
      const result = await callRustBackend('proxy.generate', {
        inputPath: filePath,
        outputPath: proxyPath,
        width: payload?.width ?? 640,
        ffmpegPath: resolveDefaultFfmpegPath(),
      }, 600_000); // 最大 10 分

      const [originalDurationSeconds, proxyDurationSeconds] = await Promise.all([
        probeDurationSecondsForValidation(filePath),
        probeDurationSecondsForValidation(proxyPath),
      ]);
      if (originalDurationSeconds !== null && proxyDurationSeconds !== null) {
        const validation = validateProxyDuration({ originalDurationSeconds, proxyDurationSeconds });
        if (!validation.valid) {
          console.warn(`[proxy-validation] 生成直後のプロキシが検証に失敗しました: ${proxyPath} (${validation.reason})`);
          return { success: false, error: `生成されたプロキシの再生時間が不正です: ${validation.reason}` };
        }
      }

      return { success: true, proxyPath, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('probe-media', async (_event, payload: { filePath?: string }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath) {
      return { success: false, error: 'filePath is required.' };
    }

    try {
      const result = await callRustBackend('media.probe', {
        filePath,
        ffprobePath: resolveDefaultFfprobePath(),
      }, 15000);

      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle(rustVideoEncodeIpcChannels.start, async (_event, payload: unknown) =>
    startRustVideoEncodeViaBackend(payload, callRustBackend)
  );
  ipcMain.handle(rustVideoEncodeIpcChannels.writeFrame, async (_event, payload: unknown) =>
    writeRustVideoEncodeFrameViaBackend(payload, callRustBackend)
  );
  ipcMain.handle(rustVideoEncodeIpcChannels.writeNativeFrame, async (_event, payload: unknown) =>
    writeRustVideoEncodeNativeFrameViaBackend(payload, callRustBackend)
  );
  ipcMain.handle(rustVideoEncodeIpcChannels.writeResidentSceneFrame, async (_event, payload: unknown) =>
    writeRustVideoEncodeResidentSceneFrameViaBackend(payload, callRustBackend)
  );
  ipcMain.handle(rustVideoEncodeIpcChannels.transcodeVideo, async (_event, payload: unknown) =>
    transcodeRustVideoViaBackend(payload, callRustBackend)
  );
  ipcMain.handle(rustVideoEncodeIpcChannels.finish, async (_event, payload: unknown) =>
    finishRustVideoEncodeViaBackend(payload, callRustBackend)
  );
  ipcMain.handle(rustVideoEncodeIpcChannels.abort, async (_event, payload: unknown) =>
    abortRustVideoEncodeViaBackend(payload, callRustBackend)
  );

  ipcMain.handle('quit-app', (_event, payload?: { exitCode?: number }) => {
    app.exit(payload?.exitCode ?? 0);
  });

  // テスト結果をプロジェクトルート配下のファイルに書き出す
  ipcMain.handle('write-test-log', async (_event, payload: { fileName?: string; content?: string }) => {
    const fileName = typeof payload?.fileName === 'string' ? payload.fileName : 'test-results.log';
    const content = typeof payload?.content === 'string' ? payload.content : '';
    try {
      const logPath = path.join(app.getAppPath(), 'perf', fileName);
      await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
      await fs.promises.writeFile(logPath, content, 'utf-8');
      return { success: true, filePath: logPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ── 互換エクスポート用ハンドラ（Phase 3）────────────────────────────
  // ファイル保存先ダイアログを表示してパスだけを返す
  ipcMain.handle('show-save-dialog', async (_event, options: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    const e2eSavePath = process.env.UXFD_VIDEO_EXPORT_E2E_SAVE_PATH?.trim();
    if (e2eSavePath) {
      return e2eSavePath;
    }

    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: options.defaultPath ?? 'output.mp4',
      filters: options.filters ?? [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    return filePath ?? null;
  });

  // JS 側で mp4-muxer が生成した ArrayBuffer をまとめてファイルに書き込む
  ipcMain.handle('save-buffer-to-file', async (_event, payload: { filePath?: string; buffer?: ArrayBuffer }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath || !payload?.buffer) return { success: false, error: 'filePath または buffer が未指定' };
    try {
      await fs.promises.writeFile(filePath, Buffer.from(payload.buffer));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ── 書き出し出力のディスク逐次書き込み（メモリ全保持を回避）──────────────
  // mp4-muxer の StreamTarget から (data, position) で呼ばれるチャンクを直接ファイルへ書く。
  const exportStreams = new Map<number, fs.promises.FileHandle>();
  let exportStreamSeq = 0;
  ipcMain.handle('export-stream-open', async (_event, payload: { filePath?: string }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath) return { success: false, error: 'filePath が未指定' };
    try {
      const fd = await fs.promises.open(filePath, 'w');
      const id = ++exportStreamSeq;
      exportStreams.set(id, fd);
      return { success: true, id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('export-stream-write', async (_event, payload: { id?: number; chunk?: ArrayBuffer; position?: number }) => {
    const fd = typeof payload?.id === 'number' ? exportStreams.get(payload.id) : undefined;
    if (!fd || !payload?.chunk) return { success: false, error: 'ストリーム未オープン or chunk 未指定' };
    try {
      const buf = Buffer.from(payload.chunk);
      // position 指定があればその位置へ（faststart 等の seek 書き込みに対応）。
      await fd.write(buf, 0, buf.byteLength, typeof payload.position === 'number' ? payload.position : null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('export-stream-close', async (_event, payload: { id?: number }) => {
    const id = typeof payload?.id === 'number' ? payload.id : -1;
    const fd = exportStreams.get(id);
    if (!fd) return { success: false, error: 'ストリーム未オープン' };
    try {
      await fd.close();
      exportStreams.delete(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ── PSD metadata-only parsing via Rust backend (sole import path, R5-3) ──
  // This calls psd.parseMeta, which never spawns the background pixel-blob
  // write on the Rust side — so there is nothing to await_blob or read back
  // here. Preview rendering is unaffected: it already re-decodes the PSD
  // independently from its file path.
  ipcMain.handle('parse-psd-meta', async (_event, payload: { filePath?: string }) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
    if (!filePath) {
      return { success: false, error: 'filePath が必要です。' };
    }

    type RustMetaNode = {
      psdId: number;
      parentPsdId: number | null;
      isGroup: boolean;
      name: string;
      width: number;
      height: number;
      top: number;
      left: number;
      defaultVisible: boolean;
      order: number;
    };

    let rustResult: { width: number; height: number; nodes: RustMetaNode[] };

    try {
      rustResult = (await callRustBackend('psd.parseMeta', { filePath }, 60_000)) as typeof rustResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      success: true,
      width: rustResult.width,
      height: rustResult.height,
      nodes: rustResult.nodes,
    };
  });

  // ── PSD composite RGBA via Rust backend ──────────────────────────────────
  // 3D ステージの PSD ビルボード用。旧 Pixi 実装は app.renderer.extract で
  // ラスタライズしていたが撤去済みのため、rust-backend の
  // psd.renderComposite（visible レイヤー、または activeLayerIds で指定した
  // レイヤーのみを合成した単一 RGBA ラスタ）を同じ二段プロトコルで呼ぶ。
  ipcMain.handle(
    'render-psd-composite',
    async (_event, payload: { filePath?: string; activeLayerIds?: string[] }) => {
      const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
      if (!filePath) {
        return { success: false, error: 'filePath が必要です。' };
      }
      const activeLayerIds = Array.isArray(payload?.activeLayerIds)
        ? payload.activeLayerIds.filter((id): id is string => typeof id === 'string')
        : undefined;

      let rustResult: { tmpFile: string; width: number; height: number };
      try {
        rustResult = (await callRustBackend(
          'psd.renderComposite',
          { filePath, activeLayerIds },
          60_000
        )) as typeof rustResult;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const blobPath = rustResult.tmpFile;
      await callRustBackend('psd.await_blob', {}, 30_000);

      try {
        const buf = await fs.promises.readFile(blobPath);
        const pixelData: ArrayBuffer = buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength
        );
        return {
          success: true,
          width: rustResult.width,
          height: rustResult.height,
          pixelData,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        fs.unlink(blobPath, () => {});
      }
    }
  );

  ipcMain.handle('rust-backend-health', async () => {
    try {
      const result = await callRustBackend('health');
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-echo', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('echo', payload);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  const sceneRpcFailure = (error: unknown) => ({
    success: false,
    error: error instanceof Error ? error.message : String(error),
    errorCode: error instanceof RustBackendRpcError ? error.code : undefined,
  });

  ipcMain.handle('rust-backend-scene-replace', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('scene.replace', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return sceneRpcFailure(error);
    }
  });

  ipcMain.handle('rust-backend-scene-evaluate', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('scene.evaluate', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return sceneRpcFailure(error);
    }
  });

  ipcMain.handle('rust-backend-decode-start', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('decode.start', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-decode-request-frame', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('decode.requestFrame', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-decode-request-frame-inline', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('decode.requestFrameInline', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-decode-stop', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('decode.stop', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-decode-release-frame', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('decode.releaseFrame', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-render-native-shared-frame', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('render.nativeSharedFrame', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-render-release-native-shared-frame', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('render.releaseNativeSharedFrame', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-audio-waveform-samples', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('audio.waveformSamples', payload, 15_000);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-fonts-list', async () => {
    try {
      const result = await callRustBackend('fonts.list', {});
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('rust-backend-project-deserialize', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('project.deserialize', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return sceneRpcFailure(error);
    }
  });

  ipcMain.handle('rust-backend-project-serialize', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('project.serialize', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return sceneRpcFailure(error);
    }
  });

  ipcMain.handle('rust-backend-agent-build-project-file', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('agent.buildProjectFile', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return sceneRpcFailure(error);
    }
  });

  ipcMain.handle('rust-backend-command-apply', async (_event, payload: unknown) => {
    try {
      const result = await callRustBackend('command.apply', payload, 8000);
      return { success: true, result };
    } catch (error) {
      return sceneRpcFailure(error);
    }
  });

  ipcMain.handle('coreml-track-object-supported', () => ({
    supported: process.platform === 'darwin',
  }));

  ipcMain.handle('coreml-track-object', async (_event, raw: unknown) => {
    if (process.platform !== 'darwin') {
      return { ok: false as const, error: 'Object tracking is available on macOS only.' };
    }

    if (!raw || typeof raw !== 'object') {
      return { ok: false as const, error: 'Invalid payload.' };
    }

    const payload = raw as Record<string, unknown>;
    const videoPathRaw = typeof payload.videoPath === 'string' ? payload.videoPath : '';
    const videoPath = normaliseFsPathForCoreMl(videoPathRaw);
    if (!videoPath || !fs.existsSync(videoPath)) {
      return { ok: false as const, error: 'videoPath must be an existing file.' };
    }

    const commandRaw = typeof payload.command === 'string' ? payload.command.trim().toLowerCase() : 'track';

    const readTimeSec = (): number | null => {
      const t = typeof payload.timeSec === 'number' && Number.isFinite(payload.timeSec) ? payload.timeSec : NaN;
      return Number.isFinite(t) ? t : null;
    };

    let cliPayload: Record<string, unknown>;
    let timeoutMs = 900_000;

    if (commandRaw === 'detectsubjects' || commandRaw === 'segmentperson' || commandRaw === 'framepreview') {
      const timeSec = readTimeSec();
      if (timeSec === null) {
        return { ok: false as const, error: 'timeSec must be a finite number.' };
      }
      if (commandRaw === 'detectsubjects') {
        cliPayload = { command: 'detectSubjects', videoPath, timeSec };
      } else if (commandRaw === 'segmentperson') {
        cliPayload = { command: 'segmentPerson', videoPath, timeSec };
      } else {
        cliPayload = { command: 'framePreview', videoPath, timeSec };
      }
      timeoutMs = 120_000;
    } else {
      const startSec = typeof payload.startSec === 'number' && Number.isFinite(payload.startSec) ? payload.startSec : NaN;
      const endSec = typeof payload.endSec === 'number' && Number.isFinite(payload.endSec) ? payload.endSec : NaN;
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
        return { ok: false as const, error: 'startSec and endSec must be finite numbers with endSec > startSec.' };
      }

      const box = payload.initialBoundingBox;
      if (!box || typeof box !== 'object') {
        return { ok: false as const, error: 'initialBoundingBox is required.' };
      }
      const b = box as Record<string, unknown>;
      const bx = typeof b.x === 'number' && Number.isFinite(b.x) ? b.x : NaN;
      const by = typeof b.y === 'number' && Number.isFinite(b.y) ? b.y : NaN;
      const bw = typeof b.width === 'number' && Number.isFinite(b.width) ? b.width : NaN;
      const bh = typeof b.height === 'number' && Number.isFinite(b.height) ? b.height : NaN;
      if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bw) || !Number.isFinite(bh)) {
        return { ok: false as const, error: 'initialBoundingBox must have finite x, y, width, height.' };
      }

      const frameStride =
        typeof payload.frameStride === 'number' && Number.isFinite(payload.frameStride) && payload.frameStride >= 1
          ? Math.floor(payload.frameStride)
          : undefined;
      const targetFps =
        typeof payload.targetFps === 'number' && Number.isFinite(payload.targetFps) && payload.targetFps > 0
          ? payload.targetFps
          : undefined;

      cliPayload = {
        command: 'track',
        videoPath,
        startSec,
        endSec,
        initialBoundingBox: { x: bx, y: by, width: bw, height: bh },
        frameStride,
        targetFps,
      };
    }

    try {
      const result = (await runCoreMlTrackerCli(cliPayload, timeoutMs)) as {
        ok?: boolean;
        samples?: unknown;
        error?: string;
      };

      if (result && typeof result === 'object' && result.ok === false) {
        return { ok: false as const, error: typeof result.error === 'string' ? result.error : 'Vision job error.' };
      }

      return result;
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
})
