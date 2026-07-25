import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import type { TimelineObject } from '../types';
import type { SceneHitTestViewport } from '../utils/sceneHitTest';
import { evaluateObjectPositionAtTime } from '../utils/keyframes';
// PixiJS 排除計画 Phase 4: グループ変形・振動は Pixi 非依存の sceneTransforms を直接参照する。
import { getGroupTransforms, getVibrationOffset } from '../utils/sceneTransforms';
import type { SharedRendererPreviewSession } from '../utils/sharedRendererPreviewSession';
import { isNativeOverlayDirectSceneSession } from '../utils/nativeOverlayDirectSceneEligibility';
import {
  buildSelectionDecorationQuads,
  createNativeOverlaySelectionDecorationSender,
  shouldSendStandaloneDecoration,
  type SelectionDecorationSendState,
} from '../utils/nativeOverlaySelectionDecoration';
import { SceneSelectionOverlay } from './SceneSelectionOverlay';
import { computeSceneSelectionOverlayGeometry } from './sceneSelectionOverlayGeometry';
import { applySceneSelectionOverlayGeometry, type SceneSelectionOverlayPatchTargets } from './sceneSelectionOverlayPatch';
import type { ResizeCorner } from '../utils/transformGeometry';

/**
 * 選択枠オーバーレイ（選択枠矩形・リサイズハンドル・native overlay への
 * 選択デコレーション送信）を `Viewport.tsx` から切り出した独立コンポーネント。
 *
 * 目的: `Viewport.tsx` は `currentTime` を hook 購読しているため再生中は毎フレーム
 * React が再レンダーする。この per-frame 再レンダーを排除する移行の一環として、
 * 選択枠まわりは `currentTime` を React の props/state 経由で「購読」しない。
 * 時間追従は `useStore.subscribe`（素の subscribe。store は subscribeWithSelector
 * 未使用）と、SVG 属性を直接書き換える命令的パッチ（`sceneSelectionOverlayPatch.ts`）
 * だけで行う。React の再レンダーは selectedIds・objects・viewport 等、頻度の低い
 * 変化でのみ発生する（`TimelineCurrentTimeIndicator.tsx` と同じ設計方針）。
 */

export interface SceneSelectionDecorationLayerProps {
  selectedIds: string[];
  objects: TimelineObject[];
  /** Viewport が保持する viewport 情報の ref。レンダー時・パッチ時とも .current を読む。 */
  viewportRef: React.MutableRefObject<SceneHitTestViewport>;
  /** preview 要素の CSS 幅（previewW）。 */
  width: number;
  /** preview 要素の CSS 高さ（previewH）。 */
  height: number;
  /** 送信 payload の canvasWidth（projectSettings.width）。 */
  projectCanvasWidth: number;
  /** 送信 payload の canvasHeight（projectSettings.height）。 */
  projectCanvasHeight: number;
  nativeOverlayPreviewEnabled: boolean;
  rustVideoOnlyEnabled: boolean;
  sharedRendererPreviewSession: SharedRendererPreviewSession | null;
  nativeOverlayAttachTick: number;
  /** Viewport 側 useSceneInteraction の onResizeStart をそのまま渡す。 */
  onResizeStart: (
    e: React.PointerEvent,
    objectId: string,
    corner: ResizeCorner,
    bounds: { bx: number; by: number; bw: number; bh: number },
    transform: { x: number; y: number; rotationRad: number; scaleX: number; scaleY: number }
  ) => void;
}

/**
 * `Viewport.tsx` の `isSharedRendererNativeRenderOnlySession`（module-private・
 * 非 export）と同一ロジックの複製。
 *
 * 意図的な複製であり、共有 util への切り出しではない: 元の predicate は
 * `viewportRustVideoOnlyBoundary.test.ts` が `Viewport.tsx` 内の定義位置・本文を
 * 文字列境界テストで固定しており、export 化して移設すると無関係な多数の
 * テストが壊れる。かといって本コンポーネントから `Viewport.tsx` を import すると
 * （Viewport → 本コンポーネントは既に render 用に import 済みのため）循環 import に
 * なる。よってロジックのみをここへ複製する（3行の純粋関数で将来的な乖離リスクは小さい）。
 */
