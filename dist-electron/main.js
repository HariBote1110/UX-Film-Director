"use strict";
const electron = require("electron");
const path = require("node:path");
const node_child_process = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
let ffmpegPath = ffmpegStatic;
if (ffmpegPath) {
  ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`[Main] FFmpeg Path set to: ${ffmpegPath}`);
} else {
  console.error("[Main] FFmpeg binary not found!");
}
electron.app.commandLine.appendSwitch("enable-gpu-rasterization");
electron.app.commandLine.appendSwitch("enable-zero-copy");
electron.app.commandLine.appendSwitch("ignore-gpu-blocklist");
electron.app.commandLine.appendSwitch("enable-unsafe-webgpu");
electron.app.commandLine.appendSwitch("disable-features", "UseChromeOSDirectVideoDecoder");
electron.app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,CanvasOopRasterization");
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path.join(__dirname, "../public");
let win;
let exportProcess = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  const iconPath = path.join(process.env.VITE_PUBLIC, "icon.jpg");
  if (process.platform === "darwin") {
    electron.app.dock.setIcon(iconPath);
  }
  win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      webviewTag: true
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
  electron.ipcMain.handle("convert-video", async (event, filePath) => {
    return new Promise((resolve, reject) => {
      const fileName = path.basename(filePath, path.extname(filePath)) + "_proxy.mp4";
      const outputPath = path.join(os.tmpdir(), `uxfilm_${fileName}`);
      console.log(`[Main] Request to convert: ${filePath}`);
      if (fs.existsSync(outputPath)) {
        console.log("[Main] Using cached proxy.");
        resolve(outputPath);
        return;
      }
      ffmpeg(filePath).outputOptions([
        "-c:v libx264",
        "-preset ultrafast",
        "-crf 23",
        "-g 30",
        "-vf scale=-2:720",
        "-an",
        "-movflags faststart",
        "-pix_fmt yuv420p"
      ]).save(outputPath).on("end", () => {
        console.log("[Main] Conversion complete:", outputPath);
        resolve(outputPath);
      }).on("error", (err) => {
        console.error("[Main] Conversion failed:", err);
        reject(err);
      });
    });
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
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-r",
      fps.toString(),
      "-i",
      "-",
      ...audioPath ? ["-i", audioPath] : [],
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      ...audioPath ? ["-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0"] : [],
      "-shortest",
      filePath
    ];
    try {
      if (!ffmpegPath) throw new Error("FFmpeg binary not found");
      console.log(`[Main] Spawning export process with: ${ffmpegPath}`);
      exportProcess = node_child_process.spawn(ffmpegPath, args);
      (_a = exportProcess.stderr) == null ? void 0 : _a.on("data", (data) => {
        console.log(`FFmpeg Export: ${data}`);
      });
      exportProcess.on("close", (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        event.sender.send("export-complete", code === 0);
        exportProcess = null;
        if (audioPath && fs.existsSync(audioPath)) {
          try {
            fs.unlinkSync(audioPath);
          } catch {
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
    if (!exportProcess || !exportProcess.stdin) return false;
    try {
      const data = base64Data.replace(/^data:image\/jpeg;base64,/, "");
      const buffer = Buffer.from(data, "base64");
      exportProcess.stdin.write(buffer);
      return true;
    } catch (error) {
      console.error("Error writing frame:", error);
      return false;
    }
  });
  electron.ipcMain.handle("end-export", async () => {
    if (exportProcess && exportProcess.stdin) {
      exportProcess.stdin.end();
    }
    return true;
  });
});
