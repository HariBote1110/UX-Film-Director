import { describe, expect, it } from 'vitest';
import { buildNativeOverlayAttachRect } from './nativeOverlayViewportGeometry';

describe('nativeOverlayViewportGeometry', () => {
  it('builds a viewport-relative attach rectangle with scale factor', () => {
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 100,
        top: 50,
        width: 800,
        height: 200,
      },
      contentHeight: 600,
      devicePixelRatio: 2,
    })).toEqual({
      x: 100,
      y: 350,
      width: 800,
      height: 200,
      scaleFactor: 2,
    });
  });

  it('uses the backing scale factor as the canonical HiDPI scale input', () => {
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 24,
        top: 32,
        width: 480,
        height: 270,
      },
      contentHeight: 720,
      backingScaleFactor: 2.5,
    })).toEqual({
      x: 24,
      y: 418,
      width: 480,
      height: 270,
      scaleFactor: 2.5,
    });
  });

  it('clamps invalid dimensions and scale factor before IPC', () => {
    // width/height/scaleFactor はゼロ・NaN 入力に対しフォールバックへ
    // クランプされる（native側の drawable/window 生成が最低1px・正のスケール
    // を要求するため）。y はここでは height フォールバック(1)適用後の
    // 通常算出式どおりの値になり、x/y 自体は非負にクランプされない
    // （負座標を許容する仕様は下のテストを参照）。
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 0,
        top: 0,
        width: 0,
        height: Number.NaN,
      },
      contentHeight: 0,
      devicePixelRatio: 0,
    })).toEqual({
      x: 0,
      y: -1,
      width: 1,
      height: 1,
      scaleFactor: 1,
    });
  });

  it('allows a negative x/y when the preview pane extends past the window origin', () => {
    // native-overlay 側（macos_overlay.rs create_overlay_child_window /
    // resolve_view_local_rect_for_parent_bounds）は convertRect: による通常の
    // 座標変換のみを行い、x/y が非負であることを一切前提にしていない。
    // preview ペインがウィンドウ上端より上（top が負）や、ウィンドウ左端より
    // 左（left が負）にはみ出す場合、あるいは preview がウィンドウ下端より
    // 下まで伸びる（top+height > contentHeight）場合、x/y は本来負の値を
    // 取りうる。0へクランプすると overlay が本来の位置からずれて表示される。
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: -40,
        top: -20,
        width: 800,
        height: 200,
      },
      contentHeight: 100,
      devicePixelRatio: 1,
    })).toEqual({
      x: -40,
      y: -80,
      width: 800,
      height: 200,
      scaleFactor: 1,
    });
  });

  it('adds visual viewport offsets before converting to the native lower-left origin', () => {
    expect(buildNativeOverlayAttachRect({
      viewportRect: {
        left: 10.25,
        top: 20.5,
        width: 640.5,
        height: 360.25,
      },
      contentHeight: 800.75,
      devicePixelRatio: 1.5,
      viewportOffsetLeft: 3.5,
      viewportOffsetTop: 7.25,
    })).toEqual({
      x: 13.75,
      y: 412.75,
      width: 640.5,
      height: 360.25,
      scaleFactor: 1.5,
    });
  });
});
