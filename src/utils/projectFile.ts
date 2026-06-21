import { ProjectSettings, TimelineObject, PsdObject, PsdLayerNode, LayerState, SceneData, CameraState } from '../types';
import { buildPsdLayerTree, parsePsdArrayBufferAsObject, stripPsdLayerNodeForPersistence } from './psdParser';
import { toFileProtocolUrl } from './mediaMetadata';
import {
  createDefaultCamera,
  createDefaultLayers,
  createDefaultStageCamera3D,
  flushActiveIntoScenes,
  sanitiseStageCamera3D
} from './sceneState';

const PROJECT_FILE_FORMAT = 'uxfd-project';
const PROJECT_FILE_VERSION_V1 = 1;
const PROJECT_FILE_VERSION_V2 = 2;
const LEGACY_SCENE_ID = 'legacy-scene-1';

type ProjectFileV1 = {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION_V1;
  savedAt: string;
  projectSettings: ProjectSettings;
  duration: number;
  layers?: LayerState[];
  objects: TimelineObject[];
};

export type ProjectFileV2 = {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION_V2;
  savedAt: string;
  projectSettings: ProjectSettings;
  activeSceneId: string;
  scenes: SceneData[];
};

type SaveProjectResponse =
  | { success: true; filePath: string }
  | { success: false; cancelled?: boolean; error?: string };

type OpenProjectResponse =
  | { success: true; filePath: string; data: string }
  | { success: false; cancelled?: boolean; error?: string };

type ReadFileBytesResponse =
  | { success: true; data: unknown }
  | { success: false; error?: string };

const isProjectSettings = (value: unknown): value is ProjectSettings => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.width !== 'number' ||
    !Number.isFinite(candidate.width) ||
    typeof candidate.height !== 'number' ||
    !Number.isFinite(candidate.height) ||
    typeof candidate.fps !== 'number' ||
    !Number.isFinite(candidate.fps) ||
    typeof candidate.sampleRate !== 'number' ||
    !Number.isFinite(candidate.sampleRate)
  ) {
    return false;
  }
  if (candidate.editorMode !== undefined && candidate.editorMode !== '2d' && candidate.editorMode !== '3d_stage') {
    return false;
  }
  return true;
};

const isLayerState = (value: unknown): value is LayerState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.visible === 'boolean' &&
    typeof candidate.locked === 'boolean'
  );
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const TIMELINE_OBJECT_TYPES = new Set([
  'text',
  'shape',
  'image',
  'video',
  'audio',
  'psd',
  'group_control',
  'audio_visualization',
  'audio_sphere',
  'particle',
  'barcode',
  'puzzle_piece',
  'colour_wheel',
  'gourd',
  'gear',
  'track_bar',
  'pie_chart',
  'histogram',
  'tone_curve',
  'getcolor_dot_field',
  'hksy_checker_grid',
  'region_frame',
  'simple_tube',
  'sphere_dots',
  'spherical_field',
  'sunburst',
  'circular_arrow',
  'triangle_bracket',
  'tartan_check',
  'houndstooth',
  'yagasuri',
  'paper_airplane',
  'asanoha_pattern',
  'focus_lines_plus',
  'random_line_ex',
  'hologram',
  'protractor',
  'shaking_polygon'
]);

const isVec3 = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y) && isFiniteNumber(candidate.z);
};

const isStageCamera3D = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return isVec3(candidate.position) && isVec3(candidate.target);
};

const isPsdWorldPlacement = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.enabled === 'boolean'
    && isVec3(candidate.position)
    && isFiniteNumber(candidate.rotationYDeg)
    && isFiniteNumber(candidate.scale)
    && typeof candidate.billboard === 'boolean'
  );
};

const isPositionKeyframe = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    isFiniteNumber(candidate.time) &&
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    (candidate.easing === undefined || typeof candidate.easing === 'string')
  );
};

const isTrackRangeTuple = (value: unknown): value is [number, number] => (
  Array.isArray(value)
  && value.length === 2
  && isFiniteNumber(value[0])
  && isFiniteNumber(value[1])
  && value[0] !== value[1]
);

