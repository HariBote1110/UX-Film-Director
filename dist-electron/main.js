"use strict";
const electron = require("electron");
const path = require("node:path");
const node_child_process = require("node:child_process");
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path.join(__dirname, "../public");
let win;
let ffmpegProcess = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
      // ローカル画像の読み込み許可 (Dev用)
    },
    titleBarStyle: "hiddenInset"
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
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
electron.app.whenReady().then(() => {
  createWindow();
  electron.ipcMain.handle("start-export", async (event, { width, height, fps }) => {
    var _a;
    const { filePath } = await electron.dialog.showSaveDialog({
      title: "Export Video",
      defaultPath: "output.mp4",
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }]
    });
    if (!filePath) return { success: false, reason: "cancelled" };
    const args = [
      "-y",
      // 上書き許可
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-r",
      fps.toString(),
      "-i",
      "-",
      // 標準入力から読み込み
      "-c:v",
      "h264_videotoolbox",
      // Apple Silicon Hardware Encoder
      "-b:v",
      "8000k",
      // 高画質
      "-pix_fmt",
      "yuv420p",
      // 互換性のため
      filePath
    ];
    try {
      ffmpegProcess = node_child_process.spawn("ffmpeg", args);
      (_a = ffmpegProcess.stderr) == null ? void 0 : _a.on("data", (data) => {
        console.log(`FFmpeg: ${data}`);
      });
      ffmpegProcess.on("close", (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        event.sender.send("export-complete", code === 0);
        ffmpegProcess = null;
      });
      return { success: true, filePath };
    } catch (e) {
      console.error("Failed to spawn ffmpeg", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("write-frame", async (event, base64Data) => {
    if (!ffmpegProcess || !ffmpegProcess.stdin) return false;
    const data = base64Data.replace(/^data:image\/jpeg;base64,/, "");
    const buffer = Buffer.from(data, "base64");
    ffmpegProcess.stdin.write(buffer);
    return true;
  });
  electron.ipcMain.handle("end-export", async () => {
    if (ffmpegProcess && ffmpegProcess.stdin) {
      ffmpegProcess.stdin.end();
    }
    return true;
  });
});
