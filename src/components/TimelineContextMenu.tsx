import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from '../i18n';
import { buildAviUtlAsanohaPatternObject } from '../utils/objectFactories/asanohaPatternObjectFactory';
import { buildAviUtlAudioSphereObject } from '../utils/objectFactories/audioSphereObjectFactory';
import { buildAviUtlBarcodeObject } from '../utils/objectFactories/barcodeObjectFactory';
import { buildAviUtlCircularArrowObject } from '../utils/objectFactories/circularArrowObjectFactory';
import { buildAviUtlColourWheelObject } from '../utils/objectFactories/colourWheelObjectFactory';
import { buildAviUtlContourTraceObject } from '../utils/objectFactories/contourTraceObjectFactory';
import { buildAviUtlDisplacementPolyObject } from '../utils/objectFactories/displacementPolyObjectFactory';
import { buildAviUtlFocusLinesPlusObject } from '../utils/objectFactories/focusLinesPlusObjectFactory';
import { buildAviUtlGearObject } from '../utils/objectFactories/gearObjectFactory';
import { buildGetColorDiamondDotFieldObject, buildGetColorDotFieldObject, buildGetColorOutlinedSquareDotFieldObject, buildGetColorSampledDotFieldObject } from '../utils/objectFactories/getColorDotFieldObjectFactory';
import { buildAviUtlGourdObject } from '../utils/objectFactories/gourdObjectFactory';
import { buildAviUtlHistogramObject } from '../utils/objectFactories/histogramObjectFactory';
import { buildHksyAnchorLineObject, buildHksyCheckerGridObject, buildHksyDiamondObject, buildHksyLineObject, buildHksyMeasuredGridObject, buildHksyMultiColourCheckerObject } from '../utils/objectFactories/hksyCheckerGridObjectFactory';
import { buildAviUtlHologramObject } from '../utils/objectFactories/hologramObjectFactory';
import { buildAviUtlHoundstoothObject } from '../utils/objectFactories/houndstoothObjectFactory';
import { buildAviUtlPaperAirplaneObject } from '../utils/objectFactories/paperAirplaneObjectFactory';
import { buildAviUtlPieChartObject } from '../utils/objectFactories/pieChartObjectFactory';
import { buildAviUtlPlainEffectorLineObject } from '../utils/objectFactories/plainEffectorLineObjectFactory';
import { buildAviUtlPuzzlePieceObject } from '../utils/objectFactories/puzzlePieceObjectFactory';
import { buildAviUtlProtractorObject } from '../utils/objectFactories/protractorObjectFactory';
import { buildAviUtlRandomLineExObject } from '../utils/objectFactories/randomLineExObjectFactory';
import { buildAviUtlBorderDepthRegionFrameObject, buildAviUtlCutCornerRegionFrameObject, buildAviUtlEllipseRegionFrameObject, buildAviUtlRegionFrameObject } from '../utils/objectFactories/regionFrameObjectFactory';
import { buildAviUtlShakingPolygonObject } from '../utils/objectFactories/shakingPolygonObjectFactory';
import { buildAviUtlShatteredSphereObject } from '../utils/objectFactories/shatteredSphereObjectFactory';
import { buildAviUtlSimpleTubeObject, buildAviUtlSimpleTubeTorusObject } from '../utils/objectFactories/simpleTubeObjectFactory';
import { buildAviUtlSphereDotsObject } from '../utils/objectFactories/sphereDotsObjectFactory';
import { buildAviUtlSPFieldObject, buildAviUtlSphericalFieldObject } from '../utils/objectFactories/sphericalFieldObjectFactory';
import { buildAviUtlSunburstObject } from '../utils/objectFactories/sunburstObjectFactory';
import { buildAviUtlTartanCheckObject } from '../utils/objectFactories/tartanCheckObjectFactory';
import { buildAviUtlToneCurveObject } from '../utils/objectFactories/toneCurveObjectFactory';
import { buildAviUtlTrackBarObject } from '../utils/objectFactories/trackBarObjectFactory';
import { buildAviUtlTriangleBracketObject } from '../utils/objectFactories/triangleBracketObjectFactory';
import { buildAviUtlYagasuriObject } from '../utils/objectFactories/yagasuriObjectFactory';
import {
  buildAviUtlAuraEmissionObject,
  buildAviUtlBubbleObject,
  buildAviUtlFocusLinesObject,
  buildAviUtlInkSplashObject,
  buildDefaultStandardParticleObject,
} from '../utils/objectFactories/particleObjectFactory';
import type { TimelineObject } from '../types';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: 'canvas' | 'object';
  time: number;
  layer: number;
  targetObjectId?: string;
}

