import type { VideoObject } from '../types';

/** Electron でローカルファイルとして追跡可能な絶対パスを返す（無ければ null）。 */
export const resolveVideoFsPath = (video: VideoObject): string | null => {
  const fp = video.filePath?.trim();
  if (fp) return fp;
  const src = video.src;
  if (typeof src !== 'string' || !src.startsWith('file:')) return null;
  try {
    const url = new URL(src);
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
};
