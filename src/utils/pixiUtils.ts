import * as PIXI from 'pixi.js';
import { ShapeObject, GradientFill, ShadowEffect } from '../types';

// グラデーションテクスチャを生成するヘルパー
export const createGradientTexture = (width: number, height: number, gradient: GradientFill): PIXI.Texture => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return PIXI.Texture.WHITE;

    // coloursが未定義の場合のフォールバック
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

// 特殊図形パスの描画（パス定義のみ）
export const drawShape = (graphics: PIXI.Graphics, obj: ShapeObject | { shapeType: string, width: number, height: number }) => {
    const w = obj.width;
    const h = obj.height;
    // @ts-ignore
    const type = obj.shapeType;
    
    switch (type) {
        case 'circle':
            graphics.ellipse(w / 2, h / 2, w / 2, h / 2);
            break;
        case 'triangle':
            graphics.moveTo(w / 2, 0);
            graphics.lineTo(w, h);
            graphics.lineTo(0, h);
            graphics.closePath();
            break;
        case 'star':
            graphics.star(w / 2, h / 2, 5, Math.min(w, h) / 2, Math.min(w, h) / 4);
            break;
        case 'pentagon':
            const radius = Math.min(w, h) / 2;
            const sides = 5;
            const step = (Math.PI * 2) / sides;
            const startAngle = -Math.PI / 2;
            graphics.moveTo(w/2 + radius * Math.cos(startAngle), h/2 + radius * Math.sin(startAngle));
            for (let i = 1; i <= sides; i++) {
                graphics.lineTo(w/2 + radius * Math.cos(startAngle + step * i), h/2 + radius * Math.sin(startAngle + step * i));
            }
            graphics.closePath();
            break;
        case 'rect':
        default:
            graphics.rect(0, 0, w, h);
            break;
    }
};

// シャドウフィルターの適用
export const createShadowGraphics = (targetObj: any, width: number, height: number, shadow: ShadowEffect): PIXI.Container | null => {
    if (!shadow.enabled) return null;

    const container = new PIXI.Container();
    container.alpha = shadow.opacity;
    container.position.set(shadow.offsetX, shadow.offsetY);

    const graphics = new PIXI.Graphics();
    
    // オブジェクトの形状に合わせてパスを描画
    if (targetObj.type === 'shape') {
        drawShape(graphics, targetObj);
    } else if (targetObj.type === 'image' || targetObj.type === 'psd' || targetObj.type === 'video') {
        graphics.rect(0, 0, width, height);
    } else {
        graphics.rect(0, 0, width, height);
    }
    
    graphics.fill(shadow.colour); // color -> colour
    
    const blurFilter = new PIXI.BlurFilter();
    blurFilter.strength = shadow.blur;
    container.filters = [blurFilter];
    
    container.addChild(graphics);
    return container;
};