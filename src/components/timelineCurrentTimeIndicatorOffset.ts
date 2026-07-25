/**
 * 再生ヘッド（TimelineCurrentTimeIndicator）の水平オフセット（px）を計算する純関数。
 *
 * TimelineCurrentTimeIndicator は再生ヘッドの位置を毎フレームDOMへ直接反映する
 * （Reactの再レンダーを経由しない）。位置計算そのものはReactやDOMに依存しない
 * 純関数として切り出し、契約テストで既存の計算式との一致を保証する。
 */
export type TimelineCurrentTimeIndicatorOffsetParams = {
  currentTime: number;
  pixelsPerSecond: number;
};

export const timelineCurrentTimeIndicatorOffsetPx = ({
  currentTime,
  pixelsPerSecond,
}: TimelineCurrentTimeIndicatorOffsetParams): number => (
  Math.max(0, currentTime) * pixelsPerSecond
);
