# 動画処理 WebGPU/WebCodecs 高速化計画

> **前回の失敗（WebCodecsAPI-transfer ブランチ）の教訓を踏まえた実装計画。**
> 実装は時間のある時に行う。この文書が設計の Single Source of Truth。

---

## 前回何が起きたか（失敗分析）

### 試みたこと
- `VideoDecoder`（WebCodecs API）を Worker で動かし、mp4box.js でデマックス
- デコードした `VideoFrame` をキューに溜めて `getFrame(time)` で取り出す
- Electron バックエンドに動画変換を逃した（→ これでバグった）

### なぜガクガクになったか

```
VideoDecoder Worker
  └─ VideoFrame → outputQueue (最大30フレーム)
                      ↓
              getFrame(time) ← タイムスタンプ照合
                      ↓
              ??? → PixiJS Texture ← ここが不明・CPU経由になっていた疑い
```

**根本原因（推定）:**

1. **VideoFrame → PixiJS の変換が CPU 経由**
   - `VideoFrame` → Canvas drawImage → PixiJS Texture という経路は
     毎フレーム CPU ↔ GPU コピーが走る
   - 60fps なら 1/60 = 16ms 以内に処理しなければならないが、コピーで詰まった

2. **キューのタイミング制御が粗い**
   - `findIndex` で timestamp 照合しているが許容誤差 100ms は大きすぎ
   - シーク後に古いフレームを掴む競合状態が発生

3. **Electron バックエンドに投げたら IPC 遅延**
   - フレーム単位の IPC は致命的に遅い（以前の PSD Blob 転送と同じ問題）

---

## 正しいアーキテクチャ

### 核心となる技術: `importExternalTexture`

WebGPU には `device.importExternalTexture({ source: videoFrame })` という API がある。
**VideoFrame を GPU テクスチャに CPU コピーなしで変換できる唯一の方法。**

```
VideoDecoder（Worker）
  └─ VideoFrame ──transfer──→ メインスレッド
                                  ↓
                   device.importExternalTexture(videoFrame)
                                  ↓
                      GPUExternalTexture ← ゼロコピー
                                  ↓
                      PixiJS WebGPU レンダーパス
```

PixiJS 8 はすでに WebGPU バックエンドを持ち、このプロジェクトでも
`preference: 'webgpu'` が設定済み。この API との統合が鍵。

---

## 実装フェーズ

### Phase 0: 前提確認（~1日）

**やること:**
- PixiJS が WebGPU で動いているか実際に確認
  - `app.renderer.type` が `'webgpu'` か確認
  - 現状 WebGL になっていれば原因を特定
- WebCodecs API が Electron の WebContents で有効か確認
  - `VideoDecoder.isConfigSupported({ codec: 'avc1.42E01E' })` をコンソールで実行
- `importExternalTexture` が利用可能か確認
  - `GPUDevice.prototype.importExternalTexture` の存在チェック

**なぜ重要か:**
これらが使えない環境では以降の計画全体が崩れる。
PSD チャレンジと同じ轍を踏まないために環境確認を最初に行う。

---

### Phase 1: VideoFrame → GPU ゼロコピーパス（~3日）

**目標:** 動画フレームを CPU を一切経由せず PixiJS に渡す

#### 1-1. Worker 側（デコード）

```typescript
// VideoDecoder.worker.ts（新設計）
// キューは持たない。フレームが来たらすぐ転送。
// タイミング制御はメインスレッドに委ねる。

decoder = new VideoDecoder({
  output: (frame) => {
    // VideoFrame は参照カウント管理。転送したら所有権が移る。
    self.postMessage({ type: 'frame', frame, timestamp: frame.timestamp }, [frame]);
  },
  error: (e) => self.postMessage({ type: 'error', message: e.message }),
});
```

**前回との違い:**
- キューをなくす（キューが stale フレームの原因だった）
- フレームはすぐ転送し、メインスレッドが判断する
- Electron バックエンドを経由しない

#### 1-2. メインスレッド側（テクスチャ統合）

```typescript
// PixiJS WebGPU バックエンドから GPUDevice を取得
const gpuDevice = (app.renderer as PIXI.WebGPURenderer).device;

// VideoFrame 受信時
worker.onmessage = (e) => {
  if (e.data.type !== 'frame') return;
  const frame: VideoFrame = e.data.frame;

  // ゼロコピー: VideoFrame → GPU テクスチャ
  const externalTexture = gpuDevice.importExternalTexture({ source: frame });

  // PixiJS テクスチャとして登録
  // ※ PixiJS 8 の WebGPU バックエンドでは GPUTexture を直接 Texture に渡せる
  const pixiTexture = PIXI.Texture.from(externalTexture, { ... });

  currentVideoTexture = pixiTexture;
  frame.close(); // 参照を解放（重要）
};
```

