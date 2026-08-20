/**
 * stage3d 配下の全モジュールが共有する最小限の 3 次元ベクトル演算。
 * three.js の Vector3 に依存せず、Object3D 置き換え後もエンジン非依存で使えるようにする。
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

/** ゼロ長ベクトルは NaN を生まず {0,0,0} を返す（縮退した入力に対する安全弁）。 */
export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  if (len < 1e-12) return { x: 0, y: 0, z: 0 };
  return scale(a, 1 / len);
};
