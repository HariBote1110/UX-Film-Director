import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
let ffmpegProcess: ChildProcess | null = null;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
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

  // --- IPC Handlers ---

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
      '-c:v', 'h264_videotoolbox', 
      '-b:v', '8000k',
      '-pix_fmt', 'yuv420p',
      ...(audioPath ? ['-c:a', 'aac', '-b:a', '192k', '-map', '0:v:0', '-map', '1:a:0'] : []),
      '-shortest',
      filePath
    ];

    const ffmpegPath = '/opt/homebrew/bin/ffmpeg'; 

    try {
      ffmpegProcess = spawn(ffmpegPath, args);
      
      ffmpegProcess.stderr?.on('data', (data) => {
        console.log(`FFmpeg: ${data}`); 
      });

      ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        event.sender.send('export-complete', code === 0);
        ffmpegProcess = null;

        if (audioPath && fs.existsSync(audioPath)) {
          try {
            fs.unlinkSync(audioPath);
          } catch (err) {
            console.error('Failed to delete temp audio:', err);
          }
        }
      });

      return { success: true, filePath };
    } catch (e) {
      console.error('Failed to spawn ffmpeg', e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('write-frame', async (event, base64Data: string) => {
    if (!ffmpegProcess || !ffmpegProcess.stdin) return false;
    try {
      const data = base64Data.replace(/^data:image\/jpeg;base64,/, '');
      const buffer = Buffer.from(data, 'base64');
      ffmpegProcess.stdin.write(buffer);
      return true;
    } catch (error) {
      console.error('Error writing frame:', error);
      return false;
    }
  });

  ipcMain.handle('end-export', async () => {
    if (ffmpegProcess && ffmpegProcess.stdin) {
      ffmpegProcess.stdin.end();
    }
    return true;
  });
})