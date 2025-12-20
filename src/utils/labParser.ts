export interface LabPhoneme {
  startTime: number; // 秒
  endTime: number;   // 秒
  phoneme: string;   // 音素
}

// Labファイルを解析して音素データの配列を返す
export const parseLabFile = async (file: File): Promise<LabPhoneme[]> => {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const data: LabPhoneme[] = [];
  
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3) {
      // A.I.VOICE (AITalk) の形式は 100ns 単位
      // 秒 = 値 * 100ns = 値 * 10^-7
      const start = parseInt(parts[0], 10) / 10000000;
      const end = parseInt(parts[1], 10) / 10000000;
      const ph = parts[2];
      data.push({ startTime: start, endTime: end, phoneme: ph });
    }
  }
  return data;
};

// 音素を母音(口の形)に変換する
// a, i, u, e, o, n (閉じる)
export const phonemeToViseme = (ph: string): 'a' | 'i' | 'u' | 'e' | 'o' | 'n' | null => {
    // 母音
    if (['a', 'aa'].includes(ph)) return 'a';
    if (['i', 'ii', 'y'].includes(ph)) return 'i';
    if (['u', 'uu', 'w'].includes(ph)) return 'u';
    if (['e', 'ee'].includes(ph)) return 'e';
    if (['o', 'oo'].includes(ph)) return 'o';
    
    // 撥音・閉じる口 (m, p, b, N)
    if (['N', 'm', 'p', 'b'].includes(ph)) return 'n';
    
    // 無音・ポーズ
    if (['sil', 'pau', 'cl'].includes(ph)) return 'n';
    
    // その他子音は null を返し、前後の母音を利用する等の制御に委ねる
    return null; 
};