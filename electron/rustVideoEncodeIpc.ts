export const rustVideoEncodeIpcChannels = {
  start: 'rust-backend-encode-start',
  writeFrame: 'rust-backend-encode-write-frame',
  finish: 'rust-backend-encode-finish',
  abort: 'rust-backend-encode-abort',
} as const;

export type RustVideoEncodeIpcChannel =
  typeof rustVideoEncodeIpcChannels[keyof typeof rustVideoEncodeIpcChannels];
