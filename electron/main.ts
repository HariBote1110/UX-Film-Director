import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

// ディレクトリ設定
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
// FFmpegプロセスの参照を保持
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
      webSecurity: false, // ローカル画像の読み込み許可 (Dev用)
    },
    titleBarStyle: 'hiddenInset',
  })

  // 開発ツールを開く (デバッグ用: 必要に応じてコメントアウト)
  // win.webContents.openDevTools()

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

  // 1. 音声ファイルの一時保存 (Web Audio APIでレンダリングしたWAVを保存)
  ipcMain.handle('save-temp-audio', async (event, buffer: ArrayBuffer) => {
    try {
      const tempPath = path.join(os.tmpdir(), `uxfilm_audio_${Date.now()}.wav`);
      // ArrayBufferをBufferに変換して書き込み
      fs.writeFileSync(tempPath, Buffer.from(buffer));
      return { success: true, path: tempPath };
    } catch (e) {
      console.error('Failed to save temp audio:', e);
      return { success: false, error: String(e) };
    }
  });

  // 2. エンコード開始 (FFmpeg起動)
  ipcMain.handle('start-export', async (event, { width, height, fps, audioPath }) => {
    // 保存先を選択
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: 'output.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (!filePath) return { success: false, reason: 'cancelled' };

    // FFmpeg引数構築
    const args = [
      '-y', // 上書き許可

      // --- Input 0: Video Pipe (標準入力から画像を受け取る) ---
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg', // 送られてくる画像はJPEG
      '-r', fps.toString(),
      '-i', '-', 
      
      // --- Input 1: Audio File (もしあれば) ---
      ...(audioPath ? ['-i', audioPath] : []),
      
      // --- Video Encoding Settings ---
      '-c:v', 'h264_videotoolbox', // Apple Silicon Hardware Encoder
      '-b:v', '8000k', // ビットレート (高画質)
      '-pix_fmt', 'yuv420p', // 互換性確保
      
      // --- Audio Encoding Settings (もしあれば) ---
      // 映像(0:v:0)と音声(1:a:0)をマッピング
      ...(audioPath ? ['-c:a', 'aac', '-b:a', '192k', '-map', '0:v:0', '-map', '1:a:0'] : []),
      
      // 一番短いストリームに合わせて終了 (映像が終わったら音声も切る)
      '-shortest',
      
      // Output Path
      filePath
    ];

    // FFmpegパス
    // Mac (Homebrew / Apple Silicon) の標準パス。
    // 環境によっては 'ffmpeg' だけで通る場合やパスが異なる場合があるので注意。
    const ffmpegPath = '/opt/homebrew/bin/ffmpeg'; 

    try {
      // プロセス起動
      // ffmpegPathで見つからない場合は 'ffmpeg' を試すフォールバックを入れても良いですが、今回は指定パスで実行
      ffmpegProcess = spawn(ffmpegPath, args);
      
      // ログ出力
      ffmpegProcess.stderr?.on('data', (data) => {
        console.log(`FFmpeg: ${data}`); 
      });

      ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        event.sender.send('export-complete', code === 0);
        ffmpegProcess = null;

        // 一時オーディオファイルの削除 (クリーンアップ)
        if (audioPath && fs.existsSync(audioPath)) {
          try {
            fs.unlinkSync(audioPath);
            console.log('Temp audio deleted:', audioPath);
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

  // 3. フレームデータの書き込み
  ipcMain.handle('write-frame', async (event, base64Data: string) => {
    if (!ffmpegProcess || !ffmpegProcess.stdin) return false;

    try {
      // Base64 (data:image/jpeg;base64,...) からバッファを作成
      const data = base64Data.replace(/^data:image\/jpeg;base64,/, '');
      const buffer = Buffer.from(data, 'base64');

      // FFmpegのstdinに書き込み
      // writeはバッファがいっぱいの時 false を返すが、今回は簡易的に待たずに進める
      ffmpegProcess.stdin.write(buffer);
      return true;
    } catch (error) {
      console.error('Error writing frame:', error);
      return false;
    }
  });

  // 4. エンコード終了 (ストリームを閉じる)
  ipcMain.handle('end-export', async () => {
    if (ffmpegProcess && ffmpegProcess.stdin) {
      ffmpegProcess.stdin.end(); // EOFを送信してエンコード完了を指示
    }
    return true;
  });
})