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

  it('subscribes to currentTime only inside the lightweight playhead component', () => {
    const timeline = readSource('./Timeline.tsx');
    const playhead = readSource('./TimelineCurrentTimeIndicator.tsx');

    expect(playhead).toContain('useStore((state) => state.currentTime)');
    expect(timeline.match(/<TimelineCurrentTimeIndicator/g)).toHaveLength(2);
  });
});