const isSharedRendererNativeRenderOnlySession = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok || session.surfaceGate.snapshot.clips.length === 0) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((media) => [media.id, media.kind]));
  return session.surfaceGate.snapshot.clips.every((clip) => mediaKindById.get(clip.media_id) !== 'Video');
};

/** Viewport.tsxのshouldDeferCurrentTimeTickと同趣旨（対象フィールドは本層がレンダーで使うobjects/selectedIdsのみ）。 */
export const shouldDeferSelectionDecorationTick = (
  state: { objects: unknown; selectedIds: unknown },
  rendered: { objects: unknown; selectedIds: unknown },
): boolean => state.objects !== rendered.objects || state.selectedIds !== rendered.selectedIds;

export const SceneSelectionDecorationLayer: React.FC<SceneSelectionDecorationLayerProps> = ({
  selectedIds,
  objects,
  viewportRef,
  width,
  height,
  projectCanvasWidth,
  projectCanvasHeight,
  nativeOverlayPreviewEnabled,
  rustVideoOnlyEnabled,
  sharedRendererPreviewSession,
  nativeOverlayAttachTick,
  onResizeStart,
}) => {
  // 選択デコレーション — SVG（SceneSelectionOverlay）は child NSWindow 化された
  // native overlay に隠れるため、選択枠・ハンドルの見た目は addon 側で描く。
  // true の間は SVG を透明化（不可視だが操作可能）し、addon 不可用・attach
  // 失敗時は false に戻して SVG の可視スタイルへフォールバックする。
  const [nativeSelectionDecorationActive, setNativeSelectionDecorationActive] = useState(false);
  // setState は React の再レンダー/コミットを発生させるため、直近適用値と
  // 同値なら呼ばない（毎フレームの送信応答で無駄な work を発生させないため）。
  const appliedNativeSelectionDecorationActiveRef = useRef(false);
  const setActive = (value: boolean) => {
    if (appliedNativeSelectionDecorationActiveRef.current === value) return;
    appliedNativeSelectionDecorationActiveRef.current = value;
    setNativeSelectionDecorationActive(value);
  };

  const selectionDecorationSenderRef = useRef(
    createNativeOverlaySelectionDecorationSender((payload) =>
      window.nativeOverlay!.setSelectionDecoration(payload)),
  );
  // 症状B（本体フレームと選択枠 present が独立2チャネルのためドラッグ中に
  // ズレる不具合）対策 — shouldSendStandaloneDecoration が「前回 tick から
  // 何が変化したか」を判定するための直近状態。
  const selectionDecorationSendStateRef = useRef<SelectionDecorationSendState | null>(null);

  // 命令的パッチ（sceneSelectionOverlayPatch.ts）が時間追従の属性書き戻しで
  // 参照する DOM 要素群。SceneSelectionOverlay 側の callback ref が登録する。
  const geometryPatchTargetsRef = useRef<Map<string, SceneSelectionOverlayPatchTargets> | null>(null);

  // 最新 props を保持する ref。subscribe コールバック（mount 時に一度だけ
  // 購読するため closure が古い props を掴んだままになる）から常に最新値を
  // 読むために毎レンダーで更新する。
  const latestRef = useRef({
    selectedIds,
    objects,
    projectCanvasWidth,
    projectCanvasHeight,
    nativeOverlayPreviewEnabled,
    rustVideoOnlyEnabled,
    sharedRendererPreviewSession,
    nativeOverlayAttachTick,
  });
  latestRef.current = {
    selectedIds,
    objects,
    projectCanvasWidth,
    projectCanvasHeight,
    nativeOverlayPreviewEnabled,
    rustVideoOnlyEnabled,
    sharedRendererPreviewSession,
    nativeOverlayAttachTick,
  };

  // 応答の latest-wins 判定用の単調増加 send id。元の effect の cancelled
  // フラグ（cleanup で true にする）と同じ意味論を、cleanup を持たない
  // 通常関数の中で再現する。
  const sendIdRef = useRef(0);

  /**
   * 選択デコレーション（standalone チャネル）— 選択変更・時間変化のたびに
   * world quad を送る。値が不変なら sender が dedupe して IPC を発行しない。
   * 応答の success/attached で SVG の透明化（native 描画が生きている間のみ）
   * を切り替える。
   *
   * 症状B対策: native overlay の body co-delivery が有効な tick
   * （video-only・native-render-only・混在セッションの reuse present 経路。
   * publishSharedRendererPreviewSession 内で selectionDecoration を
   * presentNativeOverlaySharedFrame に同梱する）では、objects/currentTime が
   * 変化した tick の送信を shouldSendStandaloneDecoration がスキップする。
   * body 側が同じ (objects, time) から計算した decoration を同じ present に
   * 同梱するため、ここで独立に送ると2チャネルが同じ native overlay live
   * surface へ競合 present してしまう（ドラッグ中に本体と選択枠がズレる
   * 根本原因）。selectedIds のみの変化、および co-delivery 非対象
   * （native overlay を利用できないフォールバック経路など、本体が native
   * overlay の presentSharedFrame に一切乗らない場合）は従来どおり
   * standalone が唯一の配信経路であり続ける。
   *
   * 元の Viewport.tsx 側 effect にあった `editorMode === '3d_stage'` 分岐は
   * ここでは不要: 本コンポーネントは Viewport 側で `editorMode !== '3d_stage'`
   * のときだけマウントされるため、unmount がその分岐と等価になる。
   */
  const sendStandaloneDecoration = (time: number) => {
    const latest = latestRef.current;

    if (
      !latest.nativeOverlayPreviewEnabled
      || typeof window.nativeOverlay?.setSelectionDecoration !== 'function'
    ) {
      setActive(false);
      selectionDecorationSendStateRef.current = null;
      return;
    }

    // native-overlay が生成ソースを構築できるため、混在セッションも
    // CAMetalLayer へ本体と selectionDecoration を同時配信する。
    const nativeOverlayBodyCoDeliveryEligible = latest.rustVideoOnlyEnabled
      && latest.sharedRendererPreviewSession != null
      && (
        isNativeOverlayDirectSceneSession(latest.sharedRendererPreviewSession)
        || isSharedRendererNativeRenderOnlySession(latest.sharedRendererPreviewSession)
      );
    const nextSendState: SelectionDecorationSendState = {
      selectedIds: latest.selectedIds,
      objects: latest.objects,
      time,
      nativeOverlayBodyCoDeliveryEligible,
    };
    const shouldSend = shouldSendStandaloneDecoration(selectionDecorationSendStateRef.current, nextSendState);
    selectionDecorationSendStateRef.current = nextSendState;
    if (!shouldSend) return;

    const quads = buildSelectionDecorationQuads({
      selectedIds: latest.selectedIds,
      objects: latest.objects,
      time,
    });
    const pending = selectionDecorationSenderRef.current.update(
      {
        canvasWidth: latest.projectCanvasWidth,
        canvasHeight: latest.projectCanvasHeight,
        quads,
      },
      latest.nativeOverlayAttachTick,
    );
    if (!pending) return;

    // latest-wins: 送信ごとに send id を振り、応答時に自分が最新の送信かを
    // 確認する。古い応答（後発の送信より先に解決した場合）は無視する。
    sendIdRef.current += 1;
    const sendId = sendIdRef.current;
    pending
      .then((response) => {
        if (sendIdRef.current !== sendId) return;
        setActive(Boolean(response?.success && response?.attached));
      })
      .catch(() => {
        if (sendIdRef.current !== sendId) return;
        setActive(false);
      });
  };

  /**
   * 選択枠ジオメトリ（points/handles）を computeSceneSelectionOverlayGeometry で
   * 計算し、geometryPatchTargetsRef に登録済みの DOM 要素へ命令的に反映する。
   * React の再レンダーを経由しない SVG 属性の直接更新。
   */
  const applyGeometryNow = (time: number) => {
    const latest = latestRef.current;
    const targets = geometryPatchTargetsRef.current;
    if (!targets) return;

    const entries = computeSceneSelectionOverlayGeometry({
      selectedIds: latest.selectedIds,
      objects: latest.objects,
      time,
      viewport: viewportRef.current,
    });
    applySceneSelectionOverlayGeometry(targets, entries);
  };

  // mount 時に一度だけ currentTime を購読する（このコンポーネントの生存期間中は
  // 張り替えない）。素の subscribe（store は subscribeWithSelector 未使用）で
  // currentTime の変化のみを自前で判定し、変化時にジオメトリの命令的パッチと
  // native overlay への標準送信をこの順で行う。
  //
  // objects/selectedIds が currentTime と同一 set() でまとめて変わるアクション
  // （switchScene 等）では、この tick が React コミット前に旧 objects の
  // closure（applyGeometryNow/sendStandaloneDecoration が読む latestRef.current
  // はレンダー本体で更新されるため、この時点ではまだ旧値）で発火し、旧シーンの
  // objects から計算した quad を新時刻で送ってしまう回帰があった
  // （Viewport.tsx の shouldDeferCurrentTimeTick と同型の問題）。
  // shouldDeferSelectionDecorationTick が「store がコミット済みレンダーより
  // 先行している」と判定した tick は previousCurrentTime の更新だけ行って
  // 即時実行をスキップする。この層には catch-up flag は不要:
  // コミット後は依存配列なしの applyGeometryNow effect と、低頻度送信 effect
  // （deps: selectedIds, objects, …）が必ず新鮮な値で実行するため、
  // それらが catch-up の役割を兼ねる。
  useEffect(() => {
    let previousCurrentTime = useStore.getState().currentTime;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.currentTime !== previousCurrentTime) {
        previousCurrentTime = state.currentTime;
        if (shouldDeferSelectionDecorationTick(state, latestRef.current)) {
          return;
        }
        applyGeometryNow(state.currentTime);
        sendStandaloneDecoration(state.currentTime);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // レンダー後同期 effect（依存配列なし＝毎コミット後に実行）。
  // コミットが React 由来の props 変化（選択・objects・viewport）で属性を
  // 書き戻した直後に、最新時刻のジオメトリへ再同期する（subscribe 発火と
  // コミットの競合による1フレームのズレ対策）。
  useEffect(() => {
    applyGeometryNow(useStore.getState().currentTime);
  });

  // 低頻度の送信 effect。selectedIds/objects 等、currentTime 以外の変化に
  // 追従する（currentTime 起因の送信は上の subscribe effect が担う）。
  useEffect(() => {
    sendStandaloneDecoration(useStore.getState().currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedIds,
    objects,
    nativeOverlayPreviewEnabled,
    rustVideoOnlyEnabled,
    sharedRendererPreviewSession,
    nativeOverlayAttachTick,
    projectCanvasWidth,
    projectCanvasHeight,
  ]);

  return (
    <SceneSelectionOverlay
      selectedIds={selectedIds}
      objects={objects}
      time={useStore.getState().currentTime}
      viewport={viewportRef.current}
      width={width}
      height={height}
      visualsHidden={nativeSelectionDecorationActive}
      geometryPatchTargetsRef={geometryPatchTargetsRef}
      onHandlePointerDown={(objectId, corner, e) => {
        const currentTime = useStore.getState().currentTime;
        const targetObject = objects.find((o) => o.id === objectId);
        if (!targetObject) return;
        const size = (targetObject as unknown as { width?: number; height?: number });
        const bounds = { bx: 0, by: 0, bw: size.width ?? 100, bh: size.height ?? 100 };
        // 選択枠と同じ「コンテナのワールド変換」（base position + group
        // transforms + vibration, rotation/scale も group 積算込み）を使う。
        // sceneHitTest.ts の getObjectWorldCorners と同じ式。
        const base = evaluateObjectPositionAtTime(targetObject, currentTime);
        const groupEffects = getGroupTransforms(targetObject, currentTime, objects);
        const vib = getVibrationOffset(targetObject, currentTime);
        const rotationRad = ((targetObject.rotation || 0) + groupEffects.rotation) * (Math.PI / 180);
        onResizeStart(e, objectId, corner, bounds, {
          x: base.x + groupEffects.x + vib.x,
          y: base.y + groupEffects.y + vib.y,
          rotationRad,
          scaleX: (targetObject.scaleX ?? 1) * groupEffects.scaleX,
          scaleY: (targetObject.scaleY ?? 1) * groupEffects.scaleY,
        });
      }}
    />
  );
};

export default SceneSelectionDecorationLayer;
