import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject, AudioVisualizationObject, PsdLayerStruct, PsdObject, ObjectFilter, FilterType, PositionKeyframe, GradientFill } from '../types';
import { buildPsdLayerTree, togglePsdLayer } from '../utils/psdParser';
import { easingNames, EasingType } from '../utils/easings';
import { buildEndpointKeyframes, evaluateObjectPositionAtTime } from '../utils/keyframes';

const PropertyPanel: React.FC = () => {
  const { selectedObject, selectedCount, selectedObjects, currentTime, objects } = useStore((state) => {
    const normalisedSelectedIds = state.selectedIds.length > 0
      ? state.selectedIds
      : (state.selectedId ? [state.selectedId] : []);
    const selectedObject = state.objects.find((obj) => obj.id === state.selectedId)
      ?? state.objects.find((obj) => normalisedSelectedIds.includes(obj.id))
      ?? null;
    return {
      selectedObject,
      selectedCount: normalisedSelectedIds.length,
      selectedObjects: state.objects.filter((obj) => (
        normalisedSelectedIds.includes(obj.id)
        && state.layers[obj.layer]?.locked !== true
      )),
      currentTime: state.currentTime,
      objects: state.objects
    };
  });
  const pushHistory = useStore((state) => state.pushHistory);
  const updateObject = useStore((state) => state.updateObject);
  const addObjectFilter = useStore((state) => state.addObjectFilter);
  const toggleObjectFilter = useStore((state) => state.toggleObjectFilter);
  const moveObjectFilter = useStore((state) => state.moveObjectFilter);
  const removeObjectFilter = useStore((state) => state.removeObjectFilter);
  const updateObjectFilterParams = useStore((state) => state.updateObjectFilterParams);
  const setGroupGradient = useStore((state) => state.setGroupGradient);
  const [isRefreshingPsdTree, setIsRefreshingPsdTree] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [batchMoveX, setBatchMoveX] = useState('0');
  const [batchMoveY, setBatchMoveY] = useState('0');
  const [batchScaleXPercent, setBatchScaleXPercent] = useState('100');
  const [batchScaleYPercent, setBatchScaleYPercent] = useState('100');
  const [batchRotation, setBatchRotation] = useState('0');
  const [batchOpacityPercent, setBatchOpacityPercent] = useState('0');

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

  if (!selectedObject) {
    return (
      <div className="property-panel no-drag" style={{ width: '300px', background: '#252526', borderLeft: '1px solid #111', padding: '10px', color: '#ccc' }}>
        <div style={{ fontSize: '12px', color: '#888' }}>No object selected</div>
      </div>
    );
  }

  const handleChange = (key: string, value: unknown) => {
    updateObject(selectedObject.id, { [key]: value } as Partial<TimelineObject>);
  };

  const handleNumericChange = (key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      updateObject(selectedObject.id, { [key]: num } as Partial<TimelineObject>);
    }
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const toNumberOr = (rawValue: string, fallback: number) => {
    const parsed = parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const filterLabel: Record<FilterType, string> = {
    color_correction: '色調補正',
    clipping: 'クリッピング',
    vibration: '振動',
    shadow: '影',
    gradient: 'グラデーション'
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
        if (Math.abs(moveX) > 0.0001) patch.x = obj.x + moveX;
        if (Math.abs(moveY) > 0.0001) patch.y = obj.y + moveY;
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

  const handlePsdScaleChange = (rawValue: string) => {
      if (selectedObject.type !== 'psd') return;
      const next = parseFloat(rawValue);
      if (Number.isNaN(next)) return;
      updateObject(selectedObject.id, { scale: clamp(next, 0.1, 10) } as Partial<TimelineObject>);
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

  // Common UI Components
  const Row = ({ label, children }: { label: string, children: React.ReactNode }) => (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '12px' }}>
          <div style={{ width: '80px', color: '#aaa' }}>{label}</div>
          <div style={{ flex: 1 }}>{children}</div>
      </div>
  );
  
  const SectionHeader = ({ label }: { label: string }) => (
      <div style={{ marginTop: '16px', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #444', fontSize: '11px', fontWeight: 'bold', color: '#eee', textTransform: 'uppercase' }}>
          {label}
      </div>
  );

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

  return (
    <div className="property-panel no-drag" style={{ width: '300px', height: '100%', background: '#252526', borderLeft: '1px solid #111', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid #333', background: '#333', fontWeight: 'bold' }}>
        Property: {selectedObject.name}
        {selectedCount > 1 && (
          <span style={{ marginLeft: '8px', fontWeight: 'normal', fontSize: '11px', color: '#aaa' }}>
            ({selectedCount}個選択中)
          </span>
        )}
      </div>
      
      <div style={{ padding: '10px' }}>
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
                        style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="移動 Y">
                    <input
                        type="number"
                        value={batchMoveY}
                        onChange={(e) => setBatchMoveY(e.target.value)}
                        style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="拡大率X %">
                    <input
                        type="number"
                        value={batchScaleXPercent}
                        onChange={(e) => setBatchScaleXPercent(e.target.value)}
                        style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="拡大率Y %">
                    <input
                        type="number"
                        value={batchScaleYPercent}
                        onChange={(e) => setBatchScaleYPercent(e.target.value)}
                        style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="回転 Δ">
                    <input
                        type="number"
                        value={batchRotation}
                        onChange={(e) => setBatchRotation(e.target.value)}
                        style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <Row label="不透明度 Δ%">
                    <input
                        type="number"
                        value={batchOpacityPercent}
                        onChange={(e) => setBatchOpacityPercent(e.target.value)}
                        style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                    />
                </Row>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <button
                        type="button"
                        onClick={handleApplyBatchTransform}
                        style={{ flex: 1, border: '1px solid #2c5f9e', background: '#244a79', color: '#fff', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                    >
                        選択中へ適用
                    </button>
                    <button
                        type="button"
                        onClick={resetBatchTransformInputs}
                        style={{ border: '1px solid #555', background: '#333', color: '#ddd', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                    >
                        リセット
                    </button>
                </div>
            </>
        )}

        <Row label="Name">
            <input type="text" value={selectedObject.name} onChange={(e) => handleChange('name', e.target.value)} style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee', padding: '4px' }} />
        </Row>
        
        {/* --- 基本座標 --- */}
        <SectionHeader label="Transform" />
        <Row label="X">
            <input type="number" value={selectedObject.x} onChange={(e) => handleNumericChange('x', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
        </Row>
        <Row label="Y">
            <input type="number" value={selectedObject.y} onChange={(e) => handleNumericChange('y', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
        </Row>
        <Row label="Scale X">
            <input type="number" step="0.1" value={selectedObject.scaleX ?? 1} onChange={(e) => handleNumericChange('scaleX', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
        </Row>
        <Row label="Scale Y">
            <input type="number" step="0.1" value={selectedObject.scaleY ?? 1} onChange={(e) => handleNumericChange('scaleY', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
        </Row>
        <Row label="Rotation">
            <input type="number" value={selectedObject.rotation} onChange={(e) => handleNumericChange('rotation', e.target.value)} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
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
                        style={{ background: '#2d3e50', border: '1px solid #4a5f77', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}
                    >
                        現在位置を追加
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateEndpointKeyframes}
                        style={{ background: '#2d3e50', border: '1px solid #4a5f77', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}
                    >
                        始点/終点を生成
                    </button>
                </div>
                <div style={{ border: '1px solid #333', borderRadius: '4px', padding: '8px', marginBottom: '8px', background: '#1f1f1f' }}>
                    {keyframes.length === 0 && (
                        <div style={{ fontSize: '11px', color: '#888' }}>中間点はまだありません。</div>
                    )}
                    {keyframes.map((keyframe, index) => (
                        <div key={keyframe.id} style={{ borderTop: index === 0 ? 'none' : '1px solid #333', paddingTop: index === 0 ? '0' : '8px', marginTop: index === 0 ? '0' : '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', color: '#bbb' }}>中間点 {index + 1}</span>
                                <button type="button" onClick={() => handleDeleteKeyframe(keyframe.id)} style={{ border: '1px solid #553333', background: '#3b2020', color: '#ffb0b0', borderRadius: '3px', padding: '0 6px', cursor: 'pointer' }}>削除</button>
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
                                    style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                                />
                            </Row>
                            <Row label="X">
                                <input
                                    type="number"
                                    value={keyframe.x}
                                    onChange={(e) => handleUpdateKeyframe(keyframe.id, { x: toNumberOr(e.target.value, keyframe.x) })}
                                    style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                                />
                            </Row>
                            <Row label="Y">
                                <input
                                    type="number"
                                    value={keyframe.y}
                                    onChange={(e) => handleUpdateKeyframe(keyframe.id, { y: toNumberOr(e.target.value, keyframe.y) })}
                                    style={{ width: '80px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
                                />
                            </Row>
                            <Row label="Ease">
                                <select
                                    value={keyframe.easing ?? selectedObject.easing}
                                    onChange={(e) => handleUpdateKeyframe(keyframe.id, { easing: e.target.value as EasingType })}
                                    style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}
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
                <input type="checkbox" checked={selectedObject.clipping || false} onChange={(e) => handleChange('clipping', e.target.checked)} style={{ marginRight: '6px' }} />
                <span style={{ fontSize: '11px', color: '#888' }}>Clip by object above (Layer-1)</span>
            </label>
        </Row>

        <SectionHeader label="Filter Stack" />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <button type="button" onClick={() => handleAddFilter('color_correction')} style={{ background: '#2d3e50', border: '1px solid #4a5f77', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>+ 色調補正</button>
            <button type="button" onClick={() => handleAddFilter('clipping')} style={{ background: '#2d3e50', border: '1px solid #4a5f77', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>+ クリッピング</button>
            <button type="button" onClick={() => handleAddFilter('vibration')} style={{ background: '#2d3e50', border: '1px solid #4a5f77', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>+ 振動</button>
            <button type="button" onClick={() => handleAddFilter('shadow')} style={{ background: '#2d3e50', border: '1px solid #4a5f77', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>+ 影</button>
            {canUseGradientFilter && (
                <button type="button" onClick={() => handleAddFilter('gradient')} style={{ background: '#2d3e50', border: '1px solid #4a5f77', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>+ グラデーション</button>
            )}
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
            </>
        )}
        
        {selectedObject.type === 'shape' && (
            <>
                <SectionHeader label="Shape Settings" />
                <Row label="Type">
                    <select value={selectedObject.shapeType} onChange={(e) => handleChange('shapeType', e.target.value)} style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }}>
                        <option value="rect">Rectangle</option>
                        <option value="circle">Circle</option>
                        <option value="triangle">Triangle</option>
                        <option value="star">Star</option>
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
  );
};

export default PropertyPanel;
