import { create } from 'zustand';
import {
  TimelineObject,
  VideoObject,
  SubjectCropNormKeyframe,
  ProjectSettings,
  CameraState,
  SceneData,
  StageCamera3D,
} from '../types';
import {
  createDefaultCamera,
  createDefaultLayers,
  createDefaultStageCamera3D,
  flushActiveIntoScenes,
  sanitiseCamera,
  sanitiseStageCamera3D
} from '../utils/sceneState';
import {
  addFilterToObject,
  getObjectFiltersInOrder,
  moveFilterInObject,
  removeFilterFromObject,
  syncFiltersFromLegacyValues,
  syncLegacyEffectsWithFilters,
  toggleFilterEnabledInObject,
  updateFilterParamsInObject
} from '../utils/filterStack';
import {
  evaluateObjectPositionAtTime,
  normaliseKeyframesForObject,
  shiftKeyframesForObject
} from '../utils/keyframes';
import {
  normaliseSubjectCropKeyframesForVideo,
  shiftSubjectCropKeyframesForObject
} from '../utils/subjectCropKeyframes';
import { buildAviUtlObjectCopyExtClones } from '../utils/aviutl/aviutlObjectCopyExt';
import {
  buildAviUtlCoordinateRecallPatches,
  captureAviUtlCoordinateStoreSnapshot
} from '../utils/aviutl/aviutlCoordinateStore';
import type { AppState } from './storeTypes';
import {
  buildClipboardState,
  calculateAutoDuration,
  clampLayerIndex,
  computeRippledObjects,
  cloneTimelineObject,
  getSelectedObjects,
  isLayerLocked,
  KEYFRAME_TIME_EPSILON,
  needsDurationRecalculation,
  normaliseLayers,
  normaliseSceneObjectList,
  syncObjectKeyframes,
} from './storeHelpers';
import { createExportSlice } from './slices/exportSlice';
import { createPlaybackSlice } from './slices/playbackSlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createWorkspaceSlice } from './slices/workspaceSlice';
import { createHistorySlice } from './slices/historySlice';
import { createLayerSlice } from './slices/layerSlice';
import type { Command } from '../generated/rustCore/Command';
import {
  buildAddFilterCommand,
  buildAddObjectCommand,
  buildBatchCommand,
  buildMoveFilterCommand,
  buildObjectFieldDiffCommands,
  buildRemoveFilterCommand,
  buildRemoveObjectCommand,
  buildToggleFilterEnabledCommand,
} from './commandBuilders';

export type {
  ExportDiagnostics,
  ExportPhase,
  ExportProgress,
  VisionDetectionOverlayState,
} from './storeTypes';

