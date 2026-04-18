/**
 * Vision の正規化座標（原点は画像左下）から、動画スプライトのローカル座標（原点は左上・Y 下向き）への変換と、
 * コンテナの位置・回転・スケール（左上ピボット）によるワールド座標への写像。
 */

export type VisionNormBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LocalPoint = {
  localX: number;
  localY: number;
};

export type VideoObjectTransform = {
  x: number;
  y: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
};

/** Vision 正規化矩形（左下原点）を、動画テクスチャと同じ左上原点・0–1 正規化矩形へ。 */
export const visionNormBoundingBoxToPixiNormRect = (
  box: VisionNormBoundingBox
): { x: number; y: number; width: number; height: number } => ({
  x: box.x,
  y: 1 - box.y - box.height,
  width: box.width,
  height: box.height
});

/** Vision 正規化 bbox の中心を、動画スプライトローカル（左上原点・ピクセル）へ。 */
export const visionNormBoundingBoxCentreToLocalTopLeft = (
  box: VisionNormBoundingBox,
  spriteWidth: number,
  spriteHeight: number
): LocalPoint => {
  const cx = box.x + box.width / 2;
  const cyFromBottom = box.y + box.height / 2;
  const cyFromTop = 1 - cyFromBottom;
  return {
    localX: cx * spriteWidth,
    localY: cyFromTop * spriteHeight
  };
};

/**
 * スプライトローカル点（未スケールの「論理」ピクセル）を、親（ステージ）座標へ。
 * Pixi のコンテナと同順：スケール後に回転（`rotationDeg` は度・Pixi と同じ向き）。
 */
export const localTopLeftPointToWorld = (local: LocalPoint, transform: VideoObjectTransform): { x: number; y: number } => {
  const θ = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  const sx = local.localX * transform.scaleX;
  const sy = local.localY * transform.scaleY;
  return {
    x: transform.x + sx * cos - sy * sin,
    y: transform.y + sx * sin + sy * cos
  };
};
