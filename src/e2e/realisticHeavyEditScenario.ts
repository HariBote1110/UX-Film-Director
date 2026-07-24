import type {
  AudioObject,
  GroupControlObject,
  ImageObject,
  SceneData,
  ShapeObject,
  TextObject,
  TimelineObject,
  VideoObject,
} from '../types';
import { buildAviUtlPackPolishRepresentativeScene } from '../utils/aviutl/aviutlPolishRepresentativeScene';
import { toFileProtocolUrl } from '../utils/mediaMetadata';
import {
  createDefaultCamera,
  createDefaultLayers,
  createDefaultStageCamera3D,
} from '../utils/sceneState';

export interface RealisticHeavyEditPaths {
  videoPath: string;
  proxyPath?: string;
  audioPath: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
}

export interface RealisticHeavyEditScenario {
  settings: {
    width: number;
    height: number;
    fps: number;
    sampleRate: number;
    editorMode: '2d';
  };
  activeSceneId: string;
  scenes: SceneData[];
}

export interface RealisticHeavyEditInspection {
  ok: boolean;
  errors: string[];
  sceneCount: number;
  objectCount: number;
  uniqueObjectIdCount: number;
  nonFiniteNumberCount: number;
  danglingReferenceCount: number;
}

const MAIN_SCENE_ID = 'realistic-heavy-main';
const CUTAWAY_SCENE_ID = 'realistic-heavy-cutaway';
const TITLES_SCENE_ID = 'realistic-heavy-titles';
const MAIN_DURATION_SECONDS = 24;

const cloneTimelineObject = (object: TimelineObject): TimelineObject => (
  JSON.parse(JSON.stringify(object)) as TimelineObject
);

const buildVideo = (
  id: string,
  name: string,
  layer: number,
  paths: RealisticHeavyEditPaths,
  patch: Partial<VideoObject> = {},
): VideoObject => ({
  id,
  type: 'video',
  name,
  layer,
  startTime: 0,
  duration: MAIN_DURATION_SECONDS,
  offset: 0,
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  sourceWidth: 3840,
  sourceHeight: 2160,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: true,
  endX: 0,
  endY: 0,
  easing: 'easeInOutQuad',
  src: toFileProtocolUrl(paths.videoPath),
  filePath: paths.videoPath,
  proxyFilePath: paths.proxyPath,
  volume: 1,
  muted: false,
  keyframes: [
    { id: `${id}-keyframe-0`, time: 0, x: 0, y: 0, easing: 'linear' },
    { id: `${id}-keyframe-1`, time: 12, x: 24, y: -12, easing: 'easeInOutQuad' },
    { id: `${id}-keyframe-2`, time: 24, x: 0, y: 0, easing: 'easeInOutQuad' },
  ],
  filters: [
    {
      id: `${id}-colour`,
      type: 'color_correction',
      enabled: true,
      params: { brightness: 1.03, contrast: 1.08, saturation: 1.12, hue: 0 },
    },
    {
      id: `${id}-outline`,
      type: 'outline',
      enabled: true,
      params: { colour: '#121820', thickness: 2, opacity: 0.65 },
    },
    {
      id: `${id}-fade`,
      type: 'fade',
      enabled: true,
      params: { opacity: 0.96 },
    },
  ],
  ...patch,
});

const buildAudio = (paths: RealisticHeavyEditPaths): AudioObject => ({
  id: 'realistic-main-audio',
  type: 'audio',
  name: 'Dialogue and music bed',
  layer: 2,
  startTime: 0,
  duration: MAIN_DURATION_SECONDS,
  offset: 0,
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
  src: toFileProtocolUrl(paths.audioPath),
  filePath: paths.audioPath,
  volume: 0.82,
  muted: false,
});

const buildImage = (paths: RealisticHeavyEditPaths): ImageObject => ({
  id: 'realistic-main-image',
  type: 'image',
  name: 'Brand overlay image',
  layer: 3,
  startTime: 2,
  duration: 18,
  x: 1480,
  y: 80,
  width: paths.imageWidth,
  height: paths.imageHeight,
  rotation: -2,
  scaleX: Math.min(1, 320 / paths.imageWidth),
  scaleY: Math.min(1, 320 / paths.imageHeight),
  opacity: 0.88,
  enableAnimation: true,
  endX: 1450,
  endY: 100,
  easing: 'easeOutCubic',
  src: toFileProtocolUrl(paths.imagePath),
  filePath: paths.imagePath,
  filters: [{
    id: 'realistic-main-image-shadow',
    type: 'shadow',
    enabled: true,
    params: {
      colour: '#000000',
      blur: 12,
      offsetX: 8,
      offsetY: 10,
      opacity: 0.55,
    },
  }],
});