const isTimelineObject = (value: unknown): value is TimelineObject => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') return false;
  if (typeof candidate.name !== 'string') return false;
  if (typeof candidate.type !== 'string' || !TIMELINE_OBJECT_TYPES.has(candidate.type)) return false;
  if (!isFiniteNumber(candidate.layer)) return false;
  if (!isFiniteNumber(candidate.startTime)) return false;
  if (!isFiniteNumber(candidate.duration)) return false;
  if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) return false;
  if (!isFiniteNumber(candidate.endX) || !isFiniteNumber(candidate.endY)) return false;
  if (!isFiniteNumber(candidate.rotation)) return false;
  if (!isFiniteNumber(candidate.scaleX) || !isFiniteNumber(candidate.scaleY)) return false;
  if (!isFiniteNumber(candidate.opacity)) return false;
  if (typeof candidate.enableAnimation !== 'boolean') return false;
  if (typeof candidate.easing !== 'string') return false;
  if (candidate.keyframes !== undefined) {
    if (!Array.isArray(candidate.keyframes)) return false;
    if (!candidate.keyframes.every((keyframe) => isPositionKeyframe(keyframe))) return false;
  }
  if (candidate.type === 'psd') {
    const wp = candidate.worldPlacement;
    if (wp !== undefined && !isPsdWorldPlacement(wp)) return false;
  }
  if (candidate.type === 'particle') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (typeof candidate.particleCount !== 'number' || !Number.isInteger(candidate.particleCount) || candidate.particleCount <= 0) return false;
    if (typeof candidate.seed !== 'number' || !Number.isInteger(candidate.seed)) return false;
    if (!isFiniteNumber(candidate.spread) || candidate.spread < 0) return false;
    if (!isFiniteNumber(candidate.speed) || candidate.speed < 0) return false;
    if (!isFiniteNumber(candidate.size) || candidate.size <= 0) return false;
    if (typeof candidate.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.colour)) return false;
    if (!isFiniteNumber(candidate.lifetimeSeconds) || candidate.lifetimeSeconds <= 0) return false;
  }
  if (candidate.type === 'audio_sphere') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.columns) || candidate.columns < 2 || candidate.columns > 64) return false;
    if (!isFiniteNumber(candidate.rows) || candidate.rows < 2 || candidate.rows > 64) return false;
    if (!isFiniteNumber(candidate.baseRadius) || candidate.baseRadius <= 0 || candidate.baseRadius > 2000) return false;
    if (!isFiniteNumber(candidate.audioInfluence) || candidate.audioInfluence < 0 || candidate.audioInfluence > 4) return false;
    if (!isFiniteNumber(candidate.pointSize) || candidate.pointSize < 0 || candidate.pointSize > 200) return false;
    if (!isFiniteNumber(candidate.polygonSize) || candidate.polygonSize < 0 || candidate.polygonSize > 4) return false;
    if (!isFiniteNumber(candidate.randomAmount) || candidate.randomAmount < 0 || candidate.randomAmount > 4) return false;
    if (typeof candidate.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.colour)) return false;
    if (candidate.targetAudioId !== null && typeof candidate.targetAudioId !== 'string') return false;
    if (candidate.targetLayer !== undefined && !isFiniteNumber(candidate.targetLayer)) return false;
    if (!isFiniteNumber(candidate.sampleWindowSeconds) || candidate.sampleWindowSeconds <= 0 || candidate.sampleWindowSeconds > 10) return false;
    if (!isFiniteNumber(candidate.seed)) return false;
  }
  if (candidate.type === 'barcode') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (typeof candidate.data !== 'string') return false;
    if (!isFiniteNumber(candidate.minimumBarWidth) || candidate.minimumBarWidth <= 0) return false;
    if (!isFiniteNumber(candidate.horizontalMargin) || candidate.horizontalMargin < 0) return false;
    if (!isFiniteNumber(candidate.verticalMargin) || candidate.verticalMargin < 0) return false;
    if (typeof candidate.foregroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.foregroundColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'puzzle_piece') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.size) || candidate.size <= 0) return false;
    if (typeof candidate.shapeVariant !== 'number' || !Number.isInteger(candidate.shapeVariant) || candidate.shapeVariant < 1 || candidate.shapeVariant > 22) return false;
    if (candidate.connectorMode !== 'convex' && candidate.connectorMode !== 'concave') return false;
    if (typeof candidate.fillColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.fillColour)) return false;
  }
  if (candidate.type === 'colour_wheel') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.radius) || candidate.radius <= 0) return false;
    if (!isFiniteNumber(candidate.saturation) || candidate.saturation < 0 || candidate.saturation > 100) return false;
    if (!isFiniteNumber(candidate.brightness) || candidate.brightness < 0 || candidate.brightness > 100) return false;
    if (!isFiniteNumber(candidate.ringWidthPercent) || candidate.ringWidthPercent <= 0 || candidate.ringWidthPercent > 100) return false;
    if (typeof candidate.segmentCount !== 'number' || !Number.isInteger(candidate.segmentCount) || candidate.segmentCount < 3 || candidate.segmentCount > 360) return false;
  }
  if (candidate.type === 'gourd') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.bodyRadius) || candidate.bodyRadius <= 0) return false;
    if (!isFiniteNumber(candidate.bodyWidth) || candidate.bodyWidth <= 0) return false;
    if (!isFiniteNumber(candidate.waistRadius) || candidate.waistRadius < 0) return false;
    if (!isFiniteNumber(candidate.squashPercent) || candidate.squashPercent < 0 || candidate.squashPercent > 100) return false;
    if (typeof candidate.repeatCount !== 'number' || !Number.isInteger(candidate.repeatCount) || candidate.repeatCount < 1 || candidate.repeatCount > 36) return false;
    if (typeof candidate.fillColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.fillColour)) return false;
  }
  if (candidate.type === 'gear') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.outerRadius) || candidate.outerRadius <= 0) return false;
    if (!isFiniteNumber(candidate.innerRadiusPercent) || candidate.innerRadiusPercent < 0 || candidate.innerRadiusPercent >= 100) return false;
    if (typeof candidate.toothCount !== 'number' || !Number.isInteger(candidate.toothCount) || candidate.toothCount < 3 || candidate.toothCount > 240) return false;
    if (!isFiniteNumber(candidate.toothDepthPercent) || candidate.toothDepthPercent <= 0 || candidate.toothDepthPercent > 95) return false;
    if (!isFiniteNumber(candidate.toothSkewPercent) || candidate.toothSkewPercent < -100 || candidate.toothSkewPercent > 100) return false;
    if (typeof candidate.fillColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.fillColour)) return false;
  }
  if (candidate.type === 'track_bar') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!Array.isArray(candidate.trackValues) || candidate.trackValues.length !== 4 || !candidate.trackValues.every(isFiniteNumber)) return false;
    if (!Array.isArray(candidate.trackRanges) || candidate.trackRanges.length !== 4 || !candidate.trackRanges.every(isTrackRangeTuple)) return false;
    if (!Array.isArray(candidate.labels) || candidate.labels.length !== 4 || !candidate.labels.every((label) => typeof label === 'string')) return false;
    if (typeof candidate.barColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.barColour)) return false;
    if (!isFiniteNumber(candidate.backgroundOpacity) || candidate.backgroundOpacity < 0 || candidate.backgroundOpacity > 1) return false;
  }
  if (candidate.type === 'pie_chart') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!Array.isArray(candidate.values) || candidate.values.length === 0 || !candidate.values.every((value) => isFiniteNumber(value) && value >= 0)) return false;
    if (candidate.sortMode !== 'none' && candidate.sortMode !== 'descending' && candidate.sortMode !== 'ascending') return false;
    if (typeof candidate.normaliseToHundred !== 'boolean') return false;
    if (candidate.labelMode !== 'none' && candidate.labelMode !== 'percentage' && candidate.labelMode !== 'input') return false;
    if (!isFiniteNumber(candidate.progressPercent) || candidate.progressPercent < 0 || candidate.progressPercent > 100) return false;
    if (!isFiniteNumber(candidate.strokeWidth) || candidate.strokeWidth <= 0) return false;
    if (!Array.isArray(candidate.sliceColours) || candidate.sliceColours.length === 0 || !candidate.sliceColours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))) return false;
  }
  if (candidate.type === 'histogram') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!Array.isArray(candidate.binValues) || candidate.binValues.length === 0 || candidate.binValues.length > 256) return false;
    if (!candidate.binValues.every((value) => isFiniteNumber(value) && value >= 0 && value <= 1)) return false;
    if (!isFiniteNumber(candidate.heightScalePercent) || candidate.heightScalePercent <= 0 || candidate.heightScalePercent > 1000) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth <= 0) return false;
    if (typeof candidate.showLuminance !== 'boolean') return false;
    if (typeof candidate.showRed !== 'boolean') return false;
    if (typeof candidate.showGreen !== 'boolean') return false;
    if (typeof candidate.showBlue !== 'boolean') return false;
    if (!Array.isArray(candidate.channelColours) || candidate.channelColours.length !== 4 || !candidate.channelColours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'sunburst') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (typeof candidate.rayCount !== 'number' || !Number.isInteger(candidate.rayCount) || candidate.rayCount < 1 || candidate.rayCount > 360) return false;
    if (!isFiniteNumber(candidate.rayCoveragePercent) || candidate.rayCoveragePercent < 0 || candidate.rayCoveragePercent > 100) return false;
    if (!isFiniteNumber(candidate.rotationOffsetDegrees)) return false;
    if (!isFiniteNumber(candidate.centreXPercent) || candidate.centreXPercent < -100 || candidate.centreXPercent > 200) return false;
    if (!isFiniteNumber(candidate.centreYPercent) || candidate.centreYPercent < -100 || candidate.centreYPercent > 200) return false;
    if (!isFiniteNumber(candidate.motifSize) || candidate.motifSize < 0) return false;
    if (candidate.motifShape !== 'circle' && candidate.motifShape !== 'rect') return false;
    if (typeof candidate.rayColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.rayColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'circular_arrow') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.radius) || candidate.radius <= 0) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth <= 0) return false;
    if (!isFiniteNumber(candidate.headSize) || candidate.headSize < 0) return false;
    if (!isFiniteNumber(candidate.angleDegrees) || candidate.angleDegrees < 0 || candidate.angleDegrees > 360) return false;
    if (!isFiniteNumber(candidate.centreAngleDegrees)) return false;
    if (candidate.headShape !== 'triangle' && candidate.headShape !== 'circle') return false;
    if (typeof candidate.showTailHead !== 'boolean') return false;
    if (typeof candidate.flipVertical !== 'boolean') return false;
    if (typeof candidate.flipHorizontal !== 'boolean') return false;
    if (typeof candidate.arrowColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.arrowColour)) return false;
  }
  if (candidate.type === 'triangle_bracket') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.bracketWidth) || candidate.bracketWidth <= 0) return false;
    if (!isFiniteNumber(candidate.angleDegrees) || candidate.angleDegrees < 1 || candidate.angleDegrees > 180) return false;
    if (!isFiniteNumber(candidate.armLength) || candidate.armLength < 0) return false;
    if (!isFiniteNumber(candidate.offsetDistance) || candidate.offsetDistance < -10000 || candidate.offsetDistance > 10000) return false;
    if (typeof candidate.bracketColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.bracketColour)) return false;
  }
  if (candidate.type === 'tartan_check') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.tileSize) || candidate.tileSize < 10 || candidate.tileSize > 800) return false;
    if (!isFiniteNumber(candidate.blurRadius) || candidate.blurRadius < 0 || candidate.blurRadius > 300) return false;
    if (typeof candidate.baseColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.baseColour)) return false;
    if (typeof candidate.stripeColourA !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.stripeColourA)) return false;
    if (typeof candidate.stripeColourB !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.stripeColourB)) return false;
    if (typeof candidate.lineColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.lineColour)) return false;
  }
  if (candidate.type === 'houndstooth') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.patternSize) || candidate.patternSize < 10 || candidate.patternSize > 200) return false;
    if (typeof candidate.foregroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.foregroundColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'yagasuri') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.arrowWidth) || candidate.arrowWidth < 1 || candidate.arrowWidth > 500) return false;
    if (!isFiniteNumber(candidate.arrowHeight) || candidate.arrowHeight < 1 || candidate.arrowHeight > 500) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 0 || candidate.lineWidth > 100) return false;
    if (typeof candidate.staggered !== 'boolean') return false;
    if (typeof candidate.foregroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.foregroundColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'paper_airplane') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.bodyLength) || candidate.bodyLength < 1 || candidate.bodyLength > 2000) return false;
    if (!isFiniteNumber(candidate.wingWidth) || candidate.wingWidth < 0 || candidate.wingWidth > 1000) return false;
    if (!isFiniteNumber(candidate.foldHeight) || candidate.foldHeight < 0 || candidate.foldHeight > 1000) return false;
    if (!isFiniteNumber(candidate.gap) || candidate.gap < 0 || candidate.gap > 1000) return false;
    if (typeof candidate.followMotionDirection !== 'boolean') return false;
    if (candidate.axisMode !== 0 && candidate.axisMode !== 1) return false;
    if (typeof candidate.fillColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.fillColour)) return false;
  }
  if (candidate.type === 'asanoha_pattern') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.patternSize) || candidate.patternSize < 10 || candidate.patternSize > 500) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 0 || candidate.lineWidth > 50) return false;
    if (typeof candidate.foregroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.foregroundColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'focus_lines_plus') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.rayWidth) || candidate.rayWidth < 0.1 || candidate.rayWidth > 10) return false;
    if (!isFiniteNumber(candidate.gap) || candidate.gap < 1 || candidate.gap > 20) return false;
    if (!isFiniteNumber(candidate.centreRadius) || candidate.centreRadius < 0 || candidate.centreRadius > 800) return false;
    if (!isFiniteNumber(candidate.rotationDegrees) || candidate.rotationDegrees < -720 || candidate.rotationDegrees > 720) return false;
    if (!isFiniteNumber(candidate.centreX)) return false;
    if (!isFiniteNumber(candidate.centreY)) return false;
    if (!isFiniteNumber(candidate.centreJitterPercent) || candidate.centreJitterPercent < 0 || candidate.centreJitterPercent > 100) return false;
    if (!isFiniteNumber(candidate.seed)) return false;
    if (!isFiniteNumber(candidate.keyframeInterval) || candidate.keyframeInterval < 0) return false;
    if (typeof candidate.lineColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.lineColour)) return false;
  }
  if (candidate.type === 'random_line_ex') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.lineCount) || candidate.lineCount < 1 || candidate.lineCount > 100) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 0 || candidate.lineWidth > 2000) return false;
    if (!isFiniteNumber(candidate.threshold) || candidate.threshold < 0 || candidate.threshold > 255) return false;
    if (!isFiniteNumber(candidate.noiseCellSize) || candidate.noiseCellSize < 0 || candidate.noiseCellSize > 50) return false;
    if (!isFiniteNumber(candidate.widthVariance) || candidate.widthVariance < 0 || candidate.widthVariance > 2000) return false;
    if (!isFiniteNumber(candidate.seed)) return false;
    if (typeof candidate.lineColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.lineColour)) return false;
  }
  if (candidate.type === 'hologram') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.tileSize) || candidate.tileSize < 10 || candidate.tileSize > 1000) return false;
    if (!isFiniteNumber(candidate.rotationDegrees) || candidate.rotationDegrees < -720 || candidate.rotationDegrees > 720) return false;
    if (!isFiniteNumber(candidate.gradientAngleDegrees) || candidate.gradientAngleDegrees < -720 || candidate.gradientAngleDegrees > 720) return false;
    if (!isFiniteNumber(candidate.colourMode) || candidate.colourMode < 0 || candidate.colourMode > 2) return false;
    if (typeof candidate.tintColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.tintColour)) return false;
  }
  if (candidate.type === 'protractor') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.radius) || candidate.radius < 1 || candidate.radius > 2000) return false;
    if (!isFiniteNumber(candidate.measuredAngleDegrees) || candidate.measuredAngleDegrees < 0 || candidate.measuredAngleDegrees > 180) return false;
    if (!isFiniteNumber(candidate.tickStepDegrees) || candidate.tickStepDegrees < 1 || candidate.tickStepDegrees > 90) return false;
    if (!isFiniteNumber(candidate.majorTickStepDegrees) || candidate.majorTickStepDegrees < 1 || candidate.majorTickStepDegrees > 180) return false;
    if (!isFiniteNumber(candidate.decimalPlaces) || candidate.decimalPlaces < 0 || candidate.decimalPlaces > 5) return false;
    if (typeof candidate.lineColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.lineColour)) return false;
    if (typeof candidate.textColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.textColour)) return false;
    if (typeof candidate.shadowColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.shadowColour)) return false;
  }
  if (candidate.type === 'shaking_polygon') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 1 || candidate.lineWidth > 100) return false;
    if (!isFiniteNumber(candidate.vertexCount) || candidate.vertexCount < 2 || candidate.vertexCount > 16) return false;
    if (!isFiniteNumber(candidate.fixedDiameter) || candidate.fixedDiameter < 0 || candidate.fixedDiameter > 2000) return false;
    if (!isFiniteNumber(candidate.verticalDistortionPercent) || candidate.verticalDistortionPercent < -100 || candidate.verticalDistortionPercent > 100) return false;
    if (!isFiniteNumber(candidate.repeatCount) || candidate.repeatCount < 1 || candidate.repeatCount > 100) return false;
    if (!isFiniteNumber(candidate.repeatFrequency) || candidate.repeatFrequency < 1) return false;
    if (typeof candidate.fill !== 'boolean') return false;
    if (!isFiniteNumber(candidate.jitterRange) || candidate.jitterRange < 0 || candidate.jitterRange > 2000) return false;
    if (!isFiniteNumber(candidate.jitterInterval) || candidate.jitterInterval < 1) return false;
    if (typeof candidate.stepped !== 'boolean') return false;
    if (typeof candidate.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.colour)) return false;
    if (!isFiniteNumber(candidate.seed)) return false;
  }
  if (candidate.type === 'tone_curve') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.gridDivisions) || candidate.gridDivisions < 1 || candidate.gridDivisions > 16) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 1 || candidate.lineWidth > 100) return false;
    if (!Array.isArray(candidate.curvePoints) || candidate.curvePoints.length < 2 || candidate.curvePoints.length > 64) return false;
    if (!candidate.curvePoints.every((point) => isFiniteNumber(point) && point >= 0 && point <= 1)) return false;
    if (typeof candidate.curveColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.curveColour)) return false;
    if (typeof candidate.gridColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.gridColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'hksy_checker_grid') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (candidate.pattern !== undefined && candidate.pattern !== 'checker-grid' && candidate.pattern !== 'diamond' && candidate.pattern !== 'measured-grid' && candidate.pattern !== 'anchor-line') return false;
    if (!isFiniteNumber(candidate.cellSize) || candidate.cellSize < 1 || candidate.cellSize > 1000) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 0 || candidate.lineWidth > 100) return false;
    if (typeof candidate.checkerEnabled !== 'boolean') return false;
    if (typeof candidate.gridEnabled !== 'boolean') return false;
    if (typeof candidate.foregroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.foregroundColour)) return false;
    if (typeof candidate.secondaryColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.secondaryColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
    if (candidate.paletteColours !== undefined) {
      if (!Array.isArray(candidate.paletteColours)) return false;
      if (candidate.paletteColours.length < 2 || candidate.paletteColours.length > 16) return false;
      if (!candidate.paletteColours.every((colour) => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))) return false;
    }
    if (candidate.separateInterval !== undefined && (!isFiniteNumber(candidate.separateInterval) || candidate.separateInterval < 1 || candidate.separateInterval > 1000)) return false;
    if (candidate.separateLineWidth !== undefined && (!isFiniteNumber(candidate.separateLineWidth) || candidate.separateLineWidth < 0 || candidate.separateLineWidth > 100)) return false;
    if (candidate.anchorPoints !== undefined) {
      if (!Array.isArray(candidate.anchorPoints)) return false;
      if (candidate.anchorPoints.length < 2 || candidate.anchorPoints.length > 16) return false;
      if (!candidate.anchorPoints.every((point) => (
        typeof point === 'object'
        && point !== null
        && isFiniteNumber((point as { x?: unknown }).x)
        && isFiniteNumber((point as { y?: unknown }).y)
        && ((point as { x: number }).x) >= -1000
        && ((point as { x: number }).x) <= 1000
        && ((point as { y: number }).y) >= -1000
        && ((point as { y: number }).y) <= 1000
      ))) return false;
    }
    if (candidate.roundCaps !== undefined && typeof candidate.roundCaps !== 'boolean') return false;
    if (candidate.maxJoinDistance !== undefined && (!isFiniteNumber(candidate.maxJoinDistance) || candidate.maxJoinDistance < 0 || candidate.maxJoinDistance > 300)) return false;
  }
  if (candidate.type === 'getcolor_dot_field') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.columns) || candidate.columns < 1 || candidate.columns > 512) return false;
    if (!isFiniteNumber(candidate.rows) || candidate.rows < 1 || candidate.rows > 512) return false;
    if (!isFiniteNumber(candidate.dotSize) || candidate.dotSize < 0 || candidate.dotSize > 2000) return false;
    if (candidate.dotShape !== undefined && candidate.dotShape !== 'circle' && candidate.dotShape !== 'square' && candidate.dotShape !== 'diamond') return false;
    if (candidate.strokeWidth !== undefined && (!isFiniteNumber(candidate.strokeWidth) || candidate.strokeWidth < 0 || candidate.strokeWidth > 200)) return false;
    if (!isFiniteNumber(candidate.sizeInfluence) || candidate.sizeInfluence < 0 || candidate.sizeInfluence > 4) return false;
    if (!isFiniteNumber(candidate.luminanceInfluence) || candidate.luminanceInfluence < 0 || candidate.luminanceInfluence > 4) return false;
    if (!isFiniteNumber(candidate.hueShiftDegrees) || candidate.hueShiftDegrees < -720 || candidate.hueShiftDegrees > 720) return false;
    if (typeof candidate.alternateRows !== 'boolean') return false;
    if (typeof candidate.foregroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.foregroundColour)) return false;
    if (typeof candidate.secondaryColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.secondaryColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
    if (!isFiniteNumber(candidate.seed)) return false;
  }
  if (candidate.type === 'region_frame') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 0 || candidate.lineWidth > 5000) return false;
    if (candidate.shape !== undefined && candidate.shape !== 'rectangle' && candidate.shape !== 'ellipse' && candidate.shape !== 'cut_corner') return false;
    if (candidate.cornerCut !== undefined && (!isFiniteNumber(candidate.cornerCut) || candidate.cornerCut < 0 || candidate.cornerCut > 5000)) return false;
    if (!isFiniteNumber(candidate.extraWidth) || candidate.extraWidth < -5000 || candidate.extraWidth > 5000) return false;
    if (!isFiniteNumber(candidate.extraHeight) || candidate.extraHeight < -5000 || candidate.extraHeight > 5000) return false;
    if (!isFiniteNumber(candidate.backgroundOpacity) || candidate.backgroundOpacity < 0 || candidate.backgroundOpacity > 1) return false;
    if (typeof candidate.frameColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.frameColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'simple_tube') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.radius) || candidate.radius < 0 || candidate.radius > 9000) return false;
    if (!isFiniteNumber(candidate.depth) || candidate.depth < -12000 || candidate.depth > 12000) return false;
    if (typeof candidate.segments !== 'number' || !Number.isInteger(candidate.segments) || candidate.segments < 3 || candidate.segments > 128) return false;
    if (typeof candidate.rings !== 'number' || !Number.isInteger(candidate.rings) || candidate.rings < 2 || candidate.rings > 128) return false;
    if (!isFiniteNumber(candidate.twistDegrees) || candidate.twistDegrees < -1800 || candidate.twistDegrees > 1800) return false;
    if (!isFiniteNumber(candidate.randomAmount) || candidate.randomAmount < -300 || candidate.randomAmount > 300) return false;
    if (!isFiniteNumber(candidate.strokeWidth) || candidate.strokeWidth < 0 || candidate.strokeWidth > 200) return false;
    if (typeof candidate.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.colour)) return false;
    if (typeof candidate.secondaryColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.secondaryColour)) return false;
    if (candidate.colourPattern !== undefined && candidate.colourPattern !== 'single' && candidate.colourPattern !== 'ring' && candidate.colourPattern !== 'depth') return false;
    if (candidate.fogStrength !== undefined && (!isFiniteNumber(candidate.fogStrength) || candidate.fogStrength < 0 || candidate.fogStrength > 1)) return false;
    if (candidate.fogColour !== undefined && (typeof candidate.fogColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.fogColour))) return false;
    if (!isFiniteNumber(candidate.seed)) return false;
    if (typeof candidate.torus !== 'boolean') return false;
  }
  if (candidate.type === 'sphere_dots') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.radius) || candidate.radius < 1 || candidate.radius > 5000) return false;
    if (typeof candidate.columns !== 'number' || !Number.isInteger(candidate.columns) || candidate.columns < 3 || candidate.columns > 256) return false;
    if (typeof candidate.rows !== 'number' || !Number.isInteger(candidate.rows) || candidate.rows < 2 || candidate.rows > 256) return false;
    if (!isFiniteNumber(candidate.rotationDegrees) || candidate.rotationDegrees < -1000 || candidate.rotationDegrees > 1000) return false;
    if (!isFiniteNumber(candidate.offsetDegrees) || candidate.offsetDegrees < -360 || candidate.offsetDegrees > 360) return false;
    if (!isFiniteNumber(candidate.luminanceInfluence) || candidate.luminanceInfluence < -5000 || candidate.luminanceInfluence > 5000) return false;
    if (!isFiniteNumber(candidate.pointSize) || candidate.pointSize < 0 || candidate.pointSize > 200) return false;
    if (!isFiniteNumber(candidate.latitudeLineWidth) || candidate.latitudeLineWidth < 0 || candidate.latitudeLineWidth > 100) return false;
    if (typeof candidate.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.colour)) return false;
    if (typeof candidate.secondaryColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.secondaryColour)) return false;
    if (!isFiniteNumber(candidate.seed)) return false;
    if (typeof candidate.planeMode !== 'boolean') return false;
  }
  if (candidate.type === 'spherical_field') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.radius) || candidate.radius < 0 || candidate.radius > 5000) return false;
    if (!isFiniteNumber(candidate.strength) || candidate.strength < -200 || candidate.strength > 200) return false;
    if (!isFiniteNumber(candidate.colourAmount) || candidate.colourAmount < -100 || candidate.colourAmount > 100) return false;
    if (!isFiniteNumber(candidate.alphaAmount) || candidate.alphaAmount < -100 || candidate.alphaAmount > 100) return false;
    if (!isFiniteNumber(candidate.lineWidth) || candidate.lineWidth < 0 || candidate.lineWidth > 100) return false;
    if (typeof candidate.ringCount !== 'number' || !Number.isInteger(candidate.ringCount) || candidate.ringCount < 1 || candidate.ringCount > 64) return false;
    if (typeof candidate.vectorCount !== 'number' || !Number.isInteger(candidate.vectorCount) || candidate.vectorCount < 0 || candidate.vectorCount > 256) return false;
    if (typeof candidate.fieldColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.fieldColour)) return false;
    if (typeof candidate.secondaryColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.secondaryColour)) return false;
    if (!isFiniteNumber(candidate.backgroundOpacity) || candidate.backgroundOpacity < 0 || candidate.backgroundOpacity > 1) return false;
    if (typeof candidate.container !== 'boolean') return false;
    if (!isFiniteNumber(candidate.seed)) return false;
  }
  return true;
};

