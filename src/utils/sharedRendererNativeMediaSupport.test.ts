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
  source: '{"width":240,"height":240,"radius":120,"saturation":100,"brightness":100,"ringWidthPercent":25,"segmentCount":24}',
  width: 240,
  height: 240,
}, {
  id: 'gourd-1',
  kind: 'GeneratedGourd' as RustSceneMediaReference['kind'],
  source: '{"width":400,"height":400,"bodyRadius":80,"bodyWidth":250,"waistRadius":10,"squashPercent":40,"repeatCount":1,"fillColour":"#ffffff"}',
  width: 400,
  height: 400,
}, {
  id: 'gear-1',
  kind: 'GeneratedGear' as RustSceneMediaReference['kind'],
  source: '{"width":320,"height":320,"outerRadius":160,"innerRadiusPercent":45,"toothCount":20,"toothDepthPercent":18,"toothSkewPercent":0,"fillColour":"#ffffff"}',
  width: 320,
  height: 320,
}, {
  id: 'track-bar-1',
  kind: 'GeneratedTrackBar' as RustSceneMediaReference['kind'],
  source: '{"width":360,"height":120,"trackValues":[0,25,50,-50],"trackRanges":[[0,100],[0,100],[0,100],[-100,100]],"labels":["TrackA","TrackB","TrackC","TrackD"],"barColour":"#ffffff","backgroundOpacity":0.05}',
  width: 360,
  height: 120,
}, {
  id: 'pie-chart-1',
  kind: 'GeneratedPieChart' as RustSceneMediaReference['kind'],
  source: '{"width":400,"height":400,"values":[10,20,30,40],"sortMode":"descending","normaliseToHundred":true,"labelMode":"percentage","progressPercent":100,"strokeWidth":20,"sliceColours":["#389ba6","#f2e2c4","#f29422","#f27830","#f24b0f"]}',
  width: 400,
  height: 400,
}, {
  id: 'histogram-1',
  kind: 'GeneratedHistogram' as RustSceneMediaReference['kind'],
  source: '{"width":256,"height":200,"binValues":[0.08,0.18,0.32,0.55,0.78,0.92,0.64,0.36],"heightScalePercent":100,"lineWidth":1,"showLuminance":true,"showRed":true,"showGreen":true,"showBlue":true,"channelColours":["#ffffff","#ff4b4b","#4bff6a","#4b8cff"],"backgroundColour":"#000000"}',
  width: 256,
  height: 200,
}, {
  id: 'sunburst-1',
  kind: 'GeneratedSunburst' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"rayCount":10,"rayCoveragePercent":50,"rotationOffsetDegrees":0,"centreXPercent":50,"centreYPercent":50,"motifSize":200,"motifShape":"circle","rayColour":"#ff0000","backgroundColour":"#ffff00"}',
  width: 800,
  height: 450,
}, {
  id: 'circular-arrow-1',
  kind: 'GeneratedCircularArrow' as RustSceneMediaReference['kind'],
  source: '{"width":200,"height":200,"radius":100,"lineWidth":20,"headSize":50,"angleDegrees":260,"centreAngleDegrees":0,"headShape":"triangle","showTailHead":false,"flipVertical":false,"flipHorizontal":false,"arrowColour":"#ffff00"}',
  width: 200,
  height: 200,
}, {
  id: 'triangle-bracket-1',
  kind: 'GeneratedTriangleBracket' as RustSceneMediaReference['kind'],
  source: '{"width":160,"height":100,"bracketWidth":100,"angleDegrees":120,"armLength":50,"offsetDistance":0,"bracketColour":"#ffffff"}',
  width: 160,
  height: 100,
}, {
  id: 'tartan-check-1',
  kind: 'GeneratedTartanCheck' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"tileSize":100,"blurRadius":1,"baseColour":"#143e10","stripeColourA":"#a81616","stripeColourB":"#c9c526","lineColour":"#000000"}',
  width: 800,
  height: 450,
}, {
  id: 'houndstooth-1',
  kind: 'GeneratedHoundstooth' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"patternSize":50,"foregroundColour":"#000000","backgroundColour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'yagasuri-1',
  kind: 'GeneratedYagasuri' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"arrowWidth":15,"arrowHeight":65,"lineWidth":2,"staggered":true,"foregroundColour":"#000000","backgroundColour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'paper-airplane-1',
  kind: 'GeneratedPaperAirplane' as RustSceneMediaReference['kind'],
  source: '{"width":320,"height":240,"bodyLength":200,"wingWidth":80,"foldHeight":50,"gap":50,"followMotionDirection":false,"axisMode":0,"fillColour":"#ffffff"}',
  width: 320,
  height: 240,
}, {
  id: 'asanoha-pattern-1',
  kind: 'GeneratedAsanohaPattern' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"patternSize":50,"lineWidth":2,"foregroundColour":"#000000","backgroundColour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'focus-lines-plus-1',
  kind: 'GeneratedFocusLinesPlus' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"rayWidth":1,"gap":5,"centreRadius":100,"rotationDegrees":0,"centreX":400,"centreY":225,"centreJitterPercent":20,"seed":0,"keyframeInterval":0,"lineColour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'random-line-ex-1',
  kind: 'GeneratedRandomLineEx' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"lineCount":3,"lineWidth":6,"threshold":128,"noiseCellSize":12,"widthVariance":0,"seed":0,"lineColour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'hologram-1',
  kind: 'GeneratedHologram' as RustSceneMediaReference['kind'],
  source: '{"width":800,"height":450,"tileSize":80,"rotationDegrees":0,"gradientAngleDegrees":-60,"colourMode":1,"tintColour":"#ffffff"}',
  width: 800,
  height: 450,
}, {
  id: 'protractor-1',
  kind: 'GeneratedProtractor' as RustSceneMediaReference['kind'],
  source: '{"width":420,"height":240,"radius":180,"measuredAngleDegrees":90,"tickStepDegrees":10,"majorTickStepDegrees":30,"decimalPlaces":1,"lineColour":"#ffffff","textColour":"#ffffff","shadowColour":"#000000"}',
  width: 420,
  height: 240,
}, {
  id: 'shaking-polygon-1',
  kind: 'GeneratedShakingPolygon' as RustSceneMediaReference['kind'],
  source: '{"width":360,"height":360,"lineWidth":20,"vertexCount":3,"fixedDiameter":260,"verticalDistortionPercent":0,"repeatCount":1,"repeatFrequency":1,"fill":false,"jitterRange":20,"jitterInterval":10,"stepped":false,"colour":"#ffffff","seed":0}',
  width: 360,
  height: 360,
}, {
  id: 'tone-curve-1',
  kind: 'GeneratedToneCurve' as RustSceneMediaReference['kind'],
  source: '{"width":360,"height":360,"gridDivisions":4,"lineWidth":3,"curvePoints":[0,0.16,0.42,0.7,1],"curveColour":"#ffffff","gridColour":"#333333","backgroundColour":"#000000"}',
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
  source: '{"cellSize":50,"lineWidth":2,"checkerEnabled":true,"gridEnabled":true,"foregroundColour":"#ffffff","secondaryColour":"#333333","backgroundColour":"#000000"}',
  width: 800,
  height: 450,
}, {
  id: 'hksy-multi-colour-checker-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"cellSize":56,"lineWidth":0,"checkerEnabled":true,"gridEnabled":false,"foregroundColour":"#ff5c8a","secondaryColour":"#36c2ff","backgroundColour":"#111111","paletteColours":["#ff5c8a","#36c2ff","#ffd166","#70e000"]}',
  width: 800,
  height: 450,
}, {
  id: 'hksy-diamond-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"pattern":"diamond","cellSize":64,"lineWidth":96,"checkerEnabled":false,"gridEnabled":false,"foregroundColour":"#ffffff","secondaryColour":"#ffffff","backgroundColour":"#000000"}',
  width: 480,
  height: 360,
}, {
  id: 'hksy-measured-grid-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"pattern":"measured-grid","cellSize":32,"lineWidth":1,"checkerEnabled":false,"gridEnabled":true,"foregroundColour":"#ffffff","secondaryColour":"#bbeeff","backgroundColour":"#10131a","separateInterval":5,"separateLineWidth":3}',
  width: 960,
  height: 540,
}, {
  id: 'hksy-anchor-line-1',
  kind: 'GeneratedHksyCheckerGrid' as RustSceneMediaReference['kind'],
  source: '{"pattern":"anchor-line","cellSize":64,"lineWidth":20,"checkerEnabled":false,"gridEnabled":false,"foregroundColour":"#ffffff","secondaryColour":"#ffffff","backgroundColour":"#000000","anchorPoints":[{"x":-88,"y":50},{"x":0,"y":-100},{"x":88,"y":50}],"roundCaps":true,"maxJoinDistance":50}',
  width: 480,
  height: 360,
}, {
  id: 'region-frame-1',
  kind: 'GeneratedRegionFrame' as RustSceneMediaReference['kind'],
  source: '{"lineWidth":10,"shape":"rectangle","extraWidth":0,"extraHeight":0,"backgroundOpacity":0.2,"frameColour":"#ffffff","backgroundColour":"#ccccff"}',
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
      source: '{"radius":150,"depth":280,"segments":16,"rings":10,"twistDegrees":0,"randomAmount":0,"strokeWidth":3,"colour":"#0e769f","secondaryColour":"#ffffff","colourPattern":"single","fogStrength":0,"fogColour":"#ffffff","seed":93,"torus":false}',
      width: 800,
      height: 450,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'simple-tube-1'),
      media: [...media, {
        id: 'simple-tube-1',
        kind: 'GeneratedSimpleTube',
        source: '{"radius":150,"depth":280,"segments":16,"rings":10,"twistDegrees":0,"randomAmount":0,"strokeWidth":3,"colour":"#0e769f","secondaryColour":"#ffffff","colourPattern":"single","fogStrength":0,"fogColour":"#ffffff","seed":93,"torus":false}',
        width: 800,
        height: 450,
      }],
    })).toBe(true);
  });

  it('accepts 93 contour trace generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'contour-trace-1',
      kind: 'GeneratedContourTrace',
      source: '{"width":800,"height":450,"lineWidth":3,"contourCount":5,"jitterAmount":1.5,"traceColour":"#ffffff","backgroundOpacity":0,"seed":93}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'contour-trace-invalid-1',
      kind: 'GeneratedContourTrace',
      source: '{"width":800,"height":450,"lineWidth":0,"contourCount":5,"jitterAmount":1.5,"traceColour":"#ffffff","backgroundOpacity":0,"seed":93}',
      width: 800,
      height: 450,
    })).toBe(false);
  });

  it('accepts 93 displacement poly generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'displacement-poly-1',
      kind: 'GeneratedDisplacementPoly',
      source: '{"width":800,"height":450,"columns":14,"rows":8,"displacementScale":42,"depthScale":18,"meshOpacity":0.85,"fillOpacity":0.18,"lineColour":"#36c2ff","fillColour":"#0b1020","seed":93}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'displacement-poly-invalid-1',
      kind: 'GeneratedDisplacementPoly',
      source: '{"width":800,"height":450,"columns":0,"rows":8,"displacementScale":42,"depthScale":18,"meshOpacity":0.85,"fillOpacity":0.18,"lineColour":"#36c2ff","fillColour":"#0b1020","seed":93}',
      width: 800,
      height: 450,
    })).toBe(false);
  });

  it('accepts 93 PlainEffector Line generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'plain-effector-line-1',
      kind: 'GeneratedPlainEffectorLine',
      source: '{"width":800,"height":450,"radius":100,"strength":1,"randomness":0,"zoom":1,"invert":false,"lineCount":24,"lineWidth":2,"colour":"#f74d52","colourAmount":1,"seed":93}',
      width: 800,
      height: 450,
    })).toBe(true);

    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'plain-effector-line-invalid-1',
      kind: 'GeneratedPlainEffectorLine',
      source: '{"width":800,"height":450,"radius":0,"strength":1,"randomness":0,"zoom":1,"invert":false,"lineCount":24,"lineWidth":2,"colour":"#f74d52","colourAmount":1,"seed":93}',
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
      source: '{"radius":170,"depth":260,"segments":24,"rings":16,"twistDegrees":120,"randomAmount":0,"strokeWidth":3,"colour":"#0e769f","secondaryColour":"#f9f9f9","colourPattern":"ring","fogStrength":0.35,"fogColour":"#ffffff","seed":93,"torus":true}',
      width: 800,
      height: 450,
    })).toBe(true);
  });

  it('accepts 93 Sphere(DrawPixel) generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'sphere-dots-1',
      kind: 'GeneratedSphereDots',
      source: '{"radius":170,"columns":16,"rows":12,"rotationDegrees":10,"offsetDegrees":0,"luminanceInfluence":0,"pointSize":6,"latitudeLineWidth":2,"colour":"#ffffff","secondaryColour":"#36c2ff","seed":93,"planeMode":false}',
      width: 480,
      height: 480,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'sphere-dots-1'),
      media: [...media, {
        id: 'sphere-dots-1',
        kind: 'GeneratedSphereDots',
        source: '{"radius":170,"columns":16,"rows":12,"rotationDegrees":10,"offsetDegrees":0,"luminanceInfluence":0,"pointSize":6,"latitudeLineWidth":2,"colour":"#ffffff","secondaryColour":"#36c2ff","seed":93,"planeMode":false}',
        width: 480,
        height: 480,
      }],
    })).toBe(true);
  });

  it('accepts 93 SphericalField generator sources as native renderable media', () => {
    expect(isSharedRendererNativeMediaReferenceSupported({
      id: 'spherical-field-1',
      kind: 'GeneratedSphericalField',
      source: '{"radius":160,"strength":100,"colourAmount":100,"alphaAmount":0,"lineWidth":3,"ringCount":4,"vectorCount":16,"fieldColour":"#ff3b30","secondaryColour":"#36c2ff","backgroundOpacity":0.08,"container":false,"seed":93}',
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
