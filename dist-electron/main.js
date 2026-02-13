"use strict";
const electron = require("electron");
const path = require("node:path");
const node_child_process = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
electron.app.commandLine.appendSwitch("enable-gpu-rasterization");
electron.app.commandLine.appendSwitch("enable-zero-copy");
electron.app.commandLine.appendSwitch("ignore-gpu-blocklist");
electron.app.commandLine.appendSwitch("enable-unsafe-webgpu");
electron.app.commandLine.appendSwitch("disable-features", "UseChromeOSDirectVideoDecoder");
electron.app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,CanvasOopRasterization");
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
  win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    // Windows/Linux用のウィンドウアイコン設定
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      webviewTag: true
      // 重要: webviewタグを有効化
    },
    titleBarStyle: "hiddenInset"
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
});