const parseLayers = (value: unknown): LayerState[] | undefined => {
  if (value == null) return undefined;
  if (!Array.isArray(value)) return undefined;
  if (!value.every((layer) => isLayerState(layer))) return undefined;
  return value.map((layer) => ({ ...layer }));
};

const isCameraState = (value: unknown): value is CameraState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.centreOffsetX)
    && isFiniteNumber(candidate.centreOffsetY)
    && isFiniteNumber(candidate.zoom)
    && isFiniteNumber(candidate.rotationDeg)
  );
};

const parseSceneEntry = (value: unknown): SceneData | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') return null;
  if (typeof candidate.name !== 'string') return null;
  if (!isFiniteNumber(candidate.duration)) return null;
  const layers = parseLayers(candidate.layers) ?? createDefaultLayers();
  const objectCandidates = candidate.objects;
  if (!Array.isArray(objectCandidates)) return null;
  if (!objectCandidates.every((obj) => isTimelineObject(obj))) return null;
  const camera = isCameraState(candidate.camera) ? candidate.camera : createDefaultCamera();
  const stageCamera3D = isStageCamera3D(candidate.stageCamera3D)
    ? sanitiseStageCamera3D(candidate.stageCamera3D as SceneData['stageCamera3D'])
    : createDefaultStageCamera3D();
  return {
    id: candidate.id,
    name: candidate.name,
    duration: Math.max(1, candidate.duration as number),
    layers,
    objects: objectCandidates as TimelineObject[],
    camera,
    stageCamera3D
  };
};

