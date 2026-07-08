import type { NativeOverlayAttachRect } from './nativeOverlayViewportGeometry';

/**
 * レイアウトシフト対策（調査 2026-07-08 発見8）— native overlay の attach
 * 再計算は ResizeObserver / window resize / visualViewport イベント起点のみ
 * で、サイズ不変のまま preview 要素が移動するレイアウトシフト（兄弟ペインの
 * 開閉・祖先スクロール等）では発火せず、overlay が旧位置に残る。
 *
 * 低頻度ポーリング（既定 500ms）で getBoundingClientRect 由来の attach rect
 * を key 比較し、変化時のみ attach を再実行する安全網を既存イベント経路に
 * 併設する。attach は key で冪等（同値なら IPC を発行しない）なため、
 * ポーリング追加による副作用はない。document.hidden 中は停止する（復帰は
 * 既存の visibilitychange リスナーが即時 attach で拾う）。
 */
export const NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS = 500;

export const shouldPollNativeOverlayAttach = (documentHidden: boolean): boolean =>
  documentHidden !== true;

export const buildNativeOverlayAttachKey = (rect: NativeOverlayAttachRect): string =>
  [rect.x, rect.y, rect.width, rect.height, rect.scaleFactor].join(':');
