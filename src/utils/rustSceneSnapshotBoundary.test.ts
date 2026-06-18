import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import {
  buildRustSceneSnapshotForTimeline,
  validateRustSceneSnapshotBoundary,
  type RustSceneSnapshotBoundaryIssue,
} from './rustSceneSnapshot';
import type { ImageObject, ProjectSettings } from '../types';

const settings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
};

const image = (patch: Partial<ImageObject> = {}): ImageObject => ({
  id: 'image-1',
  type: 'image',
  name: 'image.png',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 32,
  y: 48,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 32,
  endY: 48,
  easing: 'linear',
  src: 'blob:image',
  filePath: '/tmp/image.png',
  width: 640,
  height: 360,
  ...patch,
});

describe('validateRustSceneSnapshotBoundary', () => {
  it('accepts the adapter output as an exact rust-core JSON boundary payload', () => {
    const built = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [image()],
      time: 1,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('expected snapshot build to pass');

    const validation = validateRustSceneSnapshotBoundary({
      snapshot: built.snapshot,
      media: built.media,
    });

    expect(validation).toEqual({ ok: true });
    const encoded = JSON.stringify(built.snapshot);
    expect(encoded).toContain('frame_index');
    expect(encoded).toContain('clip_id');
    expect(encoded).not.toContain('frameIndex');
    expect(encoded).not.toContain('clipId');
  });

  it('rejects camelCase drift before the payload reaches Rust', () => {
    const payload = {
      snapshot: {
        frameIndex: 60,
        colour: {
          profile: 'rec709-sdr',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [
          {
            clipId: 'image-1',
            track_id: 'layer-1',
            media_id: 'image-1',
            source_frame: 0,
            z_index: 0,
            transform: {
              translation_x: 32,
              translation_y: 48,
              scale_x: 1,
              scale_y: 1,
              rotation_degrees: 0,
              sampling: 'bilinear',
            },
            opacity: 1,
            effects: [],
          },
        ],
      },
      media: [
        {
          id: 'image-1',
          kind: 'Image',
          source: '/tmp/image.png',
          width: 640,
          height: 360,
        },
      ],
    };

    const validation = validateRustSceneSnapshotBoundary(payload);

    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected boundary validation to fail');
    expect(issueCodes(validation.issues)).toEqual([
      'schemaMismatch',
      'schemaMismatch',
      'schemaMismatch',
      'schemaMismatch',
    ]);
    expect(validation.issues.map((issue) => issue.path)).toEqual([
      'snapshot.frameIndex',
      'snapshot.frame_index',
      'snapshot.clips[0].clipId',
      'snapshot.clips[0].clip_id',
    ]);
  });

  it('rejects invalid numeric values, unknown enum values, and malformed effects', () => {
    const payload = {
      snapshot: {
        frame_index: Number.NaN,
        colour: {
          profile: 'display-p3',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [
          {
            clip_id: 'image-1',
            track_id: 'layer-1',
            media_id: 'image-1',
            source_frame: 0.5,
            z_index: 0,
            transform: {
              translation_x: Number.POSITIVE_INFINITY,
              translation_y: 48,
              scale_x: 1,
              scale_y: 1,
              rotation_degrees: 0,
              sampling: 'bicubic',
            },
            opacity: 1.2,
            effects: [{ Blur: { radius: 4 } }],
          },
        ],
      },
      media: [
        {
          id: 'image-1',
          kind: 'Text',
          source: '/tmp/image.png',
          width: 640,
          height: 360,
        },
      ],
    };

    const validation = validateRustSceneSnapshotBoundary(payload);

    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected boundary validation to fail');
    expect(issueCodes(validation.issues)).toEqual([
      'nonFiniteNumber',
      'unsupportedEnum',
      'unsafeInteger',
      'nonFiniteNumber',
      'unsupportedEnum',
      'outOfRange',
      'schemaMismatch',
      'unsupportedEnum',
    ]);
  });

  it('accepts PSD media references at the Rust boundary before source generation is enabled', () => {
    const payload = {
      snapshot: {
        frame_index: 60,
        colour: {
          profile: 'rec709-sdr',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [
          {
            clip_id: 'psd-1',
            track_id: 'layer-2',
            media_id: 'psd-1',
            source_frame: 0,
            z_index: 0,
            transform: {
              translation_x: 400,
              translation_y: 120,
              scale_x: 1,
              scale_y: 1,
              rotation_degrees: 0,
              sampling: 'bilinear',
            },
            opacity: 0.9,
            effects: [],
          },
        ],
      },
      media: [
        {
          id: 'psd-1',
          kind: 'Psd',
          source: '/tmp/standing.psd',
          width: 512,
          height: 768,
          active_layer_ids: ['face-open', 'root'],
        },
      ],
    };

    expect(validateRustSceneSnapshotBoundary(payload)).toEqual({ ok: true });
  });

  it('rejects unknown fields, duplicate media ids, and orphan media references', () => {
    const payload = {
      snapshot: {
        frame_index: 60,
        unexpected: true,
        colour: {
          profile: 'rec709-sdr',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [
          {
            clip_id: 'image-1',
            track_id: 'layer-1',
            media_id: 'image-1',
            source_frame: 0,
            z_index: 0,
            unexpected: true,
            transform: {
              translation_x: 32,
              translation_y: 48,
              scale_x: 1,
              scale_y: 1,
              rotation_degrees: 0,
              sampling: 'bilinear',
              unexpected: true,
            },
            opacity: 1,
            effects: [],
          },
        ],
      },
      media: [
        {
          id: 'image-1',
          kind: 'Image',
          source: '/tmp/image.png',
          width: 640,
          height: 360,
          unexpected: true,
        },
        {
          id: 'image-1',
          kind: 'Image',
          source: '/tmp/duplicate.png',
          width: 640,
          height: 360,
        },
        {
          id: 'orphan',
          kind: 'Image',
          source: '/tmp/orphan.png',
          width: 640,
          height: 360,
        },
      ],
    };

    const validation = validateRustSceneSnapshotBoundary(payload);

    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected boundary validation to fail');
    expect(validation.issues.map((issue) => issue.path)).toEqual([
      'snapshot.unexpected',
      'snapshot.clips[0].unexpected',
      'snapshot.clips[0].transform.unexpected',
      'media[0].unexpected',
      'media[1].id',
      'media[2].id',
    ]);
    expect(issueCodes(validation.issues)).toEqual([
      'schemaMismatch',
      'schemaMismatch',
      'schemaMismatch',
      'schemaMismatch',
      'mediaMismatch',
      'mediaMismatch',
    ]);
  });
});

const issueCodes = (issues: RustSceneSnapshotBoundaryIssue[]) =>
  issues.map((issue) => issue.code);
