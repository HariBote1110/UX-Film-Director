/**
 * HTMLVideoElement の逐次再生 + requestVideoFrameCallback によるフレームプロバイダ
 *
 * `currentTime` シーク（1フレーム 100ms と遅い）を排除し、動画を「シークせず再生」
 * しながら requestVideoFrameCallback で提示フレームを受け取る。OS のデコーダを使う
 * ため、VideoDecoder/MP4Box が扱えないコーデック（特に一部 HEVC）でも動作する。
 *
 * - 順方向クリップのみ対応（逆再生は useProjectExport 側でシーク方式へ）
 * - `playbackRate` を上げて等倍より高速にフレームを取り出す
 * - 小さなリングバッファを維持し、満杯時は再生を一時停止して背圧をかける
 */

import type { FrameProvider } from './frameProvider';

interface BufferedFrame {
  mediaTimeUs: number;
  bitmap: ImageBitmap;
}

interface PlaybackFrameProviderOptions {
  /** 再生速度（等倍=1）。高いほど速いがフレーム落ちのリスク。既定 2（98% カバレッジ計測値）。 */
  playbackRate?: number;
  /** バッファ上限（これを超えると一時停止して背圧）。既定 8。 */
  maxBuffer?: number;
}

export class PlaybackFrameProvider implements FrameProvider {
  private video: HTMLVideoElement | null = null;
  private buffer: BufferedFrame[] = [];
  private ended = false;
  private rvfcHandle = 0;
  private notifyWaiter: (() => void) | null = null;
  private readonly playbackRate: number;
  private readonly maxBuffer: number;

  constructor(
    private readonly url: string,
    private readonly startSec: number,
    private readonly endSec: number,
    opts: PlaybackFrameProviderOptions = {},
  ) {
    this.playbackRate = opts.playbackRate ?? 2;
    this.maxBuffer = opts.maxBuffer ?? 8;
  }

  /** 動画を読み込み、開始位置へ 1 度だけシークしてから再生を開始する。 */
  async init(): Promise<void> {
    const v = document.createElement('video');
    v.src = this.url;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    this.video = v;

    // requestVideoFrameCallback 非対応環境は本プロバイダ不可。
    if (typeof (v as unknown as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback !== 'function') {
      throw new Error('PlaybackFrameProvider: requestVideoFrameCallback 非対応');
    }

    await new Promise<void>((resolve, reject) => {
      const onErr = () => reject(new Error('PlaybackFrameProvider: 動画読み込み失敗'));
      v.addEventListener('error', onErr, { once: true });
      v.addEventListener('loadedmetadata', () => resolve(), { once: true });
      v.load();
    });

    // 開始位置（offset）へ 1 回だけシーク（毎フレームではないので許容コスト）。
    if (this.startSec > 0.001) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(); };
        v.addEventListener('seeked', onSeeked);
        v.currentTime = this.startSec;
        setTimeout(() => { v.removeEventListener('seeked', onSeeked); resolve(); }, 2000);
      });
    }

    v.addEventListener('ended', () => { this.ended = true; this.wake(); });
    v.playbackRate = this.playbackRate;

    this.registerRvfc();
    await v.play().catch((e) => { throw new Error(`PlaybackFrameProvider: play 失敗 ${e instanceof Error ? e.message : String(e)}`); });
  }

  private wake(): void {
    if (this.notifyWaiter) { const w = this.notifyWaiter; this.notifyWaiter = null; w(); }
  }

  private registerRvfc(): void {
    const v = this.video;
    if (!v) return;
    const rvfc = (v as unknown as { requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime?: number }) => void) => number }).requestVideoFrameCallback.bind(v);

    const onFrame = (_now: number, meta: { mediaTime?: number }) => {
      const cur = this.video;
      if (!cur) return;
      const mediaTimeUs = Math.round((meta.mediaTime ?? cur.currentTime) * 1_000_000);

      // endSec を超えたら終了（長尺クリップを最後まで再生しない）。
      if (mediaTimeUs > (this.endSec + 1) * 1_000_000) {
        this.ended = true;
        this.wake();
        return;
      }

      // 提示中フレームを同期スナップショット（VideoFrame）→ 非同期で ImageBitmap 化。
      try {
        const vf = new VideoFrame(cur, { timestamp: mediaTimeUs } as VideoFrameInit);
        createImageBitmap(vf)
          .then((bmp) => {
            vf.close();
            this.buffer.push({ mediaTimeUs, bitmap: bmp });
            this.buffer.sort((a, b) => a.mediaTimeUs - b.mediaTimeUs);
            this.wake();
            this.applyBackpressure();
          })
          .catch(() => { try { vf.close(); } catch { /* ignore */ } });
      } catch { /* このフレームは捨てる */ }

      // 次フレームを登録（再生中のみ発火する）。
      this.rvfcHandle = rvfc(onFrame);
    };

    this.rvfcHandle = rvfc(onFrame);
  }

  private applyBackpressure(): void {
    const v = this.video;
    if (v && !v.paused && this.buffer.length >= this.maxBuffer) {
      v.pause();
    }
  }

  private resumeIfNeeded(): void {
    const v = this.video;
    if (v && v.paused && !this.ended && this.buffer.length < Math.max(1, this.maxBuffer >> 1)) {
      v.play().catch(() => { /* ignore */ });
    }
  }

  async getFrame(localUs: number): Promise<ImageBitmap | null> {
    // バッファに localUs 以上のフレームが来るまで待つ（再生で充填される）。
    while (!this.ended) {
      const last = this.buffer[this.buffer.length - 1];
      if (last && last.mediaTimeUs >= localUs) break;
      this.resumeIfNeeded();
      await new Promise<void>((resolve) => {
        this.notifyWaiter = resolve;
        // デコード停滞時のデッドロック回避。
        setTimeout(resolve, 3000);
      });
      this.notifyWaiter = null;
    }

    if (this.buffer.length === 0) return null;

    // localUs 以下で最大のタイムスタンプを選択し、それ以前を解放。
    let bestIdx = 0;
    for (let i = 0; i < this.buffer.length; i += 1) {
      if (this.buffer[i].mediaTimeUs <= localUs) bestIdx = i;
      else break;
    }
    for (let i = 0; i < bestIdx; i += 1) this.buffer[i].bitmap.close();
    this.buffer = this.buffer.slice(bestIdx);

    this.resumeIfNeeded();
    return this.buffer[0]?.bitmap ?? null;
  }

  close(): void {
    const v = this.video;
    if (v) {
      try {
        if (typeof (v as unknown as { cancelVideoFrameCallback?: (h: number) => void }).cancelVideoFrameCallback === 'function' && this.rvfcHandle) {
          (v as unknown as { cancelVideoFrameCallback: (h: number) => void }).cancelVideoFrameCallback(this.rvfcHandle);
        }
      } catch { /* ignore */ }
      try { v.pause(); } catch { /* ignore */ }
      v.removeAttribute('src');
      try { v.load(); } catch { /* ignore */ }
    }
    for (const f of this.buffer) f.bitmap.close();
    this.buffer = [];
    this.video = null;
    this.ended = true;
    this.wake();
  }
}
