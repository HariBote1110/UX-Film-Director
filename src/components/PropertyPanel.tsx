import React from 'react';
import { useStore } from '../store/useStore';
import { easingNames, EasingType } from '../utils/easings';

const PropertyPanel: React.FC = () => {
  const { selectedId, objects, updateObject } = useStore();
  const selectedObject = objects.find(obj => obj.id === selectedId);

  if (!selectedObject) {
    return <div style={{ padding: '20px', color: '#666', textAlign: 'center' }}>No object selected</div>;
  }

  const handleChange = (key: string, value: any) => {
    updateObject(selectedObject.id, { [key]: value });
  };

  return (
    <div className="property-panel" style={{ padding: '10px', color: '#eee', fontSize: '12px' }}>
      <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px' }}>{selectedObject.name}</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px', alignItems: 'center' }}>
        <label>Name</label>
        <input type="text" value={selectedObject.name} onChange={(e) => handleChange('name', e.target.value)}/>

        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #444', margin: '5px 0' }}></div>
        
        {/* Pos */}
        <label><strong>Start X</strong></label>
        <input type="number" value={selectedObject.x} onChange={(e) => handleChange('x', parseFloat(e.target.value))}/>
        <label><strong>Start Y</strong></label>
        <input type="number" value={selectedObject.y} onChange={(e) => handleChange('y', parseFloat(e.target.value))}/>

        {/* Animation */}
        <label>Linear Move</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" checked={selectedObject.enableAnimation} onChange={(e) => handleChange('enableAnimation', e.target.checked)} style={{ width: 'auto' }}/>
            {selectedObject.enableAnimation && <span style={{fontSize: '10px', color: '#aaa'}}>Enable</span>}
        </div>

        {selectedObject.enableAnimation && (
          <>
            <label style={{ color: '#4ec9b0' }}>End X</label>
            <input type="number" value={selectedObject.endX} onChange={(e) => handleChange('endX', parseFloat(e.target.value))}/>
            <label style={{ color: '#4ec9b0' }}>End Y</label>
            <input type="number" value={selectedObject.endY} onChange={(e) => handleChange('endY', parseFloat(e.target.value))}/>
            
            <label style={{ color: '#f1c40f' }}>Easing</label>
            <select value={selectedObject.easing} onChange={(e) => handleChange('easing', e.target.value)} style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '2px' }}>
                {(Object.keys(easingNames) as EasingType[]).map(key => (<option key={key} value={key}>{easingNames[key]}</option>))}
            </select>
          </>
        )}

        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #444', margin: '5px 0' }}></div>

        {/* --- Specific Properties --- */}
        {(selectedObject.type === 'shape' || selectedObject.type === 'image' || selectedObject.type === 'video') && (
          <>
            <label>Width</label>
            <input type="number" value={selectedObject.width} onChange={(e) => handleChange('width', parseFloat(e.target.value))}/>
            <label>Height</label>
            <input type="number" value={selectedObject.height} onChange={(e) => handleChange('height', parseFloat(e.target.value))}/>
          </>
        )}
        
        {/* Video Specific */}
        {selectedObject.type === 'video' && (
          <>
            <label>Volume</label>
            <input type="range" min="0" max="1" step="0.1" value={selectedObject.volume} onChange={(e) => handleChange('volume', parseFloat(e.target.value))} />
            <label>Muted</label>
            <input type="checkbox" checked={selectedObject.muted} onChange={(e) => handleChange('muted', e.target.checked)} style={{ width: 'auto' }} />
          </>
        )}

        {selectedObject.type === 'text' && (
          <>
            <label>Text</label>
            <textarea rows={3} value={selectedObject.text} onChange={(e) => handleChange('text', e.target.value)}/>
            <label>Font Size</label>
            <input type="number" value={selectedObject.fontSize} onChange={(e) => handleChange('fontSize', parseFloat(e.target.value))}/>
            <label>Fill Color</label>
            <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} style={{ width: '100%', height: '30px' }}/>
          </>
        )}

        {selectedObject.type === 'shape' && (
           <>
            <label>Fill Color</label>
            <input type="color" value={selectedObject.fill} onChange={(e) => handleChange('fill', e.target.value)} style={{ width: '100%', height: '30px' }}/>
           </>
        )}
        
        <div style={{ gridColumn: '1 / -1', marginTop: '10px', borderTop: '1px solid #444', paddingTop: '10px' }}>
            Layer: {selectedObject.layer + 1}<br/>
            Time: {selectedObject.startTime.toFixed(2)}s - {(selectedObject.startTime + selectedObject.duration).toFixed(2)}s
        </div>
      </div>
    </div>
  );
};
export default PropertyPanel;