const migrateV1ToV2 = (candidate: ProjectFileV1): ProjectFileV2 => {
  const layers = parseLayers(candidate.layers) ?? createDefaultLayers();
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION_V2,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
    projectSettings: candidate.projectSettings,
    activeSceneId: LEGACY_SCENE_ID,
    scenes: [{
      id: LEGACY_SCENE_ID,
      name: 'Scene 1',
      duration: typeof candidate.duration === 'number' && Number.isFinite(candidate.duration)
        ? Math.max(1, candidate.duration)
        : 30,
      layers,
      objects: candidate.objects,
      camera: createDefaultCamera(),
      stageCamera3D: createDefaultStageCamera3D()
    }]
  };
};

const sanitiseObjectForSave = (obj: TimelineObject): TimelineObject => {
  if (obj.type === 'psd') {
    const psd = obj as PsdObject;
    const snapshot: PsdObject = {
      ...psd,
      file: undefined,
      rootLayer: psd.rootLayer ? stripPsdLayerNodeForPersistence(psd.rootLayer) : psd.rootLayer,
    };
    return JSON.parse(JSON.stringify(snapshot)) as TimelineObject;
  }
  return JSON.parse(JSON.stringify(obj)) as TimelineObject;
};

const normaliseBinaryData = (value: unknown): ArrayBuffer | null => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const copied = new Uint8Array(view.byteLength);
    copied.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copied.buffer;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return new Uint8Array(value).buffer;
  }

  return null;
};

