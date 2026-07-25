import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TimelineObject } from '../types';
import {
  buildSelectionDecorationQuads,
  createNativeOverlaySelectionDecorationSender,
  shouldSendStandaloneDecoration,
  type SelectionDecorationSendState,
} from './nativeOverlaySelectionDecoration';
import { getObjectWorldCorners, worldPointToCssPoint, type SceneHitTestViewport } from './sceneHitTest';

const root = resolve(__dirname, '../..');

/**
 * 実機バグ: SceneSelectionOverlay（HTML/SVG）は child NSWindow 化された
 * native overlay より常に下にあり、オブジェクトが現在フレームに描画されて
 * いる間は選択枠が不透明ピクセルに隠れて見えない。修正は「枠・ハンドルの
 * 見た目を native overlay 側（Rust/wgpu）で描く」こと。ここでは renderer 側の
 * 送信条件ロジック（quad 構築・不変時は送らない dedupe）と、SVG を
 * 「不可視だが操作可能」なヒット領域として残すフォールバック配線を固定する。
 */

const imageObject = (overrides: Partial<Record<string, unknown>> = {}): TimelineObject => ({
  id: 'obj-1',
  type: 'image',
  name: 'obj-1',
  src: 'image.png',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  layer: 0,
  startTime: 0,
  duration: 10,
  ...overrides,
} as unknown as TimelineObject);

describe('buildSelectionDecorationQuads', () => {
  it('returns world corner quads for selected objects using getObjectWorldCorners', () => {
    const objects = [imageObject()];

    const quads = buildSelectionDecorationQuads({
      selectedIds: ['obj-1'],
      objects,
      time: 1,
    });

    expect(quads).toEqual([{
      topLeftX: 10,
      topLeftY: 20,
      topRightX: 110,
      topRightY: 20,
      bottomRightX: 110,
      bottomRightY: 70,
      bottomLeftX: 10,
      bottomLeftY: 70,
    }]);
  });

  it('skips selected ids without a sized object and returns an empty list when nothing is selected', () => {
    const objects = [
      imageObject(),
      { id: 'group-1', type: 'group_control', layer: 1, startTime: 0, duration: 10 } as unknown as TimelineObject,
    ];

    expect(buildSelectionDecorationQuads({ selectedIds: [], objects, time: 1 })).toEqual([]);
    expect(buildSelectionDecorationQuads({ selectedIds: ['missing'], objects, time: 1 })).toEqual([]);
    expect(buildSelectionDecorationQuads({ selectedIds: ['group-1'], objects, time: 1 })).toEqual([]);
  });

  it('returns an empty list for a selected object that is off-time (playhead outside [startTime, startTime+duration)) — 症状A: ゴースト選択枠対策', () => {
    const objects = [imageObject({ startTime: 5, duration: 10 })];

    expect(buildSelectionDecorationQuads({ selectedIds: ['obj-1'], objects, time: 0 })).toEqual([]);
    expect(buildSelectionDecorationQuads({ selectedIds: ['obj-1'], objects, time: 20 })).toEqual([]);
    expect(buildSelectionDecorationQuads({ selectedIds: ['obj-1'], objects, time: 5 })).toHaveLength(1);
  });

  it('applies object rotation to the quad corners', () => {
    const objects = [imageObject({ x: 0, y: 0, rotation: 90 })];

    const quads = buildSelectionDecorationQuads({ selectedIds: ['obj-1'], objects, time: 1 });

    expect(quads).toHaveLength(1);
    expect(quads[0].topLeftX).toBeCloseTo(0, 5);
    expect(quads[0].topLeftY).toBeCloseTo(0, 5);
    expect(quads[0].topRightX).toBeCloseTo(0, 5);
    expect(quads[0].topRightY).toBeCloseTo(100, 5);
    expect(quads[0].bottomRightX).toBeCloseTo(-50, 5);
    expect(quads[0].bottomRightY).toBeCloseTo(100, 5);
  });
});

