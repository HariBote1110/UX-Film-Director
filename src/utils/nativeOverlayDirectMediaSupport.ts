import { isSharedRendererNativeMediaSourceSupported } from './sharedRendererNativeMediaSupport';

/**
 * Native Overlay addonがscene payloadだけからsourceを構築できるmediaかを判定する。
 * セッション全体の制約（動画本数やrenderer側decoded-frame注入との組合せ）は
 * 呼び出し側で別途判定する。
 */
export const isNativeOverlayDirectMediaSourceSupported = (
  kind: string,
  source: string
): boolean => {
  if (kind === 'Video') return true;
  if (kind === 'Image') {
    return isSharedRendererNativeMediaSourceSupported(kind, source)
      && /\.(?:png|jpe?g)(?:[?#].*)?$/i.test(source);
  }
  return isSharedRendererNativeMediaSourceSupported(kind, source);
};