const extractFileName = (filePath: string): string => {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'unknown.psd';
};

const haveMatchingPsdLayerShape = (savedNode: PsdLayerNode, restoredNode: PsdLayerNode): boolean => (
  savedNode.name === restoredNode.name && savedNode.isGroup === restoredNode.isGroup
);

const mergeRestoredPsdActiveLayerIds = (
  restoredRoot: PsdLayerNode,
  restoredActiveLayerIds: Record<string, boolean>,
  savedRoot: PsdLayerNode | undefined,
  savedActiveLayerIds: Record<string, boolean>
): Record<string, boolean> => {
  const merged = { ...restoredActiveLayerIds };

  Object.entries(savedActiveLayerIds).forEach(([id, active]) => {
    if (Object.prototype.hasOwnProperty.call(merged, id)) {
      merged[id] = Boolean(active);
    }
  });

  const applySavedTreeState = (savedNode: PsdLayerNode, restoredNode: PsdLayerNode) => {
    if (!haveMatchingPsdLayerShape(savedNode, restoredNode)) return;
    if (Object.prototype.hasOwnProperty.call(savedActiveLayerIds, savedNode.id)) {
      merged[restoredNode.id] = Boolean(savedActiveLayerIds[savedNode.id]);
    }

    const childCount = Math.min(savedNode.children.length, restoredNode.children.length);
    for (let i = 0; i < childCount; i += 1) {
      applySavedTreeState(savedNode.children[i], restoredNode.children[i]);
    }
  };

  if (savedRoot) {
    applySavedTreeState(savedRoot, restoredRoot);
  }

  merged.root = true;
  return merged;
};

