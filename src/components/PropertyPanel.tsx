import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { easingNames, EasingType } from '../utils/easings';
import { PsdLayerStruct, AudioObject } from '../types';
import { PsdToolBridge } from '../utils/psdToolBridge';

const FONT_FAMILIES = [
    'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New', 
    'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 
    'Trebuchet MS', 'Arial Black', 'Impact'
];

const PropertyPanel: React.FC = () => {
  const { selectedId, objects, updateObject, pushHistory } = useStore();
  const selectedObject = objects.find(obj => obj.id === selectedId);
  const [isPathMode, setIsPathMode] = useState(false);

  const audioObjects = objects.filter(o => o.type === 'audio') as AudioObject[];

  if (!selectedObject) {
    return <div style={{ padding: '20px', color: '#666', textAlign: 'center', fontSize: '12px' }}>No object selected</div>;
  }

  const handleChange = (key: string, value: any) => {
    pushHistory();
    updateObject(selectedObject.id, { [key]: value });
  };
  
  const handleDeepChange = (parentKey: string, key: string, value: any) => {
      pushHistory();
      const parent = (selectedObject as any)[parentKey] || {};
      updateObject(selectedObject.id, { [parentKey]: { ...parent, [key]: value } });
  };

  const handleLipSyncChange = (key: string, val: any) => {
      pushHistory();
      const current = selectedObject.type === 'psd' ? selectedObject.lipSync : undefined;
      const newSetting = { enabled: false, audioId: null, mapping: { a:'', i:'', u:'', e:'', o:'', n:'' }, ...current, [key]: val };
      updateObject(selectedObject.id, { lipSync: newSetting });
  };
  const handleMappingChange = (viseme: string, seq: string) => {
      pushHistory();
      const current = (selectedObject as any).lipSync || { enabled: false, audioId: null, mapping: { a:'', i:'', u:'', e:'', o:'', n:'' } };
      const newMapping = { ...current.mapping, [viseme]: seq };
      updateObject(selectedObject.id, { lipSync: { ...current, mapping: newMapping } });
  };

  const togglePathRecord = () => {
      const next = !isPathMode;
      setIsPathMode(next);
      (window as any).isPathRecordingMode = next;
      alert(next ? "Recording Mode ON: Drag the object in Viewport to record path." : "Recording Mode OFF");
  };

  const renderPsdTree = () => {
    if (selectedObject.type !== 'psd' || !selectedObject.layerTree) return null;
    const bridge = (window as any).psdBridge as PsdToolBridge;
    const handleNodeClick = (seq: string) => { if (bridge && seq) bridge.toggleNode(seq); };
    const renderNodes = (nodes: PsdLayerStruct[], depth: number = 0) => {
        return nodes.map((node, index) => {
            const uniqueKey = `${node.seq || 'noseq'}-${depth}-${index}`; const indent = depth * 12;
            if (!node.seq && (!node.children || node.children.length === 0)) return null;
            if (node.isRadio) {
                const selectedChild = node.children.find(c => c.checked);
                return (
                    <div key={uniqueKey} style={{ marginBottom: '8px', marginLeft: `${indent}px` }}>
                        <div style={{color: '#f1c40f', marginBottom: '2px', fontSize: '12px'}}>{node.name.replace(/^\*/, '')}</div>
                        <select value={selectedChild ? selectedChild.seq : ''} onChange={(e) => handleNodeClick(e.target.value)} style={{ width: '100%', background: '#333', color: '#eee', border: '1px solid #555', fontSize: '12px', padding: '4px' }}>
                            <option value="">(None)</option> {node.children.map((child, i) => (<option key={`${child.seq}-${i}`} value={child.seq}>{child.name}</option>))}
                        </select>
                    </div>
                );
            } else if (node.children && node.children.length > 0) {
                return (
                    <div key={uniqueKey}>
                        <div style={{ marginLeft: `${indent}px`, marginBottom: '4px', color: '#ccc', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                            {node.seq && (<input type="checkbox" checked={node.checked} onChange={() => handleNodeClick(node.seq)} style={{ marginRight: '6px' }} />)}
                            {node.name}
                        </div> {renderNodes(node.children, depth + 1)}
                    </div>
                );
            } else {
                if (!node.seq) return null;
                return (
                    <div key={uniqueKey} style={{ marginLeft: `${indent}px`, marginBottom: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px' }}>
                            <input type="checkbox" checked={node.checked} onChange={() => handleNodeClick(node.seq)} style={{ marginRight: '6px' }} />
                            <span style={{ color: node.checked ? '#fff' : '#999' }}>{node.name}</span>
                        </label>
                    </div>
                );
            }
        });
    };
    return (
        <div style={{ marginTop: '15px', padding: '10px', background: '#222', borderRadius: '4px', border: '1px solid #333' }}>
            <div style={{marginBottom: '10px', fontWeight: 'bold', color: '#eee', borderBottom:'1px solid #444', paddingBottom:'5px', fontSize:'12px'}}>PSD Controls</div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>{renderNodes(selectedObject.layerTree)}</div>
        </div>
    );
  };

  const renderLayerSelect = (viseme: string, label: string) => {
      if (selectedObject.type !== 'psd') return null;
      const flattenLayers: {seq: string, name: string}[] = [];
      const traverse = (nodes: any[]) => { nodes.forEach(n => { if (n.seq) flattenLayers.push({ seq: n.seq, name: n.name }); if (n.children) traverse(n.children); }); };
      traverse(selectedObject.layerTree || []);
      const currentSeq = (selectedObject.lipSync?.mapping as any)?.[viseme] || '';
      return (
          <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '12px', color: '#aaa' }}>{label}</label>
              <select value={currentSeq} onChange={(e) => handleMappingChange(viseme, e.target.value)} style={{ background: '#333', border: '1px solid #555', color: '#eee', fontSize: '11px', padding: '2px' }}>
                  <option value="">(None)</option> {flattenLayers.map(l => (<option key={l.seq} value={l.seq}>{l.name}</option>))}
              </select>
          </div>
      );
  };

  const rowStyle = { display: 'grid', gridTemplateColumns: '70px 1fr', gap: '8px', alignItems: 'center', marginBottom: '8px' };
  const labelStyle = { color: '#aaa', fontSize: '12px' };
  const inputStyle = { background: '#333', border: '1px solid #555', color: '#eee', padding: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div className="property-panel" style={{ padding: '15px', color: '#eee', fontSize: '12px' }}>
      <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #444', paddingBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>{selectedObject.name}</h3>
      <div style={rowStyle}> <label style={labelStyle}>Name</label> <input type="text" value={selectedObject.name} onChange={(e) => handleChange('name', e.target.value)} style={inputStyle}/> </div>
      <div style={{ borderBottom: '1px solid #444', margin: '12px 0' }}></div>

      {selectedObject.type === 'audio' && (
          <div style={{ marginTop: '10px', padding: '8px', background: '#333', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#4ec9b0' }}>LipSync Data</div>
              <div style={{ fontSize: '11px', color: '#ccc' }}>
                  {selectedObject.labData ? `Lab Data Loaded (${selectedObject.labData.length} phonemes)` : 'No Lab Data'}
              </div>
          </div>
      )}

      {selectedObject.type === 'psd' && (
          <div style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <input type="checkbox" checked={selectedObject.lipSync?.enabled || false} onChange={(e) => handleLipSyncChange('enabled', e.target.checked)} style={{ marginRight: '6px' }} />
                  <span style={{ fontWeight: 'bold' }}>Lip Sync</span>
              </div>
              {selectedObject.lipSync?.enabled && (
                  <div style={{ paddingLeft: '10px', borderLeft: '2px solid #555' }}>
                      <div style={{ marginBottom: '8px' }}>
                          <label style={{ display: 'block', color: '#aaa', marginBottom: '2px' }}>Audio Source</label>
                          <select value={selectedObject.lipSync.audioId || ''} onChange={(e) => handleLipSyncChange('audioId', e.target.value)} style={{ width: '100%', background: '#333', border: '1px solid #555', color: '#eee' }}>
                              <option value="">(Select Audio)</option> {audioObjects.map(a => (<option key={a.id} value={a.id}>{a.name}</option>))}
                          </select>
                      </div>
                      <div style={{ marginBottom: '4px', color: '#aaa', fontSize: '11px' }}>Layer Mapping</div>
                      {renderLayerSelect('a', 'あ')} {renderLayerSelect('i', 'い')} {renderLayerSelect('u', 'う')}
                      {renderLayerSelect('e', 'え')} {renderLayerSelect('o', 'お')} {renderLayerSelect('n', 'ん')}
                  </div>
              )}
          </div>
      )}
      
      {/* ... (Basic Transform Properties) ... */}
      {selectedObject.type !== 'audio' && (
          <>
            <div style={rowStyle}> <label style={labelStyle}>Start X</label> <input type="number" value={selectedObject.x} onChange={(e) => handleChange('x', parseFloat(e.target.value))} style={inputStyle}/> </div>
            <div style={rowStyle}> <label style={labelStyle}>Start Y</label> <input type="number" value={selectedObject.y} onChange={(e) => handleChange('y', parseFloat(e.target.value))} style={inputStyle}/> </div>
            <div style={rowStyle}> <label style={labelStyle}>Anim</label> <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}> <input type="checkbox" checked={selectedObject.enableAnimation} onChange={(e) => handleChange('enableAnimation', e.target.checked)} /> {selectedObject.enableAnimation && <span style={{fontSize: '11px', color: '#aaa'}}>Linear Move</span>} </div> </div>
            {selectedObject.enableAnimation && (
                <>
                <div style={rowStyle}> <label style={{...labelStyle, color: '#4ec9b0'}}>End X</label> <input type="number" value={selectedObject.endX} onChange={(e) => handleChange('endX', parseFloat(e.target.value))} style={inputStyle}/> </div>
                <div style={rowStyle}> <label style={{...labelStyle, color: '#4ec9b0'}}>End Y</label> <input type="number" value={selectedObject.endY} onChange={(e) => handleChange('endY', parseFloat(e.target.value))} style={inputStyle}/> </div>
                <div style={rowStyle}> <label style={{...labelStyle, color: '#f1c40f'}}>Easing</label> <select value={selectedObject.easing} onChange={(e) => handleChange('easing', e.target.value)} style={inputStyle}> {(Object.keys(easingNames) as EasingType[]).map(key => (<option key={key} value={key}>{easingNames[key]}</option>))} </select> </div>
                </>
            )}
            <div style={rowStyle}> <label style={labelStyle}>Rotate</label> <input type="number" value={selectedObject.rotation || 0} onChange={(e) => handleChange('rotation', parseFloat(e.target.value))} style={inputStyle}/> </div>
            <div style={rowStyle}> <label style={labelStyle}>Scale</label> <div style={{display:'flex', gap:'4px'}}> <input type="number" step="0.1" value={selectedObject.scaleX ?? 1} onChange={(e) => handleChange('scaleX', parseFloat(e.target.value))} style={{width:'50%', ...inputStyle}} placeholder="X"/> <input type="number" step="0.1" value={selectedObject.scaleY ?? 1} onChange={(e) => handleChange('scaleY', parseFloat(e.target.value))} style={{width:'50%', ...inputStyle}} placeholder="Y"/> </div> </div>
            <div style={rowStyle}> <label style={labelStyle}>Opacity</label> <input type="range" min="0" max="1" step="0.01" value={selectedObject.opacity ?? 1} onChange={(e) => handleChange('opacity', parseFloat(e.target.value))} style={{width:'100%'}}/> </div>
            <div style={{ borderBottom: '1px solid #444', margin: '12px 0' }}></div>
          </>
      )}
      
      {/* ... (Other Specific Properties) ... */}
      {/* Group Control */}
      {selectedObject.type === 'group_control' && ( <div style={{background:'#2a2a2a', padding:'8px', borderRadius:'4px', marginBottom:'10px', border:'1px solid #00ff00'}}> <div style={{fontWeight:'bold', marginBottom:'4px', color:'#00ff00'}}>Group Control</div> <div style={rowStyle}> <label style={labelStyle}>Layers</label> <input type="number" min="0" value={selectedObject.targetLayerCount} onChange={(e) => handleChange('targetLayerCount', parseInt(e.target.value))} title="0 for infinite" style={inputStyle}/> </div> </div> )}
      {/* Size */}
      {(selectedObject.type === 'shape' || selectedObject.type === 'image' || selectedObject.type === 'video' || selectedObject.type === 'psd') && ( <> <div style={rowStyle}> <label style={labelStyle}>Width</label> <input type="number" value={selectedObject.width} onChange={(e) => handleChange('width', parseFloat(e.target.value))} style={inputStyle}/> </div> <div style={rowStyle}> <label style={labelStyle}>Height</label> <input type="number" value={selectedObject.height} onChange={(e) => handleChange('height', parseFloat(e.target.value))} style={inputStyle}/> </div> </> )}
      {/* Shape */}
      {selectedObject.type === 'shape' && ( <> <div style={rowStyle}> <label style={labelStyle}>Type</label> <select value={selectedObject.shapeType} onChange={(e) => handleChange('shapeType', e.target.value)} style={inputStyle}> <option value="rect">Rectangle</option> <option value="circle">Circle</option> <option value="triangle">Triangle</option> <option value="star">Star</option> <option value="pentagon">Pentagon</option> </select> </div> </> )}
      {/* Gradient */}
      {selectedObject.type === 'shape' && ( <> <div style={rowStyle}> <label style={labelStyle}>Gradient</label> <input type="checkbox" checked={selectedObject.gradient?.enabled || false} onChange={(e) => handleDeepChange('gradient', 'enabled', e.target.checked)} /> </div> {selectedObject.gradient?.enabled && ( <div style={{paddingLeft:'10px', borderLeft:'2px solid #555', marginBottom:'10px'}}> <div style={rowStyle}> <label style={labelStyle}>Mode</label> <select value={selectedObject.gradient.type} onChange={(e) => handleDeepChange('gradient', 'type', e.target.value)} style={inputStyle}> <option value="linear">Linear</option> <option value="radial">Radial</option> </select> </div> <div style={rowStyle}> <label style={labelStyle}>Angle</label> <input type="number" value={selectedObject.gradient.direction || 0} onChange={(e) => handleDeepChange('gradient', 'direction', parseFloat(e.target.value))} style={inputStyle}/> </div> <div style={rowStyle}> <label style={labelStyle}>Colour 1</label> <input type="color" value={selectedObject.gradient.colours?.[0] || '#ffffff'} onChange={(e) => { const newColours = [...(selectedObject.gradient?.colours || ['#fff', '#000'])]; newColours[0] = e.target.value; handleDeepChange('gradient', 'colours', newColours); }} style={{width:'100%', border:'none', height:'24px', padding:0}}/> </div> <div style={rowStyle}> <label style={labelStyle}>Colour 2</label> <input type="color" value={selectedObject.gradient.colours?.[1] || '#000000'} onChange={(e) => { const newColours = [...(selectedObject.gradient?.colours || ['#fff', '#000'])]; newColours[1] = e.target.value; handleDeepChange('gradient', 'colours', newColours); }} style={{width:'100%', border:'none', height:'24px', padding:0}}/> </div> </div> )} </> )}
      {/* Shape Colour */}
      {selectedObject.type === 'shape' && !selectedObject.gradient?.enabled && ( <div style={rowStyle}> <label style={labelStyle}>Colour</label> <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} style={{width: '100%', height: '24px', padding:0, border:'none'}}/> </div> )}
      {/* PSD Scale */}
      {selectedObject.type === 'psd' && ( <div style={rowStyle}> <label style={labelStyle}>Scale</label> <input type="number" step="0.1" value={selectedObject.scale} onChange={(e) => handleChange('scale', parseFloat(e.target.value))} style={inputStyle} /> </div> )}
      {/* Audio/Video */}
      {(selectedObject.type === 'video' || selectedObject.type === 'audio') && ( <> <div style={rowStyle}> <label style={labelStyle}>Volume</label> <input type="range" min="0" max="1" step="0.1" value={selectedObject.volume} onChange={(e) => handleChange('volume', parseFloat(e.target.value))} style={{width:'100%'}} /> </div> <div style={rowStyle}> <label style={labelStyle}>Muted</label> <input type="checkbox" checked={selectedObject.muted} onChange={(e) => handleChange('muted', e.target.checked)} /> </div> </> )}
      {/* Text */}
      {selectedObject.type === 'text' && ( <> <div style={rowStyle}> <label style={labelStyle}>Text</label> <textarea rows={3} value={selectedObject.text} onChange={(e) => handleChange('text', e.target.value)} style={inputStyle}/> </div> <div style={rowStyle}> <label style={labelStyle}>Font</label> <select value={selectedObject.fontFamily} onChange={(e) => handleChange('fontFamily', e.target.value)} style={inputStyle}> {FONT_FAMILIES.map(font => <option key={font} value={font}>{font}</option>)} </select> </div> <div style={rowStyle}> <label style={labelStyle}>Size</label> <input type="number" value={selectedObject.fontSize} onChange={(e) => handleChange('fontSize', parseFloat(e.target.value))} style={inputStyle}/> </div> <div style={rowStyle}> <label style={labelStyle}>Colour</label> <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} style={{width: '100%', height: '24px', padding:0, border:'none'}}/> </div> </> )}
      {/* Shadow */}
      {selectedObject.type !== 'audio' && selectedObject.type !== 'group_control' && ( <> <div style={{ borderBottom: '1px solid #444', margin: '12px 0' }}></div> <div style={rowStyle}> <label style={labelStyle}>Shadow</label> <input type="checkbox" checked={selectedObject.shadow?.enabled || false} onChange={(e) => handleDeepChange('shadow', 'enabled', e.target.checked)} /> </div> {selectedObject.shadow?.enabled && ( <div style={{paddingLeft:'10px', borderLeft:'2px solid #555', marginBottom:'10px'}}> <div style={rowStyle}> <label style={labelStyle}>Colour</label> <input type="color" value={selectedObject.shadow.colour || '#000000'} onChange={(e) => handleDeepChange('shadow', 'colour', e.target.value)} style={{width: '100%', height: '24px', padding:0, border:'none'}}/> </div> <div style={rowStyle}> <label style={labelStyle}>Blur</label> <input type="number" value={selectedObject.shadow.blur || 0} onChange={(e) => handleDeepChange('shadow', 'blur', parseFloat(e.target.value))} style={inputStyle}/> </div> <div style={rowStyle}> <label style={labelStyle}>Offset</label> <div style={{display:'flex', gap:'4px'}}> <input type="number" value={selectedObject.shadow.offsetX || 0} onChange={(e) => handleDeepChange('shadow', 'offsetX', parseFloat(e.target.value))} style={{width:'50%', ...inputStyle}} placeholder="X"/> <input type="number" value={selectedObject.shadow.offsetY || 0} onChange={(e) => handleDeepChange('shadow', 'offsetY', parseFloat(e.target.value))} style={{width:'50%', ...inputStyle}} placeholder="Y"/> </div> </div> <div style={rowStyle}> <label style={labelStyle}>Opacity</label> <input type="range" min="0" max="1" step="0.1" value={selectedObject.shadow.opacity ?? 0.5} onChange={(e) => handleDeepChange('shadow', 'opacity', parseFloat(e.target.value))} style={{width:'100%'}}/> </div> </div> )} </> )}
      {/* Path Record */}
      {selectedObject.type !== 'audio' && selectedObject.type !== 'group_control' && ( <div style={{marginTop:'15px', borderTop:'1px solid #444', paddingTop:'10px'}}> <button onClick={togglePathRecord} style={{width:'100%', background: isPathMode ? '#e74c3c' : '#444', color:'white', border:'none', padding:'8px', cursor:'pointer', borderRadius:'4px'}}> {isPathMode ? '● Recording Path...' : '○ Record Motion Path'} </button> {selectedObject.motionPath && ( <div style={{fontSize:'10px', color:'#aaa', marginTop:'4px', textAlign:'center'}}> Path data: {selectedObject.motionPath.length} points <button onClick={() => handleChange('motionPath', undefined)} style={{marginLeft:'8px', fontSize:'9px', background:'#333', border:'1px solid #555', color:'#ccc', padding:'2px 6px'}}>Clear</button> </div> )} </div> )}

      {renderPsdTree()}
      <div style={{ marginTop: '20px', borderTop: '1px solid #444', paddingTop: '10px', fontSize: '11px', color: '#666' }}> Time: {selectedObject.startTime.toFixed(2)} - {(selectedObject.startTime + selectedObject.duration).toFixed(2)} </div>
    </div>
  );
};
export default PropertyPanel;