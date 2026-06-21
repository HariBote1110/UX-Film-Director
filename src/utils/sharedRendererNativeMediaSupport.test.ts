import { describe, expect, it } from 'vitest';
import {
  canRenderSharedRendererNativeMediaOnlyFrame,
  isSharedRendererNativeImageSourceSupported,
  isSharedRendererNativeMediaReferenceSupported,
  isSharedRendererNativePsdSourceSupported,
} from './sharedRendererNativeMediaSupport';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

const snapshotWithMedia = (...mediaIds: string[]): RustSceneSnapshot => ({
  frame_index: 12,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: mediaIds.map((mediaId, index) => ({
    clip_id: `clip-${mediaId}`,
    track_id: `layer-${index}`,
    media_id: mediaId,
    source_frame: 0,
    z_index: index,
    transform: {
      translation_x: 0,
      translation_y: 0,
      scale_x: 1,
      scale_y: 1,
      rotation_degrees: 0,
      sampling: 'nearest',
    },
    opacity: 1,
    effects: [],
  })),
});

const media: RustSceneMediaReference[] = [{
  id: 'solid-1',
  kind: 'SolidColour',
  source: '#ff0000',
  width: 2,
  height: 2,
}, {
  id: 'png-1',
  kind: 'Image',
  source: '/tmp/overlay.PNG',
  width: 4,
  height: 4,
}, {
  id: 'jpg-1',
  kind: 'Image',
  source: '/tmp/overlay.jpg',
  width: 4,
  height: 4,
}, {
  id: 'webp-1',
  kind: 'Image',
  source: '/tmp/overlay.webp',
  width: 4,
  height: 4,
}, {
  id: 'psd-1',
  kind: 'Psd',
  source: '/tmp/standing.psd',
  width: 4,
  height: 4,
}, {
  id: 'gradient-1',
  kind: 'GeneratedGradient' as RustSceneMediaReference['kind'],
  source: '{"type":"linear","colours":["#ff0000","#0000ff"],"stops":[0,1],"direction":90}',
  width: 4,
  height: 4,
}, {
  id: 'particle-1',
  kind: 'GeneratedParticle' as RustSceneMediaReference['kind'],
  source: '{"generator":"standard-particle","seed":93,"particle_count":16,"spread":180,"speed":120,"size":6,"colour":"#ffffff","lifetime_seconds":1.5}',
  width: 4,
  height: 4,
}, {
  id: 'barcode-1',
  kind: 'GeneratedBarcode' as RustSceneMediaReference['kind'],
  source: '{"generator":"barcode-t","data":"AviUtl","minimum_bar_width":2,"horizontal_margin":30,"vertical_margin":20,"foreground_colour":"#000000","background_colour":"#ffffff"}',
  width: 160,
  height: 80,
}, {
  id: 'puzzle-1',
  kind: 'GeneratedPuzzlePiece' as RustSceneMediaReference['kind'],
  source: '{"generator":"puzzle-piece","size":120,"shape_variant":1,"connector_mode":"convex","fill_colour":"#ffffff"}',
  width: 240,
  height: 240,
}, {
  id: 'colour-wheel-1',
  kind: 'GeneratedColourWheel' as RustSceneMediaReference['kind'],
  source: '{"generator":"colour-wheel","radius":120,"saturation":100,"brightness":100,"ring_width_percent":25,"segment_count":24}',
  width: 240,
  height: 240,
}, {
  id: 'gourd-1',
  kind: 'GeneratedGourd' as RustSceneMediaReference['kind'],
  source: '{"generator":"gourd-tm","body_radius":80,"body_width":250,"waist_radius":10,"squash_percent":40,"repeat_count":1,"fill_colour":"#ffffff"}',
  width: 400,
  height: 400,
}, {
  id: 'gear-1',
  kind: 'GeneratedGear' as RustSceneMediaReference['kind'],
  source: '{"generator":"gear-t","outer_radius":160,"inner_radius_percent":45,"tooth_count":20,"tooth_depth_percent":18,"tooth_skew_percent":0,"fill_colour":"#ffffff"}',
  width: 320,
  height: 320,
}, {
  id: 'track-bar-1',
  kind: 'GeneratedTrackBar' as RustSceneMediaReference['kind'],
  source: '{"generator":"custom-track-bar","track_values":[0,25,50,-50],"track_ranges":[[0,100],[0,100],[0,100],[-100,100]],"labels":["TrackA","TrackB","TrackC","TrackD"],"bar_colour":"#ffffff","background_opacity":0.05}',
  width: 360,
  height: 120,
}, {
  id: 'pie-chart-1',
  kind: 'GeneratedPieChart' as RustSceneMediaReference['kind'],
  source: '{"generator":"pie-sheet-graph","values":[10,20,30,40],"sort_mode":"descending","normalise_to_hundred":true,"label_mode":"percentage","progress_percent":100,"stroke_width":20,"slice_colours":["#389ba6","#f2e2c4","#f29422","#f27830","#f24b0f"]}',
  width: 400,
  height: 400,
}, {
  id: 'histogram-1',
  kind: 'GeneratedHistogram' as RustSceneMediaReference['kind'],
  source: '{"generator":"simple-histogram","bin_values":[0.08,0.18,0.32,0.55,0.78,0.92,0.64,0.36],"height_scale_percent":100,"line_width":1,"show_luminance":true,"show_red":true,"show_green":true,"show_blue":true,"channel_colours":["#ffffff","#ff4b4b","#4bff6a","#4b8cff"],"background_colour":"#000000"}',
  width: 256,
  height: 200,
}, {
  id: 'sunburst-1',
  kind: 'GeneratedSunburst' as RustSceneMediaReference['kind'],
  source: '{"generator":"sunrise","ray_count":10,"ray_coverage_percent":50,"rotation_offset_degrees":0,"centre_x_percent":50,"centre_y_percent":50,"motif_size":200,"motif_shape":"circle","ray_colour":"#ff0000","background_colour":"#ffff00"}',
  width: 800,
  height: 450,
}, {
  id: 'circular-arrow-1',
  kind: 'GeneratedCircularArrow' as RustSceneMediaReference['kind'],
  source: '{"generator":"circular-arrow","radius":100,"line_width":20,"head_size":50,"angle_degrees":260,"centre_angle_degrees":0,"head_shape":"triangle","show_tail_head":false,"flip_vertical":false,"flip_horizontal":false,"arrow_colour":"#ffff00"}',
  width: 200,
  height: 200,
}, {
  id: 'triangle-bracket-1',
  kind: 'GeneratedTriangleBracket' as RustSceneMediaReference['kind'],
  source: '{"generator":"triangle-bracket","bracket_width":100,"angle_degrees":120,"arm_length":50,"offset_distance":0,"bracket_colour":"#ffffff"}',
  width: 160,
  height: 100,
}, {
  id: 'tartan-check-1',
  kind: 'GeneratedTartanCheck' as RustSceneMediaReference['kind'],
  source: '{"generator":"tartan-check","tile_size":100,"blur_radius":1,"base_colour":"#143e10","stripe_colour_a":"#a81616","stripe_colour_b":"#c9c526","line_colour":"#000000"}',
  width: 800,
  height: 450,
}, {
  id: 'houndstooth-1',
  kind: 'GeneratedHoundstooth' as RustSceneMediaReference['kind'],
  source: '{"generator":"houndstooth","pattern_size":50,"foreground_colour":"#000000","background_colour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'yagasuri-1',
  kind: 'GeneratedYagasuri' as RustSceneMediaReference['kind'],
  source: '{"generator":"yagasuri","arrow_width":15,"arrow_height":65,"line_width":2,"staggered":true,"foreground_colour":"#000000","background_colour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'paper-airplane-1',
  kind: 'GeneratedPaperAirplane' as RustSceneMediaReference['kind'],
  source: '{"generator":"paper-airplane","body_length":200,"wing_width":80,"fold_height":50,"gap":50,"follow_motion_direction":false,"axis_mode":0,"fill_colour":"#ffffff"}',
  width: 320,
  height: 240,
}, {
  id: 'asanoha-pattern-1',
  kind: 'GeneratedAsanohaPattern' as RustSceneMediaReference['kind'],
  source: '{"generator":"asanoha-pattern","pattern_size":50,"line_width":2,"foreground_colour":"#000000","background_colour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'focus-lines-plus-1',
  kind: 'GeneratedFocusLinesPlus' as RustSceneMediaReference['kind'],
  source: '{"generator":"focus-lines-plus","ray_width":1,"gap":5,"centre_radius":100,"rotation_degrees":0,"centre_x":400,"centre_y":225,"centre_jitter_percent":20,"seed":0,"keyframe_interval":0,"line_colour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'random-line-ex-1',
  kind: 'GeneratedRandomLineEx' as RustSceneMediaReference['kind'],
  source: '{"generator":"random-line-ex","line_count":3,"line_width":6,"threshold":128,"noise_cell_size":12,"width_variance":0,"seed":0,"line_colour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'hologram-1',
  kind: 'GeneratedHologram' as RustSceneMediaReference['kind'],
  source: '{"generator":"hologram","tile_size":80,"rotation_degrees":0,"gradient_angle_degrees":-60,"colour_mode":1,"tint_colour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'protractor-1',
  kind: 'GeneratedProtractor' as RustSceneMediaReference['kind'],
  source: '{"generator":"protractor","radius":180,"measured_angle_degrees":90,"tick_step_degrees":10,"major_tick_step_degrees":30,"decimal_places":1,"line_colour":"#ffffff","text_colour":"#ffffff","shadow_colour":"#000000"}',
  width: 420,
  height: 240,
}, {
  id: 'remote-psd-1',
  kind: 'Psd',
  source: 'https://example.com/standing.psd',
  width: 4,
  height: 4,
}, {
  id: 'video-1',
  kind: 'Video',
  source: '/tmp/video.mp4',
  width: 4,
  height: 4,
  source_rate: { numerator: 60, denominator: 1 },
}];

