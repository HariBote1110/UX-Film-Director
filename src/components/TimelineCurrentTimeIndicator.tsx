import React from 'react';
import { useStore } from '../store/useStore';
import { PX_PER_SEC } from './timelineConstants';

type TimelineCurrentTimeIndicatorProps = {
  variant: 'ruler' | 'track';
};

export const TimelineCurrentTimeIndicator: React.FC<
  TimelineCurrentTimeIndicatorProps
> = ({ variant }) => {
  const currentTime = useStore((state) => state.currentTime);
  const left = Math.max(0, currentTime) * PX_PER_SEC;

  if (variant === 'ruler') {
    return <div className="seek-bar" style={{ left }} />;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 0,
        bottom: 0,
        width: '1px',
        background: 'rgba(255,0,0,0.5)',
      }}
    />
  );
};
