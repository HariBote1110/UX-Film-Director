import * as PIXI from 'pixi.js';
import { ShapeObject, GradientFill, ShadowEffect, AudioObject, PsdLayerNode } from '../types';
import { phonemeToViseme } from './labParser';

// --- グラデーション・図形・シャドウ ---

export const createGradientTexture = (width: number, height: number, gradient: GradientFill): PIXI.Texture => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return PIXI.Texture.WHITE;

    const colours = gradient.colours && gradient.colours.length > 0 ? gradient.colours : ['#ffffff', '#000000'];

    let grd;
    if (gradient.type === 'linear') {
        const rad = ((gradient.direction || 0) * Math.PI) / 180;
        const cx = width / 2;
        const cy = height / 2;
        const halfLine = Math.max(width, height) / 2;
        const x1 = cx - Math.cos(rad) * halfLine;
        const y1 = cy - Math.sin(rad) * halfLine;
        const x2 = cx + Math.cos(rad) * halfLine;
        const y2 = cy + Math.sin(rad) * halfLine;
        grd = ctx.createLinearGradient(x1, y1, x2, y2);
    } else {
        grd = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2);
    }

    colours.forEach((colour, i) => {
        const stop = gradient.stops && gradient.stops[i] !== undefined ? gradient.stops[i] : i / Math.max(1, colours.length - 1);
        grd.addColorStop(Math.max(0, Math.min(1, stop)), colour);
    });

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);

    return PIXI.Texture.from(canvas);
};

export const drawShape = (graphics: PIXI.Graphics, obj: ShapeObject | { shapeType: string, width: number, height: number }) => {
    const w = obj.width;
    const h = obj.height;
    // @ts-ignore
    const type = obj.shapeType;
    
    switch (type) {
        case 'circle': graphics.ellipse(w / 2, h / 2, w / 2, h / 2); break;
        case 'triangle': graphics.moveTo(w / 2, 0); graphics.lineTo(w, h); graphics.lineTo(0, h); graphics.closePath(); break;
        case 'star': graphics.star(w / 2, h / 2, 5, Math.min(w, h) / 2, Math.min(w, h) / 4); break;
        case 'pentagon':
            const radius = Math.min(w, h) / 2; const sides = 5; const step = (Math.PI * 2) / sides; const startAngle = -Math.PI / 2;
            graphics.moveTo(w/2 + radius * Math.cos(startAngle), h/2 + radius * Math.sin(startAngle));
            for (let i = 1; i <= sides; i++) graphics.lineTo(w/2 + radius * Math.cos(startAngle + step * i), h/2 + radius * Math.sin(startAngle + step * i));
            graphics.closePath(); break;
        case 'rect': default: graphics.rect(0, 0, w, h); break;
    }
};

export const createShadowGraphics = (targetObj: any, width: number, height: number, shadow: ShadowEffect): PIXI.Container | null => {
    if (!shadow.enabled) return null;
    const container = new PIXI.Container();
    container.alpha = shadow.opacity;
    container.position.set(shadow.offsetX, shadow.offsetY);
    const graphics = new PIXI.Graphics();
    if (targetObj.type === 'shape') { drawShape(graphics, targetObj); } else { graphics.rect(0, 0, width, height); }
    graphics.fill(shadow.colour);
    const blurFilter = new PIXI.BlurFilter();
    blurFilter.strength = shadow.blur;
    container.filters = [blurFilter];
    container.addChild(graphics);
    return container;
};

export const getCurrentViseme = (audio: AudioObject | undefined, currentTime: number): 'a'|'i'|'u'|'e'|'o'|'n'|null => {
    if (!audio || !audio.labData) return null;
    const localTime = (currentTime - audio.startTime) + (audio.offset || 0);
    if (localTime < 0 || localTime > audio.duration) return null;
    const item = audio.labData.find(d => localTime >= d.startTime && localTime < d.endTime);
    if (!item) return null;
    return phonemeToViseme(item.phoneme);
};

// --- PSD Rendering Helpers ---

export const findSiblings = (root: PsdLayerNode, targetId: string): string[] => {
    let result: string[] = [];
    const traverse = (node: PsdLayerNode): boolean => {
        if (node.children) {
            const foundIndex = node.children.findIndex(c => c.id === targetId);
            if (foundIndex !== -1) {
                result = node.children.map(c => c.id);
                return true;
            }
            for (const child of node.children) {
                if (traverse(child)) return true;
            }
        }
        return false;
    };
    if (root) traverse(root);
    return result;
};

export const renderPsdTree = (
    node: PsdLayerNode,
    container: PIXI.Container,
    activeLayerIds: Record<string, boolean>,
    textureCache: Map<string, PIXI.Texture>,
    loadingUrls: Set<string>,
    requestRender: () => void
) => {
    // 修正: nodeがundefinedの場合のガード
    if (!node) return;
    if (!activeLayerIds[node.id]) return;

    if (node.isGroup) {
        if (node.children) {
            node.children.forEach(child => {
                renderPsdTree(child, container, activeLayerIds, textureCache, loadingUrls, requestRender);
            });
        }
    } else {
        if (node.src) {
            const texture = textureCache.get(node.src);
            if (texture) {
                const sprite = new PIXI.Sprite(texture);
                sprite.x = node.left;
                sprite.y = node.top;
                container.addChild(sprite);
            } else {
                if (!loadingUrls.has(node.src)) {
                    loadingUrls.add(node.src);
                    const img = new Image();
                    img.src = node.src;
                    img.onload = () => {
                        textureCache.set(node.src!, PIXI.Texture.from(img));
                        loadingUrls.delete(node.src!);
                        requestRender();
                    };
                }
            }
        }
    }
};