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
  source: '{"width":4,"height":4,"particleCount":16,"seed":93,"spread":180,"speed":120,"size":6,"colour":"#ffffff","lifetimeSeconds":1.5}',
  width: 4,
  height: 4,
}, {
  id: 'barcode-1',
  kind: 'GeneratedBarcode' as RustSceneMediaReference['kind'],
  source: '{"width":4,"height":4,"data":"AviUtl","minimumBarWidth":2,"horizontalMargin":30,"verticalMargin":20,"foregroundColour":"#000000","backgroundColour":"#ffffff"}',
  width: 160,
  height: 80,
}, {
  id: 'puzzle-1',
  kind: 'GeneratedPuzzlePiece' as RustSceneMediaReference['kind'],
  source: '{"width":240,"height":240,"size":120,"shapeVariant":1,"connectorMode":"convex","fillColour":"#ffffff"}',
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
  id: 'shaking-polygon-1',
  kind: 'GeneratedShakingPolygon' as RustSceneMediaReference['kind'],
  source: '{"generator":"shaking-polygon","line_width":20,"vertex_count":3,"fixed_diameter":260,"vertical_distortion_percent":0,"repeat_count":1,"repeat_frequency":1,"fill":false,"jitter_range":20,"jitter_interval":10,"stepped":false,"colour":"#ffffff","seed":0}',
  width: 360,
  height: 360,
}, {
  id: 'tone-curve-1',
  kind: 'GeneratedToneCurve' as RustSceneMediaReference['kind'],
  source: '{"generator":"simple-tone-curve","grid_divisions":4,"line_width":3,"curve_points":[0,0.16,0.42,0.7,1],"curve_colour":"#ffffff","grid_colour":"#333333","background_colour":"#000000"}',
  width: 360,
  height: 360,
}, {
  id: 'audio-sphere-1',
  kind: 'GeneratedAudioSphere' as RustSceneMediaReference['kind'],
  source: '{"generator":"audio-sphere-93","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":0.1,"columns":16,"rows":12,"base_radius":170,"audio_influence":0.6,"point_size":5,"polygon_size":0.35,"random_amount":0.05,"colour":"#36c2ff","seed":93}',
  width: 480,
  height: 480,
}, {
  id: 'getcolor-dot-field-1',
  kind: 'GeneratedGetColorDots' as RustSceneMediaReference['kind'],
  source: '{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":14,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93}',
  width: 800,
  height: 450,
}, {
  id: 'hksy-checker-grid-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"generator":"hksy-checker-grid","cell_size":50,"line_width":2,"checker_enabled":true,"grid_enabled":true,"foreground_colour":"#ffffff","secondary_colour":"#333333","background_colour":"#000000"}',
  width: 800,
  height: 450,
}, {
  id: 'hksy-multi-colour-checker-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"generator":"hksy-checker-grid","cell_size":56,"line_width":0,"checker_enabled":true,"grid_enabled":false,"foreground_colour":"#ff5c8a","secondary_colour":"#36c2ff","background_colour":"#111111","palette_colours":["#ff5c8a","#36c2ff","#ffd166","#70e000"]}',
  width: 800,
  height: 450,
}, {
  id: 'hksy-diamond-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"generator":"hksy-checker-grid","pattern":"diamond","cell_size":64,"line_width":96,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ffffff","secondary_colour":"#ffffff","background_colour":"#000000"}',
  width: 480,
  height: 360,
}, {
  id: 'hksy-measured-grid-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"generator":"hksy-checker-grid","pattern":"measured-grid","cell_size":32,"line_width":1,"checker_enabled":false,"grid_enabled":true,"foreground_colour":"#ffffff","secondary_colour":"#bbeeff","background_colour":"#10131a","separate_interval":5,"separate_line_width":3}',
  width: 960,
  height: 540,
}, {
  id: 'hksy-anchor-line-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"generator":"hksy-checker-grid","pattern":"anchor-line","cell_size":64,"line_width":20,"checker_enabled":false,"grid_enabled":false,"foreground_colour":"#ffffff","secondary_colour":"#ffffff","background_colour":"#000000","anchor_points":[{"x":-88,"y":50},{"x":0,"y":-100},{"x":88,"y":50}],"round_caps":true,"max_join_distance":50}',
  width: 480,
  height: 360,
}, {
  id: 'region-frame-1',
  kind: 'GeneratedRegionFrame' as RustSceneMediaReference['kind'],
  source: '{"generator":"region-frame-93","line_width":10,"shape":"rectangle","extra_width":0,"extra_height":0,"background_opacity":0.2,"frame_colour":"#ffffff","background_colour":"#ccccff"}',
  width: 800,
  height: 450,
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
    expect(isSharedRendererNativeMediaReferenceSupported(media[27])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[28])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[29])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[30])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[31])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[32])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[33])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[34])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[35])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[36])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[37])).toBe(false);
    expect(isSharedRendererNativeMediaReferenceSupported(media[38])).toBe(false);
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
      snapshot: snapshotWithMedia('solid-1', 'shaking-polygon-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'tone-curve-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'getcolor-dot-field-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'audio-sphere-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'hksy-checker-grid-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'hksy-multi-colour-checker-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'hksy-diamond-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'hksy-measured-grid-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'hksy-anchor-line-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'region-frame-1'),
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

  it('accepts GetColor V2R diamond dot generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'getcolor-diamond-dot-field-1',
      kind: 'GeneratedGetColorDots',
      source: '{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":18,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"diamond","stroke_width":0}',
      width: 800,
      height: 450,
    })).toBe(true);
  });

  it('accepts GetColor V2R sampled image generator sources and rejects invalid sample strength', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'getcolor-sampled-dot-field-1',
      kind: 'GeneratedGetColorDots',
      source: '{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":16,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"file:///tmp/source-colours.png","sample_strength":1,"sample_hue_shift_degrees":120}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'getcolor-sampled-dot-field-invalid-1',
      kind: 'GeneratedGetColorDots',
      source: '{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":16,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"file:///tmp/source-colours.png","sample_strength":2}',
      width: 800,
      height: 450,
    })).toBe(false);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'getcolor-sampled-dot-field-invalid-hue-shift-1',
      kind: 'GeneratedGetColorDots',
      source: '{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":16,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"file:///tmp/source-colours.png","sample_strength":1,"sample_hue_shift_degrees":1000}',
      width: 800,
      height: 450,
    })).toBe(false);
  });

  it('accepts GetColor V2R sampled PSD generator sources with active layer ids', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'getcolor-psd-sampled-dot-field-1',
      kind: 'GeneratedGetColorDots',
      source: '{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":16,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"file:///tmp/standing-source.psd","source_active_layer_ids":["eye-open","mouth-open","root"],"sample_strength":0.75}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'getcolor-psd-sampled-dot-field-invalid-1',
      kind: 'GeneratedGetColorDots',
      source: '{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":16,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"file:///tmp/standing-source.psd","source_active_layer_ids":["eye-open",93],"sample_strength":0.75}',
      width: 800,
      height: 450,
    })).toBe(false);
  });

  it('accepts 93 SimpleTube generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'simple-tube-1',
      kind: 'GeneratedSimpleTube',
      source: '{"generator":"simple-tube-93","radius":150,"depth":280,"segments":16,"rings":10,"twist_degrees":0,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#ffffff","colour_pattern":"single","fog_strength":0,"fog_colour":"#ffffff","seed":93,"torus":false}',
      width: 800,
      height: 450,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'simple-tube-1'),
      media: [...media, {
        id: 'simple-tube-1',
        kind: 'GeneratedSimpleTube',
        source: '{"generator":"simple-tube-93","radius":150,"depth":280,"segments":16,"rings":10,"twist_degrees":0,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#ffffff","colour_pattern":"single","fog_strength":0,"fog_colour":"#ffffff","seed":93,"torus":false}',
        width: 800,
        height: 450,
      }],
    })).toBe(true);
  });

  it('accepts 93 contour trace generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'contour-trace-1',
      kind: 'GeneratedContourTrace',
      source: '{"generator":"contour-trace-93","line_width":3,"contour_count":5,"jitter_amount":1.5,"trace_colour":"#ffffff","background_opacity":0,"seed":93}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'contour-trace-invalid-1',
      kind: 'GeneratedContourTrace',
      source: '{"generator":"contour-trace-93","line_width":0,"contour_count":5,"jitter_amount":1.5,"trace_colour":"#ffffff","background_opacity":0,"seed":93}',
      width: 800,
      height: 450,
    })).toBe(false);
  });

  it('accepts 93 displacement poly generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'displacement-poly-1',
      kind: 'GeneratedDisplacementPoly',
      source: '{"generator":"displacement-poly-93","columns":14,"rows":8,"displacement_scale":42,"depth_scale":18,"mesh_opacity":0.85,"fill_opacity":0.18,"line_colour":"#36c2ff","fill_colour":"#0b1020","seed":93}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'displacement-poly-invalid-1',
      kind: 'GeneratedDisplacementPoly',
      source: '{"generator":"displacement-poly-93","columns":0,"rows":8,"displacement_scale":42,"depth_scale":18,"mesh_opacity":0.85,"fill_opacity":0.18,"line_colour":"#36c2ff","fill_colour":"#0b1020","seed":93}',
      width: 800,
      height: 450,
    })).toBe(false);
  });

  it('accepts 93 PlainEffector Line generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'plain-effector-line-1',
      kind: 'GeneratedPlainEffectorLine',
      source: '{"generator":"plain-effector-line-93","radius":100,"strength":1,"randomness":0,"zoom":1,"invert":false,"line_count":24,"line_width":2,"colour":"#f74d52","colour_amount":1,"seed":93}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'plain-effector-line-invalid-1',
      kind: 'GeneratedPlainEffectorLine',
      source: '{"generator":"plain-effector-line-93","radius":0,"strength":1,"randomness":0,"zoom":1,"invert":false,"line_count":24,"line_width":2,"colour":"#f74d52","colour_amount":1,"seed":93}',
      width: 800,
      height: 450,
    })).toBe(false);
  });

  it('accepts 93 shattered sphere generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'shattered-sphere-1',
      kind: 'GeneratedShatteredSphere',
      source: '{"generator":"shattered-sphere-93","fracture_amount":100,"delay":100,"radius":160,"limit_distance":150,"thickness":20,"fragment_size":40,"random_shape":100,"speed":100,"impact":100,"gravity":[0,100,0],"spin":100,"direction_diffusion":100,"colour":"#ffffff","seed":93}',
      width: 360,
      height: 360,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'shattered-sphere-invalid-1',
      kind: 'GeneratedShatteredSphere',
      source: '{"generator":"shattered-sphere-93","fracture_amount":100,"delay":100,"radius":0,"limit_distance":150,"thickness":20,"fragment_size":40,"random_shape":100,"speed":100,"impact":100,"gravity":[0,100,0],"spin":100,"direction_diffusion":100,"colour":"#ffffff","seed":93}',
      width: 360,
      height: 360,
    })).toBe(false);
  });

  it('accepts 93 SimpleTube torus generator sources with colour pattern and fog', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'simple-tube-torus-1',
      kind: 'GeneratedSimpleTube',
      source: '{"generator":"simple-tube-93","radius":170,"depth":260,"segments":24,"rings":16,"twist_degrees":120,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#f9f9f9","colour_pattern":"ring","fog_strength":0.35,"fog_colour":"#ffffff","seed":93,"torus":true}',
      width: 800,
      height: 450,
    })).toBe(true);
  });

  it('accepts 93 Sphere(DrawPixel) generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'sphere-dots-1',
      kind: 'GeneratedSphereDots',
      source: '{"generator":"sphere-drawpixel-93","radius":170,"columns":16,"rows":12,"rotation_degrees":10,"offset_degrees":0,"luminance_influence":0,"point_size":6,"latitude_line_width":2,"colour":"#ffffff","secondary_colour":"#36c2ff","seed":93,"plane_mode":false}',
      width: 480,
      height: 480,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'sphere-dots-1'),
      media: [...media, {
        id: 'sphere-dots-1',
        kind: 'GeneratedSphereDots',
        source: '{"generator":"sphere-drawpixel-93","radius":170,"columns":16,"rows":12,"rotation_degrees":10,"offset_degrees":0,"luminance_influence":0,"point_size":6,"latitude_line_width":2,"colour":"#ffffff","secondary_colour":"#36c2ff","seed":93,"plane_mode":false}',
        width: 480,
        height: 480,
      }],
    })).toBe(true);
  });

  it('accepts 93 SphericalField generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'spherical-field-1',
      kind: 'GeneratedSphericalField',
      source: '{"generator":"spherical-field-93","radius":160,"strength":100,"colour_amount":100,"alpha_amount":0,"line_width":3,"ring_count":4,"vector_count":16,"field_colour":"#ff3b30","secondary_colour":"#36c2ff","background_opacity":0.08,"container":false,"seed":93}',
      width: 480,
      height: 480,
    })).toBe(true);
  });

  it('accepts cosmic-text text generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'text-1',
      kind: 'Text',
      source: JSON.stringify({
        text: 'こんにちは',
        fontFamily: 'Hiragino Sans',
        fontSize: 48,
        fill: '#ffffff',
      }),
      width: 240,
      height: 58,
    })).toBe(true);
  });

  it('rejects malformed text generator sources', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'text-bad',
      kind: 'Text',
      source: JSON.stringify({ text: 42, fontSize: 'big' }),
      width: 240,
      height: 58,
    })).toBe(false);
  });

  it('accepts cosmic-text text generator sources with a stroke and shadow', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'text-stroke-shadow-1',
      kind: 'Text',
      source: JSON.stringify({
        text: 'Outlined',
        fontFamily: 'Arial',
        fontSize: 48,
        fill: '#ffffff',
        textStroke: { colour: '#000000', width: 3 },
        textShadow: { colour: '#333333', offsetX: 2, offsetY: 4, blur: 6 },
      }),
      width: 300,
      height: 80,
    })).toBe(true);
  });

  it('rejects text generator sources with a malformed stroke or shadow', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'text-bad-stroke-1',
      kind: 'Text',
      source: JSON.stringify({
        text: 'Outlined',
        fontFamily: 'Arial',
        fontSize: 48,
        fill: '#ffffff',
        textStroke: { colour: 'red', width: 3 },
      }),
      width: 300,
      height: 80,
    })).toBe(false);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'text-bad-shadow-1',
      kind: 'Text',
      source: JSON.stringify({
        text: 'Outlined',
        fontFamily: 'Arial',
        fontSize: 48,
        fill: '#ffffff',
        textShadow: { colour: '#333333', offsetX: 2, offsetY: 4, blur: 'big' },
      }),
      width: 300,
      height: 80,
    })).toBe(false);
  });

  it('accepts shape wire sources for non-rectangle shapes as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'shape-circle-1',
      kind: 'GeneratedShape',
      source: JSON.stringify({
        shapeType: 'circle',
        width: 200,
        height: 200,
        fill: '#ff0000',
      }),
      width: 200,
      height: 200,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'shape-rounded-rect-1',
      kind: 'GeneratedShape',
      source: JSON.stringify({
        shapeType: 'rounded_rect',
        width: 200,
        height: 200,
        fill: '#000000',
        gradient: {
          enabled: true,
          type: 'linear',
          colours: ['#ff0000', '#0000ff'],
          stops: [0, 1],
          direction: 90,
        },
        cornerRadius: 24,
      }),
      width: 200,
      height: 200,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'shape-rounded-rect-1'),
      media: [...media, {
        id: 'shape-rounded-rect-1',
        kind: 'GeneratedShape',
        source: JSON.stringify({
          shapeType: 'rounded_rect',
          width: 200,
          height: 200,
          fill: '#000000',
          cornerRadius: 24,
        }),
        width: 200,
        height: 200,
      }],
    })).toBe(true);
  });

  it('rejects malformed or unsupported shape wire sources', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'shape-bad-type-1',
      kind: 'GeneratedShape',
      source: JSON.stringify({
        shapeType: 'unknown_shape',
        width: 200,
        height: 200,
        fill: '#ff0000',
      }),
      width: 200,
      height: 200,
    })).toBe(false);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'shape-bad-colour-1',
      kind: 'GeneratedShape',
      source: JSON.stringify({
        shapeType: 'circle',
        width: 200,
        height: 200,
        fill: 'red',
      }),
      width: 200,
      height: 200,
    })).toBe(false);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'shape-bad-corner-radius-1',
      kind: 'GeneratedShape',
      source: JSON.stringify({
        shapeType: 'rounded_rect',
        width: 200,
        height: 200,
        fill: '#ff0000',
        cornerRadius: -1,
      }),
      width: 200,
      height: 200,
    })).toBe(false);
  });
});
