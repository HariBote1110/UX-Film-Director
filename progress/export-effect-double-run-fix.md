# エクスポート実行 effect の二重起動修正

## Decision
- `src/hooks/useProjectExport.ts` の実行 effect（旧 `useEffect(..., [isExporting, renderScene, setExporting, setTime, setExportProgress, getExportCanvas, getRustExportFrameSource])`）は依存配列にコールバックを含んでいたため、`VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1` 環境下でシーン revision 更新によって `renderScene` や `getRustExportFrameSource` の identity が変わるたびに cleanup→再発火し、同一出力パスに対して `runExport` が二重に走っていた（`encode.start count=2` → IOSurface "Cannot Save" 失敗・0バイトファイル・タイムアウト）。
- 依存配列を `[isExporting]` のみに絞り、`isExporting` の立ち上がりでのみ `runExport` を起動する形へ変更した。
- コールバック（`renderScene`, `getExportCanvas`, `getRustExportFrameSource`）は `latestCallbacksRef = useRef({...})` を毎レンダーで更新し、`runExport` 内部では呼び出し時点で `latestCallbacksRef.current.xxx` を参照する形にした（`runExport` 冒頭で一度だけ分割代入せず、フレーム毎のループ内・初期フレームソース解決の両方で都度参照）。
- `setExporting` / `setTime` / `setExportProgress` は effect 発火時に `useStore.getState()` から取得する形に変更し、`useStore` セレクタは `isExporting` 単体を返すだけにした（`shallow` 比較は不要になったため import ごと削除）。

## Alternatives considered
- **単純な再入防止ガード（例: `isRunningRef` で二重呼び出しをスキップ）は採用しなかった**。cleanup の `cancelled = true` と競合し、「古い実行がキャンセルされたので新しい実行もガードでスキップされ、結果として何も実行されないまま静かに死ぬ」状態を引き起こすことを実測で確認済み（`encode_research/notes/write-pipelining-rejected-backend-serial-cpu.md` 参照）。ユーザーキャンセルの `cancelled`／`exportCancelRequested` の意味論を壊さずに二重起動だけを止めるには、そもそも effect を再発火させない（依存配列を絞る）方が安全。

## Constraints / Gotchas
- `latestCallbacksRef.current` は **呼び出し時点で** 読む必要がある。`runExport` の先頭で一度だけ分割代入すると、それはクロージャ生成時点の古い値を固定してしまい ref を使う意味がなくなる。フレームループ（`renderFrames` ジェネレータ内）とフレームソース初期解決の両方、呼び出し箇所ごとに `latestCallbacksRef.current.xxx` を参照すること。
- `setExporting` / `setTime` / `setExportProgress` は zustand の action であり `useStore.getState()` から常に安定して取得できるため、依存配列に含める必要はない。今回 effect 内で `useStore.getState()` から取り直す形にした。
- ユーザーキャンセル系（`cancelled` フラグと `exportCancelRequested` を両方見る `isCancelled()`）、cleanup の `return () => { cancelled = true; }` は今回の修正で一切変更していない。unmount / `isExporting: true→false` の両方でこの cleanup は引き続き効く。
- 回帰テストは `src/hooks/useProjectExport.effectLifecycle.test.ts` に置いた。`react` モジュールを `vi.mock` して `useEffect`/`useRef` の実セマンティクス（deps の `Object.is` 比較、cleanup-then-effect、unmount cleanup）を再現するハーネスを使い、フック本体の実際の依存配列を検証している。
