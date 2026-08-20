/**
 * ThreeStageViewport.tsx の Raycaster ベースのビルボード選択（THREE.BoxGeometry(planeW, planeH, depth)
 * を hit ボリュームとして使うピッキング）を、three.js Raycaster に依存しない純粋なレイ×指向ボックス判定として再実装。
 */
import type { Ray } from './cameraRay';
import type { Vec3 } from './vec3';

/**
 * 板ポリの奥行きヒットボリューム算出。
 * ThreeStageViewport.tsx の `hitVolumeDepth`（画像面と同じ W×H。奥行きは斜め視点での
 * レイ拾い用に画像サイズへ比例させたもの）をそのまま移植。
 */
export const hitVolumeDepth = (planeW: number, planeH: number): number => {
  const m = Math.min(planeW, planeH);
  return Math.max(0.05, Math.min(0.35, m * 0.08));
};

export interface OrientedBoxBillboard {
  id: string;
  centre: Vec3;
  /** Y 軸まわりの yaw（ラジアン）。billboardYawRadians の出力や rotationYDeg と対応。 */
  yawRadians: number;
  width: number;
  height: number;
  depth: number;
}

export interface HitResult {
  id: string;
  /** レイ原点からヒット点までの距離 */
  distance: number;
  point: Vec3;
}

const EPS = 1e-9;

/** ワールド空間ベクトルを Y 軸まわりに -yaw だけ回転し、ボックスのローカル空間へ移す。 */
const toLocal = (v: Vec3, centre: Vec3, yawRadians: number, translate: boolean): Vec3 => {
  const dx = translate ? v.x - centre.x : v.x;
  const dz = translate ? v.z - centre.z : v.z;
  const cos = Math.cos(-yawRadians);
  const sin = Math.sin(-yawRadians);
  return {
    x: dx * cos + dz * sin,
    y: translate ? v.y - centre.y : v.y,
    z: -dx * sin + dz * cos
  };
};

/** 単軸のスラブ判定。区間 [tEnter, tExit] を返す（交差しなければ null）。 */
const slab = (origin: number, dir: number, halfExtent: number): [number, number] | null => {
  if (Math.abs(dir) < EPS) {
    return origin >= -halfExtent && origin <= halfExtent ? [-Infinity, Infinity] : null;
  }
  const t1 = (-halfExtent - origin) / dir;
  const t2 = (halfExtent - origin) / dir;
  return t1 <= t2 ? [t1, t2] : [t2, t1];
};

/** レイ×指向ボックスの交差判定。ヒットしたらレイ原点からの距離を返す。 */
const rayBoxDistance = (ray: Ray, box: OrientedBoxBillboard): number | null => {
  const localOrigin = toLocal(ray.origin, box.centre, box.yawRadians, true);
  const localDir = toLocal(ray.direction, box.centre, box.yawRadians, false);

  const halfExtents: [number, number, number] = [box.width / 2, box.height / 2, box.depth / 2];
  const origins: [number, number, number] = [localOrigin.x, localOrigin.y, localOrigin.z];
  const dirs: [number, number, number] = [localDir.x, localDir.y, localDir.z];

  let tEnter = -Infinity;
  let tExit = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const interval = slab(origins[axis], dirs[axis], halfExtents[axis]);
    if (!interval) return null;
    tEnter = Math.max(tEnter, interval[0]);
    tExit = Math.min(tExit, interval[1]);
    if (tEnter > tExit) return null;
  }
  if (tExit < 0) return null; // ボックスがレイの後方にしかない
  return tEnter >= 0 ? tEnter : 0; // レイ原点がボックス内部にある場合は距離 0 扱い
};

/** 複数ビルボードの中から最も近いヒットを返す（ヒットなしなら null）。 */
export const hitTestBillboards = (ray: Ray, billboards: OrientedBoxBillboard[]): HitResult | null => {
  let best: HitResult | null = null;
  for (const box of billboards) {
    const distance = rayBoxDistance(ray, box);
    if (distance === null) continue;
    if (!best || distance < best.distance) {
      const point: Vec3 = {
        x: ray.origin.x + ray.direction.x * distance,
        y: ray.origin.y + ray.direction.y * distance,
        z: ray.origin.z + ray.direction.z * distance
      };
      best = { id: box.id, distance, point };
    }
  }
  return best;
};
