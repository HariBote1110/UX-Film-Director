/** Builds the P0 editable scene builder contract fixture from current TS behaviour. */
import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import { buildEditableRustScene } from './editableRustScene';
import { buildRustSceneSnapshotForTimeline, type RustSceneMediaReference, type RustSceneVideoSourceMode } from './rustSceneSnapshot';

export interface EditableSceneBuilderContractCase {
  id: string;
  time: number;
  purpose: RustSceneVideoSourceMode;
  graph: {
    settings: ProjectSettings;
    layers: LayerState[];
    objects: TimelineObject[];
  };
  includeProject?: boolean;
}

const settings: ProjectSettings = { width: 1920, height: 1080, fps: 60, sampleRate: 48_000 };

const layers = (hidden: number[] = []): LayerState[] => Array.from({ length: 8 }, (_, index) => ({
  id: `layer-${index}`,
  name: `Layer ${index}`,
  visible: !hidden.includes(index),
  locked: false,
}));

const base = (id: string, type: string, layer: number, startTime: number, duration: number) => ({
  id,
  type,
  name: id,
  layer,
  startTime,
  duration,
  x: 10,
  y: 20,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 10,
  endY: 20,
  easing: 'linear',
});

const audio = (id: string, layer: number, startTime: number, duration: number) => ({
  ...base(id, 'audio', layer, startTime, duration),
  src: `blob:${id}`,
  filePath: `/media/${id}.wav`,
  volume: 1,
  muted: false,
});

const waveform = (id: string, patch: Record<string, unknown> = {}) => ({
  ...base(id, 'audio_visualization', 4, 10, 1),
  targetAudioId: '',
  targetLayer: 2,
  visualizationType: 'waveform',
  color: '#00ff00',
  thickness: 2,
  width: 640,
  height: 180,
  amplitude: 1,
  ...patch,
});

const sphere = (id: string, patch: Record<string, unknown> = {}) => ({
  ...base(id, 'audio_sphere', 4, 10, 1),
  targetAudioId: '',
  targetLayer: 2,
  width: 400,
  height: 400,
  sampleWindowSeconds: 0.1,
  columns: 16,
  rows: 12,
  baseRadius: 170,
  audioInfluence: 0.6,
  pointSize: 5,
  polygonSize: 0.35,
  randomAmount: 0.05,
  colour: '#36c2ff',
  seed: 93,
  ...patch,
});

const image = (id: string, layer: number, startTime: number, duration: number) => ({
  ...base(id, 'image', layer, startTime, duration),
  src: `blob:${id}`,
  filePath: `/media/${id}.png`,
  width: 640,
  height: 360,
});

const psd = (id: string, layer: number, startTime: number, duration: number) => ({
  ...base(id, 'psd', layer, startTime, duration),
  src: `blob:${id}`,
  filePath: `/media/${id}.psd`,
  width: 640,
  height: 360,
  scale: 1,
  activeLayerIds: { zebra: true, alpha: true, disabled: false },
});

const getColor = (id: string, patch: Record<string, unknown> = {}) => ({
  ...base(id, 'getcolor_dot_field', 5, 3, 1),
  width: 320,
  height: 180,
  columns: 32,
  rows: 18,
  dotSize: 14,
  sizeInfluence: 0.65,
  luminanceInfluence: 0.7,
  hueShiftDegrees: 0,
  alternateRows: false,
  foregroundColour: '#ffffff',
  secondaryColour: '#36c2ff',
  backgroundColour: '#000000',
  seed: 93,
  sampleStrength: 1,
  sampleHueShiftDegrees: 0,
  ...patch,
});

const shape = (id: string, layer: number) => ({
  ...base(id, 'shape', layer, 0, 20),
  width: 100,
  height: 100,
  shapeType: 'rect',
  fill: '#ff0000',
});

const groupControl = (id: string, layer: number, targetLayerCount: number) => ({
  ...base(id, 'group_control', layer, 0, 20),
  targetLayerCount,
  groupX: 0,
  groupY: 0,
  groupScale: 1,
  groupRotation: 0,
  groupOpacity: 1,
});

const video = () => ({
  ...base('video-paths', 'video', 1, 0, 20),
  src: 'blob:video-paths',
  filePath: '/media/original.mov',
  proxyFilePath: '/media/proxy.mp4',
  width: 1280,
  height: 720,
  offset: 0,
  volume: 1,
  muted: false,
});

const graph = (objects: object[], hidden: number[] = []): EditableSceneBuilderContractCase['graph'] => ({
  settings,
  layers: layers(hidden),
  objects: objects as TimelineObject[],
});

