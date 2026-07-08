export interface ResolveSharedRendererNativeReuseReplayTimeInput {
  requestedTime: number;
  pendingTime: number;
  previewFps: number;
  /**
   * 前進方向の遅延がこのフレーム数を超えたら、1フレームずつのクランプを
   * 解除して pendingTime へ一気に追いつく（既定 6 フレーム）。
   * decode+present が毎 tick を超え続ける native reuse 経路では、クランプを
   * 維持し続けると Canvas がヘッドから単調に遅れ続け、追いつく機構が無くなる
   * ため。後方シーク（pendingTime < requestedTime）はもともとクランプの
   * 対象外（Math.min が pendingTime をそのまま通す）なので、この閾値は
   * 後方シークストーム抑止の挙動には影響しない。
   */
  catchUpFrameThreshold?: number;
}

const DEFAULT_NATIVE_REUSE_CADENCE_CATCH_UP_FRAME_THRESHOLD = 6;

export const resolveSharedRendererNativeReuseReplayTime = ({
  requestedTime,
  pendingTime,
  previewFps,
  catchUpFrameThreshold = DEFAULT_NATIVE_REUSE_CADENCE_CATCH_UP_FRAME_THRESHOLD,
}: ResolveSharedRendererNativeReuseReplayTimeInput): number => {
  if (!Number.isFinite(pendingTime)) return requestedTime;
  if (!Number.isFinite(requestedTime)) return pendingTime;
  const safePreviewFps = Number.isFinite(previewFps) && previewFps > 0 ? previewFps : 60;
  const safeCatchUpFrameThreshold = Number.isFinite(catchUpFrameThreshold) && catchUpFrameThreshold > 0
    ? catchUpFrameThreshold
    : DEFAULT_NATIVE_REUSE_CADENCE_CATCH_UP_FRAME_THRESHOLD;
  const catchUpThresholdSeconds = safeCatchUpFrameThreshold / safePreviewFps;
  if (pendingTime - requestedTime > catchUpThresholdSeconds) {
    return pendingTime;
  }
  const maxReplayTime = requestedTime + (1 / safePreviewFps);
  return Math.min(pendingTime, maxReplayTime);
};
