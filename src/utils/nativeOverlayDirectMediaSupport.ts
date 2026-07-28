/**
 * Native Overlay addonがscene payloadだけからsourceを構築できるmediaかを判定する。
 * セッション全体の制約（動画本数やrenderer側decoded-frame注入との組合せ）は
 * 呼び出し側で別途判定する。
 */
export const isNativeOverlayDirectMediaSourceSupported = (
  kind: string,
  source: string
): boolean => {
  if (kind === 'Psd') return false;
  if (kind === 'Image') {
    return /\.png(?:[?#].*)?$/i.test(source);
  }
  return true;
};
