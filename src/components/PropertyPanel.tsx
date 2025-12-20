import React from 'react';
import { useStore } from '../store/useStore';
import { easingNames, EasingType } from '../utils/easings';
import { PsdLayerStruct } from '../types';
import { PsdToolBridge } from '../utils/psdToolBridge';

const FONT_FAMILIES = [
    'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New', 
    'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 
    'Trebuchet MS', 'Arial Black', 'Impact'
];

const PropertyPanel: React.FC = () => {
  const { selectedId, objects, updateObject, pushHistory } = useStore();
  const selectedObject = objects.find(obj => obj.id === selectedId);

  if (!selectedObject) {
    return <div style={{ padding: '20px', color: '#666', textAlign: 'center', fontSize: '12px' }}>No object selected</div>;
  }

  const handleChange = (key: string, value: any) => {
    // 変更前に履歴を保存
    pushHistory();
    updateObject(selectedObject.id, { [key]: value });
  };

  // --- PSD Controls ---
  const renderPsdTree = () => {
    if (selectedObject.type !== 'psd' || !selectedObject.layerTree) return null;
    const bridge = (window as any).psdBridge as PsdToolBridge;
    const handleNodeClick = (seq: string) => {
        if (bridge && seq) bridge.toggleNode(seq);
    };

    const renderNodes = (nodes: PsdLayerStruct[], depth: number = 0) => {
        return nodes.map((node, index) => {
            const uniqueKey = `${node.seq || 'noseq'}-${depth}-${index}`;
            const indent = depth * 12;

            if (!node.seq && (!node.children || node.children.length === 0)) return null;

            if (node.isRadio) {
                const selectedChild = node.children.find(c => c.checked);
                return (
                    <div key={uniqueKey} style={{ marginBottom: '8px', marginLeft: `${indent}px` }}>
                        <div style={{color: '#f1c40f', marginBottom: '2px', fontSize: '12px'}}>
                            {node.name.replace(/^\*/, '')}
                        </div>
                        <select 
                            value={selectedChild ? selectedChild.seq : ''}
                            onChange={(e) => handleNodeClick(e.target.value)}
                            style={{ width: '100%', background: '#333', color: '#eee', border: '1px solid #555', fontSize: '12px', padding: '4px' }}
                        >
                            <option value="">(None)</option>
                            {node.children.map((child, i) => (
                                <option key={`${child.seq}-${i}`} value={child.seq}>
                                    {child.name}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            } else if (node.children && node.children.length > 0) {
                return (
                    <div key={uniqueKey}>
                        <div style={{ 
                            marginLeft: `${indent}px`, 
                            marginBottom: '4px', 
                            color: '#ccc', 
                            fontSize: '12px', 
                            fontWeight: 'bold',
                            display: 'flex', alignItems: 'center'
                        }}>
                            {node.seq && (
                                <input 
                                    type="checkbox" 
                                    checked={node.checked} 
                                    onChange={() => handleNodeClick(node.seq)}
                                    style={{ marginRight: '6px' }}
                                />
                            )}
                            {node.name}
                        </div>
                        {renderNodes(node.children, depth + 1)}
                    </div>
                );
            } else {
                if (!node.seq) return null;
                return (
                    <div key={uniqueKey} style={{ marginLeft: `${indent}px`, marginBottom: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px' }}>
                            <input 
                                type="checkbox" 
                                checked={node.checked} 
                                onChange={() => handleNodeClick(node.seq)}
                                style={{ marginRight: '6px' }} 
                            />
                            <span style={{ color: node.checked ? '#fff' : '#999' }}>{node.name}</span>
                        </label>
                    </div>
                );
            }
        });
    };

    return (
        <div style={{ marginTop: '15px', padding: '10px', background: '#222', borderRadius: '4px', border: '1px solid #333' }}>
            <div style={{marginBottom: '10px', fontWeight: 'bold', color: '#eee', borderBottom:'1px solid #444', paddingBottom:'5px', fontSize:'12px'}}>
                PSD Controls
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {renderNodes(selectedObject.layerTree)}
            </div>
        </div>
    );
  };

  // 共通スタイル定義
  const rowStyle = { display: 'grid', gridTemplateColumns: '70px 1fr', gap: '8px', alignItems: 'center', marginBottom: '8px' };
  const labelStyle = { color: '#aaa', fontSize: '12px' };
  const inputStyle = { background: '#333', border: '1px solid #555', color: '#eee', padding: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div className="property-panel" style={{ padding: '15px', color: '#eee', fontSize: '12px' }}>
      <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #444', paddingBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
          {selectedObject.name}
      </h3>

      {/* Basic Props */}
      <div style={rowStyle}>
        <label style={labelStyle}>Name</label>
        <input type="text" value={selectedObject.name} onChange={(e) => handleChange('name', e.target.value)} style={inputStyle}/>
      </div>

      <div style={{ borderBottom: '1px solid #444', margin: '12px 0' }}></div>
      
      {/* Audio does not have position */}
      {selectedObject.type !== 'audio' && (
          <>
            <div style={rowStyle}>
                <label style={labelStyle}>Start X</label>
                <input type="number" value={selectedObject.x} onChange={(e) => handleChange('x', parseFloat(e.target.value))} style={inputStyle}/>
            </div>
            <div style={rowStyle}>
                <label style={labelStyle}>Start Y</label>
                <input type="number" value={selectedObject.y} onChange={(e) => handleChange('y', parseFloat(e.target.value))} style={inputStyle}/>
            </div>

            <div style={rowStyle}>
                <label style={labelStyle}>Anim</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input 
                    type="checkbox" 
                    checked={selectedObject.enableAnimation} 
                    onChange={(e) => handleChange('enableAnimation', e.target.checked)} 
                    />
                    {selectedObject.enableAnimation && <span style={{fontSize: '11px', color: '#aaa'}}>Enable Linear Move</span>}
                </div>
            </div>

            {selectedObject.enableAnimation && (
                <>
                <div style={rowStyle}>
                    <label style={{...labelStyle, color: '#4ec9b0'}}>End X</label>
                    <input type="number" value={selectedObject.endX} onChange={(e) => handleChange('endX', parseFloat(e.target.value))} style={inputStyle}/>
                </div>
                <div style={rowStyle}>
                    <label style={{...labelStyle, color: '#4ec9b0'}}>End Y</label>
                    <input type="number" value={selectedObject.endY} onChange={(e) => handleChange('endY', parseFloat(e.target.value))} style={inputStyle}/>
                </div>
                <div style={rowStyle}>
                    <label style={{...labelStyle, color: '#f1c40f'}}>Easing</label>
                    <select 
                        value={selectedObject.easing} 
                        onChange={(e) => handleChange('easing', e.target.value)}
                        style={inputStyle}
                    >
                        {(Object.keys(easingNames) as EasingType[]).map(key => (
                            <option key={key} value={key}>{easingNames[key]}</option>
                        ))}
                    </select>
                </div>
                </>
            )}
            <div style={{ borderBottom: '1px solid #444', margin: '12px 0' }}></div>
          </>
      )}

      {/* Specific Props */}
      {(selectedObject.type === 'shape' || selectedObject.type === 'image' || selectedObject.type === 'video' || selectedObject.type === 'psd') && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>Width</label>
            <input type="number" value={selectedObject.width} onChange={(e) => handleChange('width', parseFloat(e.target.value))} style={inputStyle}/>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Height</label>
            <input type="number" value={selectedObject.height} onChange={(e) => handleChange('height', parseFloat(e.target.value))} style={inputStyle}/>
          </div>
        </>
      )}
      
      {selectedObject.type === 'psd' && (
          <div style={rowStyle}>
            <label style={labelStyle}>Scale</label>
            <input type="number" step="0.1" value={selectedObject.scale} onChange={(e) => handleChange('scale', parseFloat(e.target.value))} style={inputStyle} />
          </div>
      )}

      {(selectedObject.type === 'video' || selectedObject.type === 'audio') && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>Volume</label>
            <input type="range" min="0" max="1" step="0.1" value={selectedObject.volume} onChange={(e) => handleChange('volume', parseFloat(e.target.value))} style={{width:'100%'}} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Muted</label>
            <input type="checkbox" checked={selectedObject.muted} onChange={(e) => handleChange('muted', e.target.checked)} />
          </div>
        </>
      )}

      {selectedObject.type === 'text' && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>Text</label>
            <textarea rows={3} value={selectedObject.text} onChange={(e) => handleChange('text', e.target.value)} style={inputStyle}/>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Font</label>
            <select value={selectedObject.fontFamily} onChange={(e) => handleChange('fontFamily', e.target.value)} style={inputStyle}>
                {FONT_FAMILIES.map(font => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Size</label>
            <input type="number" value={selectedObject.fontSize} onChange={(e) => handleChange('fontSize', parseFloat(e.target.value))} style={inputStyle}/>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Color</label>
            <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} style={{width: '100%', height: '24px', padding:0, border:'none'}}/>
          </div>
        </>
      )}

      {selectedObject.type === 'shape' && (
         <div style={rowStyle}>
            <label style={labelStyle}>Color</label>
            <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} style={{width: '100%', height: '24px', padding:0, border:'none'}}/>
         </div>
      )}

      {/* PSD Tree View */}
      {renderPsdTree()}

      <div style={{ marginTop: '20px', borderTop: '1px solid #444', paddingTop: '10px', fontSize: '11px', color: '#666' }}>
            Time: {selectedObject.startTime.toFixed(2)} - {(selectedObject.startTime + selectedObject.duration).toFixed(2)}
      </div>
    </div>
  );
};
export default PropertyPanel;