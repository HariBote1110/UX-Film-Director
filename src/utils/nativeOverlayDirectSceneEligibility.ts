import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import { isNativeOverlayDirectMediaSourceSupported } from './nativeOverlayDirectMediaSupport';

const isAudioReactiveMediaKind = (kind: string): boolean =>
  kind === 'GeneratedAudioWaveform' || kind === 'GeneratedAudioSphere';

export const isNativeOverlayDirectSceneSession = (
  session: SharedRendererPreviewSession
): boolean => {
  if (!session.surfaceGate.ok || session.surfaceGate.snapshot.clips.length === 0) {
    return false;
  }

  const mediaById = new Map(
    session.surfaceGate.media.map((reference) => [reference.id, reference])
  );
  let visibleVideoClipCount = 0;
  let hasVisibleAudioReactiveClip = false;
  for (const clip of session.surfaceGate.snapshot.clips) {
    const reference = mediaById.get(clip.media_id);
    if (
      !reference
      || !isNativeOverlayDirectMediaSourceSupported(reference.kind, reference.source)
    ) {
      return false;
    }
    if (reference.kind === 'Video') {
      visibleVideoClipCount += 1;
      if (visibleVideoClipCount > 1) return false;
    }
    if (isAudioReactiveMediaKind(reference.kind)) {
      hasVisibleAudioReactiveClip = true;
    }
  }

  // Renderer側の動画経路はdecode済み1枚をpresentSharedFrameへ注入する方式で、
  // addonのresident PCM descriptorを組み立てない。音声生成物のdirect sceneは
  // 動画を含まないpresentScene経路に限定する。
  return visibleVideoClipCount === 0 || !hasVisibleAudioReactiveClip;
};
