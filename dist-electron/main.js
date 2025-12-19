"use strict";
const electron = require("electron");
const path = require("node:path");
const node_child_process = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
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
  electron.ipcMain.handle("start-export", async (event, { width, height, fps, audioPath }) => {
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
      // --- Input 0: Video Pipe (標準入力から画像を受け取る) ---
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      // 送られてくる画像はJPEG
      "-r",
      fps.toString(),
      "-i",
      "-",
      // --- Input 1: Audio File (もしあれば) ---
      ...audioPath ? ["-i", audioPath] : [],
      // --- Video Encoding Settings ---
      "-c:v",
      "h264_videotoolbox",
      // Apple Silicon Hardware Encoder
      "-b:v",
      "8000k",
      // ビットレート (高画質)
      "-pix_fmt",
      "yuv420p",
      // 互換性確保
      // --- Audio Encoding Settings (もしあれば) ---
      // 映像(0:v:0)と音声(1:a:0)をマッピング
      ...audioPath ? ["-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0"] : [],
      // 一番短いストリームに合わせて終了 (映像が終わったら音声も切る)
      "-shortest",
      // Output Path
      filePath
    ];
    const ffmpegPath = "/opt/homebrew/bin/ffmpeg";
    try {
      ffmpegProcess = node_child_process.spawn(ffmpegPath, args);
      (_a = ffmpegProcess.stderr) == null ? void 0 : _a.on("data", (data) => {
        console.log(`FFmpeg: ${data}`);
      });
      ffmpegProcess.on("close", (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        event.sender.send("export-complete", code === 0);
        ffmpegProcess = null;
        if (audioPath && fs.existsSync(audioPath)) {
          try {
            fs.unlinkSync(audioPath);
            console.log("Temp audio deleted:", audioPath);
          } catch (err) {
            console.error("Failed to delete temp audio:", err);
          }
        }
      });
      return { success: true, filePath };
    } catch (e) {
      console.error("Failed to spawn ffmpeg", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("write-frame", async (event, base64Data) => {
    if (!ffmpegProcess || !ffmpegProcess.stdin) return false;
    try {
      const data = base64Data.replace(/^data:image\/jpeg;base64,/, "");
      const buffer = Buffer.from(data, "base64");
      ffmpegProcess.stdin.write(buffer);
      return true;
    } catch (error) {
      console.error("Error writing frame:", error);
      return false;
    }
  });
  electron.ipcMain.handle("end-export", async () => {
    if (ffmpegProcess && ffmpegProcess.stdin) {
      ffmpegProcess.stdin.end();
    }
    return true;
  });
});
