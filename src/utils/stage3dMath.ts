/**
 * Y 軸回転（ラジアン）: 板ポリが +Z 面をカメラへ向けるときの追加 yaw + rotationYDeg。
 */
export const billboardYawRadians = (
  cameraX: number,
  cameraZ: number,
  objectX: number,
  objectZ: number,
  rotationYDeg: number
): number => {
  const dx = cameraX - objectX;
  const dz = cameraZ - objectZ;
  const base = Math.atan2(dx, dz);
  return base + (rotationYDeg * Math.PI) / 180;
};
