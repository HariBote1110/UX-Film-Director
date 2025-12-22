import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { createShadowGraphics } from '../utils/pixiUtils';
import { easingFunctions } from '../utils/easings';

// Refactored Imports
import { usePixiInteraction } from '../hooks/usePixiInteraction';
import { useProjectExport } from '../hooks/useProjectExport';
import { getGroupTransforms, getLipSyncViseme, updatePixiContent, applyObjectEffects, getVibrationOffset } from '../utils/pixiRenderHelper';

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  // Resource Cache & Refs
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const videoPlayPromisesRef = useRef<Map<string, Promise<void> | null>>(new Map());
  
  // Audio Buffers for Visualization
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const [renderTick, setRenderTick] = useState(0);

  const { 
    currentTime, objects, selectedId, selectObject,
    projectSettings, isPlaying, isExporting, 
    isSnapshotRequested, finishSnapshot
  } = useStore();
  
  const latestObjectsRef = useRef(objects);
  latestObjectsRef.current = objects;

  // --- Interaction Hook ---
  const { onDragStart, onDragMove, onDragEnd, dragRef } = usePixiInteraction(latestObjectsRef);

  // --- Initialize Pixi App ---
  useEffect(() => {
    if (!containerRef.current) return;
    const app = new PIXI.Application();
    app.init({ width: projectSettings.width, height: projectSettings.height, backgroundColor: '#1e1e1e', preference: 'webgpu' }).then(() => {
      if (containerRef.current && !containerRef.current.hasChildNodes()) {
        containerRef.current.appendChild(app.canvas);
        pixiAppRef.current = app;
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.sortableChildren = true;
        app.stage.on('pointerdown', (e) => {
          if (useStore.getState().isExporting) return;
          if (e.target === app.stage) selectObject(null);
        });
      }
    });
    return () => {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true });
        pixiAppRef.current = null;
        pixiObjectsRef.current.clear();
        textureCacheRef.current.clear();
        loadingUrlsRef.current.clear();
        videoElementsRef.current.forEach(video => { video.pause(); video.src = ""; video.load(); });
        videoElementsRef.current.clear();
        audioElementsRef.current.forEach(audio => { audio.pause(); audio.src = ""; audio.load(); });
        audioElementsRef.current.clear();
      }
    };
  }, []); // Run once

  // --- Snapshot Logic ---
  useEffect(() => {
      if (isSnapshotRequested && pixiAppRef.current) {
          const app = pixiAppRef.current;
          app.render();
          const dataUrl = app.canvas.toDataURL('image/png');
          const link = document.createElement('a');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          link.download = `frame_${timestamp}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          finishSnapshot();
      }
  }, [isSnapshotRequested, finishSnapshot]);

  // --- Load Audio Buffers for Visualization ---
  useEffect(() => {
    const loadBuffers = async () => {
        // 音声波形オブジェクトが存在するかチェック
        const hasViz = objects.some(o => o.type === 'audio_visualization');
        if (!hasViz) return;

        // まだロードされていない音声をロード
        const audioContext = new AudioContext();
        for (const obj of objects) {
            if (obj.type === 'audio' && obj.src && !audioBuffersRef.current.has(obj.id)) {
                try {
                    const resp = await fetch(obj.src);
                    const ab = await resp.arrayBuffer();
                    const decoded = await audioContext.decodeAudioData(ab);
                    audioBuffersRef.current.set(obj.id, decoded);
                } catch (e) {
                    console.error("Failed to load audio buffer:", e);
                }
            }
        }
        audioContext.close();
    };
    loadBuffers();
  }, [objects]);


  // --- Main Render Logic ---
  const renderScene = useCallback((time: number, currentObjects: TimelineObject[]) => {
    const app = pixiAppRef.current;
    if (!app) return;

    const currentPixiObjects = pixiObjectsRef.current;
    const currentVideoElements = videoElementsRef.current;
    const currentAudioElements = audioElementsRef.current;
    const visibleObjects = currentObjects.filter(obj => time >= obj.startTime && time < obj.startTime + obj.duration);

    // 1. Cleanup invisible objects
    currentPixiObjects.forEach((container, id) => {
      if (!visibleObjects.find(obj => obj.id === id)) {
        app.stage.removeChild(container);
        container.destroy({ children: true });
        currentPixiObjects.delete(id);
      }
    });
    currentVideoElements.forEach((video, id) => {
        if (!visibleObjects.find(obj => obj.id === id && obj.type === 'video')) {
            video.pause(); video.src = ""; video.load(); currentVideoElements.delete(id); videoPlayPromisesRef.current.delete(id);
        }
    });
    currentAudioElements.forEach((audio, id) => {
        if (!visibleObjects.find(obj => obj.id === id && obj.type === 'audio')) {
            audio.pause(); audio.src = ""; audio.load(); currentAudioElements.delete(id);
        }
    });

    // 2. Render visible objects
    visibleObjects.forEach(obj => {
      // Audio Playback
      if (obj.type === 'audio') {
        let audio = currentAudioElements.get(obj.id);
        if (!audio) {
            audio = new Audio(); audio.src = obj.src; audio.muted = obj.muted; audio.volume = obj.volume;
            audio.crossOrigin = 'anonymous'; audio.preload = 'auto'; currentAudioElements.set(obj.id, audio);
        }
        audio.volume = obj.volume; audio.muted = obj.muted;
        const offset = obj.offset || 0; const audioLocalTime = (time - obj.startTime) + offset;
        if (!isExporting) {
            if (isPlaying) {
                if (audio.paused) { const p = audio.play(); if(p) p.catch(()=>{}); }
                if (Math.abs(audio.currentTime - audioLocalTime) > 0.2) audio.currentTime = audioLocalTime;
            } else {
                if (!audio.paused) audio.pause();
                if (Math.abs(audio.currentTime - audioLocalTime) > 0.05) audio.currentTime = audioLocalTime;
            }
        }
        return; 
      }

      if (obj.type === 'group_control' && selectedId !== obj.id && isPlaying) return;

      // LipSync Calculation
      const lipSyncViseme = getLipSyncViseme(obj, time, currentObjects);

      // Container Management
      let container = currentPixiObjects.get(obj.id);
      const isSelected = selectedId === obj.id;
      if (!container) {
        container = new PIXI.Container();
        container.label = obj.id; container.eventMode = 'static'; container.cursor = 'pointer';
        container.on('pointerdown', (e) => onDragStart(e, obj.id));
        container.on('pointerup', onDragEnd); container.on('pointerupoutside', onDragEnd); container.on('globalpointermove', onDragMove); 
        app.stage.addChild(container); currentPixiObjects.set(obj.id, container);
      }
      container.removeChildren(); 

      // Shadow
      if (obj.shadow && obj.shadow.enabled) {
          const w = (obj as any).width || 100; const h = (obj as any).height || 100;
          const shadow = createShadowGraphics(obj, w, h, obj.shadow);
          if (shadow) container.addChild(shadow);
      }
      
      // Content Generation (with new resources)
      const content = updatePixiContent(obj, container, time, {
          textureCache: textureCacheRef.current,
          loadingUrls: loadingUrlsRef.current,
          videoElements: videoElementsRef.current,
          audioBuffers: audioBuffersRef.current, // Pass AudioBuffers
          allObjects: currentObjects,            // Pass context for linking
          isExporting,
          isPlaying,
          setRenderTick
      });

      // Apply Color Correction
      applyObjectEffects(container, obj);

      // Selection Border
      if (isSelected && !isExporting && !isSnapshotRequested) { 
        const border = new PIXI.Graphics();
        const w = content ? content.width : (obj as any).width || 100; 
        const h = content ? content.height : (obj as any).height || 100;
        border.rect(0, 0, w, h); border.stroke({ width: 2, color: 0xffd700 });
        container.addChild(border);
      }

      // Transform Calculation
      let currentX = obj.x; let currentY = obj.y;
      const rawProgress = (time - obj.startTime) / obj.duration; const progress = Math.max(0, Math.min(1, rawProgress));

      if (obj.motionPath && obj.motionPath.length > 1) {
          const path = obj.motionPath; let idx = 0;
          while (idx < path.length - 1 && path[idx+1].time < progress) idx++;
          const p1 = path[idx]; const p2 = path[idx+1] || p1;
          const range = p2.time - p1.time; const localRatio = range <= 0 ? 0 : (progress - p1.time) / range;
          currentX = p1.x + (p2.x - p1.x) * localRatio; currentY = p1.y + (p2.y - p1.y) * localRatio;
      } else if (obj.enableAnimation) {
          const easeFunc = easingFunctions[obj.easing] || easingFunctions.linear; const easedProgress = easeFunc(progress);
          currentX = obj.x + (obj.endX - obj.x) * easedProgress; currentY = obj.y + (obj.endY - obj.y) * easedProgress;
      }
      
      const groupEffects = getGroupTransforms(obj, time, currentObjects);
      
      // Vibration Offset
      const vib = getVibrationOffset(obj, time);

      container.x = currentX + groupEffects.x + vib.x; 
      container.y = currentY + groupEffects.y + vib.y;
      container.rotation = ((obj.rotation || 0) + groupEffects.rotation) * (Math.PI / 180);
      container.scale.set((obj.scaleX ?? 1) * groupEffects.scaleX, (obj.scaleY ?? 1) * groupEffects.scaleY);
      container.alpha = (obj.opacity ?? 1) * groupEffects.alpha;
      container.zIndex = obj.layer; 
      
      if (!isExporting && dragRef.current.active && dragRef.current.targetId === obj.id) {
          container.alpha *= 0.6;
      }
    });

    // 3. Clipping Mask Logic
    // PixiJSのmaskは、「maskに指定されたオブジェクトの形状で切り抜く」
    // 「上のオブジェクトでクリッピング」 => 「このオブジェクトを、直下のレイヤー(layer-1)のオブジェクトで切り抜く」
    // PixiJSでは mask プロパティに DisplayObject を渡す
    visibleObjects.forEach(obj => {
        const container = currentPixiObjects.get(obj.id);
        if (!container) return;

        if (obj.clipping) {
            // 直下のレイヤー (layer - 1) のオブジェクトを探す
            // 同じ時間に存在している必要がある
            const targetObj = visibleObjects.find(o => o.layer === obj.layer - 1);
            if (targetObj) {
                const targetContainer = currentPixiObjects.get(targetObj.id);
                if (targetContainer) {
                    // 注意: PixiJSのmaskは、maskとして使われるオブジェクトを描画しないモードになることがある
                    // また、同じオブジェクトを複数のmaskに使うことはできない場合がある
                    // ここでは単純に参照を渡すが、描画が消える場合は mask用の複製を作る必要があるかも知れない
                    container.mask = targetContainer;
                } else {
                    container.mask = null;
                }
            } else {
                container.mask = null;
            }
        } else {
            container.mask = null;
        }
    });

    app.stage.sortChildren();
    app.render();
  }, [selectedId, isExporting, isPlaying, isSnapshotRequested]);

  // --- Effects ---
  useEffect(() => { 
      if (!isExporting) renderScene(currentTime, objects); 
  }, [currentTime, objects, renderScene, renderTick, isExporting]);
  
  // --- Export Hook ---
  useProjectExport(pixiAppRef, videoElementsRef, renderScene);

  const scale = 800 / Math.max(projectSettings.width, 1);

  return (
    <div className="viewport-container" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', overflow: 'hidden' }}>
      {isExporting && <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', color: '#00ff00', zIndex: 9999, fontSize: '20px', fontWeight: 'bold', textShadow: '0 0 5px black' }}>EXPORTING...</div>}
      <div ref={containerRef} style={{ width: projectSettings.width, height: projectSettings.height, transform: `scale(${Math.min(0.7, scale)})`, transformOrigin: 'center center', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
    </div>
  );
};
export default Viewport;