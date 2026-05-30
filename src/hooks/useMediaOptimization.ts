import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import type { VideoObject } from '../types';

const { ipcRenderer } = window;

/**
 * 書き出し高速化用の「中間ファイル」を編集中にバックグラウンドで先行生成する。
 *
 * 出力解像度より大きい動画ソース（例: FHD プロジェクトに 4K 素材）を、出力解像度の
 * H.264 へ HW(ffmpeg/VideoToolbox) で一度だけ変換・キャッシュする。書き出し時は
 * これを VideoDecoder で高速・フレーム落ちなしにデコードできる。生成は1本ずつ・
 * 書き出し中は行わない（競合回避）。生成しても書き出しをブロックしない設計のため、
 * 未完なら従来のフォールバック（rVFC 再生方式）で書き出される。
 */
export const useMediaOptimization = (): void => {
  const { objects, width } = useStore(
    (s) => ({ objects: s.objects, width: s.projectSettings.width }),
    shallow,
  );

  const processedRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    if (!ipcRenderer || runningRef.current) return;

    const nextCandidate = (): { filePath: string; key: string } | null => {
      const w = widthRef.current;
      const seen = new Set<string>();
      for (const o of objectsRef.current) {
        if (o.type !== 'video') continue;
        const v = o as VideoObject;
        // 出力解像度より大きいソースのみ（ダウンスケールで decode が軽くなる）。
        if (!v.filePath || !(o.width > w)) continue;
        const key = `${v.filePath}@${w}`;
        if (seen.has(key) || processedRef.current.has(key)) continue;
        seen.add(key);
        return { filePath: v.filePath, key };
      }
      return null;
    };

    const run = async () => {
      runningRef.current = true;
      try {
        for (;;) {
          // 書き出し中は競合を避けて待機する。
          if (useStore.getState().isExporting) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          const cand = nextCandidate();
          if (!cand) break;
          const w = widthRef.current;
          try {
            const chk = await ipcRenderer.invoke('check-intermediate', { filePath: cand.filePath, width: w });
            if (chk?.exists) { processedRef.current.add(cand.key); continue; }
            const gen = await ipcRenderer.invoke('generate-intermediate', { filePath: cand.filePath, width: w });
            if (gen?.success) {
              processedRef.current.add(cand.key);
              console.log('[MediaOpt] 中間ファイル生成完了:', cand.filePath);
            } else if (gen?.busy) {
              await new Promise((r) => setTimeout(r, 3000)); // 別の生成中 → 後で再試行
            } else {
              processedRef.current.add(cand.key); // 失敗は再試行しない
              console.warn('[MediaOpt] 中間ファイル生成失敗（スキップ）:', gen?.error);
            }
          } catch (e) {
            processedRef.current.add(cand.key);
            console.warn('[MediaOpt] 中間ファイル処理で例外:', e);
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    void run();
  }, [objects, width]);
};
