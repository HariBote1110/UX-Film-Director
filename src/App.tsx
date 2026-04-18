import React, { useState } from 'react';
import Viewport from './components/Viewport';
import Timeline from './components/Timeline';
import PropertyPanel from './components/PropertyPanel';
import ProjectSetup from './components/ProjectSetup';
import { useAppLogic } from './hooks/useAppLogic';
import { useStore } from './store/useStore';
import { shallow } from 'zustand/shallow';
import { buildProjectFileData, openProjectFileWithDialog, restoreProjectObjects, saveProjectFileWithDialog } from './utils/projectFile';
import { buildExportAudioMixWav } from './utils/audioMixdown';
import { useTranslation } from './i18n';
import './index.css';

const { ipcRenderer } = window;

const App: React.FC = () => {
  useAppLogic();
  const [projectIoAction, setProjectIoAction] = useState<'idle' | 'opening' | 'saving'>('idle');
  const [isMp3Exporting, setIsMp3Exporting] = useState(false);

  const { isProjectLoaded, isExporting, setExporting, requestSnapshot, loadProject, projectSettings, duration, objects, layers, scenes, activeSceneId, camera, language, setLanguage } = useStore((state) => ({
    isProjectLoaded: state.isProjectLoaded,
    isExporting: state.isExporting,
    setExporting: state.setExporting,
    requestSnapshot: state.requestSnapshot,
    loadProject: state.loadProject,
    projectSettings: state.projectSettings,
    duration: state.duration,
    objects: state.objects,
    layers: state.layers,
    scenes: state.scenes,
    activeSceneId: state.activeSceneId,
    camera: state.camera,
    language: state.language,
    setLanguage: state.setLanguage,
  }), shallow);

  const t = useTranslation(language);

  const handleOpenProject = async () => {
    const isProjectIoBusy = projectIoAction !== 'idle';
    if (isProjectIoBusy || isExporting) return;

    try {
      setProjectIoAction('opening');
      const loaded = await openProjectFileWithDialog();
      if (!loaded) return;

      const scenesRestored = await Promise.all(
        loaded.project.scenes.map(async (scene) => ({
          ...scene,
          objects: await restoreProjectObjects(scene.objects, loaded.project.projectSettings)
        }))
      );

      loadProject(loaded.project.projectSettings, scenesRestored, loaded.project.activeSceneId);
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
      const projectFile = buildProjectFileData({
        projectSettings,
        scenes,
        activeSceneId,
        objects,
        layers,
        duration,
        camera
      });
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

  const handleExportMp3 = async () => {
    if (isExporting || isMp3Exporting) return;

    try {
      setIsMp3Exporting(true);
      const exportObjects = objects.filter((obj) => layers[obj.layer]?.visible !== false);
      const lastObjectEndTime = Math.max(...exportObjects.map((obj) => obj.startTime + obj.duration), 0);
      const exportDuration = Math.max(lastObjectEndTime, 1);
      const mixedAudio = await buildExportAudioMixWav(
        exportObjects,
        exportDuration,
        projectSettings.sampleRate || 44100
      );

      if (!mixedAudio) {
        alert('出力可能な音声が見つかりませんでした。');
        return;
      }

      const result = await ipcRenderer.invoke('export-audio-mp3', { wavBuffer: mixedAudio });
      if (!result?.success) {
        if (result?.reason === 'cancelled') return;
        throw new Error(result?.error || 'MP3 書き出しに失敗しました。');
      }

      alert('MP3 書き出しが完了しました。');
    } catch (error) {
      alert(`MP3 書き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsMp3Exporting(false);
    }
  };

  const isProjectIoBusy = projectIoAction !== 'idle';
  const isUiBusy = isProjectIoBusy || isExporting || isMp3Exporting;

  if (!isProjectLoaded) {
    return (
      <div className="app-container" style={{ height: '100vh', background: '#1a1a1a', color: '#ccc' }}>
        <header className="title-bar" style={{ height: '38px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 10px 0 80px', color: '#ccc', fontSize: '12px', borderBottom: '1px solid #000', flexShrink: 0 }}>
          <span style={{ fontWeight: 'bold' }}>{t('appTitle')}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <select value={language} onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px' }}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>
        </header>
        <ProjectSetup onOpenProject={handleOpenProject} isProjectIoBusy={isProjectIoBusy} />
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <header className="title-bar" style={{ height: '38px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 10px 0 80px', color: '#ccc', fontSize: '12px', borderBottom: '1px solid #000', flexShrink: 0 }}>
        <span style={{ fontWeight: 'bold' }}>{t('appTitle')}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <select value={language} onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px' }}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
          <button onClick={handleOpenProject} disabled={isUiBusy} style={{ background: '#444', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isUiBusy ? 'default' : 'pointer' }}>
            {projectIoAction === 'opening' ? t('loading') : t('openProject')}
          </button>
          <button onClick={handleSaveProject} disabled={isUiBusy} style={{ background: '#444', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isUiBusy ? 'default' : 'pointer' }}>
            {projectIoAction === 'saving' ? t('saving') : t('saveProject')}
          </button>
          <button onClick={requestSnapshot} disabled={isUiBusy} style={{ background: '#444', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isUiBusy ? 'default' : 'pointer' }}>
            {t('snapshot')}
          </button>
          <button onClick={handleExportMp3} disabled={isUiBusy} style={{ background: isMp3Exporting ? '#555' : '#2c9a65', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isUiBusy ? 'default' : 'pointer' }}>
            {isMp3Exporting ? t('exportingMp3') : t('exportMp3')}
          </button>
          <button onClick={handleExport} disabled={isUiBusy} style={{ background: isExporting ? '#555' : '#007acc', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: isUiBusy ? 'default' : 'pointer' }}>
            {isExporting ? t('exportingVideo') : t('exportVideo')}
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
