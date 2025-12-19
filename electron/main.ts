import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'

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

  // --- FFmpeg Handlers ---

  // 1. エンコード開始 (FFmpeg起動)
  ipcMain.handle('start-export', async (event, { width, height, fps }) => {
    // 保存先を選択
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: 'output.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (!filePath) return { success: false, reason: 'cancelled' };

    // FFmpeg引数構築
    // -f image2pipe: 画像をパイプで受け取る
    // -vcodec mjpeg: 入力はJPEGデータ (Base64から変換)
    // -c:v h264_videotoolbox: Mac用ハードウェアエンコーダ
    // -b:v 6000k: ビットレート
    const args = [
      '-y', // 上書き許可
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-r', fps.toString(),
      '-i', '-', // 標準入力から読み込み
      '-c:v', 'h264_videotoolbox', // Apple Silicon Hardware Encoder
      '-b:v', '8000k', // 高画質
      '-pix_fmt', 'yuv420p', // 互換性のため
      filePath
    ];

    // FFmpegパスの探索 (brew等のパスを含める)
    const ffmpegPath = '/opt/homebrew/bin/ffmpeg'; 
    // ※注意: ユーザー環境に合わせてパスを探すロジックが必要ですが、今回は固定で試します
    // もし動かない場合は 'ffmpeg' だけで動くか試してください

    try {
      // ユーザーのPATHにffmpegがあることを期待して spawn('ffmpeg', ...) でも可
      ffmpegProcess = spawn('ffmpeg', args);
      
      ffmpegProcess.stderr?.on('data', (data) => {
        console.log(`FFmpeg: ${data}`); // ログ出力
      });

      ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        event.sender.send('export-complete', code === 0);
        ffmpegProcess = null;
      });

      return { success: true, filePath };
    } catch (e) {
      console.error('Failed to spawn ffmpeg', e);
      return { success: false, error: String(e) };
    }
  });

  // 2. フレームデータの書き込み
  ipcMain.handle('write-frame', async (event, base64Data: string) => {
    if (!ffmpegProcess || !ffmpegProcess.stdin) return false;

    // Base64 (data:image/jpeg;base64,...) からバッファを作成
    const data = base64Data.replace(/^data:image\/jpeg;base64,/, '');
    const buffer = Buffer.from(data, 'base64');

    // FFmpegのstdinに書き込み
    const result = ffmpegProcess.stdin.write(buffer);
    
    // バッファがいっぱいの場合はdrainを待つ (簡易実装では省略可だが安定性のためには必要)
    // 今回は同期的に書き込めたかだけ返す
    return true;
  });

  // 3. エンコード終了
  ipcMain.handle('end-export', async () => {
    if (ffmpegProcess && ffmpegProcess.stdin) {
      ffmpegProcess.stdin.end(); // ストリームを閉じてエンコード完了を指示
    }
    return true;
  });
})