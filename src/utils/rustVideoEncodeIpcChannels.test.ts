import { describe, expect, it } from 'vitest';
import { rustVideoEncodeIpcChannels } from '../../electron/rustVideoEncodeIpc';

describe('rustVideoEncodeIpcChannels', () => {
  it('uses dedicated Rust video encode IPC channels distinct from the legacy base64 export API', () => {
    expect(rustVideoEncodeIpcChannels).toEqual({
      start: 'rust-backend-encode-start',
      writeFrame: 'rust-backend-encode-write-frame',
      writeNativeFrame: 'rust-backend-encode-write-native-frame',
      transcodeVideo: 'rust-backend-encode-transcode-video',
      transcodeVideoProgress: 'rust-backend-encode-transcode-video-progress',
      finish: 'rust-backend-encode-finish',
      abort: 'rust-backend-encode-abort',
    });
    expect(Object.values(rustVideoEncodeIpcChannels)).not.toContain('start-export');
    expect(Object.values(rustVideoEncodeIpcChannels)).not.toContain('write-frame');
    expect(Object.values(rustVideoEncodeIpcChannels)).not.toContain('end-export');
  });
});
