import * as PIXI from 'pixi.js';
import { TimelineObject, GroupControlObject, AudioVisualizationObject, AudioObject, ClippingParams } from '../types';
import { createGradientTexture, drawShape, getCurrentViseme } from './pixiUtils';

// --- キャッシュ ---
const videoCanvasCache = new Map<string, HTMLCanvasElement>();
const videoCtxCache = new Map<string, CanvasRenderingContext2D>();
// Texture自体もキャッシュする
const videoTextureCache = new Map<string, PIXI.Texture>();

// --- Shader Definitions ---
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
const fragmentShader = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uClip;
uniform float uAngle;
uniform vec2 uDimensions;
void main(void) {
    vec2 uv = vTextureCoord;
    vec2 coord = uv * uDimensions; 
    vec2 center = uDimensions * 0.5;
    vec2 p = coord - center;
    float c = cos(-uAngle);
    float s = sin(-uAngle);
    vec2 p_rot = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    vec2 p_check = p_rot + center;
    float topLimit = uClip.x;
    float bottomLimit = uDimensions.y - uClip.y;
    float leftLimit = uClip.z;
    float rightLimit = uDimensions.x - uClip.w;
    if (p_check.y < topLimit || p_check.y > bottomLimit || p_check.x < leftLimit || p_check.x > rightLimit) {
        discard;
    } else {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
    }
}
`;
class DiagonalClippingFilter extends PIXI.Filter {
    constructor(params: ClippingParams, width: number, height: number) {
        super(undefined, fragmentShader, {
            uClip: new Float32Array([params.top, params.bottom, params.left, params.right]),
            uAngle: (params.angle * Math.PI) / 180,
            uDimensions: new Float32Array([width, height]),
        });
    }
    updateParams(params: ClippingParams, width: number, height: number) {
        this.resources.uClip = new Float32Array([params.top, params.bottom, params.left, params.right]);
        this.uniforms.uClip = new Float32Array([params.top, params.bottom, params.left, params.right]);
        this.uniforms.uAngle = (params.angle * Math.PI) / 180;
        this.uniforms.uDimensions = new Float32Array([width, height]);
    }
}

// --- Helper Functions ---

export const getGroupTransforms = (obj: TimelineObject, time: number, allObjects: TimelineObject[]) => {
    let x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, alpha = 1;
    const groups = allObjects.filter(o => o.type === 'group_control' && o.layer < obj.layer && time >= o.startTime && time < o.startTime + o.duration) as GroupControlObject[];
    groups.forEach(group => {
        if (group.targetLayerCount === 0 || (obj.layer <= group.layer + group.targetLayerCount)) {
            const progress = Math.max(0, Math.min(1, (time - group.startTime) / group.duration));
            const gx = group.enableAnimation ? group.x + (group.endX - group.x) * progress : group.x;
            const gy = group.enableAnimation ? group.y + (group.endY - group.y) * progress : group.y;
            x += gx; y += gy; rotation += group.rotation || 0;
            scaleX *= (group.scaleX ?? 1); scaleY *= (group.scaleY ?? 1); alpha *= (group.opacity ?? 1);
        }
    });
    return { x, y, rotation, scaleX, scaleY, alpha };
};

export const getLipSyncViseme = (obj: TimelineObject, time: number, currentObjects: TimelineObject[]) => {
    if (obj.type !== 'psd' || !obj.lipSync?.enabled) return null;
    let audioSource: any = undefined;
    if (obj.lipSync.sourceMode === 'layer' && obj.lipSync.targetLayer !== undefined) {
        audioSource = currentObjects.find(o => o.type === 'audio' && o.layer === obj.lipSync!.targetLayer && time >= o.startTime && time < o.startTime + o.duration);
    } else if (obj.lipSync.audioId) {
        audioSource = currentObjects.find(o => o.id === obj.lipSync!.audioId);
    }
    return audioSource ? getCurrentViseme(audioSource, time) : null;
};

export const getVibrationOffset = (obj: TimelineObject, time: number) => {
    if (!obj.vibration || !obj.vibration.enabled) return { x: 0, y: 0 };
    const { strength, speed } = obj.vibration;
    if (strength === 0) return { x: 0, y: 0 };
    const t = time * speed;
    return { 
        x: Math.sin(t * 12.9898) * strength + Math.cos(t * 78.233) * strength * 0.5, 
        y: Math.cos(t * 12.9898) * strength + Math.sin(t * 78.233) * strength * 0.5 
    };
};

const drawAudioWaveform = (graphics: PIXI.Graphics, obj: AudioVisualizationObject, time: number, audioBuffers: Map<string, AudioBuffer>, allObjects: TimelineObject[]) => {
    graphics.clear();
    let targetAudio: AudioObject | undefined;
    if (obj.targetAudioId) targetAudio = allObjects.find(o => o.id === obj.targetAudioId) as AudioObject;
    if (!targetAudio && obj.targetLayer !== undefined && obj.targetLayer >= 0) targetAudio = allObjects.find(o => o.type === 'audio' && o.layer === obj.targetLayer && time >= o.startTime && time < o.startTime + o.duration) as AudioObject;
    if (!targetAudio || !targetAudio.src || !audioBuffers.get(targetAudio.id)) {
        graphics.moveTo(0, obj.height / 2); graphics.lineTo(obj.width, obj.height / 2); graphics.stroke({ width: 2, color: 0x555555 }); return;
    }
    const buffer = audioBuffers.get(targetAudio.id)!;
    const data = buffer.getChannelData(0); 
    const startSample = Math.floor(((time - targetAudio.startTime) + (targetAudio.offset || 0)) * buffer.sampleRate);
    const samplesToShow = Math.floor(0.05 * buffer.sampleRate);
    const step = Math.max(1, Math.floor(samplesToShow / obj.width)); 
    const centerY = obj.height / 2;
    const amplitude = obj.amplitude ?? 1.0;

    graphics.beginPath();
    let started = false;
    for (let i = 0; i < obj.width; i++) {
        const val = data[startSample + i * step] || 0;
        const y = centerY + val * (obj.height / 2) * amplitude;
        if (!started) { graphics.moveTo(i, y); started = true; } else { graphics.lineTo(i, y); }
    }
    graphics.stroke({ width: obj.thickness || 2, color: obj.color });
};

export const applyObjectEffects = (container: PIXI.Container, obj: TimelineObject) => {
    const filters: PIXI.Filter[] = [];
    if (obj.colorCorrection && obj.colorCorrection.enabled) {
        const matrix = new PIXI.ColorMatrixFilter();
        const { brightness, contrast, saturation, hue } = obj.colorCorrection;
        matrix.hue(hue, false); matrix.saturate(saturation, true); matrix.contrast(contrast, true); matrix.brightness(brightness, true);
        filters.push(matrix);
    }
    if (obj.customClipping && obj.customClipping.enabled) {
        const w = (obj as any).width || 100; const h = (obj as any).height || 100;
        let existingFilter = container.filters?.find(f => f instanceof DiagonalClippingFilter) as DiagonalClippingFilter | undefined;
        if (existingFilter) { existingFilter.updateParams(obj.customClipping, w, h); filters.push(existingFilter); }
        else { filters.push(new DiagonalClippingFilter(obj.customClipping, w, h)); }
    }
    container.filters = filters.length > 0 ? filters : null;
};

// --- Update Content ---

export const updatePixiContent = (
    obj: TimelineObject,
    container: PIXI.Container,
    time: number,
    resources: {
        textureCache: Map<string, PIXI.Texture>;
        loadingUrls: Set<string>;
        videoFrames?: Map<string, VideoFrame | null>; 
        audioBuffers?: Map<string, AudioBuffer>; 
        allObjects?: TimelineObject[];           
        isExporting: boolean;
        isPlaying: boolean;
        setRenderTick: React.Dispatch<React.SetStateAction<number>>;
    }
) => {
    const { textureCache, loadingUrls, videoFrames, audioBuffers, allObjects, setRenderTick } = resources;
    let content = container.children[0] as (PIXI.Sprite | PIXI.Graphics | PIXI.Text | PIXI.Container | undefined);
    
    // Check for recreation
    let needsRecreation = false;
    if (!content) needsRecreation = true;
    else {
        if (obj.type === 'shape' && !(content instanceof PIXI.Graphics)) needsRecreation = true;
        else if (obj.type === 'text' && !(content instanceof PIXI.Text)) needsRecreation = true;
        else if ((obj.type === 'image' || obj.type === 'video' || obj.type === 'psd') && !(content instanceof PIXI.Sprite)) needsRecreation = true;
        else if (obj.type === 'audio_visualization' && !(content instanceof PIXI.Graphics)) needsRecreation = true;
        else if (obj.type === 'group_control' && !(content instanceof PIXI.Graphics)) needsRecreation = true;
    }

    if (needsRecreation) {
        if (content && content instanceof PIXI.Sprite) {
             // テクスチャはキャッシュしている(使い回す)ので、破棄しない
             content.destroy({ children: true, texture: false });
        } else if (content) {
             content.destroy({ children: true });
        }
        container.removeChildren();
        content = undefined;
    }

    if (obj.type === 'shape') {
        let graphics = content as PIXI.Graphics || new PIXI.Graphics();
        if (!content) container.addChild(graphics);
        graphics.clear();
        drawShape(graphics, obj);
        if (obj.gradient && obj.gradient.enabled) {
             const texture = createGradientTexture(obj.width, obj.height, obj.gradient);
             graphics.fill({ texture });
        } else { graphics.fill(obj.fill); }
        content = graphics;

    } else if (obj.type === 'text') {
        let textObj = content as PIXI.Text || new PIXI.Text({ text: obj.text });
        if (!content) container.addChild(textObj);
        if (textObj.text !== obj.text) textObj.text = obj.text;
        textObj.style = { fontFamily: obj.fontFamily || 'Arial', fontSize: obj.fontSize, fill: obj.fill };
        content = textObj;

    } else if (obj.type === 'image' || obj.type === 'psd') {
        let sprite = content as PIXI.Sprite;
        let texture: PIXI.Texture | undefined;
        if (obj.src) {
            texture = textureCache.get(obj.src);
            if (!texture && !loadingUrls.has(obj.src)) {
                loadingUrls.add(obj.src);
                const img = new Image(); img.src = obj.src;
                img.onload = () => { textureCache.set(obj.src, PIXI.Texture.from(img)); loadingUrls.delete(obj.src); setRenderTick(p => p + 1); };
            }
        }
        if (!sprite) { sprite = new PIXI.Sprite(texture || PIXI.Texture.EMPTY); container.addChild(sprite); }
        if (texture && sprite.texture !== texture) sprite.texture = texture;
        if (obj.type === 'psd') sprite.scale.set(obj.scale || 1.0); else { sprite.width = obj.width; sprite.height = obj.height; }
        content = sprite;

    } else if (obj.type === 'video') {
        let sprite = content as PIXI.Sprite;
        const newFrame = videoFrames?.get(obj.id);
        
        // 1. Canvas & Context の取得/作成 (キャッシュから)
        let canvas = videoCanvasCache.get(obj.id);
        let ctx = videoCtxCache.get(obj.id);
        let texture = videoTextureCache.get(obj.id);
        
        if (!canvas) {
            canvas = document.createElement('canvas');
            // 初期サイズは適当で良いが、VideoFrameが来るまで0かもしれない
            canvas.width = obj.width || 1280; 
            canvas.height = obj.height || 720;
            ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;
            
            // Textureもここで一度だけ作る！
            texture = PIXI.Texture.from(canvas);
            
            videoCanvasCache.set(obj.id, canvas);
            videoCtxCache.set(obj.id, ctx);
            videoTextureCache.set(obj.id, texture);
        }

        if (newFrame) {
            // サイズ変更検知
            if (canvas.width !== newFrame.displayWidth || canvas.height !== newFrame.displayHeight) {
                canvas.width = newFrame.displayWidth;
                canvas.height = newFrame.displayHeight;
                // Canvasのサイズを変えたらTextureも更新が必要な場合があるが、
                // PixiのTextureはsourceのサイズ変更を自動検知する場合が多い。
                // 明示的にupdateを呼ぶ。
            }

            // Canvasへ転写
            ctx?.drawImage(newFrame, 0, 0, canvas.width, canvas.height);
            
            // --- 重要: 即時クローズ ---
            // 描画が終わったら即座にメモリを開放する。これでGCが起きなくなる。
            // (注: Provider側で clone() して渡してくれている前提。もし生ならProviderが壊れるが、
            //  Providerのコードでは getFrame() で clone() しているので安全)
            newFrame.close();

            // PixiJSに更新通知
            if (texture) {
                // v8: texture.source.update()
                // v7: texture.update()
                // 両対応または型定義に合わせて呼び出す
                if ((texture as any).source) {
                    (texture as any).source.update();
                } else {
                    texture.update();
                }
            }
        }

        // Spriteが無ければ作成 (一度だけ)
        if (!sprite) {
            sprite = new PIXI.Sprite(texture || PIXI.Texture.EMPTY);
            sprite.width = obj.width;
            sprite.height = obj.height;
            container.addChild(sprite);
        }
        
        // スプライトのサイズ同期（エディタ上のリサイズ対応）
        if (sprite.width !== obj.width) sprite.width = obj.width;
        if (sprite.height !== obj.height) sprite.height = obj.height;

        content = sprite;

    } else if (obj.type === 'audio_visualization') {
        let graphics = content as PIXI.Graphics || new PIXI.Graphics();
        if (!content) container.addChild(graphics);
        if (audioBuffers && allObjects) drawAudioWaveform(graphics, obj, time, audioBuffers, allObjects);
        else { graphics.clear(); graphics.rect(0, 0, obj.width, obj.height); graphics.stroke({ width: 2, color: 0xff0000 }); }
        content = graphics;

    } else if (obj.type === 'group_control') {
        let graphics = content as PIXI.Graphics || new PIXI.Graphics();
        if (!content) { container.addChild(graphics); const t = new PIXI.Text({ text: 'Group\nControl', style: { fontSize: 14, fill: 0x00ff00, fontWeight: 'bold' } }); graphics.addChild(t); }
        graphics.clear(); graphics.rect(0, 0, 100, 100); graphics.stroke({ width: 2, color: 0x00ff00 });
        content = graphics;
    }
    return content;
};