const readFileBytes = async (filePath: string): Promise<ArrayBuffer | null> => {
  try {
    const response = await window.ipcRenderer.invoke('read-file-bytes', { filePath }) as ReadFileBytesResponse;
    if (!response || response.success !== true) return null;
    return normaliseBinaryData(response.data);
  } catch {
    return null;
  }
};

const restorePsdObjectFromFile = async (
  savedObject: PsdObject,
  projectSettings: ProjectSettings
): Promise<PsdObject | null> => {
  const filePath = savedObject.filePath?.trim();
  if (!filePath) return null;

  const psdBuffer = await readFileBytes(filePath);
  if (!psdBuffer) return null;

  try {
    const parsed = await parsePsdArrayBufferAsObject(
      psdBuffer,
      extractFileName(filePath),
      savedObject.startTime,
      projectSettings.width,
      projectSettings.height
    );

    let nextActiveLayerIds = parsed.psdObject.activeLayerIds;
    let nextLayerTree = parsed.psdObject.layerTree;
    const savedActive = savedObject.activeLayerIds;
    if (parsed.psdObject.rootLayer && nextActiveLayerIds && savedActive) {
      nextActiveLayerIds = mergeRestoredPsdActiveLayerIds(
        parsed.psdObject.rootLayer,
        nextActiveLayerIds,
        savedObject.rootLayer,
        savedActive
      );
      nextLayerTree = buildPsdLayerTree(parsed.psdObject.rootLayer, nextActiveLayerIds);
    }

    return {
      ...parsed.psdObject,
      ...savedObject,
      src: parsed.psdObject.src,
      rootLayer: parsed.psdObject.rootLayer,
      layerTree: nextLayerTree,
      activeLayerIds: nextActiveLayerIds,
      file: undefined,
      filePath,
    };
  } catch {
    return null;
  }
};