export const editableSceneBuilderContractCases = (): EditableSceneBuilderContractCase[] => [
  { id: 'audio-direct-id-outside-window', time: 10, purpose: 'previewProxy', graph: graph([audio('audio-direct', 2, 0, 1), waveform('waveform-direct', { targetAudioId: 'audio-direct' })]) },
  { id: 'audio-sphere-direct-id-outside-window', time: 10, purpose: 'previewProxy', graph: graph([audio('audio-direct', 2, 0, 1), sphere('sphere-direct', { targetAudioId: 'audio-direct' })]) },
  { id: 'audio-layer-fallback-inside-window', time: 3, purpose: 'previewProxy', graph: graph([audio('audio-layer', 2, 2, 2), waveform('waveform-layer', { startTime: 3 })]) },
  { id: 'audio-sphere-layer-fallback-inside-window', time: 3, purpose: 'previewProxy', graph: graph([audio('audio-layer', 2, 2, 2), sphere('sphere-layer', { startTime: 3 })]) },
  { id: 'audio-layer-fallback-not-found', time: 5, purpose: 'previewProxy', graph: graph([audio('audio-layer', 2, 2, 2), waveform('waveform-missing', { startTime: 5 })]) },
  { id: 'getcolor-direct-path', time: 3, purpose: 'previewProxy', graph: graph([getColor('getcolor-path', { sampleSourcePath: '/samples/direct.png' })]) },
  { id: 'getcolor-object-id-image', time: 3, purpose: 'previewProxy', graph: graph([image('image-candidate', 3, 2, 2), getColor('getcolor-image', { sampleSourceObjectId: 'image-candidate' })]) },
  { id: 'getcolor-layer-psd-sorted-active-layers', time: 3, purpose: 'previewProxy', graph: graph([psd('psd-candidate', 3, 2, 2), getColor('getcolor-psd', { sampleSourceLayer: 3 })]) },
  { id: 'getcolor-object-id-non-candidate-does-not-fallback', time: 3, purpose: 'previewProxy', graph: graph([image('image-candidate', 3, 2, 2), audio('not-an-image', 3, 2, 2), getColor('getcolor-no-fallback', { sampleSourceObjectId: 'not-an-image', sampleSourceLayer: 3 })]) },
  { id: 'group-control-visible-layers-and-counts', time: 1, purpose: 'previewProxy', includeProject: true, graph: graph([shape('below-control', 0), groupControl('group-all', 1, 0), groupControl('group-next', 2, 1), shape('same-layer-as-next-control', 2), shape('layer-three-a', 3), shape('layer-three-b', 3), shape('layer-four', 4), shape('hidden-layer-seven', 7)], [7]) },
  { id: 'video-preview-proxy', time: 1, purpose: 'previewProxy', graph: graph([video()]) },
  { id: 'video-export-original', time: 1, purpose: 'exportOriginal', graph: graph([video()]) },
];

const normaliseMedia = (media: RustSceneMediaReference): RustSceneMediaReference => ({
  ...media,
  active_layer_ids: media.active_layer_ids ? [...media.active_layer_ids].sort((left, right) => left.localeCompare(right)) : undefined,
});

const generatorSources = (media: RustSceneMediaReference[]): Record<string, unknown> => Object.fromEntries(
  media
    .filter((reference) => reference.kind.startsWith('Generated'))
    .map((reference) => [reference.id, JSON.parse(reference.source) as unknown])
);

export const buildEditableSceneBuilderContractFixture = () => ({
  version: 1,
  cases: editableSceneBuilderContractCases().map(({ includeProject, ...entry }) => {
    const snapshot = buildRustSceneSnapshotForTimeline({
      projectSettings: entry.graph.settings,
      layers: entry.graph.layers,
      objects: entry.graph.objects,
      time: entry.time,
      videoSourceMode: entry.purpose,
    });
    if (!snapshot.ok) throw new Error(`${entry.id}: snapshot を構築できない`);
    const editable = includeProject
      ? buildEditableRustScene({ sceneId: entry.id, projectSettings: entry.graph.settings, layers: entry.graph.layers, objects: entry.graph.objects })
      : undefined;
    if (editable && !editable.ok) throw new Error(`${entry.id}: editable project を構築できない`);
    return {
      ...entry,
      expected: {
        media: snapshot.media.map(normaliseMedia),
        generator_sources: generatorSources(snapshot.media),
        ...(editable && editable.ok ? { project: editable.project } : {}),
      },
    };
  }),
});

export const serialiseEditableSceneBuilderContractFixture = (): string =>
  `${JSON.stringify(buildEditableSceneBuilderContractFixture(), null, 2)}\n`;
