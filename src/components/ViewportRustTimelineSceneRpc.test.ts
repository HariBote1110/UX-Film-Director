import { describe, expect, it } from 'vitest';
import {
  shouldBuildSharedRendererPreviewSessionForTick,
  shouldReplaySharedRendererNativeReusePending,
} from './Viewport';

describe('shouldBuildSharedRendererPreviewSessionForTick', () => {
  it('Rust常駐scene RPCが有効な間はChromium側の毎tick scene構築を止める', () => {
    expect(shouldBuildSharedRendererPreviewSessionForTick(true)).toBe(false);
  });

  it('feature flagが無効なら従来の同期scene構築を維持する', () => {
    expect(shouldBuildSharedRendererPreviewSessionForTick(false)).toBe(true);
  });
});

describe('shouldReplaySharedRendererNativeReusePending', () => {
  it('Rust常駐scene RPC中は評価済みsessionなしのpending replayを捨てる', () => {
    expect(shouldReplaySharedRendererNativeReusePending(true)).toBe(false);
  });

  it('従来経路ではpending replayを維持する', () => {
    expect(shouldReplaySharedRendererNativeReusePending(false)).toBe(true);
  });
});