const restoreObjectFromProject = async (
  obj: TimelineObject,
  projectSettings: ProjectSettings
): Promise<TimelineObject> => {
  if (obj.type === 'psd') {
    const restored = await restorePsdObjectFromFile(obj as PsdObject, projectSettings);
    if (restored) return restored;
    return { ...obj, file: undefined };
  }

  if (obj.type === 'image' || obj.type === 'video' || obj.type === 'audio') {
    if (typeof obj.filePath === 'string' && obj.filePath.trim() !== '') {
      return {
        ...obj,
        src: toFileProtocolUrl(obj.filePath),
      };
    }
  }

  return obj;
};

export const buildProjectFileData = (input: {
  projectSettings: ProjectSettings;
  scenes: SceneData[];
  activeSceneId: string;
  objects: TimelineObject[];
  layers: LayerState[];
  duration: number;
  camera: CameraState;
  stageCamera3D: SceneData['stageCamera3D'];
}): ProjectFileV2 => {
  const flushed = flushActiveIntoScenes(
    input.scenes,
    input.activeSceneId,
    input.objects,
    input.layers,
    input.duration,
    input.camera,
    input.stageCamera3D
  );
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION_V2,
    savedAt: new Date().toISOString(),
    projectSettings: input.projectSettings,
    activeSceneId: input.activeSceneId,
    scenes: flushed.map((scene) => ({
      ...scene,
      layers: scene.layers.map((layer) => ({ ...layer })),
      camera: { ...scene.camera },
      stageCamera3D: sanitiseStageCamera3D(scene.stageCamera3D),
      objects: scene.objects.map(sanitiseObjectForSave)
    }))
  };
};

