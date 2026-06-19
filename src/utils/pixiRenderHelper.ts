import * as PIXI from 'pixi.js';
import { TimelineObject, GroupControlObject, AudioVisualizationObject, AudioObject, ClippingParams, GradientFill, ObjectFilter } from '../types';
import { createGradientTexture, drawShape, getCurrentViseme, renderPsdTree, cacheTextureFromUrl } from './pixiUtils';
import { evaluateObjectPositionAtTime } from './keyframes';
import { getEnabledObjectFiltersInOrder } from './filterStack';
import { shouldSkipPixiSolidColourForSharedRenderer } from './pixiSolidColourCutover';
import { shouldSkipPixiImageForSharedRenderer } from './pixiImageCutover';
import { shouldSkipPixiPsdForSharedRenderer } from './pixiPsdCutover';

// ... (Shader definitions omitted for brevity - same as previous) ...
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
const clippingWgslShader = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct ClippingUniforms {
  uClip: vec4<f32>,
  uAngle: f32,
  uDimensions: vec2<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@group(1) @binding(0) var<uniform> clippingUniforms: ClippingUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4<f32>(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition: vec2<f32>
) -> VSOutput {
  return VSOutput(
    filterVertexPosition(aPosition),
    filterTextureCoord(aPosition)
  );
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>
) -> @location(0) vec4<f32> {
  let dimensions = clippingUniforms.uDimensions;
  let coord = uv * dimensions;
  let centre = dimensions * 0.5;
  let p = coord - centre;
  let c = cos(-clippingUniforms.uAngle);
  let s = sin(-clippingUniforms.uAngle);
  let pRot = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
  let pCheck = pRot + centre;

  let topLimit = clippingUniforms.uClip.x;
  let bottomLimit = dimensions.y - clippingUniforms.uClip.y;
  let leftLimit = clippingUniforms.uClip.z;
  let rightLimit = dimensions.x - clippingUniforms.uClip.w;

  if (
    pCheck.y < topLimit
    || pCheck.y > bottomLimit
    || pCheck.x < leftLimit
    || pCheck.x > rightLimit
  ) {
    discard;
  }

  return textureSample(uTexture, uSampler, uv);
}
`;
class DiagonalClippingFilter extends PIXI.Filter {
    constructor(params: Omit<ClippingParams, 'enabled'>, width: number, height: number) {
        super({
            gpuProgram: PIXI.GpuProgram.from({
                vertex: {
                    source: clippingWgslShader,
                    entryPoint: 'mainVertex'
                },
                fragment: {
                    source: clippingWgslShader,
                    entryPoint: 'mainFragment'
                }
            }),
            glProgram: PIXI.GlProgram.from({
                vertex: vertexShader,
                fragment: fragmentShader,
            }),
            resources: {
                clippingUniforms: {
                    uClip: { value: new Float32Array([params.top, params.bottom, params.left, params.right]), type: 'vec4<f32>' },
                    uAngle: { value: (params.angle * Math.PI) / 180, type: 'f32' },
                    uDimensions: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
                },
            },
        } as any);
    }
    updateParams(params: Omit<ClippingParams, 'enabled'>, width: number, height: number) {
        const uniforms = (this.resources as any).clippingUniforms.uniforms;
        uniforms.uClip = new Float32Array([params.top, params.bottom, params.left, params.right]);
        uniforms.uAngle = (params.angle * Math.PI) / 180;
        uniforms.uDimensions = new Float32Array([width, height]);
    }
}

const groupGradientFragmentShader = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uDirection;
uniform float uStopA;
uniform float uStopB;
uniform float uIsRadial;
uniform vec4 uColourA;
uniform vec4 uColourB;

void main(void) {
    vec4 src = texture2D(uSampler, vTextureCoord);
    float t;
    if (uIsRadial > 0.5) {
        vec2 centred = vTextureCoord - vec2(0.5, 0.5);
        t = length(centred) * 2.0;
    } else {
        vec2 dir = vec2(cos(uDirection), sin(uDirection));
        vec2 centred = vTextureCoord - vec2(0.5, 0.5);
        t = dot(centred, dir) + 0.5;
    }

    float start = min(uStopA, uStopB);
    float end = max(uStopA, uStopB);
    float denom = max(0.0001, end - start);
    float ratio = clamp((t - start) / denom, 0.0, 1.0);
    vec4 grad = mix(uColourA, uColourB, ratio);

    gl_FragColor = vec4(grad.rgb, grad.a * src.a);
}
`;

const groupGradientWgslShader = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct GroupGradientUniforms {
  uDirection: f32,
  uStopA: f32,
  uStopB: f32,
  uIsRadial: f32,
  uColourA: vec4<f32>,
  uColourB: vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@group(1) @binding(0) var<uniform> groupGradientUniforms: GroupGradientUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4<f32>(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition: vec2<f32>
) -> VSOutput {
  return VSOutput(
    filterVertexPosition(aPosition),
    filterTextureCoord(aPosition)
  );
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
  let src = textureSample(uTexture, uSampler, uv);
  var t: f32;

  if (groupGradientUniforms.uIsRadial > 0.5) {
    let centred = uv - vec2<f32>(0.5, 0.5);
    t = length(centred) * 2.0;
  } else {
    let dir = vec2<f32>(cos(groupGradientUniforms.uDirection), sin(groupGradientUniforms.uDirection));
    let centred = uv - vec2<f32>(0.5, 0.5);
    t = dot(centred, dir) + 0.5;
  }

  let start = min(groupGradientUniforms.uStopA, groupGradientUniforms.uStopB);
  let end = max(groupGradientUniforms.uStopA, groupGradientUniforms.uStopB);
  let denom = max(0.0001, end - start);
  let ratio = clamp((t - start) / denom, 0.0, 1.0);
  let grad = mix(groupGradientUniforms.uColourA, groupGradientUniforms.uColourB, ratio);

  return vec4<f32>(grad.rgb, grad.a * src.a);
}
`;

const normaliseGradientForGroupFilter = (gradient: GradientFill) => {
    let colours = Array.isArray(gradient.colours)
        ? gradient.colours.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
        : [];
    if (colours.length === 0) colours = ['#ffffff', '#000000'];
    if (colours.length === 1) colours = [colours[0], colours[0]];

    const rawStops = Array.isArray(gradient.stops)
        ? gradient.stops.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
        : [];
    const stops = colours.map((_, index) => {
        const fallback = colours.length === 1 ? 0 : index / (colours.length - 1);
        const value = rawStops[index];
        return Math.max(0, Math.min(1, typeof value === 'number' ? value : fallback));
    });

    return {
        type: gradient.type === 'radial' ? 'radial' as const : 'linear' as const,
        direction: Number.isFinite(gradient.direction) ? gradient.direction : 0,
        colourA: colours[0],
        colourB: colours[1],
        stopA: stops[0],
        stopB: stops[1]
    };
};

const parseHexColour = (input: string): Float32Array => {
    const value = input.trim();
    const hex = value.startsWith('#') ? value.slice(1) : value;

    const parse = (raw: string): number => {
        const next = Number.parseInt(raw, 16);
        if (!Number.isFinite(next)) return 0;
        return Math.max(0, Math.min(255, next));
    };

    if (hex.length === 3 || hex.length === 4) {
        const r = parse(hex[0] + hex[0]);
        const g = parse(hex[1] + hex[1]);
        const b = parse(hex[2] + hex[2]);
        const a = hex.length === 4 ? parse(hex[3] + hex[3]) : 255;
        return new Float32Array([r / 255, g / 255, b / 255, a / 255]);
    }

    if (hex.length === 6 || hex.length === 8) {
        const r = parse(hex.slice(0, 2));
        const g = parse(hex.slice(2, 4));
        const b = parse(hex.slice(4, 6));
        const a = hex.length === 8 ? parse(hex.slice(6, 8)) : 255;
        return new Float32Array([r / 255, g / 255, b / 255, a / 255]);
    }

    return new Float32Array([1, 1, 1, 1]);
};

class GroupGradientFilter extends PIXI.Filter {
    constructor(gradient: GradientFill) {
        super({
            gpuProgram: PIXI.GpuProgram.from({
                vertex: {
                    source: groupGradientWgslShader,
                    entryPoint: 'mainVertex'
                },
                fragment: {
                    source: groupGradientWgslShader,
                    entryPoint: 'mainFragment'
                }
            }),
            glProgram: PIXI.GlProgram.from({
                vertex: vertexShader,
                fragment: groupGradientFragmentShader
            }),
            resources: {
                groupGradientUniforms: {
                    uDirection: { value: 0, type: 'f32' },
                    uStopA: { value: 0, type: 'f32' },
                    uStopB: { value: 1, type: 'f32' },
                    uIsRadial: { value: 0, type: 'f32' },
                    uColourA: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
                    uColourB: { value: new Float32Array([0, 0, 0, 1]), type: 'vec4<f32>' }
                }
            }
        } as any);
        this.updateGradient(gradient);
    }

    updateGradient(gradient: GradientFill) {
        const uniforms = (this.resources as any).groupGradientUniforms.uniforms;
        const normalised = normaliseGradientForGroupFilter(gradient);
        uniforms.uDirection = (normalised.direction * Math.PI) / 180;
        uniforms.uStopA = normalised.stopA;
        uniforms.uStopB = normalised.stopB;
        uniforms.uIsRadial = normalised.type === 'radial' ? 1 : 0;
        uniforms.uColourA = parseHexColour(normalised.colourA);
        uniforms.uColourB = parseHexColour(normalised.colourB);
    }
}

export const applyGroupGradientEffect = (container: PIXI.Container, gradient: GradientFill | undefined) => {
    const currentFilters = container.filters ?? [];
    const otherFilters = currentFilters.filter((filter) => !(filter instanceof GroupGradientFilter));
    if (!gradient || !gradient.enabled) {
        container.filters = otherFilters.length > 0 ? otherFilters : null;
        return;
    }

    const existing = currentFilters.find((filter) => filter instanceof GroupGradientFilter) as GroupGradientFilter | undefined;
    if (existing) {
        existing.updateGradient(gradient);
        container.filters = [...otherFilters, existing];
        return;
    }

    container.filters = [...otherFilters, new GroupGradientFilter(gradient)];
};

// ... (Helper functions: getGroupTransforms, getLipSyncViseme, getVibrationOffset, drawAudioWaveform are same as previous) ...
export const getGroupTransforms = (obj: TimelineObject, time: number, allObjects: TimelineObject[]) => {
    let x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, alpha = 1;
    const groups = allObjects.filter(o => o.type === 'group_control' && o.layer < obj.layer && time >= o.startTime && time < o.startTime + o.duration) as GroupControlObject[];
    groups.forEach(group => {
        if (group.targetLayerCount === 0 || (obj.layer <= group.layer + group.targetLayerCount)) {
            const position = evaluateObjectPositionAtTime(group, time);
            const gx = position.x;
            const gy = position.y;
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

const isVibrationFilter = (filter: ObjectFilter): filter is Extract<ObjectFilter, { type: 'vibration' }> => {
    return filter.type === 'vibration';
};

export const getVibrationOffset = (obj: TimelineObject, time: number) => {
    const vibrationFilters = getEnabledObjectFiltersInOrder(obj).filter(isVibrationFilter);
    if (vibrationFilters.length === 0) return { x: 0, y: 0 };

    return vibrationFilters.reduce((acc, filter, index) => {
        const { strength, speed } = filter.params;
        if (strength === 0) return acc;
        const phase = index * 1.618;
        const t = time * speed + phase;
        return {
            x: acc.x + (Math.sin(t * 12.9898) * strength + Math.cos(t * 78.233) * strength * 0.5),
            y: acc.y + (Math.cos(t * 12.9898) * strength + Math.sin(t * 78.233) * strength * 0.5)
        };
    }, { x: 0, y: 0 });
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
    const enabledFilters = getEnabledObjectFiltersInOrder(obj);
    const reusableClippingFilters = (container.filters ?? []).filter((filter): filter is DiagonalClippingFilter => {
        return filter instanceof DiagonalClippingFilter;
    });
    const localBounds = container.getLocalBounds();
    const clippingWidth = Math.max(1, Number.isFinite(localBounds.width) && localBounds.width > 0
        ? localBounds.width
        : ((obj as any).width || 100));
    const clippingHeight = Math.max(1, Number.isFinite(localBounds.height) && localBounds.height > 0
        ? localBounds.height
        : ((obj as any).height || 100));
    let clippingCursor = 0;
    const nextPixiFilters: PIXI.Filter[] = [];

    enabledFilters.forEach((filter) => {
        if (filter.type === 'color_correction') {
            const matrix = new PIXI.ColorMatrixFilter();
            const { brightness, contrast, saturation, hue } = filter.params;
            matrix.hue(hue, false);
            matrix.saturate(saturation, true);
            matrix.contrast(contrast, true);
            matrix.brightness(brightness, true);
            nextPixiFilters.push(matrix);
            return;
        }

        if (filter.type === 'clipping') {
            const existingFilter = reusableClippingFilters[clippingCursor];
            if (existingFilter) {
                existingFilter.updateParams(filter.params, clippingWidth, clippingHeight);
                nextPixiFilters.push(existingFilter);
            } else {
                nextPixiFilters.push(new DiagonalClippingFilter(filter.params, clippingWidth, clippingHeight));
            }
            clippingCursor += 1;
            return;
        }

        if (filter.type === 'blur') {
            const strength = Math.max(0, filter.params.strength);
            const quality = Math.max(1, Math.min(4, Math.round(filter.params.quality)));
            if (strength > 0.05) {
                nextPixiFilters.push(new PIXI.BlurFilter({
                    strength,
                    quality
                }));
            }
        }
    });

    container.filters = nextPixiFilters.length > 0 ? nextPixiFilters : null;
};

export const updatePixiContent = (
    obj: TimelineObject,
    container: PIXI.Container,
    time: number,
    resources: {
        textureCache: Map<string, PIXI.Texture>;
        loadingUrls: Set<string>;
        audioBuffers?: Map<string, AudioBuffer>;
        allObjects?: TimelineObject[];
        isExporting: boolean;
        isPlaying: boolean;
        setRenderTick: React.Dispatch<React.SetStateAction<number>>;
        sharedRendererSolidColourObjectIds?: ReadonlySet<string>;
        sharedRendererImageObjectIds?: ReadonlySet<string>;
        sharedRendererPsdObjectIds?: ReadonlySet<string>;
    }
) => {
    const { textureCache, loadingUrls, audioBuffers, allObjects, isExporting, isPlaying, setRenderTick, sharedRendererSolidColourObjectIds, sharedRendererImageObjectIds, sharedRendererPsdObjectIds } = resources;
    let content = container.children[0] as (PIXI.Sprite | PIXI.Graphics | PIXI.Text | PIXI.Container | undefined);
    
    // Check for recreation
    let needsRecreation = false;
    if (!content) needsRecreation = true;
    else {
        if (obj.type === 'shape' && !(content instanceof PIXI.Graphics)) needsRecreation = true;
        else if (obj.type === 'text' && !(content instanceof PIXI.Text)) needsRecreation = true;
        else if (obj.type === 'image' && !(content instanceof PIXI.Sprite)) needsRecreation = true;
        else if (obj.type === 'psd' && !(content instanceof PIXI.Container)) needsRecreation = true;
        else if (obj.type === 'audio_visualization' && !(content instanceof PIXI.Graphics)) needsRecreation = true;
        else if (obj.type === 'group_control' && !(content instanceof PIXI.Graphics)) needsRecreation = true;
    }

    if (needsRecreation) {
        const children = container.removeChildren();
        children.forEach(c => c.destroy({ children: true, texture: false, context: true }));
        content = undefined;
    }

    if (obj.type === 'shape') {
        if (shouldSkipPixiSolidColourForSharedRenderer({
            objectId: obj.id,
            objectType: obj.type,
            isExporting,
            sharedRendererSolidColourObjectIds,
        })) {
            const children = container.removeChildren();
            children.forEach((child) => child.destroy({ children: true, texture: false, context: true }));
            container.hitArea = new PIXI.Rectangle(0, 0, obj.width, obj.height);
            return undefined;
        }
        container.hitArea = null;

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

    } else if (obj.type === 'image') {
        if (shouldSkipPixiImageForSharedRenderer({
            objectId: obj.id,
            objectType: obj.type,
            isExporting,
            sharedRendererImageObjectIds,
        })) {
            const children = container.removeChildren();
            children.forEach((child) => child.destroy({ children: true, texture: false, context: true }));
            container.hitArea = new PIXI.Rectangle(0, 0, obj.width, obj.height);
            return undefined;
        }
        container.hitArea = null;

        let sprite = content as PIXI.Sprite;
        let texture: PIXI.Texture | undefined;
        if (obj.src) {
            texture = textureCache.get(obj.src);
            if (!texture) cacheTextureFromUrl(obj.src, textureCache, loadingUrls, () => setRenderTick((p) => p + 1));
        }
        if (!sprite) { sprite = new PIXI.Sprite(texture || PIXI.Texture.EMPTY); container.addChild(sprite); }
        if (texture && sprite.texture !== texture) sprite.texture = texture;
        sprite.width = obj.width; sprite.height = obj.height;
        content = sprite;

    } else if (obj.type === 'psd') {
        if (shouldSkipPixiPsdForSharedRenderer({
            objectId: obj.id,
            objectType: obj.type,
            isExporting,
            sharedRendererPsdObjectIds,
        })) {
            const children = container.removeChildren();
            children.forEach((child) => child.destroy({ children: true, texture: false, context: true }));
            container.hitArea = new PIXI.Rectangle(0, 0, obj.width, obj.height);
            return undefined;
        }
        container.hitArea = null;

        let psdContent = content as PIXI.Container;
        if (!psdContent) {
            psdContent = new PIXI.Container();
            container.addChild(psdContent);
        }

        const existingChildren = psdContent.removeChildren();
        existingChildren.forEach((child) => {
            child.destroy({ children: true, texture: false, context: true });
        });

        if (obj.rootLayer && obj.activeLayerIds) {
            obj.rootLayer.children.forEach((child) => {
                renderPsdTree(
                    child,
                    psdContent,
                    obj.activeLayerIds!,
                    textureCache,
                    loadingUrls,
                    () => setRenderTick((prev) => prev + 1)
                );
            });
        } else if (obj.src) {
            const texture = textureCache.get(obj.src);
            if (texture) {
                psdContent.addChild(new PIXI.Sprite(texture));
            } else {
                cacheTextureFromUrl(obj.src, textureCache, loadingUrls, () => setRenderTick((prev) => prev + 1));
            }
        }

        psdContent.scale.set(obj.scale || 1.0);
        content = psdContent;

    } else if (obj.type === 'video') {
        const children = container.removeChildren();
        children.forEach((child) => child.destroy({ children: true, texture: false, context: true }));
        container.hitArea = new PIXI.Rectangle(0, 0, obj.width, obj.height);
        return undefined;

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
