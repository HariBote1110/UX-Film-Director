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
import { buildAviUtlCutCornerRegionFrameObject, buildAviUtlEllipseRegionFrameObject, buildAviUtlRegionFrameObject } from '../utils/objectFactories/regionFrameObjectFactory';
import { buildAviUtlShakingPolygonObject } from '../utils/objectFactories/shakingPolygonObjectFactory';
import { buildAviUtlSimpleTubeObject, buildAviUtlSimpleTubeTorusObject } from '../utils/objectFactories/simpleTubeObjectFactory';
import { buildAviUtlSphereDotsObject } from '../utils/objectFactories/sphereDotsObjectFactory';
import { buildAviUtlSphericalFieldObject } from '../utils/objectFactories/sphericalFieldObjectFactory';
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
    deleteObject, deleteSelectedObjects, selectObject, splitObject, addObject,
    copySelectedObjects, cutSelectedObjects, pasteClipboardObjects, duplicateSelectedObjects,
    groupSelectedObjects, ungroupSelectedObjects, selectedIds, projectSettings, language
  } = useStore((state) => ({
    deleteObject: state.deleteObject,
    deleteSelectedObjects: state.deleteSelectedObjects,
    selectObject: state.selectObject,
    splitObject: state.splitObject,
    addObject: state.addObject,
    copySelectedObjects: state.copySelectedObjects,
    cutSelectedObjects: state.cutSelectedObjects,
    pasteClipboardObjects: state.pasteClipboardObjects,
    duplicateSelectedObjects: state.duplicateSelectedObjects,
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

  // 音声波形追加ハンドラ
  const handleAddWaveform = () => {
      const waveformWidth = Math.max(120, Math.round(projectSettings.width * 0.4));
      const waveformHeight = Math.max(80, Math.round(projectSettings.height * 0.14));
      const centredX = Math.round((projectSettings.width - waveformWidth) / 2);
      const centredY = Math.round((projectSettings.height - waveformHeight) / 2);
      addObject({
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
      onClose();
  };

  const handleAddParticle = () => {
    addObject(buildDefaultStandardParticleObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddBarcode = () => {
    addObject(buildAviUtlBarcodeObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddCircularArrow = () => {
    addObject(buildAviUtlCircularArrowObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddTriangleBracket = () => {
    addObject(buildAviUtlTriangleBracketObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddTartanCheck = () => {
    addObject(buildAviUtlTartanCheckObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHoundstooth = () => {
    addObject(buildAviUtlHoundstoothObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddYagasuri = () => {
    addObject(buildAviUtlYagasuriObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddPaperAirplane = () => {
    addObject(buildAviUtlPaperAirplaneObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddAsanohaPattern = () => {
    addObject(buildAviUtlAsanohaPatternObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddFocusLinesPlus = () => {
    addObject(buildAviUtlFocusLinesPlusObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddRandomLineEx = () => {
    addObject(buildAviUtlRandomLineExObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddContourTrace = () => {
    addObject(buildAviUtlContourTraceObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddDisplacementPoly = () => {
    addObject(buildAviUtlDisplacementPolyObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddPlainEffectorLine = () => {
    addObject(buildAviUtlPlainEffectorLineObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddRegionFrame = () => {
    addObject(buildAviUtlRegionFrameObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddEllipseRegionFrame = () => {
    addObject(buildAviUtlEllipseRegionFrameObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddCutCornerRegionFrame = () => {
    addObject(buildAviUtlCutCornerRegionFrameObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHologram = () => {
    addObject(buildAviUtlHologramObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddProtractor = () => {
    addObject(buildAviUtlProtractorObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddShakingPolygon = () => {
    addObject(buildAviUtlShakingPolygonObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddSimpleTube = () => {
    addObject(buildAviUtlSimpleTubeObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddSimpleTubeTorus = () => {
    addObject(buildAviUtlSimpleTubeTorusObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddSphereDots = () => {
    addObject(buildAviUtlSphereDotsObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddSphericalField = () => {
    addObject(buildAviUtlSphericalFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddColourWheel = () => {
    addObject(buildAviUtlColourWheelObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddGear = () => {
    addObject(buildAviUtlGearObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddGourd = () => {
    addObject(buildAviUtlGourdObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddPuzzlePiece = () => {
    addObject(buildAviUtlPuzzlePieceObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddAuraEmission = () => {
    addObject(buildAviUtlAuraEmissionObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddBubble = () => {
    addObject(buildAviUtlBubbleObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddFocusLines = () => {
    addObject(buildAviUtlFocusLinesObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddInkSplash = () => {
    addObject(buildAviUtlInkSplashObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddTrackBar = () => {
    addObject(buildAviUtlTrackBarObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddPieChart = () => {
    addObject(buildAviUtlPieChartObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHistogram = () => {
    addObject(buildAviUtlHistogramObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddGetColorDotField = () => {
    addObject(buildGetColorDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddGetColorDiamondDotField = () => {
    addObject(buildGetColorDiamondDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddGetColorOutlinedSquareDotField = () => {
    addObject(buildGetColorOutlinedSquareDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddGetColorSampledDotField = () => {
    addObject(buildGetColorSampledDotFieldObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddAudioSphere = () => {
    addObject(buildAviUtlAudioSphereObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddToneCurve = () => {
    addObject(buildAviUtlToneCurveObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHksyCheckerGrid = () => {
    addObject(buildHksyCheckerGridObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHksyLine = () => {
    addObject(buildHksyLineObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHksyDiamond = () => {
    addObject(buildHksyDiamondObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHksyMeasuredGrid = () => {
    addObject(buildHksyMeasuredGridObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHksyAnchorLine = () => {
    addObject(buildHksyAnchorLineObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddHksyMultiColourChecker = () => {
    addObject(buildHksyMultiColourCheckerObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddSunburst = () => {
    addObject(buildAviUtlSunburstObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const ensureObjectSelection = (objectId: string) => {
    if (!selectedIds.includes(objectId)) {
      selectObject(objectId);
    }
    return true;
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
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddShape(); onClose(); }}>{t('addShape')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddText(); onClose(); }}>{t('addText')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddImage(); onClose(); }}>{t('addImage')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddVideo(); onClose(); }}>{t('addVideo')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddAudio(); onClose(); }}>{t('addAudio')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddPsd(); onClose(); }}>{language === 'en' ? 'Add PSD' : 'PSD立ち絵を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddGroup(); onClose(); }}>{language === 'en' ? 'Add Group Control' : 'グループ制御を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddWaveform}>{language === 'en' ? 'Add Waveform' : '音声波形を追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddBarcode}>{language === 'en' ? 'Add Barcode' : 'バーコードを追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddColourWheel}>{language === 'en' ? 'Add Colour Wheel' : '色相環を追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddGear}>{language === 'en' ? 'Add Gear' : '歯車を追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddGourd}>{language === 'en' ? 'Add Gourd' : 'ひょうたんを追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddPuzzlePiece}>{language === 'en' ? 'Add Puzzle Piece' : 'パズルピースを追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddParticle}>{language === 'en' ? 'Add Standard Particle' : '標準パーティクルを追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddAuraEmission}>{language === 'en' ? 'Add Aura Emission' : 'オーラ放出を追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddBubble}>{language === 'en' ? 'Add Bubbles' : '泡を追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddFocusLines}>{language === 'en' ? 'Add Focus Lines' : '集中線を追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddInkSplash}>{language === 'en' ? 'Add Ink Splash' : 'インクを追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddTrackBar}>{language === 'en' ? 'Add Track Bar' : 'トラックバーを追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddPieChart}>{language === 'en' ? 'Add Pie Chart' : 'パイシートグラフを追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHistogram}>{language === 'en' ? 'Add Histogram' : '簡易ヒストグラムを追加'}</div>
               <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddGetColorDotField}>{language === 'en' ? 'Add GetColor V2R Dot Field' : 'GetColor V2Rドットフィールドを追加'}</div>
               <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddGetColorDiamondDotField}>{language === 'en' ? 'Add GetColor V2R Diamond Dots' : 'GetColor V2R菱形ドットフィールドを追加'}</div>
               <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddGetColorOutlinedSquareDotField}>{language === 'en' ? 'Add GetColor V2R Outlined Square Dots' : 'GetColor V2R枠線四角ドットフィールドを追加'}</div>
               <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddGetColorSampledDotField}>{language === 'en' ? 'Add GetColor V2R Sampled Dots' : 'GetColor V2R画像サンプリングドットを追加'}</div>
               <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHksyCheckerGrid}>{language === 'en' ? 'Add hksy Checker/Grid' : 'hksyチェッカー/グリッドを追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHksyLine}>{language === 'en' ? 'Add hksy Lines' : 'hksy直線を追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHksyMultiColourChecker}>{language === 'en' ? 'Add hksy Multi-Colour Checker' : 'hksy複数色チェッカーを追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHksyDiamond}>{language === 'en' ? 'Add hksy Diamond' : 'hksy菱形を追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHksyMeasuredGrid}>{language === 'en' ? 'Add hksy Grid' : 'hksyグリッドを追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHksyAnchorLine}>{language === 'en' ? 'Add hksy Anchor Line' : 'hksyライン（アンカー指定）を追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddToneCurve}>{language === 'en' ? 'Add Tone Curve' : '簡易トーンカーブを追加'}</div>
             <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddSunburst}>{language === 'en' ? 'Add Sunburst' : '日の出を追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddCircularArrow}>{language === 'en' ? 'Add Circular Arrow' : '円矢印を追加'}</div>
              <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddTartanCheck}>{language === 'en' ? 'Add Tartan Check' : 'タータンチェックを追加'}</div>
               <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHoundstooth}>{language === 'en' ? 'Add Houndstooth' : '千鳥格子を追加'}</div>
               <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddYagasuri}>{language === 'en' ? 'Add Yagasuri' : '矢がすりを追加'}</div>
                  <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddPaperAirplane}>{language === 'en' ? 'Add Paper Airplane' : '紙飛行機を追加'}</div>
                  <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddAsanohaPattern}>{language === 'en' ? 'Add Asanoha Pattern' : '麻の葉模様を追加'}</div>
                   <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddAudioSphere}>{language === 'en' ? 'Add 93 Audio Sphere' : '93音声玉を追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddFocusLinesPlus}>{language === 'en' ? 'Add Focus Lines Plus' : '集中線plusを追加'}</div>
                     <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddRandomLineEx}>{language === 'en' ? 'Add Random Line EX' : 'ランダムラインEXを追加'}</div>
                       <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddContourTrace}>{language === 'en' ? 'Add 93 Contour Trace' : '93輪郭トレスを追加'}</div>
                       <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddDisplacementPoly}>{language === 'en' ? 'Add 93 DisplacementPoly' : '93 DisplacementPolyを追加'}</div>
                       <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddPlainEffectorLine}>{language === 'en' ? 'Add 93 PlainEffector Line' : '93 PlainEffector Lineを追加'}</div>
                       <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddRegionFrame}>{language === 'en' ? 'Add 93 Region Frame' : '93領域枠を追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddEllipseRegionFrame}>{language === 'en' ? 'Add 93 Ellipse Region Frame' : '93領域枠(楕円)を追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddCutCornerRegionFrame}>{language === 'en' ? 'Add 93 Cut-Corner Region Frame' : '93領域枠(角落ち)を追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddHologram}>{language === 'en' ? 'Add Hologram' : 'ホログラムを追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddProtractor}>{language === 'en' ? 'Add Protractor' : '分度器を追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddShakingPolygon}>{language === 'en' ? 'Add Shaking Polygon' : '多角形_震えるを追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddSimpleTube}>{language === 'en' ? 'Add 93 SimpleTube' : '93 SimpleTubeを追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddSimpleTubeTorus}>{language === 'en' ? 'Add 93 SimpleTube Torus' : '93 SimpleTubeトーラスを追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddSphereDots}>{language === 'en' ? 'Add 93 Sphere(DrawPixel)' : '93 Sphere(DrawPixel)を追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddSphericalField}>{language === 'en' ? 'Add 93 SphericalField' : '93 SphericalFieldを追加'}</div>
                    <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddTriangleBracket}>{language === 'en' ? 'Add Triangle Bracket' : '三角括弧を追加'}</div>
         </>
       )}
      {state.type === 'object' && state.targetObjectId && (
         <>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { splitObject(); onClose(); }}>{t('split')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) copySelectedObjects(); onClose(); }}>{t('copy')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) cutSelectedObjects(); onClose(); }}>{t('cut')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) duplicateSelectedObjects(); onClose(); }}>{t('duplicate')}</div>
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
