import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) => (
  readFileSync(new URL(name, import.meta.url), 'utf8')
);

describe('Timeline playback render isolation boundary', () => {
  it('keeps currentTime out of the full Timeline store subscription', () => {
    const timeline = readSource('./Timeline.tsx');

    expect(timeline).not.toContain('currentTime: state.currentTime');
    expect(timeline).toContain('useStore.getState().currentTime');
  });

  it('subscribes to currentTime only inside the lightweight playhead component, without a React re-render selector', () => {
    const timeline = readSource('./Timeline.tsx');
    const playhead = readSource('./TimelineCurrentTimeIndicator.tsx');

    // 再生ヘッドはReactの再レンダー/コミットを経由せず、store.subscribeで
    // 直接DOMのtransformを更新する（毎フレームのReactコミットとレイアウトを
    // 構造的に取り除くため）。
    expect(playhead).not.toContain('useStore((state) => state.currentTime)');
    expect(playhead).toContain('useStore.subscribe');
    expect(playhead).toContain('.style.transform');
    expect(timeline.match(/<TimelineCurrentTimeIndicator/g)).toHaveLength(2);
  });
});
