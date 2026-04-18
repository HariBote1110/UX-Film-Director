import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { PERFORMANCE_CSV_HEADER_LINE } from '../src/perf/performanceReport'

// --- GPU Acceleration Flags ---
// 高画質動画の再生負荷を下げるための重要な設定
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// WebGPUを明示的に有効化 (環境によってはデフォルトで無効な場合があるため)
app.commandLine.appendSwitch('enable-unsafe-webgpu');
// ビデオデコードのハードウェア加速を強制
app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization'); 

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

const rustPendingRequests = new Map<number, PendingRustRequest>();

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

const resolveDefaultFfmpegPath = () => {
  if (process.env.UXFD_FFMPEG_BIN) {
    return process.env.UXFD_FFMPEG_BIN;
  }

  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'ffmpeg',
  ];

  for (const candidate of candidates) {
    if (candidate === 'ffmpeg') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'ffmpeg';
};

const resolveDefaultFfprobePath = () => {
  if (process.env.UXFD_FFPROBE_BIN) {
    return process.env.UXFD_FFPROBE_BIN;
  }

  const candidates = [
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    'ffprobe',
  ];

  for (const candidate of candidates) {
    if (candidate === 'ffprobe') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'ffprobe';
};

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

const rejectAllRustPending = (reason: string) => {
  rustPendingRequests.forEach((pending, id) => {
    clearTimeout(pending.timeout);
    pending.reject(new Error(reason));
    rustPendingRequests.delete(id);
  });
};

const handleRustStdout = (chunk: string) => {
  rustStdoutBuffer += chunk;
  const lines = rustStdoutBuffer.split('\n');
  rustStdoutBuffer = lines.pop() ?? '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let response: RustRpcResponse;
    try {
      response = JSON.parse(line) as RustRpcResponse;
    } catch (error) {
      console.error(`[RustBackend] Invalid response JSON: ${line}`);
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
      pending.reject(new Error(response.error?.message ?? 'Rust backend returned an error'));
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

  const child = spawn(rustBackendPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
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
  });

  backend.on('exit', (code, signal) => {
    rustBackendProcess = null;
    const reason = `Rust backend exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
    rejectAllRustPending(reason);
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
    backend.stdin.write(payload, (error) => {
      if (!error) return;
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

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath, // Windows/Linux用のウィンドウアイコン設定
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      webviewTag: true, // 重要: webviewタグを有効化
    },
    titleBarStyle: 'hiddenInset',
  })

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

  // --- IPC Handlers ---

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

        ffmpeg.on('error', (error) => {
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

  ipcMain.handle('start-export', async (event, { width, height, fps, audioPath }) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: 'output.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (!filePath) return { success: false, reason: 'cancelled' };

    try {
      await callRustBackend('export.start', {
        width,
        height,
        fps,
        filePath,
        audioPath: audioPath ?? null,
        ffmpegPath: resolveDefaultFfmpegPath(),
      }, 15000);

      return { success: true, filePath };
    } catch (error) {
      console.error('Failed to start export via Rust backend', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('write-frame', async (event, frameData: ArrayBuffer) => {
    try {
      const frameBase64 = Buffer.from(frameData).toString('base64');
      await callRustBackend('export.write_frame', { frameBase64 }, 20000);
      return true;
    } catch (error) {
      console.error('Error writing frame:', error);
      return false;
    }
  });

  ipcMain.handle('end-export', async () => {
    try {
      await callRustBackend('export.end', {}, 60000);
      return true;
    } catch (error) {
      console.error('Failed to end export via Rust backend', error);
      return false;
    }
  });

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
})
