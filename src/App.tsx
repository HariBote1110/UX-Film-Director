import React, { useEffect, useRef } from 'react';
import Viewport from './components/Viewport';
import Timeline from './components/Timeline';
import PropertyPanel from './components/PropertyPanel';
import ProjectSetup from './components/ProjectSetup';
import { useAppLogic } from './hooks/useAppLogic';
import { useStore } from './store/useStore';
import { PsdToolBridge } from './utils/psdToolBridge';
import './index.css';

const App: React.FC = () => {
  useAppLogic();
  
  const { isProjectLoaded, isExporting, setExporting, objects, updateObject, selectedId } = useStore();
  
  const psdWebviewRef = useRef<any>(null);
  const bridgeRef = useRef<PsdToolBridge | null>(null);

  const selectedObject = objects.find(o => o.id === selectedId);
  const isPsdSelected = selectedObject?.type === 'psd';

  // ブリッジ初期化
  useEffect(() => {
    if (psdWebviewRef.current && !bridgeRef.current) {
        bridgeRef.current = new PsdToolBridge(psdWebviewRef.current);
    }
  }, [isProjectLoaded]);

  // PSD選択時の処理
  useEffect(() => {
    if (isPsdSelected && selectedObject?.type === 'psd' && bridgeRef.current) {
        const psdObj = selectedObject;
        const bridge = bridgeRef.current;

        // ファイルロード (まだsrcがない、つまり初回ロード時のみ実行などの判定を入れると良いが、今回は簡易的に実行)
        // ※毎回ロードすると重いので、本来はファイル名チェックなどを推奨
        bridge.loadFile(psdObj.file);

        // 同期開始 (画像とツリー構造の両方を受け取る)
        bridge.startSync(
            (dataUrl) => {
                updateObject(psdObj.id, { src: dataUrl });
            },
            (tree) => {
                // ツリー構造（チェック状態含む）をストアに保存し、PropertyPanelへ反映
                updateObject(psdObj.id, { layerTree: tree });
            }
        );
    } else {
        bridgeRef.current?.stopSync();
    }
  }, [selectedId]); 

  // PropertyPanelからの操作を受け取るためのグローバル関数
  // （Reactコンポーネント間でrefを受け渡すのが複雑なため、簡易的にwindow経由でブリッジにアクセスさせる）
  useEffect(() => {
    (window as any).psdBridge = bridgeRef.current;
  }, [bridgeRef.current]);


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

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* PSDTool Render Engine (Hidden) 
          ユーザーには見せないが、裏で動作させる
      */}
      <div style={{ position: 'absolute', top: -9999, left: -9999, width: '1280px', height: '720px', visibility: 'hidden' }}>
          <webview 
                ref={psdWebviewRef}
                src="https://oov.github.io/psdtool/"
                style={{ width: '100%', height: '100%' }}
                webpreferences="contextIsolation=no" 
          />
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