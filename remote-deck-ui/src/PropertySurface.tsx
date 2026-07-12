import React, { useRef, useState } from 'react';
import {
  computeRelativeDragValue,
  computeSliderValue,
  createSendThrottle,
} from '../../shared/remoteDeckSlider';

interface NumberProperty {
  key: string;
  label: string;
  kind: 'number';
  value: number;
  min: number;
  max: number;
  step: number;
}

interface EnumProperty {
  key: string;
  label: string;
  kind: 'enum';
  value: string | null;
  options: Array<{ value: string; label: string }>;
}

export type SurfaceProperty = NumberProperty | EnumProperty;

export interface PsdTreeNode {
  id: string;
  label: string;
  isGroup: boolean;
  isRadio: boolean;
  visible: boolean;
  children: PsdTreeNode[];
}

export interface SelectionContext {
  objectId: string | null;
  objectType: string | null;
  properties: SurfaceProperty[];
  psdLayerTree?: PsdTreeNode[];
}

const SEND_INTERVAL_MS = 33; // ~30Hz while dragging

/** x/y are edited by relative (infinite) drag instead of an absolute track. */
const RELATIVE_DRAG_KEYS = new Set(['x', 'y']);
const RELATIVE_DRAG_UNIT_PER_PX = 2;

interface DragState {
  startValue: number;
  startX: number;
  startY: number;
  throttle: ReturnType<typeof createSendThrottle>;
  lastValue: number;
}

const useDragControl = (
  property: NumberProperty,
  computeValue: (drag: DragState, event: React.PointerEvent, trackWidth: number) => number,
  onChange: (key: string, value: number) => void,
  onCommit: (key: string, value: number) => void,
) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [displayValue, setDisplayValue] = useState<number | null>(null);

  const handlePointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startValue: property.value,
      startX: event.clientX,
      startY: event.clientY,
      throttle: createSendThrottle({ intervalMs: SEND_INTERVAL_MS }),
      lastValue: property.value,
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = computeValue(drag, event, trackRef.current?.clientWidth ?? 300);
    drag.lastValue = next;
    setDisplayValue(next);
    const offered = drag.throttle.offer(next);
    if (offered !== null) onChange(property.key, offered);
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDisplayValue(null);
    // 指を離した時点の確定値を必ず送る
    onCommit(property.key, drag.lastValue);
  };

  return {
    trackRef,
    value: displayValue ?? property.value,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
};

const controlShellStyle: React.CSSProperties = {
  position: 'relative',
  height: 44,
  borderRadius: 10,
  background: '#1c1c1c',
  border: '1px solid #333',
  overflow: 'hidden',
  touchAction: 'none',
};

const formatValue = (property: NumberProperty, value: number): string => {
  if (property.key === 'rotation') return `${value.toFixed(0)}°`;
  if (property.step >= 1) return value.toFixed(0);
  return value.toFixed(2);
};

const TouchSlider: React.FC<{
  property: NumberProperty;
  onChange: (key: string, value: number) => void;
  onCommit: (key: string, value: number) => void;
}> = ({ property, onChange, onCommit }) => {
  const { trackRef, value, handlers } = useDragControl(
    property,
    (drag, event, trackWidth) =>
      computeSliderValue({
        startValue: drag.startValue,
        deltaX: event.clientX - drag.startX,
        trackWidth,
        min: property.min,
        max: property.max,
        step: property.step,
        // 縦方向に指を離すほど微調整（TouchBar 風の高精度モード）
        verticalOffset: event.clientY - drag.startY,
      }),
    onChange,
    onCommit,
  );
  const ratio = (value - property.min) / (property.max - property.min);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ opacity: 0.75 }}>{property.label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(property, value)}</span>
      </div>
      <div ref={trackRef} {...handlers} style={controlShellStyle}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
            background: '#2f5f8f',
          }}
        />
      </div>
    </div>
  );
};

