/** Formats seconds as an HH:MM:SS:FF timecode string (Phase 5). */
export const formatRemoteDeckTimecode = (timeSeconds: number, fps: number): string => {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 60;
  const safeTime = Number.isFinite(timeSeconds) && timeSeconds > 0 ? timeSeconds : 0;

  const totalFrames = Math.floor(safeTime * safeFps);
  const frames = totalFrames % Math.round(safeFps);
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
};
