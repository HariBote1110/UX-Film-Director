import React, { useState } from 'react';
import Viewport from './components/Viewport';
import Timeline from './components/Timeline';
import PropertyPanel from './components/PropertyPanel';
import ProjectSetup from './components/ProjectSetup';
import { useAppLogic } from './hooks/useAppLogic';
import { useStore } from './store/useStore';
import { shallow } from 'zustand/shallow';
import { buildProjectFileData, openProjectFileWithDialog, restoreProjectObjects, saveProjectFileWithDialog } from './utils/projectFile';
import './index.css';

const App: React.FC = () => {
  useAppLogic();
  const [projectIoAction, setProjectIoAction] = useState<'idle' | 'opening' | 'saving'>('idle');
  
  const { isProjectLoaded, isExporting, setExporting, requestSnapshot, loadProject, projectSettings, duration, objects, layers } = useStore((state) => ({
    isProjectLoaded: state.isProjectLoaded,
    isExporting: state.isExporting,
    setExporting: state.setExporting,
    requestSnapshot: state.requestSnapshot,
    loadProject: state.loadProject,
    projectSettings: state.projectSettings,
    duration: state.duration,
    objects: state.objects,
    layers: state.layers,
  }), shallow);

  const handleOpenProject = async () => {
    const isProjectIoBusy = projectIoAction !== 'idle';
    if (isProjectIoBusy || isExporting) return;

    try {
      setProjectIoAction('opening');
      const loaded = await openProjectFileWithDialog();
      if (!loaded) return;

      const restoredObjects = await restoreProjectObjects(
        loaded.project.objects,
        loaded.project.projectSettings
      );

      loadProject(
        loaded.project.projectSettings,
        restoredObjects,
        loaded.project.duration,
        loaded.project.layers
      );
    } catch (error) {
      alert(`プロジェクト読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProjectIoAction('idle');
    }
  };

  const handleSaveProject = async () => {
    const isProjectIoBusy = projectIoAction !== 'idle';
    if (!isProjectLoaded || isProjectIoBusy || isExporting) return;

    try {
      setProjectIoAction('saving');
      const projectFile = buildProjectFileData(projectSettings, duration, objects, layers);
      const result = await saveProjectFileWithDialog(projectFile);
      if (!result.success && !result.cancelled) {
        throw new Error(result.error || '不明な保存エラー');
      }
    } catch (error) {
      alert(`プロジェクト保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProjectIoAction('idle');
    }
  };

  const handleExport = () => {
    if (isExporting) return;
    setExporting(true);
  };

  const isProjectIoBusy = projectIoAction !== 'idle';

  if (!isProjectLoaded) {
    return (
      <div className="app-container" style={{ height: '100vh', background: '#1a1a1a', color: '#ccc' }}>
        <header className="title-bar" style={{ height: '38px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 10px 0 80px', color: '#ccc', fontSize: '12px', borderBottom: '1px solid #000', flexShrink: 0 }}>
          <span style={{ fontWeight: 'bold' }}>UX Film Director (Dev Prototype)</span>
        </header>
        <ProjectSetup onOpenProject={handleOpenProject} isProjectIoBusy={isProjectIoBusy} />
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <header className="title-bar" style={{ height: '38px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 10px 0 80px', color: '#ccc', fontSize: '12px', borderBottom: '1px solid #000', flexShrink: 0 }}>
        <span style={{ fontWeight: 'bold' }}>UX Film Director (Dev Prototype)</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={handleOpenProject} disabled={isExporting || isProjectIoBusy} style={{ background: '#444', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isExporting || isProjectIoBusy ? 'default' : 'pointer' }}>
            {projectIoAction === 'opening' ? '読み込み中...' : 'プロジェクトを開く'}
          </button>
          <button onClick={handleSaveProject} disabled={isExporting || isProjectIoBusy} style={{ background: '#444', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isExporting || isProjectIoBusy ? 'default' : 'pointer' }}>
            {projectIoAction === 'saving' ? '保存中...' : 'プロジェクトを保存'}
          </button>
          <button onClick={requestSnapshot} disabled={isExporting} style={{ background: '#444', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isExporting ? 'default' : 'pointer' }}>
            Snapshot
          </button>
          <button onClick={handleExport} disabled={isExporting} style={{ background: isExporting ? '#555' : '#007acc', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isExporting ? 'default' : 'pointer' }}>
              {isExporting ? 'Exporting...' : 'Export Video'}
          </button>
        </div>
      </header>
      
      <div className="workspace-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div className="preview-area" style={{ flex: 1, background: '#111', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
          <Viewport />
        </div>
        <div className="properties-area no-drag" style={{ width: '300px', minWidth: '300px', background: '#252526', borderLeft: '1px solid #000', overflowY: 'auto', flexShrink: 0 }}>
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
