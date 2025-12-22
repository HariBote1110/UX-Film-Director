import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { createShadowGraphics } from '../utils/pixiUtils';
import { easingFunctions } from '../utils/easings';

import { usePixiInteraction } from '../hooks/usePixiInteraction';
import { useProjectExport } from '../hooks/useProjectExport';
import { getGroupTransforms, getLipSyncViseme, updatePixiContent, applyObjectEffects, getVibrationOffset } from '../utils/pixiRenderHelper';
import { VideoFrameProvider } from '../utils/VideoFrameProvider';
import VideoDebugPanel from './VideoDebugPanel'; // 新規追加

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  
  // VideoProvider管理
  const videoProvidersRef = useRef<Map<string, VideoFrameProvider>>(new Map());
  const videoFramesRef = useRef<Map<string, VideoFrame | null>>(new Map());

  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
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
    
    app.init({ 
        width: projectSettings.width, 
        height: projectSettings.height, 
        backgroundColor: '#1e1e1e', 
        preference: 'webgpu', 
        autoStart: false,
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
        
        videoProvidersRef.current.forEach(p => p.dispose());
        videoProvidersRef.current.clear();
        
        videoFramesRef.current.forEach(f => f?.close());
        videoFramesRef.current.clear();

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

  // --- Video Provider Management ---
  useEffect(() => {
    const currentProviders = videoProvidersRef.current;
    
    objects.forEach(obj => {
        if (obj.type === 'video' && !currentProviders.has(obj.id)) {
            const provider = new VideoFrameProvider(obj.src);
            currentProviders.set(obj.id, provider);
        }
    });

    currentProviders.forEach((provider, id) => {
        if (!objects.find(o => o.id === id)) {
            provider.dispose();
            currentProviders.delete(id);
            const frame = videoFramesRef.current.get(id);
            if (frame) frame.close();
            videoFramesRef.current.delete(id);
        }
    });
  }, [objects]);


  // --- Main Render Logic ---
  const renderScene = useCallback(async (time: number, currentObjects: TimelineObject[]) => {
    const app = pixiAppRef.current;
    if (!app) return;

    const currentPixiObjects = pixiObjectsRef.current;
    const currentAudioElements = audioElementsRef.current;
    const visibleObjects = currentObjects.filter(obj => time >= obj.startTime && time < obj.startTime + obj.duration);

    // Cleanup Pixi Objects
    currentPixiObjects.forEach((container, id) => {
      if (!visibleObjects.find(obj => obj.id === id)) {
        app.stage.removeChild(container);
        container.destroy({ children: true });
        currentPixiObjects.delete(id);
      }
    });

    // Fetch Video Frames
    const videoUpdatePromises = visibleObjects
        .filter(obj => obj.type === 'video')
        .map(async (obj) => {
            const provider = videoProvidersRef.current.get(obj.id);
            if (provider) {
                const offset = obj.offset || 0;
                const videoLocalTime = (time - obj.startTime) + offset;
                const newFrame = await provider.getFrame(videoLocalTime);
                
                if (newFrame) {
                    const oldFrame = videoFramesRef.current.get(obj.id);
                    if (oldFrame) oldFrame.close();
                    videoFramesRef.current.set(obj.id, newFrame);
                }
            }
        });
    
    await Promise.all(videoUpdatePromises);

    // Audio Cleanup
    currentAudioElements.forEach((audio, id) => {
        if (!visibleObjects.find(obj => obj.id === id && obj.type === 'audio')) {
            audio.pause(); audio.src = ""; audio.load(); currentAudioElements.delete(id);
        }
    });

    // Render visible objects
    visibleObjects.forEach(obj => {
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

      const content = updatePixiContent(obj, container, time, {
          textureCache: textureCacheRef.current,
          loadingUrls: loadingUrlsRef.current,
          videoFrames: videoFramesRef.current, 
          audioBuffers: audioBuffersRef.current, 
          allObjects: currentObjects,            
          isExporting,
          isPlaying,
          setRenderTick
      });

      if (content && obj.shadow && obj.shadow.enabled) {
          let shadow = container.children.find(c => c.label === 'shadow') as PIXI.Graphics;
          if (shadow) { shadow.clear(); }
          if (!shadow) {
              shadow = new PIXI.Graphics();
              shadow.label = 'shadow';
              container.addChildAt(shadow, 0);
          }
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
        if (border) { container.removeChild(border); border.destroy(); }
      }

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
    app.render();
  }, [selectedId, isExporting, isPlaying, isSnapshotRequested]);

  useEffect(() => { 
      if (!isExporting) renderScene(currentTime, objects); 
  }, [currentTime, objects, renderScene, renderTick, isExporting]);
  
  const dummyVideoMap = useRef(new Map<string, HTMLVideoElement>());
  useProjectExport(pixiAppRef, dummyVideoMap, renderScene);

  const scale = 800 / Math.max(projectSettings.width, 1);

  return (
    <div className="viewport-container" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', overflow: 'hidden' }}>
      {/* デバッグパネルを配置 */}
      <VideoDebugPanel providers={videoProvidersRef.current} currentTime={currentTime} />
      
      {isExporting && <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', color: '#00ff00', zIndex: 9999, fontSize: '20px', fontWeight: 'bold', textShadow: '0 0 5px black' }}>EXPORTING...</div>}
      <div ref={containerRef} style={{ width: projectSettings.width, height: projectSettings.height, transform: `scale(${Math.min(0.7, scale)})`, transformOrigin: 'center center', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
    </div>
  );
};
export default Viewport;