import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject, AudioVisualizationObject, PsdLayerStruct, PsdObject, ObjectFilter, FilterType, PositionKeyframe, GradientFill, WipeEdge, CameraState, PsdWorldPlacement, VideoObject, ParticleObject, GetColorDotFieldObject, HksyCheckerGridObject, PlainEffectorLineObject, ShatteredSphereObject, SphereDotsObject, SphericalFieldObject, BarcodeObject, PuzzlePieceObject, ColourWheelObject, GourdObject, GearObject, TrackBarObject, PieChartObject, HistogramObject, ToneCurveObject, SunburstObject, CircularArrowObject, TriangleBracketObject, TartanCheckObject, HoundstoothObject, YagasuriObject, PaperAirplaneObject, AsanohaPatternObject, FocusLinesPlusObject, RandomLineExObject, AudioSphereObject, RegionFrameObject, SimpleTubeObject, ContourTraceObject, DisplacementPolyObject, HologramObject, ProtractorObject, ShakingPolygonObject } from '../types';
import { buildPsdLayerTree, togglePsdLayer } from '../utils/psdParser';
import { easingNames, EasingType } from '../utils/easings';
import { buildEndpointKeyframes, evaluateObjectPositionAtTime } from '../utils/keyframes';
import { useTranslation } from '../i18n';
import {
  invokeCoreMlTrackObject,
  invokeCoreMlTrackObjectSupported,
  invokeCoreMlDetectSubjects,
  invokeCoreMlSegmentPerson,
  invokeCoreMlFramePreview,
  type CoreMlAnimalObservation,
  type CoreMlTrackSample
} from '../utils/coremlTrackIpc';
import { resolveVideoFsPath } from '../utils/resolveVideoFsPath';
import { buildOverlayPositionKeyframesFromVisionTrack } from '../utils/visionTrackingKeyframes';
import { buildSubjectCropKeyframesFromVisionTrackSamples } from '../utils/subjectCropKeyframes';
import { buildAspectLockedScalePatch } from '../utils/aspectRatioScale';
import { buildAviUtlMotionPresetPatch, getAviUtlPackMotionPresets, type AviUtlMotionPresetId } from '../utils/aviutl/aviutlMotionPresets';
import { applyAviUtlEffectPresetToObject, getAviUtlPackEffectPresets, type AviUtlEffectPresetId } from '../utils/aviutl/aviutlEffectPresets';
import { buildAviUtlCameraTargetPatch, getAviUtlPackCameraPresets } from '../utils/aviutl/aviutlCameraPresets';
import { buildAviUtlBackgroundColourPalettePatch, extractAviUtlBackgroundColourPalette, buildAviUtlHksyPalettePatch } from '../utils/aviutl/aviutlBackgroundColourEyedropper';
import type { VisionNormBoundingBox } from '../utils/visionTrackingGeometry';

const Slider = ({
  className,
  onPointerDown,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    type="range"
    className={className ? `no-drag ${className}` : 'no-drag'}
    onPointerDown={(event) => {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore environments where pointer capture is not available.
      }
      onPointerDown?.(event);
    }}
  />
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="property-row">
    <div className="property-label">{label}</div>
    <div className="property-value">{children}</div>
  </div>
);

const SectionHeader = ({ label }: { label: string }) => (
  <div className="property-section-header">
    {label}
  </div>
);

type ShatteredSphereNumericKey = keyof Pick<
  ShatteredSphereObject,
  | 'fractureAmount'
  | 'delay'
  | 'radius'
  | 'limitDistance'
  | 'thickness'
  | 'fragmentSize'
  | 'randomShape'
  | 'speed'
  | 'impact'
  | 'gravityX'
  | 'gravityY'
  | 'gravityZ'
  | 'spin'
  | 'directionDiffusion'
  | 'seed'
>;

type ShatteredSphereNumberControlProps = {
  label: string;
  controlKey: ShatteredSphereNumericKey;
  value: number;
  min: number;
  max: number;
  step: number;
  fallback: number;
  integer?: boolean;
  onChange: (key: ShatteredSphereNumericKey, value: number) => void;
};

const ShatteredSphereNumberControl = ({
  label,
  controlKey,
  value,
  min,
  max,
  step,
  fallback,
  integer = false,
  onChange,
}: ShatteredSphereNumberControlProps) => {
  const applyValue = (rawValue: string) => {
    const parsed = parseFloat(rawValue);
    const bounded = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
    onChange(controlKey, integer ? Math.round(bounded) : bounded);
  };

  return (
    <Row label={label}>
      <div
        data-shattered-sphere-control={controlKey}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 1fr) 76px', gap: '8px', alignItems: 'center' }}
      >
        <Slider
          min={String(min)}
          max={String(max)}
          step={String(step)}
          value={value}
          onInput={(e) => applyValue(e.currentTarget.value)}
          style={{ width: '100%' }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => applyValue(e.target.value)}
          style={{ width: '76px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
        />
      </div>
    </Row>
  );
};

const shatteredSpherePresetPatches: Array<{ label: string; patch: Partial<ShatteredSphereObject> }> = [
  {
    label: 'Soft Burst',
    patch: {
      fractureAmount: 80,
      speed: 70,
      impact: 60,
      gravityY: 80,
      spin: 80,
      directionDiffusion: 80,
    },
  },
  {
    label: 'Fast Burst',
    patch: {
      fractureAmount: 180,
      speed: 220,
      impact: 240,
      gravityY: 60,
      spin: 220,
      directionDiffusion: 180,
    },
  },
  {
    label: 'Gravity Drop',
    patch: {
      fractureAmount: 120,
      speed: 90,
      impact: 80,
      gravityY: 260,
      spin: 70,
      directionDiffusion: 60,
    },
  },
  {
    label: 'Reset 93',
    patch: {
      fractureAmount: 100,
      delay: 100,
      radius: 160,
      limitDistance: 150,
      thickness: 20,
      fragmentSize: 40,
      randomShape: 100,
      speed: 100,
      impact: 100,
      gravityX: 0,
      gravityY: 100,
      gravityZ: 0,
      spin: 100,
      directionDiffusion: 100,
      colour: '#ffffff',
      seed: 93,
    },
  },
];

const sequenceAwareMotionPresets = new Set<AviUtlMotionPresetId>([
  'delay-move-individual',
  'individual-coordinate-rearrange-circle'
]);

const defaultPsdWorldPlacement = (): PsdWorldPlacement => ({
  enabled: true,
  position: { x: 0, y: 0, z: 0 },
  rotationYDeg: 0,
  scale: 1.5,
  billboard: true,
});

const SceneAndCameraPanel: React.FC = () => {
  const scenes = useStore((state) => state.scenes);
  const activeSceneId = useStore((state) => state.activeSceneId);
  const camera = useStore((state) => state.camera);
  const projectSettings = useStore((state) => state.projectSettings);
  const objects = useStore((state) => state.objects);
  const selectedId = useStore((state) => state.selectedId);
  const selectedIds = useStore((state) => state.selectedIds);
  const stageCamera3D = useStore((state) => state.stageCamera3D);
  const setStageCamera3D = useStore((state) => state.setStageCamera3D);
  const language = useStore((state) => state.language);
  const t = useTranslation(language);
  const switchScene = useStore((state) => state.switchScene);
  const addScene = useStore((state) => state.addScene);
  const deleteScene = useStore((state) => state.deleteScene);
  const renameScene = useStore((state) => state.renameScene);
  const setCamera = useStore((state) => state.setCamera);
  const pushHistory = useStore((state) => state.pushHistory);
  const editorMode = projectSettings.editorMode ?? '2d';
  const activeScene = scenes.find((scene) => scene.id === activeSceneId);
  const [renameDraft, setRenameDraft] = useState(activeScene?.name ?? '');
  const aviUtlCameraPresets = getAviUtlPackCameraPresets();
  const cameraTargetObject = useMemo(() => {
    const normalisedSelectedIds = selectedIds.length > 0
      ? selectedIds
      : (selectedId ? [selectedId] : []);
    return objects.find((object) => object.id === selectedId)
      ?? objects.find((object) => normalisedSelectedIds.includes(object.id))
      ?? null;
  }, [objects, selectedId, selectedIds]);

  useEffect(() => {
    setRenameDraft(activeScene?.name ?? '');
  }, [activeSceneId, activeScene?.name]);

  const applyCamera = (patch: Partial<CameraState>) => {
    pushHistory();
    setCamera(patch);
  };

  const applyStageCamera3D = (patch: Parameters<typeof setStageCamera3D>[0]) => {
    pushHistory();
    setStageCamera3D(patch);
  };

  const handleApplyAviUtlCameraTargetPreset = () => {
    if (!cameraTargetObject) return;
    const patch = buildAviUtlCameraTargetPatch(cameraTargetObject, {
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      distanceZ: Math.max(1, stageCamera3D.position.z - stageCamera3D.target.z || 900),
      targetZ: stageCamera3D.target.z
    });
    applyStageCamera3D(patch);
  };

  return (
    <div className="panel-content">
      <SectionHeader label="Scene" />
      <Row label={language === 'en' ? 'Active' : 'アクティブ'}>
        <select
          value={activeSceneId}
          onChange={(e) => switchScene(e.target.value)}
        >
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>{scene.name}</option>
          ))}
        </select>
      </Row>
      <Row label={language === 'en' ? 'Scene Name' : 'シーン名'}>
        <input
          type="text"
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={() => renameScene(activeSceneId, renameDraft)}
        />
      </Row>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" onClick={() => addScene()} style={{ flex: 1 }}>
          + {language === 'en' ? 'Scene' : 'シーン'}
        </button>
        <button
          className="btn-danger"
          type="button"
          disabled={scenes.length <= 1}
          onClick={() => {
            if (scenes.length <= 1) return;
            if (!window.confirm('このシーンを削除します。よろしいですか？')) return;
            deleteScene(activeSceneId);
          }}
          style={{ flex: 1 }}
        >
          {language === 'en' ? 'Delete' : '削除'}
        </button>
      </div>

      <SectionHeader label="Camera" />
      <Row label="Pan X">
        <input
          type="number"
          value={camera.centreOffsetX}
          onChange={(e) => applyCamera({ centreOffsetX: parseFloat(e.target.value) || 0 })}
        />
      </Row>
      <Row label="Pan Y">
        <input
          type="number"
          value={camera.centreOffsetY}
          onChange={(e) => applyCamera({ centreOffsetY: parseFloat(e.target.value) || 0 })}
        />
      </Row>
      <Row label="Zoom">
        <Slider
          min="0.1"
          max="3"
          step="0.05"
          value={camera.zoom}
          onInput={(e) => applyCamera({ zoom: parseFloat(e.currentTarget.value) })}
          style={{ width: '100%' }}
        />
      </Row>
      <Row label="Rotation °">
        <Slider
          min="-180"
          max="180"
          step="1"
          value={camera.rotationDeg}
          onInput={(e) => applyCamera({ rotationDeg: parseFloat(e.currentTarget.value) })}
          style={{ width: '100%' }}
        />
      </Row>

      {editorMode === '3d_stage' && (
        <>
          <SectionHeader label={t('stageCamera3dTitle')} />
          <Row label={t('camEyeX')}>
            <input
              type="number"
              step="0.1"
              value={stageCamera3D.position.x}
              onChange={(e) => applyStageCamera3D({ position: { x: parseFloat(e.target.value) || 0 } })}
            />
          </Row>
          <Row label={t('camEyeY')}>
            <input
              type="number"
              step="0.1"
              value={stageCamera3D.position.y}
              onChange={(e) => applyStageCamera3D({ position: { y: parseFloat(e.target.value) || 0 } })}
            />
          </Row>
          <Row label={t('camEyeZ')}>
            <input
              type="number"
              step="0.1"
              value={stageCamera3D.position.z}
              onChange={(e) => applyStageCamera3D({ position: { z: parseFloat(e.target.value) || 0 } })}
            />
          </Row>
          <Row label={t('camTargetX')}>
            <input
              type="number"
              step="0.1"
              value={stageCamera3D.target.x}
              onChange={(e) => applyStageCamera3D({ target: { x: parseFloat(e.target.value) || 0 } })}
            />
          </Row>
          <Row label={t('camTargetY')}>
            <input
              type="number"
              step="0.1"
              value={stageCamera3D.target.y}
              onChange={(e) => applyStageCamera3D({ target: { y: parseFloat(e.target.value) || 0 } })}
            />
          </Row>
          <Row label={t('camTargetZ')}>
            <input
              type="number"
              step="0.1"
              value={stageCamera3D.target.z}
              onChange={(e) => applyStageCamera3D({ target: { z: parseFloat(e.target.value) || 0 } })}
            />
          </Row>
          <SectionHeader label="AviUtl Camera" />
          {aviUtlCameraPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-label="93: 選択オブジェクトを目標にする"
              disabled={!cameraTargetObject}
              onClick={handleApplyAviUtlCameraTargetPreset}
              style={{ width: '100%', marginBottom: '8px' }}
            >
              {preset.labelJa}
            </button>
          ))}
        </>
      )}
    </div>
  );
};