**注意点:**
- `importExternalTexture` で作ったテクスチャは **1 フレームしか生存しない**
  （GPUExternalTexture は submit() 後に無効化される）
- 毎フレームのレンダーループで `importExternalTexture` を呼び直す必要がある
- PixiJS の Texture キャッシュとの統合方法は要検証

#### 1-3. フレームタイミング制御

```typescript
// requestVideoFrameCallback（HTMLVideoElement 不使用の場合の代替）
// または requestAnimationFrame + VideoFrame.timestamp で精密同期

function onRenderFrame(timestamp: DOMHighResTimeStamp) {
  const targetUs = currentPlayTime * 1_000_000;

  // デコード済みフレームのうちタイムスタンプが最も近いものを選択
  // キューではなく「最新のデコード結果」を使う
  if (latestFrame && Math.abs(latestFrame.timestamp - targetUs) < 50_000 /* 50ms */) {
    renderVideoFrame(latestFrame);
  } else {
    // シーク: Worker にキーフレームから再デコードを指示
    worker.postMessage({ type: 'seek', time: currentPlayTime });
  }

  requestAnimationFrame(onRenderFrame);
}
```

---

### Phase 2: WebGPU Compute シェーダーによるフィルター処理（~3日）

**目標:** カラーコレクション・ブラー等のフィルターを GPU で実行

**現状:** フィルターは PixiJS の Fragment シェーダー（WGSL/GLSL）で実装済み。
基本的な構造はある。問題は動画フレームに毎フレーム適用するコストが高い点。

#### 対象フィルターの優先順位

| フィルター | 現状 | GPU 化難易度 | 効果 |
|---|---|---|---|
| color_correction | WGSL 実装済み | ✅ 低 | 高 |
| blur | PixiJS BlurFilter | ✅ 低（既に GPU） | 中 |
| fade | opacity のみ | ✅ 低 | 低 |
| clipping | WGSL 実装済み | ✅ 低 | 中 |
| vibration | CPU sin/cos | 🟡 中 | 中 |
| shadow | CPU blend | 🟡 中 | 中 |
| gradient | WGSL 実装済み | ✅ 低 | 中 |

**実装方針:**
- Phase 1 で VideoFrame が GPU テクスチャになっていれば、
  PixiJS の既存 WGSL フィルターをそのまま適用できる
- 追加実装が必要なのは vibration（CPU の sin/cos を WGSL に移植）のみ

#### Compute シェーダーが有効な場面

通常の Fragment シェーダーで済む処理は Fragment のまま（PixiJS 任せ）。
Compute シェーダーが有利なのは:
- **多パスフィルター**: ブラーの水平・垂直分離（Gaussian Blur 最適化）
- **ヒストグラム計算**: カラーグレーディングの自動調整
- **動き検出**: 将来の安定化機能向け

---

### Phase 3: WebCodecs VideoEncoder によるエクスポート（~5日）

**目標:** フレームを GPU からそのまま WebCodecs でエンコード → 動画ファイル出力

**現状:** エクスポートは Canvas → Blob の非効率なパスを使用（推定）

#### 新しいエクスポートパイプライン

```
PixiJS レンダー（GPU）
  └─ captureStream() or OffscreenCanvas
        ↓
  VideoEncoder（WebCodecs）← ハードウェアエンコード
        ↓
  EncodedVideoChunk → MP4Muxer（mp4-muxer ライブラリ）
        ↓
  ArrayBuffer → ファイル保存
```

**重要なライブラリ:**
- `mp4-muxer` または `webm-muxer`: EncodedVideoChunk を MP4/WebM コンテナに格納
- どちらも npm で利用可能、ブラウザネイティブ

#### 実装上の注意

- `VideoEncoder` のコーデックサポートは環境依存（H.264 は概ね OK）
- `isConfigSupported()` で事前チェック必須
- エンコードは非リアルタイムでよい（オフラインエクスポート）

---

## リスクと対策

### リスク 1: `importExternalTexture` と PixiJS の非互換

**リスク:** PixiJS 8 の Texture システムが `GPUExternalTexture` を
直接受け付けない可能性がある。

**対策:**
- PixiJS のソースを読んで `TextureSource` の拡張ポイントを確認
- 最悪は `drawImage(videoFrame, ...)` → OffscreenCanvas → PixiJS Texture
  （CPU コピーありだが現状より確実）
- `importExternalTexture` を使うカスタム PixiJS フィルターとして実装する選択肢もある

### リスク 2: VideoFrame のライフタイム管理

**リスク:** VideoFrame を close() し忘れるとメモリリークまたはデコードが詰まる。