const buildTitle = (id: string, name: string, layer: number, startTime: number): TextObject => ({
  id,
  type: 'text',
  name,
  layer,
  startTime,
  duration: 7,
  x: 110,
  y: 760,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: true,
  endX: 160,
  endY: 760,
  easing: 'easeOutCubic',
  text: '重いけれど現実的な編集',
  fontSize: 76,
  fontFamily: 'Hiragino Sans',
  fill: '#ffffff',
  textAlignment: 'left',
  letterSpacing: 2,
  textStroke: { colour: '#111827', width: 5 },
  textShadow: { colour: '#000000', offsetX: 8, offsetY: 10, blur: 8 },
  filters: [{
    id: `${id}-wipe`,
    type: 'wipe',
    enabled: true,
    params: { edge: 'left', reverse: false },
  }],
});

const buildGroupControl = (): GroupControlObject => ({
  id: 'realistic-main-group-control',
  type: 'group_control',
  name: 'Lower third group control',
  layer: 5,
  startTime: 0,
  duration: MAIN_DURATION_SECONDS,
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
  targetLayerCount: 8,
  groupGradient: {
    enabled: true,
    type: 'linear',
    scope: 'group',
    colours: ['#35c2ff', '#ff5c8a'],
    stops: [0, 1],
    direction: 18,
  },
});

const buildShape = (
  id: string,
  layer: number,
  index: number,
  groupId?: string,
): ShapeObject => ({
  id,
  groupId,
  type: 'shape',
  name: `Editorial card ${index + 1}`,
  layer,
  startTime: index * 1.5,
  duration: 10,
  x: 90 + (index % 3) * 330,
  y: 80 + Math.floor(index / 3) * 220,
  width: 280,
  height: 170,
  rotation: index % 2 === 0 ? -2 : 2,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.78,
  enableAnimation: true,
  endX: 130 + (index % 3) * 330,
  endY: 100 + Math.floor(index / 3) * 220,
  easing: 'easeInOutQuad',
  shapeType: index % 2 === 0 ? 'rounded_rect' : 'rect',
  cornerRadius: 20,
  fill: index % 2 === 0 ? '#12213d' : '#351c4d',
  filters: [
    {
      id: `${id}-blur`,
      type: 'blur',
      enabled: index % 3 === 0,
      params: { strength: 2, quality: 2 },
    },
    {
      id: `${id}-outline`,
      type: 'outline',
      enabled: true,
      params: { colour: '#ffffff', thickness: 2, opacity: 0.45 },
    },
  ],
});

const cloneRepresentativeObjects = (
  prefix: string,
  startTime: number,
  layerOffset: number,
  duration: number,
  audioTargetId: string,
  sampleImagePath: string,
): TimelineObject[] => {
  const representative = buildAviUtlPackPolishRepresentativeScene();
  const idMap = new Map(
    representative.objects.map((object) => [object.id, `${prefix}-${object.id}`]),
  );
  return representative.objects
    .filter((source) => source.type !== 'audio')
    .map((source, index) => {
    const object = cloneTimelineObject(source);
    object.id = idMap.get(source.id) ?? `${prefix}-${index}`;
    object.name = `${source.name} ${prefix}`;
    object.startTime = startTime;
    object.duration = duration;
    object.layer = Math.min(99, layerOffset + index);
    object.x += (index % 2) * 24;
    object.y += (index % 3) * 18;
    object.endX = object.x;
    object.endY = object.y;
    if (index < 4) object.groupId = `${prefix}-group`;
    if ('targetAudioId' in object) {
      object.targetAudioId = audioTargetId;
      object.targetLayer = 2;
    }
    if ('sampleSourceObjectId' in object && typeof object.sampleSourceObjectId === 'string') {
      object.sampleSourcePath = sampleImagePath;
      object.sampleSourceObjectId = undefined;
      object.sampleSourceLayer = undefined;
    }
      return object;
    });
};

const buildScene = (
  id: string,
  name: string,
  duration: number,
  objects: TimelineObject[],
): SceneData => ({
  id,
  name,
  duration,
  layers: createDefaultLayers(),
  objects,
  camera: createDefaultCamera(),
  stageCamera3D: createDefaultStageCamera3D(),
});

