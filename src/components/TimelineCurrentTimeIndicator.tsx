import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { PX_PER_SEC } from './timelineConstants';
import { timelineCurrentTimeIndicatorOffsetPx } from './timelineCurrentTimeIndicatorOffset';

type TimelineCurrentTimeIndicatorProps = {
  variant: 'ruler' | 'track';
};

export const TimelineCurrentTimeIndicator: React.FC<
  TimelineCurrentTimeIndicatorProps
> = ({ variant }) => {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const applyOffset = (currentTime: number) => {
      const element = elementRef.current;
      if (!element) {
        return;
      }
      const offsetPx = timelineCurrentTimeIndicatorOffsetPx({
        currentTime,
        pixelsPerSecond: PX_PER_SEC,
      });
      // leftは初期位置に固定したまま、以降の移動はtransformのみで行う
      // （layoutではなくcompositingで完結させ、毎フレームのレイアウト発生を避ける）。
      element.style.transform = `translate3d(${offsetPx}px, 0, 0)`;
    };

    // 初回マウント時（および、このeffectを再実行させる依存の変化時）に
    // 現在値へ同期する。
    applyOffset(useStore.getState().currentTime);

    // このstoreはsubscribeWithSelectorミドルウェアを使っていないため、素の
    // subscribeで購読し、currentTimeの変化のみを自前で判定する。これにより
    // 再生ヘッドの移動がReactの再レンダー/コミットを発生させなくなる。
    let previousCurrentTime = useStore.getState().currentTime;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.currentTime !== previousCurrentTime) {
        previousCurrentTime = state.currentTime;
        applyOffset(state.currentTime);
      }
    });

    return unsubscribe;
  }, []);

  if (variant === 'ruler') {
    return <div ref={elementRef} className="seek-bar" style={{ left: 0 }} />;
  }

  return (
    <div
      ref={elementRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '1px',
        background: 'rgba(255,0,0,0.5)',
      }}
    />
  );
};
