import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject, AudioVisualizationObject, ColorCorrection, Vibration, ClippingParams, PsdLayerStruct, PsdObject } from '../types';

const PropertyPanel: React.FC = () => {
  const selectedObject = useStore((state) => state.objects.find(obj => obj.id === state.selectedId));
  const updateObject = useStore((state) => state.updateObject);
  const [isRefreshingPsdTree, setIsRefreshingPsdTree] = useState(false);

  if (!selectedObject) {
    return (
      <div className="property-panel" style={{ width: '300px', background: '#252526', borderLeft: '1px solid #111', padding: '10px', color: '#ccc' }}>
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

  // Helper for Nested Objects
  const handleColorCorrectionChange = (key: keyof ColorCorrection, value: any) => {
      const current = selectedObject.colorCorrection || { enabled: false, brightness: 1, contrast: 1, saturation: 1, hue: 0 };
      updateObject(selectedObject.id, {
          colorCorrection: { ...current, [key]: value }
      });
  };

  const handleVibrationChange = (key: keyof Vibration, value: any) => {
      const current = selectedObject.vibration || { enabled: false, strength: 0, speed: 1 };
      updateObject(selectedObject.id, {
          vibration: { ...current, [key]: value }
      });
  };

  const handleClippingChange = (key: keyof ClippingParams, value: any) => {
      const current = selectedObject.customClipping || { enabled: false, top: 0, bottom: 0, left: 0, right: 0, angle: 0, radius: 0 };
      updateObject(selectedObject.id, {
          customClipping: { ...current, [key]: value }
      });
  };

  const toggleTreeNodeChecked = (nodes: PsdLayerStruct[], seq: string): PsdLayerStruct[] => {
      return nodes.map((node) => {
          const nextChildren = toggleTreeNodeChecked(node.children || [], seq);
          if (node.seq === seq) {
              return { ...node, checked: !node.checked, children: nextChildren };
          }
          return { ...node, children: nextChildren };
      });
  };

  const handlePsdLayerToggle = async (seq: string | null) => {
      if (!seq || selectedObject.type !== 'psd') return;

      const psdObject = selectedObject as PsdObject;
      const currentTree = psdObject.layerTree || [];

      // Optimistic update to make UI responsive even before bridge sync.
      updateObject(psdObject.id, { layerTree: toggleTreeNodeChecked(currentTree, seq) });

      const bridge = (window as any).psdBridge;
      if (!bridge || typeof bridge.toggleNode !== 'function') return;

      try {
          await bridge.toggleNode(seq);
          if (typeof bridge.requestImmediateSync === 'function') {
              await bridge.requestImmediateSync(true);
          }
      } catch (e) {
          console.error('Failed to toggle PSD layer:', e);
      }
  };

  const handleRefreshPsdTree = async () => {
      if (selectedObject.type !== 'psd') return;
      const bridge = (window as any).psdBridge;
      if (!bridge) return;

      try {
          setIsRefreshingPsdTree(true);
          if (typeof bridge.requestImmediateSync === 'function') {
              await bridge.requestImmediateSync(true);
              return;
          }

          if (typeof bridge.getLayerTree === 'function') {
              const tree = await bridge.getLayerTree();
              updateObject(selectedObject.id, { layerTree: tree });
          }
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

  return (
    <div className="property-panel" style={{ width: '300px', height: '100%', background: '#252526', borderLeft: '1px solid #111', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid #333', background: '#333', fontWeight: 'bold' }}>
        Property: {selectedObject.name}
      </div>
      
      <div style={{ padding: '10px' }}>
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
            <input type="range" min="0" max="1" step="0.01" value={selectedObject.opacity} onChange={(e) => handleNumericChange('opacity', e.target.value)} style={{ width: '100%' }} />
        </Row>

        {/* --- 合成設定 (マスク) --- */}
        <SectionHeader label="Composition" />
        <Row label="Masking">
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedObject.clipping || false} onChange={(e) => handleChange('clipping', e.target.checked)} style={{ marginRight: '6px' }} />
                <span style={{ fontSize: '11px', color: '#888' }}>Clip by object above (Layer-1)</span>
            </label>
        </Row>

        {/* --- 新機能: クリッピングエフェクト (フィルタ) --- */}
        <SectionHeader label="Clipping Effect" />
        <Row label="Enable">
            <input type="checkbox" checked={selectedObject.customClipping?.enabled || false} onChange={(e) => handleClippingChange('enabled', e.target.checked)} />
        </Row>
        {selectedObject.customClipping?.enabled && (
            <>
                <Row label="Top">
                    <input type="number" value={selectedObject.customClipping.top} onChange={(e) => handleClippingChange('top', parseFloat(e.target.value))} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Bottom">
                    <input type="number" value={selectedObject.customClipping.bottom} onChange={(e) => handleClippingChange('bottom', parseFloat(e.target.value))} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Left">
                    <input type="number" value={selectedObject.customClipping.left} onChange={(e) => handleClippingChange('left', parseFloat(e.target.value))} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Right">
                    <input type="number" value={selectedObject.customClipping.right} onChange={(e) => handleClippingChange('right', parseFloat(e.target.value))} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Angle">
                    <input type="number" value={selectedObject.customClipping.angle} onChange={(e) => handleClippingChange('angle', parseFloat(e.target.value))} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
            </>
        )}

        {/* --- 色調補正 --- */}
        {(selectedObject.type === 'image' || selectedObject.type === 'video' || selectedObject.type === 'psd' || selectedObject.type === 'shape') && (
            <>
                <SectionHeader label="Color Correction" />
                <Row label="Enable">
                    <input type="checkbox" checked={selectedObject.colorCorrection?.enabled || false} onChange={(e) => handleColorCorrectionChange('enabled', e.target.checked)} />
                </Row>
                {selectedObject.colorCorrection?.enabled && (
                    <>
                        <Row label="Brightness">
                            <input type="range" min="0" max="2" step="0.1" value={selectedObject.colorCorrection.brightness} onChange={(e) => handleColorCorrectionChange('brightness', parseFloat(e.target.value))} style={{ width: '100%' }} />
                        </Row>
                        <Row label="Contrast">
                            <input type="range" min="0" max="2" step="0.1" value={selectedObject.colorCorrection.contrast} onChange={(e) => handleColorCorrectionChange('contrast', parseFloat(e.target.value))} style={{ width: '100%' }} />
                        </Row>
                        <Row label="Saturation">
                            <input type="range" min="-1" max="1" step="0.1" value={selectedObject.colorCorrection.saturation} onChange={(e) => handleColorCorrectionChange('saturation', parseFloat(e.target.value))} style={{ width: '100%' }} />
                        </Row>
                        <Row label="Hue">
                            <input type="range" min="0" max="360" step="1" value={selectedObject.colorCorrection.hue} onChange={(e) => handleColorCorrectionChange('hue', parseFloat(e.target.value))} style={{ width: '100%' }} />
                        </Row>
                    </>
                )}
            </>
        )}

        {/* --- 振動 --- */}
        <SectionHeader label="Vibration" />
        <Row label="Enable">
            <input type="checkbox" checked={selectedObject.vibration?.enabled || false} onChange={(e) => handleVibrationChange('enabled', e.target.checked)} />
        </Row>
        {selectedObject.vibration?.enabled && (
            <>
                <Row label="Strength">
                    <input type="number" value={selectedObject.vibration.strength} onChange={(e) => handleVibrationChange('strength', parseFloat(e.target.value))} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
                </Row>
                <Row label="Speed">
                    <input type="number" value={selectedObject.vibration.speed} onChange={(e) => handleVibrationChange('speed', parseFloat(e.target.value))} style={{ width: '60px', background: '#1e1e1e', border: '1px solid #444', color: '#eee' }} />
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
                <Row label="Color">
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
                <Row label="Color">
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
                <Row label="Color">
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
                        通常は即時反映されます。遅い場合は Reload Layers を押してください。
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