/** Infinite horizontal drag for unbounded values (x/y position). */
const RelativeDragControl: React.FC<{
  property: NumberProperty;
  onChange: (key: string, value: number) => void;
  onCommit: (key: string, value: number) => void;
}> = ({ property, onChange, onCommit }) => {
  const { trackRef, value, handlers } = useDragControl(
    property,
    (drag, event) =>
      computeRelativeDragValue({
        startValue: drag.startValue,
        deltaX: event.clientX - drag.startX,
        unitPerPx: RELATIVE_DRAG_UNIT_PER_PX,
        verticalOffset: event.clientY - drag.startY,
        min: property.min,
        max: property.max,
        step: property.step,
      }),
    onChange,
    onCommit,
  );

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ opacity: 0.75 }}>{property.label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(property, value)}</span>
      </div>
      <div
        ref={trackRef}
        {...handlers}
        style={{
          ...controlShellStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: '#777',
          letterSpacing: 2,
        }}
      >
        ◂ ドラッグで移動 ▸
      </div>
    </div>
  );
};

const PsdLayerTree: React.FC<{
  nodes: PsdTreeNode[];
  depth?: number;
  onToggle: (layerId: string) => void;
}> = ({ nodes, depth = 0, onToggle }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div>
      {nodes.map((node) => (
        <div key={node.id} style={{ marginLeft: depth * 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {node.isGroup && node.children.length > 0 && (
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }))}
                style={{
                  width: 26,
                  height: 34,
                  border: 'none',
                  background: 'transparent',
                  color: '#888',
                  fontSize: 12,
                }}
              >
                {collapsed[node.id] ? '▸' : '▾'}
              </button>
            )}
            <button
              onClick={() => {
                if (!node.isGroup) onToggle(node.id);
              }}
              disabled={node.isGroup}
              style={{
                flex: 1,
                minHeight: 38,
                textAlign: 'left',
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid #333',
                background: node.isGroup ? 'transparent' : node.visible ? '#2f5f8f' : '#1c1c1c',
                color: node.isGroup ? '#9aa' : node.visible ? '#fff' : '#777',
                fontSize: 13,
              }}
            >
              {node.isGroup ? `${node.label}${node.isRadio ? '（排他）' : ''}` : node.label}
            </button>
          </div>
          {node.isGroup && !collapsed[node.id] && node.children.length > 0 && (
            <PsdLayerTree nodes={node.children} depth={depth + 1} onToggle={onToggle} />
          )}
        </div>
      ))}
    </div>
  );
};

export const PropertySurface: React.FC<{
  context: SelectionContext;
  sendCommand: (id: string, payload?: unknown) => boolean;
}> = ({ context, sendCommand }) => {
  const setProperty = (propertyKey: string, value: unknown) => {
    sendCommand('property.set', { objectId: context.objectId, propertyKey, value });
  };

  return (
    <div style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
        選択中: {context.objectType}
      </div>
      {context.properties.length === 0 && !context.psdLayerTree && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          このオブジェクトにはリモート操作可能なプロパティがありません。
        </div>
      )}
      {context.properties.map((property) => {
        if (property.kind === 'number') {
          return RELATIVE_DRAG_KEYS.has(property.key) ? (
            <RelativeDragControl
              key={property.key}
              property={property}
              onChange={setProperty}
              onCommit={setProperty}
            />
          ) : (
            <TouchSlider
              key={property.key}
              property={property}
              onChange={setProperty}
              onCommit={setProperty}
            />
          );
        }
        return (
          <div key={property.key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{property.label}</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {property.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setProperty(property.key, option.value)}
                  style={{
                    flex: '0 0 auto',
                    minWidth: 88,
                    minHeight: 52,
                    borderRadius: 10,
                    border: '1px solid #333',
                    background: option.value === property.value ? '#2f5f8f' : '#1c1c1c',
                    color: '#eee',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {context.psdLayerTree && context.psdLayerTree.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>レイヤー</div>
          <PsdLayerTree
            nodes={context.psdLayerTree}
            onToggle={(layerId) => setProperty('psdLayer', layerId)}
          />
        </div>
      )}
    </div>
  );
};
