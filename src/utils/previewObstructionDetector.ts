/**
 * Bug E（Native_Overlay_Bug_E_Plan.md §3・§4 Phase E1）— preview pane に重なる
 * HTML 駆動 UI（context menu / popover / tooltip / modal / dropdown）が
 * 開いたことを renderer 側で一箇所に統一補足し、main プロセスへ IPC で
 * 通知するためのユーティリティ。
 *
 * 正本は zustand store の `previewObstructed` 状態（`setPreviewObstructed` /
 * `clearPreviewObstructed` action 経由で明示的に更新される）。
 * `MutationObserver` はここでの補足漏れに対する保険として並走させる補助
 * ロジックであり、`isPreviewObstructingCandidateElement` /
 * `intersectsPreviewPaneRect` によって「preview pane と交差する
 * `data-state="open"` / `<dialog open>`」のみに検出対象を絞り込む。
 */
import type { PreviewObstructedState, PreviewObstructionRect } from '../store/storeTypes';

/** 計画書 §3 の IPC contract で定めた channel 名。 */
export const previewObstructionIpcChannel = 'ui:preview-obstruction-changed' as const;

export interface PreviewObstructionChangedIpcPayload {
  obstructed: boolean;
  reason: string | null;
  rect?: PreviewObstructionRect;
}

export type IpcInvoke = (channel: string, payload: unknown) => unknown;

/**
 * `previewObstructed` state を IPC payload に変換して invoke する。
 * `rect` が null のときは payload から省略する（`undefined` を明示的に
 * 送るより、JSON 化した際の形が安定するため）。
 */
export const sendPreviewObstructionChangedIpc = (
  state: Pick<PreviewObstructedState, 'obstructed' | 'reason' | 'rect'>,
  invoke: IpcInvoke,
): void => {
  const payload: PreviewObstructionChangedIpcPayload = {
    obstructed: state.obstructed,
    reason: state.reason,
    ...(state.rect ? { rect: state.rect } : {}),
  };
  invoke(previewObstructionIpcChannel, payload);
};

/** `subscribeStoreToPreviewObstructionIpc` が依存する zustand store の最小形。 */
export interface PreviewObstructionStoreLike {
  getState: () => { previewObstructed: PreviewObstructedState };
  subscribe: (
    listener: (
      state: { previewObstructed: PreviewObstructedState },
      previousState: { previewObstructed: PreviewObstructedState },
    ) => void,
  ) => () => void;
}

/**
 * store の `previewObstructed` が変化するたびに IPC へ転送する。参照が
 * 変わらない場合（同一オブジェクトを渡す store 更新など）は再送しない。
 * 戻り値は unsubscribe 関数。
 */
export const subscribeStoreToPreviewObstructionIpc = (
  store: PreviewObstructionStoreLike,
  invoke: IpcInvoke,
): (() => void) => (
  store.subscribe((state, previousState) => {
    if (state.previewObstructed === previousState.previewObstructed) {
      return;
    }
    sendPreviewObstructionChangedIpc(state.previewObstructed, invoke);
  })
);

/**
 * MutationObserver 補助ロジック（保険）が「preview に重なる可能性のある
 * UI が開いた」候補として扱う要素かどうかを判定する。
 * - Radix UI / Headless UI / shadcn/ui 系の `data-state="open"`
 * - 標準 `<dialog open>`
 */
export const isPreviewObstructingCandidateElement = (element: Element): boolean => {
  if (element.getAttribute('data-state') === 'open') {
    return true;
  }
  const tagName = 'tagName' in element ? (element as { tagName?: string }).tagName : undefined;
  if (tagName === 'DIALOG' && typeof (element as { hasAttribute?: (name: string) => boolean }).hasAttribute === 'function') {
    return (element as { hasAttribute: (name: string) => boolean }).hasAttribute('open');
  }
  return false;
};

export interface AxisAlignedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * `candidate` が `previewPaneRect` と交差するかを判定する。無関係な
 * UI 操作（preview から離れた場所で開く popover 等）で overlay が
 * 無駄に下がらないようにするための絞り込み。ゼロ面積（未レイアウト・
 * `display:none` 相当）の candidate は交差しない扱いにする。
 */
export const intersectsPreviewPaneRect = (
  previewPaneRect: AxisAlignedRect,
  candidate: AxisAlignedRect,
): boolean => {
  if (candidate.right <= candidate.left || candidate.bottom <= candidate.top) {
    return false;
  }
  return (
    candidate.left < previewPaneRect.right
    && candidate.right > previewPaneRect.left
    && candidate.top < previewPaneRect.bottom
    && candidate.bottom > previewPaneRect.top
  );
};
