import { describe, expect, it } from 'vitest';
import {
  shouldBuildSharedRendererPreviewSessionForTick,
  shouldPublishSharedRendererPreviewSession,
  shouldReplaySharedRendererNativeReusePending,
} from './Viewport';

describe('shouldBuildSharedRendererPreviewSessionForTick', () => {
  it('Rust常駐scene RPCが有効な間はChromium側の毎tick scene構築を止める', () => {
    expect(shouldBuildSharedRendererPreviewSessionForTick(true)).toBe(false);
  });

  it('RPC flagの状態にかかわらずTS scene構築を行わない', () => {
    expect(shouldBuildSharedRendererPreviewSessionForTick(false)).toBe(false);
  });
});

describe('shouldPublishSharedRendererPreviewSession', () => {
  it('RPC有効時はRust評価済みsessionだけをpublishする', () => {
    expect(shouldPublishSharedRendererPreviewSession(true, false)).toBe(false);
    expect(shouldPublishSharedRendererPreviewSession(true, true)).toBe(true);
  });

  it('RPC flagの状態にかかわらず評価sessionがなければpublishしない', () => {
    expect(shouldPublishSharedRendererPreviewSession(false, false)).toBe(false);
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
