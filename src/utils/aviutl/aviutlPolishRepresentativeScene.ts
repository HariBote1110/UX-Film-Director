import type { AudioObject, CameraState, LayerState, ProjectSettings, ShapeObject, StageCamera3D, TimelineObject } from '../../types';
import { buildAviUtlAudioSphereObject } from '../objectFactories/audioSphereObjectFactory';
import { buildGetColorSampledDotFieldObject } from '../objectFactories/getColorDotFieldObjectFactory';
import { buildHksyAnchorLineObject, buildHksyMeasuredGridObject } from '../objectFactories/hksyCheckerGridObjectFactory';
import { buildAviUtlRegionFrameObject } from '../objectFactories/regionFrameObjectFactory';
import { buildAviUtlSimpleTubeObject } from '../objectFactories/simpleTubeObjectFactory';
import { createDefaultCamera, createDefaultLayers, createDefaultStageCamera3D } from '../sceneState';

export interface AviUtlPackPolishRepresentativeScene {
  settings: ProjectSettings;
  duration: number;
  layers: LayerState[];
  camera: CameraState;
  stageCamera3D: StageCamera3D;
  objects: TimelineObject[];
}

const buildColourCard = (): ShapeObject => ({
  id: 'polish-colour-card',
  type: 'shape',
  name: 'GetColor sample colour card',
  layer: 0,
  startTime: 0,
  duration: 6,
  x: 96,
  y: 96,
  width: 360,
  height: 240,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 96,
  endY: 96,
  easing: 'linear',
  shapeType: 'rect',
  fill: '#ff5c8a',
});

const buildAudioBed = (): AudioObject => ({
  id: 'polish-audio-bed',
  type: 'audio',
  name: 'AviUtl polish audio bed',
  layer: 1,
  startTime: 0,
  duration: 6,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'file:///tmp/aviutl-polish-audio.wav',
  filePath: '/tmp/aviutl-polish-audio.wav',
  volume: 1,
  muted: false,
});

export const buildAviUtlPackPolishRepresentativeScene = (): AviUtlPackPolishRepresentativeScene => {
  const settings: ProjectSettings = {
    width: 1920,
    height: 1080,
    fps: 60,
    sampleRate: 48000,
    editorMode: '2d',
  };
  const layers = createDefaultLayers();
  layers[0] = { ...layers[0], name: 'GetColor source card' };
  layers[1] = { ...layers[1], name: 'Audio source' };
  layers[8] = { ...layers[8], name: 'GetColor generated dots' };
  layers[12] = { ...layers[12], name: 'hksy polish patterns' };
  layers[18] = { ...layers[18], name: '93 generated objects' };

  const colourCard = buildColourCard();
  const audioBed = buildAudioBed();
  const getColor = {
    ...buildGetColorSampledDotFieldObject({
      id: 'polish-getcolor-sampled',
      projectWidth: settings.width,
      projectHeight: settings.height,
      startTime: 0,
      layer: 8,
    }),
    x: 520,
    y: 96,
    endX: 520,
    endY: 96,
    width: 680,
    height: 360,
    sampleSourceObjectId: colourCard.id,
    sampleSourceLayer: undefined,
    sampleStrength: 0.85,
    foregroundColour: '#ffffff',
    secondaryColour: '#36c2ff',
    backgroundColour: '#10131a',
  } satisfies TimelineObject;
  const measuredGrid = {
    ...buildHksyMeasuredGridObject({
      id: 'polish-hksy-measured-grid',
      projectWidth: settings.width,
      projectHeight: settings.height,
      startTime: 0,
      layer: 12,
    }),
    x: 96,
    y: 620,
    endX: 96,
    endY: 620,
    width: 720,
    height: 320,
    cellSize: 40,
    separateInterval: 4,
    separateLineWidth: 4,
    foregroundColour: '#d8f3ff',
    secondaryColour: '#36c2ff',
    backgroundColour: '#08111f',
  } satisfies TimelineObject;
  const anchorLine = {
    ...buildHksyAnchorLineObject({
      id: 'polish-hksy-anchor-line',
      projectWidth: settings.width,
      projectHeight: settings.height,
      startTime: 0,
      layer: 13,
    }),
    x: 900,
    y: 620,
    endX: 900,
    endY: 620,
    width: 380,
    height: 320,
    lineWidth: 18,
    foregroundColour: '#ffd166',
    anchorPoints: [
      { x: -140, y: 80 },
      { x: -20, y: -120 },
      { x: 140, y: 70 },
    ],
    roundCaps: true,
    maxJoinDistance: 80,
  } satisfies TimelineObject;
  const regionFrame = {
    ...buildAviUtlRegionFrameObject({
      id: 'polish-93-region-frame',
      projectWidth: settings.width,
      projectHeight: settings.height,
      startTime: 0,
      layer: 18,
    }),
    x: 1320,
    y: 96,
    endX: 1320,
    endY: 96,
    width: 460,
    height: 280,
    frameColour: '#ffffff',
    backgroundColour: '#243b6b',
    backgroundOpacity: 0.28,
  } satisfies TimelineObject;
  const simpleTube = {
    ...buildAviUtlSimpleTubeObject({
      id: 'polish-93-simple-tube',
      projectWidth: settings.width,
      projectHeight: settings.height,
      startTime: 0,
      layer: 19,
    }),
    x: 1320,
    y: 420,
    endX: 1320,
    endY: 420,
    width: 460,
    height: 280,
    radius: 120,
    depth: 240,
    segments: 20,
    rings: 12,
    twistDegrees: 80,
    colour: '#36c2ff',
    secondaryColour: '#ffffff',
    colourPattern: 'ring',
  } satisfies TimelineObject;
  const audioSphere = {
    ...buildAviUtlAudioSphereObject({
      id: 'polish-93-audio-sphere',
      projectWidth: settings.width,
      projectHeight: settings.height,
      startTime: 0,
      layer: 20,
    }),
    x: 1410,
    y: 720,
    endX: 1410,
    endY: 720,
    width: 320,
    height: 320,
    targetAudioId: audioBed.id,
    targetLayer: audioBed.layer,
    colour: '#70e000',
  } satisfies TimelineObject;

  return {
    settings,
    duration: 6,
    layers,
    camera: createDefaultCamera(),
    stageCamera3D: createDefaultStageCamera3D(),
    objects: [
      colourCard,
      audioBed,
      getColor,
      measuredGrid,
      anchorLine,
      regionFrame,
      simpleTube,
      audioSphere,
    ],
  };
};
