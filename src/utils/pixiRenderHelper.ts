import * as PIXI from 'pixi.js';
import { TimelineObject, GroupControlObject, AudioVisualizationObject, AudioObject, ClippingParams } from '../types';
import { createGradientTexture, drawShape, getCurrentViseme } from './pixiUtils';

// --- 斜めクリッピング用フィルタ (Shader) ---
// PixiJS v8スタイルまたはv7互換のフィルタ定義
const vertexShader = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 projectionMatrix;
varying vec2 vTextureCoord;
void main(void) {
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
}
`;

// フラグメントシェーダー: UV座標を使ってクリッピング計算を行う
// uFrame: [x, y, width, height] of the sprite in local coords (approx)
// uClip: [top, bottom, left, right] (normalized 0-1 or pixels?)
// ここではピクセル単位のクリッピングを実現するために、Filterの寸法情報(uDimensions)を利用
const fragmentShader = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uClip; // top, bottom, left, right (px)
uniform float uAngle; // radians
uniform vec2 uDimensions; // width, height of the object (px)

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 coord = uv * uDimensions; // 0..width, 0..height
    vec2 center = uDimensions * 0.5;
    
    // 中心基準の座標に変換
    vec2 p = coord - center;
    
    // 回転 (-angle)
    float c = cos(-uAngle);
    float s = sin(-uAngle);
    vec2 p_rot = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    
    // 回転後の座標系で元の中心基準に戻す（判定用）
    // AviUtlの斜めクリッピングは「切り取る境界線」が回転するイメージ
    // -> 座標を逆回転させて、軸平行な境界線と比較する
    
    vec2 p_check = p_rot + center;

    // クリッピング判定
    // top: 上からの距離, bottom: 下からの距離...
    float topLimit = uClip.x;
    float bottomLimit = uDimensions.y - uClip.y;
    float leftLimit = uClip.z;
    float rightLimit = uDimensions.x - uClip.w;

    if (p_check.y < topLimit || p_check.y > bottomLimit || p_check.x < leftLimit || p_check.x > rightLimit) {
        discard;
        // または alpha = 0.0; gl_FragColor = vec4(0.0);
    } else {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
    }
}
`;

// PixiJS Filter Class Wrapper
class DiagonalClippingFilter extends PIXI.Filter {
    constructor(params: ClippingParams, width: number, height: number) {
        super(undefined, fragmentShader, {
            uClip: new Float32Array([params.top, params.bottom, params.left, params.right]),
            uAngle: (params.angle * Math.PI) / 180,
            uDimensions: new Float32Array([width, height]),
        });
    }

    updateParams(params: ClippingParams, width: number, height: number) {
        this.resources.uClip = new Float32Array([params.top, params.bottom, params.left, params.right]); // v8 style
        this.uniforms.uClip = new Float32Array([params.top, params.bottom, params.left, params.right]); // v7 compat
        this.uniforms.uAngle = (params.angle * Math.PI) / 180;
        this.uniforms.uDimensions = new Float32Array([width, height]);
    }
}


// --- 既存ヘルパー関数 ---

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

export const getVibrationOffset = (obj: TimelineObject, time: number) => {
    if (!obj.vibration || !obj.vibration.enabled) return { x: 0, y: 0 };
    
    const { strength, speed } = obj.vibration;
    if (strength === 0) return { x: 0, y: 0 };

    const t = time * speed;
    const randomX = Math.sin(t * 12.9898) * strength + Math.cos(t * 78.233) * strength * 0.5;
    const randomY = Math.cos(t * 12.9898) * strength + Math.sin(t * 78.233) * strength * 0.5;
    
    return { x: randomX, y: randomY };
};

