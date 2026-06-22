import type { PaperAirplaneObject } from '../../types';

export interface BuildAviUtlPaperAirplaneObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlPaperAirplaneObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlPaperAirplaneObjectInput): PaperAirplaneObject => {
  const width = 320;
  const height = 240;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'paper_airplane',
    name: '紙飛行機',
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
    bodyLength: 200,
    wingWidth: 80,
    foldHeight: 50,
    gap: 50,
    followMotionDirection: false,
    axisMode: 0,
    fillColour: '#ffffff',
  };
};
