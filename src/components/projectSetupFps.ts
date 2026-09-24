/**
 * fps自由入力欄のドラフト文字列を検証し、有効な整数fpsに変換する。
 * 許容範囲は1〜240の整数のみ(小数・空文字・範囲外はnullを返す)。
 * 分数fps対応は将来課題であり、ここでは意図的に扱わない。
 */
export function parseFpsInput(draft: string): number | null {
  const trimmed = draft.trim();
  if (trimmed === '') {
    return null;
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > 240) {
    return null;
  }
  return value;
}
