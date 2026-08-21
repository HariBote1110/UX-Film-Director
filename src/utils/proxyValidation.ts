/**
 * プロキシ動画の妥当性検証
 *
 * 背景: `check-proxy` は隣接する `<name>.proxy.mp4` を無条件に採用していたため、
 * 外部ツール製・古いプロキシ（例: 別のエンコーダでタイムラインが圧縮された
 * ファイル）が誤って採用され、映像が音声より速く再生される不具合があった。
 * ここでは再生時間の一致度のみを純粋関数として判定する（I/O は行わない）。
 */

export interface ProxyDurationInput {
  originalDurationSeconds: number | null | undefined;
  proxyDurationSeconds: number | null | undefined;
}

export interface ProxyValidationResult {
  valid: boolean;
  reason?: string;
}

/** 相対許容誤差（オリジナル再生時間に対する割合） */
const RELATIVE_TOLERANCE_RATIO = 0.02;
/** 絶対許容誤差（秒）。短尺クリップでは相対誤差が小さくなりすぎるため下限として使う */
const ABSOLUTE_TOLERANCE_SECONDS = 0.5;

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * オリジナルとプロキシの再生時間を比較し、プロキシが採用可能かどうかを判定する。
 * 許容誤差は「オリジナル再生時間の 2%」と「0.5秒」のうち大きい方。
 */
export const validateProxyDuration = ({
  originalDurationSeconds,
  proxyDurationSeconds,
}: ProxyDurationInput): ProxyValidationResult => {
  if (!isPositiveFiniteNumber(originalDurationSeconds)) {
    return { valid: false, reason: 'original duration is missing or invalid' };
  }
  if (!isPositiveFiniteNumber(proxyDurationSeconds)) {
    return { valid: false, reason: 'proxy duration is missing or invalid' };
  }

  const tolerance = Math.max(
    originalDurationSeconds * RELATIVE_TOLERANCE_RATIO,
    ABSOLUTE_TOLERANCE_SECONDS,
  );
  const diff = Math.abs(originalDurationSeconds - proxyDurationSeconds);

  if (diff > tolerance) {
    return {
      valid: false,
      reason: `proxy duration (${proxyDurationSeconds}s) deviates from original duration (${originalDurationSeconds}s) beyond tolerance (${tolerance.toFixed(3)}s)`,
    };
  }

  return { valid: true };
};
