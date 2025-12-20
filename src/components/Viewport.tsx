import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject, GroupControlObject, AudioObject, PsdObject } from '../types';
import { easingFunctions } from '../utils/easings';
import { createGradientTexture, drawShape, createShadowGraphics, getCurrentViseme } from '../utils/pixiUtils';

const { ipcRenderer } = window;

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const videoPlayPromisesRef = useRef<Map<string, Promise<void> | null>>(new Map());

  const [renderTick, setRenderTick] = useState(0);
  const isRecordingPathRef = useRef(false);
  const recordedPathRef = useRef<{time: number, x: number, y: number}[]>([]);
  const recordingStartTimeRef = useRef(0);

  const { 
    currentTime, objects, selectedId, selectObject, updateObject, 
    projectSettings, isPlaying, isExporting, setExporting, setTime, pushHistory 
  } = useStore();
  
  const latestObjectsRef = useRef(objects);
  latestObjectsRef.current = objects;
  const dragRef = useRef<{active: boolean; targetId: string | null; startX: number; startY: number; initialObjState: TimelineObject | null;}>({ active: false, targetId: null, startX: 0, startY: 0, initialObjState: null });

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
  }, []);

  const getGroupTransforms = (obj: TimelineObject, time: number, allObjects: TimelineObject[]) => {
      let x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, alpha = 1;
      const groups = allObjects.filter(o => o.type === 'group_control' && o.layer < obj.layer && time >= o.startTime && time < o.startTime + o.duration) as GroupControlObject[];
      groups.forEach(group => {
          if (group.targetLayerCount === 0 || (obj.layer <= group.layer + group.targetLayerCount)) {
              const progress = Math.max(0, Math.min(1, (time - group.startTime) / group.duration));
              const gx = group.enableAnimation ? group.x + (group.endX - group.x) * progress : group.x;
              const gy = group.enableAnimation ? group.y + (group.endY - group.y) * progress : group.y;
              x += gx; y += gy;
              rotation += group.rotation || 0;
              scaleX *= (group.scaleX ?? 1); scaleY *= (group.scaleY ?? 1);
              alpha *= (group.opacity ?? 1);
          }
      });
      return { x, y, rotation, scaleX, scaleY, alpha };
  };

  const renderScene = useCallback((time: number, currentObjects: TimelineObject[]) => {
    const app = pixiAppRef.current;
    if (!app) return;
    const currentPixiObjects = pixiObjectsRef.current;
    const currentVideoElements = videoElementsRef.current;
    const currentAudioElements = audioElementsRef.current;
    const visibleObjects = currentObjects.filter(obj => time >= obj.startTime && time < obj.startTime + obj.duration);

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

      // リップシンク計算
      let lipSyncViseme: string | null = null;
      if (obj.type === 'psd' && obj.lipSync?.enabled) {
          let audioSource: AudioObject | undefined;

          if (obj.lipSync.sourceMode === 'layer' && obj.lipSync.targetLayer !== undefined) {
             // ターゲットレイヤー上の音声を探索
             audioSource = currentObjects.find(o => 
                 o.type === 'audio' && 
                 o.layer === obj.lipSync!.targetLayer && 
                 time >= o.startTime && time < o.startTime + o.duration
             ) as AudioObject;
          } else if (obj.lipSync.audioId) {
             // 従来のID指定（一応残す）
             audioSource = currentObjects.find(o => o.id === obj.lipSync!.audioId) as AudioObject;
          }

          if (audioSource) {
              const viseme = getCurrentViseme(audioSource, time);
              if (viseme) lipSyncViseme = viseme;
          }
      }

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

      if (obj.shadow && obj.shadow.enabled) {
          const w = (obj as any).width || 100; const h = (obj as any).height || 100;
          const shadow = createShadowGraphics(obj, w, h, obj.shadow);
          if (shadow) container.addChild(shadow);
      }
      
      let content: PIXI.Container | null = null;
      let border: PIXI.Graphics | null = null;

      if (obj.type === 'shape') {
        const graphics = new PIXI.Graphics();
        drawShape(graphics, obj);
        if (obj.gradient && obj.gradient.enabled) {
             const texture = createGradientTexture(obj.width, obj.height, obj.gradient);
             graphics.fill({ texture });
        } else {
             graphics.fill(obj.fill);
        }
        content = graphics;
      } else if (obj.type === 'text') {
        content = new PIXI.Text({ text: obj.text, style: { fontFamily: obj.fontFamily || 'Arial', fontSize: obj.fontSize, fill: obj.fill } });
      } else if (obj.type === 'image' || obj.type === 'psd') {
        if (!obj.src) {
            const placeholder = new PIXI.Graphics(); placeholder.rect(0, 0, obj.width || 100, obj.height || 100); placeholder.stroke({ width: 2, color: 0x00ffff }); content = placeholder;
        } else {
            const cachedTexture = textureCacheRef.current.get(obj.src);
            if (cachedTexture) {
                const sprite = new PIXI.Sprite(cachedTexture);
                if (obj.type === 'psd') sprite.scale.set(obj.scale || 1.0); else { sprite.width = obj.width; sprite.height = obj.height; }
                content = sprite;
            } else {
                const placeholder = new PIXI.Graphics(); placeholder.rect(0, 0, obj.width || 100, obj.height || 100); placeholder.stroke({ width: 2, color: 0x00ff00 }); content = placeholder;
                if (!loadingUrlsRef.current.has(obj.src)) {
                    loadingUrlsRef.current.add(obj.src); const img = new Image(); img.src = obj.src;
                    img.onload = () => { textureCacheRef.current.set(obj.src, PIXI.Texture.from(img)); loadingUrlsRef.current.delete(obj.src); setRenderTick(prev => prev + 1); };
                }
            }
        }
        
        if (lipSyncViseme && obj.type === 'psd' && obj.lipSync) {
            // @ts-ignore
            const targetSeq = obj.lipSync.mapping[lipSyncViseme];
            // ここで本来はレイヤー切り替え処理を行う (targetSeq以外非表示など)
            // console.log(`LipSync: ${lipSyncViseme} on Layer ${obj.lipSync.targetLayer} -> Seq ${targetSeq}`);
        }

      } else if (obj.type === 'video') {
        let video = currentVideoElements.get(obj.id);
        if (!video) {
            video = document.createElement('video'); video.src = obj.src; video.muted = obj.muted; video.volume = obj.volume;
            video.crossOrigin = 'anonymous'; video.preload = 'auto'; video.playsInline = true;
            video.addEventListener('canplay', () => setRenderTick(p => p+1), { once: true });
            currentVideoElements.set(obj.id, video);
        }
        if (video.readyState >= 2 && video.videoWidth > 0) {
            const texture = PIXI.Texture.from(video); if (isExporting) texture.source.update();
            const sprite = new PIXI.Sprite(texture); sprite.width = obj.width; sprite.height = obj.height; content = sprite;
            const offset = obj.offset || 0; const videoLocalTime = (time - obj.startTime) + offset;
            if (!isExporting) {
                if (isPlaying) {
                    if (video.paused) { const pp = video.play(); if (pp) pp.catch(()=>{}); }
                    if (Math.abs(video.currentTime - videoLocalTime) > 0.2) video.currentTime = videoLocalTime;
                } else {
                    if (!video.paused) video.pause();
                    if (Math.abs(video.currentTime - videoLocalTime) > 0.05) video.currentTime = videoLocalTime;
                }
            }
        } else {
            const placeholder = new PIXI.Graphics(); placeholder.rect(0, 0, obj.width, obj.height); placeholder.stroke({ width: 2, color: 0x0000ff }); content = placeholder;
        }
      } else if (obj.type === 'group_control') {
          const g = new PIXI.Graphics(); g.rect(0, 0, 100, 100); g.stroke({ width: 2, color: 0x00ff00 });
          const t = new PIXI.Text({ text: 'Group\nControl', style: { fontSize: 14, fill: 0x00ff00, fontWeight: 'bold' } }); g.addChild(t); content = g;
      }

      if (isSelected && !isExporting) { 
        border = new PIXI.Graphics();
        const w = content ? content.width : (obj as any).width || 100; const h = content ? content.height : (obj as any).height || 100;
        border.rect(0, 0, w, h); border.stroke({ width: 2, color: 0xffd700 });
      }

      if (content) container.addChild(content);
      if (border) container.addChild(border);

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
      container.x = currentX + groupEffects.x; container.y = currentY + groupEffects.y;
      container.rotation = ((obj.rotation || 0) + groupEffects.rotation) * (Math.PI / 180);
      container.scale.set((obj.scaleX ?? 1) * groupEffects.scaleX, (obj.scaleY ?? 1) * groupEffects.scaleY);
      container.alpha = (obj.opacity ?? 1) * groupEffects.alpha;
      container.zIndex = obj.layer; 
      if (!isExporting && dragRef.current.active && dragRef.current.targetId === obj.id) container.alpha *= 0.6;
    });

    app.stage.sortChildren();
    app.render();
  }, [selectedId, isExporting, isPlaying]);

  useEffect(() => { if (!isExporting) renderScene(currentTime, objects); }, [currentTime, objects, renderScene, renderTick, isExporting]);
  
  useEffect(() => {
    if (!isExporting) return;
    const runExport = async () => {
        const app = pixiAppRef.current; if (!app) return;
        const { projectSettings, objects } = useStore.getState();
        const fps = projectSettings.fps; const dt = 1 / fps;
        const lastObjectEndTime = Math.max(...objects.map(o => o.startTime + o.duration), 0);
        const exportDuration = Math.max(lastObjectEndTime, 1);
        const totalFrames = Math.ceil(exportDuration * fps);
        const videos = Array.from(videoElementsRef.current.values());
        videos.forEach(v => v.pause());
        const result = await ipcRenderer.invoke('start-export', { width: projectSettings.width, height: projectSettings.height, fps: fps });
        if (!result.success) { alert("Export failed: " + result.error); setExporting(false); return; }
        for (let i = 0; i < totalFrames; i++) {
            const t = i * dt; setTime(t);
            const activeVideos = objects.filter(obj => obj.type === 'video' && t >= obj.startTime && t < obj.startTime + obj.duration);
            if (activeVideos.length > 0) {
                const seekPromises = activeVideos.map(obj => {
                    const video = videoElementsRef.current.get(obj.id);
                    if (video && video.readyState >= 1) {
                        const offset = obj.offset || 0; const targetTime = (t - obj.startTime) + offset;
                        if (Math.abs(video.currentTime - targetTime) < 0.001) return Promise.resolve();
                        return new Promise<void>((resolve) => {
                            const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
                            setTimeout(() => { video.removeEventListener('seeked', onSeeked); resolve(); }, 1000);
                            video.addEventListener('seeked', onSeeked); video.currentTime = targetTime;
                        });
                    } return Promise.resolve();
                }); await Promise.all(seekPromises);
            }
            renderScene(t, objects); await new Promise(r => setTimeout(r, 10));
            const base64 = app.canvas.toDataURL('image/jpeg', 0.90); await ipcRenderer.invoke('write-frame', base64);
        }
        await ipcRenderer.invoke('end-export'); alert("Export Finished!"); setExporting(false);
    };
    runExport();
  }, [isExporting]);

  const onDragStart = (e: PIXI.FederatedPointerEvent, targetId: string) => {
    if (useStore.getState().isExporting) return; e.stopPropagation();
    if ((window as any).isPathRecordingMode) {
        isRecordingPathRef.current = true; recordedPathRef.current = []; recordingStartTimeRef.current = Date.now();
        if (!isPlaying) useStore.getState().togglePlay();
    }
    const currentObj = latestObjectsRef.current.find(o => o.id === targetId); if (!currentObj) return;
    if (!isRecordingPathRef.current) pushHistory();
    selectObject(targetId); const globalPos = e.global;
    dragRef.current = { active: true, targetId: targetId, startX: globalPos.x, startY: globalPos.y, initialObjState: { ...currentObj } };
  };
  const onDragMove = (e: PIXI.FederatedPointerEvent) => {
    if (isRecordingPathRef.current && dragRef.current.active) {
        const { targetId } = dragRef.current; if (!targetId) return; const globalPos = e.global;
        recordedPathRef.current.push({ time: 0, x: globalPos.x, y: globalPos.y }); updateObject(targetId, { x: globalPos.x, y: globalPos.y }); return;
    }
    const { active, targetId, startX, startY, initialObjState } = dragRef.current; if (!active || !targetId || !initialObjState) return;
    const globalPos = e.global; const deltaX = globalPos.x - startX; const deltaY = globalPos.y - startY;
    const newProps: Partial<TimelineObject> = {};
    if (initialObjState.x !== undefined) newProps.x = Math.round(initialObjState.x + deltaX);
    if (initialObjState.y !== undefined) newProps.y = Math.round(initialObjState.y + deltaY);
    if (initialObjState.enableAnimation) {
        if (initialObjState.endX !== undefined) newProps.endX = Math.round(initialObjState.endX + deltaX);
        if (initialObjState.endY !== undefined) newProps.endY = Math.round(initialObjState.endY + deltaY);
    }
    updateObject(targetId, newProps);
  };
  const onDragEnd = () => { 
      if (isRecordingPathRef.current) {
          isRecordingPathRef.current = false; if (isPlaying) useStore.getState().togglePlay();
          const pathData = recordedPathRef.current;
          if (pathData.length > 1 && dragRef.current.targetId) {
             const normalizedPath = pathData.map((p, i) => ({ time: i / (pathData.length - 1), x: p.x, y: p.y }));
             pushHistory(); updateObject(dragRef.current.targetId, { motionPath: normalizedPath }); alert("Motion Path Recorded!");
          }
          (window as any).isPathRecordingMode = false;
      }
      if (dragRef.current.active) dragRef.current = { active: false, targetId: null, startX: 0, startY: 0, initialObjState: null }; 
  };
  const scale = 800 / Math.max(projectSettings.width, 1);
  return (
    <div className="viewport-container" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', overflow: 'hidden' }}>
      {isExporting && <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', color: '#00ff00', zIndex: 9999, fontSize: '20px', fontWeight: 'bold', textShadow: '0 0 5px black' }}>EXPORTING...</div>}
      <div ref={containerRef} style={{ width: projectSettings.width, height: projectSettings.height, transform: `scale(${Math.min(0.7, scale)})`, transformOrigin: 'center center', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
    </div>
  );
};
export default Viewport;