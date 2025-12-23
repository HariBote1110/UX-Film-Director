import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import ffmpeg from 'fluent-ffmpeg'
// requireを使って読み込むことで、TypeScriptのimport周りのトラブルを回避
const ffmpegStatic = require('ffmpeg-static');

// FFmpegのパス設定とログ出力
let ffmpegPath = ffmpegStatic;
if (ffmpegPath) {
    // asarパッケージ化されている場合、unpackedなパスに書き換える
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`[Main] FFmpeg Path set to: ${ffmpegPath}`);
} else {
    console.error('[Main] FFmpeg binary not found!');
}

// ... (以下、GPU設定などは以前のコードを維持) ...
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization'); 

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
let exportProcess: ChildProcess | null = null;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.jpg')
  if (process.platform === 'darwin') {
    app.dock.setIcon(iconPath)
  }

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, 
      webviewTag: true,
    },
    titleBarStyle: 'hiddenInset',
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
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

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('convert-video', async (event, filePath: string) => {
    return new Promise((resolve, reject) => {
      const fileName = path.basename(filePath, path.extname(filePath)) + '_proxy.mp4';
      const outputPath = path.join(os.tmpdir(), `uxfilm_${fileName}`);

      console.log(`[Main] Request to convert: ${filePath}`);

      if (fs.existsSync(outputPath)) {
        console.log('[Main] Using cached proxy.');
        resolve(outputPath);
        return;
      }

      ffmpeg(filePath)
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
          '-g 30',
          '-vf scale=-2:720',
          '-an',
          '-movflags faststart',
          '-pix_fmt yuv420p'
        ])
        .save(outputPath)
        .on('end', () => {
          console.log('[Main] Conversion complete:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[Main] Conversion failed:', err);
          reject(err);
        });
    });
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

  ipcMain.handle('start-export', async (event, { width, height, fps, audioPath }) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: 'output.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (!filePath) return { success: false, reason: 'cancelled' };

    const args = [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-r', fps.toString(),
      '-i', '-', 
      ...(audioPath ? ['-i', audioPath] : []),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      ...(audioPath ? ['-c:a', 'aac', '-b:a', '192k', '-map', '0:v:0', '-map', '1:a:0'] : []),
      '-shortest',
      filePath
    ];

    try {
      if(!ffmpegPath) throw new Error("FFmpeg binary not found");
      
      console.log(`[Main] Spawning export process with: ${ffmpegPath}`);
      exportProcess = spawn(ffmpegPath, args); // ここも修正
      
      exportProcess.stderr?.on('data', (data) => {
        console.log(`FFmpeg Export: ${data}`); 
      });

      exportProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        event.sender.send('export-complete', code === 0);
        exportProcess = null;

        if (audioPath && fs.existsSync(audioPath)) {
          try { fs.unlinkSync(audioPath); } catch {}
        }
      });

      return { success: true, filePath };
    } catch (e) {
      console.error('Failed to spawn ffmpeg', e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('write-frame', async (event, base64Data: string) => {
    if (!exportProcess || !exportProcess.stdin) return false;
    try {
      const data = base64Data.replace(/^data:image\/jpeg;base64,/, '');
      const buffer = Buffer.from(data, 'base64');
      exportProcess.stdin.write(buffer);
      return true;
    } catch (error) {
      console.error('Error writing frame:', error);
      return false;
    }
  });

  ipcMain.handle('end-export', async () => {
    if (exportProcess && exportProcess.stdin) {
      exportProcess.stdin.end();
    }
    return true;
  });
})