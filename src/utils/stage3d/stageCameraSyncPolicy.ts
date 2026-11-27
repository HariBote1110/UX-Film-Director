import type { StageCamera3D, Vec3 } from '../../types';

const DEFAULT_EPSILON = 1e-6;

const approxEqualNumber = (a: number, b: number, epsilon: number): boolean => Math.abs(a - b) <= epsilon;

const approxEqualVec3 = (a: Vec3, b: Vec3, epsilon: number): boolean =>
  approxEqualNumber(a.x, b.x, epsilon) &&
  approxEqualNumber(a.y, b.y, epsilon) &&
  approxEqualNumber(a.z, b.z, epsilon);

/** position/target が epsilon 以内で一致するか(実質同一のカメラ姿勢か)を判定する。 */
export const approxEqualStageCamera3D = (
  a: StageCamera3D,
  b: StageCamera3D,
  epsilon: number = DEFAULT_EPSILON
): boolean => approxEqualVec3(a.position, b.position, epsilon) && approxEqualVec3(a.target, b.target, epsilon);

/**
 * syncBillboards / stageCamera3D effect が受け取った incoming(store 由来)のカメラ姿勢を、
 * ローカルのオービットモデルへ強制適用すべきかどうかを判定する。
 *
 * - ユーザーがドラッグ操作中(isUserAdjusting)は、たとえ incoming が変化していても
 *   絶対に適用しない。ドラッグ中の視点が毎フレーム強制的に上書きされ続けると、
 *   ドラッグそのものが効かなくなってしまう。
 * - incoming が直近にローカルへ適用/永続化した値(lastApplied)と実質同一である場合は
 *   適用不要(no-op)とする。これを省くと「ドラッグ終了 → setStageCamera3D で永続化
 *   → 無関係な再レンダーで同じ値が stageCamera3D として戻ってくる」経路が、まだ
 *   store へ反映されていないローカルの最新状態(減衰の続き等)を無関係な再レンダー
 *   のたびに巻き戻してしまう。
 * - incoming が lastApplied と異なる場合(プロジェクトロード・シーン切り替えなど
 *   外部要因による変更)は適用する。
 */
export const shouldApplyIncomingStageCamera = (
  lastApplied: StageCamera3D,
  incoming: StageCamera3D,
  isUserAdjusting: boolean,
  epsilon: number = DEFAULT_EPSILON
): boolean => {
  if (isUserAdjusting) return false;
  return !approxEqualStageCamera3D(lastApplied, incoming, epsilon);
};
