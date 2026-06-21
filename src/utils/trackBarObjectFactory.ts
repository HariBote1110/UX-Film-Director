import type { TrackBarObject } from '../types';

export interface BuildAviUtlTrackBarObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlTrackBarObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlTrackBarObjectInput): TrackBarObject => {
  const width = Math.max(240, Math.round(Math.min(projectWidth, 1920) * 0.1875));
  const height = 120;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'track_bar',
    name: 'カスタムトラックバー',
    layer,
    startTime,
    duration: 5,
    x,
    y,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    trackValues: [0, 0, 0, 0],
    trackRanges: [[0, 100], [0, 100], [0, 100], [-100, 100]],
    labels: ['TrackA', 'TrackB', 'TrackC', 'TrackD'],
    barColour: '#ffffff',
    backgroundOpacity: 0.05,
  };
};
