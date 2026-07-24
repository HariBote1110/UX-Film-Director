export const rustVideoEncodeIpcChannels = {
  start: 'rust-backend-encode-start',
  writeFrame: 'rust-backend-encode-write-frame',
  writeNativeFrame: 'rust-backend-encode-write-native-frame',
  writeResidentSceneFrame: 'rust-backend-encode-write-resident-scene-frame',
  transcodeVideo: 'rust-backend-encode-transcode-video',
  transcodeVideoProgress: 'rust-backend-encode-transcode-video-progress',
  finish: 'rust-backend-encode-finish',
  abort: 'rust-backend-encode-abort',
} as const;

export type RustVideoEncodeIpcChannel =
  typeof rustVideoEncodeIpcChannels[keyof typeof rustVideoEncodeIpcChannels];
