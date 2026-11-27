import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const useVisionRealtimeDetectionSource = () =>
  readFileSync(new URL('./useVisionRealtimeDetection.ts', import.meta.url), 'utf8');

describe('useVisionRealtimeDetection boundary', () => {
  // このhookはViewportから呼ばれるため、currentTimeをhook購読すると
  // Viewport本体が毎フレーム再レンダーされてしまう。停止中スクラブの追従は
  // 素のuseStore.subscribeへ切り出し済み（useStore.getState().currentTimeの
  // 読み捨ては許容）。
  it('does not subscribe to currentTime via the useStore hook', () => {
    const code = useVisionRealtimeDetectionSource();

    expect(code).not.toContain('useStore((s) => s.currentTime)');
  });

  it('follows scrubbing via a raw store subscription instead', () => {
    const code = useVisionRealtimeDetectionSource();

    expect(code).toContain('useStore.subscribe');
  });
});
