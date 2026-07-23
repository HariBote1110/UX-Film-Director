import { describe, expect, it } from 'vitest';
import { shouldBuildSharedRendererPreviewSessionForTick } from './Viewport';

describe('shouldBuildSharedRendererPreviewSessionForTick', () => {
  it('Rust常駐scene RPCが有効な間はChromium側の毎tick scene構築を止める', () => {
    expect(shouldBuildSharedRendererPreviewSessionForTick(true)).toBe(false);
  });

  it('feature flagが無効なら従来の同期scene構築を維持する', () => {
    expect(shouldBuildSharedRendererPreviewSessionForTick(false)).toBe(true);
  });
});
