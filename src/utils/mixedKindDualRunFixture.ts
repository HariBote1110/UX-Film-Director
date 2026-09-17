/**
 * P2b の受入材料: generated / audio / getcolor / group_control を含む
 * kind 混在シーンの共有 fixture。
 *
 * `buildEditableRustScene`（rust-core builder が resident session で使う経路）と
 * `buildRustSceneSnapshotForTimeline`（従来の TS serializer 経路）の両方へ
 * 同じ graph を渡し、media 生成の一致を確認するために使う。
 * P2a の basic cut-over は shape/text/image/video/PSD だけを切り替えており、
 * generated/audio/getcolor/group_control を混在させたシナリオでの両経路比較は
 * まだ存在しなかった（`progress/scene-build-p2a-basic-cutover.md` 参照）。
 */
import type { LayerState, ProjectSettings, TimelineObject } from '../types';

export const mixedKindDualRunSettings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48_000,
};

export const mixedKindDualRunLayers: LayerState[] = Array.from({ length: 8 }, (_, index) => ({
  id: `layer-${index}`,
  name: `Layer ${index}`,
  visible: true,
  locked: false,
}));

/** すべてのオブジェクトがこの時刻で可視になるよう startTime=0/duration=20 に揃えている。 */
export const mixedKindDualRunTime = 5;

const base = (id: string, type: string, layer: number) => ({
  id,
  type,
  name: id,
  layer,
  startTime: 0,
  duration: 20,
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

// layer0: text（shape/text 群の代表）
const titleText = {
  ...base('mixed-title-text', 'text', 0),
  text: 'Hello',
  fontSize: 48,
  fontFamily: 'Arial',
  fill: '#ffffff',
  measuredWidth: 200,
  measuredHeight: 60,
};

// layer1: group_control（layer2 の video を対象に取る、targetLayerCount=1）
const groupControl = {
  ...base('mixed-group-control', 'group_control', 1),
  targetLayerCount: 1,
};

// layer2: video（image/video 群の代表。group_control の対象。）
const videoClip = {
  ...base('mixed-video-clip', 'video', 2),
  src: 'blob:mixed-video-clip',
  filePath: '/media/mixed-video-clip.mov',
  proxyFilePath: '/media/mixed-video-clip.proxy.mp4',
  width: 1280,
  height: 720,
  offset: 0,
  volume: 1,
  muted: false,
};

// layer3: particle（PSD を伴わない generated 群の代表）
const particleFx = {
  ...base('mixed-particle-fx', 'particle', 3),
  width: 640,
  height: 360,
  particleCount: 96,
  seed: 93,
  spread: 160,
  speed: 90,
  size: 4,
  colour: '#ffffff',
  lifetimeSeconds: 2,
};

// layer4: getcolor dot field（sampleSource 系は未設定のデフォルト経路）
const getColorDots = {
  ...base('mixed-getcolor-dots', 'getcolor_dot_field', 4),
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
};

// layer5: audio（visual object ではないが audio_sphere から直接 ID 参照される）
const audioTrack = {
  ...base('mixed-audio-track', 'audio', 5),
  src: 'blob:mixed-audio-track',
  filePath: '/media/mixed-audio-track.wav',
  volume: 1,
  muted: false,
};

// layer6: audio_sphere（93 系の audio-sphere。targetAudioId で直接束縛。）
const audioSphereFx = {
  ...base('mixed-audio-sphere-fx', 'audio_sphere', 6),
  targetAudioId: 'mixed-audio-track',
  targetLayer: null,
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
};

export const mixedKindDualRunObjects: TimelineObject[] = [
  titleText,
  groupControl,
  videoClip,
  particleFx,
  getColorDots,
  audioTrack,
  audioSphereFx,
] as unknown as TimelineObject[];
