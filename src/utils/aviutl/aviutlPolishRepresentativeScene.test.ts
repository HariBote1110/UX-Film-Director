import { describe, expect, it } from 'vitest';
import { buildProjectFileData, parseProjectPayloadV2 } from '../projectFile';
import { buildRustSceneSnapshotForTimeline } from '../rustSceneSnapshot';
import { createDefaultLayers } from '../sceneState';
import { isSharedRendererNativeMediaReferenceSupported } from '../sharedRendererNativeMediaSupport';
import { buildAviUtlPackPolishRepresentativeScene } from './aviutlPolishRepresentativeScene';

describe('AviUtlPack polish representative scene', () => {
  it('builds a GetColor / hksy / 93 mixed scene for polish regression checks', () => {
    const scene = buildAviUtlPackPolishRepresentativeScene();
    const ids = scene.objects.map((object) => object.id);
    const types = new Set(scene.objects.map((object) => object.type));

    expect(scene.settings).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48000,
      editorMode: '2d',
    });
    expect(ids).toEqual(expect.arrayContaining([
      'polish-getcolor-sampled',
      'polish-hksy-measured-grid',
      'polish-hksy-anchor-line',
      'polish-93-region-frame',
      'polish-93-simple-tube',
      'polish-93-audio-sphere',
    ]));
    expect(types).toEqual(new Set(['shape', 'audio', 'getcolor_dot_field', 'hksy_checker_grid', 'region_frame', 'simple_tube', 'audio_sphere']));
  });

  it('serialises the representative scene into Rust-native media references', () => {
    const scene = buildAviUtlPackPolishRepresentativeScene();
    const result = buildRustSceneSnapshotForTimeline({
      objects: scene.objects,
      layers: createDefaultLayers(),
      settings: scene.settings,
      time: 1,
    });

    if (!result.ok) throw new Error(`expected representative scene snapshot to pass: ${result.issues.map((issue) => issue.message).join(', ')}`);

    const kinds = new Set(result.media.map((reference) => reference.kind));
    expect(kinds).toEqual(new Set([
      'SolidColour',
      'GeneratedGetColorDots',
      'GeneratedHksyCheckerGrid',
      'GeneratedRegionFrame',
      'GeneratedSimpleTube',
      'GeneratedAudioSphere',
    ]));
    expect(result.media.every(isSharedRendererNativeMediaReferenceSupported)).toBe(true);
    expect(result.clips.length).toBeGreaterThanOrEqual(6);
  });

  it('round-trips through the project file format without losing polish objects', () => {
    const scene = buildAviUtlPackPolishRepresentativeScene();
    const file = buildProjectFileData({
      projectSettings: scene.settings,
      activeSceneId: 'aviutl-polish-representative',
      scenes: [{
        id: 'aviutl-polish-representative',
        name: 'AviUtl polish representative',
        objects: scene.objects,
        layers: createDefaultLayers(),
        duration: scene.duration,
      }],
    });
    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    const restoredObjects = parsed.scenes[0].objects;

    expect(restoredObjects.map((object) => object.id)).toEqual(scene.objects.map((object) => object.id));
    expect(restoredObjects.find((object) => object.id === 'polish-getcolor-sampled')).toMatchObject({
      type: 'getcolor_dot_field',
      sampleStrength: 0.85,
      sampleSourceObjectId: 'polish-colour-card',
    });
    expect(restoredObjects.find((object) => object.id === 'polish-hksy-anchor-line')).toMatchObject({
      type: 'hksy_checker_grid',
      pattern: 'anchor-line',
      roundCaps: true,
      maxJoinDistance: 80,
    });
  });
});