describe('createNativeOverlaySelectionDecorationSender', () => {
  const payload = {
    canvasWidth: 1920,
    canvasHeight: 1080,
    quads: [{
      topLeftX: 10, topLeftY: 20,
      topRightX: 110, topRightY: 20,
      bottomRightX: 110, bottomRightY: 70,
      bottomLeftX: 10, bottomLeftY: 70,
    }],
  };

  it('sends the payload once and skips identical payloads (drag moves without value change)', async () => {
    const send = vi.fn(async () => ({ success: true, attached: true }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    const first = sender.update(payload, 0);
    expect(first).not.toBeNull();
    await first;
    // ドラッグ中の毎 pointermove でも、quad の値が不変なら IPC を送らない契約。
    expect(sender.update({ ...payload, quads: [{ ...payload.quads[0] }] }, 0)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('re-sends when the quad values change', async () => {
    const send = vi.fn(async () => ({ success: true, attached: true }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    await sender.update(payload, 0);
    const moved = {
      ...payload,
      quads: [{ ...payload.quads[0], topLeftX: 11, topRightX: 111, bottomRightX: 111, bottomLeftX: 11 }],
    };
    await sender.update(moved, 0);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(moved);
  });

  it('sends an empty quads payload when the previous payload had quads (clears a ghost decoration for an off-time object)', async () => {
    // buildSelectionDecorationQuads は在圏外オブジェクトに対して [] を返す
    // （症状A対策）。空配列 payload も他の値と同様に dedupe key が変わるため
    // 送信され、native 側のデコレーションが確実にクリアされることを固定する。
    const send = vi.fn(async () => ({ success: true, attached: true }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    await sender.update(payload, 0);
    expect(send).toHaveBeenCalledTimes(1);

    const cleared = { ...payload, quads: [] };
    await sender.update(cleared, 0);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(cleared);
  });

  it('re-sends an identical payload when the resend key changes (native overlay re-attach)', async () => {
    // attach は resize 等で作り直され addon 側の state が失われ得るため、
    // attach 完了 tick を鍵に同値 payload でも再送する契約。
    const send = vi.fn(async () => ({ success: true, attached: true }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    await sender.update(payload, 0);
    await sender.update(payload, 1);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('single-flight: collapses updates that arrive while a send is in-flight into one latest-wins resend', async () => {
    // native 側 present は同期的で数十ms級のため、drag 中の毎 pointermove で
    // update が呼ばれても IPC invoke を積み上げない契約（症状A: 選択枠が
    // 5fps 級でガタつく実機バグの対策）。未解決 Promise を使い、in-flight 中に
    // 合流した複数 update が1件（最新値）に集約されることを固定する。
    let resolveFirstSend: ((value: { success: boolean; attached: boolean }) => void) | undefined;
    const send = vi.fn(() => new Promise<{ success: boolean; attached: boolean }>((resolve) => {
      resolveFirstSend = resolve;
    }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    const moved1 = {
      ...payload,
      quads: [{ ...payload.quads[0], topLeftX: 11, topRightX: 111, bottomRightX: 111, bottomLeftX: 11 }],
    };
    const moved2 = {
      ...payload,
      quads: [{ ...payload.quads[0], topLeftX: 12, topRightX: 112, bottomRightX: 112, bottomLeftX: 12 }],
    };
    const moved3 = {
      ...payload,
      quads: [{ ...payload.quads[0], topLeftX: 13, topRightX: 113, bottomRightX: 113, bottomLeftX: 13 }],
    };

    // 最初の update は即送信され in-flight になる。
    const first = sender.update(moved1, 0);
    expect(first).not.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    // in-flight 中に合流した update は send を増やさず、最新の1件だけを保持する。
    expect(sender.update(moved2, 0)).toBeNull();
    expect(sender.update(moved3, 0)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    // 最初の send が解決すると、保持中の最新 payload（moved3）だけが1回送られる。
    resolveFirstSend?.({ success: true, attached: true });
    await first;
    // flushQueued は finally 内の非同期チェーンなので、マイクロタスクを進める。
    await Promise.resolve();
    await Promise.resolve();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(moved3);
  });

  it('single-flight: does not re-send when the payload settles back to the last sent value while in-flight', async () => {
    let resolveFirstSend: ((value: { success: boolean; attached: boolean }) => void) | undefined;
    const send = vi.fn(() => new Promise<{ success: boolean; attached: boolean }>((resolve) => {
      resolveFirstSend = resolve;
    }));
    const sender = createNativeOverlaySelectionDecorationSender(send);

    const first = sender.update(payload, 0);
    expect(send).toHaveBeenCalledTimes(1);

    const moved = {
      ...payload,
      quads: [{ ...payload.quads[0], topLeftX: 11, topRightX: 111, bottomRightX: 111, bottomLeftX: 11 }],
    };
    expect(sender.update(moved, 0)).toBeNull();
    // ドラッグが元の位置へ戻った: 最後に送った値と同一になったので再送不要。
    expect(sender.update(payload, 0)).toBeNull();

    resolveFirstSend?.({ success: true, attached: true });
    await first;
    await Promise.resolve();
    await Promise.resolve();

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('scene selection overlay native decoration boundary', () => {
  it('keeps the SVG overlay as an invisible-but-interactive hit area when native decoration is active', () => {
    // SVG は削除しない: リサイズハンドルの pointer 操作（pointerEvents:'auto'）は
    // SVG 側に残す必要がある。native overlay がデコレーションを描いている間は
    // stroke/fill を透明化し、native overlay 不可用時は可視スタイルへ戻す。
    const overlay = readFileSync(resolve(root, 'src/components/SceneSelectionOverlay.tsx'), 'utf8');

    expect(overlay).toContain('visualsHidden');
    expect(overlay).toContain('transparent');
    expect(overlay).toContain("'#ffd700'");
  });

  it('wires Viewport selection changes to the native overlay selection decoration IPC with SVG fallback', () => {
    // 選択デコレーションの送信ロジック（sender・SVG フォールバック配線）は
    // SceneSelectionDecorationLayer.tsx へ移設済み。Viewport 側は同レイヤーを
    // マウントし、body co-delivery 計算用の quad ビルダーだけを引き続き使う
    // （body present 経路。SceneSelectionDecorationLayer.test.ts 参照）。
    const viewport = readFileSync(resolve(root, 'src/components/Viewport.tsx'), 'utf8');
    const layer = readFileSync(resolve(root, 'src/components/SceneSelectionDecorationLayer.tsx'), 'utf8');

    expect(viewport).toContain('buildSelectionDecorationQuads');
    expect(viewport).toContain('SceneSelectionDecorationLayer');
    expect(layer).toContain('createNativeOverlaySelectionDecorationSender');
    expect(layer).toContain('setSelectionDecoration');
    expect(layer).toContain('visualsHidden');
  });

  it('exposes setSelectionDecoration through preload and the renderer type surface', () => {
    const preload = readFileSync(resolve(root, 'electron/preload.ts'), 'utf8');
    const envTypes = readFileSync(resolve(root, 'src/vite-env.d.ts'), 'utf8');

    expect(preload).toContain('nativeOverlayIpcChannels.setSelectionDecoration');
    expect(envTypes).toContain('setSelectionDecoration: (payload: {');
  });

  it('wires the body co-delivery split (Bug B対策) into Viewport/SceneSelectionDecorationLayer: shouldSendStandaloneDecoration gates standalone sends, and the native-overlay present call carries selectionDecoration', () => {
    // standalone channel の送信可否判定（shouldSendStandaloneDecoration・
    // nativeOverlayBodyCoDeliveryEligible）は SceneSelectionDecorationLayer.tsx
    // へ移設済み。body present（video-only reuse 経路、Viewport 側）は
    // 従来どおり selectionDecoration を同梱する。
    const viewport = readFileSync(resolve(root, 'src/components/Viewport.tsx'), 'utf8');
    const layer = readFileSync(resolve(root, 'src/components/SceneSelectionDecorationLayer.tsx'), 'utf8');

    // standalone channel は shouldSendStandaloneDecoration の判定を経由する。
    expect(layer).toContain('shouldSendStandaloneDecoration');
    expect(layer).toContain('nativeOverlayBodyCoDeliveryEligible');
    // body present（video-only reuse 経路）は selectionDecoration を同梱する。
    expect(viewport).toContain('prepareSharedRendererViewportNativeOverlayPresent');
    expect(viewport).toContain('selectionDecoration: sessionSelectionDecoration');
  });

  it('extends nativeOverlayBodyCoDeliveryEligible to every directly presented session shape', () => {
    // native-render-only と混在セッションの reuse tick も native overlay の
    // presentSharedFrame へ selectionDecoration を同梱するため、standalone
    // 送信のskip判定へ両方を含めて2チャネルの競合presentを防ぐ。
    // この判定は SceneSelectionDecorationLayer.tsx へ移設済み。
    const layer = readFileSync(resolve(root, 'src/components/SceneSelectionDecorationLayer.tsx'), 'utf8');
    const start = layer.indexOf('const nativeOverlayBodyCoDeliveryEligible = latest.rustVideoOnlyEnabled');
    const end = layer.indexOf(';', start);
    const block = layer.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('isNativeOverlayDirectSceneSession(latest.sharedRendererPreviewSession)');
    expect(block).toContain('isSharedRendererNativeRenderOnlySession(latest.sharedRendererPreviewSession)');
  });
});

describe('native decoration quad matches the SVG overlay CSS position (default camera)', () => {
  // 実機バグ調査で「SVG は inset:0 の container 内に描かれるので通常 preview
  // 外には出ないはず」という前提を確定させるための橋渡しテスト。
  // `buildSelectionDecorationQuads` が返す world 座標に対して、Rust 側
  // `build_selection_decoration_clips`（native-overlay/src/lib.rs の
  // `contain_fit_transform`）と同じ contain-fit 式を適用した結果が、
  // SVG 側 `worldPointToCssPoint`（sceneHitTest.ts）の CSS 座標と
  // （devicePixelRatio 分のスケールを除いて）一致することを固定する。
  // カメラがデフォルト（zoom=1・centreOffset=0・rotation=0）の間はこの
  // 一致が成り立つはずで、崩れた場合は SVG と native のどちらかの変換式が
  // 意図せず変わったことを検知できる。
  const containFit = (
    point: { x: number; y: number },
    canvasWidth: number,
    canvasHeight: number,
    drawableWidth: number,
    drawableHeight: number,
  ) => {
    const fitScale = Math.min(drawableWidth / canvasWidth, drawableHeight / canvasHeight);
    const offsetX = (drawableWidth - canvasWidth * fitScale) * 0.5;
    const offsetY = (drawableHeight - canvasHeight * fitScale) * 0.5;
    return { x: point.x * fitScale + offsetX, y: point.y * fitScale + offsetY };
  };

  it('agrees with worldPointToCssPoint for an axis-aligned object under the default camera', () => {
    const projectWidth = 1920;
    const projectHeight = 1080;
    const object = {
      id: 'obj-1',
      type: 'image',
      name: 'obj-1',
      src: 'image.png',
      x: 500,
      y: 300,
      width: 200,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      layer: 0,
      startTime: 0,
      duration: 10,
    } as unknown as TimelineObject;
    const objects = [object];

    // pane 実測値相当: preview CSS 782x440 (~16:9 契約なので letterbox はほぼ 0)、
    // devicePixelRatio=2 の drawable 1564x880。
    const displayScale = 782 / projectWidth;
    const dpr = 2;
    const drawableWidth = Math.round(782 * dpr);
    const drawableHeight = Math.round(440 * dpr);

    const viewport: SceneHitTestViewport = {
      projectWidth,
      projectHeight,
      displayScale,
      camera: { centreOffsetX: 0, centreOffsetY: 0, zoom: 1, rotationDeg: 0 },
    };

    const quads = buildSelectionDecorationQuads({ selectedIds: ['obj-1'], objects, time: 0 });
    expect(quads).toHaveLength(1);
    const quad = quads[0];

    const corners = getObjectWorldCorners(object, 0, objects)!;
    const svgTopLeftCss = worldPointToCssPoint(corners.topLeft, viewport);

    const nativeTopLeftDrawable = containFit(
      { x: quad.topLeftX, y: quad.topLeftY },
      projectWidth,
      projectHeight,
      drawableWidth,
      drawableHeight,
    );
    // drawable（物理 px）を CSS px へ戻して SVG 側と比較する。
    const nativeTopLeftCss = {
      x: nativeTopLeftDrawable.x / dpr,
      y: nativeTopLeftDrawable.y / dpr,
    };

    // drawable の丸め (Math.round) 由来の 1 物理 px 未満（CSS 換算で 0.5px 未満）の
    // 誤差は許容し、それを超えるズレ（今回の実機バグのような数十〜数百 px 規模）
    // だけを検出できればよい。
    expect(Math.abs(nativeTopLeftCss.x - svgTopLeftCss.x)).toBeLessThan(0.5);
    expect(Math.abs(nativeTopLeftCss.y - svgTopLeftCss.y)).toBeLessThan(0.5);
  });
});

describe('shouldSendStandaloneDecoration: 症状B（本体フレームと選択枠のズレ）対策の送信チャネル分岐', () => {
  // Bug B 根本原因: setNativeOverlaySelectionDecoration（standalone）と
  // presentNativeOverlaySharedFrame（body present）が独立に native overlay の
  // 同じ live surface へ present してしまい、ドラッグ中は互いを追い越す。
  // objects/time が変化した tick（本体が再 present される tick）は body 側が
  // 同じ (objects, time) から計算した decoration を同梱して送るため、
  // standalone 送信は不要かつ有害（追い越しレースの再導入）になる。
  // selectedIds だけが変化した tick（本体は変わらない）は standalone が唯一の
  // 送信経路であり続ける。
  //
  // native overlay の body co-delivery は「video-only セッションの reuse
  // present 経路」でのみ発生する（図形のみ/混在セッションは別の DOM WebGPU
  // canvas 経路を使い、native overlay の本体 present には一切乗らない）ため、
  // 呼び出し側は `nativeOverlayBodyCoDeliveryEligible` でこれを明示する。
  // eligible=false の間は常に standalone が正本（skip してはならない）。

  const objectsA: TimelineObject[] = [{ id: 'a' } as unknown as TimelineObject];
  const objectsB: TimelineObject[] = [{ id: 'b' } as unknown as TimelineObject];

  const state = (overrides: Partial<SelectionDecorationSendState> = {}): SelectionDecorationSendState => ({
    selectedIds: ['obj-1'],
    objects: objectsA,
    time: 0,
    nativeOverlayBodyCoDeliveryEligible: true,
    ...overrides,
  });

  it('初回（prevがnull）は常に送信する', () => {
    expect(shouldSendStandaloneDecoration(null, state())).toBe(true);
  });

  it('co-delivery非対象（DOM WebGPU canvas経路等）の間は、objects/timeが変化していても常に送信する', () => {
    const prev = state({ nativeOverlayBodyCoDeliveryEligible: false, objects: objectsA, time: 0 });
    const next = state({ nativeOverlayBodyCoDeliveryEligible: false, objects: objectsB, time: 1 });
    expect(shouldSendStandaloneDecoration(prev, next)).toBe(true);
  });

  it('co-delivery対象で objects が変化した tick は送信をスキップする（body側が同梱する）', () => {
    const prev = state({ objects: objectsA });
    const next = state({ objects: objectsB });
    expect(shouldSendStandaloneDecoration(prev, next)).toBe(false);
  });

  it('co-delivery対象で time が変化した tick は送信をスキップする（body側が同梱する）', () => {
    const prev = state({ time: 0 });
    const next = state({ time: 1 });
    expect(shouldSendStandaloneDecoration(prev, next)).toBe(false);
  });

  it('co-delivery対象で selectedIds のみが変化した tick は送信する（本体は変わらないため standalone が唯一の経路）', () => {
    const prev = state({ selectedIds: ['obj-1'] });
    const next = state({ selectedIds: ['obj-2'] });
    expect(shouldSendStandaloneDecoration(prev, next)).toBe(true);
  });

  it('co-delivery対象で何も変化していない tick は送信しない', () => {
    // 実運用では selectedIds/objects は Zustand store のセレクタが返す配列
    // 参照であり、store 側に変化が無ければ同一参照が返る。ここでも同一参照を
    // 使って「変化なし」を表現する（`state()` を素朴に2回呼ぶと毎回新しい
    // 配列リテラルになり「変化あり」と誤検出してしまうため）。
    const sharedSelectedIds = ['obj-1'];
    const prev = state({ selectedIds: sharedSelectedIds });
    const next = state({ selectedIds: sharedSelectedIds });
    expect(shouldSendStandaloneDecoration(prev, next)).toBe(false);
  });
});
