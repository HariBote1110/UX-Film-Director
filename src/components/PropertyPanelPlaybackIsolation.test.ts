import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) => (
  readFileSync(new URL(name, import.meta.url), 'utf8')
);

describe('PropertyPanel playback render isolation boundary', () => {
  // PropertyPanelはcurrentTimeをフックの戻り値として購読していたため、選択オブジェクトの
  // 有無や種類にかかわらず、再生中は毎フレーム巨大なプロパティフォーム全体が
  // 再レンダーされていた。currentTimeはVision系イベントハンドラ内でのみ読まれており
  // JSXの描画には使われていないため、Timeline.tsxと同じ流儀（useStore.getState()での
  // 読み捨て）に揃え、購読自体をやめる。
  it('does not subscribe to currentTime as a render-triggering hook value', () => {
    const propertyPanel = readSource('./PropertyPanel.tsx');

    expect(propertyPanel).not.toContain('const currentTime = useStore((state) => state.currentTime)');
  });

  it('reads currentTime via getState() inside the vision media-time helper, matching the Timeline.tsx event-handler pattern', () => {
    const propertyPanel = readSource('./PropertyPanel.tsx');

    expect(propertyPanel).toContain('const mediaTimeForSelectedVideo = (video: VideoObject): number => {');
    expect(propertyPanel).toContain('const local = useStore.getState().currentTime - video.startTime;');
  });
});