/** テストおよび検証用：パース済み JSON を v2 プロジェクトとして検証する */
export const parseProjectPayloadV2 = (parsed: unknown): ProjectFileV2 => {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('プロジェクトファイル形式が不正です。');
  }
  const candidate = parsed as Partial<ProjectFileV1> & Partial<ProjectFileV2>;
  if (candidate.format !== PROJECT_FILE_FORMAT) {
    throw new Error('対応していないプロジェクトファイル形式です。');
  }
  if (!isProjectSettings(candidate.projectSettings)) {
    throw new Error('プロジェクト設定が不正です。');
  }
  if (candidate.version !== PROJECT_FILE_VERSION_V2) {
    throw new Error('対応していないプロジェクトファイル形式です。');
  }
  const rawScenes = (parsed as Record<string, unknown>).scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error('シーン一覧が不正です。');
  }
  const scenes = rawScenes
    .map((entry) => parseSceneEntry(entry))
    .filter((entry): entry is SceneData => entry !== null);
  if (scenes.length !== rawScenes.length) {
    throw new Error('シーン一覧に不正な要素が含まれています。');
  }
  const activeSceneId = typeof candidate.activeSceneId === 'string' && candidate.activeSceneId.trim() !== ''
    ? candidate.activeSceneId
    : scenes[0].id;
  if (!scenes.some((scene) => scene.id === activeSceneId)) {
    throw new Error('アクティブシーン ID が存在しません。');
  }
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION_V2,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
    projectSettings: candidate.projectSettings,
    activeSceneId,
    scenes
  };
};

export const saveProjectFileWithDialog = async (
  projectFile: ProjectFileV2
): Promise<SaveProjectResponse> => {
  try {
    const response = await window.ipcRenderer.invoke('save-project-file', {
      data: JSON.stringify(projectFile, null, 2),
      defaultName: 'project.uxfd.json',
    }) as SaveProjectResponse;
    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const openProjectFileWithDialog = async (): Promise<{
  filePath: string;
  project: ProjectFileV2;
} | null> => {
  const response = await window.ipcRenderer.invoke('open-project-file') as OpenProjectResponse;
  if (!response || response.success !== true) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.data);
  } catch {
    throw new Error('プロジェクトファイルの JSON 解析に失敗しました。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('プロジェクトファイル形式が不正です。');
  }

  const candidate = parsed as Partial<ProjectFileV1> & Partial<ProjectFileV2>;
  if (candidate.format !== PROJECT_FILE_FORMAT) {
    throw new Error('対応していないプロジェクトファイル形式です。');
  }
  if (!isProjectSettings(candidate.projectSettings)) {
    throw new Error('プロジェクト設定が不正です。');
  }

  if (candidate.version === PROJECT_FILE_VERSION_V1) {
    const objectCandidates = (parsed as Record<string, unknown>).objects;
    if (!Array.isArray(objectCandidates)) {
      throw new Error('オブジェクト一覧が不正です。');
    }
    if (!objectCandidates.every((obj) => isTimelineObject(obj))) {
      throw new Error('オブジェクト一覧に不正な要素が含まれています。');
    }
    const v1: ProjectFileV1 = {
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION_V1,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
      projectSettings: candidate.projectSettings,
      duration: typeof candidate.duration === 'number' && Number.isFinite(candidate.duration)
        ? Math.max(1, candidate.duration)
        : 30,
      layers: parseLayers(candidate.layers),
      objects: objectCandidates as TimelineObject[]
    };
    return {
      filePath: response.filePath,
      project: migrateV1ToV2(v1)
    };
  }

  if (candidate.version === PROJECT_FILE_VERSION_V2) {
    return {
      filePath: response.filePath,
      project: parseProjectPayloadV2(parsed)
    };
  }

  throw new Error('対応していないプロジェクトファイル形式です。');
};

export const restoreProjectObjects = async (
  objects: TimelineObject[],
  projectSettings: ProjectSettings
): Promise<TimelineObject[]> => {
  const restored = await Promise.all(
    objects.map((obj) => restoreObjectFromProject(obj, projectSettings))
  );
  return restored;
};
