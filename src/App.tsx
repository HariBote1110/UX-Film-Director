import React, { useEffect, useState } from 'react';
import Viewport from './components/Viewport';
import Timeline from './components/Timeline';
import PropertyPanel from './components/PropertyPanel';
import ProjectSetup from './components/ProjectSetup';
import ExportProgressModal from './components/ExportProgressModal';
import ProxyGenerationIndicator from './components/ProxyGenerationIndicator';
import { RemoteDeckPanel } from './components/RemoteDeckPanel';
import { useAppLogic } from './hooks/useAppLogic';
import { useStore } from './store/useStore';
import { shallow } from 'zustand/shallow';
import { buildProjectFileData, openProjectFileWithDialog, restoreProjectObjects, saveProjectFileWithDialog } from './utils/projectFile';
import { buildExportAudioMixWav } from './utils/audioMixdown';
import { subscribeStoreToPreviewObstructionIpc } from './utils/previewObstructionDetector';
import { useTranslation } from './i18n';
import { FolderOpen, Save, Camera } from 'lucide-react';
import { RendererTraceProfiler } from './components/RendererTraceProfiler';
import './index.css';

const { ipcRenderer } = window;

const App: React.FC = () => {
  useAppLogic();
  const [projectIoAction, setProjectIoAction] = useState<'idle' | 'opening' | 'saving'>('idle');
  const [isMp3Exporting, setIsMp3Exporting] = useState(false);

  const { isProjectLoaded, isExporting, setExporting, requestSnapshot, loadProject, projectSettings, duration, objects, layers, scenes, activeSceneId, camera, stageCamera3D, language, setLanguage } = useStore((state) => ({
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
    stageCamera3D: state.stageCamera3D,
    language: state.language,
    setLanguage: state.setLanguage,
  }), shallow);

  const t = useTranslation(language);

  // Bug E（Native_Overlay_Bug_E_Plan.md §3・§4 Phase E1）— zustand store の
  // previewObstructed 状態を ui:preview-obstruction-changed IPC へ転送する。
  // main（Phase E2）はこれを受けて native overlay の child NSWindow の
  // z-order を切り替える。
  useEffect(() => {
    if (typeof ipcRenderer?.invoke !== 'function') return undefined;
    return subscribeStoreToPreviewObstructionIpc(useStore, (channel, payload) => ipcRenderer.invoke(channel, payload));
  }, []);

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
        camera,
        stageCamera3D
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
      <div className="app-container" style={{ height: '100vh' }}>
        <header className="title-bar">
          <span className="app-title-text">{t('appTitle')}</span>
          <div className="title-bar-actions">
            <select value={language} onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}>
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

      <header className="title-bar">
        <span className="app-title-text" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {t('appTitle')}
        </span>
        <div className="title-bar-actions">
          <div className="divider" style={{ height: '14px', opacity: 0.3 }}></div>
          <button onClick={handleOpenProject} disabled={isUiBusy} title={t('openProject')}>
            <FolderOpen size={14} />
          </button>
          <button onClick={handleSaveProject} disabled={isUiBusy} title={t('saveProject')}>
            <Save size={14} />
          </button>
          <button onClick={requestSnapshot} disabled={isUiBusy} title={t('snapshot')}>
            <Camera size={14} />
          </button>
          <RemoteDeckPanel />
          
          <div className="divider"></div>
          
          <button className="btn-success" onClick={handleExportMp3} disabled={isUiBusy} style={{ fontSize: '11px' }}>
            {isMp3Exporting ? '...' : 'MP3'}
          </button>
          <button className="btn-primary" onClick={handleExport} disabled={isUiBusy} style={{ fontSize: '11px' }}>
            {isExporting ? '...' : language === 'ja' ? '動画出力' : 'Export'}
          </button>

          <div className="divider" style={{ height: '14px', opacity: 0.3 }}></div>
          
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}
            style={{ border: 'none', background: 'transparent', fontSize: '10px', padding: '0 4px', color: 'var(--text-muted)' }}
          >
            <option value="ja">JA</option>
            <option value="en">EN</option>
          </select>
        </div>
      </header>

      <div className="workspace-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div className="preview-area" style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
          <RendererTraceProfiler id="Viewport">
            <Viewport />
          </RendererTraceProfiler>
        </div>
        <div className="properties-area no-drag" style={{ width: '300px', flexShrink: 0, overflowY: 'auto' }}>
          <RendererTraceProfiler id="PropertyPanel">
            <PropertyPanel />
          </RendererTraceProfiler>
        </div>
      </div>

      <div className="timeline-area" style={{ height: '300px', flexShrink: 0, zIndex: 10 }}>
        <RendererTraceProfiler id="Timeline">
          <Timeline />
        </RendererTraceProfiler>
      </div>

      <ExportProgressModal />
      <ProxyGenerationIndicator />
    </div>
  );
};

export default App;
