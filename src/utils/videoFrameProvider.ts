/**
 * VideoDecoder ベースのフレームプロバイダ
 *
 * エクスポート時に HTMLVideoElement.currentTime シークを排除し、
 * VideoDecoder によるシークなし逐次デコードでフレームを供給する。
 *
 * - 順方向クリップのみ対応（逆再生は useProjectExport 側でシーク方式にフォールバック）
 * - 内部で小さなリングバッファを維持し、連続するフレーム要求に対して O(1) で返す
 */

import { decodeVideoStream } from './videoDecodeStream';
import type { FrameProvider } from './frameProvider';

interface BufferedFrame {
  timestampUs: number;
  bitmap: ImageBitmap;
}

const BUFFER_AHEAD = 6; // 先読みフレーム数

export class VideoFrameProvider implements FrameProvider {
  private buffer: BufferedFrame[] = [];
  private generator: ReturnType<typeof decodeVideoStream> | null = null;
  private generatorDone = false;
  private filling = false;

  /** ファイル URL と対象区間を渡して初期化する */
  constructor(
    private readonly fileUrl: string,
    private readonly startSec: number,
    private readonly endSec: number,
  ) {}

  /** 最初のフレームをデコードして準備完了にする（省略可能・呼ばなくても getFrame で自動初期化） */
  async init(): Promise<void> {
    this.ensureGenerator();
    await this.fillBuffer();
  }

  /**
   * 指定ローカル時刻（μs）に最も近い ImageBitmap を返す。
   * 呼び出しは常に単調増加の timestampUs を前提とする。
   */
  async getFrame(localUs: number): Promise<ImageBitmap | null> {
    this.ensureGenerator();

    // バッファに必要なフレームが揃うまで先読み
    while (!this.generatorDone) {
      const last = this.buffer[this.buffer.length - 1];
      if (last && last.timestampUs >= localUs) break;
      const fetched = await this.fetchNext();
      if (!fetched) break;
    }

    if (this.buffer.length === 0) return null;

    // localUs 以下で最大のタイムスタンプを持つフレームを選択
    let bestIdx = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].timestampUs <= localUs) {
        bestIdx = i;
      } else {
        break;
      }
    }

    // bestIdx より前の古いフレームを解放
    for (let i = 0; i < bestIdx; i++) {
      this.buffer[i].bitmap.close();
    }
    this.buffer = this.buffer.slice(bestIdx);

    return this.buffer[0]?.bitmap ?? null;
  }

  /** 全リソースを解放する */
  close(): void {
    for (const entry of this.buffer) entry.bitmap.close();
    this.buffer = [];
    this.generator?.return?.(undefined as any);
    this.generator = null;
    this.generatorDone = true;
  }

  private ensureGenerator(): void {
    if (this.generator) return;
    this.generator = decodeVideoStream(this.fileUrl, {
      startSec: this.startSec,
      endSec: this.endSec,
    });
    this.generatorDone = false;
  }

  private async fetchNext(): Promise<boolean> {
    if (this.generatorDone || !this.generator) return false;
    const { value, done } = await this.generator.next();
    if (done) {
      this.generatorDone = true;
      return false;
    }
    const bitmap = await createImageBitmap(value.frame);
    value.frame.close();
    this.buffer.push({ timestampUs: value.timestampUs, bitmap });
    return true;
  }

  private async fillBuffer(): Promise<void> {
    if (this.filling) return;
    this.filling = true;
    while (this.buffer.length < BUFFER_AHEAD && !this.generatorDone) {
      await this.fetchNext();
    }
    this.filling = false;
  }
}
