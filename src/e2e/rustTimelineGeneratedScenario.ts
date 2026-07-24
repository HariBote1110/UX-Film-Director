import type { LayerState, ProjectSettings, ShapeObject, TimelineObject } from '../types';
import { useStore } from '../store/useStore';
import { buildGetColorDotFieldObject } from '../utils/objectFactories/getColorDotFieldObjectFactory';
import { buildHksyCheckerGridObject } from '../utils/objectFactories/hksyCheckerGridObjectFactory';
import { buildAviUtlSimpleTubeObject } from '../utils/objectFactories/simpleTubeObjectFactory';
import { buildDefaultStandardParticleObject } from '../utils/objectFactories/particleObjectFactory';

export interface RustTimelineGeneratedScenario {
  settings: ProjectSettings;
  layers: LayerState[];
  objects: TimelineObject[];
}

export interface RustTimelineGeneratedE2eResult {
  ok: boolean;
  addedIds: string[];
  objectCount: number;
}

export const buildRustTimelineGeneratedScenario = (
  copiesPerKind = 1,
): RustTimelineGeneratedScenario => {
  const safeCopiesPerKind = Number.isInteger(copiesPerKind)
    ? Math.min(20, Math.max(1, copiesPerKind))
    : 1;
  const settings: ProjectSettings = {
    width: 1920,
    height: 1080,
    fps: 60,
    sampleRate: 48_000,
    editorMode: '2d',
  };
  const layers: LayerState[] = Array.from({ length: safeCopiesPerKind * 5 + 1 }, (_, layer) => ({
    id: `rust-e2e-layer-${layer}`,
    name: `Rust E2E ${layer}`,
    visible: true,
    locked: false,
  }));
  const objectWidth = safeCopiesPerKind === 1 ? 560 : 300;
  const objectHeight = safeCopiesPerKind === 1 ? 420 : 160;
  const objects: TimelineObject[] = Array.from(
    { length: safeCopiesPerKind },
    (_, copyIndex): TimelineObject[] => {
      const idSuffix = copyIndex === 0 ? '' : `-${copyIndex + 1}`;
      const firstObjectIndex = copyIndex * 5;
      const positionFor = (objectIndex: number) => ({
        x: 30 + (objectIndex % 6) * 315,
        y: 40 + Math.floor(objectIndex / 6) * 170,
      });
      const getColorPosition = positionFor(firstObjectIndex);
      const hksyPosition = positionFor(firstObjectIndex + 1);
      const simpleTubePosition = positionFor(firstObjectIndex + 2);
      const particlePosition = positionFor(firstObjectIndex + 3);
      const spotLightPosition = positionFor(firstObjectIndex + 4);
      return [{
      ...buildGetColorDotFieldObject({
        id: `rust-e2e-getcolor${idSuffix}`,
        projectWidth: settings.width,
        projectHeight: settings.height,
        startTime: 0,
        layer: firstObjectIndex + 1,
      }),
      ...getColorPosition,
      endX: getColorPosition.x,
      endY: getColorPosition.y,
      width: objectWidth,
      height: objectHeight,
    },
    {
      ...buildHksyCheckerGridObject({
        id: `rust-e2e-hksy${idSuffix}`,
        projectWidth: settings.width,
        projectHeight: settings.height,
        startTime: 0,
        layer: firstObjectIndex + 2,
      }),
      ...hksyPosition,
      endX: hksyPosition.x,
      endY: hksyPosition.y,
      width: objectWidth,
      height: objectHeight,
    },
    {
      ...buildAviUtlSimpleTubeObject({
        id: `rust-e2e-simple-tube${idSuffix}`,
        projectWidth: settings.width,
        projectHeight: settings.height,
        startTime: 0,
        layer: firstObjectIndex + 3,
      }),
      ...simpleTubePosition,
      endX: simpleTubePosition.x,
      endY: simpleTubePosition.y,
      width: objectWidth,
      height: objectHeight,
    },
    {
      ...buildDefaultStandardParticleObject({
        id: `rust-e2e-particle${idSuffix}`,
        projectWidth: settings.width,
        projectHeight: settings.height,
        startTime: 0,
        layer: firstObjectIndex + 4,
      }),
      ...particlePosition,
      endX: particlePosition.x,
      endY: particlePosition.y,
      width: objectWidth,
      height: objectHeight,
      particleCount: 96,
      lifetimeSeconds: 2,
    },
    {
      id: `rust-e2e-spotlight${idSuffix}`,
      type: 'shape',
      name: 'Rust E2E SpotLight',
      layer: firstObjectIndex + 5,
      startTime: 0,
      duration: 5,
      ...spotLightPosition,
      endX: spotLightPosition.x,
      endY: spotLightPosition.y,
      width: objectWidth,
      height: objectHeight,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      easing: 'linear',
      shapeType: 'rect',
      fill: '#111111',
      filters: [{
        id: `rust-e2e-spotlight-filter${idSuffix}`,
        type: 'spot_light',
        enabled: true,
        params: {
          centreX: 0.5,
          centreY: 0.5,
          radius: 0.75,
          intensity: 0.9,
          colour: '#fff4c2',
        },
      }],
    } satisfies ShapeObject];
    },
  ).flat();
  return { settings, layers, objects };
};

export const installRustTimelineGeneratedHarness = (): void => {
  (window as typeof window & {
    __UXFD_RUST_TIMELINE_GENERATED_E2E_ADD__?: (
      copiesPerKind?: number,
    ) => RustTimelineGeneratedE2eResult;
  }).__UXFD_RUST_TIMELINE_GENERATED_E2E_ADD__ = (copiesPerKind = 1) => {
    const scenario = buildRustTimelineGeneratedScenario(copiesPerKind);
    const state = useStore.getState();
    scenario.objects.forEach((object) => state.addObject(object));
    state.setTime(0);
    state.setDuration(5);
    return {
      ok: true,
      addedIds: scenario.objects.map((object) => object.id),
      objectCount: useStore.getState().objects.length,
    };
  };
};
