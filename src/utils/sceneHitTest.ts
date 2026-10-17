/** Pure camera-coordinate conversions shared by evaluated scene overlays. */
export interface SceneCamera {
  centreOffsetX: number;
  centreOffsetY: number;
  zoom: number;
  rotationDeg: number;
}

export interface SceneHitTestViewport {
  projectWidth: number;
  projectHeight: number;
  /** CSS-pixel scale returned by `computePreviewDisplayScale`. */
  displayScale: number;
  camera: SceneCamera;
}

export interface ScenePoint {
  x: number;
  y: number;
}

const rotateVec = (v: ScenePoint, rad: number): ScenePoint => {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
};

/** Convert preview CSS coordinates into untransformed project coordinates. */
export const cssPointToWorldPoint = (
  cssX: number,
  cssY: number,
  viewport: SceneHitTestViewport
): ScenePoint => {
  const displayScale = Math.max(1e-6, viewport.displayScale);
  const parentX = cssX / displayScale;
  const parentY = cssY / displayScale;
  const { projectWidth, projectHeight, camera } = viewport;
  const pivotX = projectWidth / 2;
  const pivotY = projectHeight / 2;
  const positionX = pivotX + camera.centreOffsetX;
  const positionY = pivotY + camera.centreOffsetY;
  const zoom = Math.max(0.05, camera.zoom);
  const rotationRad = (camera.rotationDeg * Math.PI) / 180;
  const delta = { x: parentX - positionX, y: parentY - positionY };
  const unrotated = rotateVec(delta, -rotationRad);
  return { x: unrotated.x / zoom + pivotX, y: unrotated.y / zoom + pivotY };
};

/** Inverse of `cssPointToWorldPoint`. */
export const worldPointToCssPoint = (
  worldPoint: ScenePoint,
  viewport: SceneHitTestViewport
): ScenePoint => {
  const { projectWidth, projectHeight, camera } = viewport;
  const pivotX = projectWidth / 2;
  const pivotY = projectHeight / 2;
  const positionX = pivotX + camera.centreOffsetX;
  const positionY = pivotY + camera.centreOffsetY;
  const zoom = Math.max(0.05, camera.zoom);
  const rotationRad = (camera.rotationDeg * Math.PI) / 180;
  const unscaled = { x: worldPoint.x - pivotX, y: worldPoint.y - pivotY };
  const rotated = rotateVec({ x: unscaled.x * zoom, y: unscaled.y * zoom }, rotationRad);
  return {
    x: (positionX + rotated.x) * Math.max(1e-6, viewport.displayScale),
    y: (positionY + rotated.y) * Math.max(1e-6, viewport.displayScale),
  };
};