const drawAudioWaveform = (
    graphics: PIXI.Graphics, 
    obj: AudioVisualizationObject, 
    time: number, 
    audioBuffers: Map<string, AudioBuffer>,
    allObjects: TimelineObject[]
) => {
    let targetAudio: AudioObject | undefined;
    
    // ターゲット音声の検索ロジック (ID優先、次にレイヤー指定)
    if (obj.targetAudioId) {
        targetAudio = allObjects.find(o => o.id === obj.targetAudioId) as AudioObject;
    } 
    
    // レイヤー指定がある場合 (targetLayer >= 0)
    if (!targetAudio && obj.targetLayer !== undefined && obj.targetLayer >= 0) {
        // 指定レイヤーにある、現在の時間に存在する音声を探す
        targetAudio = allObjects.find(o => 
            o.type === 'audio' && 
            o.layer === obj.targetLayer &&
            time >= o.startTime && time < o.startTime + o.duration
        ) as AudioObject;
    }

    if (!targetAudio || !targetAudio.src) {
        graphics.moveTo(0, obj.height / 2);
        graphics.lineTo(obj.width, obj.height / 2);
        graphics.stroke({ width: 2, color: 0x555555 });
        return;
    }

    const buffer = audioBuffers.get(targetAudio.id);
    if (!buffer) {
        graphics.moveTo(0, obj.height / 2);
        graphics.lineTo(obj.width, obj.height / 2);
        graphics.stroke({ width: 2, color: 0x888888 });
        return;
    }

    const data = buffer.getChannelData(0); 
    const audioLocalTime = (time - targetAudio.startTime) + (targetAudio.offset || 0);
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(audioLocalTime * sampleRate);
    
    const durationToShow = 0.05; 
    const samplesToShow = Math.floor(durationToShow * sampleRate);
    const step = Math.max(1, Math.floor(samplesToShow / obj.width)); 

    const amplitude = obj.amplitude ?? 1.0;
    const centerY = obj.height / 2;

    graphics.beginPath();
    let started = false;

    for (let i = 0; i < obj.width; i++) {
        const currentSampleIdx = startSample + (i * (samplesToShow / obj.width));
        const idx = Math.floor(currentSampleIdx);
        
        let val = 0;
        if (idx >= 0 && idx < data.length) {
            val = data[idx];
        }

        const y = centerY + val * (obj.height / 2) * amplitude;

        if (!started) {
            graphics.moveTo(i, y);
            started = true;
        } else {
            graphics.lineTo(i, y);
        }
    }
    
    graphics.stroke({ width: obj.thickness || 2, color: obj.color });
};

export const applyObjectEffects = (container: PIXI.Container, obj: TimelineObject) => {
    const filters: PIXI.Filter[] = [];

    // 1. 色調補正
    if (obj.colorCorrection && obj.colorCorrection.enabled) {
        const { brightness, contrast, saturation, hue } = obj.colorCorrection;
        const matrix = new PIXI.ColorMatrixFilter();
        matrix.hue(hue, false);
        matrix.saturate(saturation, true); 
        matrix.contrast(contrast, true);
        matrix.brightness(brightness, true);
        filters.push(matrix);
    }
    
    // 2. 斜めクリッピング (New)
    if (obj.customClipping && obj.customClipping.enabled) {
        const w = (obj as any).width || 100;
        const h = (obj as any).height || 100;
        const clipFilter = new DiagonalClippingFilter(obj.customClipping, w, h);
        filters.push(clipFilter);
    }

    container.filters = filters.length > 0 ? filters : null;
};

export const updatePixiContent = (
    obj: TimelineObject,
    container: PIXI.Container,
    time: number,
    resources: {
        textureCache: Map<string, PIXI.Texture>;
        loadingUrls: Set<string>;
        videoElements: Map<string, HTMLVideoElement>;
        audioBuffers?: Map<string, AudioBuffer>; 
        allObjects?: TimelineObject[];           
        isExporting: boolean;
        isPlaying: boolean;
        setRenderTick: React.Dispatch<React.SetStateAction<number>>;
    }
) => {
    const { textureCache, loadingUrls, videoElements, audioBuffers, allObjects, isExporting, isPlaying, setRenderTick } = resources;
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
    } else if (obj.type === 'audio_visualization') {
        const graphics = new PIXI.Graphics();
        if (audioBuffers && allObjects) {
            drawAudioWaveform(graphics, obj, time, audioBuffers, allObjects);
        } else {
            graphics.rect(0, 0, obj.width, obj.height);
            graphics.stroke({ width: 2, color: 0xff0000 });
        }
        content = graphics;

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