interface TimelineContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAddShape: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddAudio: () => void;
  onAddPsd: () => void;
  onAddGroup: () => void;
}

const contextMenuItemStyle: React.CSSProperties = {
  padding: '6px 12px',
  cursor: 'pointer',
};

const TimelineContextMenuItem = ({
  children,
  onClick,
  tone = 'normal',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'normal' | 'generated' | 'danger';
}) => (
  <div
    className="context-menu-item"
    style={{
      ...contextMenuItemStyle,
      color: tone === 'danger' ? '#ff6b6b' : (tone === 'generated' ? '#aaffaa' : '#eee'),
    }}
    onClick={onClick}
  >
    {children}
  </div>
);

const TimelineContextMenuSection = ({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => (
  <details
    className="context-menu-section"
    open={defaultOpen}
    style={{ borderTop: '1px solid #333', marginTop: '4px', paddingTop: '2px' }}
  >
    <summary
      style={{
        padding: '6px 12px',
        cursor: 'pointer',
        color: '#cfe8cf',
        listStyle: 'none',
        userSelect: 'none',
      }}
    >
      {title}
    </summary>
    <div style={{ paddingLeft: '8px', maxHeight: '320px', overflowY: 'auto' }}>
      {children}
    </div>
  </details>
);

export const TimelineContextMenu: React.FC<TimelineContextMenuProps> = ({
  state,
  onClose,
  onAddShape,
  onAddText,
  onAddImage,
  onAddVideo,
  onAddAudio,
  onAddPsd,
  onAddGroup,
}) => {
  const {
    deleteObject, deleteSelectedObjects, selectObject, splitObject, addObject, setTime,
    copySelectedObjects, cutSelectedObjects, pasteClipboardObjects, duplicateSelectedObjects, duplicateSelectedObjectsWithObjectCopyExt,
    groupSelectedObjects, ungroupSelectedObjects, selectedIds, projectSettings, language
  } = useStore((state) => ({
    deleteObject: state.deleteObject,
    deleteSelectedObjects: state.deleteSelectedObjects,
    selectObject: state.selectObject,
    splitObject: state.splitObject,
    addObject: state.addObject,
    setTime: state.setTime,
    copySelectedObjects: state.copySelectedObjects,
    cutSelectedObjects: state.cutSelectedObjects,
    pasteClipboardObjects: state.pasteClipboardObjects,
    duplicateSelectedObjects: state.duplicateSelectedObjects,
    duplicateSelectedObjectsWithObjectCopyExt: state.duplicateSelectedObjectsWithObjectCopyExt,
    groupSelectedObjects: state.groupSelectedObjects,
    ungroupSelectedObjects: state.ungroupSelectedObjects,
    selectedIds: state.selectedIds,
    projectSettings: state.projectSettings,
    language: state.language,
  }), shallow);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useTranslation(language);
  
  const [position, setPosition] = useState({ top: state.y, left: state.x });

  // 画面外はみ出し防止
  useLayoutEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let newTop = state.y;
      let newLeft = state.x;

      if (newTop + rect.height > windowHeight) {
        newTop = state.y - rect.height;
        if (newTop < 0) newTop = windowHeight - rect.height - 10;
      }

      if (newLeft + rect.width > windowWidth) {
        newLeft = state.x - rect.width;
        if (newLeft < 0) newLeft = 10;
      }

      setPosition({ top: newTop, left: newLeft });
    }
  }, [state.x, state.y]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleAddGeneratedObject = (object: TimelineObject) => {
    addObject(object);
    setTime(object.startTime);
    onClose();
  };

  // 音声波形追加ハンドラ
  const handleAddWaveform = () => {
      const waveformWidth = Math.max(120, Math.round(projectSettings.width * 0.4));
      const waveformHeight = Math.max(80, Math.round(projectSettings.height * 0.14));
      const centredX = Math.round((projectSettings.width - waveformWidth) / 2);
      const centredY = Math.round((projectSettings.height - waveformHeight) / 2);
      handleAddGeneratedObject({
          id: crypto.randomUUID(),
          type: 'audio_visualization',
          name: 'Waveform',
          layer: state.layer,
          startTime: state.time,
          duration: 5,
          x: centredX, y: centredY,
          width: waveformWidth, height: waveformHeight,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
          enableAnimation: false, endX: centredX, endY: centredY, easing: 'linear',
          targetAudioId: null,
          targetLayer: state.layer - 1 >= 0 ? state.layer - 1 : -1, // デフォルトで一つ上のレイヤーを対象に
          visualizationType: 'waveform',
          color: '#00ff00',
          thickness: 2,
          amplitude: 1.0
      });
  };

  const handleAddParticle = () => {
    handleAddGeneratedObject(buildDefaultStandardParticleObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddBarcode = () => {
    handleAddGeneratedObject(buildAviUtlBarcodeObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddCircularArrow = () => {
    handleAddGeneratedObject(buildAviUtlCircularArrowObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddTriangleBracket = () => {
    handleAddGeneratedObject(buildAviUtlTriangleBracketObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddTartanCheck = () => {
    handleAddGeneratedObject(buildAviUtlTartanCheckObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHoundstooth = () => {
    handleAddGeneratedObject(buildAviUtlHoundstoothObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddYagasuri = () => {
    handleAddGeneratedObject(buildAviUtlYagasuriObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddPaperAirplane = () => {
    handleAddGeneratedObject(buildAviUtlPaperAirplaneObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddAsanohaPattern = () => {
    handleAddGeneratedObject(buildAviUtlAsanohaPatternObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddFocusLinesPlus = () => {
    handleAddGeneratedObject(buildAviUtlFocusLinesPlusObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddRandomLineEx = () => {
    handleAddGeneratedObject(buildAviUtlRandomLineExObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddContourTrace = () => {
    handleAddGeneratedObject(buildAviUtlContourTraceObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddDisplacementPoly = () => {
    handleAddGeneratedObject(buildAviUtlDisplacementPolyObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddPlainEffectorLine = () => {
    handleAddGeneratedObject(buildAviUtlPlainEffectorLineObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddRegionFrame = () => {
    handleAddGeneratedObject(buildAviUtlRegionFrameObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddEllipseRegionFrame = () => {
    handleAddGeneratedObject(buildAviUtlEllipseRegionFrameObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddCutCornerRegionFrame = () => {
    handleAddGeneratedObject(buildAviUtlCutCornerRegionFrameObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddBorderDepthRegionFrame = () => {
    handleAddGeneratedObject(buildAviUtlBorderDepthRegionFrameObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHologram = () => {
    handleAddGeneratedObject(buildAviUtlHologramObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddProtractor = () => {
    handleAddGeneratedObject(buildAviUtlProtractorObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddShakingPolygon = () => {
    handleAddGeneratedObject(buildAviUtlShakingPolygonObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddShatteredSphere = () => {
    handleAddGeneratedObject(buildAviUtlShatteredSphereObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddSimpleTube = () => {
    handleAddGeneratedObject(buildAviUtlSimpleTubeObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddSimpleTubeTorus = () => {
    handleAddGeneratedObject(buildAviUtlSimpleTubeTorusObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddSphereDots = () => {
    handleAddGeneratedObject(buildAviUtlSphereDotsObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddSphericalField = () => {
    handleAddGeneratedObject(buildAviUtlSphericalFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddSPField = () => {
    handleAddGeneratedObject(buildAviUtlSPFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddColourWheel = () => {
    handleAddGeneratedObject(buildAviUtlColourWheelObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddGear = () => {
    handleAddGeneratedObject(buildAviUtlGearObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddGourd = () => {
    handleAddGeneratedObject(buildAviUtlGourdObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddPuzzlePiece = () => {
    handleAddGeneratedObject(buildAviUtlPuzzlePieceObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddAuraEmission = () => {
    handleAddGeneratedObject(buildAviUtlAuraEmissionObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddBubble = () => {
    handleAddGeneratedObject(buildAviUtlBubbleObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddFocusLines = () => {
    handleAddGeneratedObject(buildAviUtlFocusLinesObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddInkSplash = () => {
    handleAddGeneratedObject(buildAviUtlInkSplashObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddTrackBar = () => {
    handleAddGeneratedObject(buildAviUtlTrackBarObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddPieChart = () => {
    handleAddGeneratedObject(buildAviUtlPieChartObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHistogram = () => {
    handleAddGeneratedObject(buildAviUtlHistogramObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddGetColorDotField = () => {
    handleAddGeneratedObject(buildGetColorDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddGetColorDiamondDotField = () => {
    handleAddGeneratedObject(buildGetColorDiamondDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddGetColorOutlinedSquareDotField = () => {
    handleAddGeneratedObject(buildGetColorOutlinedSquareDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddGetColorSampledDotField = () => {
    handleAddGeneratedObject(buildGetColorSampledDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddAudioSphere = () => {
    handleAddGeneratedObject(buildAviUtlAudioSphereObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddToneCurve = () => {
    handleAddGeneratedObject(buildAviUtlToneCurveObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHksyCheckerGrid = () => {
    handleAddGeneratedObject(buildHksyCheckerGridObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHksyLine = () => {
    handleAddGeneratedObject(buildHksyLineObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHksyDiamond = () => {
    handleAddGeneratedObject(buildHksyDiamondObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHksyMeasuredGrid = () => {
    handleAddGeneratedObject(buildHksyMeasuredGridObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHksyAnchorLine = () => {
    handleAddGeneratedObject(buildHksyAnchorLineObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddHksyMultiColourChecker = () => {
    handleAddGeneratedObject(buildHksyMultiColourCheckerObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const handleAddSunburst = () => {
    handleAddGeneratedObject(buildAviUtlSunburstObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
  };

  const ensureObjectSelection = (objectId: string) => {
    if (!selectedIds.includes(objectId)) {
      selectObject(objectId);
    }
    return true;
  };

  const handleAddObjectCopyExtClones = () => {
    if (!state.targetObjectId) return;
    if (ensureObjectSelection(state.targetObjectId)) {
      duplicateSelectedObjectsWithObjectCopyExt();
    }
    onClose();
  };

  return (
    <div 
      ref={menuRef}
      style={{ 
        position: 'fixed', 
        top: position.top, 
        left: position.left, 
        background: '#252526', 
        border: '1px solid #454545', 
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)', 
        zIndex: 9999, 
        minWidth: '160px', 
        borderRadius: '4px', 
        padding: '4px 0', 
        fontSize: '12px' 
      }} 
      onClick={(e) => e.stopPropagation()}
    >
      {state.type === 'canvas' && (
        <>
            <div style={{ padding: '4px 12px', color: '#888', borderBottom: '1px solid #333', marginBottom: '4px' }}>
              Time: {state.time.toFixed(2)}s <br/> Layer: {state.layer + 1}
            </div>
            <TimelineContextMenuItem onClick={() => { onAddShape(); onClose(); }}>{t('addShape')}</TimelineContextMenuItem>
            <TimelineContextMenuItem onClick={() => { onAddText(); onClose(); }}>{t('addText')}</TimelineContextMenuItem>
            <TimelineContextMenuItem onClick={() => { onAddImage(); onClose(); }}>{t('addImage')}</TimelineContextMenuItem>
            <TimelineContextMenuItem onClick={() => { onAddVideo(); onClose(); }}>{t('addVideo')}</TimelineContextMenuItem>
            <TimelineContextMenuItem onClick={() => { onAddAudio(); onClose(); }}>{t('addAudio')}</TimelineContextMenuItem>
            <TimelineContextMenuItem onClick={() => { onAddPsd(); onClose(); }}>{language === 'en' ? 'Add PSD' : 'PSD立ち絵を追加'}</TimelineContextMenuItem>
            <TimelineContextMenuItem onClick={() => { onAddGroup(); onClose(); }}>{language === 'en' ? 'Add Group Control' : 'グループ制御を追加'}</TimelineContextMenuItem>
            <TimelineContextMenuSection title={language === 'en' ? 'AviUtl / Generated' : 'AviUtl / 生成'}>
              <TimelineContextMenuSection title={language === 'en' ? 'Audio / Particles' : '音声 / パーティクル'}>
                <TimelineContextMenuItem tone="generated" onClick={handleAddWaveform}>{language === 'en' ? 'Add Waveform' : '音声波形を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddAudioSphere}>{language === 'en' ? 'Add 93 Audio Sphere' : '93音声玉を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddParticle}>{language === 'en' ? 'Add Standard Particle' : '標準パーティクルを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddAuraEmission}>{language === 'en' ? 'Add Aura Emission' : 'オーラ放出を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddBubble}>{language === 'en' ? 'Add Bubbles' : '泡を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddFocusLines}>{language === 'en' ? 'Add Focus Lines' : '集中線を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddFocusLinesPlus}>{language === 'en' ? 'Add Focus Lines Plus' : '集中線plusを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddInkSplash}>{language === 'en' ? 'Add Ink Splash' : 'インクを追加'}</TimelineContextMenuItem>
              </TimelineContextMenuSection>
              <TimelineContextMenuSection title="GetColor">
                <TimelineContextMenuItem tone="generated" onClick={handleAddGetColorDotField}>{language === 'en' ? 'Add GetColor V2R Dot Field' : 'GetColor V2Rドットフィールドを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddGetColorDiamondDotField}>{language === 'en' ? 'Add GetColor V2R Diamond Dots' : 'GetColor V2R菱形ドットフィールドを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddGetColorOutlinedSquareDotField}>{language === 'en' ? 'Add GetColor V2R Outlined Square Dots' : 'GetColor V2R枠線四角ドットフィールドを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddGetColorSampledDotField}>{language === 'en' ? 'Add GetColor V2R Sampled Dots' : 'GetColor V2R画像サンプリングドットを追加'}</TimelineContextMenuItem>
              </TimelineContextMenuSection>
              <TimelineContextMenuSection title="hksy">
                <TimelineContextMenuItem tone="generated" onClick={handleAddHksyCheckerGrid}>{language === 'en' ? 'Add hksy Checker/Grid' : 'hksyチェッカー/グリッドを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHksyLine}>{language === 'en' ? 'Add hksy Lines' : 'hksy直線を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHksyMultiColourChecker}>{language === 'en' ? 'Add hksy Multi-Colour Checker' : 'hksy複数色チェッカーを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHksyDiamond}>{language === 'en' ? 'Add hksy Diamond' : 'hksy菱形を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHksyMeasuredGrid}>{language === 'en' ? 'Add hksy Grid' : 'hksyグリッドを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHksyAnchorLine}>{language === 'en' ? 'Add hksy Anchor Line' : 'hksyライン（アンカー指定）を追加'}</TimelineContextMenuItem>
              </TimelineContextMenuSection>
              <TimelineContextMenuSection title={language === 'en' ? '93 Scripts' : '93 Scripts'}>
                <TimelineContextMenuItem tone="generated" onClick={handleAddContourTrace}>{language === 'en' ? 'Add 93 Contour Trace' : '93輪郭トレスを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddDisplacementPoly}>{language === 'en' ? 'Add 93 DisplacementPoly' : '93 DisplacementPolyを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddPlainEffectorLine}>{language === 'en' ? 'Add 93 PlainEffector Line' : '93 PlainEffector Lineを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddRegionFrame}>{language === 'en' ? 'Add 93 Region Frame' : '93領域枠を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddEllipseRegionFrame}>{language === 'en' ? 'Add 93 Ellipse Region Frame' : '93領域枠(楕円)を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddCutCornerRegionFrame}>{language === 'en' ? 'Add 93 Cut-Corner Region Frame' : '93領域枠(角落ち)を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddBorderDepthRegionFrame}>{language === 'en' ? 'Add 93 Border Depth' : '93 Border Depthを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddShatteredSphere}>{language === 'en' ? 'Add 93 Shattered Sphere' : '93砕け散る球を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddSimpleTube}>{language === 'en' ? 'Add 93 SimpleTube' : '93 SimpleTubeを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddSimpleTubeTorus}>{language === 'en' ? 'Add 93 SimpleTube Torus' : '93 SimpleTubeトーラスを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddSphereDots}>{language === 'en' ? 'Add 93 Sphere(DrawPixel)' : '93 Sphere(DrawPixel)を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddSphericalField}>{language === 'en' ? 'Add 93 SphericalField' : '93 SphericalFieldを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddSPField}>{language === 'en' ? 'Add 93 SPfield' : '93 SPfieldを追加'}</TimelineContextMenuItem>
              </TimelineContextMenuSection>
              <TimelineContextMenuSection title={language === 'en' ? 'Patterns / UI' : 'パターン / UI'}>
                <TimelineContextMenuItem tone="generated" onClick={handleAddBarcode}>{language === 'en' ? 'Add Barcode' : 'バーコードを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddColourWheel}>{language === 'en' ? 'Add Colour Wheel' : '色相環を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddGear}>{language === 'en' ? 'Add Gear' : '歯車を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddGourd}>{language === 'en' ? 'Add Gourd' : 'ひょうたんを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddPuzzlePiece}>{language === 'en' ? 'Add Puzzle Piece' : 'パズルピースを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddTrackBar}>{language === 'en' ? 'Add Track Bar' : 'トラックバーを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddPieChart}>{language === 'en' ? 'Add Pie Chart' : 'パイシートグラフを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHistogram}>{language === 'en' ? 'Add Histogram' : '簡易ヒストグラムを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddToneCurve}>{language === 'en' ? 'Add Tone Curve' : '簡易トーンカーブを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddSunburst}>{language === 'en' ? 'Add Sunburst' : '日の出を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddCircularArrow}>{language === 'en' ? 'Add Circular Arrow' : '円矢印を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddTriangleBracket}>{language === 'en' ? 'Add Triangle Bracket' : '三角括弧を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddTartanCheck}>{language === 'en' ? 'Add Tartan Check' : 'タータンチェックを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHoundstooth}>{language === 'en' ? 'Add Houndstooth' : '千鳥格子を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddYagasuri}>{language === 'en' ? 'Add Yagasuri' : '矢がすりを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddPaperAirplane}>{language === 'en' ? 'Add Paper Airplane' : '紙飛行機を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddAsanohaPattern}>{language === 'en' ? 'Add Asanoha Pattern' : '麻の葉模様を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddHologram}>{language === 'en' ? 'Add Hologram' : 'ホログラムを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddProtractor}>{language === 'en' ? 'Add Protractor' : '分度器を追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddShakingPolygon}>{language === 'en' ? 'Add Shaking Polygon' : '多角形_震えるを追加'}</TimelineContextMenuItem>
                <TimelineContextMenuItem tone="generated" onClick={handleAddRandomLineEx}>{language === 'en' ? 'Add Random Line EX' : 'ランダムラインEXを追加'}</TimelineContextMenuItem>
              </TimelineContextMenuSection>
            </TimelineContextMenuSection>
         </>
       )}
      {state.type === 'object' && state.targetObjectId && (
         <>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { splitObject(); onClose(); }}>{t('split')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) copySelectedObjects(); onClose(); }}>{t('copy')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) cutSelectedObjects(); onClose(); }}>{t('cut')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) duplicateSelectedObjects(); onClose(); }}>{t('duplicate')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddObjectCopyExtClones}>{language === 'en' ? '93 ObjectCopyEXT Clone Strip' : '93 ObjectCopyEXT複製列を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { pasteClipboardObjects(); onClose(); }}>{t('paste')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) groupSelectedObjects(); onClose(); }}>{t('group')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) ungroupSelectedObjects(); onClose(); }}>{t('ungroup')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#ff6b6b' }} onClick={() => {
              if (selectedIds.includes(state.targetObjectId!)) {
                deleteSelectedObjects();
              } else {
                deleteObject(state.targetObjectId!);
              }
              selectObject(null);
              onClose();
            }}>{t('delete')}</div>
         </>
      )}
    </div>
  );
};
