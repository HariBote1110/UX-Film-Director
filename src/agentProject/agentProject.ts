import type {
  EasingType,
  LayerState,
  ObjectFilter,
  ProjectSettings,
  ShapeObject,
  TextObject,
  TimelineObject,
} from '../types';
import type { ProjectFileV2 } from '../utils/projectFile';
import { buildGetColorDotFieldObject } from '../utils/objectFactories/getColorDotFieldObjectFactory';
import { buildDefaultStandardParticleObject } from '../utils/objectFactories/particleObjectFactory';
import { buildAviUtlShatteredSphereObject } from '../utils/objectFactories/shatteredSphereObjectFactory';
import {
  createDefaultCamera,
  createDefaultLayers,
  createDefaultStageCamera3D,
} from '../utils/sceneState';
import { buildProjectFileData } from '../utils/projectFile';

export const AGENT_PROJECT_SPEC_VERSION = 1 as const;

export interface AgentProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
  duration: number;
  editorMode?: ProjectSettings['editorMode'];
  name?: string;
}

export interface AgentLayerSpec {
  id: string;
  name: string;
  visible?: boolean;
  locked?: boolean;
}

export interface AgentObjectBase {
  id: string;
  kind: 'shape' | 'text' | 'particle' | 'dotField' | 'shatteredSphere';
  layer: string;
  name?: string;
  start: number;
  duration: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  to?: { x: number; y: number };
  easing?: EasingType;
  filters?: ObjectFilter[];
}

export type AgentObjectSpec =
  | (AgentObjectBase & {
    kind: 'shape';
    shape: ShapeObject['shapeType'];
    fill: string;
    cornerRadius?: number;
  })
  | (AgentObjectBase & {
    kind: 'text';
    text: string;
    fontSize?: number;
    fontFamily?: string;
    fill?: string;
    textAlignment?: TextObject['textAlignment'];
    letterSpacing?: number;
    textStroke?: TextObject['textStroke'];
    textShadow?: TextObject['textShadow'];
  })
  | (AgentObjectBase & {
    kind: 'particle';
    particleCount?: number;
    seed?: number;
    spread?: number;
    speed?: number;
    size?: number;
    colour?: string;
    lifetimeSeconds?: number;
  })
  | (AgentObjectBase & {
    kind: 'dotField';
    dotSize?: number;
    columns?: number;
    rows?: number;
    foregroundColour?: string;
    secondaryColour?: string;
    backgroundColour?: string;
  })
  | (AgentObjectBase & {
    kind: 'shatteredSphere';
    colour?: string;
    seed?: number;
  });

export interface AgentProjectSpec {
  version: typeof AGENT_PROJECT_SPEC_VERSION;
  project: AgentProjectSettings;
  layers: AgentLayerSpec[];
  objects: AgentObjectSpec[];
}