const PropertyPanel: React.FC = () => {
  const selectedId = useStore((state) => state.selectedId);
  const selectedIds = useStore((state) => state.selectedIds);
  const objects = useStore((state) => state.objects);
  const layers = useStore((state) => state.layers);
  const projectSettings = useStore((state) => state.projectSettings);
  const language = useStore((state) => state.language);
  const t = useTranslation(language);
  const editorMode = projectSettings.editorMode ?? '2d';

  const selectedObject = useMemo(() => {
    const normalisedSelectedIds = selectedIds.length > 0
      ? selectedIds
      : (selectedId ? [selectedId] : []);
    return objects.find((obj) => obj.id === selectedId)
      ?? objects.find((obj) => normalisedSelectedIds.includes(obj.id))
      ?? null;
  }, [objects, selectedId, selectedIds]);

  const selectedCount = useMemo(
    () => (selectedIds.length > 0 ? selectedIds.length : (selectedId ? 1 : 0)),
    [selectedId, selectedIds]
  );

  const selectedObjects = useMemo(() => {
    const normalisedSelectedIds = selectedIds.length > 0
      ? selectedIds
      : (selectedId ? [selectedId] : []);
    return objects.filter((obj) => (
      normalisedSelectedIds.includes(obj.id)
      && layers[obj.layer]?.locked !== true
    ));
  }, [layers, objects, selectedId, selectedIds]);
  const pushHistory = useStore((state) => state.pushHistory);
  const updateObject = useStore((state) => state.updateObject);
  const beginProxyGeneration = useStore((state) => state.beginProxyGeneration);
  const endProxyGeneration = useStore((state) => state.endProxyGeneration);
  const addObjectFilter = useStore((state) => state.addObjectFilter);
  const toggleObjectFilter = useStore((state) => state.toggleObjectFilter);
  const moveObjectFilter = useStore((state) => state.moveObjectFilter);
  const removeObjectFilter = useStore((state) => state.removeObjectFilter);
  const updateObjectFilterParams = useStore((state) => state.updateObjectFilterParams);
  const setGroupGradient = useStore((state) => state.setGroupGradient);
  const aviUtlCoordinateStoreSnapshot = useStore((state) => state.aviUtlCoordinateStoreSnapshot);
  const captureSelectedCoordinatesWithAviUtlStore = useStore((state) => state.captureSelectedCoordinatesWithAviUtlStore);
  const applyAviUtlStoredCoordinatesToSelection = useStore((state) => state.applyAviUtlStoredCoordinatesToSelection);
  const currentTime = useStore((state) => state.currentTime);
  const visionDetectionPreviewEnabled = useStore((state) => state.visionDetectionPreviewEnabled);
  const setVisionDetectionPreviewEnabled = useStore((state) => state.setVisionDetectionPreviewEnabled);
  const visionDetectionRealtimeEnabled = useStore((state) => state.visionDetectionRealtimeEnabled);
  const setVisionDetectionRealtimeEnabled = useStore((state) => state.setVisionDetectionRealtimeEnabled);
  const visionDetectionOverlay = useStore((state) => state.visionDetectionOverlay);
  const setVisionDetectionOverlay = useStore((state) => state.setVisionDetectionOverlay);
  const [isRefreshingPsdTree, setIsRefreshingPsdTree] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [batchMoveX, setBatchMoveX] = useState('0');
  const [batchMoveY, setBatchMoveY] = useState('0');
  const [batchScaleXPercent, setBatchScaleXPercent] = useState('100');
  const [batchScaleYPercent, setBatchScaleYPercent] = useState('100');
  const [batchRotation, setBatchRotation] = useState('0');
  const [batchOpacityPercent, setBatchOpacityPercent] = useState('0');
  const [scaleAspectLocked, setScaleAspectLocked] = useState(true);
  const [coreMlTrackSupported, setCoreMlTrackSupported] = useState(false);
  const [visionTrackOverlayId, setVisionTrackOverlayId] = useState('');
  const [visionBoxX, setVisionBoxX] = useState('0.35');
  const [visionBoxY, setVisionBoxY] = useState('0.35');
  const [visionBoxW, setVisionBoxW] = useState('0.3');
  const [visionBoxH, setVisionBoxH] = useState('0.3');
  const [visionFrameStride, setVisionFrameStride] = useState('2');
  const [visionTrackBusy, setVisionTrackBusy] = useState(false);
  const [visionDetectedAnimals, setVisionDetectedAnimals] = useState<CoreMlAnimalObservation[]>([]);
  const [visionSelectedAnimalIndex, setVisionSelectedAnimalIndex] = useState(-1);
  const [visionPickOpen, setVisionPickOpen] = useState(false);
  const [visionPickUrl, setVisionPickUrl] = useState<string | null>(null);
  const [visionPersonMaskUrl, setVisionPersonMaskUrl] = useState<string | null>(null);
  const [lastVisionTrackSamples, setLastVisionTrackSamples] = useState<CoreMlTrackSample[]>([]);
  const [proxyGenerating, setProxyGenerating] = useState(false);
  const [proxyMessage, setProxyMessage] = useState('');

  const filters = selectedObject?.filters ?? [];
  const activeFilter = filters.find((filter) => filter.id === activeFilterId) ?? null;

  useEffect(() => {
    if (!selectedObject || filters.length === 0) {
      if (activeFilterId !== null) setActiveFilterId(null);
      return;
    }
    if (!activeFilterId || !filters.some((filter) => filter.id === activeFilterId)) {
      setActiveFilterId(filters[filters.length - 1].id);
    }
  }, [activeFilterId, filters, selectedObject]);

  useEffect(() => {
    let cancelled = false;
    invokeCoreMlTrackObjectSupported()
      .then((supported) => {
        if (!cancelled) setCoreMlTrackSupported(supported);
      })
      .catch(() => {
        if (!cancelled) setCoreMlTrackSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visionTrackOverlayCandidates = useMemo(() => {
    if (selectedObject?.type !== 'video') return [];
    const video = selectedObject as VideoObject;
    const v0 = video.startTime;
    const v1 = video.startTime + video.duration;
    const types: TimelineObject['type'][] = ['image', 'shape', 'text', 'psd'];
    return objects.filter((o) => {
      if (o.id === video.id) return false;
      if (!types.includes(o.type)) return false;
      const o0 = o.startTime;
      const o1 = o.startTime + o.duration;
      return o0 < v1 && o1 > v0;
    });
  }, [objects, selectedObject]);

  const getColorSampleCandidates = useMemo(() => {
    if (selectedObject?.type !== 'getcolor_dot_field') return [];
    const sampleObject = selectedObject as GetColorDotFieldObject;
    const start = sampleObject.startTime;
    const end = sampleObject.startTime + sampleObject.duration;
    return objects.filter((object) => {
      if (object.id === sampleObject.id) return false;
      if (object.type !== 'image' && object.type !== 'psd') return false;
      const objectStart = object.startTime;
      const objectEnd = object.startTime + object.duration;
      return objectStart < end && objectEnd > start;
    });
  }, [objects, selectedObject]);

  const getColorBackgroundColourPalette = useMemo(() => {
    if (selectedObject?.type !== 'getcolor_dot_field') return [];
    return extractAviUtlBackgroundColourPalette(objects, {
      maxColours: 8,
      excludeObjectIds: [selectedObject.id]
    });
  }, [objects, selectedObject]);

  const hksyBackgroundColourPalette = useMemo(() => {
    if (selectedObject?.type !== 'hksy_checker_grid') return [];
    return extractAviUtlBackgroundColourPalette(objects, {
      maxColours: 8,
      excludeObjectIds: [selectedObject.id]
    });
  }, [objects, selectedObject]);

  useEffect(() => {
    if (selectedObject?.type !== 'video') {
      setVisionTrackOverlayId('');
      return;
    }
    if (visionTrackOverlayCandidates.length === 0) {
      setVisionTrackOverlayId('');
      return;
    }
    setVisionTrackOverlayId((prev) => (
      visionTrackOverlayCandidates.some((o) => o.id === prev) ? prev : visionTrackOverlayCandidates[0].id
    ));
  }, [selectedObject?.id, selectedObject?.type, visionTrackOverlayCandidates]);

  useEffect(() => {
    setLastVisionTrackSamples([]);
    setVisionDetectedAnimals([]);
    setVisionSelectedAnimalIndex(-1);
    setVisionPersonMaskUrl(null);
    setVisionPickOpen(false);
    setVisionPickUrl(null);
  }, [selectedObject?.id]);

  useEffect(() => {
    if (selectedObject?.type !== 'video') return;
    const ov = visionDetectionOverlay;
    if (ov && ov.videoId === selectedObject.id) {
      setVisionDetectedAnimals(ov.observations);
    }
  }, [visionDetectionOverlay, selectedObject?.id, selectedObject?.type]);

  if (!selectedObject) {
    return (
      <div className="property-panel no-drag">
        <div className="panel-header">
          <SceneAndCameraPanel />
        </div>
        <div className="panel-content">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px' }}>
            {language === 'en' ? 'No object selected' : 'オブジェクトが選択されていません'}
          </div>
        </div>
      </div>
    );
  }

  const handleChange = (key: string, value: unknown) => {
    updateObject(selectedObject.id, { [key]: value } as Partial<TimelineObject>);
  };

  const applyShatteredSpherePatch = (patch: Partial<ShatteredSphereObject>) => {
    if (selectedObject.type !== 'shattered_sphere') return;
    updateObject(selectedObject.id, patch as Partial<TimelineObject>);
  };

  const applyShatteredSphereNumber = (key: ShatteredSphereNumericKey, value: number) => {
    applyShatteredSpherePatch({ [key]: value } as Partial<ShatteredSphereObject>);
  };

  const handleNumericChange = (key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      if (key === 'scaleX' || key === 'scaleY') {
        updateObject(selectedObject.id, buildAspectLockedScalePatch({
          currentScaleX: selectedObject.scaleX ?? 1,
          currentScaleY: selectedObject.scaleY ?? 1,
          changedAxis: key,
          nextValue: num,
          lockAspectRatio: scaleAspectLocked,
        }) as Partial<TimelineObject>);
        return;
      }
      updateObject(selectedObject.id, { [key]: num } as Partial<TimelineObject>);
    }
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const toNumberOr = (rawValue: string, fallback: number) => {
    const parsed = parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const generatedInputStyle: React.CSSProperties = {
    width: '100%',
    background: '#1e1e1e',
    border: '1px solid #444',
    color: '#eee'
  };

  const parseNumberList = (rawValue: string, fallback: number[]): number[] => {
    const values = rawValue
      .split(',')
      .map((part) => parseFloat(part.trim()))
      .filter((value) => Number.isFinite(value));
    return values.length > 0 ? values : fallback;
  };

  const parseColourList = (rawValue: string, fallback: string[]): string[] => {
    const values = rawValue
      .split(',')
      .map((part) => part.trim())
      .filter((value) => /^#[0-9a-f]{6}$/i.test(value));
    return values.length > 0 ? values : fallback;
  };

  const parseTextList = (rawValue: string, fallback: string[]): string[] => {
    const values = rawValue
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return values.length > 0 ? values : fallback;
  };

  const parseTrackRanges = (rawValue: string, fallback: [number, number][]): [number, number][] => {
    const ranges = rawValue
      .split(',')
      .map((part): [number, number] | null => {
        const [minRaw, maxRaw] = part.split('-');
        const min = parseFloat(minRaw?.trim() ?? '');
        const max = parseFloat(maxRaw?.trim() ?? '');
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        return [min, max];
      })
      .filter((range): range is [number, number] => range !== null);
    return ranges.length > 0 ? ranges : fallback;
  };

  const renderGeneratedNumberRow = (
    label: string,
    key: string,
    value: number,
    min: number,
    max: number,
    step: number,
    fallback: number,
    integer = false
  ) => (
    <Row label={label}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 1fr) 76px', gap: '8px', alignItems: 'center' }}>
        <Slider
          min={String(min)}
          max={String(max)}
          step={String(step)}
          value={value}
          onInput={(e) => {
            const next = clamp(toNumberOr(e.currentTarget.value, fallback), min, max);
            handleChange(key, integer ? Math.round(next) : next);
          }}
          style={{ width: '100%' }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = clamp(toNumberOr(e.target.value, fallback), min, max);
            handleChange(key, integer ? Math.round(next) : next);
          }}
          style={{ width: '76px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
        />
      </div>
    </Row>
  );

  const renderGeneratedTextRow = (label: string, key: string, value: string) => (
    <Row label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(key, e.target.value)}
        style={generatedInputStyle}
      />
    </Row>
  );

  const renderGeneratedColourRow = (label: string, key: string, value: string) => (
    <Row label={label}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input type="color" value={value} onChange={(e) => handleChange(key, e.target.value)} />
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(key, e.target.value)}
          style={{ width: '92px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
        />
      </div>
    </Row>
  );

  const renderGeneratedCheckboxRow = (label: string, key: string, value: boolean) => (
    <Row label={label}>
      <input type="checkbox" checked={value} onChange={(e) => handleChange(key, e.target.checked)} />
    </Row>
  );

  const renderGeneratedSelectRow = (label: string, key: string, value: string | number, options: Array<{ value: string | number; label: string }>) => (
    <Row label={label}>
      <select
        value={value}
        onChange={(e) => {
          const selected = options.find((option) => String(option.value) === e.target.value);
          handleChange(key, selected?.value ?? e.target.value);
        }}
        style={generatedInputStyle}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Row>
  );

  const renderGeneratedNumberListRow = (label: string, key: string, value: number[]) => (
    <Row label={label}>
      <input
        type="text"
        value={value.join(', ')}
        onChange={(e) => handleChange(key, parseNumberList(e.target.value, value))}
        style={generatedInputStyle}
      />
    </Row>
  );

  const renderGeneratedColourListRow = (label: string, key: string, value: string[]) => (
    <Row label={label}>
      <input
        type="text"
        value={value.join(', ')}
        onChange={(e) => handleChange(key, parseColourList(e.target.value, value))}
        style={generatedInputStyle}
      />
    </Row>
  );

  const renderGeneratedTextListRow = (label: string, key: string, value: string[]) => (
    <Row label={label}>
      <input
        type="text"
        value={value.join(', ')}
        onChange={(e) => handleChange(key, parseTextList(e.target.value, value))}
        style={generatedInputStyle}
      />
    </Row>
  );

  const renderGeneratedTrackRangesRow = (label: string, key: string, value: [number, number][]) => (
    <Row label={label}>
      <input
        type="text"
        value={value.map(([min, max]) => `${min}-${max}`).join(', ')}
        onChange={(e) => handleChange(key, parseTrackRanges(e.target.value, value))}
        style={generatedInputStyle}
      />
    </Row>
  );
   const filterLabel: Record<FilterType, string> = {
     color_correction: language === 'en' ? 'Color Correction' : '色調補正',
     colour_aberration: language === 'en' ? 'Colour Aberration' : '色収差',
     outline: language === 'en' ? 'Outline' : '縁取り',
     clipping: language === 'en' ? 'Clipping' : 'クリッピング',
    vibration: language === 'en' ? 'Vibration' : '振動',
    shadow: language === 'en' ? 'Shadow' : '影',
    gradient: language === 'en' ? 'Gradient' : 'グラデーション',
    blur: language === 'en' ? 'Blur' : 'ぼかし',
    fade: language === 'en' ? 'Fade' : 'フェード（不透明度）',
    wipe: language === 'en' ? 'Wipe' : 'ワイプ',
    spot_light: language === 'en' ? 'SpotLight' : 'SpotLight',
    displacement_map: language === 'en' ? '93 Displacement Map B' : '93 ディスプレイスメントマップB',
    fake_dof: language === 'en' ? '93 Fake DOF2' : '93 偽被写界深度2',
    auto_blur: language === 'en' ? '93 Auto Blur+' : '93 オートブラー+',
    stretch: language === 'en' ? '93 Stretch' : '93 Stretch',
    multi_slicer: language === 'en' ? '93 MultiSlicer' : '93 MultiSlicer',
    oct_transform: language === 'en' ? '93 Oct Transform' : '93 簡易変形(oct)',
    area_expand: language === 'en' ? '93 Area Expand S' : '93 領域拡張S',
    smart_clipping: language === 'en' ? '93 Clipping S' : '93 クリッピングS'
  };
  const canUseGradientFilter = selectedObject.type === 'shape';
  const currentGroupId = selectedObject.groupId ?? null;
  const currentGroupObjects = currentGroupId
    ? objects.filter((obj) => obj.groupId === currentGroupId)
    : [];
  const canEditGroupGradient = currentGroupId !== null && currentGroupObjects.length >= 2;
  const currentGroupGradient = (canEditGroupGradient
    ? currentGroupObjects.find((obj) => obj.groupGradient)?.groupGradient
    : null) ?? null;

  const resetBatchTransformInputs = () => {
    setBatchMoveX('0');
    setBatchMoveY('0');
    setBatchScaleXPercent('100');
    setBatchScaleYPercent('100');
    setBatchRotation('0');
    setBatchOpacityPercent('0');
  };

  const handleApplyBatchTransform = () => {
    if (selectedObjects.length < 2) return;

    const moveX = toNumberOr(batchMoveX, 0);
    const moveY = toNumberOr(batchMoveY, 0);
    const scaleXRatio = Math.max(0, toNumberOr(batchScaleXPercent, 100) / 100);
    const scaleYRatio = Math.max(0, toNumberOr(batchScaleYPercent, 100) / 100);
    const rotationDelta = toNumberOr(batchRotation, 0);
    const opacityDelta = toNumberOr(batchOpacityPercent, 0) / 100;

    const hasTransform =
      Math.abs(moveX) > 0.0001
      || Math.abs(moveY) > 0.0001
      || Math.abs(scaleXRatio - 1) > 0.0001
      || Math.abs(scaleYRatio - 1) > 0.0001
      || Math.abs(rotationDelta) > 0.0001
      || Math.abs(opacityDelta) > 0.0001;
    if (!hasTransform) return;

    const updates = selectedObjects
      .map((obj) => {
        const patch: Partial<TimelineObject> = {};
        const hasMoveX = Math.abs(moveX) > 0.0001;
        const hasMoveY = Math.abs(moveY) > 0.0001;
        if (hasMoveX) patch.x = obj.x + moveX;
        if (hasMoveY) patch.y = obj.y + moveY;
        if (obj.enableAnimation) {
          if (hasMoveX) patch.endX = (obj.endX ?? obj.x) + moveX;
          if (hasMoveY) patch.endY = (obj.endY ?? obj.y) + moveY;
        }
        if (Math.abs(scaleXRatio - 1) > 0.0001) patch.scaleX = (obj.scaleX ?? 1) * scaleXRatio;
        if (Math.abs(scaleYRatio - 1) > 0.0001) patch.scaleY = (obj.scaleY ?? 1) * scaleYRatio;
        if (Math.abs(rotationDelta) > 0.0001) patch.rotation = (obj.rotation ?? 0) + rotationDelta;
        if (Math.abs(opacityDelta) > 0.0001) patch.opacity = clamp((obj.opacity ?? 1) + opacityDelta, 0, 1);
        if (Object.keys(patch).length === 0) return null;
        return { id: obj.id, patch };
      })
      .filter((entry): entry is { id: string; patch: Partial<TimelineObject> } => entry !== null);
    if (updates.length === 0) return;

    pushHistory();
    updates.forEach((entry) => {
      updateObject(entry.id, entry.patch);
    });
  };

  const handleMediaVolumeChange = (rawValue: string) => {
    if (selectedObject.type !== 'video' && selectedObject.type !== 'audio') return;
    const next = parseFloat(rawValue);
    if (Number.isNaN(next)) return;
    updateObject(selectedObject.id, { volume: clamp(next, 0, 1) } as Partial<TimelineObject>);
  };

  const handleMediaVolumePercentChange = (rawValue: string) => {
    const next = parseFloat(rawValue);
    if (Number.isNaN(next)) return;
    handleMediaVolumeChange(String(next / 100));
  };

  const handleMediaMuteChange = (muted: boolean) => {
    if (selectedObject.type !== 'video' && selectedObject.type !== 'audio') return;
    updateObject(selectedObject.id, { muted } as Partial<TimelineObject>);
  };

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const applyVisionBBoxFields = (b: VisionNormBoundingBox) => {
    const x = clamp01(b.x);
    const y = clamp01(b.y);
    const w = Math.max(0.02, clamp01(b.width));
    const h = Math.max(0.02, clamp01(b.height));
    setVisionBoxX(String(x));
    setVisionBoxY(String(y));
    setVisionBoxW(String(w));
    setVisionBoxH(String(h));
  };

  const mediaTimeForSelectedVideo = (video: VideoObject): number => {
    const offset = video.offset ?? 0;
    const local = currentTime - video.startTime;
    if (local < 0 || local > video.duration) {
      return offset;
    }
    return offset + local;
  };

  const publishVisionDetectionToPreview = (video: VideoObject, mediaT: number, animals: CoreMlAnimalObservation[]) => {
    setVisionDetectionOverlay(
      animals.length === 0
        ? null
        : {
            videoId: video.id,
            mediaTimeSec: mediaT,
            observations: animals.map((a) => ({
              identifier: a.identifier,
              confidence: a.confidence,
              boundingBox: { ...a.boundingBox }
            }))
          }
    );
  };

  const handleVisionDetectAnimals = async () => {
    if (selectedObject.type !== 'video') return;
    const video = selectedObject as VideoObject;
    const diskPath = resolveVideoFsPath(video);
    if (!diskPath) {
      window.alert(language === 'en' ? 'Local video file required.' : 'ローカル動画ファイルが必要です。');
      return;
    }
    setVisionTrackBusy(true);
    try {
      const res = await invokeCoreMlDetectSubjects(diskPath, mediaTimeForSelectedVideo(video));
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      setVisionDetectedAnimals(res.animals);
      setVisionSelectedAnimalIndex(-1);
      publishVisionDetectionToPreview(video, mediaTimeForSelectedVideo(video), res.animals);
      if (res.animals.length === 0) {
        window.alert(language === 'en' ? 'No cats or dogs detected at the playhead.' : '再生ヘッド位置で猫/犬が検出されませんでした。');
      }
    } finally {
      setVisionTrackBusy(false);
    }
  };

  const handleVisionOpenPickModal = async () => {
    if (selectedObject.type !== 'video') return;
    const video = selectedObject as VideoObject;
    const diskPath = resolveVideoFsPath(video);
    if (!diskPath) {
      window.alert(language === 'en' ? 'Local video file required.' : 'ローカル動画ファイルが必要です。');
      return;
    }
    const mediaT = mediaTimeForSelectedVideo(video);
    setVisionTrackBusy(true);
    try {
      const [frameRes, detectRes] = await Promise.all([
        invokeCoreMlFramePreview(diskPath, mediaT),
        invokeCoreMlDetectSubjects(diskPath, mediaT)
      ]);
      if (!frameRes.ok) {
        window.alert(frameRes.error);
        return;
      }
      if (detectRes.ok) {
        setVisionDetectedAnimals(detectRes.animals);
        setVisionSelectedAnimalIndex(-1);
        publishVisionDetectionToPreview(video, mediaT, detectRes.animals);
      }
      setVisionPickUrl(`data:image/jpeg;base64,${frameRes.jpegBase64}`);
      setVisionPickOpen(true);
    } finally {
      setVisionTrackBusy(false);
    }
  };

  const handleVisionPickImageClick: React.MouseEventHandler<HTMLImageElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const nyTop = (e.clientY - rect.top) / Math.max(1, rect.height);
    const vx = nx;
    const vy = 1 - nyTop;
    const hit = visionDetectedAnimals.find((a) => {
      const b = a.boundingBox;
      return vx >= b.x - 1e-4
        && vx <= b.x + b.width + 1e-4
        && vy >= b.y - 1e-4
        && vy <= b.y + b.height + 1e-4;
    });
    if (hit) {
      applyVisionBBoxFields(hit.boundingBox);
    } else {
      const half = 0.14;
      let bx = vx - half;
      let by = vy - half;
      let bw = half * 2;
      let bh = half * 2;
      bx = clamp01(bx);
      by = clamp01(by);
      bw = Math.min(bw, 1 - bx);
      bh = Math.min(bh, 1 - by);
      applyVisionBBoxFields({ x: bx, y: by, width: Math.max(0.02, bw), height: Math.max(0.02, bh) });
    }
    setVisionPickOpen(false);
    setVisionPickUrl(null);
  };

  const handleVisionSegmentPerson = async () => {
    if (selectedObject.type !== 'video') return;
    const video = selectedObject as VideoObject;
    const diskPath = resolveVideoFsPath(video);
    if (!diskPath) {
      window.alert(language === 'en' ? 'Local video file required.' : 'ローカル動画ファイルが必要です。');
      return;
    }
    setVisionTrackBusy(true);
    try {
      const res = await invokeCoreMlSegmentPerson(diskPath, mediaTimeForSelectedVideo(video));
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      if (res.maskPngBase64) {
        setVisionPersonMaskUrl(`data:image/png;base64,${res.maskPngBase64}`);
      } else {
        setVisionPersonMaskUrl(null);
        window.alert(
          res.message
            ?? (language === 'en'
              ? 'No person mask at the playhead (Vision person segmentation).'
              : '再生ヘッド位置で人物マスクを取得できませんでした（Vision の人物セグメンテーション）。')
        );
      }
    } finally {
      setVisionTrackBusy(false);
    }
  };

  const handleVisionApplyCropFromLastTrack = () => {
    if (selectedObject.type !== 'video') return;
    const video = selectedObject as VideoObject;
    if (lastVisionTrackSamples.length === 0) {
      window.alert(language === 'en' ? 'Run tracking first.' : '先にトラッキングを実行してください。');
      return;
    }
    const kfs = buildSubjectCropKeyframesFromVisionTrackSamples(lastVisionTrackSamples, video);
    if (kfs.length === 0) return;
    pushHistory();
    updateObject(video.id, {
      subjectCropEnabled: true,
      subjectCropKeyframes: kfs
    } as Partial<TimelineObject>);
  };

  const handleGenerateProxy = async () => {
    if (selectedObject?.type !== 'video') return;
    const video = selectedObject as VideoObject;
    const diskPath = resolveVideoFsPath(video);
    if (!diskPath) {
      window.alert('ローカルファイルが必要です（filePath が未設定）。');
      return;
    }
    setProxyGenerating(true);
    setProxyMessage('プロキシ生成中...');
    beginProxyGeneration();
    const { generateProxy } = await import('../utils/proxyUtils');
    let result: Awaited<ReturnType<typeof generateProxy>>;
    try {
      result = await generateProxy({ filePath: diskPath });
    } finally {
      endProxyGeneration();
    }
    setProxyGenerating(false);
    if (result.success && result.proxyFilePath) {
      updateObject(video.id, { proxyFilePath: result.proxyFilePath } as Partial<TimelineObject>);
      setProxyMessage(`完了: ${result.proxyFilePath.split('/').pop()}`);
    } else {
      setProxyMessage(`失敗: ${result.error ?? '不明なエラー'}`);
    }
  };

  const handleRemoveProxy = () => {
    if (selectedObject?.type !== 'video') return;
    updateObject(selectedObject.id, { proxyFilePath: undefined } as Partial<TimelineObject>);
    setProxyMessage('');
  };

  const handleVisionTrackRun = async () => {
    if (selectedObject.type !== 'video') return;
    const video = selectedObject as VideoObject;
    const diskPath = resolveVideoFsPath(video);
    if (!diskPath) {
      window.alert(
        language === 'en'
          ? 'Video must be a local file (drop a file or open a project with file paths).'
          : '動画がローカルファイルである必要があります（ファイルをドロップするか、filePath のあるプロジェクトを開いてください）。'
      );
      return;
    }
    const overlay = objects.find((o) => o.id === visionTrackOverlayId);
    if (!overlay) {
      window.alert(language === 'en' ? 'Select an overlay object to move.' : '移動させるオーバーレイを選んでください。');
      return;
    }
    const bx = parseFloat(visionBoxX);
    const by = parseFloat(visionBoxY);
    const bw = parseFloat(visionBoxW);
    const bh = parseFloat(visionBoxH);
    if ([bx, by, bw, bh].some((n) => Number.isNaN(n)) || bw <= 0 || bh <= 0) {
      window.alert(language === 'en' ? 'Invalid bounding box.' : '初期矩形が無効です。');
      return;
    }
    const strideParsed = parseInt(visionFrameStride, 10);
    const frameStride = Number.isFinite(strideParsed) && strideParsed >= 1 ? strideParsed : 2;
    const offsetSec = video.offset ?? 0;
    const startSec = offsetSec;
    const endSec = offsetSec + video.duration;

    setVisionTrackBusy(true);
    try {
      const res = await invokeCoreMlTrackObject({
        videoPath: diskPath,
        startSec,
        endSec,
        initialBoundingBox: { x: bx, y: by, width: bw, height: bh },
        frameStride,
        targetFps: projectSettings.fps,
      });
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      if (res.message) {
        window.alert(
          language === 'en'
            ? res.message
            : `トラッキングが途中で終了しました。\n\n${res.message}`
        );
      }
      setLastVisionTrackSamples(res.samples);
      const built = buildOverlayPositionKeyframesFromVisionTrack({
        samples: res.samples,
        video,
        overlay,
        allObjects: objects,
      });
      if (built.length === 0) {
        window.alert(language === 'en' ? 'No tracking samples returned.' : 'トラッキング結果が空です。');
        return;
      }
      const merge =
        overlay.keyframes && overlay.keyframes.length > 0
          ? window.confirm(
              language === 'en'
                ? 'Merge with existing position keyframes? (Cancel replaces them.)'
                : '既存の位置キーフレームとマージしますか？（キャンセルで置き換え）'
            )
          : false;
      pushHistory();
      let nextKeyframes = built;
      if (merge && overlay.keyframes && overlay.keyframes.length > 0) {
        const keyOf = (t: number) => Math.round(t * 1000);
        const byTime = new Map<number, PositionKeyframe>();
        overlay.keyframes.forEach((k) => byTime.set(keyOf(k.time), k));
        built.forEach((k) => byTime.set(keyOf(k.time), k));
        nextKeyframes = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
      }
      updateObject(overlay.id, { keyframes: nextKeyframes, enableAnimation: false } as Partial<TimelineObject>);
    } finally {
      setVisionTrackBusy(false);
    }
  };

  const handlePsdScaleChange = (rawValue: string) => {
      if (selectedObject.type !== 'psd') return;
      const next = parseFloat(rawValue);
      if (Number.isNaN(next)) return;
      updateObject(selectedObject.id, { scale: clamp(next, 0.1, 10) } as Partial<TimelineObject>);
  };

  const handleGetColorSampleLayerChange = (rawValue: string) => {
    if (selectedObject.type !== 'getcolor_dot_field') return;
    const parsed = parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return;
    updateObject(selectedObject.id, {
      sampleSourceLayer: Math.max(0, parsed - 1),
    } as Partial<TimelineObject>);
  };

  const handleGetColorSampleObjectChange = (objectId: string) => {
    if (selectedObject.type !== 'getcolor_dot_field') return;
    updateObject(selectedObject.id, {
      sampleSourceObjectId: objectId || undefined,
      sampleSourcePath: undefined,
    } as Partial<TimelineObject>);
  };

  const handleGetColorSampleStrengthChange = (rawValue: string) => {
    if (selectedObject.type !== 'getcolor_dot_field') return;
    const parsed = parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return;
    updateObject(selectedObject.id, {
      sampleStrength: clamp(parsed, 0, 1),
    } as Partial<TimelineObject>);
  };

  const handleGetColorSampleHueShiftChange = (rawValue: string) => {
    if (selectedObject.type !== 'getcolor_dot_field') return;
    const parsed = parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return;
    updateObject(selectedObject.id, {
      sampleHueShiftDegrees: clamp(parsed, -720, 720),
    } as Partial<TimelineObject>);
  };

  const handleApplyAviUtlBackgroundColourPalette = () => {
    if (selectedObject.type !== 'getcolor_dot_field') return;
    const patch = buildAviUtlBackgroundColourPalettePatch(objects, {
      excludeObjectIds: [selectedObject.id]
    });
    if (!patch) return;
    updateObject(selectedObject.id, patch as Partial<TimelineObject>);
  };

  const handleApplyAviUtlHksyBackgroundColourPalette = () => {
    if (selectedObject.type !== 'hksy_checker_grid') return;
    const patch = buildAviUtlHksyPalettePatch(objects, {
      excludeObjectIds: [selectedObject.id]
    });
    if (!patch) return;
    updateObject(selectedObject.id, patch as Partial<TimelineObject>);
  };

  const handleAddFilter = (type: FilterType) => {
    addObjectFilter(selectedObject.id, type);
  };

  const handleToggleFilter = (filterId: string) => {
    toggleObjectFilter(selectedObject.id, filterId);
  };

  const handleMoveFilter = (filterId: string, direction: 'up' | 'down') => {
    moveObjectFilter(selectedObject.id, filterId, direction);
  };

  const handleRemoveFilter = (filterId: string) => {
    removeObjectFilter(selectedObject.id, filterId);
    if (activeFilterId === filterId) {
      setActiveFilterId(null);
    }
  };

  const handleFilterParamChange = (filter: ObjectFilter, params: Record<string, unknown>) => {
    updateObjectFilterParams(selectedObject.id, filter.id, params);
  };

  const getGradientEditorState = (filter: Extract<ObjectFilter, { type: 'gradient' }>) => {
    let colours = Array.isArray(filter.params.colours)
      ? filter.params.colours.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [];
    if (colours.length === 0) colours = ['#ffffff', '#000000'];
    if (colours.length === 1) colours = [colours[0], colours[0]];
    colours = colours.slice(0, 8);

    const rawStops = Array.isArray(filter.params.stops)
      ? filter.params.stops.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
      : [];
    const stops = colours.map((_, index) => {
      const fallback = colours.length === 1 ? 0 : index / (colours.length - 1);
      return clamp(rawStops[index] ?? fallback, 0, 1);
    });

    return { colours, stops };
  };

  const handleGradientColourChange = (filter: Extract<ObjectFilter, { type: 'gradient' }>, index: number, value: string) => {
    const { colours, stops } = getGradientEditorState(filter);
    colours[index] = value;
    handleFilterParamChange(filter, { colours, stops });
  };

  const handleGradientStopChange = (filter: Extract<ObjectFilter, { type: 'gradient' }>, index: number, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const { colours, stops } = getGradientEditorState(filter);
    stops[index] = clamp(parsed, 0, 1);
    handleFilterParamChange(filter, { colours, stops });
  };

  const normaliseGroupGradient = (gradient: GradientFill | null): GradientFill => {
    const fallback: GradientFill = {
      enabled: false,
      type: 'linear',
      scope: 'connected',
      colours: ['#ffffff', '#000000'],
      stops: [0, 1],
      direction: 0
    };
    if (!gradient) return fallback;

    let colours = Array.isArray(gradient.colours)
      ? gradient.colours.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [];
    if (colours.length === 0) colours = [...fallback.colours];
    if (colours.length === 1) colours = [colours[0], colours[0]];
    colours = colours.slice(0, 8);

    const rawStops = Array.isArray(gradient.stops)
      ? gradient.stops.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
      : [];
    const stops = colours.map((_, index) => {
      const defaultStop = colours.length === 1 ? 0 : index / (colours.length - 1);
      return clamp(rawStops[index] ?? defaultStop, 0, 1);
    });

    return {
      enabled: gradient.enabled === true,
      type: gradient.type === 'radial' ? 'radial' : 'linear',
      scope: gradient.scope === 'group' ? 'group' : 'connected',
      colours,
      stops,
      direction: Number.isFinite(gradient.direction) ? gradient.direction : 0
    };
  };

  const applyGroupGradientPatch = (patch: Partial<GradientFill>) => {
    if (!currentGroupId) return;
    const current = normaliseGroupGradient(currentGroupGradient);
    const next: GradientFill = {
      ...current,
      ...patch
    };
    setGroupGradient(currentGroupId, {
      ...next,
      colours: next.colours.slice(),
      stops: next.stops.slice()
    });
  };

  const handleGroupGradientColourChange = (index: number, value: string) => {
    const current = normaliseGroupGradient(currentGroupGradient);
    const nextColours = current.colours.slice();
    nextColours[index] = value;
    applyGroupGradientPatch({ colours: nextColours, stops: current.stops.slice() });
  };

  const handleGroupGradientStopChange = (index: number, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const current = normaliseGroupGradient(currentGroupGradient);
    const nextStops = current.stops.slice();
    nextStops[index] = clamp(parsed, 0, 1);
    applyGroupGradientPatch({ colours: current.colours.slice(), stops: nextStops });
  };

  const groupGradientState = normaliseGroupGradient(currentGroupGradient);
  const canEditKeyframes = selectedObject.type !== 'audio';
  const keyframes = (selectedObject.keyframes ?? []).slice().sort((a, b) => a.time - b.time);
  const aviUtlMotionPresets = getAviUtlPackMotionPresets();
  const aviUtlEffectPresets = getAviUtlPackEffectPresets();

  const applyKeyframes = (nextKeyframes: PositionKeyframe[]) => {
    const sorted = nextKeyframes.slice().sort((a, b) => a.time - b.time);
    if (sorted.length === 0) {
      updateObject(selectedObject.id, {
        keyframes: [],
        enableAnimation: false
      } as Partial<TimelineObject>);
      return;
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    updateObject(selectedObject.id, {
      keyframes: sorted,
      enableAnimation: sorted.length >= 2,
      x: first.x,
      y: first.y,
      endX: last.x,
      endY: last.y,
      easing: first.easing ?? selectedObject.easing
    } as Partial<TimelineObject>);
  };

  const handleCreateEndpointKeyframes = () => {
    const created = buildEndpointKeyframes(selectedObject);
    applyKeyframes(created);
  };

  const handleAddCurrentKeyframe = () => {
    const currentTime = useStore.getState().currentTime;
    const keyTime = clamp(
      currentTime,
      selectedObject.startTime,
      selectedObject.startTime + selectedObject.duration
    );
    const position = evaluateObjectPositionAtTime(selectedObject, keyTime);
    const nextKeyframe: PositionKeyframe = {
      id: crypto.randomUUID(),
      time: keyTime,
      x: position.x,
      y: position.y,
      easing: selectedObject.easing
    };

    const merged = keyframes.filter((keyframe) => Math.abs(keyframe.time - keyTime) > 0.001);
    merged.push(nextKeyframe);
    applyKeyframes(merged);
  };

  const handleUpdateKeyframe = (keyframeId: string, patch: Partial<PositionKeyframe>) => {
    const next = keyframes.map((keyframe) => {
      if (keyframe.id !== keyframeId) return keyframe;
      return { ...keyframe, ...patch };
    });
    applyKeyframes(next);
  };

  const handleDeleteKeyframe = (keyframeId: string) => {
    applyKeyframes(keyframes.filter((keyframe) => keyframe.id !== keyframeId));
  };

  const handleApplyAviUtlMotionPreset = (presetId: AviUtlMotionPresetId) => {
    pushHistory();
    if (sequenceAwareMotionPresets.has(presetId) && selectedObjects.length > 1) {
      selectedObjects.forEach((object, index) => {
        updateObject(
          object.id,
          buildAviUtlMotionPresetPatch(object, presetId, {
            sequenceIndex: index,
            sequenceTotal: selectedObjects.length
          }) as Partial<TimelineObject>
        );
      });
      return;
    }
    updateObject(
      selectedObject.id,
      buildAviUtlMotionPresetPatch(selectedObject, presetId) as Partial<TimelineObject>
    );
  };

  const handleCaptureAviUtlCoordinateStore = () => {
    captureSelectedCoordinatesWithAviUtlStore(`selection-${selectedCount}`);
  };

  const handleApplyAviUtlCoordinateStore = () => {
    applyAviUtlStoredCoordinatesToSelection();
  };

  const handleApplyAviUtlEffectPreset = (presetId: AviUtlEffectPresetId) => {
    pushHistory();
    const nextObject = applyAviUtlEffectPresetToObject(selectedObject, presetId);
    const nextFilters = nextObject.filters ?? [];
    updateObject(selectedObject.id, {
      filters: nextFilters,
      colorCorrection: nextObject.colorCorrection,
      customClipping: nextObject.customClipping,
      vibration: nextObject.vibration,
      shadow: nextObject.shadow,
      ...(nextObject.type === 'shape' ? { gradient: nextObject.gradient } : {})
    } as Partial<TimelineObject>);
    setActiveFilterId(nextFilters[nextFilters.length - 1]?.id ?? null);
  };

  const handlePsdLayerToggle = (seq: string | null) => {
      if (!seq || selectedObject.type !== 'psd') return;

      const psdObject = selectedObject as PsdObject;
      if (!psdObject.rootLayer || !psdObject.activeLayerIds) return;

      const nextActiveLayerIds = togglePsdLayer(psdObject.rootLayer, psdObject.activeLayerIds, seq);
      const nextLayerTree = buildPsdLayerTree(psdObject.rootLayer, nextActiveLayerIds);

      updateObject(psdObject.id, {
          activeLayerIds: nextActiveLayerIds,
          layerTree: nextLayerTree
      });
  };

  const handleRefreshPsdTree = async () => {
      if (selectedObject.type !== 'psd') return;
      const psdObject = selectedObject as PsdObject;
      if (!psdObject.rootLayer || !psdObject.activeLayerIds) return;

      try {
          setIsRefreshingPsdTree(true);
          const tree = buildPsdLayerTree(psdObject.rootLayer, psdObject.activeLayerIds);
          updateObject(selectedObject.id, { layerTree: tree });
      } catch (e) {
          console.error('Failed to refresh PSD layer tree:', e);
      } finally {
          setIsRefreshingPsdTree(false);
      }
  };

  const renderPsdTree = (nodes: PsdLayerStruct[], depth: number = 0): React.ReactNode => {
      return nodes.map((node, idx) => {
          const key = `${node.seq ?? 'group'}-${depth}-${idx}-${node.name}`;
          const isGroupNode = !node.seq;
          const label = node.name.startsWith('*') ? node.name.slice(1) : node.name;

          return (
              <div key={key} style={{ marginLeft: depth * 12, marginBottom: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: isGroupNode ? '#9aa' : '#ddd' }}>
                      <input
                          type="checkbox"
                          checked={!!node.checked}
                          disabled={isGroupNode}
                          onChange={() => handlePsdLayerToggle(node.seq)}
                      />
                      <span>{label || '(Unnamed)'}</span>
                  </label>
                  {node.children && node.children.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                          {renderPsdTree(node.children, depth + 1)}
                      </div>
                  )}
              </div>
          );
      });
  };

  return (
    <>
    <div className="property-panel no-drag">
      <div className="panel-header">
        <SceneAndCameraPanel />
      </div>
      
      <div className="panel-content" style={{ borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{selectedObject.name}</span>
          {selectedCount > 1 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
              ({selectedCount} objects)
            </span>
          )}
        </div>
      </div>
      
      <div className="panel-content">
        {selectedCount > 1 && (
            <>
                <SectionHeader label="一括変形" />
                <div style={{ fontSize: '11px', color: '#8fb9ff', marginBottom: '8px' }}>
                    {selectedCount}個のオブジェクトに同時適用します
                </div>
                <Row label="移動 X">
                    <input
                        type="number"
                        value={batchMoveX}
                        onChange={(e) => setBatchMoveX(e.target.value)}
                        style={{ width: '80px' }}
                    />
                </Row>
                <Row label="移動 Y">
                    <input
                        type="number"
                        value={batchMoveY}
                        onChange={(e) => setBatchMoveY(e.target.value)}
                        style={{ width: '80px' }}
                    />
                </Row>
                <Row label="拡大率X %">
                    <input
                        type="number"
                        value={batchScaleXPercent}
                        onChange={(e) => setBatchScaleXPercent(e.target.value)}
                        style={{ width: '80px' }}
                    />
                </Row>
                <Row label="拡大率Y %">
                    <input
                        type="number"
                        value={batchScaleYPercent}
                        onChange={(e) => setBatchScaleYPercent(e.target.value)}
                        style={{ width: '80px' }}
                    />
                </Row>
                <Row label="回転 Δ">
                    <input
                        type="number"
                        value={batchRotation}
                        onChange={(e) => setBatchRotation(e.target.value)}
                        style={{ width: '80px' }}
                    />
                </Row>
                <Row label="不透明度 Δ%">
                    <input
                        type="number"
                        value={batchOpacityPercent}
                        onChange={(e) => setBatchOpacityPercent(e.target.value)}
                        style={{ width: '80px' }}
                    />
                </Row>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleApplyBatchTransform}
                        style={{ flex: 1 }}
                    >
                        {language === 'ja' ? '選択中に適用' : 'Apply to Selected'}
                    </button>
                    <button
                        type="button"
                        onClick={resetBatchTransformInputs}
                    >
                        {language === 'ja' ? 'リセット' : 'Reset'}
                    </button>
                </div>
            </>
        )}

        <Row label="Name">
            <input type="text" value={selectedObject.name} onChange={(e) => handleChange('name', e.target.value)} />
        </Row>
        
        {/* --- 基本座標 --- */}
        <SectionHeader label="Transform" />
        <Row label="X">
            <input type="number" value={selectedObject.x} onChange={(e) => handleNumericChange('x', e.target.value)} style={{ width: '80px' }} />
        </Row>
        <Row label="Y">
            <input type="number" value={selectedObject.y} onChange={(e) => handleNumericChange('y', e.target.value)} style={{ width: '80px' }} />
        </Row>
        <Row label="Scale X">
            <input type="number" step="0.1" value={selectedObject.scaleX ?? 1} onChange={(e) => handleNumericChange('scaleX', e.target.value)} style={{ width: '80px' }} />
        </Row>
        <Row label="Scale Y">
            <input type="number" step="0.1" value={selectedObject.scaleY ?? 1} onChange={(e) => handleNumericChange('scaleY', e.target.value)} style={{ width: '80px' }} />
        </Row>
        <Row label={language === 'en' ? 'Aspect' : '比率'}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <input
                    type="checkbox"
                    checked={scaleAspectLocked}
                    onChange={(e) => setScaleAspectLocked(e.target.checked)}
                />
                {language === 'en' ? 'Lock ratio' : '比率を固定'}
            </label>
        </Row>
        <Row label="Rotation">
            <input type="number" value={selectedObject.rotation} onChange={(e) => handleNumericChange('rotation', e.target.value)} style={{ width: '80px' }} />
        </Row>
        <Row label="Opacity">
            <Slider min="0" max="1" step="0.01" value={selectedObject.opacity} onInput={(e) => handleNumericChange('opacity', e.currentTarget.value)} style={{ width: '100%' }} />
        </Row>

        {canEditKeyframes && (
            <>
                <SectionHeader label="Keyframes" />
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleAddCurrentKeyframe}
                    >
                        {language === 'ja' ? '＋キー' : 'Add Key'}
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateEndpointKeyframes}
                    >
                        {language === 'ja' ? '両端生成' : 'Endpoints'}
                    </button>
                </div>
                <SectionHeader label="AviUtl Motion" />
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleCaptureAviUtlCoordinateStore}
                    >
                        93 座標格納
                    </button>
                    <button
                        type="button"
                        disabled={!aviUtlCoordinateStoreSnapshot}
                        onClick={handleApplyAviUtlCoordinateStore}
                    >
                        93 座標の取得
                    </button>
                    {aviUtlMotionPresets.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleApplyAviUtlMotionPreset(preset.id)}
                        >
                            {preset.labelJa}
                        </button>
                    ))}
                </div>
                {aviUtlCoordinateStoreSnapshot && (
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                        {`93 座標格納: ${aviUtlCoordinateStoreSnapshot.name} / ${aviUtlCoordinateStoreSnapshot.entries.length} objects`}
                    </div>
                )}
                <div style={{ border: '1px solid #333', borderRadius: '4px', padding: '8px', marginBottom: '8px', background: '#1f1f1f' }}>
                    {keyframes.length === 0 && (
                        <div style={{ fontSize: '11px', color: '#888' }}>中間点はまだありません。</div>
                    )}
                    {keyframes.map((keyframe, index) => (
                        <div key={keyframe.id} style={{ borderTop: index === 0 ? 'none' : '1px solid #333', paddingTop: index === 0 ? '0' : '8px', marginTop: index === 0 ? '0' : '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>#{index + 1}</span>
                                <button type="button" onClick={() => handleDeleteKeyframe(keyframe.id)} className="btn-danger" style={{ padding: '0 6px', height: '20px', fontSize: '10px' }}>
                                  {language === 'ja' ? '削除' : 'Del'}
                                </button>
                            </div>
                            <Row label="Time">
                                <input
                                    type="number"
                                    min={selectedObject.startTime}
                                    max={selectedObject.startTime + selectedObject.duration}
                                    step="0.01"
                                    value={keyframe.time}
                                    onChange={(e) => handleUpdateKeyframe(keyframe.id, {
                                      time: clamp(
                                        toNumberOr(e.target.value, keyframe.time),
                                        selectedObject.startTime,
                                        selectedObject.startTime + selectedObject.duration
                                      )
                                    })}
                                    style={{ width: '80px' }}
                                />
                            </Row>
                            <Row label="X">
                                <input
                                    type="number"
                                    value={keyframe.x}
                                    onChange={(e) => handleUpdateKeyframe(keyframe.id, { x: toNumberOr(e.target.value, keyframe.x) })}
                                    style={{ width: '80px' }}
                                />
                            </Row>
                            <Row label="Y">
                                <input
                                    type="number"
                                    value={keyframe.y}
                                    onChange={(e) => handleUpdateKeyframe(keyframe.id, { y: toNumberOr(e.target.value, keyframe.y) })}
                                    style={{ width: '80px' }}
                                />
                            </Row>
                            <Row label="Ease">
                                <select
                                    value={keyframe.easing ?? selectedObject.easing}
                                    onChange={(e) => handleUpdateKeyframe(keyframe.id, { easing: e.target.value as EasingType })}
                                    style={{ width: '100%' }}
                                >
                                    {Object.entries(easingNames).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </Row>
                        </div>
                    ))}
                </div>
            </>
        )}

        {/* --- 合成設定 (マスク) --- */}
        <SectionHeader label="Composition" />
        <Row label="Masking">
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedObject.clipping || false} onChange={(e) => handleChange('clipping', e.target.checked)} style={{ marginRight: '8px' }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Clip by object above</span>
            </label>
        </Row>

        <SectionHeader label="Filter Stack" />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <button type="button" onClick={() => handleAddFilter('color_correction')}>+ {filterLabel.color_correction}</button>
            <button type="button" onClick={() => handleAddFilter('clipping')}>+ {filterLabel.clipping}</button>
            <button type="button" onClick={() => handleAddFilter('vibration')}>+ {filterLabel.vibration}</button>
            <button type="button" onClick={() => handleAddFilter('shadow')}>+ {filterLabel.shadow}</button>
            <button type="button" onClick={() => handleAddFilter('blur')}>+ {filterLabel.blur}</button>
            <button type="button" onClick={() => handleAddFilter('fade')}>+ {filterLabel.fade}</button>
            <button type="button" onClick={() => handleAddFilter('wipe')}>+ {filterLabel.wipe}</button>
            <button type="button" onClick={() => handleAddFilter('displacement_map')}>+ {filterLabel.displacement_map}</button>
            <button type="button" onClick={() => handleAddFilter('fake_dof')}>+ {filterLabel.fake_dof}</button>
            <button type="button" onClick={() => handleAddFilter('auto_blur')}>+ {filterLabel.auto_blur}</button>
            <button type="button" onClick={() => handleAddFilter('stretch')}>+ {filterLabel.stretch}</button>
            <button type="button" onClick={() => handleAddFilter('multi_slicer')}>+ {filterLabel.multi_slicer}</button>
            <button type="button" onClick={() => handleAddFilter('oct_transform')}>+ {filterLabel.oct_transform}</button>
            <button type="button" onClick={() => handleAddFilter('area_expand')}>+ {filterLabel.area_expand}</button>
            <button type="button" onClick={() => handleAddFilter('smart_clipping')}>+ {filterLabel.smart_clipping}</button>
            {canUseGradientFilter && (
                <button type="button" onClick={() => handleAddFilter('gradient')}>+ {filterLabel.gradient}</button>
            )}
        </div>
        <SectionHeader label="AviUtl Effects" />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {aviUtlEffectPresets.map((preset) => (
                <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyAviUtlEffectPreset(preset.id)}
                >
                    + {preset.labelJa}
                </button>
            ))}
        </div>
        <div style={{ border: '1px solid #333', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
            {filters.length === 0 && (
                <div style={{ padding: '8px', fontSize: '11px', color: '#888' }}>フィルタはまだありません。</div>
            )}
            {filters.map((filter, index) => {
                const isActiveFilter = activeFilterId === filter.id;
                return (
                    <div
                        key={filter.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 8px',
                            borderTop: index === 0 ? 'none' : '1px solid #333',
                            background: isActiveFilter ? '#2f2f2f' : '#222',
                            fontSize: '11px',
                            color: '#ddd'
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={filter.enabled}
                            onChange={() => handleToggleFilter(filter.id)}
                        />
                        <button
                            type="button"
                            onClick={() => setActiveFilterId(filter.id)}
                            style={{
                                flex: 1,
                                textAlign: 'left',
                                border: 'none',
                                background: 'transparent',
                                color: isActiveFilter ? '#fff' : '#ccc',
                                cursor: 'pointer',
                                padding: 0
                            }}
                        >
                            {filterLabel[filter.type]}
                        </button>
                        <button type="button" onClick={() => handleMoveFilter(filter.id, 'up')} style={{ border: '1px solid #444', background: '#2a2a2a', color: '#ddd', borderRadius: '3px', padding: '0 4px', cursor: 'pointer' }}>↑</button>
                        <button type="button" onClick={() => handleMoveFilter(filter.id, 'down')} style={{ border: '1px solid #444', background: '#2a2a2a', color: '#ddd', borderRadius: '3px', padding: '0 4px', cursor: 'pointer' }}>↓</button>
                        <button type="button" onClick={() => handleRemoveFilter(filter.id)} style={{ border: '1px solid #553333', background: '#3b2020', color: '#ffb0b0', borderRadius: '3px', padding: '0 4px', cursor: 'pointer' }}>×</button>
                    </div>
                );
            })}
        </div>

        {canEditGroupGradient && (
            <>
                <SectionHeader label="Group Gradient" />
                <div style={{ fontSize: '11px', color: '#8fb9ff', marginBottom: '8px' }}>
                    グループ全体（{currentGroupObjects.length}オブジェクト）へ1つのグラデーションを適用します
                </div>
                <Row label="Enable">
                    <input
                        type="checkbox"
                        checked={groupGradientState.enabled}
                        onChange={(e) => applyGroupGradientPatch({ enabled: e.target.checked })}
                    />
                </Row>
                {groupGradientState.enabled && (
                    <div style={{ marginBottom: '8px', padding: '8px', border: '1px solid #333', borderRadius: '4px', background: '#1f1f1f' }}>
                        <Row label="Type">
                            <select
                                value={groupGradientState.type}
                                onChange={(e) => applyGroupGradientPatch({ type: e.target.value === 'radial' ? 'radial' : 'linear' })}
                                style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            >
                                <option value="linear">Linear</option>
                                <option value="radial">Radial</option>
                            </select>
                        </Row>
                        <Row label="Colour A">
                            <input
                                type="color"
                                value={groupGradientState.colours[0]}
                                onChange={(e) => handleGroupGradientColourChange(0, e.target.value)}
                            />
                        </Row>
                        <Row label="Colour B">
                            <input
                                type="color"
                                value={groupGradientState.colours[1]}
                                onChange={(e) => handleGroupGradientColourChange(1, e.target.value)}
                            />
                        </Row>
                        <Row label="Stop A">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={groupGradientState.stops[0]}
                                onInput={(e) => handleGroupGradientStopChange(0, e.currentTarget.value)}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Stop B">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={groupGradientState.stops[1]}
                                onInput={(e) => handleGroupGradientStopChange(1, e.currentTarget.value)}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        {groupGradientState.type === 'linear' && (
                            <Row label="Direction">
                                <input
                                    type="number"
                                    value={groupGradientState.direction}
                                    onChange={(e) => {
                                      const parsed = parseFloat(e.target.value);
                                      if (Number.isNaN(parsed)) return;
                                      applyGroupGradientPatch({ direction: parsed });
                                    }}
                                    style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                                />
                            </Row>
                        )}
                    </div>
                )}
            </>
        )}

        {activeFilter && (
            <div style={{ marginBottom: '8px', padding: '8px', border: '1px solid #333', borderRadius: '4px', background: '#1f1f1f' }}>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>編集中: {filterLabel[activeFilter.type]}</div>
                {activeFilter.type === 'color_correction' && (
                    <>
                        <Row label="Brightness">
                            <Slider
                                min="0"
                                max="2"
                                step="0.1"
                                value={activeFilter.params.brightness}
                                onInput={(e) => handleFilterParamChange(activeFilter, { brightness: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Contrast">
                            <Slider
                                min="0"
                                max="2"
                                step="0.1"
                                value={activeFilter.params.contrast}
                                onInput={(e) => handleFilterParamChange(activeFilter, { contrast: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Saturation">
                            <Slider
                                min="-1"
                                max="1"
                                step="0.1"
                                value={activeFilter.params.saturation}
                                onInput={(e) => handleFilterParamChange(activeFilter, { saturation: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Hue">
                            <Slider
                                min="0"
                                max="360"
                                step="1"
                                value={activeFilter.params.hue}
                                onInput={(e) => handleFilterParamChange(activeFilter, { hue: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'colour_aberration' && (
                    <>
                        <Row label="Offset X">
                            <Slider
                                min="0"
                                max="24"
                                step="0.5"
                                value={activeFilter.params.offsetX}
                                onInput={(e) => handleFilterParamChange(activeFilter, { offsetX: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Offset Y">
                            <Slider
                                min="0"
                                max="24"
                                step="0.5"
                                value={activeFilter.params.offsetY}
                                onInput={(e) => handleFilterParamChange(activeFilter, { offsetY: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'outline' && (
                    <>
                        <Row label="Colour">
                            <input type="color" value={activeFilter.params.colour} onChange={(e) => handleFilterParamChange(activeFilter, { colour: e.target.value })} />
                        </Row>
                        <Row label="Thickness">
                            <Slider
                                min="0"
                                max="16"
                                step="0.5"
                                value={activeFilter.params.thickness}
                                onInput={(e) => handleFilterParamChange(activeFilter, { thickness: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Opacity">
                            <Slider
                                min="0"
                                max="1"
                                step="0.05"
                                value={activeFilter.params.opacity}
                                onInput={(e) => handleFilterParamChange(activeFilter, { opacity: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'clipping' && (
                    <>
                        <Row label="Top">
                            <input type="number" value={activeFilter.params.top} onChange={(e) => handleFilterParamChange(activeFilter, { top: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Bottom">
                            <input type="number" value={activeFilter.params.bottom} onChange={(e) => handleFilterParamChange(activeFilter, { bottom: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Left">
                            <input type="number" value={activeFilter.params.left} onChange={(e) => handleFilterParamChange(activeFilter, { left: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Right">
                            <input type="number" value={activeFilter.params.right} onChange={(e) => handleFilterParamChange(activeFilter, { right: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Angle">
                            <input type="number" value={activeFilter.params.angle} onChange={(e) => handleFilterParamChange(activeFilter, { angle: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Radius">
                            <input type="number" value={activeFilter.params.radius} onChange={(e) => handleFilterParamChange(activeFilter, { radius: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'vibration' && (
                    <>
                        <Row label="Strength">
                            <input type="number" value={activeFilter.params.strength} onChange={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Speed">
                            <input type="number" value={activeFilter.params.speed} onChange={(e) => handleFilterParamChange(activeFilter, { speed: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'shadow' && (
                    <>
                        <Row label="Colour">
                            <input type="color" value={activeFilter.params.colour} onChange={(e) => handleFilterParamChange(activeFilter, { colour: e.target.value })} />
                        </Row>
                        <Row label="Blur">
                            <input type="number" value={activeFilter.params.blur} onChange={(e) => handleFilterParamChange(activeFilter, { blur: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Offset X">
                            <input type="number" value={activeFilter.params.offsetX} onChange={(e) => handleFilterParamChange(activeFilter, { offsetX: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Offset Y">
                            <input type="number" value={activeFilter.params.offsetY} onChange={(e) => handleFilterParamChange(activeFilter, { offsetY: parseFloat(e.target.value) })} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                        </Row>
                        <Row label="Opacity">
                            <Slider min="0" max="1" step="0.05" value={activeFilter.params.opacity} onInput={(e) => handleFilterParamChange(activeFilter, { opacity: parseFloat(e.currentTarget.value) })} style={{ width: '100%' }} />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'blur' && (
                    <>
                        <Row label="Strength">
                            <Slider
                                min="0"
                                max="20"
                                step="0.5"
                                value={activeFilter.params.strength}
                                onInput={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Quality">
                            <input
                                type="number"
                                min={1}
                                max={4}
                                value={activeFilter.params.quality}
                                onChange={(e) => handleFilterParamChange(activeFilter, { quality: Math.round(parseFloat(e.target.value) || 3) })}
                                style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'fade' && (
                    <Row label="Opacity ×">
                        <Slider
                            min="0"
                            max="1"
                            step="0.05"
                            value={activeFilter.params.opacity}
                            onInput={(e) => handleFilterParamChange(activeFilter, { opacity: parseFloat(e.currentTarget.value) })}
                            style={{ width: '100%' }}
                        />
                    </Row>
                )}
                {activeFilter.type === 'wipe' && (
                    <>
                        <Row label="Edge">
                            <select
                                value={activeFilter.params.edge}
                                onChange={(e) => handleFilterParamChange(activeFilter, { edge: e.target.value as WipeEdge })}
                                style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            >
                                <option value="left">左</option>
                                <option value="right">右</option>
                                <option value="top">上</option>
                                <option value="bottom">下</option>
                            </select>
                        </Row>
                        <Row label="Reverse">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                                <input
                                    type="checkbox"
                                    checked={activeFilter.params.reverse}
                                    onChange={(e) => handleFilterParamChange(activeFilter, { reverse: e.target.checked })}
                                />
                                退場方向
                            </label>
                        </Row>
                    </>
                )}
                {activeFilter.type === 'gradient' && (
                    <>
                        <Row label="Type">
                            <select
                                value={activeFilter.params.type}
                                onChange={(e) => handleFilterParamChange(activeFilter, { type: e.target.value === 'radial' ? 'radial' : 'linear' })}
                                style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            >
                                <option value="linear">Linear</option>
                                <option value="radial">Radial</option>
                            </select>
                        </Row>
                        <Row label="Colour A">
                            <input
                                type="color"
                                value={getGradientEditorState(activeFilter).colours[0]}
                                onChange={(e) => handleGradientColourChange(activeFilter, 0, e.target.value)}
                            />
                        </Row>
                        <Row label="Colour B">
                            <input
                                type="color"
                                value={getGradientEditorState(activeFilter).colours[1]}
                                onChange={(e) => handleGradientColourChange(activeFilter, 1, e.target.value)}
                            />
                        </Row>
                        <Row label="Stop A">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={getGradientEditorState(activeFilter).stops[0]}
                                onInput={(e) => handleGradientStopChange(activeFilter, 0, e.currentTarget.value)}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Stop B">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={getGradientEditorState(activeFilter).stops[1]}
                                onInput={(e) => handleGradientStopChange(activeFilter, 1, e.currentTarget.value)}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        {activeFilter.params.type === 'linear' && (
                            <Row label="Direction">
                                <input
                                    type="number"
                                    value={activeFilter.params.direction}
                                    onChange={(e) => {
                                      const parsed = parseFloat(e.target.value);
                                      if (Number.isNaN(parsed)) return;
                                      handleFilterParamChange(activeFilter, { direction: parsed });
                                    }}
                                    style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                                />
                            </Row>
                        )}
                    </>
                )}
                {activeFilter.type === 'displacement_map' && (
                    <>
                        <Row label="Amount X">
                            <Slider
                                min="0"
                                max="128"
                                step="1"
                                value={activeFilter.params.amountX}
                                onInput={(e) => handleFilterParamChange(activeFilter, { amountX: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Amount Y">
                            <Slider
                                min="0"
                                max="128"
                                step="1"
                                value={activeFilter.params.amountY}
                                onInput={(e) => handleFilterParamChange(activeFilter, { amountY: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Size">
                            <Slider
                                min="1"
                                max="512"
                                step="1"
                                value={activeFilter.params.size}
                                onInput={(e) => handleFilterParamChange(activeFilter, { size: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Strength">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.strength}
                                onInput={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'fake_dof' && (
                    <>
                        <Row label="Focus X">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.focusX}
                                onInput={(e) => handleFilterParamChange(activeFilter, { focusX: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Focus Y">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.focusY}
                                onInput={(e) => handleFilterParamChange(activeFilter, { focusY: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Focus Radius">
                            <Slider
                                min="0.01"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.focusRadius}
                                onInput={(e) => handleFilterParamChange(activeFilter, { focusRadius: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Blur">
                            <Slider
                                min="0"
                                max="64"
                                step="0.5"
                                value={activeFilter.params.blur}
                                onInput={(e) => handleFilterParamChange(activeFilter, { blur: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Strength">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.strength}
                                onInput={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'auto_blur' && (
                    <>
                        <Row label="Blur">
                            <Slider
                                min="0"
                                max="100"
                                step="1"
                                value={activeFilter.params.blur}
                                onInput={(e) => handleFilterParamChange(activeFilter, { blur: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Speed">
                            <Slider
                                min="0"
                                max="4"
                                step="0.05"
                                value={activeFilter.params.speed}
                                onInput={(e) => handleFilterParamChange(activeFilter, { speed: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Strength">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.strength}
                                onInput={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Colour Shift">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.colourShift}
                                onInput={(e) => handleFilterParamChange(activeFilter, { colourShift: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'stretch' && (
                    <>
                        <Row label="Angle">
                            <Slider
                                min="-360"
                                max="360"
                                step="1"
                                value={activeFilter.params.angle}
                                onInput={(e) => handleFilterParamChange(activeFilter, { angle: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Amount">
                            <Slider
                                min="0"
                                max="4"
                                step="0.05"
                                value={activeFilter.params.amount}
                                onInput={(e) => handleFilterParamChange(activeFilter, { amount: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Strength">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.strength}
                                onInput={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'multi_slicer' && (
                    <>
                        <Row label="Angle">
                            <Slider
                                min="-360"
                                max="360"
                                step="1"
                                value={activeFilter.params.angle}
                                onInput={(e) => handleFilterParamChange(activeFilter, { angle: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Offset">
                            <Slider
                                min="0"
                                max="128"
                                step="1"
                                value={activeFilter.params.offset}
                                onInput={(e) => handleFilterParamChange(activeFilter, { offset: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Slices">
                            <input
                                type="number"
                                min={2}
                                max={100}
                                value={activeFilter.params.slices}
                                onChange={(e) => handleFilterParamChange(activeFilter, { slices: Math.round(parseFloat(e.target.value) || 18) })}
                                style={{ width: '64px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Expansion">
                            <Slider
                                min="0"
                                max="128"
                                step="1"
                                value={activeFilter.params.expansion}
                                onInput={(e) => handleFilterParamChange(activeFilter, { expansion: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Strength">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.strength}
                                onInput={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'oct_transform' && (
                    <>
                        <Row label="Scale">
                            <Slider
                                min="0.01"
                                max="4"
                                step="0.01"
                                value={activeFilter.params.scale}
                                onInput={(e) => handleFilterParamChange(activeFilter, { scale: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Rotation">
                            <Slider
                                min="-360"
                                max="360"
                                step="1"
                                value={activeFilter.params.rotation}
                                onInput={(e) => handleFilterParamChange(activeFilter, { rotation: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Vertices">
                            <input
                                type="number"
                                min={3}
                                max={32}
                                value={activeFilter.params.vertexCount}
                                onChange={(e) => handleFilterParamChange(activeFilter, { vertexCount: Math.round(parseFloat(e.target.value) || 8) })}
                                style={{ width: '64px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Warp">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.warp}
                                onInput={(e) => handleFilterParamChange(activeFilter, { warp: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Strength">
                            <Slider
                                min="0"
                                max="1"
                                step="0.01"
                                value={activeFilter.params.strength}
                                onInput={(e) => handleFilterParamChange(activeFilter, { strength: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'area_expand' && (
                    <>
                        <Row label="Top">
                            <input
                                type="number"
                                min={0}
                                value={activeFilter.params.top}
                                onChange={(e) => handleFilterParamChange(activeFilter, { top: Math.max(0, parseFloat(e.target.value) || 0) })}
                                style={{ width: '72px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Bottom">
                            <input
                                type="number"
                                min={0}
                                value={activeFilter.params.bottom}
                                onChange={(e) => handleFilterParamChange(activeFilter, { bottom: Math.max(0, parseFloat(e.target.value) || 0) })}
                                style={{ width: '72px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Left">
                            <input
                                type="number"
                                min={0}
                                value={activeFilter.params.left}
                                onChange={(e) => handleFilterParamChange(activeFilter, { left: Math.max(0, parseFloat(e.target.value) || 0) })}
                                style={{ width: '72px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Right">
                            <input
                                type="number"
                                min={0}
                                value={activeFilter.params.right}
                                onChange={(e) => handleFilterParamChange(activeFilter, { right: Math.max(0, parseFloat(e.target.value) || 0) })}
                                style={{ width: '72px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Fill">
                            <input
                                type="checkbox"
                                checked={activeFilter.params.fill}
                                onChange={(e) => handleFilterParamChange(activeFilter, { fill: e.target.checked })}
                            />
                        </Row>
                    </>
                )}
                {activeFilter.type === 'smart_clipping' && (
                    <>
                        {(['top', 'bottom', 'left', 'right'] as const).map((key) => (
                            <Row key={key} label={key[0].toUpperCase() + key.slice(1)}>
                                <input
                                    type="number"
                                    min={0}
                                    value={activeFilter.params[key]}
                                    onChange={(e) => handleFilterParamChange(activeFilter, { [key]: Math.max(0, parseFloat(e.target.value) || 0) })}
                                    style={{ width: '72px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                                />
                            </Row>
                        ))}
                        <Row label="Link Axes">
                            <input
                                type="checkbox"
                                checked={activeFilter.params.linkAxes}
                                onChange={(e) => handleFilterParamChange(activeFilter, { linkAxes: e.target.checked })}
                            />
                        </Row>
                        <Row label="Mode">
                            <input
                                type="number"
                                min={0}
                                max={5}
                                value={activeFilter.params.mode}
                                onChange={(e) => handleFilterParamChange(activeFilter, { mode: Math.max(0, Math.min(5, Math.round(parseFloat(e.target.value) || 0))) })}
                                style={{ width: '72px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Amount">
                            <Slider
                                min="0"
                                max="5"
                                step="0.01"
                                value={activeFilter.params.amount}
                                onInput={(e) => handleFilterParamChange(activeFilter, { amount: parseFloat(e.currentTarget.value) })}
                                style={{ width: '100%' }}
                            />
                        </Row>
                        <Row label="Seed">
                            <input
                                type="number"
                                value={activeFilter.params.seed}
                                onChange={(e) => handleFilterParamChange(activeFilter, { seed: Math.round(parseFloat(e.target.value) || 1) })}
                                style={{ width: '72px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Reverse">
                            <input
                                type="checkbox"
                                checked={activeFilter.params.reverse}
                                onChange={(e) => handleFilterParamChange(activeFilter, { reverse: e.target.checked })}
                            />
                        </Row>
                    </>
                )}
            </div>
        )}

        {(selectedObject.type === 'video' || selectedObject.type === 'audio') && (
            <>
                <SectionHeader label="Audio" />
                <Row label="Mute">
                    <input type="checkbox" checked={selectedObject.muted || false} onChange={(e) => handleMediaMuteChange(e.target.checked)} />
                </Row>
                <Row label="Volume">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Slider
                            min="0"
                            max="1"
                            step="0.01"
                            value={selectedObject.volume ?? 1}
                            onInput={(e) => handleMediaVolumeChange(e.currentTarget.value)}
                            style={{ flex: 1 }}
                        />
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round((selectedObject.volume ?? 1) * 100)}
                            onChange={(e) => handleMediaVolumePercentChange(e.target.value)}
                            style={{ width: '56px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                        />
                        <span style={{ fontSize: '11px', color: '#999' }}>%</span>
                    </div>
                </Row>
            </>
        )}

        {selectedObject.type === 'video' && (
            <>
                <SectionHeader label={language === 'en' ? 'Proxy' : 'プロキシ'} />
                <Row label={language === 'en' ? 'Status' : '状態'}>
                    <span style={{ fontSize: '11px', color: (selectedObject as VideoObject).proxyFilePath ? '#4caf50' : '#999' }}>
                        {(selectedObject as VideoObject).proxyFilePath
                            ? `✓ ${(selectedObject as VideoObject).proxyFilePath!.split('/').pop()}`
                            : (language === 'en' ? 'None' : 'なし')}
                    </span>
                </Row>
                <Row label="">
                    <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                        <button
                            type="button"
                            disabled={proxyGenerating || !resolveVideoFsPath(selectedObject as VideoObject)}
                            onClick={() => { void handleGenerateProxy(); }}
                            style={{ flex: 1, fontSize: '11px' }}
                        >
                            {proxyGenerating
                                ? (language === 'en' ? 'Generating...' : '生成中...')
                                : (language === 'en' ? 'Generate proxy' : 'プロキシ生成')}
                        </button>
                        {(selectedObject as VideoObject).proxyFilePath && (
                            <button
                                type="button"
                                onClick={handleRemoveProxy}
                                style={{ fontSize: '11px', background: '#333', color: '#f88' }}
                            >
                                {language === 'en' ? 'Remove' : '解除'}
                            </button>
                        )}
                    </div>
                </Row>
                {proxyMessage && (
                    <Row label="">
                        <span style={{ fontSize: '10px', color: '#aaa', wordBreak: 'break-all' }}>{proxyMessage}</span>
                    </Row>
                )}
            </>
        )}

        {selectedObject.type === 'video' && coreMlTrackSupported && (
            <>
                <SectionHeader label={language === 'en' ? 'Vision track (macOS)' : 'Vision トラック (macOS)'} />
                <Row label={language === 'en' ? 'Subject (pets)' : '被写体（ペット）'}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                        <button
                            type="button"
                            disabled={visionTrackBusy || !resolveVideoFsPath(selectedObject as VideoObject)}
                            onClick={() => { void handleVisionDetectAnimals(); }}
                            style={{ width: '100%', fontSize: '11px' }}
                        >
                            {language === 'en' ? 'Detect cat/dog at playhead' : '再生位置で猫/犬を検出'}
                        </button>
                        <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11px',
                              cursor: coreMlTrackSupported ? 'pointer' : 'not-allowed',
                              opacity: coreMlTrackSupported ? 1 : 0.45
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={visionDetectionPreviewEnabled}
                                disabled={!coreMlTrackSupported}
                                onChange={(e) => setVisionDetectionPreviewEnabled(e.target.checked)}
                            />
                            {language === 'en' ? 'Show detection boxes on preview' : '検出枠をプレビューに表示'}
                        </label>
                        <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11px',
                              cursor:
                                coreMlTrackSupported && visionDetectionPreviewEnabled ? 'pointer' : 'not-allowed',
                              opacity: coreMlTrackSupported && visionDetectionPreviewEnabled ? 1 : 0.45
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={visionDetectionRealtimeEnabled}
                                disabled={
                                  !coreMlTrackSupported
                                  || !visionDetectionPreviewEnabled
                                  || !resolveVideoFsPath(selectedObject as VideoObject)
                                }
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  setVisionDetectionRealtimeEnabled(next);
                                  if (next) {
                                    setVisionDetectionPreviewEnabled(true);
                                  }
                                }}
                            />
                            {language === 'en' ? 'Real-time detection (while playing / scrubbing)' : 'リアルタイム検出（再生・スクラブ）'}
                        </label>
                        <div style={{ fontSize: '10px', color: '#888', lineHeight: 1.35 }}>
                            {language === 'en'
                              ? 'Local Vision on macOS. While playing, detection runs about 4× per second; when paused, ~300ms after you scrub. Boxes fade if the overlay is from another frame. CPU load increases while real-time is on.'
                              : 'macOS のローカル Vision です。再生中は約毎秒4回、停止中はスクラブから約300ms後に検出します。別フレームの結果のままだと枠が薄くなります。リアルタイム ON 中は負荷が増えます。'}
                        </div>
                        <select
                            value={visionSelectedAnimalIndex}
                            onChange={(e) => {
                              const idx = parseInt(e.target.value, 10);
                              setVisionSelectedAnimalIndex(idx);
                              if (idx >= 0 && visionDetectedAnimals[idx]) {
                                applyVisionBBoxFields(visionDetectedAnimals[idx].boundingBox);
                              }
                            }}
                            disabled={visionDetectedAnimals.length === 0 || visionTrackBusy}
                            style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee', fontSize: '11px' }}
                        >
                            <option value={-1}>{language === 'en' ? '— pick detection —' : '— 検出結果を選択 —'}</option>
                            {visionDetectedAnimals.map((a, i) => (
                              <option key={`${a.identifier}-${i}`} value={i}>
                                {a.identifier} ({Math.round(a.confidence * 100)}%)
                              </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            disabled={visionTrackBusy || !resolveVideoFsPath(selectedObject as VideoObject)}
                            onClick={() => { void handleVisionOpenPickModal(); }}
                            style={{ width: '100%', fontSize: '11px' }}
                        >
                            {language === 'en' ? 'Pick on frame…' : 'フレーム上で選択…'}
                        </button>
                        <button
                            type="button"
                            disabled={visionTrackBusy || !resolveVideoFsPath(selectedObject as VideoObject)}
                            onClick={() => { void handleVisionSegmentPerson(); }}
                            style={{ width: '100%', fontSize: '11px' }}
                        >
                            {language === 'en' ? 'Person mask preview' : '人物マスク（プレビュー）'}
                        </button>
                    </div>
                </Row>
                {visionPersonMaskUrl && (
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                            {language === 'en'
                              ? 'Person segmentation (reference). Timeline uses rectangular crop from tracking.'
                              : '人物セグメンテーション（参考）。タイムラインではトラッキング矩形の切り抜きを使用します。'}
                        </div>
                        <img src={visionPersonMaskUrl} alt="" style={{ maxWidth: '100%', border: '1px solid #444' }} />
                    </div>
                )}
                <Row label={language === 'en' ? 'Rect crop (tracked)' : '矩形切り抜き（追従）'}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={(selectedObject as VideoObject).subjectCropEnabled ?? false}
                                onChange={(e) => {
                                  updateObject(selectedObject.id, {
                                    subjectCropEnabled: e.target.checked
                                  } as Partial<TimelineObject>);
                                }}
                            />
                            {language === 'en' ? 'Enable' : '有効'}
                        </label>
                        <button
                            type="button"
                            disabled={lastVisionTrackSamples.length === 0 || visionTrackBusy}
                            onClick={handleVisionApplyCropFromLastTrack}
                            style={{ width: '100%', fontSize: '11px' }}
                        >
                            {language === 'en' ? 'Apply last track to crop' : '直近のトラックを切り抜きに適用'}
                        </button>
                    </div>
                </Row>
                <Row label={language === 'en' ? 'Overlay target' : 'オーバーレイ'}>
                    <select
                        value={visionTrackOverlayId}
                        onChange={(e) => setVisionTrackOverlayId(e.target.value)}
                        style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                        disabled={visionTrackOverlayCandidates.length === 0 || visionTrackBusy}
                    >
                        {visionTrackOverlayCandidates.length === 0 ? (
                            <option value="">{language === 'en' ? 'No overlapping clip' : '重なるクリップなし'}</option>
                        ) : (
                            visionTrackOverlayCandidates.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name || o.type} ({o.type})
                                </option>
                            ))
                        )}
                    </select>
                </Row>
                <Row label={language === 'en' ? 'BBox x,y (Vision)' : '矩形 x,y (Vision)'}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={visionBoxX}
                            onChange={(e) => setVisionBoxX(e.target.value)}
                            disabled={visionTrackBusy}
                            style={{ width: '52px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                        />
                        <input
                            type="text"
                            inputMode="decimal"
                            value={visionBoxY}
                            onChange={(e) => setVisionBoxY(e.target.value)}
                            disabled={visionTrackBusy}
                            style={{ width: '52px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                        />
                    </div>
                </Row>
                <Row label={language === 'en' ? 'BBox w,h' : '幅・高さ'}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={visionBoxW}
                            onChange={(e) => setVisionBoxW(e.target.value)}
                            disabled={visionTrackBusy}
                            style={{ width: '52px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                        />
                        <input
                            type="text"
                            inputMode="decimal"
                            value={visionBoxH}
                            onChange={(e) => setVisionBoxH(e.target.value)}
                            disabled={visionTrackBusy}
                            style={{ width: '52px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                        />
                    </div>
                </Row>
                <Row label={language === 'en' ? 'Frame stride' : 'フレーム間引き'}>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={visionFrameStride}
                        onChange={(e) => setVisionFrameStride(e.target.value)}
                        disabled={visionTrackBusy}
                        style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <div style={{ marginBottom: '12px' }}>
                    <button
                        type="button"
                        disabled={
                            visionTrackBusy
                            || visionTrackOverlayCandidates.length === 0
                            || !resolveVideoFsPath(selectedObject as VideoObject)
                        }
                        onClick={() => {
                          void handleVisionTrackRun();
                        }}
                        style={{ width: '100%' }}
                    >
                        {visionTrackBusy
                          ? (language === 'en' ? 'Tracking…' : 'トラッキング中…')
                          : (language === 'en' ? 'Run tracking' : 'トラッキング実行')}
                    </button>
                </div>
                <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.4, marginBottom: '8px' }}>
                    {language === 'en'
                      ? 'Bounding box uses Vision normalised coordinates (origin bottom-left of the frame).'
                      : '矩形は Vision 正規化座標（フレーム左下が原点）です。'}
                </div>
            </>
        )}

        {/* --- オブジェクト固有設定 --- */}
        {selectedObject.type === 'text' && (
            <>
                <SectionHeader label="Text Settings" />
                <Row label="Content">
                    <textarea value={selectedObject.text} onChange={(e) => handleChange('text', e.target.value)} style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Size">
                    <input type="number" value={selectedObject.fontSize} onChange={(e) => handleNumericChange('fontSize', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Colour">
                     <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} />
                </Row>
                <Row label="Stroke">
                    <input
                        type="checkbox"
                        checked={selectedObject.textStroke != null}
                        onChange={(e) => handleChange('textStroke', e.target.checked
                          ? { colour: selectedObject.textStroke?.colour ?? '#000000', width: selectedObject.textStroke?.width ?? 2 }
                          : undefined)}
                    />
                </Row>
                {selectedObject.textStroke != null && (
                    <>
                        <Row label="Stroke Colour">
                            <input type="color" value={selectedObject.textStroke.colour} onChange={(e) => handleChange('textStroke', { ...selectedObject.textStroke, colour: e.target.value })} />
                        </Row>
                        <Row label="Stroke Width">
                            <input
                                type="number"
                                min="0"
                                value={selectedObject.textStroke.width}
                                onChange={(e) => {
                                    const width = parseFloat(e.target.value);
                                    if (!Number.isFinite(width)) return;
                                    handleChange('textStroke', { ...selectedObject.textStroke, width: Math.max(0, width) });
                                }}
                                style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                    </>
                )}
                <Row label="Shadow">
                    <input
                        type="checkbox"
                        checked={selectedObject.textShadow != null}
                        onChange={(e) => handleChange('textShadow', e.target.checked
                          ? {
                            colour: selectedObject.textShadow?.colour ?? '#000000',
                            offsetX: selectedObject.textShadow?.offsetX ?? 2,
                            offsetY: selectedObject.textShadow?.offsetY ?? 2,
                            blur: selectedObject.textShadow?.blur ?? 0,
                          }
                          : undefined)}
                    />
                </Row>
                {selectedObject.textShadow != null && (
                    <>
                        <Row label="Shadow Colour">
                            <input type="color" value={selectedObject.textShadow.colour} onChange={(e) => handleChange('textShadow', { ...selectedObject.textShadow, colour: e.target.value })} />
                        </Row>
                        <Row label="Shadow Offset X">
                            <input
                                type="number"
                                value={selectedObject.textShadow.offsetX}
                                onChange={(e) => {
                                    const offsetX = parseFloat(e.target.value);
                                    if (!Number.isFinite(offsetX)) return;
                                    handleChange('textShadow', { ...selectedObject.textShadow, offsetX });
                                }}
                                style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Shadow Offset Y">
                            <input
                                type="number"
                                value={selectedObject.textShadow.offsetY}
                                onChange={(e) => {
                                    const offsetY = parseFloat(e.target.value);
                                    if (!Number.isFinite(offsetY)) return;
                                    handleChange('textShadow', { ...selectedObject.textShadow, offsetY });
                                }}
                                style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                        <Row label="Shadow Blur">
                            <input
                                type="number"
                                min="0"
                                value={selectedObject.textShadow.blur}
                                onChange={(e) => {
                                    const blur = parseFloat(e.target.value);
                                    if (!Number.isFinite(blur)) return;
                                    handleChange('textShadow', { ...selectedObject.textShadow, blur: Math.max(0, blur) });
                                }}
                                style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                            />
                        </Row>
                    </>
                )}
            </>
        )}

        {selectedObject.type === 'shape' && (
            <>
                <SectionHeader label="Shape Settings" />
                <Row label="Type">
                    <select value={selectedObject.shapeType} onChange={(e) => handleChange('shapeType', e.target.value)} style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}>
                        <option value="rect">Rectangle</option>
                        <option value="rounded_rect">Rounded Rectangle</option>
                        <option value="circle">Circle</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="triangle">Triangle</option>
                        <option value="star">Star</option>
                        <option value="pentagon">Pentagon</option>
                        <option value="diamond">Diamond</option>
                        <option value="arrow">Arrow</option>
                        <option value="heart">Heart</option>
                        <option value="cross">Cross</option>
                    </select>
                </Row>
                <Row label="Colour">
                    <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} />
                </Row>
                <Row label="Width">
                    <input type="number" value={selectedObject.width} onChange={(e) => handleNumericChange('width', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Height">
                    <input type="number" value={selectedObject.height} onChange={(e) => handleNumericChange('height', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                {selectedObject.shapeType === 'rounded_rect' && (
                    <Row label="Corner Radius">
                        <input type="number" min="0" value={selectedObject.cornerRadius ?? 0} onChange={(e) => handleNumericChange('cornerRadius', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                    </Row>
                )}
            </>
        )}

         {selectedObject.type === 'particle' && (
             <>
                 <SectionHeader label="Particle Settings" />
                <Row label="Particle Count">
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={(selectedObject as ParticleObject).particleCount}
                        onChange={(e) => {
                            const parsed = parseInt(e.target.value, 10);
                            if (!Number.isFinite(parsed)) return;
                            updateObject(selectedObject.id, { particleCount: Math.max(1, parsed) } as Partial<TimelineObject>);
                        }}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="Seed">
                    <input
                        type="number"
                        step="1"
                        value={(selectedObject as ParticleObject).seed}
                        onChange={(e) => {
                            const parsed = parseInt(e.target.value, 10);
                            if (!Number.isFinite(parsed)) return;
                            updateObject(selectedObject.id, { seed: parsed } as Partial<TimelineObject>);
                        }}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="Spread">
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={(selectedObject as ParticleObject).spread}
                        onChange={(e) => handleNumericChange('spread', e.target.value)}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="Speed">
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={(selectedObject as ParticleObject).speed}
                        onChange={(e) => handleNumericChange('speed', e.target.value)}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="Particle Size">
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={(selectedObject as ParticleObject).size}
                        onChange={(e) => handleNumericChange('size', e.target.value)}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="Colour">
                    <input
                        type="color"
                        value={(selectedObject as ParticleObject).colour}
                        onChange={(e) => handleChange('colour', e.target.value)}
                    />
                </Row>
                <Row label="Lifetime">
                    <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={(selectedObject as ParticleObject).lifetimeSeconds}
                        onChange={(e) => handleNumericChange('lifetimeSeconds', e.target.value)}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="Width">
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={(selectedObject as ParticleObject).width}
                        onChange={(e) => handleNumericChange('width', e.target.value)}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="Height">
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={(selectedObject as ParticleObject).height}
                        onChange={(e) => handleNumericChange('height', e.target.value)}
                        style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
             </>
         )}

         {selectedObject.type === 'getcolor_dot_field' && (
             <>
                 <SectionHeader label="GetColor Dot Field" />
                 <Row label="Columns">
                     <input
                         type="number"
                         min="1"
                         max="512"
                         step="1"
                         value={(selectedObject as GetColorDotFieldObject).columns}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 32), 1, 512));
                             updateObject(selectedObject.id, { columns: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Rows">
                     <input
                         type="number"
                         min="1"
                         max="512"
                         step="1"
                         value={(selectedObject as GetColorDotFieldObject).rows}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 18), 1, 512));
                             updateObject(selectedObject.id, { rows: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Dot Size">
                     <input
                         type="number"
                         min="0"
                         max="2000"
                         step="0.5"
                         value={(selectedObject as GetColorDotFieldObject).dotSize}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 14), 0, 2000);
                             updateObject(selectedObject.id, { dotSize: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Dot Shape">
                     <select
                         value={(selectedObject as GetColorDotFieldObject).dotShape ?? 'circle'}
                         onChange={(e) => handleChange('dotShape', e.target.value as GetColorDotFieldObject['dotShape'])}
                         style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     >
                         <option value="circle">Circle</option>
                         <option value="square">Square</option>
                         <option value="diamond">Diamond</option>
                     </select>
                 </Row>
                 <Row label="Stroke Width">
                     <input
                         type="number"
                         min="0"
                         max="200"
                         step="0.5"
                         value={(selectedObject as GetColorDotFieldObject).strokeWidth ?? 0}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 0), 0, 200);
                             updateObject(selectedObject.id, { strokeWidth: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Size Influence">
                     <Slider
                         min="0"
                         max="4"
                         step="0.01"
                         value={(selectedObject as GetColorDotFieldObject).sizeInfluence}
                         onInput={(e) => {
                             const next = clamp(toNumberOr(e.currentTarget.value, 0.65), 0, 4);
                             updateObject(selectedObject.id, { sizeInfluence: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '100%' }}
                     />
                 </Row>
                 <Row label="Luminance Influence">
                     <Slider
                         min="0"
                         max="4"
                         step="0.01"
                         value={(selectedObject as GetColorDotFieldObject).luminanceInfluence}
                         onInput={(e) => {
                             const next = clamp(toNumberOr(e.currentTarget.value, 0.7), 0, 4);
                             updateObject(selectedObject.id, { luminanceInfluence: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '100%' }}
                     />
                 </Row>
                 <Row label="Hue Shift">
                     <input
                         type="number"
                         min="-720"
                         max="720"
                         step="1"
                         value={(selectedObject as GetColorDotFieldObject).hueShiftDegrees}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 0), -720, 720);
                             updateObject(selectedObject.id, { hueShiftDegrees: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Alternate Rows">
                     <input
                         type="checkbox"
                         checked={(selectedObject as GetColorDotFieldObject).alternateRows}
                         onChange={(e) => updateObject(selectedObject.id, { alternateRows: e.target.checked } as Partial<TimelineObject>)}
                     />
                 </Row>
                 <Row label="Foreground Colour">
                     <input
                         type="color"
                         value={(selectedObject as GetColorDotFieldObject).foregroundColour}
                         onChange={(e) => handleChange('foregroundColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Secondary Colour">
                     <input
                         type="color"
                         value={(selectedObject as GetColorDotFieldObject).secondaryColour}
                         onChange={(e) => handleChange('secondaryColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Background Colour">
                     <input
                         type="color"
                         value={(selectedObject as GetColorDotFieldObject).backgroundColour}
                         onChange={(e) => handleChange('backgroundColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Seed">
                     <input
                         type="number"
                         step="1"
                         value={(selectedObject as GetColorDotFieldObject).seed}
                         onChange={(e) => {
                             const next = Math.round(toNumberOr(e.target.value, 93));
                             updateObject(selectedObject.id, { seed: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <SectionHeader label="93 Background Colour Eyedropper" />
                 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0 8px' }}>
                     {getColorBackgroundColourPalette.length > 0 ? getColorBackgroundColourPalette.map((entry) => (
                         <span
                             key={`${entry.sourceObjectId ?? 'fallback'}-${entry.sourceField}-${entry.colour}`}
                             title={`${entry.sourceField}: ${entry.colour}`}
                             style={{
                                 width: '22px',
                                 height: '22px',
                                 borderRadius: '4px',
                                 border: '1px solid #555',
                                 background: entry.colour,
                                 display: 'inline-block'
                             }}
                         />
                     )) : (
                         <span style={{ fontSize: '11px', color: '#888' }}>
                             {language === 'en' ? 'No scene colours found.' : '利用できるシーン色がありません。'}
                         </span>
                     )}
                 </div>
                 <button
                     type="button"
                     disabled={getColorBackgroundColourPalette.length < 3}
                     onClick={handleApplyAviUtlBackgroundColourPalette}
                     style={{ width: '100%', marginBottom: '10px' }}
                 >
                     {language === 'en' ? 'Apply Background Colour Palette' : '背景色スポイトpaletteを適用'}
                 </button>
                 <SectionHeader label="GetColor Sampling" />
                 <Row label="Sample Layer">
                     <input
                         type="number"
                         min="1"
                         step="1"
                         value={((selectedObject as GetColorDotFieldObject).sampleSourceLayer ?? Math.max(0, selectedObject.layer - 1)) + 1}
                         onChange={(e) => handleGetColorSampleLayerChange(e.target.value)}
                         style={{ width: '70px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Sample Object">
                     <select
                         value={(selectedObject as GetColorDotFieldObject).sampleSourceObjectId ?? ''}
                         onChange={(e) => handleGetColorSampleObjectChange(e.target.value)}
                         style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     >
                         <option value="">{language === 'en' ? 'Use sample layer' : 'サンプルレイヤーを使う'}</option>
                         {getColorSampleCandidates.map((candidate) => (
                             <option key={candidate.id} value={candidate.id}>
                                 {candidate.name} / L{candidate.layer + 1}
                             </option>
                         ))}
                     </select>
                 </Row>
                  <Row label="Sample Strength">
                      <Slider
                          min="0"
                          max="1"
                          step="0.01"
                         value={(selectedObject as GetColorDotFieldObject).sampleStrength ?? 1}
                         onInput={(e) => handleGetColorSampleStrengthChange(e.currentTarget.value)}
                          style={{ width: '100%' }}
                      />
                  </Row>
                  <Row label="Sample Hue Shift">
                      <input
                          type="number"
                          min="-720"
                          max="720"
                          step="1"
                          value={(selectedObject as GetColorDotFieldObject).sampleHueShiftDegrees ?? 0}
                          onChange={(e) => handleGetColorSampleHueShiftChange(e.target.value)}
                          style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                      />
                  </Row>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '5px', marginBottom: '8px' }}>
                      {language === 'en'
                         ? 'PNG/JPEG image objects or PSD objects are used as Rust GetColor sample sources.'
                        : 'PNG/JPEG画像またはPSDをRust GetColorのサンプル元として使います。'}
                 </div>
             </>
         )}

         {selectedObject.type === 'hksy_checker_grid' && (
             <>
                 <SectionHeader label="hksy Checker/Grid" />
                 <Row label="Pattern">
                     <select
                         value={(selectedObject as HksyCheckerGridObject).pattern ?? 'checker-grid'}
                         onChange={(e) => {
                             updateObject(selectedObject.id, {
                                 pattern: e.target.value as HksyCheckerGridObject['pattern']
                             } as Partial<TimelineObject>);
                         }}
                         style={{ background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     >
                         <option value="checker-grid">Checker/Grid</option>
                         <option value="diamond">Diamond</option>
                         <option value="measured-grid">Measured Grid</option>
                         <option value="anchor-line">Anchor Line</option>
                     </select>
                 </Row>
                 <Row label="Cell Size">
                     <input
                         type="number"
                         min="1"
                         max="1000"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).cellSize}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 50), 1, 1000));
                             updateObject(selectedObject.id, { cellSize: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Line Width">
                     <input
                         type="number"
                         min="0"
                         max="100"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).lineWidth}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 2), 0, 100));
                             updateObject(selectedObject.id, { lineWidth: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Checker">
                     <input
                         type="checkbox"
                         checked={(selectedObject as HksyCheckerGridObject).checkerEnabled}
                         onChange={(e) => updateObject(selectedObject.id, { checkerEnabled: e.target.checked } as Partial<TimelineObject>)}
                     />
                 </Row>
                 <Row label="Grid">
                     <input
                         type="checkbox"
                         checked={(selectedObject as HksyCheckerGridObject).gridEnabled}
                         onChange={(e) => updateObject(selectedObject.id, { gridEnabled: e.target.checked } as Partial<TimelineObject>)}
                     />
                 </Row>
                 <Row label="Separate Interval">
                     <input
                         type="number"
                         min="1"
                         max="1000"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).separateInterval ?? 5}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 5), 1, 1000));
                             updateObject(selectedObject.id, { separateInterval: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Separate Line Width">
                     <input
                         type="number"
                         min="0"
                         max="100"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).separateLineWidth ?? 3}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 3), 0, 100));
                             updateObject(selectedObject.id, { separateLineWidth: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Anchor A X">
                     <input
                         type="number"
                         min="-1000"
                         max="1000"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).anchorPoints?.[0]?.x ?? -88}
                         onChange={(e) => {
                             const points = [...((selectedObject as HksyCheckerGridObject).anchorPoints ?? [{ x: -88, y: 50 }, { x: 0, y: -100 }, { x: 88, y: 50 }])];
                             const next = clamp(toNumberOr(e.target.value, -88), -1000, 1000);
                             points[0] = { ...(points[0] ?? { x: -88, y: 50 }), x: next };
                             updateObject(selectedObject.id, { anchorPoints: points } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Anchor A Y">
                     <input
                         type="number"
                         min="-1000"
                         max="1000"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).anchorPoints?.[0]?.y ?? 50}
                         onChange={(e) => {
                             const points = [...((selectedObject as HksyCheckerGridObject).anchorPoints ?? [{ x: -88, y: 50 }, { x: 0, y: -100 }, { x: 88, y: 50 }])];
                             const next = clamp(toNumberOr(e.target.value, 50), -1000, 1000);
                             points[0] = { ...(points[0] ?? { x: -88, y: 50 }), y: next };
                             updateObject(selectedObject.id, { anchorPoints: points } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Anchor B X">
                     <input
                         type="number"
                         min="-1000"
                         max="1000"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).anchorPoints?.[1]?.x ?? 0}
                         onChange={(e) => {
                             const points = [...((selectedObject as HksyCheckerGridObject).anchorPoints ?? [{ x: -88, y: 50 }, { x: 0, y: -100 }, { x: 88, y: 50 }])];
                             const next = clamp(toNumberOr(e.target.value, 0), -1000, 1000);
                             points[1] = { ...(points[1] ?? { x: 0, y: -100 }), x: next };
                             updateObject(selectedObject.id, { anchorPoints: points } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Anchor B Y">
                     <input
                         type="number"
                         min="-1000"
                         max="1000"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).anchorPoints?.[1]?.y ?? -100}
                         onChange={(e) => {
                             const points = [...((selectedObject as HksyCheckerGridObject).anchorPoints ?? [{ x: -88, y: 50 }, { x: 0, y: -100 }, { x: 88, y: 50 }])];
                             const next = clamp(toNumberOr(e.target.value, -100), -1000, 1000);
                             points[1] = { ...(points[1] ?? { x: 0, y: -100 }), y: next };
                             updateObject(selectedObject.id, { anchorPoints: points } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Round Caps">
                     <input
                         type="checkbox"
                         checked={(selectedObject as HksyCheckerGridObject).roundCaps ?? true}
                         onChange={(e) => updateObject(selectedObject.id, { roundCaps: e.target.checked } as Partial<TimelineObject>)}
                     />
                 </Row>
                 <Row label="Max Join Distance">
                     <input
                         type="number"
                         min="0"
                         max="300"
                         step="1"
                         value={(selectedObject as HksyCheckerGridObject).maxJoinDistance ?? 50}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 50), 0, 300);
                             updateObject(selectedObject.id, { maxJoinDistance: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Foreground Colour">
                     <input
                         type="color"
                         value={(selectedObject as HksyCheckerGridObject).foregroundColour}
                         onChange={(e) => handleChange('foregroundColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Secondary Colour">
                     <input
                         type="color"
                         value={(selectedObject as HksyCheckerGridObject).secondaryColour}
                         onChange={(e) => handleChange('secondaryColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Background Colour">
                     <input
                         type="color"
                         value={(selectedObject as HksyCheckerGridObject).backgroundColour}
                         onChange={(e) => handleChange('backgroundColour', e.target.value)}
                     />
                 </Row>
                 <SectionHeader label="93 Background Colour Eyedropper" />
                 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0 8px' }}>
                     {hksyBackgroundColourPalette.length > 0 ? hksyBackgroundColourPalette.map((entry) => (
                         <span
                             key={`${entry.sourceObjectId ?? 'fallback'}-${entry.sourceField}-${entry.colour}`}
                             title={`${entry.sourceField}: ${entry.colour}`}
                             style={{
                                 width: '22px',
                                 height: '22px',
                                 borderRadius: '4px',
                                 border: '1px solid #555',
                                 background: entry.colour,
                                 display: 'inline-block'
                             }}
                         />
                     )) : (
                         <span style={{ fontSize: '11px', color: '#888' }}>
                             {language === 'en' ? 'No scene colours found.' : '利用できるシーン色がありません。'}
                         </span>
                     )}
                 </div>
                 <button
                     type="button"
                     disabled={hksyBackgroundColourPalette.length < 4}
                     onClick={handleApplyAviUtlHksyBackgroundColourPalette}
                     style={{ width: '100%', marginBottom: '10px' }}
                 >
                     {language === 'en' ? 'Apply Palette to hksy' : '背景色スポイトpaletteをhksyへ適用'}
                 </button>
             </>
         )}

         {selectedObject.type === 'plain_effector_line' && (
             <>
                 <SectionHeader label="PlainEffector Line Settings" />
                 <Row label="Radius">
                     <input
                         type="number"
                         min="1"
                         max="2000"
                         step="1"
                         value={(selectedObject as PlainEffectorLineObject).radius}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 100), 1, 2000);
                             updateObject(selectedObject.id, { radius: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Strength">
                     <input
                         type="number"
                         min="-10"
                         max="10"
                         step="0.1"
                         value={(selectedObject as PlainEffectorLineObject).strength}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 1), -10, 10);
                             updateObject(selectedObject.id, { strength: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Randomness">
                     <input
                         type="number"
                         min="-1000"
                         max="1000"
                         step="1"
                         value={(selectedObject as PlainEffectorLineObject).randomness}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 0), -1000, 1000);
                             updateObject(selectedObject.id, { randomness: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Zoom">
                     <input
                         type="number"
                         min="-2"
                         max="5"
                         step="0.1"
                         value={(selectedObject as PlainEffectorLineObject).zoom}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 1), -2, 5);
                             updateObject(selectedObject.id, { zoom: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Invert">
                     <input
                         type="checkbox"
                         checked={(selectedObject as PlainEffectorLineObject).invert}
                         onChange={(e) => updateObject(selectedObject.id, { invert: e.target.checked } as Partial<TimelineObject>)}
                     />
                 </Row>
                 <Row label="Line Count">
                     <input
                         type="number"
                         min="1"
                         max="128"
                         step="1"
                         value={(selectedObject as PlainEffectorLineObject).lineCount}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 24), 1, 128));
                             updateObject(selectedObject.id, { lineCount: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Line Width">
                     <input
                         type="number"
                         min="0.25"
                         max="200"
                         step="0.25"
                         value={(selectedObject as PlainEffectorLineObject).lineWidth}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 2), 0.25, 200);
                             updateObject(selectedObject.id, { lineWidth: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Colour">
                     <input
                         type="color"
                         value={(selectedObject as PlainEffectorLineObject).colour}
                         onChange={(e) => handleChange('colour', e.target.value)}
                     />
                 </Row>
                 <Row label="Colour Amount">
                     <Slider
                         min="0"
                         max="1"
                         step="0.01"
                         value={(selectedObject as PlainEffectorLineObject).colourAmount}
                         onInput={(e) => {
                             const next = clamp(toNumberOr(e.currentTarget.value, 1), 0, 1);
                             updateObject(selectedObject.id, { colourAmount: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '100%' }}
                     />
                 </Row>
             </>
         )}

         {selectedObject.type === 'sphere_dots' && (
             <>
                 <SectionHeader label="Sphere(DrawPixel) Settings" />
                 <Row label="Radius">
                     <input
                         type="number"
                         min="1"
                         max="5000"
                         step="1"
                         value={(selectedObject as SphereDotsObject).radius}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 170), 1, 5000);
                             updateObject(selectedObject.id, { radius: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Columns">
                     <input
                         type="number"
                         min="3"
                         max="256"
                         step="1"
                         value={(selectedObject as SphereDotsObject).columns}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 16), 3, 256));
                             updateObject(selectedObject.id, { columns: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Rows">
                     <input
                         type="number"
                         min="2"
                         max="256"
                         step="1"
                         value={(selectedObject as SphereDotsObject).rows}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 12), 2, 256));
                             updateObject(selectedObject.id, { rows: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Rotation Degrees">
                     <input
                         type="number"
                         min="-1000"
                         max="1000"
                         step="1"
                         value={(selectedObject as SphereDotsObject).rotationDegrees}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 10), -1000, 1000);
                             updateObject(selectedObject.id, { rotationDegrees: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Offset Degrees">
                     <input
                         type="number"
                         min="-360"
                         max="360"
                         step="1"
                         value={(selectedObject as SphereDotsObject).offsetDegrees}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 0), -360, 360);
                             updateObject(selectedObject.id, { offsetDegrees: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Luminance Influence">
                     <input
                         type="number"
                         min="-5000"
                         max="5000"
                         step="1"
                         value={(selectedObject as SphereDotsObject).luminanceInfluence}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 0), -5000, 5000);
                             updateObject(selectedObject.id, { luminanceInfluence: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Point Size">
                     <input
                         type="number"
                         min="0"
                         max="200"
                         step="0.5"
                         value={(selectedObject as SphereDotsObject).pointSize}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 6), 0, 200);
                             updateObject(selectedObject.id, { pointSize: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Latitude Line Width">
                     <input
                         type="number"
                         min="0"
                         max="100"
                         step="0.5"
                         value={(selectedObject as SphereDotsObject).latitudeLineWidth}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 2), 0, 100);
                             updateObject(selectedObject.id, { latitudeLineWidth: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Colour">
                     <input
                         type="color"
                         value={(selectedObject as SphereDotsObject).colour}
                         onChange={(e) => handleChange('colour', e.target.value)}
                     />
                 </Row>
                 <Row label="Secondary Colour">
                     <input
                         type="color"
                         value={(selectedObject as SphereDotsObject).secondaryColour}
                         onChange={(e) => handleChange('secondaryColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Plane Mode">
                     <input
                         type="checkbox"
                         checked={(selectedObject as SphereDotsObject).planeMode}
                         onChange={(e) => updateObject(selectedObject.id, { planeMode: e.target.checked } as Partial<TimelineObject>)}
                     />
                 </Row>
                 <Row label="Seed">
                     <input
                         type="number"
                         step="1"
                         value={(selectedObject as SphereDotsObject).seed}
                         onChange={(e) => {
                             const next = Math.round(toNumberOr(e.target.value, 93));
                             updateObject(selectedObject.id, { seed: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
             </>
         )}

         {selectedObject.type === 'spherical_field' && (
             <>
                 <SectionHeader label="SphericalField Settings" />
                 <Row label="Radius">
                     <input
                         type="number"
                         min="0"
                         max="5000"
                         step="1"
                         value={(selectedObject as SphericalFieldObject).radius}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 160), 0, 5000);
                             updateObject(selectedObject.id, { radius: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Strength">
                     <input
                         type="number"
                         min="-200"
                         max="200"
                         step="1"
                         value={(selectedObject as SphericalFieldObject).strength}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 100), -200, 200);
                             updateObject(selectedObject.id, { strength: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Colour Amount">
                     <input
                         type="number"
                         min="-100"
                         max="100"
                         step="1"
                         value={(selectedObject as SphericalFieldObject).colourAmount}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 100), -100, 100);
                             updateObject(selectedObject.id, { colourAmount: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Alpha Amount">
                     <input
                         type="number"
                         min="-100"
                         max="100"
                         step="1"
                         value={(selectedObject as SphericalFieldObject).alphaAmount}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 0), -100, 100);
                             updateObject(selectedObject.id, { alphaAmount: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Line Width">
                     <input
                         type="number"
                         min="0"
                         max="100"
                         step="0.5"
                         value={(selectedObject as SphericalFieldObject).lineWidth}
                         onChange={(e) => {
                             const next = clamp(toNumberOr(e.target.value, 3), 0, 100);
                             updateObject(selectedObject.id, { lineWidth: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Ring Count">
                     <input
                         type="number"
                         min="1"
                         max="64"
                         step="1"
                         value={(selectedObject as SphericalFieldObject).ringCount}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 4), 1, 64));
                             updateObject(selectedObject.id, { ringCount: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Vector Count">
                     <input
                         type="number"
                         min="0"
                         max="256"
                         step="1"
                         value={(selectedObject as SphericalFieldObject).vectorCount}
                         onChange={(e) => {
                             const next = Math.round(clamp(toNumberOr(e.target.value, 16), 0, 256));
                             updateObject(selectedObject.id, { vectorCount: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
                 <Row label="Field Colour">
                     <input
                         type="color"
                         value={(selectedObject as SphericalFieldObject).fieldColour}
                         onChange={(e) => handleChange('fieldColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Secondary Colour">
                     <input
                         type="color"
                         value={(selectedObject as SphericalFieldObject).secondaryColour}
                         onChange={(e) => handleChange('secondaryColour', e.target.value)}
                     />
                 </Row>
                 <Row label="Background Opacity">
                     <Slider
                         min="0"
                         max="1"
                         step="0.01"
                         value={(selectedObject as SphericalFieldObject).backgroundOpacity}
                         onInput={(e) => {
                             const next = clamp(toNumberOr(e.currentTarget.value, 0.08), 0, 1);
                             updateObject(selectedObject.id, { backgroundOpacity: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '100%' }}
                     />
                 </Row>
                 <Row label="Container">
                     <input
                         type="checkbox"
                         checked={(selectedObject as SphericalFieldObject).container}
                         onChange={(e) => updateObject(selectedObject.id, { container: e.target.checked } as Partial<TimelineObject>)}
                     />
                 </Row>
                 <Row label="Seed">
                     <input
                         type="number"
                         step="1"
                         value={(selectedObject as SphericalFieldObject).seed}
                         onChange={(e) => {
                             const next = Math.round(toNumberOr(e.target.value, 93));
                             updateObject(selectedObject.id, { seed: next } as Partial<TimelineObject>);
                         }}
                         style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                     />
                 </Row>
             </>
         )}

         {selectedObject.type === 'shattered_sphere' && (
             <>
                 <SectionHeader label="Shattered Sphere Settings" />
                 <div data-testid="shattered-sphere-settings">
                     <Row label="Preset">
                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                             {shatteredSpherePresetPatches.map((preset) => (
                                 <button
                                     key={preset.label}
                                     type="button"
                                     onClick={() => applyShatteredSpherePatch(preset.patch)}
                                     style={{ minWidth: 0 }}
                                 >
                                     {preset.label}
                                 </button>
                             ))}
                         </div>
                     </Row>
                     <ShatteredSphereNumberControl
                         label="Fracture Amount"
                         controlKey="fractureAmount"
                         value={(selectedObject as ShatteredSphereObject).fractureAmount}
                         min={0}
                         max={5000}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Delay"
                         controlKey="delay"
                         value={(selectedObject as ShatteredSphereObject).delay}
                         min={0}
                         max={1000}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Radius"
                         controlKey="radius"
                         value={(selectedObject as ShatteredSphereObject).radius}
                         min={1}
                         max={10000}
                         step={1}
                         fallback={160}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Limit Distance"
                         controlKey="limitDistance"
                         value={(selectedObject as ShatteredSphereObject).limitDistance}
                         min={0}
                         max={10000}
                         step={1}
                         fallback={150}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Thickness"
                         controlKey="thickness"
                         value={(selectedObject as ShatteredSphereObject).thickness}
                         min={0}
                         max={1000}
                         step={1}
                         fallback={20}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Fragment Size"
                         controlKey="fragmentSize"
                         value={(selectedObject as ShatteredSphereObject).fragmentSize}
                         min={1}
                         max={1000}
                         step={1}
                         fallback={40}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Random Shape"
                         controlKey="randomShape"
                         value={(selectedObject as ShatteredSphereObject).randomShape}
                         min={0}
                         max={100}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Speed"
                         controlKey="speed"
                         value={(selectedObject as ShatteredSphereObject).speed}
                         min={0}
                         max={1000}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Impact"
                         controlKey="impact"
                         value={(selectedObject as ShatteredSphereObject).impact}
                         min={0}
                         max={1000}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Gravity X"
                         controlKey="gravityX"
                         value={(selectedObject as ShatteredSphereObject).gravityX}
                         min={-1000}
                         max={1000}
                         step={1}
                         fallback={0}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Gravity Y"
                         controlKey="gravityY"
                         value={(selectedObject as ShatteredSphereObject).gravityY}
                         min={-1000}
                         max={1000}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Gravity Z"
                         controlKey="gravityZ"
                         value={(selectedObject as ShatteredSphereObject).gravityZ}
                         min={-1000}
                         max={1000}
                         step={1}
                         fallback={0}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Spin"
                         controlKey="spin"
                         value={(selectedObject as ShatteredSphereObject).spin}
                         min={0}
                         max={1000}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                     <ShatteredSphereNumberControl
                         label="Direction Diffusion"
                         controlKey="directionDiffusion"
                         value={(selectedObject as ShatteredSphereObject).directionDiffusion}
                         min={0}
                         max={1000}
                         step={1}
                         fallback={100}
                         onChange={applyShatteredSphereNumber}
                     />
                 </div>
                 <Row label="Colour">
                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                         <input
                             type="color"
                             value={(selectedObject as ShatteredSphereObject).colour}
                             onChange={(e) => applyShatteredSpherePatch({ colour: e.target.value })}
                         />
                         <input
                             aria-label="93 shattered sphere colour hex"
                             type="text"
                             value={(selectedObject as ShatteredSphereObject).colour}
                             onChange={(e) => applyShatteredSpherePatch({ colour: e.target.value })}
                             style={{ width: '92px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                         />
                     </div>
                 </Row>
                 <ShatteredSphereNumberControl
                     label="Seed"
                     controlKey="seed"
                     value={(selectedObject as ShatteredSphereObject).seed}
                     min={0}
                     max={999999}
                     step={1}
                     fallback={93}
                     integer
                     onChange={applyShatteredSphereNumber}
                 />
             </>
         )}

         {selectedObject.type === 'barcode' && (
             <>
                 <SectionHeader label="Barcode Settings" />
                 {renderGeneratedTextRow('Data', 'data', (selectedObject as BarcodeObject).data)}
                 {renderGeneratedNumberRow('Minimum Bar Width', 'minimumBarWidth', (selectedObject as BarcodeObject).minimumBarWidth, 1, 100, 1, 2, true)}
                 {renderGeneratedNumberRow('Horizontal Margin', 'horizontalMargin', (selectedObject as BarcodeObject).horizontalMargin, 0, 500, 1, 30, true)}
                 {renderGeneratedNumberRow('Vertical Margin', 'verticalMargin', (selectedObject as BarcodeObject).verticalMargin, 0, 500, 1, 20, true)}
                 {renderGeneratedColourRow('Foreground Colour', 'foregroundColour', (selectedObject as BarcodeObject).foregroundColour)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as BarcodeObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'puzzle_piece' && (
             <>
                 <SectionHeader label="Puzzle Piece Settings" />
                 {renderGeneratedNumberRow('Size', 'size', (selectedObject as PuzzlePieceObject).size, 1, 2000, 1, 120, true)}
                 {renderGeneratedNumberRow('Shape Variant', 'shapeVariant', (selectedObject as PuzzlePieceObject).shapeVariant, 1, 22, 1, 1, true)}
                 {renderGeneratedSelectRow('Connector Mode', 'connectorMode', (selectedObject as PuzzlePieceObject).connectorMode, [
                     { value: 'convex', label: 'Convex' },
                     { value: 'concave', label: 'Concave' },
                 ])}
                 {renderGeneratedColourRow('Fill Colour', 'fillColour', (selectedObject as PuzzlePieceObject).fillColour)}
             </>
         )}

         {selectedObject.type === 'colour_wheel' && (
             <>
                 <SectionHeader label="Colour Wheel Settings" />
                 {renderGeneratedNumberRow('Radius', 'radius', (selectedObject as ColourWheelObject).radius, 1, 2000, 1, 180, true)}
                 {renderGeneratedNumberRow('Saturation', 'saturation', (selectedObject as ColourWheelObject).saturation, 0, 100, 1, 100)}
                 {renderGeneratedNumberRow('Brightness', 'brightness', (selectedObject as ColourWheelObject).brightness, 0, 100, 1, 100)}
                 {renderGeneratedNumberRow('Ring Width %', 'ringWidthPercent', (selectedObject as ColourWheelObject).ringWidthPercent, 1, 100, 1, 25)}
                 {renderGeneratedNumberRow('Segment Count', 'segmentCount', (selectedObject as ColourWheelObject).segmentCount, 3, 360, 1, 24, true)}
             </>
         )}

         {selectedObject.type === 'gourd' && (
             <>
                 <SectionHeader label="Gourd Settings" />
                 {renderGeneratedNumberRow('Body Radius', 'bodyRadius', (selectedObject as GourdObject).bodyRadius, 1, 2000, 1, 80, true)}
                 {renderGeneratedNumberRow('Body Width', 'bodyWidth', (selectedObject as GourdObject).bodyWidth, 1, 3000, 1, 250, true)}
                 {renderGeneratedNumberRow('Waist Radius', 'waistRadius', (selectedObject as GourdObject).waistRadius, 0, 1000, 1, 10, true)}
                 {renderGeneratedNumberRow('Squash %', 'squashPercent', (selectedObject as GourdObject).squashPercent, 0, 100, 1, 40)}
                 {renderGeneratedNumberRow('Repeat Count', 'repeatCount', (selectedObject as GourdObject).repeatCount, 1, 36, 1, 1, true)}
                 {renderGeneratedColourRow('Fill Colour', 'fillColour', (selectedObject as GourdObject).fillColour)}
             </>
         )}

         {selectedObject.type === 'gear' && (
             <>
                 <SectionHeader label="Gear Settings" />
                 {renderGeneratedNumberRow('Outer Radius', 'outerRadius', (selectedObject as GearObject).outerRadius, 1, 2000, 1, 160, true)}
                 {renderGeneratedNumberRow('Inner Radius %', 'innerRadiusPercent', (selectedObject as GearObject).innerRadiusPercent, 0, 99, 1, 45)}
                 {renderGeneratedNumberRow('Tooth Count', 'toothCount', (selectedObject as GearObject).toothCount, 3, 240, 1, 20, true)}
                 {renderGeneratedNumberRow('Tooth Depth %', 'toothDepthPercent', (selectedObject as GearObject).toothDepthPercent, 1, 95, 1, 18)}
                 {renderGeneratedNumberRow('Tooth Skew %', 'toothSkewPercent', (selectedObject as GearObject).toothSkewPercent, -100, 100, 1, 0)}
                 {renderGeneratedColourRow('Fill Colour', 'fillColour', (selectedObject as GearObject).fillColour)}
             </>
         )}

         {selectedObject.type === 'track_bar' && (
             <>
                 <SectionHeader label="Track Bar Settings" />
                 {renderGeneratedNumberListRow('Track Values', 'trackValues', (selectedObject as TrackBarObject).trackValues)}
                 {renderGeneratedTrackRangesRow('Track Ranges', 'trackRanges', (selectedObject as TrackBarObject).trackRanges)}
                 {renderGeneratedTextListRow('Labels', 'labels', (selectedObject as TrackBarObject).labels)}
                 {renderGeneratedColourRow('Bar Colour', 'barColour', (selectedObject as TrackBarObject).barColour)}
                 {renderGeneratedNumberRow('Background Opacity', 'backgroundOpacity', (selectedObject as TrackBarObject).backgroundOpacity, 0, 1, 0.01, 0.05)}
             </>
         )}

         {selectedObject.type === 'pie_chart' && (
             <>
                 <SectionHeader label="Pie Chart Settings" />
                 {renderGeneratedNumberListRow('Values', 'values', (selectedObject as PieChartObject).values)}
                 {renderGeneratedSelectRow('Sort Mode', 'sortMode', (selectedObject as PieChartObject).sortMode, [
                     { value: 'none', label: 'None' },
                     { value: 'descending', label: 'Descending' },
                     { value: 'ascending', label: 'Ascending' },
                 ])}
                 {renderGeneratedCheckboxRow('Normalise To 100', 'normaliseToHundred', (selectedObject as PieChartObject).normaliseToHundred)}
                 {renderGeneratedSelectRow('Label Mode', 'labelMode', (selectedObject as PieChartObject).labelMode, [
                     { value: 'none', label: 'None' },
                     { value: 'percentage', label: 'Percentage' },
                     { value: 'input', label: 'Input' },
                 ])}
                 {renderGeneratedNumberRow('Progress %', 'progressPercent', (selectedObject as PieChartObject).progressPercent, 0, 100, 1, 100)}
                 {renderGeneratedNumberRow('Stroke Width', 'strokeWidth', (selectedObject as PieChartObject).strokeWidth, 1, 500, 1, 20, true)}
                 {renderGeneratedColourListRow('Slice Colours', 'sliceColours', (selectedObject as PieChartObject).sliceColours)}
             </>
         )}

         {selectedObject.type === 'histogram' && (
             <>
                 <SectionHeader label="Histogram Settings" />
                 {renderGeneratedNumberListRow('Bin Values', 'binValues', (selectedObject as HistogramObject).binValues)}
                 {renderGeneratedNumberRow('Height Scale %', 'heightScalePercent', (selectedObject as HistogramObject).heightScalePercent, 1, 1000, 1, 100)}
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as HistogramObject).lineWidth, 1, 100, 1, 1, true)}
                 {renderGeneratedCheckboxRow('Show Luminance', 'showLuminance', (selectedObject as HistogramObject).showLuminance)}
                 {renderGeneratedCheckboxRow('Show Red', 'showRed', (selectedObject as HistogramObject).showRed)}
                 {renderGeneratedCheckboxRow('Show Green', 'showGreen', (selectedObject as HistogramObject).showGreen)}
                 {renderGeneratedCheckboxRow('Show Blue', 'showBlue', (selectedObject as HistogramObject).showBlue)}
                 {renderGeneratedColourListRow('Channel Colours', 'channelColours', (selectedObject as HistogramObject).channelColours)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as HistogramObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'tone_curve' && (
             <>
                 <SectionHeader label="Tone Curve Settings" />
                 {renderGeneratedNumberRow('Grid Divisions', 'gridDivisions', (selectedObject as ToneCurveObject).gridDivisions, 1, 16, 1, 4, true)}
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as ToneCurveObject).lineWidth, 1, 100, 1, 3, true)}
                 {renderGeneratedNumberListRow('Curve Points', 'curvePoints', (selectedObject as ToneCurveObject).curvePoints)}
                 {renderGeneratedColourRow('Curve Colour', 'curveColour', (selectedObject as ToneCurveObject).curveColour)}
                 {renderGeneratedColourRow('Grid Colour', 'gridColour', (selectedObject as ToneCurveObject).gridColour)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as ToneCurveObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'sunburst' && (
             <>
                 <SectionHeader label="Sunburst Settings" />
                 {renderGeneratedNumberRow('Ray Count', 'rayCount', (selectedObject as SunburstObject).rayCount, 1, 360, 1, 10, true)}
                 {renderGeneratedNumberRow('Ray Coverage %', 'rayCoveragePercent', (selectedObject as SunburstObject).rayCoveragePercent, 0, 100, 1, 50)}
                 {renderGeneratedNumberRow('Rotation Offset', 'rotationOffsetDegrees', (selectedObject as SunburstObject).rotationOffsetDegrees, -720, 720, 1, 0)}
                 {renderGeneratedNumberRow('Centre X %', 'centreXPercent', (selectedObject as SunburstObject).centreXPercent, -100, 200, 1, 50)}
                 {renderGeneratedNumberRow('Centre Y %', 'centreYPercent', (selectedObject as SunburstObject).centreYPercent, -100, 200, 1, 50)}
                 {renderGeneratedNumberRow('Motif Size', 'motifSize', (selectedObject as SunburstObject).motifSize, 0, 2000, 1, 200, true)}
                 {renderGeneratedSelectRow('Motif Shape', 'motifShape', (selectedObject as SunburstObject).motifShape, [
                     { value: 'circle', label: 'Circle' },
                     { value: 'rect', label: 'Rect' },
                 ])}
                 {renderGeneratedColourRow('Ray Colour', 'rayColour', (selectedObject as SunburstObject).rayColour)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as SunburstObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'circular_arrow' && (
             <>
                 <SectionHeader label="Circular Arrow Settings" />
                 {renderGeneratedNumberRow('Radius', 'radius', (selectedObject as CircularArrowObject).radius, 1, 2000, 1, 160, true)}
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as CircularArrowObject).lineWidth, 1, 500, 1, 20, true)}
                 {renderGeneratedNumberRow('Head Size', 'headSize', (selectedObject as CircularArrowObject).headSize, 0, 1000, 1, 50, true)}
                 {renderGeneratedNumberRow('Angle', 'angleDegrees', (selectedObject as CircularArrowObject).angleDegrees, 0, 360, 1, 260)}
                 {renderGeneratedNumberRow('Centre Angle', 'centreAngleDegrees', (selectedObject as CircularArrowObject).centreAngleDegrees, -720, 720, 1, 0)}
                 {renderGeneratedSelectRow('Head Shape', 'headShape', (selectedObject as CircularArrowObject).headShape, [
                     { value: 'triangle', label: 'Triangle' },
                     { value: 'circle', label: 'Circle' },
                 ])}
                 {renderGeneratedCheckboxRow('Tail Head', 'showTailHead', (selectedObject as CircularArrowObject).showTailHead)}
                 {renderGeneratedCheckboxRow('Flip Vertical', 'flipVertical', (selectedObject as CircularArrowObject).flipVertical)}
                 {renderGeneratedCheckboxRow('Flip Horizontal', 'flipHorizontal', (selectedObject as CircularArrowObject).flipHorizontal)}
                 {renderGeneratedColourRow('Arrow Colour', 'arrowColour', (selectedObject as CircularArrowObject).arrowColour)}
             </>
         )}

         {selectedObject.type === 'triangle_bracket' && (
             <>
                 <SectionHeader label="Triangle Bracket Settings" />
                 {renderGeneratedNumberRow('Bracket Width', 'bracketWidth', (selectedObject as TriangleBracketObject).bracketWidth, 1, 2000, 1, 100, true)}
                 {renderGeneratedNumberRow('Angle', 'angleDegrees', (selectedObject as TriangleBracketObject).angleDegrees, 1, 180, 1, 120)}
                 {renderGeneratedNumberRow('Arm Length', 'armLength', (selectedObject as TriangleBracketObject).armLength, 0, 2000, 1, 50, true)}
                 {renderGeneratedNumberRow('Offset Distance', 'offsetDistance', (selectedObject as TriangleBracketObject).offsetDistance, -2000, 2000, 1, 0, true)}
                 {renderGeneratedColourRow('Bracket Colour', 'bracketColour', (selectedObject as TriangleBracketObject).bracketColour)}
             </>
         )}

         {selectedObject.type === 'tartan_check' && (
             <>
                 <SectionHeader label="Tartan Check Settings" />
                 {renderGeneratedNumberRow('Tile Size', 'tileSize', (selectedObject as TartanCheckObject).tileSize, 10, 800, 1, 100, true)}
                 {renderGeneratedNumberRow('Blur Radius', 'blurRadius', (selectedObject as TartanCheckObject).blurRadius, 0, 300, 1, 1, true)}
                 {renderGeneratedColourRow('Base Colour', 'baseColour', (selectedObject as TartanCheckObject).baseColour)}
                 {renderGeneratedColourRow('Stripe Colour A', 'stripeColourA', (selectedObject as TartanCheckObject).stripeColourA)}
                 {renderGeneratedColourRow('Stripe Colour B', 'stripeColourB', (selectedObject as TartanCheckObject).stripeColourB)}
                 {renderGeneratedColourRow('Line Colour', 'lineColour', (selectedObject as TartanCheckObject).lineColour)}
             </>
         )}

         {selectedObject.type === 'houndstooth' && (
             <>
                 <SectionHeader label="Houndstooth Settings" />
                 {renderGeneratedNumberRow('Pattern Size', 'patternSize', (selectedObject as HoundstoothObject).patternSize, 10, 200, 1, 50, true)}
                 {renderGeneratedColourRow('Foreground Colour', 'foregroundColour', (selectedObject as HoundstoothObject).foregroundColour)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as HoundstoothObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'yagasuri' && (
             <>
                 <SectionHeader label="Yagasuri Settings" />
                 {renderGeneratedNumberRow('Arrow Width', 'arrowWidth', (selectedObject as YagasuriObject).arrowWidth, 1, 500, 1, 15, true)}
                 {renderGeneratedNumberRow('Arrow Height', 'arrowHeight', (selectedObject as YagasuriObject).arrowHeight, 1, 500, 1, 65, true)}
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as YagasuriObject).lineWidth, 0, 100, 1, 2, true)}
                 {renderGeneratedCheckboxRow('Staggered', 'staggered', (selectedObject as YagasuriObject).staggered)}
                 {renderGeneratedColourRow('Foreground Colour', 'foregroundColour', (selectedObject as YagasuriObject).foregroundColour)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as YagasuriObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'paper_airplane' && (
             <>
                 <SectionHeader label="Paper Airplane Settings" />
                 {renderGeneratedNumberRow('Body Length', 'bodyLength', (selectedObject as PaperAirplaneObject).bodyLength, 1, 2000, 1, 200, true)}
                 {renderGeneratedNumberRow('Wing Width', 'wingWidth', (selectedObject as PaperAirplaneObject).wingWidth, 0, 1000, 1, 80, true)}
                 {renderGeneratedNumberRow('Fold Height', 'foldHeight', (selectedObject as PaperAirplaneObject).foldHeight, 0, 1000, 1, 50, true)}
                 {renderGeneratedNumberRow('Gap', 'gap', (selectedObject as PaperAirplaneObject).gap, 0, 1000, 1, 50, true)}
                 {renderGeneratedCheckboxRow('Follow Motion Direction', 'followMotionDirection', (selectedObject as PaperAirplaneObject).followMotionDirection)}
                 {renderGeneratedSelectRow('Axis Mode', 'axisMode', (selectedObject as PaperAirplaneObject).axisMode, [
                     { value: 0, label: 'X' },
                     { value: 1, label: 'Y' },
                 ])}
                 {renderGeneratedColourRow('Fill Colour', 'fillColour', (selectedObject as PaperAirplaneObject).fillColour)}
             </>
         )}

         {selectedObject.type === 'asanoha_pattern' && (
             <>
                 <SectionHeader label="Asanoha Pattern Settings" />
                 {renderGeneratedNumberRow('Pattern Size', 'patternSize', (selectedObject as AsanohaPatternObject).patternSize, 10, 500, 1, 50, true)}
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as AsanohaPatternObject).lineWidth, 0, 50, 1, 2, true)}
                 {renderGeneratedColourRow('Foreground Colour', 'foregroundColour', (selectedObject as AsanohaPatternObject).foregroundColour)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as AsanohaPatternObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'focus_lines_plus' && (
             <>
                 <SectionHeader label="Focus Lines Plus Settings" />
                 {renderGeneratedNumberRow('Ray Width', 'rayWidth', (selectedObject as FocusLinesPlusObject).rayWidth, 0.1, 10, 0.1, 1)}
                 {renderGeneratedNumberRow('Gap', 'gap', (selectedObject as FocusLinesPlusObject).gap, 1, 20, 0.1, 5)}
                 {renderGeneratedNumberRow('Centre Radius', 'centreRadius', (selectedObject as FocusLinesPlusObject).centreRadius, 0, 800, 1, 100)}
                 {renderGeneratedNumberRow('Rotation', 'rotationDegrees', (selectedObject as FocusLinesPlusObject).rotationDegrees, -720, 720, 1, 0)}
                 {renderGeneratedNumberRow('Centre X', 'centreX', (selectedObject as FocusLinesPlusObject).centreX, -2000, 4000, 1, 0)}
                 {renderGeneratedNumberRow('Centre Y', 'centreY', (selectedObject as FocusLinesPlusObject).centreY, -2000, 4000, 1, 0)}
                 {renderGeneratedNumberRow('Centre Jitter %', 'centreJitterPercent', (selectedObject as FocusLinesPlusObject).centreJitterPercent, 0, 100, 1, 20)}
                 {renderGeneratedNumberRow('Keyframe Interval', 'keyframeInterval', (selectedObject as FocusLinesPlusObject).keyframeInterval, 0, 1000, 1, 0, true)}
                 {renderGeneratedNumberRow('Seed', 'seed', (selectedObject as FocusLinesPlusObject).seed, 0, 999999, 1, 0, true)}
                 {renderGeneratedColourRow('Line Colour', 'lineColour', (selectedObject as FocusLinesPlusObject).lineColour)}
             </>
         )}

         {selectedObject.type === 'random_line_ex' && (
             <>
                 <SectionHeader label="Random Line EX Settings" />
                 {renderGeneratedNumberRow('Line Count', 'lineCount', (selectedObject as RandomLineExObject).lineCount, 1, 100, 1, 3, true)}
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as RandomLineExObject).lineWidth, 0, 2000, 1, 6)}
                 {renderGeneratedNumberRow('Threshold', 'threshold', (selectedObject as RandomLineExObject).threshold, 0, 255, 1, 128, true)}
                 {renderGeneratedNumberRow('Noise Cell Size', 'noiseCellSize', (selectedObject as RandomLineExObject).noiseCellSize, 0, 50, 1, 12, true)}
                 {renderGeneratedNumberRow('Width Variance', 'widthVariance', (selectedObject as RandomLineExObject).widthVariance, 0, 2000, 1, 0)}
                 {renderGeneratedNumberRow('Seed', 'seed', (selectedObject as RandomLineExObject).seed, 0, 999999, 1, 0, true)}
                 {renderGeneratedColourRow('Line Colour', 'lineColour', (selectedObject as RandomLineExObject).lineColour)}
             </>
         )}

         {selectedObject.type === 'audio_sphere' && (
             <>
                 <SectionHeader label="Audio Sphere Settings" />
                 {renderGeneratedNumberRow('Columns', 'columns', (selectedObject as AudioSphereObject).columns, 1, 256, 1, 24, true)}
                 {renderGeneratedNumberRow('Rows', 'rows', (selectedObject as AudioSphereObject).rows, 1, 256, 1, 16, true)}
                 {renderGeneratedNumberRow('Base Radius', 'baseRadius', (selectedObject as AudioSphereObject).baseRadius, 1, 2000, 1, 160)}
                 {renderGeneratedNumberRow('Audio Influence', 'audioInfluence', (selectedObject as AudioSphereObject).audioInfluence, 0, 1000, 1, 100)}
                 {renderGeneratedNumberRow('Point Size', 'pointSize', (selectedObject as AudioSphereObject).pointSize, 0, 200, 1, 6)}
                 {renderGeneratedNumberRow('Polygon Size', 'polygonSize', (selectedObject as AudioSphereObject).polygonSize, 0, 200, 1, 8)}
                 {renderGeneratedNumberRow('Random Amount', 'randomAmount', (selectedObject as AudioSphereObject).randomAmount, 0, 1000, 1, 0)}
                 {renderGeneratedNumberRow('Sample Window', 'sampleWindowSeconds', (selectedObject as AudioSphereObject).sampleWindowSeconds, 1 / 60, 10, 0.01, 0.08)}
                 {renderGeneratedNumberRow('Seed', 'seed', (selectedObject as AudioSphereObject).seed, 0, 999999, 1, 93, true)}
                 {renderGeneratedColourRow('Colour', 'colour', (selectedObject as AudioSphereObject).colour)}
             </>
         )}

         {selectedObject.type === 'region_frame' && (
             <>
                 <SectionHeader label="Region Frame Settings" />
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as RegionFrameObject).lineWidth, 0, 200, 1, 3)}
                 {renderGeneratedSelectRow('Shape', 'shape', (selectedObject as RegionFrameObject).shape ?? 'rectangle', [
                     { value: 'rectangle', label: 'Rectangle' },
                     { value: 'ellipse', label: 'Ellipse' },
                     { value: 'cut_corner', label: 'Cut Corner' },
                 ])}
                 {renderGeneratedNumberRow('Corner Cut', 'cornerCut', (selectedObject as RegionFrameObject).cornerCut ?? 0, 0, 1000, 1, 0)}
                 {renderGeneratedNumberRow('Extra Width', 'extraWidth', (selectedObject as RegionFrameObject).extraWidth, -2000, 2000, 1, 0)}
                 {renderGeneratedNumberRow('Extra Height', 'extraHeight', (selectedObject as RegionFrameObject).extraHeight, -2000, 2000, 1, 0)}
                 {renderGeneratedNumberRow('Background Opacity', 'backgroundOpacity', (selectedObject as RegionFrameObject).backgroundOpacity, 0, 1, 0.01, 0.08)}
                 {renderGeneratedColourRow('Frame Colour', 'frameColour', (selectedObject as RegionFrameObject).frameColour)}
                 {renderGeneratedColourRow('Background Colour', 'backgroundColour', (selectedObject as RegionFrameObject).backgroundColour)}
             </>
         )}

         {selectedObject.type === 'simple_tube' && (
             <>
                 <SectionHeader label="SimpleTube Settings" />
                 {renderGeneratedNumberRow('Radius', 'radius', (selectedObject as SimpleTubeObject).radius, 1, 2000, 1, 120)}
                 {renderGeneratedNumberRow('Depth', 'depth', (selectedObject as SimpleTubeObject).depth, 0, 2000, 1, 160)}
                 {renderGeneratedNumberRow('Segments', 'segments', (selectedObject as SimpleTubeObject).segments, 3, 256, 1, 32, true)}
                 {renderGeneratedNumberRow('Rings', 'rings', (selectedObject as SimpleTubeObject).rings, 1, 256, 1, 8, true)}
                 {renderGeneratedNumberRow('Twist Degrees', 'twistDegrees', (selectedObject as SimpleTubeObject).twistDegrees, -720, 720, 1, 0)}
                 {renderGeneratedNumberRow('Random Amount', 'randomAmount', (selectedObject as SimpleTubeObject).randomAmount, 0, 1000, 1, 0)}
                 {renderGeneratedNumberRow('Stroke Width', 'strokeWidth', (selectedObject as SimpleTubeObject).strokeWidth, 0, 100, 1, 2)}
                 {renderGeneratedSelectRow('Colour Pattern', 'colourPattern', (selectedObject as SimpleTubeObject).colourPattern ?? 'single', [
                     { value: 'single', label: 'Single' },
                     { value: 'ring', label: 'Ring' },
                     { value: 'depth', label: 'Depth' },
                 ])}
                 {renderGeneratedNumberRow('Fog Strength', 'fogStrength', (selectedObject as SimpleTubeObject).fogStrength ?? 0, 0, 1, 0.01, 0)}
                 {renderGeneratedCheckboxRow('Torus', 'torus', (selectedObject as SimpleTubeObject).torus)}
                 {renderGeneratedNumberRow('Seed', 'seed', (selectedObject as SimpleTubeObject).seed, 0, 999999, 1, 93, true)}
                 {renderGeneratedColourRow('Colour', 'colour', (selectedObject as SimpleTubeObject).colour)}
                 {renderGeneratedColourRow('Secondary Colour', 'secondaryColour', (selectedObject as SimpleTubeObject).secondaryColour)}
                 {renderGeneratedColourRow('Fog Colour', 'fogColour', (selectedObject as SimpleTubeObject).fogColour ?? '#000000')}
             </>
         )}

         {selectedObject.type === 'contour_trace' && (
             <>
                 <SectionHeader label="Contour Trace Settings" />
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as ContourTraceObject).lineWidth, 1, 200, 1, 3)}
                 {renderGeneratedNumberRow('Contour Count', 'contourCount', (selectedObject as ContourTraceObject).contourCount, 1, 64, 1, 5, true)}
                 {renderGeneratedNumberRow('Jitter Amount', 'jitterAmount', (selectedObject as ContourTraceObject).jitterAmount, 0, 100, 0.1, 1.5)}
                 {renderGeneratedNumberRow('Background Opacity', 'backgroundOpacity', (selectedObject as ContourTraceObject).backgroundOpacity, 0, 1, 0.01, 0)}
                 {renderGeneratedNumberRow('Seed', 'seed', (selectedObject as ContourTraceObject).seed, 0, 999999, 1, 93, true)}
                 {renderGeneratedColourRow('Trace Colour', 'traceColour', (selectedObject as ContourTraceObject).traceColour)}
             </>
         )}

         {selectedObject.type === 'displacement_poly' && (
             <>
                 <SectionHeader label="Displacement Poly Settings" />
                 {renderGeneratedNumberRow('Columns', 'columns', (selectedObject as DisplacementPolyObject).columns, 1, 128, 1, 14, true)}
                 {renderGeneratedNumberRow('Rows', 'rows', (selectedObject as DisplacementPolyObject).rows, 1, 128, 1, 8, true)}
                 {renderGeneratedNumberRow('Displacement Scale', 'displacementScale', (selectedObject as DisplacementPolyObject).displacementScale, 0, 1000, 1, 42)}
                 {renderGeneratedNumberRow('Depth Scale', 'depthScale', (selectedObject as DisplacementPolyObject).depthScale, 0, 1000, 1, 18)}
                 {renderGeneratedNumberRow('Mesh Opacity', 'meshOpacity', (selectedObject as DisplacementPolyObject).meshOpacity, 0, 1, 0.01, 0.85)}
                 {renderGeneratedNumberRow('Fill Opacity', 'fillOpacity', (selectedObject as DisplacementPolyObject).fillOpacity, 0, 1, 0.01, 0.18)}
                 {renderGeneratedNumberRow('Seed', 'seed', (selectedObject as DisplacementPolyObject).seed, 0, 999999, 1, 93, true)}
                 {renderGeneratedColourRow('Line Colour', 'lineColour', (selectedObject as DisplacementPolyObject).lineColour)}
                 {renderGeneratedColourRow('Fill Colour', 'fillColour', (selectedObject as DisplacementPolyObject).fillColour)}
             </>
         )}

         {selectedObject.type === 'hologram' && (
             <>
                 <SectionHeader label="Hologram Settings" />
                 {renderGeneratedNumberRow('Tile Size', 'tileSize', (selectedObject as HologramObject).tileSize, 10, 1000, 1, 80, true)}
                 {renderGeneratedNumberRow('Rotation', 'rotationDegrees', (selectedObject as HologramObject).rotationDegrees, -720, 720, 1, 0)}
                 {renderGeneratedNumberRow('Gradient Angle', 'gradientAngleDegrees', (selectedObject as HologramObject).gradientAngleDegrees, -720, 720, 1, -60)}
                 {renderGeneratedSelectRow('Colour Mode', 'colourMode', (selectedObject as HologramObject).colourMode, [
                     { value: 0, label: 'Mono' },
                     { value: 1, label: 'Rainbow' },
                     { value: 2, label: 'Tint' },
                 ])}
                 {renderGeneratedColourRow('Tint Colour', 'tintColour', (selectedObject as HologramObject).tintColour)}
             </>
         )}

         {selectedObject.type === 'protractor' && (
             <>
                 <SectionHeader label="Protractor Settings" />
                 {renderGeneratedNumberRow('Radius', 'radius', (selectedObject as ProtractorObject).radius, 1, 2000, 1, 180, true)}
                 {renderGeneratedNumberRow('Measured Angle', 'measuredAngleDegrees', (selectedObject as ProtractorObject).measuredAngleDegrees, 0, 180, 1, 90)}
                 {renderGeneratedNumberRow('Tick Step', 'tickStepDegrees', (selectedObject as ProtractorObject).tickStepDegrees, 1, 90, 1, 10, true)}
                 {renderGeneratedNumberRow('Major Tick Step', 'majorTickStepDegrees', (selectedObject as ProtractorObject).majorTickStepDegrees, 1, 180, 1, 30, true)}
                 {renderGeneratedNumberRow('Decimal Places', 'decimalPlaces', (selectedObject as ProtractorObject).decimalPlaces, 0, 5, 1, 1, true)}
                 {renderGeneratedColourRow('Line Colour', 'lineColour', (selectedObject as ProtractorObject).lineColour)}
                 {renderGeneratedColourRow('Text Colour', 'textColour', (selectedObject as ProtractorObject).textColour)}
                 {renderGeneratedColourRow('Shadow Colour', 'shadowColour', (selectedObject as ProtractorObject).shadowColour)}
             </>
         )}

         {selectedObject.type === 'shaking_polygon' && (
             <>
                 <SectionHeader label="Shaking Polygon Settings" />
                 {renderGeneratedNumberRow('Line Width', 'lineWidth', (selectedObject as ShakingPolygonObject).lineWidth, 1, 100, 1, 20, true)}
                 {renderGeneratedNumberRow('Vertex Count', 'vertexCount', (selectedObject as ShakingPolygonObject).vertexCount, 2, 16, 1, 3, true)}
                 {renderGeneratedNumberRow('Fixed Diameter', 'fixedDiameter', (selectedObject as ShakingPolygonObject).fixedDiameter, 0, 2000, 1, 260, true)}
                 {renderGeneratedNumberRow('Vertical Distortion %', 'verticalDistortionPercent', (selectedObject as ShakingPolygonObject).verticalDistortionPercent, -100, 100, 1, 0)}
                 {renderGeneratedNumberRow('Repeat Count', 'repeatCount', (selectedObject as ShakingPolygonObject).repeatCount, 1, 100, 1, 1, true)}
                 {renderGeneratedNumberRow('Repeat Frequency', 'repeatFrequency', (selectedObject as ShakingPolygonObject).repeatFrequency, 1, 1000, 1, 1, true)}
                 {renderGeneratedCheckboxRow('Fill', 'fill', (selectedObject as ShakingPolygonObject).fill)}
                 {renderGeneratedNumberRow('Jitter Range', 'jitterRange', (selectedObject as ShakingPolygonObject).jitterRange, 0, 2000, 1, 20)}
                 {renderGeneratedNumberRow('Jitter Interval', 'jitterInterval', (selectedObject as ShakingPolygonObject).jitterInterval, 1, 1000, 1, 10, true)}
                 {renderGeneratedCheckboxRow('Stepped', 'stepped', (selectedObject as ShakingPolygonObject).stepped)}
                 {renderGeneratedNumberRow('Seed', 'seed', (selectedObject as ShakingPolygonObject).seed, 0, 999999, 1, 0, true)}
                 {renderGeneratedColourRow('Colour', 'colour', (selectedObject as ShakingPolygonObject).colour)}
             </>
         )}
         
         {/* --- 音声波形設定 --- */}
         {selectedObject.type === 'audio_visualization' && (
            <>
                <SectionHeader label="Waveform Settings" />
                <Row label="Colour">
                     <input type="color" value={(selectedObject as AudioVisualizationObject).color} onChange={(e) => handleChange('color', e.target.value)} />
                </Row>
                <Row label="Thickness">
                    <input type="number" value={(selectedObject as AudioVisualizationObject).thickness} onChange={(e) => handleNumericChange('thickness', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Amplitude">
                    <input type="number" step="0.1" value={(selectedObject as AudioVisualizationObject).amplitude} onChange={(e) => handleNumericChange('amplitude', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Target Layer">
                    <input 
                        type="number" 
                        min="1" 
                        max="100"
                        value={((selectedObject as AudioVisualizationObject).targetLayer || 0) + 1} 
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            // ユーザー入力は1始まり、内部データは0始まりと想定
                            updateObject(selectedObject.id, { targetLayer: val - 1 });
                        }}
                        style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} 
                    />
                </Row>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>
                    * Specify the Layer number where the audio is placed.
                </div>
            </>
        )}

        {selectedObject.type === 'psd' && (
            <>
                <SectionHeader label="PSD Transform" />
                <Row label="Scale">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Slider
                            min="0.1"
                            max="3"
                            step="0.01"
                            value={selectedObject.scale ?? 1}
                            onInput={(e) => handlePsdScaleChange(e.currentTarget.value)}
                            style={{ flex: 1 }}
                        />
                        <input
                            type="number"
                            min="0.1"
                            max="10"
                            step="0.1"
                            value={selectedObject.scale ?? 1}
                            onChange={(e) => handlePsdScaleChange(e.target.value)}
                            style={{ width: '64px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                        />
                        <span style={{ fontSize: '11px', color: '#999' }}>x</span>
                    </div>
                </Row>

                {editorMode === '3d_stage' && (
                  <>
                    <SectionHeader label={t('worldPlacementTitle')} />
                    <Row label={t('worldPlacementEnabled')}>
                      <input
                        type="checkbox"
                        checked={(selectedObject as PsdObject).worldPlacement?.enabled ?? false}
                        onChange={(e) => {
                          const psd = selectedObject as PsdObject;
                          const next = e.target.checked
                            ? { ...(psd.worldPlacement ?? defaultPsdWorldPlacement()), enabled: true }
                            : { ...(psd.worldPlacement ?? defaultPsdWorldPlacement()), enabled: false };
                          updateObject(psd.id, { worldPlacement: next });
                        }}
                      />
                    </Row>
                    <Row label={t('worldPosX')}>
                      <input
                        type="number"
                        step="0.1"
                        value={(selectedObject as PsdObject).worldPlacement?.position.x ?? 0}
                        onChange={(e) => {
                          const psd = selectedObject as PsdObject;
                          const base = psd.worldPlacement ?? defaultPsdWorldPlacement();
                          updateObject(psd.id, {
                            worldPlacement: {
                              ...base,
                              position: { ...base.position, x: parseFloat(e.target.value) || 0 },
                            },
                          });
                        }}
                      />
                    </Row>
                    <Row label={t('worldPosY')}>
                      <input
                        type="number"
                        step="0.1"
                        value={(selectedObject as PsdObject).worldPlacement?.position.y ?? 0}
                        onChange={(e) => {
                          const psd = selectedObject as PsdObject;
                          const base = psd.worldPlacement ?? defaultPsdWorldPlacement();
                          updateObject(psd.id, {
                            worldPlacement: {
                              ...base,
                              position: { ...base.position, y: parseFloat(e.target.value) || 0 },
                            },
                          });
                        }}
                      />
                    </Row>
                    <Row label={t('worldPosZ')}>
                      <input
                        type="number"
                        step="0.1"
                        value={(selectedObject as PsdObject).worldPlacement?.position.z ?? 0}
                        onChange={(e) => {
                          const psd = selectedObject as PsdObject;
                          const base = psd.worldPlacement ?? defaultPsdWorldPlacement();
                          updateObject(psd.id, {
                            worldPlacement: {
                              ...base,
                              position: { ...base.position, z: parseFloat(e.target.value) || 0 },
                            },
                          });
                        }}
                      />
                    </Row>
                    <Row label={t('worldRotY')}>
                      <input
                        type="number"
                        step="1"
                        value={(selectedObject as PsdObject).worldPlacement?.rotationYDeg ?? 0}
                        onChange={(e) => {
                          const psd = selectedObject as PsdObject;
                          const base = psd.worldPlacement ?? defaultPsdWorldPlacement();
                          updateObject(psd.id, {
                            worldPlacement: {
                              ...base,
                              rotationYDeg: parseFloat(e.target.value) || 0,
                            },
                          });
                        }}
                      />
                    </Row>
                    <Row label={t('worldScale3d')}>
                      <input
                        type="number"
                        min="0.05"
                        step="0.05"
                        value={(selectedObject as PsdObject).worldPlacement?.scale ?? 1.5}
                        onChange={(e) => {
                          const psd = selectedObject as PsdObject;
                          const base = psd.worldPlacement ?? defaultPsdWorldPlacement();
                          updateObject(psd.id, {
                            worldPlacement: {
                              ...base,
                              scale: Math.max(0.05, parseFloat(e.target.value) || 0),
                            },
                          });
                        }}
                      />
                    </Row>
                    <Row label={t('worldBillboard')}>
                      <input
                        type="checkbox"
                        checked={(selectedObject as PsdObject).worldPlacement?.billboard ?? true}
                        onChange={(e) => {
                          const psd = selectedObject as PsdObject;
                          const base = psd.worldPlacement ?? defaultPsdWorldPlacement();
                          updateObject(psd.id, {
                            worldPlacement: { ...base, billboard: e.target.checked },
                          });
                        }}
                      />
                    </Row>
                  </>
                )}

                <SectionHeader label="PSD Layers" />
                <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={handleRefreshPsdTree}
                        disabled={isRefreshingPsdTree}
                        style={{
                            padding: '4px 8px',
                            background: '#333',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            color: '#eee',
                            cursor: isRefreshingPsdTree ? 'default' : 'pointer',
                            fontSize: '11px'
                        }}
                    >
                        {isRefreshingPsdTree ? 'Refreshing...' : 'Reload Layers'}
                    </button>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                        Toggle で即時反映されます。必要なら Reload Layers で再同期できます。
                    </span>
                </div>
                <div style={{ maxHeight: '260px', overflowY: 'auto', background: '#1e1e1e', border: '1px solid #333', borderRadius: '4px', padding: '8px' }}>
                    {selectedObject.layerTree && selectedObject.layerTree.length > 0 ? (
                        renderPsdTree(selectedObject.layerTree)
                    ) : (
                        <div style={{ fontSize: '12px', color: '#888' }}>
                            レイヤー情報がまだありません。`Reload Layers` を押してください。
                        </div>
                    )}
                </div>
            </>
        )}

      </div>
    </div>

    {visionPickOpen && visionPickUrl && (
      <div
        className="no-drag"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}
        onClick={() => {
          setVisionPickOpen(false);
          setVisionPickUrl(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setVisionPickOpen(false);
            setVisionPickUrl(null);
          }
        }}
        role="presentation"
      >
        <div
          style={{ maxWidth: 'min(900px, 95vw)', background: '#222', padding: '12px', borderRadius: '8px' }}
          onClick={(ev) => ev.stopPropagation()}
          role="presentation"
        >
          <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>
            {language === 'en'
              ? 'Click the subject. If a pet was detected, its box is used; otherwise a default box is placed.'
              : '被写体をクリック。ペットが検出されていればその矩形を、なければ既定サイズの矩形を設定します。'}
          </div>
          <img
            src={visionPickUrl}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '70vh', cursor: 'crosshair', display: 'block' }}
            onClick={handleVisionPickImageClick}
          />
          <button
            type="button"
            style={{ marginTop: '10px', width: '100%' }}
            onClick={() => {
              setVisionPickOpen(false);
              setVisionPickUrl(null);
            }}
          >
            {language === 'en' ? 'Cancel' : 'キャンセル'}
          </button>
        </div>
      </div>
    )}
    </>
  );
};

export default PropertyPanel;
