# クロスオブジェクト配線の Rust 移管調査

## Decision

- 今回は移管しない。`resolve_target_audio`、`resolve_getcolor_sample_source`、`expand_group_control_targets` を `rust-core` の純粋関数として追加しても、既存の Rust 到達点には解決に必要な入力が残っていないためである。
- `scene.replace` が受け取るのは、TypeScript の `buildEditableRustScene` がすでに射影した評価用 `Project` と `SceneMediaReference` である。`Project.group_controls` は `target_track_ids` のみで、元の `targetLayerCount`、全 object の layer、非表示 object の情報を持たない。
- `audio_visualization` / `audio_sphere` の `SceneMediaReference.source` は TypeScript が `target_audio_id` と `target_source` を JSON に埋め込み済みである。音声 object は常駐 `Project.tracks` / `media` に含まれないので、Rust 側では ID 優先・layer と時間窓によるフォールバックのどちらも再実行できない。
- `getcolor_dot_field` も同様に、`source_image` と `source_active_layer_ids` が TypeScript により生成 JSON へ埋め込まれる。Rust に届く時点で `sampleSourcePath` / `sampleSourceObjectId` / `sampleSourceLayer`、候補 image/PSD の object ID・layer・時間窓、PSD の `activeLayerIds` は失われている。
- 旧 `buildRustSceneSnapshotForTimeline` 経路は、同じ TypeScript の serializer が時刻付きで評価済み `SceneSnapshot` / media を直接組み立てる。`sharedRendererPreviewBridge` がこれを利用する。常駐経路は `buildEditableRustScene` → `scene.replace` → Rust `evaluate_frame` だが、media の source は replace 前に同じ serializer で組み立てられる。
- よって、snapshot serializer 全体または少なくとも「未解決の object graph と参照指定を Rust へ送る新しい準備 wire」を先に設計しない限り、Rust へ関数だけを置くと未使用の第二実装になる。timeline の可視性・時間評価を Rust 側で再利用しても、必要な編集モデルが渡らない問題は解消しない。

## Alternatives considered

- **Rust に3純粋関数だけを追加する（小、低リスクだが無効）**: 入力を渡す既存 call site が無く、TypeScript の解決を削除できない。正本を増やすだけなので却下した。
- **各 generator の source JSON に未解決参照を追加し、rust-backend/native renderer で解決する（中〜大、高リスク）**: audio / image / PSD / group-control の候補表、layer 可視性、タイミング、PSD active layers を別途 `scene.replace` と旧 snapshot 経路の双方に渡す必要がある。media が frame ごとに変わる可能性もあるため、常駐 session の media キャッシュと native renderer の source キャッシュの無効化設計が必要になる。部分的な serializer 移管ではあるが、全経路の wire 契約を変更する。
- **編集用 object graph を Rust へ渡し、Rust が評価用 Project / media を構築する（大、中〜高リスク、推奨）**: `TimelineObject` の完全な Rust union、layer state、UI 由来の media path / PSD runtime fields の受渡しを定義し、`scene.replace` と snapshot 利用者を同じ Rust builder に揃える。既存の `timeline.rs` の時間評価を一度だけ利用でき、今回の配線だけでなく残る snapshot 構築責務を減らせる。447 frame parity を新 wire で再取得する必要がある。

## Constraints / Gotchas

- `findTargetAudioForGeneratedAudio` は ID が存在すれば時間外でも選ぶ一方、layer fallback のみ `startTime <= time < startTime + duration` を要求する。この非対称な規約を新しい Rust builder のテストにそのまま移す必要がある。
- GetColor は直接 `sampleSourcePath` を最優先し、空ならその時刻に有効な image/PSD だけを候補にする。object ID が指定されて候補外なら layer fallback へは進まず `undefined` になる。PSD は有効 layer ID をソートして source に含める。
- group control は表示対象の編集 object を layer 順に並べた後、control より上の layer を対象にする。`targetLayerCount: 0` は上側すべてであり、同一 layer は対象外である。対象は object でなく一意な `layer-N` track ID に畳まれる。
- 既存の direct snapshot 経路と常駐経路はともに `rustSceneSnapshot.ts` の `mediaReferenceForObject` を共有するため、片方だけを新 wire に変えると preview/export の配線結果が分岐する。
- 本記録はユーザー指定に従い `progress/INDEX.md` を更新していない。
