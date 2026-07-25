import { describe, expect, it } from 'vitest';
import { PX_PER_SEC } from './timelineConstants';
import { timelineCurrentTimeIndicatorOffsetPx } from './timelineCurrentTimeIndicatorOffset';

// 再生ヘッド（TimelineCurrentTimeIndicator）は、この純関数が返すpx値を
// transformで反映するだけになる。ここでは既存の計算式
// `Math.max(0, currentTime) * pixelsPerSecond` と同じ値を返すことのみを保証し、
// 「再生ヘッドは毎フレームReactを再レンダーせず、位置計算とDOM反映を分離する」
// という契約をテストとして固定する。
describe('timelineCurrentTimeIndicatorOffsetPx', () => {
  it('currentTimeとpixelsPerSecondの積を返す（既存の計算式と同一）', () => {
    expect(
      timelineCurrentTimeIndicatorOffsetPx({ currentTime: 2, pixelsPerSecond: PX_PER_SEC })
    ).toBe(2 * PX_PER_SEC);
  });

  it('境界値: currentTime=0のとき0を返す', () => {
    expect(
      timelineCurrentTimeIndicatorOffsetPx({ currentTime: 0, pixelsPerSecond: PX_PER_SEC })
    ).toBe(0);
  });

  it('currentTimeが負の場合は0にクランプする（既存の Math.max(0, ...) と同一挙動）', () => {
    expect(
      timelineCurrentTimeIndicatorOffsetPx({ currentTime: -5, pixelsPerSecond: PX_PER_SEC })
    ).toBe(0);
  });

  it('ズーム変更時（pixelsPerSecondが変わる）でも同じ式で再計算される', () => {
    const zoomedPixelsPerSecond = PX_PER_SEC * 2;
    expect(
      timelineCurrentTimeIndicatorOffsetPx({ currentTime: 3, pixelsPerSecond: zoomedPixelsPerSecond })
    ).toBe(3 * zoomedPixelsPerSecond);
  });
});