export const buildRealisticHeavyEditScenario = (
  paths: RealisticHeavyEditPaths,
): RealisticHeavyEditScenario => {
  const mainObjects: TimelineObject[] = [
    buildVideo('realistic-main-video-a', 'Primary 4K interview', 0, paths),
    buildVideo('realistic-main-video-b', 'Picture in picture B-roll', 1, paths, {
      startTime: 4,
      duration: 16,
      offset: 8,
      x: 1190,
      y: 570,
      width: 640,
      height: 360,
      scaleX: 0.94,
      scaleY: 0.94,
      volume: 0,
      muted: true,
      subjectCropEnabled: true,
      subjectCropKeyframes: [
        { id: 'realistic-crop-0', time: 4, x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
        { id: 'realistic-crop-1', time: 12, x: 0.16, y: 0.1, width: 0.7, height: 0.78 },
        { id: 'realistic-crop-2', time: 20, x: 0.1, y: 0.12, width: 0.8, height: 0.76 },
      ],
    }),
    buildAudio(paths),
    buildImage(paths),
    buildTitle('realistic-main-title', 'Animated lower third', 4, 1),
    buildGroupControl(),
    ...Array.from({ length: 5 }, (_, index) => (
      buildShape(`realistic-main-shape-${index}`, 6 + index, index, 'realistic-main-cards')
    )),
    ...cloneRepresentativeObjects('main-a', 0, 16, 12, 'realistic-main-audio', paths.imagePath),
    ...cloneRepresentativeObjects('main-b', 6, 32, 12, 'realistic-main-audio', paths.imagePath),
    ...cloneRepresentativeObjects('main-c', 12, 48, 12, 'realistic-main-audio', paths.imagePath),
  ];

  const cutawayObjects: TimelineObject[] = [
    buildVideo('realistic-cutaway-video', 'Cutaway 4K source', 0, paths, {
      duration: 16,
      filters: [{
        id: 'realistic-cutaway-colour',
        type: 'color_correction',
        enabled: true,
        params: { brightness: 0.98, contrast: 1.14, saturation: 0.9, hue: -3 },
      }],
    }),
    buildTitle('realistic-cutaway-title', 'Cutaway title', 3, 0.5),
    ...Array.from({ length: 6 }, (_, index) => (
      buildShape(`realistic-cutaway-shape-${index}`, 5 + index, index)
    )),
    ...cloneRepresentativeObjects('cutaway-a', 2, 20, 10, 'realistic-main-audio', paths.imagePath)
      .filter((object) => !('targetAudioId' in object)),
  ];

  const titleObjects: TimelineObject[] = [
    buildTitle('realistic-titles-heading', 'Opening title', 2, 0),
    ...Array.from({ length: 7 }, (_, index) => (
      buildShape(`realistic-titles-shape-${index}`, 4 + index, index, 'realistic-title-cards')
    )),
  ];

  return {
    settings: {
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48000,
      editorMode: '2d',
    },
    activeSceneId: MAIN_SCENE_ID,
    scenes: [
      buildScene(MAIN_SCENE_ID, 'Heavy main edit', MAIN_DURATION_SECONDS, mainObjects),
      buildScene(CUTAWAY_SCENE_ID, 'Cutaway and treatment', 16, cutawayObjects),
      buildScene(TITLES_SCENE_ID, 'Titles and cards', 12, titleObjects),
    ],
  };
};

const countNonFiniteNumbers = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? 0 : 1;
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + countNonFiniteNumbers(entry), 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce(
      (total, entry) => total + countNonFiniteNumbers(entry),
      0,
    );
  }
  return 0;
};

export const inspectRealisticHeavyEditScenario = (
  scenario: RealisticHeavyEditScenario,
): RealisticHeavyEditInspection => {
  const errors: string[] = [];
  const objects = scenario.scenes.flatMap((scene) => scene.objects);
  const ids = objects.map((object) => object.id);
  const uniqueIds = new Set(ids);
  const nonFiniteNumberCount = countNonFiniteNumbers(scenario);
  let danglingReferenceCount = 0;

  if (!scenario.scenes.some((scene) => scene.id === scenario.activeSceneId)) {
    errors.push('activeSceneIdがシーン一覧に存在しません。');
  }
  if (uniqueIds.size !== ids.length) {
    errors.push('オブジェクトIDが重複しています。');
  }
  if (nonFiniteNumberCount > 0) {
    errors.push('有限でない数値が含まれています。');
  }

  for (const scene of scenario.scenes) {
    const sceneIds = new Set(scene.objects.map((object) => object.id));
    for (const object of scene.objects) {
      if (object.startTime < 0 || object.duration <= 0 || object.layer < 0 || object.layer >= scene.layers.length) {
        errors.push(`時間またはレイヤーが不正です: ${object.id}`);
      }
      const referenceIds = [
        'targetAudioId' in object ? object.targetAudioId : null,
        'sampleSourceObjectId' in object ? object.sampleSourceObjectId : null,
      ].filter((reference): reference is string => typeof reference === 'string' && reference !== '');
      for (const reference of referenceIds) {
        if (!sceneIds.has(reference)) {
          danglingReferenceCount += 1;
          errors.push(`参照先が存在しません: ${object.id} -> ${reference}`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    sceneCount: scenario.scenes.length,
    objectCount: objects.length,
    uniqueObjectIdCount: uniqueIds.size,
    nonFiniteNumberCount,
    danglingReferenceCount,
  };
};
