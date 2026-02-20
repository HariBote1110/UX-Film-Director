import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject, GradientFill, ObjectFilter } from '../types';
import { createShadowGraphics } from '../utils/pixiUtils';
import { shallow } from 'zustand/shallow';

import { usePixiInteraction } from '../hooks/usePixiInteraction';
import { useProjectExport } from '../hooks/useProjectExport';
import { getGroupTransforms, getLipSyncViseme, updatePixiContent, applyObjectEffects, getVibrationOffset, applyGroupGradientEffect } from '../utils/pixiRenderHelper';
import { evaluateObjectPositionAtTime } from '../utils/keyframes';
import { getEnabledObjectFiltersInOrder } from '../utils/filterStack';

const GROUP_GRADIENT_COMPONENT_PREFIX = 'group-gradient-component-';

type BoundsLike = { x: number; y: number; width: number; height: number };

const boundsIntersect = (a: BoundsLike, b: BoundsLike) => (
  a.x <= b.x + b.width
  && a.x + a.width >= b.x
  && a.y <= b.y + b.height
  && a.y + a.height >= b.y
);

const buildConnectedComponents = (containers: PIXI.Container[]): number[][] => {
  if (containers.length <= 1) return containers.length === 1 ? [[0]] : [];

  const boundsList = containers.map((container) => container.getBounds());
  const visited = new Array(containers.length).fill(false);
  const components: number[][] = [];

  for (let startIndex = 0; startIndex < containers.length; startIndex += 1) {
    if (visited[startIndex]) continue;

    const queue: number[] = [startIndex];
    visited[startIndex] = true;
    const component: number[] = [];

    while (queue.length > 0) {
      const currentIndex = queue.shift()!;
      component.push(currentIndex);

      for (let nextIndex = 0; nextIndex < containers.length; nextIndex += 1) {
        if (visited[nextIndex]) continue;
        if (!boundsIntersect(boundsList[currentIndex], boundsList[nextIndex])) continue;
        visited[nextIndex] = true;
        queue.push(nextIndex);
      }
    }

    components.push(component);
  }

  return components;
};

const flattenGroupGradientComponents = (groupContainer: PIXI.Container) => {
  const componentContainers = groupContainer.children.filter((child) => (
    typeof child.label === 'string' && child.label.startsWith(GROUP_GRADIENT_COMPONENT_PREFIX)
  )) as PIXI.Container[];

  componentContainers.forEach((componentContainer) => {
    const members = componentContainer.removeChildren() as PIXI.Container[];
    members.forEach((member) => {
      groupContainer.addChild(member);
    });
    applyGroupGradientEffect(componentContainer, undefined);
    groupContainer.removeChild(componentContainer);
    componentContainer.destroy({ children: false });
  });
};

const Viewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const pixiObjectsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const groupContainersRef = useRef<Map<string, PIXI.Container>>(new Map());
  
  const textureCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const videoPlayPromisesRef = useRef<Map<string, Promise<void> | null>>(new Map());
  
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const [renderTick, setRenderTick] = useState(0);

  const { 
    currentTime, objects, selectedIds, clearSelection,
    projectSettings, isPlaying, isExporting,
    layers,
    isSnapshotRequested, finishSnapshot
  } = useStore((state) => ({
    currentTime: state.currentTime,
    objects: state.objects,
    selectedIds: state.selectedIds,
    clearSelection: state.clearSelection,
    projectSettings: state.projectSettings,
    isPlaying: state.isPlaying,
    isExporting: state.isExporting,
    layers: state.layers,
    isSnapshotRequested: state.isSnapshotRequested,
    finishSnapshot: state.finishSnapshot,
  }), shallow);
  
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
          if (e.target === app.stage) clearSelection();
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
        groupContainersRef.current.clear();
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
    const currentGroupContainers = groupContainersRef.current;
    const visibleObjects = currentObjects.filter((obj) => {
      if (layers[obj.layer]?.visible === false) return false;
      return time >= obj.startTime && time < obj.startTime + obj.duration;
    });
    const visibleGroupIds = new Set(
      visibleObjects
        .map((obj) => obj.groupId)
        .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim() !== '')
    );

    // 1. Cleanup
    currentPixiObjects.forEach((container, id) => {
      if (!visibleObjects.find(obj => obj.id === id)) {
        container.parent?.removeChild(container);
        container.destroy({ children: true });
        currentPixiObjects.delete(id);
      }
    });
    currentGroupContainers.forEach((groupContainer, groupId) => {
      if (visibleGroupIds.has(groupId)) return;
      app.stage.removeChild(groupContainer);
      groupContainer.destroy({ children: false });
      currentGroupContainers.delete(groupId);
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

    visibleGroupIds.forEach((groupId) => {
      if (currentGroupContainers.has(groupId)) return;
      const groupContainer = new PIXI.Container();
      groupContainer.label = `group-${groupId}`;
      groupContainer.sortableChildren = true;
      app.stage.addChild(groupContainer);
      currentGroupContainers.set(groupId, groupContainer);
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

      const isSelected = selectedIds.includes(obj.id);
      if (obj.type === 'group_control' && !isSelected && isPlaying) return;

      const lipSyncViseme = getLipSyncViseme(obj, time, currentObjects);

      let container = currentPixiObjects.get(obj.id);
      if (!container) {
        container = new PIXI.Container();
        container.label = obj.id; container.eventMode = 'static'; container.cursor = 'pointer';
        container.on('pointerdown', (e) => onDragStart(e, obj.id));
        container.on('pointerup', onDragEnd); container.on('pointerupoutside', onDragEnd); container.on('globalpointermove', onDragMove); 
        currentPixiObjects.set(obj.id, container);
      }
      container.cursor = layers[obj.layer]?.locked ? 'not-allowed' : 'pointer';
      if (obj.groupId && currentGroupContainers.has(obj.groupId)) {
        const groupParent = currentGroupContainers.get(obj.groupId)!;
        const isAlreadyInsideGroup = container.parent === groupParent || container.parent?.parent === groupParent;
        if (!isAlreadyInsideGroup) {
          container.parent?.removeChild(container);
          groupParent.addChild(container);
        }
      } else if (container.parent !== app.stage) {
        container.parent?.removeChild(container);
        app.stage.addChild(container);
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

      const shadowFilters = getEnabledObjectFiltersInOrder(obj).filter((filter): filter is Extract<ObjectFilter, { type: 'shadow' }> => {
        return filter.type === 'shadow';
      });
      const currentShadowNodes = container.children.filter((child) => (child.label ?? '').startsWith('shadow'));
      currentShadowNodes.forEach((shadowNode) => {
        container.removeChild(shadowNode);
        shadowNode.destroy({ children: true });
      });
      if (content && shadowFilters.length > 0) {
        const shadowWidth = (content as any).width || (obj as any).width || 100;
        const shadowHeight = (content as any).height || (obj as any).height || 100;
        shadowFilters.forEach((shadowFilter, index) => {
          const shadow = createShadowGraphics(obj, shadowWidth, shadowHeight, {
            enabled: true,
            ...shadowFilter.params
          });
          if (!shadow) return;
          shadow.label = `shadow-${index}`;
          container.addChildAt(shadow, Math.min(index, container.children.length));
        });
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
        let bx = 0;
        let by = 0;
        let bw = (obj as any).width || 100;
        let bh = (obj as any).height || 100;

        if (content) {
          const globalBounds = content.getBounds();
          const topLeft = container.toLocal(new PIXI.Point(globalBounds.x, globalBounds.y));
          const bottomRight = container.toLocal(new PIXI.Point(globalBounds.x + globalBounds.width, globalBounds.y + globalBounds.height));

          bx = topLeft.x;
          by = topLeft.y;
          bw = Math.max(1, bottomRight.x - topLeft.x);
          bh = Math.max(1, bottomRight.y - topLeft.y);
        }

        border.rect(bx, by, bw, bh); 
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

      if (obj.keyframes && obj.keyframes.length > 1) {
          const keyed = evaluateObjectPositionAtTime(obj, time);
          currentX = keyed.x;
          currentY = keyed.y;
      } else if (obj.motionPath && obj.motionPath.length > 1) {
          const path = obj.motionPath; let idx = 0;
          while (idx < path.length - 1 && path[idx+1].time < progress) idx++;
          const p1 = path[idx]; const p2 = path[idx+1] || p1;
          const range = p2.time - p1.time; const localRatio = range <= 0 ? 0 : (progress - p1.time) / range;
          currentX = p1.x + (p2.x - p1.x) * localRatio; currentY = p1.y + (p2.y - p1.y) * localRatio;
      } else if (obj.enableAnimation) {
          const keyed = evaluateObjectPositionAtTime(obj, time);
          currentX = keyed.x;
          currentY = keyed.y;
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

    // 4. Group Gradient Filter
    const groupTopLayerMap = new Map<string, number>();
    const groupGradientMap = new Map<string, GradientFill | undefined>();
    const groupObjectContainersMap = new Map<string, PIXI.Container[]>();
    visibleObjects.forEach((obj) => {
      if (!obj.groupId || !currentGroupContainers.has(obj.groupId)) return;
      const prevTop = groupTopLayerMap.get(obj.groupId);
      if (prevTop === undefined || obj.layer > prevTop) {
        groupTopLayerMap.set(obj.groupId, obj.layer);
      }
      if (obj.groupGradient && !groupGradientMap.has(obj.groupId)) {
        groupGradientMap.set(obj.groupId, obj.groupGradient);
      }
      const objectContainer = currentPixiObjects.get(obj.id);
      if (!objectContainer) return;
      const members = groupObjectContainersMap.get(obj.groupId) ?? [];
      members.push(objectContainer);
      groupObjectContainersMap.set(obj.groupId, members);
    });
    currentGroupContainers.forEach((groupContainer, groupId) => {
      flattenGroupGradientComponents(groupContainer);

      const gradient = groupGradientMap.get(groupId);
      const members = groupObjectContainersMap.get(groupId) ?? [];
      const useConnectedScope = gradient?.scope !== 'group';
      const canSplitComponents = gradient?.enabled === true && useConnectedScope && members.length >= 2;

      if (canSplitComponents) {
        const components = buildConnectedComponents(members);
        if (components.length > 1) {
          applyGroupGradientEffect(groupContainer, undefined);
          components.forEach((componentMemberIndexes, componentIndex) => {
            const componentContainer = new PIXI.Container();
            componentContainer.label = `${GROUP_GRADIENT_COMPONENT_PREFIX}${groupId}-${componentIndex}`;
            componentContainer.sortableChildren = true;

            let topLayer = Number.NEGATIVE_INFINITY;
            componentMemberIndexes.forEach((memberIndex) => {
              const member = members[memberIndex];
              topLayer = Math.max(topLayer, member.zIndex);
              member.parent?.removeChild(member);
              componentContainer.addChild(member);
            });

            componentContainer.zIndex = Number.isFinite(topLayer) ? topLayer : 0;
            groupContainer.addChild(componentContainer);
            applyGroupGradientEffect(componentContainer, gradient);
          });

          groupContainer.sortChildren();
          groupContainer.zIndex = groupTopLayerMap.get(groupId) ?? 0;
          return;
        }
      }

      groupContainer.zIndex = groupTopLayerMap.get(groupId) ?? 0;
      applyGroupGradientEffect(groupContainer, gradient);
    });

    app.stage.sortChildren();
    
    // 手動レンダリング実行 (Ticker停止中のため必須)
    app.render();
  }, [selectedIds, isExporting, isPlaying, isSnapshotRequested, layers]);

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
