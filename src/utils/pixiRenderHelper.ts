import * as PIXI from 'pixi.js';
import { TimelineObject, GroupControlObject } from '../types';
import { createGradientTexture, drawShape, getCurrentViseme } from './pixiUtils';

// グループ制御による座標・回転・スケールの計算
export const getGroupTransforms = (obj: TimelineObject, time: number, allObjects: TimelineObject[]) => {
    let x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, alpha = 1;
    
    const groups = allObjects.filter(o => 
        o.type === 'group_control' && 
        o.layer < obj.layer && 
        time >= o.startTime && time < o.startTime + o.duration
    ) as GroupControlObject[];

    groups.forEach(group => {
        if (group.targetLayerCount === 0 || (obj.layer <= group.layer + group.targetLayerCount)) {
            const progress = Math.max(0, Math.min(1, (time - group.startTime) / group.duration));
            
            const gx = group.enableAnimation ? group.x + (group.endX - group.x) * progress : group.x;
            const gy = group.enableAnimation ? group.y + (group.endY - group.y) * progress : group.y;
            
            x += gx;
            y += gy;
            rotation += group.rotation || 0;
            scaleX *= (group.scaleX ?? 1);
            scaleY *= (group.scaleY ?? 1);
            alpha *= (group.opacity ?? 1);
        }
    });

    return { x, y, rotation, scaleX, scaleY, alpha };
};

// リップシンクのViseme取得
export const getLipSyncViseme = (obj: TimelineObject, time: number, currentObjects: TimelineObject[]) => {
    if (obj.type !== 'psd' || !obj.lipSync?.enabled) return null;

    let audioSource: any = undefined;

    if (obj.lipSync.sourceMode === 'layer' && obj.lipSync.targetLayer !== undefined) {
        audioSource = currentObjects.find(o => 
            o.type === 'audio' && 
            o.layer === obj.lipSync!.targetLayer && 
            time >= o.startTime && time < o.startTime + o.duration
        );
    } else if (obj.lipSync.audioId) {
        audioSource = currentObjects.find(o => o.id === obj.lipSync!.audioId);
    }

    if (audioSource) {
        return getCurrentViseme(audioSource, time);
    }
    return null;
};

// Pixiコンテンツの生成・更新
export const updatePixiContent = (
    obj: TimelineObject,
    container: PIXI.Container,
    time: number,
    resources: {
        textureCache: Map<string, PIXI.Texture>;
        loadingUrls: Set<string>;
        videoElements: Map<string, HTMLVideoElement>;
        isExporting: boolean;
        isPlaying: boolean;
        setRenderTick: React.Dispatch<React.SetStateAction<number>>;
    }
) => {
    const { textureCache, loadingUrls, videoElements, isExporting, isPlaying, setRenderTick } = resources;
    let content: PIXI.Container | null = null;

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
        content = new PIXI.Text({ 
            text: obj.text, 
            style: { fontFamily: obj.fontFamily || 'Arial', fontSize: obj.fontSize, fill: obj.fill } 
        });
    } else if (obj.type === 'image' || obj.type === 'psd') {
        if (!obj.src) {
            const placeholder = new PIXI.Graphics();
            placeholder.rect(0, 0, obj.width || 100, obj.height || 100);
            placeholder.stroke({ width: 2, color: 0x00ffff });
            content = placeholder;
        } else {
            const cachedTexture = textureCache.get(obj.src);
            if (cachedTexture) {
                const sprite = new PIXI.Sprite(cachedTexture);
                if (obj.type === 'psd') {
                    sprite.scale.set(obj.scale || 1.0);
                } else {
                    sprite.width = obj.width;
                    sprite.height = obj.height;
                }
                content = sprite;
            } else {
                const placeholder = new PIXI.Graphics();
                placeholder.rect(0, 0, obj.width || 100, obj.height || 100);
                placeholder.stroke({ width: 2, color: 0x00ff00 });
                content = placeholder;
                
                if (!loadingUrls.has(obj.src)) {
                    loadingUrls.add(obj.src);
                    const img = new Image();
                    img.src = obj.src;
                    img.onload = () => {
                        textureCache.set(obj.src, PIXI.Texture.from(img));
                        loadingUrls.delete(obj.src);
                        setRenderTick(prev => prev + 1);
                    };
                }
            }
        }
    } else if (obj.type === 'video') {
        let video = videoElements.get(obj.id);
        if (!video) {
            video = document.createElement('video');
            video.src = obj.src;
            video.muted = obj.muted;
            video.volume = obj.volume;
            video.crossOrigin = 'anonymous';
            video.preload = 'auto';
            video.playsInline = true;
            video.addEventListener('canplay', () => setRenderTick(p => p+1), { once: true });
            videoElements.set(obj.id, video);
        }
        
        if (video.readyState >= 2 && video.videoWidth > 0) {
            const texture = PIXI.Texture.from(video);
            if (isExporting) texture.source.update();
            const sprite = new PIXI.Sprite(texture);
            sprite.width = obj.width;
            sprite.height = obj.height;
            content = sprite;

            // Video Playback Sync
            const offset = obj.offset || 0;
            const videoLocalTime = (time - obj.startTime) + offset;
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
            const placeholder = new PIXI.Graphics();
            placeholder.rect(0, 0, obj.width, obj.height);
            placeholder.stroke({ width: 2, color: 0x0000ff });
            content = placeholder;
        }
    } else if (obj.type === 'group_control') {
        const g = new PIXI.Graphics();
        g.rect(0, 0, 100, 100);
        g.stroke({ width: 2, color: 0x00ff00 });
        const t = new PIXI.Text({ text: 'Group\nControl', style: { fontSize: 14, fill: 0x00ff00, fontWeight: 'bold' } });
        g.addChild(t);
        content = g;
    }

    if (content) container.addChild(content);
    return content;
};