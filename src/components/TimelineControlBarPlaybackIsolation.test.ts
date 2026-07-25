import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) => (
  readFileSync(new URL(name, import.meta.url), 'utf8')
);

describe('TimelineControlBar playback render isolation boundary', () => {
  // TimelineControlBarのshallowセレクタにcurrentTimeを含めると、毎フレーム
  // 浅い等価判定に失敗し、再生ボタン等の周辺UI全体が再レンダーされてしまう。
  // 時刻表示専用の小コンポーネントへ切り出し、本体のセレクタからcurrentTimeを
  // 除外することで、時刻表示だけが毎フレーム更新され、周辺UIは巻き込まれない
  // ようにする。
  it('keeps currentTime out of the TimelineControlBar shallow store subscription', () => {
    const controlBar = readSource('./TimelineControlBar.tsx');

    expect(controlBar).not.toContain('currentTime: state.currentTime');
    expect(controlBar).not.toContain('currentTime.toFixed(2)');
  });

  it('renders TimelineCurrentTimeDisplay from TimelineControlBar', () => {
    const controlBar = readSource('./TimelineControlBar.tsx');

    expect(controlBar).toContain('<TimelineCurrentTimeDisplay');
  });

  // TimelineCurrentTimeDisplayはTimelineCurrentTimeIndicatorと同じ流儀
  // （素のuseStore.subscribe+手動diff+DOM直接更新）へ移行済み。hook購読
  // （useStore((state) => ...) 形）を残すと毎フレームReactの再レンダー/コミット
  // が発生し、重量E2Eのコミット回数（callCount）が下がらなくなる。
  it('keeps TimelineCurrentTimeDisplay free of a per-frame hook subscription to currentTime', () => {
    const display = readSource('./TimelineCurrentTimeDisplay.tsx');

    expect(display).not.toMatch(/useStore\(\s*\(\s*state\s*\)\s*=>\s*state\.currentTime/);
    expect(display).toContain('useStore.subscribe');
    expect(display).toContain('textContent');
  });
});
