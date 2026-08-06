import type {
  AudioObject,
  ImageObject,
  LayerState,
  ProjectSettings,
  ShapeObject,
  TextObject,
  TimelineObject,
  VideoObject,
} from '../types';
import type { EasingType } from '../utils/easings';
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

export interface AgentBlurFilterSpec {
  type: 'blur';
  strength?: number;
  quality?: number;
}

export type AgentFilterSpec = AgentBlurFilterSpec;

export interface AgentGradientSpec {
  type: 'linear' | 'radial';
  colours: string[];
  stops: number[];
  direction?: number;
}

const AGENT_OBJECT_KINDS_REQUIRING_SRC = new Set(['image', 'video', 'audio']);

export interface AgentAlignSpec {
  x?: 'start' | 'center' | 'end';
  y?: 'start' | 'center' | 'end';
}

export interface AgentObjectBase {
  id: string;
  kind: 'shape' | 'text' | 'particle' | 'dotField' | 'shatteredSphere' | 'image' | 'video' | 'audio';
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
  filters?: AgentFilterSpec[];
  /** 指定すると x/y の代わりに整列基準で位置を決める。基準枠は relativeTo 未指定ならプロジェクト全体。 */
  align?: AgentAlignSpec;
  /** 整列の基準にする、objects配列内で先に定義したオブジェクトのid。 */
  relativeTo?: string;
  /** align:start/end のときに基準枠の端から空ける距離(px)。既定0。 */
  padding?: number;
}