describe('sharedRendererNativeMediaSupport', () => {
  it('accepts local image paths and file URLs with query strings for native Rust loading', () => {
    expect(isSharedRendererNativeImageSourceSupported('/tmp/overlay.PNG')).toBe(true);
    expect(isSharedRendererNativeImageSourceSupported('file:///tmp/native%20overlay.JPG')).toBe(true);
    expect(isSharedRendererNativeImageSourceSupported('file:///tmp/native-overlay.jpeg?cache=12#frame')).toBe(true);
    expect(isSharedRendererNativeImageSourceSupported('https://example.com/native-overlay.jpg')).toBe(false);
    expect(isSharedRendererNativeImageSourceSupported('blob:file:///tmp/native-overlay.jpg')).toBe(false);
    expect(isSharedRendererNativeImageSourceSupported('data:image/png;base64,abcd')).toBe(false);
  });

  it('accepts only local PSD paths and file URLs for native Rust loading', () => {
    expect(isSharedRendererNativePsdSourceSupported('/tmp/standing.psd')).toBe(true);
    expect(isSharedRendererNativePsdSourceSupported('file:///tmp/standing%20pose.PSD')).toBe(true);
    expect(isSharedRendererNativePsdSourceSupported('file:///tmp/standing.psd?cache=12#frame')).toBe(true);
    expect(isSharedRendererNativePsdSourceSupported('https://example.com/standing.psd')).toBe(false);
    expect(isSharedRendererNativePsdSourceSupported('blob:file:///tmp/standing.psd')).toBe(false);
    expect(isSharedRendererNativePsdSourceSupported('/tmp/standing.png')).toBe(false);
  });

  it('matches the Rust backend native media source support contract', () => {
    expect(isSharedRendererNativeMediaReferenceSupported(media[0])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[1])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[2])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[3])).toBe(false);
    expect(isSharedRendererNativeMediaReferenceSupported(media[4])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[5])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[6])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[7])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[8])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[9])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[10])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[11])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[12])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[13])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[14])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[15])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[16])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[17])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[18])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[19])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[20])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[21])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[22])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[23])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[24])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[25])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[26])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[27])).toBe(false);
    expect(isSharedRendererNativeMediaReferenceSupported(media[28])).toBe(false);
  });

  it('allows media-only native render only when every visible clip has a Rust-generated source', () => {
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'png-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'jpg-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'psd-1', 'gradient-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'hologram-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'protractor-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'webp-1'),
      media,
    })).toBe(false);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'remote-psd-1'),
      media,
    })).toBe(false);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'video-1'),
      media,
    })).toBe(false);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'missing-1'),
      media,
    })).toBe(false);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia(),
      media,
    })).toBe(false);
  });
});
