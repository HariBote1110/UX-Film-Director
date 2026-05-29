import { describe, it, expect } from 'vitest';
import {
  applyIntrinsicSizeToVideoElement,
  destroyVideoSourcePreservingPlayUrl,
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
