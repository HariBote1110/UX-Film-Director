import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import { useStore } from '../store/useStore';
import { buildGetColorDotFieldObject } from '../utils/objectFactories/getColorDotFieldObjectFactory';
import { buildHksyCheckerGridObject } from '../utils/objectFactories/hksyCheckerGridObjectFactory';
import { buildAviUtlSimpleTubeObject } from '../utils/objectFactories/simpleTubeObjectFactory';

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

export const buildRustTimelineGeneratedScenario = (): RustTimelineGeneratedScenario => {
  const settings: ProjectSettings = {
    width: 1920,
    height: 1080,
    fps: 60,
    sampleRate: 48_000,
    editorMode: '2d',
  };
  const layers: LayerState[] = Array.from({ length: 4 }, (_, layer) => ({
    id: `rust-e2e-layer-${layer}`,
    name: `Rust E2E ${layer}`,
    visible: true,
    locked: false,
  }));
  const objects: TimelineObject[] = [
    {
      ...buildGetColorDotFieldObject({
        id: 'rust-e2e-getcolor',
        projectWidth: settings.width,
        projectHeight: settings.height,
        startTime: 0,
        layer: 1,
      }),
      x: 40,
      y: 300,
      endX: 40,
      endY: 300,
      width: 560,
      height: 420,
    },
    {
      ...buildHksyCheckerGridObject({
        id: 'rust-e2e-hksy',
        projectWidth: settings.width,
        projectHeight: settings.height,
        startTime: 0,
        layer: 2,
      }),
      x: 680,
      y: 300,
      endX: 680,
      endY: 300,
      width: 560,
      height: 420,
    },
    {
      ...buildAviUtlSimpleTubeObject({
        id: 'rust-e2e-simple-tube',
        projectWidth: settings.width,
        projectHeight: settings.height,
        startTime: 0,
        layer: 3,
      }),
      x: 1320,
      y: 300,
      endX: 1320,
      endY: 300,
      width: 560,
      height: 420,
    },
  ];
  return { settings, layers, objects };
};

export const installRustTimelineGeneratedHarness = (): void => {
  (window as typeof window & {
    __UXFD_RUST_TIMELINE_GENERATED_E2E_ADD__?: () => RustTimelineGeneratedE2eResult;
  }).__UXFD_RUST_TIMELINE_GENERATED_E2E_ADD__ = () => {
    const scenario = buildRustTimelineGeneratedScenario();
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
