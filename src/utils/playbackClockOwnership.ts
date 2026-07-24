export const shouldRunRendererPlaybackClock = ({
  isPlaying,
  nativePlaybackActive,
}: {
  isPlaying: boolean;
  nativePlaybackActive: boolean;
}): boolean => isPlaying && !nativePlaybackActive;
