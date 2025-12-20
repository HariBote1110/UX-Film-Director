import React, { useEffect, useRef } from 'react';
import Viewport from './components/Viewport';
import Timeline from './components/Timeline';
import PropertyPanel from './components/PropertyPanel';
import ProjectSetup from './components/ProjectSetup';
import { useAppLogic } from './hooks/useAppLogic';
import { useStore } from './store/useStore';
import { PsdToolBridge } from './utils/psdToolBridge';
import { PsdRenderer } from './components/PsdRenderer';
import { PsdObject } from './types';
import './index.css';

const App: React.FC = () => {
  useAppLogic();
  
  const { isProjectLoaded, isExporting, setExporting, objects, selectedId } = useStore();
  
  // Registry to hold active bridges for each PSD object
  const bridgeMapRef = useRef<Map<string, PsdToolBridge>>(new Map());

  // Callback when a bridge is initialised
  const handleBridgeReady = (id: string, bridge: PsdToolBridge) => {
    bridgeMapRef.current.set(id, bridge);
    // If the newly ready bridge happens to be the selected one, update the global reference immediately
    if (id === selectedId) {
        (window as any).psdBridge = bridge;
    }
  };

  // Callback when a bridge is destroyed
  const handleBridgeDestroy = (id: string) => {
    bridgeMapRef.current.delete(id);
    if (selectedId === id) {
        (window as any).psdBridge = null;
    }
  };

  // Update the global bridge reference whenever selection changes
  useEffect(() => {
    if (selectedId && bridgeMapRef.current.has(selectedId)) {
        (window as any).psdBridge = bridgeMapRef.current.get(selectedId);
    } else {
        (window as any).psdBridge = null;
    }
  }, [selectedId]);

  // Expose the bridge map for debugging if needed
  useEffect(() => {
    (window as any).psdBridgeMap = bridgeMapRef.current;
  }, []);

  const handleExport = () => {
    if (isExporting) return;
    setExporting(true);
  };

  if (!isProjectLoaded) {
    return (
      <div className="app-container" style={{ height: '100vh', background: '#1a1a1a', color: '#ccc' }}>
        <header className="title-bar" style={{ height: '38px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 10px 0 80px', color: '#ccc', fontSize: '12px', borderBottom: '1px solid #000', flexShrink: 0 }}>
          <span style={{ fontWeight: 'bold' }}>UX Film Director (Dev Prototype)</span>
        </header>
        <ProjectSetup />
      </div>
    );
  }

  // Filter for PSD objects to render their background renderers
  const psdObjects = objects.filter(o => o.type === 'psd') as PsdObject[];

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* Multi-Session PSD Renderers
          Render a hidden PsdRenderer for each PSD object found in the store.
          They run in the background and sync image data to the store.
      */}
      <div style={{ position: 'absolute', top: -9999, left: -9999, visibility: 'hidden' }}>
          {psdObjects.map(obj => (
              <PsdRenderer 
                  key={obj.id} 
                  object={obj} 
                  onBridgeReady={handleBridgeReady}
                  onBridgeDestroy={handleBridgeDestroy}
              />
          ))}
      </div>

      <header className="title-bar" style={{ height: '38px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 10px 0 80px', color: '#ccc', fontSize: '12px', borderBottom: '1px solid #000', flexShrink: 0 }}>
        <span style={{ fontWeight: 'bold' }}>UX Film Director (Dev Prototype)</span>
        <button onClick={handleExport} disabled={isExporting} style={{ marginLeft: 'auto', background: isExporting ? '#555' : '#007acc', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isExporting ? 'default' : 'pointer' }}>
            {isExporting ? 'Exporting...' : 'Export Video'}
        </button>
      </header>
      
      <div className="workspace-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div className="preview-area" style={{ flex: 1, background: '#111', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
          <Viewport />
        </div>
        <div className="properties-area" style={{ width: '300px', minWidth: '300px', background: '#252526', borderLeft: '1px solid #000', overflowY: 'auto', flexShrink: 0 }}>
          <PropertyPanel />
        </div>
      </div>
      
      <div className="timeline-area" style={{ height: '300px', minHeight: '300px', borderTop: '2px solid #000', zIndex: 10, flexShrink: 0 }}>
        <Timeline />
      </div>
    </div>
  );
};

export default App;