# native overlay 再attach後の黒画面

## Decision

macOS の native overlay は再attach時に新しい CAMetalLayer-backed surface を作る。
従来は同じ `window_id` の renderer を新規 renderer で置き換え、旧 renderer の
`last_scene`、NV12 IOSurface、生成レイヤーの直前呈示状態を破棄していた。さらに
新 surface への present を行わないため、container view の黒い backing layer が
次フレームまで表示されていた。

旧 renderer から直前の呈示状態を取り出して新 renderer へ移し、cached scene が
ある場合は登録前に `present_cached_scene_with_decoration` を一度実行する。これにより
再attach成功時に、ユーザーの seek/play を待たず scene と video の直前フレームを
新しい surface へ呈示する。選択デコレーションは既存の window 単位 state を使用する。

cached scene の再呈示は最善努力とする。旧 renderer を registry から取り出した後に
再呈示が失敗しても、エラーを stderr へ記録し、新 renderer と復元済み state は必ず
registry に登録する。後続の通常 present が回復でき、再attach 呼び出し自体も失敗に
ならない。

新 surface は `from_appkit_view` の内部で新しい drawable 幅・高さを使って
`surface.configure` してから renderer を返す。cached scene は旧 drawable に
contain-fit 済みなので、直接 scene present の state には元 snapshot と canvas サイズも
保持し、cached re-present 時に新 drawable サイズへ再 fit する。これにより resize を
伴う再attachでも texture の surface 設定と clip 座標が旧サイズに取り残されない。

`Viewport.tsx` の attach effect を追跡した結果、ResizeObserver、window/visualViewport
resize、fullscreen、visibility、focus、pageshow、解像度変更、低頻度ポーリングはすべて
`attach()` を直接呼ぶ。attach key が変わったときだけ bridge の `attach` → main bridge の
`attachNativeOverlay` → napi `attach_native_overlay` に至り、この経路に先行 detach はない。
NSOpenPanel の終了後は focus/visibility の attach 経路に入るが、同じく detach はない。
`detach` はこの effect の cleanup（unmount または native overlay 無効化）でのみ、
`clearSurface` の後に呼ばれる。これは explicit-unmount の契約なので retained state を
保持せず、古い frame を復元しない。したがって transient reattach 用の IPC や TS 変更は
不要だった。

## Alternatives considered

- TS 側で attach 成功後に repaint を要求する: Viewport の lifecycle は成功後に
  selection-decoration の dedupe tick を進めるだけで、scene/video present の全呼び出し元を
  カバーしない。renderer の置換で失われた video state も復元できないため不採用。
- 新 renderer を黒以外で初期化する: 直前フレームではなく、scene/video の復元という
  要件を満たさないため不採用。
- explicit detach 後にも Rust 側で state を別 registry に残す: cleanup/unmount 後に
  古い frame が復活する既存契約違反になる。実際の transient 経路は detach を通らないため
  不採用。

## Constraints

- cached scene がない透明 clear 状態は意図どおり透明のままとし、再attachで黒い
  フレームを人工的に作らない。
- shared-frame の snapshot/media が無い旧互換経路は、従来どおり upload 用に生成済みの
  snapshot を一度だけ再呈示する。この通常経路は現行 TypeScript の video upload が
  snapshot/media/canvas を同梱するため使用しない。次の frame present では必ず最新
  drawable 向けに組み直される。
- 明示的な detach は renderer と選択デコレーションを破棄する既存契約のままであり、
  unmount 後に古いフレームを復元しない。