const AGENT_OBJECT_KINDS = new Set<AgentObjectSpec['kind']>([
  'shape',
  'text',
  'particle',
  'dotField',
  'shatteredSphere',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const requireFiniteNumber = (value: unknown, path: string, positive = false): number => {
  if (!isFiniteNumber(value) || (positive && value <= 0)) {
    throw new Error(`${path} は${positive ? '正の' : ''}数値で指定してください。`);
  }
  return value;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} は空でない文字列で指定してください。`);
  }
  return value;
};

const validateAgentObject = (value: unknown, index: number): void => {
  const path = `objects[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} はオブジェクトで指定してください。`);
  requireString(value.id, `${path}.id`);
  const kind = requireString(value.kind, `${path}.kind`);
  if (!AGENT_OBJECT_KINDS.has(kind as AgentObjectSpec['kind'])) {
    throw new Error(`${path}.kind「${kind}」は未対応です。`);
  }
  requireString(value.layer, `${path}.layer`);
  requireFiniteNumber(value.start, `${path}.start`);
  requireFiniteNumber(value.duration, `${path}.duration`, true);
  if (value.to !== undefined) {
    if (!isRecord(value.to)) throw new Error(`${path}.to は座標オブジェクトで指定してください。`);
    requireFiniteNumber(value.to.x, `${path}.to.x`);
    requireFiniteNumber(value.to.y, `${path}.to.y`);
  }
};

export const parseAgentProjectSpec = (input: unknown): AgentProjectSpec => {
  if (!isRecord(input)) throw new Error('エージェント用プロジェクトはJSONオブジェクトで指定してください。');
  if (input.version !== AGENT_PROJECT_SPEC_VERSION) {
    throw new Error(`version は ${AGENT_PROJECT_SPEC_VERSION} を指定してください。`);
  }

  if (!isRecord(input.project)) throw new Error('project はオブジェクトで指定してください。');
  const project = input.project;
  requireFiniteNumber(project.width, 'project.width', true);
  requireFiniteNumber(project.height, 'project.height', true);
  requireFiniteNumber(project.fps, 'project.fps', true);
  requireFiniteNumber(project.sampleRate, 'project.sampleRate', true);
  requireFiniteNumber(project.duration, 'project.duration', true);

  if (!Array.isArray(input.layers) || input.layers.length === 0) {
    throw new Error('layers は1件以上指定してください。');
  }
  const layerIds = new Set<string>();
  input.layers.forEach((layer, index) => {
    if (!isRecord(layer)) throw new Error(`layers[${index}] はオブジェクトで指定してください。`);
    const id = requireString(layer.id, `layers[${index}].id`);
    requireString(layer.name, `layers[${index}].name`);
    if (layerIds.has(id)) throw new Error(`レイヤーID「${id}」が重複しています。`);
    layerIds.add(id);
  });

  if (!Array.isArray(input.objects)) throw new Error('objects は配列で指定してください。');
  input.objects.forEach(validateAgentObject);

  return input as unknown as AgentProjectSpec;
};

const buildLayers = (spec: AgentProjectSpec): LayerState[] => {
  const layers = createDefaultLayers();
  spec.layers.forEach((layer, index) => {
    layers[index] = {
      name: layer.name,
      visible: layer.visible ?? true,
      locked: layer.locked ?? false,
    };
  });
  return layers;
};

const buildCommonObject = (object: AgentObjectBase, layer: number, project: AgentProjectSettings) => {
  const x = object.x ?? Math.round(project.width / 2);
  const y = object.y ?? Math.round(project.height / 2);
  const common = {
    id: object.id,
    layer,
    startTime: object.start,
    duration: object.duration,
    x,
    y,
    rotation: object.rotation ?? 0,
    scaleX: object.scaleX ?? 1,
    scaleY: object.scaleY ?? 1,
    opacity: object.opacity ?? 1,
    enableAnimation: object.to !== undefined,
    endX: object.to?.x ?? x,
    endY: object.to?.y ?? y,
    easing: object.easing ?? 'linear',
    filters: object.filters,
  };
  return common;
};

const buildAgentObject = (
  object: AgentObjectSpec,
  layer: number,
  project: AgentProjectSettings,
): TimelineObject => {
  const common = buildCommonObject(object, layer, project);
  const name = object.name ?? object.id;

  switch (object.kind) {
    case 'shape':
      return {
        ...common,
        type: 'shape',
        name,
        width: object.width ?? 320,
        height: object.height ?? 180,
        shapeType: object.shape,
        fill: object.fill,
        cornerRadius: object.cornerRadius,
      } satisfies ShapeObject;
    case 'text':
      return {
        ...common,
        type: 'text',
        name,
        text: object.text,
        fontSize: object.fontSize ?? 64,
        fontFamily: object.fontFamily ?? 'Arial',
        fill: object.fill ?? '#ffffff',
        textAlignment: object.textAlignment ?? 'left',
        letterSpacing: object.letterSpacing ?? 0,
        textStroke: object.textStroke,
        textShadow: object.textShadow,
      } satisfies TextObject;
    case 'particle': {
      const base = buildDefaultStandardParticleObject({
        id: object.id,
        projectWidth: project.width,
        projectHeight: project.height,
        startTime: object.start,
        layer,
      });
      return {
        ...base,
        ...common,
        name,
        type: 'particle',
        width: object.width ?? base.width,
        height: object.height ?? base.height,
        particleCount: object.particleCount ?? base.particleCount,
        seed: object.seed ?? base.seed,
        spread: object.spread ?? base.spread,
        speed: object.speed ?? base.speed,
        size: object.size ?? base.size,
        colour: object.colour ?? base.colour,
        lifetimeSeconds: object.lifetimeSeconds ?? base.lifetimeSeconds,
      };
    }
    case 'dotField': {
      const base = buildGetColorDotFieldObject({
        id: object.id,
        projectWidth: project.width,
        projectHeight: project.height,
        startTime: object.start,
        layer,
      });
      return {
        ...base,
        ...common,
        name,
        width: object.width ?? base.width,
        height: object.height ?? base.height,
        columns: object.columns ?? base.columns,
        rows: object.rows ?? base.rows,
        dotSize: object.dotSize ?? base.dotSize,
        foregroundColour: object.foregroundColour ?? base.foregroundColour,
        secondaryColour: object.secondaryColour ?? base.secondaryColour,
        backgroundColour: object.backgroundColour ?? base.backgroundColour,
      };
    }
    case 'shatteredSphere': {
      const base = buildAviUtlShatteredSphereObject({
        id: object.id,
        projectWidth: project.width,
        projectHeight: project.height,
        startTime: object.start,
        layer,
      });
      return {
        ...base,
        ...common,
        name,
        width: object.width ?? base.width,
        height: object.height ?? base.height,
        colour: object.colour ?? base.colour,
        seed: object.seed ?? base.seed,
      };
    }
  }
};

export const buildAgentProjectFile = (input: AgentProjectSpec): ProjectFileV2 => {
  const spec = parseAgentProjectSpec(input);
  const layerIndexById = new Map(spec.layers.map((layer, index) => [layer.id, index]));
  const objects = spec.objects.map((object) => {
    const layer = layerIndexById.get(object.layer);
    if (layer === undefined) {
      throw new Error(`オブジェクト「${object.id}」のレイヤー「${object.layer}」が見つかりません。`);
    }
    return buildAgentObject(object, layer, spec.project);
  });
  const settings: ProjectSettings = {
    width: spec.project.width,
    height: spec.project.height,
    fps: spec.project.fps,
    sampleRate: spec.project.sampleRate,
    editorMode: spec.project.editorMode ?? '2d',
  };
  const layers = buildLayers(spec);
  const camera = createDefaultCamera();
  const stageCamera3D = createDefaultStageCamera3D();
  return buildProjectFileData({
    projectSettings: settings,
    scenes: [{
      id: 'agent-scene-1',
      name: spec.project.name ?? 'Agent Scene',
      duration: spec.project.duration,
      layers,
      objects,
      camera,
      stageCamera3D,
    }],
    activeSceneId: 'agent-scene-1',
    objects,
    layers,
    duration: spec.project.duration,
    camera,
    stageCamera3D,
  });
};
