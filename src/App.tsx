import React from 'react';
import Viewport from './components/Viewport';
import Timeline from './components/Timeline';
import PropertyPanel from './components/PropertyPanel';
import ProjectSetup from './components/ProjectSetup';
import { useAppLogic } from './hooks/useAppLogic';
import { useStore } from './store/useStore';
import './index.css';

const App: React.FC = () => {
  useAppLogic();
  
  const { isProjectLoaded, isExporting, setExporting } = useStore();

  const handleExport = () => {
    if (isExporting) return;
    // Export開始トリガー
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

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header className="title-bar" style={{ height: '38px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 10px 0 80px', color: '#ccc', fontSize: '12px', borderBottom: '1px solid #000', flexShrink: 0 }}>
        <span style={{ fontWeight: 'bold' }}>UX Film Director (Dev Prototype)</span>
        
        {/* Export Button */}
        <button 
            onClick={handleExport}
            disabled={isExporting}
            style={{ 
                marginLeft: 'auto', 
                background: isExporting ? '#555' : '#007acc', 
                border: 'none', 
                color: 'white',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: isExporting ? 'default' : 'pointer'
            }}
        >
            {isExporting ? 'Exporting...' : 'Export Video'}
        </button>
      </header>
      
      {/* Middle Area */}
      <div className="workspace-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div className="preview-area" style={{ flex: 1, background: '#111', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
          <Viewport />
        </div>
        <div className="properties-area" style={{ width: '300px', minWidth: '300px', background: '#252526', borderLeft: '1px solid #000', overflowY: 'auto', flexShrink: 0 }}>
          <PropertyPanel />
        </div>
      </div>
      
      {/* Timeline */}
      <div className="timeline-area" style={{ height: '300px', minHeight: '300px', borderTop: '2px solid #000', zIndex: 10, flexShrink: 0 }}>
        <Timeline />
      </div>
    </div>
  );
};

export default App;