import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject, AudioObject } from '../types';
import { createShadowGraphics } from '../utils/pixiUtils';
import { easingFunctions } from '../utils/easings';

import { usePixiInteraction } from '../hooks/usePixiInteraction';
import { useProjectExport } from '../hooks/useProjectExport';
import { getGroupTransforms, getLipSyncViseme, updatePixiContent, applyObjectEffects, getVibrationOffset } from '../utils/pixiRenderHelper';

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const videoPlayPromisesRef = useRef<Map<string, Promise<void> | null>>(new Map());
  
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const [renderTick, setRenderTick] = useState(0);

  const { 
    currentTime, objects, selectedId, selectObject,
    projectSettings, isPlaying, isExporting, 
    isSnapshotRequested, finishSnapshot
  } = useStore();
  
  const latestObjectsRef = useRef(objects);
  latestObjectsRef.current = objects;

  const { onDragStart, onDragMove, onDragEnd, dragRef } = usePixiInteraction(latestObjectsRef);

  // --- Initialize Pixi App ---
  useEffect(() => {
    if (!containerRef.current) return;
    const app = new PIXI.Application();
    
    // 【重要】autoStart: false に設定。
    // PixiJSの勝手なTickerループを止め、React側の制御下でのみ描画させることで
    // 二重描画によるCPU負荷を回避する。
    app.init({ 
        width: projectSettings.width, 
        height: projectSettings.height, 
        backgroundColor: '#1e1e1e', 
        preference: 'webgpu',
        autoStart: false, // 自動描画停止
        sharedTicker: false
    }).then(() => {
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
        
        // 初回描画
        app.render();
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
  }, []); 

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

  // --- Audio Buffer Loading ---
  useEffect(() => {
    const loadBuffers = async () => {
        const hasViz = objects.some(o => o.type === 'audio_visualization');
        if (!hasViz) return;

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

    // 1. Cleanup
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
      // Audio Logic
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

      const lipSyncViseme = getLipSyncViseme(obj, time, currentObjects);

      let container = currentPixiObjects.get(obj.id);
      const isSelected = selectedId === obj.id;
      if (!container) {
        container = new PIXI.Container();
        container.label = obj.id; container.eventMode = 'static'; container.cursor = 'pointer';
        container.on('pointerdown', (e) => onDragStart(e, obj.id));
        container.on('pointerup', onDragEnd); container.on('pointerupoutside', onDragEnd); container.on('globalpointermove', onDragMove); 
        app.stage.addChild(container); currentPixiObjects.set(obj.id, container);
      }

      // Content Update
      const content = updatePixiContent(obj, container, time, {
          textureCache: textureCacheRef.current,
          loadingUrls: loadingUrlsRef.current,
          videoElements: videoElementsRef.current,
          audioBuffers: audioBuffersRef.current, 
          allObjects: currentObjects,            
          isExporting,
          isPlaying,
          setRenderTick
      });

      // Shadow Handling (Simplified for performance)
      if (content && obj.shadow && obj.shadow.enabled) {
          let shadow = container.children.find(c => c.label === 'shadow') as PIXI.Graphics;
          if (shadow) {
               // 既存のシャドウがあれば作り直さずにパラメータ更新したいところだが、
               // 簡易実装として再作成（頻度は高くないため許容）
               // container.removeChild(shadow); shadow.destroy(); shadow = null;
               // 最適化: clearして再描画
               shadow.clear();
          }
          if (!shadow) {
              // 新規作成
              shadow = new PIXI.Graphics();
              shadow.label = 'shadow';
              container.addChildAt(shadow, 0);
          }
          // 描画処理をここで行うべきだが、コード量の都合上、既存のcreateShadowGraphicsロジックを利用するため
          // 一旦破棄して再生成するパターンに戻す（またはcreateShadowGraphicsをGraphicsを受け取る形にリファクタ推奨）
          // 今回は一番確実な「破棄->再生成」で行く（Shadowは静止画が多いのでコスト低い）
           container.removeChild(shadow); shadow.destroy();
           const s = createShadowGraphics(obj, (content as any).width, (content as any).height, obj.shadow);
           if (s) {
               s.label = 'shadow';
               container.addChildAt(s, 0); 
           }
      } else {
          const shadow = container.children.find(c => c.label === 'shadow');
          if (shadow) { container.removeChild(shadow); shadow.destroy(); }
      }

      applyObjectEffects(container, obj);

      // Selection Border
      let border = container.children.find(c => c.label === 'border') as PIXI.Graphics;
      if (isSelected && !isExporting && !isSnapshotRequested) { 
        if (!border) {
            border = new PIXI.Graphics();
            border.label = 'border';
            container.addChild(border);
        }
        border.clear();
        const w = content ? content.width : (obj as any).width || 100; 
        const h = content ? content.height : (obj as any).height || 100;
        border.rect(0, 0, w, h); 
        border.stroke({ width: 2, color: 0xffd700 });
        container.setChildIndex(border, container.children.length - 1);
      } else {
        if (border) {
            container.removeChild(border);
            border.destroy();
        }
      }

      // Transform
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

    // 3. Clipping Mask
    visibleObjects.forEach(obj => {
        const container = currentPixiObjects.get(obj.id);
        if (!container) return;
        if (obj.clipping) {
            const targetObj = visibleObjects.find(o => o.layer === obj.layer - 1);
            if (targetObj) {
                const targetContainer = currentPixiObjects.get(targetObj.id);
                container.mask = targetContainer || null;
            } else {
                container.mask = null;
            }
        } else {
            container.mask = null;
        }
    });

    app.stage.sortChildren();
    
    // 手動レンダリング実行 (Ticker停止中のため必須)
    app.render();
  }, [selectedId, isExporting, isPlaying, isSnapshotRequested]);

  useEffect(() => { 
      if (!isExporting) renderScene(currentTime, objects); 
  }, [currentTime, objects, renderScene, renderTick, isExporting]);
  
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