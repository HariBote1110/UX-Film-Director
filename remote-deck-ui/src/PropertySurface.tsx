import React, { useRef, useState } from 'react';
import { computeSliderValue, createSendThrottle } from '../../shared/remoteDeckSlider';

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

export interface SelectionContext {
  objectId: string | null;
  objectType: string | null;
  properties: SurfaceProperty[];
}

const SEND_INTERVAL_MS = 33; // ~30Hz while dragging

const TouchSlider: React.FC<{
  property: NumberProperty;
  onChange: (key: string, value: number) => void;
  onCommit: (key: string, value: number) => void;
}> = ({ property, onChange, onCommit }) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startValue: number;
    startX: number;
    startY: number;
    throttle: ReturnType<typeof createSendThrottle>;
    lastValue: number;
  } | null>(null);
  const [displayValue, setDisplayValue] = useState<number | null>(null);

  const value = displayValue ?? property.value;
  const ratio = (value - property.min) / (property.max - property.min);

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
    const track = trackRef.current;
    if (!drag || !track) return;
    const next = computeSliderValue({
      startValue: drag.startValue,
      deltaX: event.clientX - drag.startX,
      trackWidth: track.clientWidth,
      min: property.min,
      max: property.max,
      step: property.step,
      // 縦方向に指を離すほど微調整（TouchBar 風の高精度モード）
      verticalOffset: event.clientY - drag.startY,
    });
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

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ opacity: 0.75 }}>{property.label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(2)}</span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'relative',
          height: 44,
          borderRadius: 10,
          background: '#1c1c1c',
          border: '1px solid #333',
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
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
      {context.properties.length === 0 && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          このオブジェクトにはリモート操作可能なプロパティがありません。
        </div>
      )}
      {context.properties.map((property) =>
        property.kind === 'number' ? (
          <TouchSlider
            key={property.key}
            property={property}
            onChange={setProperty}
            onCommit={setProperty}
          />
        ) : (
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
        ),
      )}
    </div>
  );
};
