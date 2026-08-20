/* tslint:disable */
/* eslint-disable */

/**
 * UX Film Director(TypeScript/Electron)から叩く、ステージ描画の1インスタンス。
 *
 * `create`で得た1個を、キャンバスのライフタイムいっぱい使い回す想定
 * (`resize`でウィンドウサイズ変更に追従、`syncBillboard`/`uploadMeshChunk`で
 * 毎フレームの差分だけ送る — Three.js版の`syncBillboards`と同じ使い方)。
 */
export class StageRenderer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * キャンバスからGPUデバイス/サーフェスを初期化する。デバイスの取得に
     * 失敗した場合(対応GPUが無い等)はJSへ例外として伝える。
     */
    static create(canvas: HTMLCanvasElement, width: number, height: number): Promise<StageRenderer>;
    /**
     * 現在のシーンをキャンバスと同じ寸法のオフスクリーンへ描画し、
     * タイトパックのRGBA8として読み戻す(エクスポート/スナップショット用)。
     * wasm上でも動く非同期読み戻し(`RenderTarget::readback_rgba_async`)を使う。
     *
     * **保証: 戻り値は常にタイトパックRGBA8(4バイト/ピクセル、r,g,b,aの順)。**
     * オフスクリーンターゲットはサーフェスのcolourフォーマット
     * (ブラウザ/GPU依存でRgba8系/Bgra8系のいずれかになりうる)で描画されるが、
     * `normalise_to_rgba`でBgra8系の場合はB/Rチャンネルを入れ替えてから
     * 返すため、呼び出し側(TypeScript)はチャンネル順を一切気にする必要が
     * ない。詳細は`progress/m2a-wasm-bindings.md`を参照。
     *
     * **再入可能性についての注意(重要):** この関数自体は`&self`を
     * 同期的にしか借用しない — `RenderTarget`への描画(`self.renderer.render`)
     * までを同期区間で終わらせ、実際に`.await`する読み戻しは`self`から
     * 独立した所有値(`device`/`queue`のクローンと、`self`を参照しない
     * `RenderTarget`)だけを捕まえた`async move`ブロックとして
     * `wasm_bindgen_futures::future_to_promise`へ渡す。
     * こうしないと、wasm-bindgenが生成する`&self`のランタイム借用チェックが
     * `.await`をまたいで“借用中”のまま残ってしまい、その間にTS側のrAF
     * ループが`setCamera`(`&mut self`)を呼ぶと
     * `recursive use of an object detected which would lead to unsafe
     * aliasing in rust`で毎回パニックしていた
     * (`OxidiseStageViewport.tsx`のtick()が`readbackRgba`のfire-and-forget
     * 呼び出しと同じ`StageRenderer`インスタンスへ`setCamera`を叩くため)。
     * `device`/`queue`は`wgpu`内部で`Arc`相当のハンドルなので、クローンは
     * 同じGPUデバイス/キューへの別ハンドルを作るだけで安価。
     */
    readbackRgba(): Promise<any>;
    /**
     * ビルボードを取り外す(テクスチャも合わせて破棄する)。
     */
    removeBillboard(id: string): void;
    /**
     * メッシュチャンクを取り外す。
     */
    removeMeshChunk(id: string): void;
    /**
     * 現在のシーンをキャンバスへ描画してpresentする。
     */
    render(): void;
    /**
     * キャンバスのサイズが変わったときに呼ぶ。サーフェスと深度バッファの
     * 両方をそのサイズへ作り直す。
     */
    resize(width: number, height: number): void;
    /**
     * カメラを設定する(内部クロックは持たないので、呼び出し側が毎回渡す想定)。
     */
    setCamera(eye_x: number, eye_y: number, eye_z: number, look_x: number, look_y: number, look_z: number, fov_y_rad: number, near: number, far: number): void;
    /**
     * 背景クリア色を設定する(アルファは常に1.0)。
     */
    setClearColour(r: number, g: number, b: number): void;
    /**
     * PSDビルボードを1枚同期する(M1の`TextureRegistry`のsource-key再利用
     * 意味論をそのまま踏襲 — 同じ`source_key`なら再アップロードしない)。
     */
    syncBillboard(id: string, source_key: string, rgba: Uint8Array, width_px: number, height_px: number, world_x: number, world_y: number, world_z: number, yaw_rad: number, world_width: number, world_height: number, opacity: number): void;
    /**
     * メッシュチャンク(グリッド/ギズモ等のジオメトリ)をアップロードする。
     * `colours`はRGBA8を頂点ごとにタイトパックしたバイト列
     * (`vertices.len()/3`個分、4バイトずつ)。
     */
    uploadMeshChunk(id: string, vertices: Float32Array, colours: Uint8Array, indices: Uint32Array, layer: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_stagerenderer_free: (a: number, b: number) => void;
    readonly stagerenderer_create: (a: any, b: number, c: number) => any;
    readonly stagerenderer_readbackRgba: (a: number) => any;
    readonly stagerenderer_removeBillboard: (a: number, b: number, c: number) => void;
    readonly stagerenderer_removeMeshChunk: (a: number, b: number, c: number) => void;
    readonly stagerenderer_render: (a: number) => [number, number];
    readonly stagerenderer_resize: (a: number, b: number, c: number) => void;
    readonly stagerenderer_setCamera: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly stagerenderer_setClearColour: (a: number, b: number, c: number, d: number) => void;
    readonly stagerenderer_syncBillboard: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => void;
    readonly stagerenderer_uploadMeshChunk: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h53375256f4907ff1: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h48cec7a98a6b012f: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h583aaaf058026732: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