export const useStore = create<AppState>((set, get) => ({
  ...createWorkspaceSlice(set),
  isProjectLoaded: false,
  projectSettings: { width: 1920, height: 1080, fps: 60, sampleRate: 44100 },
  ...createExportSlice(set),

  ...createPlaybackSlice(set, get),
  ...createLayerSlice(set, get),
  objects: [],
  camera: createDefaultCamera(),
  stageCamera3D: createDefaultStageCamera3D(),
  scenes: [],
  activeSceneId: '',
  ...createSelectionSlice(set),
  clipboard: null,
  aviUtlCoordinateStoreSnapshot: null,

  ...createHistorySlice(set, get),

  initializeProject: (settings) => {
    const sceneId = crypto.randomUUID();
    const initialLayers = createDefaultLayers();
    const cam = createDefaultCamera();
    const stageCam = createDefaultStageCamera3D();
    const nextSettings: ProjectSettings = {
      ...settings,
      editorMode: settings.editorMode ?? '2d'
    };
    set({
      projectSettings: nextSettings,
      isProjectLoaded: true,
      currentTime: 0,
      duration: 30,
      isPlaying: false,
      layers: initialLayers,
      objects: [],
      camera: { ...cam },
      stageCamera3D: { ...stageCam, position: { ...stageCam.position }, target: { ...stageCam.target } },
      scenes: [{
        id: sceneId,
        name: 'Scene 1',
        duration: 30,
        layers: initialLayers,
        objects: [],
        camera: { ...cam },
        stageCamera3D: { ...stageCam, position: { ...stageCam.position }, target: { ...stageCam.target } }
      }],
      activeSceneId: sceneId,
      selectedId: null,
      selectedIds: [],
      clipboard: null,
      aviUtlCoordinateStoreSnapshot: null,
      pastCommands: [],
      futureCommands: [],
      visionDetectionPreviewEnabled: false,
      visionDetectionRealtimeEnabled: false,
      visionDetectionOverlay: null
    });
  },

  loadProject: (settings, scenesInput, activeSceneId) => {
    if (!Array.isArray(scenesInput) || scenesInput.length === 0) {
      return;
    }
    const normalisedScenes: SceneData[] = scenesInput.map((scene) => ({
      ...scene,
      layers: normaliseLayers(scene.layers),
      camera: sanitiseCamera(scene.camera),
      stageCamera3D: sanitiseStageCamera3D(scene.stageCamera3D),
      objects: normaliseSceneObjectList(scene.objects)
    }));
    const active = normalisedScenes.find((s) => s.id === activeSceneId) ?? normalisedScenes[0];
    const loadedSettings: ProjectSettings = {
      ...settings,
      editorMode: settings.editorMode ?? '2d'
    };
    set({
      projectSettings: loadedSettings,
      isProjectLoaded: true,
      currentTime: 0,
      duration: Math.max(1, active.duration),
      isPlaying: false,
      layers: active.layers.map((layer) => ({ ...layer })),
      objects: active.objects,
      camera: { ...active.camera },
      stageCamera3D: sanitiseStageCamera3D(active.stageCamera3D),
      scenes: normalisedScenes,
      activeSceneId: active.id,
      selectedId: null,
      selectedIds: [],
      clipboard: null,
      aviUtlCoordinateStoreSnapshot: null,
      pastCommands: [],
      futureCommands: [],
      visionDetectionPreviewEnabled: false,
      visionDetectionRealtimeEnabled: false,
      visionDetectionOverlay: null
    });
  },

  setCamera: (patch) => set((state) => ({
    camera: sanitiseCamera({ ...state.camera, ...patch })
  })),

  setStageCamera3D: (patch) => set((state) => {
    const current = state.stageCamera3D;
    const nextPosition = patch.position
      ? { ...current.position, ...patch.position }
      : { ...current.position };
    const nextTarget = patch.target
      ? { ...current.target, ...patch.target }
      : { ...current.target };
    const merged: StageCamera3D = sanitiseStageCamera3D({
      position: nextPosition,
      target: nextTarget
    });
    return { stageCamera3D: merged };
  }),

  setEditorMode: (mode) => set((state) => ({
    projectSettings: { ...state.projectSettings, editorMode: mode }
  })),

  switchScene: (sceneId) => {
    const state = get();
    if (sceneId === state.activeSceneId) return;
    const targetScene = state.scenes.find((scene) => scene.id === sceneId);
    if (!targetScene) return;

    const flushed = flushActiveIntoScenes(
      state.scenes,
      state.activeSceneId,
      state.objects,
      state.layers,
      state.duration,
      state.camera,
      state.stageCamera3D
    );
    const target = flushed.find((scene) => scene.id === sceneId);
    if (!target) return;

    const nextObjects = normaliseSceneObjectList(target.objects);
    const nextLayers = target.layers.map((layer) => ({ ...layer }));

    set({
      scenes: flushed.map((scene) => (
        scene.id === sceneId
          ? { ...scene, objects: nextObjects, layers: nextLayers.map((l) => ({ ...l })) }
          : scene
      )),
      activeSceneId: sceneId,
      objects: nextObjects,
      layers: nextLayers,
      duration: Math.max(1, target.duration),
      camera: { ...target.camera },
      stageCamera3D: sanitiseStageCamera3D(target.stageCamera3D),
      currentTime: 0,
      isPlaying: false,
      selectedId: null,
      selectedIds: [],
      pastCommands: [],
      futureCommands: [],
      visionDetectionPreviewEnabled: false,
      visionDetectionRealtimeEnabled: false,
      visionDetectionOverlay: null
    });
  },

  addScene: () => {
    const state = get();
    const flushed = flushActiveIntoScenes(
      state.scenes,
      state.activeSceneId,
      state.objects,
      state.layers,
      state.duration,
      state.camera,
      state.stageCamera3D
    );
    const newId = crypto.randomUUID();
    const freshLayers = createDefaultLayers();
    const freshCam = createDefaultCamera();
    const freshStageCam = createDefaultStageCamera3D();
    const newScene: SceneData = {
      id: newId,
      name: `Scene ${flushed.length + 1}`,
      duration: 30,
      layers: freshLayers,
      objects: [],
      camera: freshCam,
      stageCamera3D: { ...freshStageCam, position: { ...freshStageCam.position }, target: { ...freshStageCam.target } }
    };
    set({
      scenes: [...flushed, newScene],
      activeSceneId: newId,
      objects: [],
      layers: freshLayers,
      duration: 30,
      camera: { ...freshCam },
      stageCamera3D: { ...freshStageCam, position: { ...freshStageCam.position }, target: { ...freshStageCam.target } },
      currentTime: 0,
      isPlaying: false,
      selectedId: null,
      selectedIds: [],
      pastCommands: [],
      futureCommands: [],
      visionDetectionPreviewEnabled: false,
      visionDetectionRealtimeEnabled: false,
      visionDetectionOverlay: null
    });
  },

  deleteScene: (sceneId) => {
    const state = get();
    if (state.scenes.length <= 1) return;
    const flushed = flushActiveIntoScenes(
      state.scenes,
      state.activeSceneId,
      state.objects,
      state.layers,
      state.duration,
      state.camera,
      state.stageCamera3D
    );
    const nextScenes = flushed.filter((scene) => scene.id !== sceneId);
    if (nextScenes.length === 0) return;

    if (state.activeSceneId !== sceneId) {
      set({ scenes: nextScenes });
      return;
    }

    const fallback = nextScenes[0];
    const nextObjects = normaliseSceneObjectList(fallback.objects);
    const nextLayers = fallback.layers.map((layer) => ({ ...layer }));
    set({
      scenes: nextScenes.map((scene) => (
        scene.id === fallback.id
          ? { ...scene, objects: nextObjects, layers: nextLayers.map((l) => ({ ...l })) }
          : scene
      )),
      activeSceneId: fallback.id,
      objects: nextObjects,
      layers: nextLayers,
      duration: Math.max(1, fallback.duration),
      camera: { ...fallback.camera },
      stageCamera3D: sanitiseStageCamera3D(fallback.stageCamera3D),
      currentTime: 0,
      isPlaying: false,
      selectedId: null,
      selectedIds: [],
      pastCommands: [],
      futureCommands: [],
      visionDetectionPreviewEnabled: false,
      visionDetectionRealtimeEnabled: false,
      visionDetectionOverlay: null
    });
  },

  renameScene: (sceneId, name) => set((state) => ({
    scenes: state.scenes.map((scene) => (
      scene.id === sceneId
        ? { ...scene, name: name.trim() === '' ? scene.name : name.trim() }
        : scene
    ))
  })),

  addObject: (obj) => {
    const targetLayer = clampLayerIndex(obj.layer);
    const state = get();
    if (isLayerLocked(state.layers, targetLayer)) return;

    const objectWithDefaults = {
      ...obj,
      layer: targetLayer,
      enableAnimation: obj.enableAnimation ?? false,
      endX: obj.endX ?? obj.x,
      endY: obj.endY ?? obj.y,
      easing: obj.easing ?? 'linear',
      offset: obj.offset ?? 0
    } as TimelineObject;
    const syncedObject = syncObjectKeyframes(syncLegacyEffectsWithFilters(objectWithDefaults));

    get().pushHistoryCommand(buildAddObjectCommand(syncedObject, state.objects.length));
    set((state) => {
      const newObjects = [...state.objects, syncedObject];
      return { 
        objects: newObjects,
        selectedId: syncedObject.id,
        selectedIds: [syncedObject.id],
        duration: calculateAutoDuration(newObjects)
      };
    });
  },
  
  updateObject: (id, newProps) => set((state) => {
    const targetIndex = state.objects.findIndex((obj) => obj.id === id);
    if (targetIndex < 0) return {};

    const currentObject = state.objects[targetIndex];
    const currentLayer = clampLayerIndex(currentObject.layer);
    if (isLayerLocked(state.layers, currentLayer)) return {};

    const hasLayerUpdate = Object.prototype.hasOwnProperty.call(newProps, 'layer');
    const parsedLayer = Number(newProps.layer);
    const nextLayer = hasLayerUpdate && Number.isFinite(parsedLayer)
      ? clampLayerIndex(parsedLayer)
      : currentLayer;
    if (isLayerLocked(state.layers, nextLayer)) return {};

    const normalisedNewProps = hasLayerUpdate
      ? { ...newProps, layer: nextLayer } as Partial<TimelineObject>
      : newProps;

    const hasStartUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'startTime');
    const hasDurationUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'duration');
    const hasXUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'x');
    const hasYUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'y');
    const hasExplicitKeyframesUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'keyframes');
    const hasExplicitSubjectCropKeyframesUpdate = Object.prototype.hasOwnProperty.call(
      normalisedNewProps,
      'subjectCropKeyframes'
    );

    let adjustedNewProps = normalisedNewProps;
    const nextStartTime = hasStartUpdate && typeof normalisedNewProps.startTime === 'number' && Number.isFinite(normalisedNewProps.startTime)
      ? Math.max(0, normalisedNewProps.startTime)
      : currentObject.startTime;
    const nextDuration = hasDurationUpdate && typeof normalisedNewProps.duration === 'number' && Number.isFinite(normalisedNewProps.duration)
      ? Math.max(0.1, normalisedNewProps.duration)
      : currentObject.duration;

    if (hasExplicitKeyframesUpdate) {
      const keyframesRaw = Array.isArray(normalisedNewProps.keyframes) ? normalisedNewProps.keyframes : [];
      adjustedNewProps = {
        ...adjustedNewProps,
        keyframes: normaliseKeyframesForObject(
          { ...currentObject, ...adjustedNewProps, startTime: nextStartTime, duration: nextDuration },
          keyframesRaw
        )
      };
    } else if (currentObject.keyframes && currentObject.keyframes.length > 0) {
      const nextX = hasXUpdate && typeof normalisedNewProps.x === 'number' && Number.isFinite(normalisedNewProps.x)
        ? normalisedNewProps.x
        : currentObject.x;
      const nextY = hasYUpdate && typeof normalisedNewProps.y === 'number' && Number.isFinite(normalisedNewProps.y)
        ? normalisedNewProps.y
        : currentObject.y;
      const deltaTime = hasStartUpdate ? nextStartTime - currentObject.startTime : 0;
      const deltaX = hasXUpdate ? nextX - currentObject.x : 0;
      const deltaY = hasYUpdate ? nextY - currentObject.y : 0;
      const needsKeyframeShift = Math.abs(deltaTime) > 0.0001
        || Math.abs(deltaX) > 0.0001
        || Math.abs(deltaY) > 0.0001
        || hasDurationUpdate;
      if (needsKeyframeShift) {
        const shiftedKeyframes = shiftKeyframesForObject(
          { ...currentObject, startTime: nextStartTime, duration: nextDuration },
          currentObject.keyframes,
          deltaTime,
          deltaX,
          deltaY
        );
        adjustedNewProps = {
          ...adjustedNewProps,
          keyframes: shiftedKeyframes
        };
      }
    }

    if (currentObject.type === 'video' && hasExplicitSubjectCropKeyframesUpdate) {
      const videoPatch = normalisedNewProps as Partial<VideoObject>;
      const raw = Array.isArray(videoPatch.subjectCropKeyframes) ? videoPatch.subjectCropKeyframes : [];
      adjustedNewProps = {
        ...adjustedNewProps,
        subjectCropKeyframes: normaliseSubjectCropKeyframesForVideo(
          { ...currentObject, ...adjustedNewProps, startTime: nextStartTime, duration: nextDuration },
          raw as SubjectCropNormKeyframe[]
        )
      };
    } else if (
      currentObject.type === 'video'
      && currentObject.subjectCropKeyframes
      && currentObject.subjectCropKeyframes.length > 0
    ) {
      const deltaTime = hasStartUpdate ? nextStartTime - currentObject.startTime : 0;
      const needsSubjectCropShift = Math.abs(deltaTime) > KEYFRAME_TIME_EPSILON || hasDurationUpdate;
      if (needsSubjectCropShift) {
        adjustedNewProps = {
          ...adjustedNewProps,
          subjectCropKeyframes: shiftSubjectCropKeyframesForObject(
            currentObject.subjectCropKeyframes,
            deltaTime,
            nextStartTime,
            nextDuration
          )
        };
      }
    }

    const changedKeys = Object.keys(adjustedNewProps) as (keyof TimelineObject)[];
    const hasAnyDiff = changedKeys.some((key) => {
      return !Object.is(currentObject[key], adjustedNewProps[key]);
    });

    if (!hasAnyDiff) return {};

    const hasFilterUpdate = Object.prototype.hasOwnProperty.call(adjustedNewProps, 'filters');
    const hasLegacyEffectUpdate = Object.prototype.hasOwnProperty.call(adjustedNewProps, 'colorCorrection')
      || Object.prototype.hasOwnProperty.call(adjustedNewProps, 'customClipping')
      || Object.prototype.hasOwnProperty.call(adjustedNewProps, 'vibration')
      || Object.prototype.hasOwnProperty.call(adjustedNewProps, 'shadow')
      || Object.prototype.hasOwnProperty.call(adjustedNewProps, 'gradient');

    const mergedObject = { ...currentObject, ...adjustedNewProps } as TimelineObject;
    const updatedObject = syncObjectKeyframes(hasFilterUpdate
      ? syncLegacyEffectsWithFilters(mergedObject)
      : (hasLegacyEffectUpdate
        ? syncFiltersFromLegacyValues(mergedObject)
        : syncLegacyEffectsWithFilters(mergedObject)));
    const newObjects = state.objects.slice();
    newObjects[targetIndex] = updatedObject;

    if (!needsDurationRecalculation(adjustedNewProps)) {
      return { objects: newObjects };
    }

    return {
      objects: newObjects,
      duration: calculateAutoDuration(newObjects)
    };
  }),

  addObjectFilter: (objectId, filterType) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    const previousFilterCount = getObjectFiltersInOrder(targetObject).length;
    const updatedObject = addFilterToObject(targetObject, filterType);
    const addedFilter = getObjectFiltersInOrder(updatedObject)[previousFilterCount];
    // 追加された filter は末尾に積まれる(`addFilterToObject`の実装どおり)。
    get().pushHistoryCommand(buildAddFilterCommand(objectId, addedFilter, previousFilterCount));
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = updatedObject;
      return { objects: nextObjects };
    });
  },

  toggleObjectFilter: (objectId, filterId) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    const filterExists = getObjectFiltersInOrder(targetObject).some((filter) => filter.id === filterId);
    if (filterExists) {
      get().pushHistoryCommand(buildToggleFilterEnabledCommand(objectId, filterId));
    }
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = toggleFilterEnabledInObject(nextObjects[targetIndex], filterId);
      return { objects: nextObjects };
    });
  },

  moveObjectFilter: (objectId, filterId, direction) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    const currentFilters = getObjectFiltersInOrder(targetObject);
    const fromIndex = currentFilters.findIndex((filter) => filter.id === filterId);
    if (fromIndex >= 0) {
      const rawTargetIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      // Rust 側と同じクランプ規約(rust-source-of-truth-r4-commands.md):
      // 端で無操作になる場合は fromIndex===toIndex を明示的に渡す。
      const toIndex = rawTargetIndex < 0 || rawTargetIndex >= currentFilters.length
        ? fromIndex
        : rawTargetIndex;
      get().pushHistoryCommand(buildMoveFilterCommand(objectId, filterId, fromIndex, toIndex));
    }
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = moveFilterInObject(nextObjects[targetIndex], filterId, direction);
      return { objects: nextObjects };
    });
  },

  removeObjectFilter: (objectId, filterId) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    const currentFilters = getObjectFiltersInOrder(targetObject);
    const removeIndex = currentFilters.findIndex((filter) => filter.id === filterId);
    if (removeIndex >= 0) {
      get().pushHistoryCommand(buildRemoveFilterCommand(objectId, currentFilters[removeIndex], removeIndex));
    }
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = removeFilterFromObject(nextObjects[targetIndex], filterId);
      return { objects: nextObjects };
    });
  },

  updateObjectFilterParams: (objectId, filterId, params) => set((state) => {
    const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
    if (targetIndex < 0) return {};
    const targetObject = state.objects[targetIndex];
    if (isLayerLocked(state.layers, clampLayerIndex(targetObject.layer))) return {};

    const nextObjects = state.objects.slice();
    nextObjects[targetIndex] = updateFilterParamsInObject(nextObjects[targetIndex], filterId, params);
    return { objects: nextObjects };
  }),

  deleteObject: (id) => {
    const currentObject = get().objects.find((obj) => obj.id === id);
    if (!currentObject) return;

    const layer = clampLayerIndex(currentObject.layer);
    if (isLayerLocked(get().layers, layer)) return;

    const currentIndex = get().objects.findIndex((obj) => obj.id === id);
    get().pushHistoryCommand(buildRemoveObjectCommand(currentObject, currentIndex));
    set((state) => {
      const newObjects = state.objects.filter(obj => obj.id !== id);
      const nextSelectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      const lastSelectedId = nextSelectedIds.length > 0 ? nextSelectedIds[nextSelectedIds.length - 1] : null;
      return {
        objects: newObjects,
        selectedId: state.selectedId === id ? lastSelectedId : state.selectedId,
        selectedIds: nextSelectedIds,
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  deleteSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const deletableIds = selectedObjects
      .filter((obj) => !isLayerLocked(state.layers, clampLayerIndex(obj.layer)))
      .map((obj) => obj.id);
    if (deletableIds.length === 0) return;

    const deletableSet = new Set(deletableIds);
    // 降順 index で RemoveObject を並べる(rust-source-of-truth-r4-7b-command-batch.md
    // の batch_apply_and_undo_round_trip_removes_multiple_objects と同じ規約:
    // Batch は逐次 apply されるため、後ろの index から消していけば手前の
    // index が途中でずれない)。
    const removeCommands = deletableIds
      .map((objId) => ({ objId, index: state.objects.findIndex((obj) => obj.id === objId) }))
      .sort((a, b) => b.index - a.index)
      .map(({ objId, index }) => buildRemoveObjectCommand(
        state.objects.find((obj) => obj.id === objId)!,
        index
      ));
    const batch = buildBatchCommand(removeCommands);
    if (batch) get().pushHistoryCommand(batch);
    set((currentState) => {
      const newObjects = currentState.objects.filter((obj) => !deletableSet.has(obj.id));
      return {
        objects: newObjects,
        selectedId: null,
        selectedIds: [],
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  rippleDeleteObject: (id) => {
    const currentObject = get().objects.find((obj) => obj.id === id);
    if (!currentObject) return;

    const layer = clampLayerIndex(currentObject.layer);
    if (isLayerLocked(get().layers, layer)) return;

    const state = get();
    const currentIndex = state.objects.findIndex((obj) => obj.id === id);
    const rippledObjects = computeRippledObjects(state.objects, new Set([id]));
    // RemoveObject + リップルで startTime がずれたオブジェクトの
    // SetObjectField を1つの Batch にまとめる(1回の undo で両方戻す)。
    const shiftCommands = rippledObjects.flatMap((nextObject) => {
      const previousObject = state.objects.find((obj) => obj.id === nextObject.id);
      if (!previousObject) return [];
      return buildObjectFieldDiffCommands(previousObject, nextObject);
    });
    const batch = buildBatchCommand([
      buildRemoveObjectCommand(currentObject, currentIndex),
      ...shiftCommands,
    ]);
    if (batch) get().pushHistoryCommand(batch);
    set((state) => {
      const deletedSet = new Set([id]);
      const newObjects = computeRippledObjects(state.objects, deletedSet);
      const nextSelectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      const lastSelectedId = nextSelectedIds.length > 0 ? nextSelectedIds[nextSelectedIds.length - 1] : null;
      return {
        objects: newObjects,
        selectedId: state.selectedId === id ? lastSelectedId : state.selectedId,
        selectedIds: nextSelectedIds,
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  rippleDeleteSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const deletableIds = selectedObjects
      .filter((obj) => !isLayerLocked(state.layers, clampLayerIndex(obj.layer)))
      .map((obj) => obj.id);
    if (deletableIds.length === 0) return;

    const deletableSet = new Set(deletableIds);
    const removeCommands = deletableIds
      .map((objId) => ({ objId, index: state.objects.findIndex((obj) => obj.id === objId) }))
      .sort((a, b) => b.index - a.index)
      .map(({ objId, index }) => buildRemoveObjectCommand(
        state.objects.find((obj) => obj.id === objId)!,
        index
      ));
    const rippledObjects = computeRippledObjects(state.objects, deletableSet);
    const shiftCommands = rippledObjects.flatMap((nextObject) => {
      const previousObject = state.objects.find((obj) => obj.id === nextObject.id);
      if (!previousObject) return [];
      return buildObjectFieldDiffCommands(previousObject, nextObject);
    });
    const batch = buildBatchCommand([...removeCommands, ...shiftCommands]);
    if (batch) get().pushHistoryCommand(batch);
    set((currentState) => {
      const newObjects = computeRippledObjects(currentState.objects, deletableSet);
      return {
        objects: newObjects,
        selectedId: null,
        selectedIds: [],
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  splitObject: () => {
    const { objects, selectedId, currentTime, layers } = get();
    const target = objects.find(o => o.id === selectedId);

    if (!target || currentTime <= target.startTime || currentTime >= target.startTime + target.duration) {
        return;
    }

    if (isLayerLocked(layers, clampLayerIndex(target.layer))) {
        return;
    }

    const targetIndex = objects.findIndex((o) => o.id === target.id);

    const splitPoint = currentTime - target.startTime;
    const splitTime = currentTime;
    const splitPosition = evaluateObjectPositionAtTime(target, splitTime);

    const firstPart: TimelineObject = {
        ...target,
        duration: splitPoint,
        endX: splitPosition.x,
        endY: splitPosition.y
    };

    const secondPart: TimelineObject = {
        ...target,
        id: crypto.randomUUID(),
        startTime: splitTime,
        duration: target.duration - splitPoint,
        offset: (target.offset || 0) + splitPoint,
        x: splitPosition.x,
        y: splitPosition.y,
    };

    if (target.keyframes && target.keyframes.length > 0) {
        const normalisedKeyframes = normaliseKeyframesForObject(target, target.keyframes);
        const firstKeyframes = normalisedKeyframes.filter((keyframe) => keyframe.time <= splitTime + KEYFRAME_TIME_EPSILON);
        const secondKeyframes = normalisedKeyframes.filter((keyframe) => keyframe.time >= splitTime - KEYFRAME_TIME_EPSILON);
        const hasBoundaryKeyframe = normalisedKeyframes.some((keyframe) => (
          Math.abs(keyframe.time - splitTime) <= KEYFRAME_TIME_EPSILON
        ));

        if (!hasBoundaryKeyframe) {
          const leftKeyframe = normalisedKeyframes
            .slice()
            .reverse()
            .find((keyframe) => keyframe.time < splitTime);
          const boundaryKeyframe = {
            id: crypto.randomUUID(),
            time: splitTime,
            x: splitPosition.x,
            y: splitPosition.y,
            easing: leftKeyframe?.easing ?? target.easing
          };
          firstKeyframes.push(boundaryKeyframe);
          secondKeyframes.unshift(boundaryKeyframe);
        }

        firstPart.keyframes = firstKeyframes;
        secondPart.keyframes = secondKeyframes
          .map((keyframe) => ({ ...keyframe, id: crypto.randomUUID() }));
    }

    const newObjects = objects.map(o => o.id === target.id ? firstPart : o);
    newObjects.push(secondPart);

    const syncedObjects = newObjects.map(syncObjectKeyframes);
    // set() 後の実データ(syncObjectKeyframes 適用済み)から Command を組み立てる
    // — firstPart/secondPart の pre-sync 値ではなく実際に state へ入る値を
    // 使うことで Rust 側の undo 結果と乖離しないようにする。
    const syncedFirstPart = syncedObjects.find((o) => o.id === firstPart.id)!;
    const syncedSecondPart = syncedObjects.find((o) => o.id === secondPart.id)!;
    const batch = buildBatchCommand([
      buildRemoveObjectCommand(target, targetIndex),
      buildAddObjectCommand(syncedFirstPart, targetIndex),
      buildAddObjectCommand(syncedSecondPart, objects.length),
    ]);
    if (batch) get().pushHistoryCommand(batch);

    set({
        objects: syncedObjects,
        selectedId: secondPart.id,
        selectedIds: [secondPart.id],
        duration: calculateAutoDuration(syncedObjects)
    });
  },

  copySelectedObjects: () => set((state) => {
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return {};

    return {
      clipboard: buildClipboardState(selectedObjects)
    };
  }),

  cutSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const cutObjects = selectedObjects.filter((obj) => !isLayerLocked(state.layers, clampLayerIndex(obj.layer)));
    if (cutObjects.length === 0) return;

    const cutObjectIdSet = new Set(cutObjects.map((obj) => obj.id));
    const clipboard = buildClipboardState(cutObjects);

    const removeCommands = cutObjects
      .map((obj) => ({ obj, index: state.objects.findIndex((o) => o.id === obj.id) }))
      .sort((a, b) => b.index - a.index)
      .map(({ obj, index }) => buildRemoveObjectCommand(obj, index));
    const batch = buildBatchCommand(removeCommands);
    if (batch) get().pushHistoryCommand(batch);
    set((currentState) => {
      const newObjects = currentState.objects.filter((obj) => !cutObjectIdSet.has(obj.id));
      return {
        clipboard,
        objects: newObjects,
        selectedId: null,
        selectedIds: [],
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  pasteClipboardObjects: () => {
    const state = get();
    const clipboard = state.clipboard;
    if (!clipboard || clipboard.objects.length === 0) return;

    const groupIdMap = new Map<string, string>();
    const pastedObjects: TimelineObject[] = [];

    clipboard.objects.forEach((template) => {
      const targetLayer = clampLayerIndex(template.layer);
      if (isLayerLocked(state.layers, targetLayer)) return;

      const cloned = cloneTimelineObject(template);
      const xOffset = template.x - clipboard.anchorX;
      const yOffset = template.y - clipboard.anchorY;

      cloned.id = crypto.randomUUID();
      cloned.startTime = Math.max(0, state.currentTime + (template.startTime - clipboard.anchorStartTime));
      const startTimeDelta = cloned.startTime - template.startTime;
      cloned.layer = targetLayer;
      cloned.x = clipboard.anchorX + xOffset + 16;
      cloned.y = clipboard.anchorY + yOffset + 16;
      cloned.endX = cloned.endX + 16;
      cloned.endY = cloned.endY + 16;
      if (cloned.motionPath) {
        cloned.motionPath = cloned.motionPath.map((point) => ({
          ...point,
          x: point.x + 16,
          y: point.y + 16
        }));
      }
      if (cloned.keyframes) {
        cloned.keyframes = cloned.keyframes.map((keyframe) => ({
          ...keyframe,
          id: crypto.randomUUID(),
          time: keyframe.time + startTimeDelta,
          x: keyframe.x + 16,
          y: keyframe.y + 16
        }));
      }

      if (cloned.groupId) {
        if (!groupIdMap.has(cloned.groupId)) {
          groupIdMap.set(cloned.groupId, crypto.randomUUID());
        }
        cloned.groupId = groupIdMap.get(cloned.groupId);
      }

      pastedObjects.push(syncObjectKeyframes(syncLegacyEffectsWithFilters(cloned)));
    });

    if (pastedObjects.length === 0) return;

    const baseIndex = state.objects.length;
    const batch = buildBatchCommand(
      pastedObjects.map((obj, i) => buildAddObjectCommand(obj, baseIndex + i))
    );
    if (batch) get().pushHistoryCommand(batch);
    set((currentState) => {
      const newObjects = [...currentState.objects, ...pastedObjects];
      return {
        objects: newObjects,
        selectedId: pastedObjects[pastedObjects.length - 1].id,
        selectedIds: pastedObjects.map((obj) => obj.id),
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  duplicateSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const sorted = selectedObjects
      .slice()
      .sort((a, b) => a.startTime - b.startTime || a.layer - b.layer);
    const groupIdMap = new Map<string, string>();
    const duplicatedObjects: TimelineObject[] = [];

    sorted.forEach((template) => {
      const targetLayer = clampLayerIndex(template.layer + 1);
      if (isLayerLocked(state.layers, targetLayer)) return;

      const cloned = cloneTimelineObject(template);
      cloned.id = crypto.randomUUID();
      cloned.startTime = template.startTime + 0.2;
      const startTimeDelta = cloned.startTime - template.startTime;
      cloned.layer = targetLayer;
      cloned.x = template.x + 20;
      cloned.y = template.y + 20;
      cloned.endX = cloned.endX + 20;
      cloned.endY = cloned.endY + 20;
      if (cloned.motionPath) {
        cloned.motionPath = cloned.motionPath.map((point) => ({
          ...point,
          x: point.x + 20,
          y: point.y + 20
        }));
      }
      if (cloned.keyframes) {
        cloned.keyframes = cloned.keyframes.map((keyframe) => ({
          ...keyframe,
          id: crypto.randomUUID(),
          time: keyframe.time + startTimeDelta,
          x: keyframe.x + 20,
          y: keyframe.y + 20
        }));
      }

      if (cloned.groupId) {
        if (!groupIdMap.has(cloned.groupId)) {
          groupIdMap.set(cloned.groupId, crypto.randomUUID());
        }
        cloned.groupId = groupIdMap.get(cloned.groupId);
      }

      duplicatedObjects.push(syncObjectKeyframes(syncLegacyEffectsWithFilters(cloned)));
    });

    if (duplicatedObjects.length === 0) return;

    const baseIndex = state.objects.length;
    const batch = buildBatchCommand(
      duplicatedObjects.map((obj, i) => buildAddObjectCommand(obj, baseIndex + i))
    );
    if (batch) get().pushHistoryCommand(batch);
    set((currentState) => {
      const newObjects = [...currentState.objects, ...duplicatedObjects];
      return {
        objects: newObjects,
        selectedId: duplicatedObjects[duplicatedObjects.length - 1].id,
        selectedIds: duplicatedObjects.map((obj) => obj.id),
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  duplicateSelectedObjectsWithObjectCopyExt: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const editableObjects = selectedObjects.filter((object) => !isLayerLocked(state.layers, clampLayerIndex(object.layer)));
    if (editableObjects.length === 0) return;

    const duplicatedObjects = buildAviUtlObjectCopyExtClones(editableObjects, {
      copies: 3,
      offsetX: 16,
      offsetY: 16,
      timeOffsetSeconds: 0.1,
      layerOffset: 1,
      maxLayer: state.layers.length - 1,
      idFactory: () => crypto.randomUUID()
    }).filter((object) => !isLayerLocked(state.layers, clampLayerIndex(object.layer)));

    if (duplicatedObjects.length === 0) return;

    const syncedObjects = duplicatedObjects.map((object) => syncObjectKeyframes(syncLegacyEffectsWithFilters(object)));
    const baseIndex = state.objects.length;
    const batch = buildBatchCommand(
      syncedObjects.map((obj, i) => buildAddObjectCommand(obj, baseIndex + i))
    );
    if (batch) get().pushHistoryCommand(batch);
    set((currentState) => {
      const newObjects = [...currentState.objects, ...syncedObjects];
      return {
        objects: newObjects,
        selectedId: syncedObjects[syncedObjects.length - 1].id,
        selectedIds: syncedObjects.map((object) => object.id),
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  captureSelectedCoordinatesWithAviUtlStore: (name = 'default') => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    set({
      aviUtlCoordinateStoreSnapshot: captureAviUtlCoordinateStoreSnapshot(selectedObjects, { name })
    });
  },

  applyAviUtlStoredCoordinatesToSelection: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    const patches = buildAviUtlCoordinateRecallPatches(selectedObjects, state.aviUtlCoordinateStoreSnapshot);
    if (patches.length === 0) return;

    const patchById = new Map(patches.map((entry) => [entry.id, entry.patch]));
    const nextObjects = state.objects.map((object) => {
      const patch = patchById.get(object.id);
      if (!patch) return object;
      if (isLayerLocked(state.layers, clampLayerIndex(object.layer))) return object;
      return syncObjectKeyframes(syncLegacyEffectsWithFilters({ ...object, ...patch } as TimelineObject));
    });
    const diffCommands = nextObjects.flatMap((nextObject, i) => {
      const previousObject = state.objects[i];
      if (previousObject === nextObject) return [];
      return buildObjectFieldDiffCommands(previousObject, nextObject);
    });
    const batch = buildBatchCommand(diffCommands);
    if (batch) get().pushHistoryCommand(batch);
    set({ objects: nextObjects });
  },

  groupSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length < 2) return;

    const editableIds = selectedObjects
      .filter((obj) => !isLayerLocked(state.layers, clampLayerIndex(obj.layer)))
      .map((obj) => obj.id);
    if (editableIds.length < 2) return;

    const editableSet = new Set(editableIds);
    const newGroupId = crypto.randomUUID();
    const newObjects = state.objects.map((obj) => {
      if (!editableSet.has(obj.id)) return obj;
      return { ...obj, groupId: newGroupId, groupGradient: undefined };
    });
    const diffCommands = newObjects.flatMap((nextObject, i) => {
      const previousObject = state.objects[i];
      if (previousObject === nextObject) return [];
      return buildObjectFieldDiffCommands(previousObject, nextObject);
    });
    const batch = buildBatchCommand(diffCommands);
    if (batch) get().pushHistoryCommand(batch);
    set({ objects: newObjects });
  },

  ungroupSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const groupIds = new Set(
      selectedObjects
        .map((obj) => obj.groupId)
        .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim() !== '')
    );
    if (groupIds.size === 0) return;

    const newObjects = state.objects.map((obj) => {
      if (!obj.groupId || !groupIds.has(obj.groupId)) return obj;
      if (isLayerLocked(state.layers, clampLayerIndex(obj.layer))) return obj;
      return { ...obj, groupId: undefined, groupGradient: undefined };
    });
    const diffCommands = newObjects.flatMap((nextObject, i) => {
      const previousObject = state.objects[i];
      if (previousObject === nextObject) return [];
      return buildObjectFieldDiffCommands(previousObject, nextObject);
    });
    const batch = buildBatchCommand(diffCommands);
    if (batch) get().pushHistoryCommand(batch);
    set({
      objects: newObjects
    });
  },

  setGroupGradient: (groupId, gradient) => {
    if (!groupId || groupId.trim() === '') return;
    const clonedGradient = gradient
      ? {
        ...gradient,
        colours: Array.isArray(gradient.colours) ? gradient.colours.slice() : [],
        stops: Array.isArray(gradient.stops) ? gradient.stops.slice() : []
      }
      : undefined;

    set((state) => {
      let changed = false;
      const newObjects = state.objects.map((obj) => {
        if (obj.groupId !== groupId) return obj;
        if (isLayerLocked(state.layers, clampLayerIndex(obj.layer))) return obj;
        changed = true;
        return {
          ...obj,
          groupGradient: clonedGradient
            ? {
              ...clonedGradient,
              colours: clonedGradient.colours.slice(),
              stops: clonedGradient.stops.slice()
            }
            : undefined
        };
      });
      if (!changed) return {};
      return { objects: newObjects };
    });
  },

}));
