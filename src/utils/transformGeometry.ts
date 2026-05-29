/**
 * 要素のリサイズ・ドラッグ移動に用いる純粋な幾何計算。
 *
 * PixiJS への依存を持たず、テスト可能な形で座標変換ロジックを分離している。
 * 角ハンドルのドラッグは「掴んだ角の対角（アンカー）を固定したまま拡縮する」
 * という挙動で、コンテナの回転にも対応する。
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** コンテンツのローカル境界（拡縮を掛ける前の素の矩形）。 */
export interface ResizeBounds {
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface ResizeStartState {
  /** 掴んでいる角。 */
  corner: ResizeCorner;
  /** ローカル境界。 */
  bounds: ResizeBounds;
  /** コンテナの回転（ラジアン）。 */
  rotationRad: number;
  /** 固定したいアンカー（掴んだ角の対角）の親空間座標。 */
  anchorParent: Vec2;
  /** 許容する最小スケール（反転防止）。 */
  minScale: number;
}

export interface ResizeResult {
  scaleX: number;
  scaleY: number;
  /** 親空間でのコンテナ位置（= obj.x / obj.y）。 */
  x: number;
  y: number;
}

/** 掴んだ角の対角を返す。 */
export const oppositeCorner = (corner: ResizeCorner): ResizeCorner => {
  switch (corner) {
    case 'top-left':
      return 'bottom-right';
    case 'top-right':
      return 'bottom-left';
    case 'bottom-left':
      return 'top-right';
    case 'bottom-right':
      return 'top-left';
  }
};

/** ローカル境界の四隅座標を返す。 */
export const cornerLocals = (bounds: ResizeBounds): Record<ResizeCorner, Vec2> => {
  const { bx, by, bw, bh } = bounds;
  return {
    'top-left': { x: bx, y: by },
    'top-right': { x: bx + bw, y: by },
    'bottom-left': { x: bx, y: by + bh },
    'bottom-right': { x: bx + bw, y: by + bh },
  };
};

/** スクリーン座標系（y 下向き）でベクトルを回転する。 */
export const rotateVec = (v: Vec2, rad: number): Vec2 => {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
};

const clampScale = (value: number, minScale: number): number => {
  if (!Number.isFinite(value)) return minScale;
  // 反転（負スケール）は許可せず、最小スケールでクランプする。
  return Math.max(minScale, Math.abs(value));
};

/**
 * 角ドラッグの結果として、新しいスケールとコンテナ位置を求める。
 *
 * アンカー（対角）を親空間で固定したまま、掴んだ角がポインタへ追従するように
 * scaleX / scaleY を決め、その後アンカーが動かないよう位置を補正する。
 */
export const computeResize = (start: ResizeStartState, pointerParent: Vec2): ResizeResult => {
  const corners = cornerLocals(start.bounds);
  const dragged = corners[start.corner];
  const anchor = corners[oppositeCorner(start.corner)];

  // ポインタとアンカーの差分を、コンテナのローカル軸へ逆回転して落とし込む。
  const deltaParent = {
    x: pointerParent.x - start.anchorParent.x,
    y: pointerParent.y - start.anchorParent.y,
  };
  const deltaLocal = rotateVec(deltaParent, -start.rotationRad);

  const spanX = dragged.x - anchor.x;
  const spanY = dragged.y - anchor.y;

  const scaleX = spanX !== 0 ? clampScale(deltaLocal.x / spanX, start.minScale) : start.minScale;
  const scaleY = spanY !== 0 ? clampScale(deltaLocal.y / spanY, start.minScale) : start.minScale;

  // アンカーを固定するための位置補正:
  //   anchorParent = position + R(rot) * (S' * anchorLocal)
  //   position     = anchorParent - R(rot) * (S' * anchorLocal)
  const scaledAnchor = { x: scaleX * anchor.x, y: scaleY * anchor.y };
  const rotatedAnchor = rotateVec(scaledAnchor, start.rotationRad);

  return {
    scaleX,
    scaleY,
    x: start.anchorParent.x - rotatedAnchor.x,
    y: start.anchorParent.y - rotatedAnchor.y,
  };
};
