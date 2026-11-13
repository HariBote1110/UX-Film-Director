/**
 * evaluation-parity fixture の数値比較（許容誤差つき）。
 *
 * 背景: drift 検出は当初 JSON 文字列の完全一致で比較していたが、TS 参照評価の
 * イージング等で使う `Math.pow` / `Math.sin` 等は ECMAScript 仕様で
 * 「実装定義精度」のため、正しく丸めた結果がエンジン・Node バージョン・
 * プラットフォームで末尾数 ulp 変わり得る。文字列比較では「評価の意味が
 * 同じ」でもマシン差だけで失敗し、逆に fixture を再生成すると今度は
 * 別のエンジンで落ちる（2026-11-13 に realistic-heavy 3件で実測、各1 ulp）。
 *
 * ここでは数値リーフだけに小さな ulp 許容を与え、構造・文字列・真偽値・
 * キーの有無・配列長は従来どおり厳密に比較する。整数値（フレーム番号や件数）
 * は隣の整数との ulp 距離が桁違いに大きいため、この許容では絶対に化けない。
 * パリティ検証の趣旨（TS 評価と fixture の意味的な一致）は壊さない。
 */

/** 許容する ulp 距離の上限。超越関数の 1 ulp 差が数演算を伝播しても収まる範囲。 */
export const MAX_FIXTURE_ULP_DISTANCE = 4;

const float64Buffer = new ArrayBuffer(8);
const float64View = new DataView(float64Buffer);
const UINT64_MASK = (1n << 64n) - 1n;
const SIGN_BIT = 1n << 63n;

// f64 を「順序を保つ整数」へ写す（単調写像）。差がそのまま ulp 距離になる。
const toOrderedInteger = (value: number): bigint => {
  float64View.setFloat64(0, value);
  const bits = float64View.getBigUint64(0);
  return (bits & SIGN_BIT) !== 0n ? ~bits & UINT64_MASK : bits | SIGN_BIT;
};

/** 2つの f64 の ulp 距離。非有限値同士の不一致などは Infinity を返す。 */
export const floatUlpDistance = (a: number, b: number): number => {
  if (Object.is(a, b)) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  const diff = toOrderedInteger(a) - toOrderedInteger(b);
  const absolute = diff < 0n ? -diff : diff;
  return absolute > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.POSITIVE_INFINITY
    : Number(absolute);
};

export type EvaluationParityFixtureDifference = {
  /** JSON パス風の場所（例: $.frames[133].objects[0].transform.translation_y） */
  path: string;
  committed: unknown;
  generated: unknown;
  /** 数値同士の不一致の場合のみ、その ulp 距離。 */
  ulpDistance?: number;
};

const MAX_REPORTED_DIFFERENCES = 25;

const childPath = (path: string, key: string): string => (
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`
);

const collectDifferences = (
  committed: unknown,
  generated: unknown,
  path: string,
  differences: EvaluationParityFixtureDifference[],
): void => {
  if (differences.length >= MAX_REPORTED_DIFFERENCES) return;
  if (typeof committed === 'number' && typeof generated === 'number') {
    const ulpDistance = floatUlpDistance(committed, generated);
    if (ulpDistance > MAX_FIXTURE_ULP_DISTANCE) {
      differences.push({ path, committed, generated, ulpDistance });
    }
    return;
  }
  if (Array.isArray(committed) && Array.isArray(generated)) {
    if (committed.length !== generated.length) {
      differences.push({ path, committed: `length ${committed.length}`, generated: `length ${generated.length}` });
      return;
    }
    for (let index = 0; index < committed.length; index += 1) {
      collectDifferences(committed[index], generated[index], `${path}[${index}]`, differences);
      if (differences.length >= MAX_REPORTED_DIFFERENCES) return;
    }
    return;
  }
  if (
    committed !== null && generated !== null
    && typeof committed === 'object' && typeof generated === 'object'
    && !Array.isArray(committed) && !Array.isArray(generated)
  ) {
    const committedRecord = committed as Record<string, unknown>;
    const generatedRecord = generated as Record<string, unknown>;
    const keys = new Set([...Object.keys(committedRecord), ...Object.keys(generatedRecord)]);
    for (const key of keys) {
      const nextPath = childPath(path, key);
      if (!(key in committedRecord) || !(key in generatedRecord)) {
        differences.push({
          path: nextPath,
          committed: committedRecord[key],
          generated: generatedRecord[key],
        });
        if (differences.length >= MAX_REPORTED_DIFFERENCES) return;
        continue;
      }
      collectDifferences(committedRecord[key], generatedRecord[key], nextPath, differences);
      if (differences.length >= MAX_REPORTED_DIFFERENCES) return;
    }
    return;
  }
  if (committed !== generated) {
    differences.push({ path, committed, generated });
  }
};

/**
 * committed fixture と再生成した評価を値として深く比較し、許容範囲を
 * 超えた差分の一覧を返す（空なら一致）。数値以外は厳密比較。
 */
export const diffEvaluationParityFixtureValues = (
  committed: unknown,
  generated: unknown,
): EvaluationParityFixtureDifference[] => {
  const differences: EvaluationParityFixtureDifference[] = [];
  collectDifferences(committed, generated, '$', differences);
  return differences;
};