**対策:**
- `using` 宣言（ECMAScript Explicit Resource Management）を活用
  ```typescript
  using frame = await getNextFrame(); // スコープ抜けたら自動 close()
  ```
- または finalizer 登録

### リスク 3: シークのキーフレーム問題

**リスク:** 任意の時刻にシークするには直前のキーフレームからデコードし直す必要がある。
前回の実装はここでガクガクが発生した。

**対策:**
- **プロキシ動画の活用**: Electron の FFmpeg で
  「全フレームをキーフレームにした低品質プロキシ」を生成。
  これならシーク = 即座にデコード可能。
  ```
  ffmpeg -i input.mp4 -c:v libx264 -x264opts keyint=1 -crf 40 proxy.mp4
  ```
- プレビュー時はプロキシを使い、エクスポート時のみ元ファイルを参照

**2026-06-20 実装メモ:**
- 動画読み込み時に隣接する `.proxy.mp4` を自動検出し、存在しない場合はRust backendの `proxy.generate` で640px幅のpreview proxyを生成する。
- preview proxyはH.264 / 全Iフレーム / 音声なしで生成し、Rust shared renderer previewの動画sourceとして使用する。原本pathは `filePath` に保持し、exportや将来の高品質処理で参照する。
- 原本4K/120fps HEVCの直接decodeは重いため、現段階の滑らかpreviewはproxy前提とする。次段ではWebGPU presenterの永続化とtexture差し替えAPIでframeごとの起動費を削る。

### リスク 4: Electron の WebGPU サポート

**リスク:** Electron 30 の WebGPU は利用可能だが、
一部の GPU ではバックエンドが有効にならない。

**対策:**
- Phase 0 で環境確認
- WebGL フォールバックパスを維持（現状の PixiJS のまま）

---

## PSD チャレンジの教訓をどう活かすか

| PSD での教訓 | 動画への適用 |
|---|---|
| WASM の byte loop は V8 JIT に負ける | 動画デコードは WebCodecs（ブラウザネイティブ）に任せる |
| ランダムアクセス並列はキャッシュを壊す | フレームはシーケンシャルに処理する |
| GPU 直接操作（transferToImageBitmap）は速い | importExternalTexture で同じ思想を適用 |
| 先に環境確認しないと無駄になる | Phase 0 を必ず先にやる |
| IPC 経由は致命的に遅い | デコードは Renderer プロセス完結、Electron Main を経由しない |

---

## 実装の順序（重要）

### 2026-06-20 追記: StormEditor知見を使ったUX FD向け順序

StormEditorは「React UI + Rust/WASM WebGPU renderer + napi-rs backend」という分担で、重い描画loopをElectron IPCへ流していない。
UX FDも同じ知見を使い、4K原本previewではRust子プロセスstdio + RGBA shared memory + JS uploadを主経路にしない。
短期のfast pathは WebGPU presenter に `importExternalTexture` を持たせ、外部動画sourceを `texture_external` shaderで直接描く。
この経路はpreview専用の近似fast pathであり、export parityの正本ではない。export/正確性検証は引き続きRust decode / sidecar decode / colour contract gateで担保する。

実装順は次に変更する。

```
Phase 1-b0: WebGPU presenter に external texture 描画APIを追加（完了）
  ↓
Phase 1-b1: presenter専用 external video source provider を隔離して追加
  ↓
Phase 1-b2: GoPro 4K原本をproxyなしで5秒再生するE2Eを追加
  ↓
Phase 1-c: napi-rs / native bridgeでVideoToolbox相当のsourceへ差し替えられる境界を作る
```

```
Phase 0: 環境確認（1日）
  ↓ WebGPU OK / WebCodecs OK が確認できたら進む
Phase 1-a: VideoDecoder Worker + フレーム転送（2日）
  ↓ ガクガクなしで再生できることを確認
Phase 1-b: importExternalTexture 統合（1日）
  ↓ CPU コピーなしのパスが通ることを確認
Phase 2: フィルター検証（既存 WGSL で動くなら追加実装不要）（2日）
  ↓
Phase 3: エクスポートパイプライン（5日）
```

**Phase 1-a の完了基準:** 60fps 動画が途切れなく再生できること
**Phase 1-b の完了基準:** Chrome DevTools の GPU タブでフレームコピーが発生していないこと

---

## 参考リンク

- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [importExternalTexture - WebGPU Spec](https://gpuweb.github.io/gpuweb/#dom-gpudevice-importexternaltexture)
- [VideoFrame と WebGPU の統合例](https://developer.chrome.com/articles/video-frame-gpu/)
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) - エクスポート用
- [PixiJS 8 WebGPU バックエンド](https://pixijs.com/8.x/guides/components/rendering)
- [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
