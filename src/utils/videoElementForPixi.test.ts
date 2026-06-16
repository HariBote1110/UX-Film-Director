import { describe, it, expect } from 'vitest';
import {
  applyIntrinsicSizeToVideoElement,
  destroyExportOverlayCanvases,
  destroyVideoFrameTextureState,
  destroyVideoSourcePreservingPlayUrl,
  shouldReplacePixiVideoElementSource,
  useCanvasVideoUploadForPixiPreview,
} from './videoElementForPixi';

describe('useCanvasVideoUploadForPixiPreview', () => {
  it('enables the canvas video path for WebGPU', () => {
    expect(useCanvasVideoUploadForPixiPreview(2)).toBe(true);
  });
  it('keeps the VideoSource path for WebGL', () => {
    expect(useCanvasVideoUploadForPixiPreview(1)).toBe(false);
  });
});

describe('applyIntrinsicSizeToVideoElement', () => {
  it('synchronises width/height properties with videoWidth/videoHeight', () => {
    const v = {
      videoWidth: 1280,
      videoHeight: 720,
      width: 300,
      height: 150,
    } as HTMLVideoElement;
    applyIntrinsicSizeToVideoElement(v);
    expect(v.width).toBe(1280);
    expect(v.height).toBe(720);
  });

  it('leaves the element unchanged when metadata size is not yet available', () => {
    const v = {
      videoWidth: 0,
      videoHeight: 0,
      width: 300,
      height: 150,
    } as HTMLVideoElement;
    applyIntrinsicSizeToVideoElement(v);
    expect(v.width).toBe(300);
    expect(v.height).toBe(150);
  });
});

describe('destroyVideoSourcePreservingPlayUrl', () => {
  it('re-applies the captured URL when Pixi clears src', () => {
    const destroy = () => {
      (video as { src: string }).src = '';
    };
    const video = {
      currentSrc: 'https://example.com/clip.mp4',
      src: 'https://example.com/clip.mp4',
      load: () => undefined,
    } as HTMLVideoElement;
    const source = { destroy } as import('pixi.js').VideoSource;
    destroyVideoSourcePreservingPlayUrl(video, source);
    expect((video as { src: string }).src).toBe('https://example.com/clip.mp4');
  });

  it('does not write src when there was no URL to preserve', () => {
    const destroy = () => {
      (video as { src: string }).src = '';
    };
    const video = { currentSrc: '', src: '' } as HTMLVideoElement;
    const source = { destroy } as import('pixi.js').VideoSource;
    destroyVideoSourcePreservingPlayUrl(video, source);
    expect((video as { src: string }).src).toBe('');
  });
});

describe('destroyVideoFrameTextureState', () => {
  it('destroys canvas upload textures with their source', () => {
    const textureDestroyCalls: unknown[] = [];
    destroyVideoFrameTextureState({
      uploadMode: 'canvas',
      texture: {
        destroy: (destroyBase?: boolean) => textureDestroyCalls.push(destroyBase),
      },
    });

    expect(textureDestroyCalls).toEqual([true]);
  });

  it('destroys VideoSource while preserving the play URL and keeps texture source ownership separate', () => {
    const actions: string[] = [];
    const video = {
      currentSrc: 'file:///tmp/current.mp4',
      src: 'file:///tmp/current.mp4',
      load: () => {
        actions.push('load');
      },
    } as unknown as HTMLVideoElement;

    destroyVideoFrameTextureState({
      uploadMode: 'video-source',
      videoSource: {
        destroy: () => {
          actions.push('destroyVideoSource');
          (video as { src: string }).src = '';
        },
      },
      texture: {
        destroy: (destroyBase?: boolean) => actions.push(`destroyTexture:${String(destroyBase)}`),
      },
    }, video);

    expect(actions).toEqual(['destroyVideoSource', 'load', 'destroyTexture:false']);
    expect((video as { src: string }).src).toBe('file:///tmp/current.mp4');
  });
});

describe('destroyExportOverlayCanvases', () => {
  it('destroys cached export overlay textures with their canvas source and clears the map', () => {
    const destroyCalls: unknown[] = [];
    const overlays = new Map<string, { texture: { destroy: (destroyBase?: boolean) => void } }>([
      ['video-1', { texture: { destroy: (destroyBase?: boolean) => destroyCalls.push(destroyBase) } }],
      ['video-2', { texture: { destroy: (destroyBase?: boolean) => destroyCalls.push(destroyBase) } }],
    ]);

    destroyExportOverlayCanvases(overlays);

    expect(destroyCalls).toEqual([true, true]);
    expect(overlays.size).toBe(0);
  });
});

describe('shouldReplacePixiVideoElementSource', () => {
  it('reuses the video element when the active source matches the requested play source', () => {
    expect(shouldReplacePixiVideoElementSource({
      currentSrc: '',
      src: 'file:///tmp/proxy.mp4',
    } as HTMLVideoElement, 'file:///tmp/proxy.mp4')).toBe(false);
  });

  it('requires replacement when the requested play source changes', () => {
    expect(shouldReplacePixiVideoElementSource({
      currentSrc: 'file:///tmp/old.mp4',
      src: 'file:///tmp/old.mp4',
    } as HTMLVideoElement, 'file:///tmp/new.mp4')).toBe(true);
  });
});
