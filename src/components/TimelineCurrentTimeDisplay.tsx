import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

export const TimelineCurrentTimeDisplay: React.FC = () => {
  const elementRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const applyText = (currentTime: number) => {
      const element = elementRef.current;
      if (!element) {
        return;
      }
      // 時刻テキストの更新はReactの再レンダー/コミットを発生させない
      // （毎フレームのcallCount削減）。テキスト変化によるレイアウトはDOM更新
      // である限り不可避。
      element.textContent = `${currentTime.toFixed(2)}s`;
    };

    // 初回マウント時（および、このeffectを再実行させる依存の変化時）に
    // 現在値へ同期する。
    applyText(useStore.getState().currentTime);

    // このstoreはsubscribeWithSelectorミドルウェアを使っていないため、素の
    // subscribeで購読し、currentTimeの変化のみを自前で判定する。
    let previousCurrentTime = useStore.getState().currentTime;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.currentTime !== previousCurrentTime) {
        previousCurrentTime = state.currentTime;
        applyText(state.currentTime);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <span
      ref={elementRef}
      style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: 'var(--accent-blue)', minWidth: '60px', textAlign: 'right' }}
    >
      {useStore.getState().currentTime.toFixed(2)}s
    </span>
  );
};
