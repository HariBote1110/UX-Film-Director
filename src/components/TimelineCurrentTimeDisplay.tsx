import React from 'react';
import { useStore } from '../store/useStore';

export const TimelineCurrentTimeDisplay: React.FC = () => {
  const currentTime = useStore((state) => state.currentTime);

  return (
    <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: 'var(--accent-blue)', minWidth: '60px', textAlign: 'right' }}>
      {currentTime.toFixed(2)}s
    </span>
  );
};