export type AgentObjectSpec =
  | (AgentObjectBase & {
    kind: 'shape';
    shape: ShapeObject['shapeType'];
    fill: string;
    cornerRadius?: number;
    gradient?: AgentGradientSpec;
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
  })
  | (AgentObjectBase & {
    kind: 'image';
    src: string;
  })
  | (AgentObjectBase & {
    kind: 'video';
    src: string;
    volume?: number;
    muted?: boolean;
  })
  | (AgentObjectBase & {
    kind: 'audio';
    src: string;
    volume?: number;
    muted?: boolean;
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
  'image',
  'video',
  'audio',
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
  if (AGENT_OBJECT_KINDS_REQUIRING_SRC.has(kind)) {
    requireString(value.src, `${path}.src`);
  }
  if (value.gradient !== undefined) {
    if (!isRecord(value.gradient)) throw new Error(`${path}.gradient はオブジェクトで指定してください。`);
    const gradientType = requireString(value.gradient.type, `${path}.gradient.type`);
    if (gradientType !== 'linear' && gradientType !== 'radial') {
      throw new Error(`${path}.gradient.type は linear か radial で指定してください。`);
    }
    if (!Array.isArray(value.gradient.colours) || value.gradient.colours.length < 2) {
      throw new Error(`${path}.gradient.colours は2件以上の配列で指定してください。`);
    }
    if (!Array.isArray(value.gradient.stops) || value.gradient.stops.length !== value.gradient.colours.length) {
      throw new Error(`${path}.gradient.stops は colours と同じ件数の配列で指定してください。`);
    }
  }
  if (value.filters !== undefined) {
    if (!Array.isArray(value.filters)) throw new Error(`${path}.filters は配列で指定してください。`);
    value.filters.forEach((filter, filterIndex) => {
      const filterPath = `${path}.filters[${filterIndex}]`;
      if (!isRecord(filter)) throw new Error(`${filterPath} はオブジェクトで指定してください。`);
      const filterType = requireString(filter.type, `${filterPath}.type`);
      if (filterType !== 'blur') {
        throw new Error(`${filterPath}.type「${filterType}」は未対応です。`);
      }
    });
  }
  if (value.align !== undefined) {
    if (!isRecord(value.align)) throw new Error(`${path}.align はオブジェクトで指定してください。`);
    const validAlignments = new Set(['start', 'center', 'end']);
    if (value.align.x !== undefined && !validAlignments.has(value.align.x as string)) {
      throw new Error(`${path}.align.x は start/center/end のいずれかで指定してください。`);
    }
    if (value.align.y !== undefined && !validAlignments.has(value.align.y as string)) {
      throw new Error(`${path}.align.y は start/center/end のいずれかで指定してください。`);
    }
  }
  if (value.relativeTo !== undefined) {
    requireString(value.relativeTo, `${path}.relativeTo`);
  }
  if (value.padding !== undefined) {
    requireFiniteNumber(value.padding, `${path}.padding`);
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

const buildFilters = (object: AgentObjectBase) => object.filters?.map((filter, index) => ({
  id: `${object.id}-filter-${index}`,
  type: 'blur' as const,
  enabled: true,
  params: {
    strength: filter.strength ?? 20,
    quality: filter.quality ?? 2,
  },
}));

const buildGradient = (gradient: AgentGradientSpec | undefined) => (gradient === undefined ? undefined : {
  enabled: true,
  type: gradient.type,
  colours: gradient.colours,
  stops: gradient.stops,
  direction: gradient.direction ?? 0,
});

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
    filters: buildFilters(object),
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
        gradient: buildGradient(object.gradient),
      } satisfies ShapeObject;
    case 'image':
      return {
        ...common,
        type: 'image',
        name,
        src: object.src,
        width: object.width ?? 320,
        height: object.height ?? 180,
      } satisfies ImageObject;
    case 'video':
      return {
        ...common,
        type: 'video',
        name,
        src: object.src,
        width: object.width ?? 320,
        height: object.height ?? 180,
        volume: object.volume ?? 1,
        muted: object.muted ?? false,
      } satisfies VideoObject;
    case 'audio':
      return {
        ...common,
        type: 'audio',
        name,
        src: object.src,
        volume: object.volume ?? 1,
        muted: object.muted ?? false,
      } satisfies AudioObject;
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

const LAYOUT_DEFAULT_WIDTH = 320;
const LAYOUT_DEFAULT_HEIGHT = 180;

interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const resolveAlignedAxis = (
  alignment: 'start' | 'center' | 'end' | undefined,
  frameStart: number,
  frameSize: number,
  ownSize: number,
  padding: number,
  explicit: number | undefined,
  projectCentre: number,
): number => {
  if (alignment === 'start') return frameStart + padding;
  if (alignment === 'end') return frameStart + frameSize - ownSize - padding;
  if (alignment === 'center') return Math.round(frameStart + frameSize / 2 - ownSize / 2);
  return explicit ?? projectCentre;
};

const resolveObjectPosition = (
  object: AgentObjectBase,
  layoutById: Map<string, LayoutBox>,
  project: AgentProjectSettings,
): { x: number; y: number } => {
  const projectCentreX = Math.round(project.width / 2);
  const projectCentreY = Math.round(project.height / 2);
  if (object.align === undefined) {
    return { x: object.x ?? projectCentreX, y: object.y ?? projectCentreY };
  }
  const width = object.width ?? LAYOUT_DEFAULT_WIDTH;
  const height = object.height ?? LAYOUT_DEFAULT_HEIGHT;
  const padding = object.padding ?? 0;
  let frame: LayoutBox = { x: 0, y: 0, width: project.width, height: project.height };
  if (object.relativeTo !== undefined) {
    const reference = layoutById.get(object.relativeTo);
    if (reference === undefined) {
      throw new Error(`オブジェクト「${object.id}」のrelativeTo「${object.relativeTo}」が見つかりません。relativeToはobjects配列内で先に定義したIDのみ参照できます。`);
    }
    frame = reference;
  }
  return {
    x: resolveAlignedAxis(object.align.x, frame.x, frame.width, width, padding, object.x, projectCentreX),
    y: resolveAlignedAxis(object.align.y, frame.y, frame.height, height, padding, object.y, projectCentreY),
  };
};

export const buildAgentProjectFile = (input: unknown): ProjectFileV2 => {
  const spec = parseAgentProjectSpec(input);
  const layerIndexById = new Map(spec.layers.map((layer, index) => [layer.id, index]));
  const layoutById = new Map<string, LayoutBox>();
  const objects = spec.objects.map((object) => {
    const layer = layerIndexById.get(object.layer);
    if (layer === undefined) {
      throw new Error(`オブジェクト「${object.id}」のレイヤー「${object.layer}」が見つかりません。`);
    }
    const position = resolveObjectPosition(object, layoutById, spec.project);
    const resolvedObject = { ...object, x: position.x, y: position.y };
    layoutById.set(object.id, {
      x: position.x,
      y: position.y,
      width: object.width ?? LAYOUT_DEFAULT_WIDTH,
      height: object.height ?? LAYOUT_DEFAULT_HEIGHT,
    });
    return buildAgentObject(resolvedObject, layer, spec.project);
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
