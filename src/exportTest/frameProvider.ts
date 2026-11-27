/**
 * エクスポート用フレーム供給インターフェース。
 *
 * `VideoFrameProvider`（VideoDecoder 経路）と `PlaybackFrameProvider`
 * （HTMLVideoElement 逐次再生経路）の双方が実装する。export test harness は
 * 比較・診断用途に限ってこのインターフェースに対してフレームを要求する。
 */
export interface FrameProvider {
  /** 指定ローカル時刻（μs・単調増加前提）に最も近いフレームの ImageBitmap を返す。 */
  getFrame(localUs: number): Promise<ImageBitmap | null>;
  /** リソースを解放する。 */
  close(): void;
}
