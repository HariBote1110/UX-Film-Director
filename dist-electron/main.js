"use strict";
const electron = require("electron");
const path = require("node:path");
const node_url = require("node:url");
const node_child_process = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const PERF_HEAVY_VIDEO_BASE_NAMES = ["20000kbps_60fps.mp4", "10000kbps_60fps.mp4"];
const buildOrderedPerfHeavyVideoPaths = (appRoot, join) => {
  const heavyDir = join(appRoot, "perf", "heavy-media");
  const paths = [];
  for (const name of PERF_HEAVY_VIDEO_BASE_NAMES) {
    paths.push(join(heavyDir, name));
    paths.push(join(appRoot, name));
  }
  return paths;
};
const serialisePerfAgentPayload = (payload) => JSON.stringify(payload, null, 2);
const CSV_COLUMNS = [
  "timestamp_utc",
  "run_id",
  "scenario",
  "duration_ms",
  "object_count_before",
  "object_count_after",
  "raf_mean_ms",
  "raf_p95_ms",
  "raf_max_ms",
  "long_task_count",
  "notes"
];
const PERFORMANCE_CSV_HEADER_LINE = `${CSV_COLUMNS.join(",")}
`;
electron.app.commandLine.appendSwitch("enable-gpu-rasterization");
electron.app.commandLine.appendSwitch("enable-zero-copy");
electron.app.commandLine.appendSwitch("ignore-gpu-blocklist");
electron.app.commandLine.appendSwitch("enable-unsafe-webgpu");
electron.app.commandLine.appendSwitch("disable-features", "UseChromeOSDirectVideoDecoder");
electron.app.commandLine.appendSwitch(
  "enable-features",
  "VideoToolboxVideoCodecFactory,VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization"
);
electron.app.commandLine.appendSwitch("disable-gpu-sandbox");
electron.app.commandLine.appendSwitch("in-process-gpu");
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path.join(__dirname, "../public");
let win;
let rustBackendProcess = null;
let rustNextRequestId = 1;
let rustStdoutBuffer = "";
const rustPendingRequests = /* @__PURE__ */ new Map();
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const resolveDefaultFfmpegPath = () => {
  if (process.env.UXFD_FFMPEG_BIN) {
    return process.env.UXFD_FFMPEG_BIN;
  }
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg"
  ];
  for (const candidate of candidates) {
    if (candidate === "ffmpeg") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return "ffmpeg";
};
const resolveDefaultFfprobePath = () => {
  if (process.env.UXFD_FFPROBE_BIN) {
    return process.env.UXFD_FFPROBE_BIN;
  }
  const candidates = [
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "ffprobe"
  ];
  for (const candidate of candidates) {
    if (candidate === "ffprobe") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return "ffprobe";
};
const toNodeBuffer = (value) => {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return Buffer.from(value);
  }
  return null;
};
const getRustBackendBinaryName = () => {
  return process.platform === "win32" ? "uxfd-rust-backend.exe" : "uxfd-rust-backend";
};
const getRustBackendCandidates = () => {
  const binaryName = getRustBackendBinaryName();
  const candidates = [];
  if (process.env.UXFD_RUST_BACKEND_BIN) {
    candidates.push(process.env.UXFD_RUST_BACKEND_BIN);
  }
  if (electron.app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "rust-backend", binaryName));
    candidates.push(path.join(process.resourcesPath, binaryName));
  } else {
    const appPath = electron.app.getAppPath();
    candidates.push(path.join(appPath, "rust-backend", "target", "debug", binaryName));
    candidates.push(path.join(appPath, "rust-backend", "target", "release", binaryName));
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
const COREML_TRACKER_BINARY = "uxfd-coreml-tracker";
const getCoreMlTrackerCandidates = () => {
  const candidates = [];
  if (process.env.UXFD_COREML_TRACKER_BIN) {
    candidates.push(process.env.UXFD_COREML_TRACKER_BIN);
  }
  if (electron.app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "macos-coreml-tracker", COREML_TRACKER_BINARY));
    candidates.push(path.join(process.resourcesPath, COREML_TRACKER_BINARY));
  } else {
    const appPath = electron.app.getAppPath();
    candidates.push(path.join(appPath, "macos-coreml-tracker", ".build", "release", COREML_TRACKER_BINARY));
    candidates.push(path.join(appPath, "macos-coreml-tracker", ".build", "debug", COREML_TRACKER_BINARY));
  }
  return candidates;
};
const resolveCoreMlTrackerPath = () => {
  for (const candidate of getCoreMlTrackerCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};
const normaliseFsPathForCoreMl = (input) => {
  const trimmed = input.trim();
  if (trimmed.startsWith("file:")) {
    try {
      return node_url.fileURLToPath(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};
const runCoreMlTrackerCli = (payload, timeoutMs = 9e5) => {
  const trackerPath = resolveCoreMlTrackerPath();
  if (!trackerPath) {
    return Promise.reject(
      new Error(
        'uxfd-coreml-tracker binary not found. Run "swift build -c release" in macos-coreml-tracker/ or set UXFD_COREML_TRACKER_BIN.'
      )
    );
  }
  return new Promise((resolve, reject) => {
    const child = node_child_process.spawn(trackerPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdoutText = "";
    let stderrText = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("uxfd-coreml-tracker timed out."));
    }, timeoutMs);
    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdoutText += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderrText += chunk;
      });
    }
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const line = stdoutText.trim().split(/\r?\n/).filter(Boolean).pop();
      if (line) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.ok === false && typeof parsed.error === "string") {
            reject(new Error(parsed.error));
            return;
          }
        } catch {
        }
      }
      if (code !== 0) {
        const detail = stderrText.trim() || stdoutText.trim() || `exit code ${code ?? "null"}`;
        reject(new Error(`uxfd-coreml-tracker failed: ${detail}`));
        return;
      }
      if (!line) {
        reject(new Error("uxfd-coreml-tracker returned empty stdout."));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (error) {
        reject(new Error(`uxfd-coreml-tracker returned invalid JSON: ${String(error)}`));
      }
    });
    child.stdin.write(JSON.stringify(payload), "utf8");
    child.stdin.end();
  });
};
const rejectAllRustPending = (reason) => {
  rustPendingRequests.forEach((pending, id) => {
    clearTimeout(pending.timeout);
    pending.reject(new Error(reason));
    rustPendingRequests.delete(id);
  });
};
const handleRustStdout = (chunk) => {
  var _a;
  rustStdoutBuffer += chunk;
  const lines = rustStdoutBuffer.split("\n");
  rustStdoutBuffer = lines.pop() ?? "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    let response;
    try {
      response = JSON.parse(line);
    } catch (error) {
      console.error(`[RustBackend] Invalid response JSON: ${line}`);
      continue;
    }
    if (typeof response.id !== "number") {
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
      pending.reject(new Error(((_a = response.error) == null ? void 0 : _a.message) ?? "Rust backend returned an error"));
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
  const child = node_child_process.spawn(rustBackendPath, [], { stdio: ["pipe", "pipe", "pipe"] });
  if (!child.stdout || !child.stderr || !child.stdin) {
    throw new Error("Failed to start Rust backend stdio streams.");
  }
  const backend = child;
  backend.stdout.setEncoding("utf8");
  backend.stderr.setEncoding("utf8");
  backend.stdout.on("data", (chunk) => {
    handleRustStdout(chunk);
  });
  backend.stderr.on("data", (chunk) => {
    const text = chunk.trim();
    if (text) console.log(`[RustBackend] ${text}`);
  });
  backend.on("error", (error) => {
    console.error("Rust backend process error:", error);
    rejectAllRustPending(`Rust backend process error: ${error.message}`);
  });
  backend.on("exit", (code, signal) => {
    rustBackendProcess = null;
    const reason = `Rust backend exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
    rejectAllRustPending(reason);
  });
  rustBackendProcess = backend;
  return backend;
};
const callRustBackend = (method, params = {}, timeoutMs = 8e3) => {
  return new Promise((resolve, reject) => {
    let backend;
    try {
      backend = ensureRustBackendProcess();
    } catch (error) {
      reject(error);
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
      timeout
    });
    const payload = JSON.stringify({ id: requestId, method, params }) + "\n";
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
  const vitePublicPath = process.env.VITE_PUBLIC ?? path.join(__dirname, "../public");
  const distPath = process.env.DIST ?? path.join(__dirname, "../dist");
  const iconPath = path.join(vitePublicPath, "icon.jpg");
  if (process.platform === "darwin") {
    electron.app.dock.setIcon(iconPath);
  }
  const isExportTest = process.env["VITE_EXPORT_TEST"] === "1";
  win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    show: !isExportTest,
    // テスト実行時はウィンドウを非表示（2窓防止）
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      webviewTag: true,
      devTools: !isExportTest
    },
    titleBarStyle: "hiddenInset"
  });
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Opener-Policy": ["same-origin"],
        "Cross-Origin-Embedder-Policy": ["require-corp"]
      }
    });
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(distPath, "index.html"));
  }
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.on("before-quit", () => {
  if (rustBackendProcess && !rustBackendProcess.killed) {
    rustBackendProcess.kill();
  }
});
electron.app.whenReady().then(() => {
  createWindow();
  electron.ipcMain.handle("save-project-file", async (_event, payload) => {
    const data = typeof (payload == null ? void 0 : payload.data) === "string" ? payload.data : "";
    if (!data) {
      return { success: false, error: "保存データが必要です。" };
    }
    const defaultName = typeof (payload == null ? void 0 : payload.defaultName) === "string" && payload.defaultName.trim() !== "" ? payload.defaultName.trim() : "project.uxfd.json";
    const { filePath } = await electron.dialog.showSaveDialog({
      title: "プロジェクトを保存",
      defaultPath: defaultName,
      filters: [{ name: "UXFD Project", extensions: ["json", "uxfd"] }]
    });
    if (!filePath) {
      return { success: false, cancelled: true };
    }
    try {
      fs.writeFileSync(filePath, data, "utf8");
      return { success: true, filePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("open-project-file", async () => {
    const result = await electron.dialog.showOpenDialog({
      title: "プロジェクトを開く",
      properties: ["openFile"],
      filters: [{ name: "UXFD Project", extensions: ["json", "uxfd"] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }
    const filePath = result.filePaths[0];
    try {
      const data = fs.readFileSync(filePath, "utf8");
      return { success: true, filePath, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("resolve-perf-heavy-video", async () => {
    const candidates = buildOrderedPerfHeavyVideoPaths(electron.app.getAppPath(), path.join);
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        return {
          success: true,
          filePath,
          fileName: path.basename(filePath)
        };
      }
    }
    return { success: false };
  });
  electron.ipcMain.handle("resolve-4k-test-video", async () => {
    const base = electron.app.getAppPath();
    const candidates = [
      path.join(base, "perf", "heavy-media", "GX010052.MP4"),
      path.join(base, "..", "perf", "heavy-media", "GX010052.MP4")
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) return { success: true, filePath };
    }
    return { success: false };
  });
  electron.ipcMain.handle("read-file-bytes", async (_event, payload) => {
    const filePath = typeof (payload == null ? void 0 : payload.filePath) === "string" ? payload.filePath.trim() : "";
    if (!filePath) {
      return { success: false, error: "filePath が必要です。" };
    }
    try {
      const data = fs.readFileSync(filePath);
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return { success: true, data: buffer };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("append-performance-csv", async (_event, payload) => {
    const fileName = typeof (payload == null ? void 0 : payload.fileName) === "string" && payload.fileName.trim() !== "" ? payload.fileName.trim() : "harness-runs.csv";
    const lines = typeof (payload == null ? void 0 : payload.lines) === "string" ? payload.lines : "";
    const directory = path.join(electron.app.getPath("userData"), "performance-reports");
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, fileName);
    try {
      const exists = fs.existsSync(filePath);
      const isEmpty = !exists || fs.statSync(filePath).size === 0;
      if (isEmpty) {
        fs.appendFileSync(filePath, PERFORMANCE_CSV_HEADER_LINE, "utf8");
      }
      fs.appendFileSync(filePath, lines, "utf8");
      return { success: true, filePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("perf-harness-agent-done", async (_event, payload) => {
    const agentPayload = payload;
    const outputDir = typeof process.env.UXFD_PERF_OUTPUT_DIR === "string" && process.env.UXFD_PERF_OUTPUT_DIR.trim() !== "" ? path.resolve(process.env.UXFD_PERF_OUTPUT_DIR.trim()) : process.cwd();
    const outputPath = path.join(outputDir, "perf-agent-output.json");
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, serialisePerfAgentPayload(agentPayload), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[perf] Failed to write ${outputPath}:`, message);
    }
    const marker = JSON.stringify({
      type: "uxfd-perf-result",
      success: agentPayload.success,
      runId: agentPayload.runId,
      csvFilePath: agentPayload.csvFilePath,
      jsonFilePath: outputPath,
      rowCount: agentPayload.rows.length,
      errorMessage: agentPayload.errorMessage
    });
    console.log(`UXFD_PERF_RESULT_JSON:${marker}`);
    const exitCode = agentPayload.success ? 0 : 1;
    setTimeout(() => {
      electron.app.exit(exitCode);
    }, 250);
    return { success: true, jsonFilePath: outputPath };
  });
  electron.ipcMain.handle("save-temp-audio", async (event, buffer) => {
    try {
      const tempPath = path.join(os.tmpdir(), `uxfilm_audio_${Date.now()}.wav`);
      fs.writeFileSync(tempPath, Buffer.from(buffer));
      return { success: true, path: tempPath };
    } catch (e) {
      console.error("Failed to save temp audio:", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("delete-temp-file", async (_event, payload) => {
    const filePath = typeof (payload == null ? void 0 : payload.filePath) === "string" ? payload.filePath.trim() : "";
    if (!filePath) {
      return { success: false, error: "filePath が必要です。" };
    }
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("export-audio-mp3", async (_event, payload) => {
    const wavBuffer = toNodeBuffer(payload == null ? void 0 : payload.wavBuffer);
    if (!wavBuffer || wavBuffer.byteLength === 0) {
      return { success: false, error: "wavBuffer が必要です。" };
    }
    const { filePath } = await electron.dialog.showSaveDialog({
      title: "Export Audio (MP3)",
      defaultPath: "output.mp3",
      filters: [{ name: "MP3 Audio", extensions: ["mp3"] }]
    });
    if (!filePath) {
      return { success: false, reason: "cancelled" };
    }
    const tempWavPath = path.join(
      os.tmpdir(),
      `uxfilm_audio_${Date.now()}_${Math.random().toString(16).slice(2)}.wav`
    );
    try {
      fs.writeFileSync(tempWavPath, wavBuffer);
      const ffmpegPath = resolveDefaultFfmpegPath();
      await new Promise((resolve, reject) => {
        const ffmpeg = node_child_process.spawn(
          ffmpegPath,
          ["-y", "-i", tempWavPath, "-vn", "-codec:a", "libmp3lame", "-b:a", "192k", filePath],
          { stdio: ["ignore", "ignore", "pipe"] }
        );
        let stderrText = "";
        ffmpeg.stderr.setEncoding("utf8");
        ffmpeg.stderr.on("data", (chunk) => {
          stderrText += chunk;
        });
        ffmpeg.on("error", (error) => {
          reject(new Error(`ffmpeg の起動に失敗しました: ${error.message}`));
        });
        ffmpeg.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderrText.trim() || `ffmpeg が異常終了しました (code=${code ?? "null"})`));
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
      }
    }
  });
  electron.ipcMain.handle("check-proxy", async (_event, payload) => {
    const filePath = typeof (payload == null ? void 0 : payload.filePath) === "string" ? payload.filePath.trim() : "";
    if (!filePath) return { exists: false };
    const ext = path.extname(filePath);
    const proxyPath = filePath.slice(0, -ext.length) + ".proxy.mp4";
    return { exists: fs.existsSync(proxyPath), proxyPath };
  });
  electron.ipcMain.handle("generate-proxy", async (_event, payload) => {
    const filePath = typeof (payload == null ? void 0 : payload.filePath) === "string" ? payload.filePath.trim() : "";
    if (!filePath) return { success: false, error: "filePath が必要です" };
    const ext = path.extname(filePath);
    const proxyPath = filePath.slice(0, -ext.length) + ".proxy.mp4";
    try {
      const result = await callRustBackend("proxy.generate", {
        inputPath: filePath,
        outputPath: proxyPath,
        width: (payload == null ? void 0 : payload.width) ?? 1280,
        ffmpegPath: resolveDefaultFfmpegPath()
      }, 6e5);
      return { success: true, proxyPath, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("probe-media", async (_event, payload) => {
    const filePath = typeof (payload == null ? void 0 : payload.filePath) === "string" ? payload.filePath.trim() : "";
    if (!filePath) {
      return { success: false, error: "filePath is required." };
    }
    try {
      const result = await callRustBackend("media.probe", {
        filePath,
        ffprobePath: resolveDefaultFfprobePath()
      }, 15e3);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("start-export", async (event, { width, height, fps, audioPath }) => {
    const { filePath } = await electron.dialog.showSaveDialog({
      title: "Export Video",
      defaultPath: "output.mp4",
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }]
    });
    if (!filePath) return { success: false, reason: "cancelled" };
    try {
      await callRustBackend("export.start", {
        width,
        height,
        fps,
        filePath,
        audioPath: audioPath ?? null,
        ffmpegPath: resolveDefaultFfmpegPath()
      }, 15e3);
      return { success: true, filePath };
    } catch (error) {
      console.error("Failed to start export via Rust backend", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("write-frame", async (event, frameData) => {
    try {
      const frameBase64 = Buffer.from(frameData).toString("base64");
      await callRustBackend("export.write_frame", { frameBase64 }, 2e4);
      return true;
    } catch (error) {
      console.error("Error writing frame:", error);
      return false;
    }
  });
  electron.ipcMain.handle("end-export", async () => {
    try {
      await callRustBackend("export.end", {}, 6e4);
      return true;
    } catch (error) {
      console.error("Failed to end export via Rust backend", error);
      return false;
    }
  });
  electron.ipcMain.handle("quit-app", (_event, payload) => {
    electron.app.exit((payload == null ? void 0 : payload.exitCode) ?? 0);
  });
  electron.ipcMain.handle("write-test-log", async (_event, payload) => {
    const fileName = typeof (payload == null ? void 0 : payload.fileName) === "string" ? payload.fileName : "test-results.log";
    const content = typeof (payload == null ? void 0 : payload.content) === "string" ? payload.content : "";
    try {
      const logPath = path.join(electron.app.getAppPath(), "perf", fileName);
      await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
      await fs.promises.writeFile(logPath, content, "utf-8");
      return { success: true, filePath: logPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("show-save-dialog", async (_event, options) => {
    const { filePath } = await electron.dialog.showSaveDialog({
      title: "Export Video",
      defaultPath: options.defaultPath ?? "output.mp4",
      filters: options.filters ?? [{ name: "MP4 Video", extensions: ["mp4"] }]
    });
    return filePath ?? null;
  });
  electron.ipcMain.handle("save-buffer-to-file", async (_event, payload) => {
    const filePath = typeof (payload == null ? void 0 : payload.filePath) === "string" ? payload.filePath.trim() : "";
    if (!filePath || !(payload == null ? void 0 : payload.buffer)) return { success: false, error: "filePath または buffer が未指定" };
    try {
      await fs.promises.writeFile(filePath, Buffer.from(payload.buffer));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("parse-psd", async (_event, payload) => {
    const filePath = typeof (payload == null ? void 0 : payload.filePath) === "string" ? payload.filePath.trim() : "";
    if (!filePath) {
      return { success: false, error: "filePath が必要です。" };
    }
    let rustResult;
    try {
      rustResult = await callRustBackend("psd.parse", { filePath }, 6e4);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    const blobPath = rustResult.tmpFile;
    await callRustBackend("psd.await_blob", {}, 3e4);
    let fd = null;
    let nodesWithPixels;
    try {
      fd = await fs.promises.open(blobPath, "r");
      nodesWithPixels = await Promise.all(
        rustResult.nodes.map(async (node) => {
          if (!node.isGroup && node.pixelOffset != null && node.pixelByteLen > 0) {
            try {
              const buf = Buffer.allocUnsafe(node.pixelByteLen);
              await fd.read(buf, 0, node.pixelByteLen, node.pixelOffset);
              const pixelData = buf.buffer.slice(
                buf.byteOffset,
                buf.byteOffset + buf.byteLength
              );
              return { ...node, pixelData };
            } catch {
              return { ...node, pixelData: null };
            }
          }
          return { ...node, pixelData: null };
        })
      );
    } finally {
      if (fd) await fd.close().catch(() => {
      });
      fs.unlink(blobPath, () => {
      });
    }
    return {
      success: true,
      width: rustResult.width,
      height: rustResult.height,
      nodes: nodesWithPixels
    };
  });
  electron.ipcMain.handle("rust-backend-health", async () => {
    try {
      const result = await callRustBackend("health");
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("rust-backend-echo", async (_event, payload) => {
    try {
      const result = await callRustBackend("echo", payload);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  electron.ipcMain.handle("coreml-track-object-supported", () => ({
    supported: process.platform === "darwin"
  }));
  electron.ipcMain.handle("coreml-track-object", async (_event, raw) => {
    if (process.platform !== "darwin") {
      return { ok: false, error: "Object tracking is available on macOS only." };
    }
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Invalid payload." };
    }
    const payload = raw;
    const videoPathRaw = typeof payload.videoPath === "string" ? payload.videoPath : "";
    const videoPath = normaliseFsPathForCoreMl(videoPathRaw);
    if (!videoPath || !fs.existsSync(videoPath)) {
      return { ok: false, error: "videoPath must be an existing file." };
    }
    const commandRaw = typeof payload.command === "string" ? payload.command.trim().toLowerCase() : "track";
    const readTimeSec = () => {
      const t = typeof payload.timeSec === "number" && Number.isFinite(payload.timeSec) ? payload.timeSec : NaN;
      return Number.isFinite(t) ? t : null;
    };
    let cliPayload;
    let timeoutMs = 9e5;
    if (commandRaw === "detectsubjects" || commandRaw === "segmentperson" || commandRaw === "framepreview") {
      const timeSec = readTimeSec();
      if (timeSec === null) {
        return { ok: false, error: "timeSec must be a finite number." };
      }
      if (commandRaw === "detectsubjects") {
        cliPayload = { command: "detectSubjects", videoPath, timeSec };
      } else if (commandRaw === "segmentperson") {
        cliPayload = { command: "segmentPerson", videoPath, timeSec };
      } else {
        cliPayload = { command: "framePreview", videoPath, timeSec };
      }
      timeoutMs = 12e4;
    } else {
      const startSec = typeof payload.startSec === "number" && Number.isFinite(payload.startSec) ? payload.startSec : NaN;
      const endSec = typeof payload.endSec === "number" && Number.isFinite(payload.endSec) ? payload.endSec : NaN;
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
        return { ok: false, error: "startSec and endSec must be finite numbers with endSec > startSec." };
      }
      const box = payload.initialBoundingBox;
      if (!box || typeof box !== "object") {
        return { ok: false, error: "initialBoundingBox is required." };
      }
      const b = box;
      const bx = typeof b.x === "number" && Number.isFinite(b.x) ? b.x : NaN;
      const by = typeof b.y === "number" && Number.isFinite(b.y) ? b.y : NaN;
      const bw = typeof b.width === "number" && Number.isFinite(b.width) ? b.width : NaN;
      const bh = typeof b.height === "number" && Number.isFinite(b.height) ? b.height : NaN;
      if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bw) || !Number.isFinite(bh)) {
        return { ok: false, error: "initialBoundingBox must have finite x, y, width, height." };
      }
      const frameStride = typeof payload.frameStride === "number" && Number.isFinite(payload.frameStride) && payload.frameStride >= 1 ? Math.floor(payload.frameStride) : void 0;
      const targetFps = typeof payload.targetFps === "number" && Number.isFinite(payload.targetFps) && payload.targetFps > 0 ? payload.targetFps : void 0;
      cliPayload = {
        command: "track",
        videoPath,
        startSec,
        endSec,
        initialBoundingBox: { x: bx, y: by, width: bw, height: bh },
        frameStride,
        targetFps
      };
    }
    try {
      const result = await runCoreMlTrackerCli(cliPayload, timeoutMs);
      if (result && typeof result === "object" && result.ok === false) {
        return { ok: false, error: typeof result.error === "string" ? result.error : "Vision job error." };
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
});
