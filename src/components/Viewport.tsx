import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { easingFunctions } from '../utils/easings';
import { renderTimelineAudio } from '../utils/audioRenderer'; // Import

const { ipcRenderer } = window;

const Viewport: React.FC = () => {
  // ... (省略: RefやStateの定義は変更なし) ...
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const videoPlayPromisesRef = useRef<Map<string, Promise<void> | null>>(new Map());

  const [renderTick, setRenderTick] = useState(0);

  const { 
    currentTime, objects, selectedId, selectObject, updateObject, 
    projectSettings, isPlaying, isExporting, setExporting, setTime 
  } = useStore();
  
  const latestObjectsRef = useRef(objects);
  latestObjectsRef.current = objects;

  const dragRef = useRef<{
    active: boolean; targetId: string | null; startX: number; startY: number; initialObjState: TimelineObject | null;
  }>({ active: false, targetId: null, startX: 0, startY: 0, initialObjState: null });

  // ... (省略: useEffect [Init], renderScene, useEffect [Normal Loop] は変更なし) ...

  // --- 1. PixiJS Initialization (変更なし) ---
  useEffect(() => {
    if (!containerRef.current) return;
    const app = new PIXI.Application();
    app.init({ 
      width: projectSettings.width, height: projectSettings.height, 
      backgroundColor: '#1e1e1e', preference: 'webgpu', 
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
      }
    };
  }, []);

  // --- 2. Render Scene Function (変更なし) ---
  const renderScene = useCallback((time: number, currentObjects: TimelineObject[]) => {
      // (長いので省略。前回のコードと同じ内容)
      // ...
      const app = pixiAppRef.current;
      if (!app) return;
      const currentPixiObjects = pixiObjectsRef.current;
      const currentVideoElements = videoElementsRef.current;
      const visibleObjects = currentObjects.filter(obj => {
        const endTime = obj.startTime + obj.duration;
        return time >= obj.startTime && time < endTime;
      });
      currentPixiObjects.forEach((container, id) => {
        if (!visibleObjects.find(obj => obj.id === id)) {
          app.stage.removeChild(container); container.destroy({ children: true }); currentPixiObjects.delete(id);
          if (currentVideoElements.has(id)) {
              const video = currentVideoElements.get(id);
              if (video) { video.pause(); video.src = ""; video.load(); }
              currentVideoElements.delete(id); videoPlayPromisesRef.current.delete(id);
          }
        }
      });
      visibleObjects.forEach(obj => {
        let container = currentPixiObjects.get(obj.id);
        const isSelected = selectedId === obj.id;
        if (!container) {
          container = new PIXI.Container(); container.label = obj.id; container.eventMode = 'static'; container.cursor = 'pointer';
          container.on('pointerdown', (e) => onDragStart(e, obj.id)); container.on('pointerup', onDragEnd); container.on('pointerupoutside', onDragEnd); container.on('globalpointermove', onDragMove); 
          app.stage.addChild(container); currentPixiObjects.set(obj.id, container);
        }
        container.removeChildren();
        let content: PIXI.Container | null = null;
        let border: PIXI.Graphics | null = null;
        if (obj.type === 'shape') {
          const graphics = new PIXI.Graphics(); graphics.rect(0, 0, obj.width, obj.height); graphics.fill(obj.fill); content = graphics;
        } else if (obj.type === 'text') {
          content = new PIXI.Text({ text: obj.text, style: { fontFamily: 'Arial', fontSize: obj.fontSize, fill: obj.fill } });
        } else if (obj.type === 'image') {
          const cachedTexture = textureCacheRef.current.get(obj.src);
          if (cachedTexture) {
            const sprite = new PIXI.Sprite(cachedTexture); sprite.width = obj.width; sprite.height = obj.height; content = sprite;
          } else {
            const placeholder = new PIXI.Graphics(); placeholder.rect(0, 0, obj.width, obj.height); placeholder.stroke({ width: 2, color: 0x00ff00 }); content = placeholder;
            if (!loadingUrlsRef.current.has(obj.src)) {
              loadingUrlsRef.current.add(obj.src); const img = new Image(); img.src = obj.src;
              img.onload = () => { const texture = PIXI.Texture.from(img); textureCacheRef.current.set(obj.src, texture); loadingUrlsRef.current.delete(obj.src); setRenderTick(prev => prev + 1); };
            }
          }
        } else if (obj.type === 'video') {
          let video = currentVideoElements.get(obj.id);
          if (!video) {
              video = document.createElement('video'); video.src = obj.src; video.muted = obj.muted; video.volume = obj.volume;
              video.crossOrigin = 'anonymous'; video.preload = 'auto'; video.playsInline = true;
              video.addEventListener('canplay', () => setRenderTick(p => p+1), { once: true });
              currentVideoElements.set(obj.id, video);
          }
          const isReady = video.readyState >= 2 && video.videoWidth > 0;
          if (isReady) {
              const texture = PIXI.Texture.from(video); if (isExporting) texture.source.update();
              const sprite = new PIXI.Sprite(texture); sprite.width = obj.width; sprite.height = obj.height; content = sprite;
              const offset = obj.offset || 0; const videoLocalTime = (time - obj.startTime) + offset;
              if (!isExporting) {
                  if (isPlaying) { if (video.paused) { const pp = video.play(); if (pp) pp.catch(()=>{}); } if (Math.abs(video.currentTime - videoLocalTime) > 0.2) video.currentTime = videoLocalTime; }
                  else { if (!video.paused) video.pause(); if (Math.abs(video.currentTime - videoLocalTime) > 0.05) video.currentTime = videoLocalTime; }
              }
          } else {
              const placeholder = new PIXI.Graphics(); placeholder.rect(0, 0, obj.width, obj.height); placeholder.stroke({ width: 2, color: 0x0000ff }); content = placeholder;
          }
        }
        if (isSelected && !isExporting) { 
          border = new PIXI.Graphics(); const w = obj.type === 'text' && content ? content.width : ('width' in obj ? obj.width : 0); const h = obj.type === 'text' && content ? content.height : ('height' in obj ? obj.height : 0); border.rect(0, 0, w, h); border.stroke({ width: 2, color: 0xffd700 });
        }
        if (content) container.addChild(content); if (border) container.addChild(border);
        let currentX = obj.x; let currentY = obj.y;
        if (obj.enableAnimation) {
          const rawProgress = (time - obj.startTime) / obj.duration; const clampedProgress = Math.max(0, Math.min(1, rawProgress));
          const easeFunc = easingFunctions[obj.easing] || easingFunctions.linear; const easedProgress = easeFunc(clampedProgress);
          currentX = obj.x + (obj.endX - obj.x) * easedProgress; currentY = obj.y + (obj.endY - obj.y) * easedProgress;
        }
        container.x = currentX; container.y = currentY; container.zIndex = obj.layer; 
        container.alpha = (!isExporting && dragRef.current.active && dragRef.current.targetId === obj.id) ? 0.6 : 1.0;
      });
      app.stage.sortChildren();
      app.render();
  }, [selectedId, isExporting, isPlaying]);

  // --- 3. Normal Loop (変更なし) ---
  useEffect(() => {
    if (isExporting) return;
    renderScene(currentTime, objects);
  }, [currentTime, objects, renderScene, renderTick, isExporting]);

  // --- 4. Export Loop (音声対応) ---
  useEffect(() => {
    if (!isExporting) return;

    const runExport = async () => {
        const app = pixiAppRef.current;
        if (!app) return;

        const { projectSettings, objects } = useStore.getState();
        const fps = projectSettings.fps;
        const dt = 1 / fps;
        const lastObjectEndTime = Math.max(...objects.map(o => o.startTime + o.duration), 0);
        const exportDuration = Math.max(lastObjectEndTime, 1);
        const totalFrames = Math.ceil(exportDuration * fps);

        // ビデオ停止
        const videos = Array.from(videoElementsRef.current.values());
        videos.forEach(v => v.pause());

        console.log(`Start Exporting... Duration: ${exportDuration.toFixed(2)}s`);

        // --- STEP 1: Audio Rendering ---
        let audioPath: string | null = null;
        try {
            console.log("Rendering Audio...");
            // WebAudioで音声合成 -> WAV生成
            const wavBuffer = await renderTimelineAudio(objects, exportDuration, projectSettings.sampleRate);
            
            // Mainプロセスへ送信して一時ファイルに保存
            const saveResult = await ipcRenderer.invoke('save-temp-audio', wavBuffer);
            if (saveResult.success) {
                audioPath = saveResult.path;
                console.log("Audio rendered to:", audioPath);
            } else {
                console.warn("Audio save failed:", saveResult.error);
            }
        } catch (e) {
            console.error("Audio rendering failed:", e);
        }

        // --- STEP 2: Video Encoding (With Audio) ---
        // start-exportにaudioPathを渡す
        const result = await ipcRenderer.invoke('start-export', {
            width: projectSettings.width, 
            height: projectSettings.height, 
            fps: fps,
            audioPath: audioPath // 追加
        });

        if (!result.success) {
            alert("Export failed: " + result.error);
            setExporting(false);
            return;
        }

        // Frame Loop
        for (let i = 0; i < totalFrames; i++) {
            const t = i * dt;
            setTime(t);

            const activeVideos = objects.filter(obj => 
                obj.type === 'video' && t >= obj.startTime && t < obj.startTime + obj.duration
            );
            
            if (activeVideos.length > 0) {
                const seekPromises = activeVideos.map(obj => {
                    const video = videoElementsRef.current.get(obj.id);
                    if (video && video.readyState >= 1) {
                        const offset = obj.offset || 0;
                        const targetTime = (t - obj.startTime) + offset;
                        if (Math.abs(video.currentTime - targetTime) < 0.001) return Promise.resolve();
                        return new Promise<void>((resolve) => {
                            const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
                            setTimeout(() => { video.removeEventListener('seeked', onSeeked); resolve(); }, 1000);
                            video.addEventListener('seeked', onSeeked);
                            video.currentTime = targetTime;
                        });
                    }
                    return Promise.resolve();
                });
                await Promise.all(seekPromises);
            }

            renderScene(t, objects);
            await new Promise(r => setTimeout(r, 10)); // 少し待機
            const base64 = app.canvas.toDataURL('image/jpeg', 0.90);
            await ipcRenderer.invoke('write-frame', base64);
        }

        await ipcRenderer.invoke('end-export');
        alert("Export Finished!");
        setExporting(false);
    };

    runExport();

  }, [isExporting]);

  // ... (Handlers and Render unchanged) ...
  const onDragStart = (e: PIXI.FederatedPointerEvent, targetId: string) => {
    if (useStore.getState().isExporting) return;
    e.stopPropagation();
    const currentObj = latestObjectsRef.current.find(o => o.id === targetId);
    if (!currentObj) return;
    selectObject(targetId);
    const globalPos = e.global;
    dragRef.current = { active: true, targetId: targetId, startX: globalPos.x, startY: globalPos.y, initialObjState: { ...currentObj } };
  };
  const onDragMove = (e: PIXI.FederatedPointerEvent) => {
    const { active, targetId, startX, startY, initialObjState } = dragRef.current;
    if (!active || !targetId || !initialObjState) return;
    const globalPos = e.global;
    const deltaX = globalPos.x - startX;
    const deltaY = globalPos.y - startY;
    const newProps: Partial<TimelineObject> = {};
    if (initialObjState.x !== undefined) newProps.x = initialObjState.x + deltaX;
    if (initialObjState.y !== undefined) newProps.y = initialObjState.y + deltaY;
    if (initialObjState.enableAnimation) {
        if (initialObjState.endX !== undefined) newProps.endX = initialObjState.endX + deltaX;
        if (initialObjState.endY !== undefined) newProps.endY = initialObjState.endY + deltaY;
    }
    updateObject(targetId, newProps);
  };
  const onDragEnd = () => { if (dragRef.current.active) dragRef.current = { active: false, targetId: null, startX: 0, startY: 0, initialObjState: null }; };

  const scale = 800 / Math.max(projectSettings.width, 1);

  return (
    <div className="viewport-container" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', overflow: 'hidden' }}>
      {isExporting && (
          <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', color: '#00ff00', zIndex: 9999, fontSize: '20px', fontWeight: 'bold', textShadow: '0 0 5px black' }}>
              EXPORTING... {(currentTime / Math.max(Math.max(...objects.map(o => o.startTime + o.duration), 0), 1) * 100).toFixed(0)}%
          </div>
      )}
      <div ref={containerRef} style={{ 
          width: projectSettings.width, height: projectSettings.height, 
          transform: `scale(${Math.min(0.7, scale)})`, transformOrigin: 'center center',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)'
      }} />
    </div>
  );
};
export default Viewport;