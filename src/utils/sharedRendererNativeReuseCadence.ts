export interface ResolveSharedRendererNativeReuseReplayTimeInput {
  requestedTime: number;
  pendingTime: number;
  previewFps: number;
}

export const resolveSharedRendererNativeReuseReplayTime = ({
  requestedTime,
  pendingTime,
  previewFps,
}: ResolveSharedRendererNativeReuseReplayTimeInput): number => {
  if (!Number.isFinite(pendingTime)) return requestedTime;
  if (!Number.isFinite(requestedTime)) return pendingTime;
  const safePreviewFps = Number.isFinite(previewFps) && previewFps > 0 ? previewFps : 60;
  const maxReplayTime = requestedTime + (1 / safePreviewFps);
  return Math.min(pendingTime, maxReplayTime);
};
