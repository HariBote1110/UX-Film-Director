export type AviUtlPackFeaturePhase = 'P0' | 'P1' | 'P2' | 'P3';

export type AviUtlPackImplementationTarget =
  | 'native-motion-preset'
  | 'rust-webgpu-effect'
  | 'native-generated-object'
  | 'native-camera-tool'
  | 'script-runtime-later';

export type AviUtlPackBundlingMode =
  | 'native-compatible-reimplementation'
  | 'metadata-only-reference';

export interface AviUtlPackV4InventorySummary {
  sourceName: 'AviUtlPackV4';
  observedRootHint: string;
  fileCounts: {
    anm: number;
    obj: number;
    tra: number;
    cam: number;
    scn: number;
    lua: number;
    stg: number;
  };
  notes: string[];
}

export interface AviUtlPackFeatureCandidate {
  id: string;
  labelJa: string;
  category: 'motion' | 'transition' | 'visual-effect' | 'generated-object' | 'audio-visual' | 'camera' | 'compatibility';
  phase: AviUtlPackFeaturePhase;
  implementationTarget: AviUtlPackImplementationTarget;
  bundlingMode: AviUtlPackBundlingMode;
  sourceRelativePaths: string[];
  rationaleJa: string;
}

const inventorySummary: AviUtlPackV4InventorySummary = {
  sourceName: 'AviUtlPackV4',
  observedRootHint: 'iCloud Drive/AviUtlPackV4',
  fileCounts: {
    anm: 137,
    obj: 61,
    tra: 12,
    cam: 6,
    scn: 2,
    lua: 15,
    stg: 18
  },
  notes: [
    '2026-06-21にiCloud Drive配下の利用中Packを棚卸しした数値。',
    '第三者スクリプト本体はコピーせず、標準搭載はUX FDネイティブの互換再実装として扱う。'
  ]
};

const candidates: AviUtlPackFeatureCandidate[] = [
  {
    id: 'aviutl-easing',
    labelJa: 'AviUtl系イージング',
    category: 'motion',
    phase: 'P0',
    implementationTarget: 'native-motion-preset',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@イージング.tra', 'script/easing.lua', 'script/easing_aviutl.lua'],
    rationaleJa: 'ボイロ動画の登場、退場、表情差分、テロップ移動で最も使用頻度が高い。'
  },
  {
    id: 'ymm4-entrance-exit',
    labelJa: 'YMM4風 登場退場',
    category: 'motion',
    phase: 'P0',
    implementationTarget: 'native-motion-preset',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/YMM4/登場退場.lua', 'script/YMM4/@YMM4イージング.tra'],
    rationaleJa: '立ち絵や字幕のプリセット操作に直結し、最小UIでも体感価値が大きい。'
  },
  {
    id: 'ymm4-random-motion',
    labelJa: 'YMM4風 ランダム',
    category: 'motion',
    phase: 'P0',
    implementationTarget: 'native-motion-preset',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/YMM4/ランダム.lua'],
    rationaleJa: '微振動、散らし配置、反復表現をRust側の決定的乱数で再現しやすい。'
  },
  {
    id: 'ymm4-repeat-motion',
    labelJa: 'YMM4風 反復',
    category: 'motion',
    phase: 'P0',
    implementationTarget: 'native-motion-preset',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/YMM4/反復.lua'],
    rationaleJa: 'ゆらし、点滅、ループ移動など編集頻度の高い表現へ使える。'
  },
  {
    id: 'tim-luminance-wipe',
    labelJa: '輝度ワイプ',
    category: 'transition',
    phase: 'P1',
    implementationTarget: 'rust-webgpu-effect',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/輝度ワイプ.anm'],
    rationaleJa: '既存のワイプを拡張し、WebGPU shaderで高速に実装しやすい。'
  },
  {
    id: 'tim-edge-outline',
    labelJa: '縁取りT',
    category: 'visual-effect',
    phase: 'P1',
    implementationTarget: 'rust-webgpu-effect',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/縁取りT.anm'],
    rationaleJa: '字幕、画像、立ち絵の視認性向上に直結する基本効果。'
  },
  {
    id: 'tim-colour-aberration',
    labelJa: '色収差',
    category: 'visual-effect',
    phase: 'P1',
    implementationTarget: 'rust-webgpu-effect',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/色収差.anm'],
    rationaleJa: '軽量なRGBチャンネルオフセットとしてGPU向きで、演出用途が広い。'
  },
  {
    id: 'fan-clipping-r',
    labelJa: '扇クリッピングR',
    category: 'transition',
    phase: 'P1',
    implementationTarget: 'rust-webgpu-effect',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/その他/扇クリッピングR.anm', 'script/その他/fan_clipping.lua'],
    rationaleJa: '既存クリッピングの自然な拡張で、場面転換や表情切替へ使いやすい。'
  },
  {
    id: 'audio-waveform-r',
    labelJa: 'Audio waveform R',
    category: 'audio-visual',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/Audio_waveform_R.obj'],
    rationaleJa: '音声中心の動画で需要が高く、既存のaudio_visualizationを伸ばしやすい。'
  },
  {
    id: 'getcolor-v2r-dot-field',
    labelJa: 'GetColor V2R ドットフィールド',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@GetColor/@GetColor-V2R.anm', 'script/93/@GetColor.anm', 'script/93/@GetColorTool.anm'],
    rationaleJa: '画像をドット化し、色相・彩度・輝度・透明度で変形できる大物。UX FDではまずRust生成の色/輝度ドットフィールドとして分割実装する。'
  },
  {
    id: 'getcolor-v2r-diamond-dots',
    labelJa: 'GetColor V2R 菱形ドットフィールド',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@GetColor/@GetColor-V2R.anm'],
    rationaleJa: 'GetColor V2Rの図形指定を、Rust生成の菱形ドットプリセットとして標準搭載する。'
  },
  {
    id: 'getcolor-v2r-outlined-square-dots',
    labelJa: 'GetColor V2R 枠線四角ドットフィールド',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@GetColor/@GetColor-V2R.anm'],
    rationaleJa: 'GetColor V2Rの図形線幅指定を、Rust生成の枠線付き四角ドットプリセットとして標準搭載する。'
  },
  {
    id: 'getcolor-v2r-sampled-dots',
    labelJa: 'GetColor V2R 画像サンプリングドット',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@GetColor/@GetColor-V2R.anm', 'script/93/@GetColor.anm', 'script/93/@GetColorTool.anm'],
    rationaleJa: 'GetColor V2Rの本命である元画像の色・透明度取得を、Rust生成ドットへ接続する。'
  },
  {
    id: '93-audio-sphere',
    labelJa: '93 音声玉',
    category: 'audio-visual',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/音声玉.obj'],
    rationaleJa: '音声スペクトラムで球状メッシュを膨らませる演出で、音声中心動画との相性が高く、既存audio waveformサンプル取得経路を拡張しやすい。'
  },
  {
    id: '93-delay-move',
    labelJa: '93 Delay個別',
    category: 'motion',
    phase: 'P1',
    implementationTarget: 'native-motion-preset',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@DelayMove.anm'],
    rationaleJa: '個別オブジェクトの移動・回転・透明度を順番に遅らせる定番表現。複数選択/キーフレーム生成へ接続できる。'
  },
  {
    id: '93-spotlight',
    labelJa: '93 SpotLight',
    category: 'visual-effect',
    phase: 'P1',
    implementationTarget: 'rust-webgpu-effect',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@SpotLight.anm'],
    rationaleJa: '立ち絵や注目箇所へ向かう光束表現として使いやすく、WebGPU上の加算グロー/減衰描画へ落とし込める。'
  },
  {
    id: '93-region-frame',
    labelJa: '93 領域枠',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@領域枠.anm'],
    rationaleJa: 'オブジェクトや注釈範囲を囲む枠と薄い背景を、Rust生成の解説UI素材として標準搭載する。'
  },
  {
    id: '93-contour-trace',
    labelJa: '93 輪郭トレス',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/Contour.anm', 'script/93/輪郭トレス.anm'],
    rationaleJa: '立ち絵・図形の外周をなぞる輪郭線表現を、Rust生成の注釈/強調素材として標準搭載する。'
  },
  {
    id: '93-displacement-poly',
    labelJa: '93 DisplacementPoly',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/DisplacementPoly.anm'],
    rationaleJa: '画像の輝度で格子を変位させる発想を、まずRust生成の変位ポリゴングリッド素材として標準搭載する。'
  },
  {
    id: '93-displacement-map-b',
    labelJa: '93 ディスプレイスメントマップB',
    category: 'visual-effect',
    phase: 'P1',
    implementationTarget: 'rust-webgpu-effect',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@ディスプレイスメントマップB.anm'],
    rationaleJa: '別レイヤー/フレームバッファを変位マップにする発想を、まずRust/WebGPUの手続き的な波形変位として標準搭載する。'
  },
  {
    id: '93-region-frame-ellipse',
    labelJa: '93 領域枠(楕円)',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@領域枠.anm'],
    rationaleJa: '丸い注目範囲や柔らかい囲みをRust生成の楕円枠として標準搭載する。'
  },
  {
    id: '93-region-frame-cut-corner',
    labelJa: '93 領域枠(角落ち)',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@領域枠.anm'],
    rationaleJa: '情報パネル風の角落ち枠をRust生成の注釈素材として標準搭載する。'
  },
  {
    id: '93-simple-tube',
    labelJa: '93 SimpleTube',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/SimpleTube.obj', 'script/93/SimpleTube2.obj'],
    rationaleJa: 'チューブ/トーラス状の3D風ライン素材を、Rust生成の解説・背景演出として標準搭載する。'
  },
  {
    id: '93-simple-tube-torus',
    labelJa: '93 SimpleTube トーラス',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/SimpleTube2.obj'],
    rationaleJa: 'SimpleTube2のトーラス指定をRust生成の円環ライン素材として標準搭載する。'
  },
  {
    id: 'hksy-checker-grid',
    labelJa: 'hksy チェッカー/グリッド',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@hksy/@hksy.obj', 'script/@hksy/@hksy.anm'],
    rationaleJa: 'hksy内でもチェッカー、複数色チェッカー、グリッド、直線は背景・解説UIとして使いやすく、Rust生成オブジェクトへ小さく切り出せる。'
  },
  {
    id: 'hksy-line',
    labelJa: 'hksy 直線',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@hksy/@hksy.obj', 'script/@hksy/@hksy.anm'],
    rationaleJa: 'hksyの直線表現を、既存Rustチェッカー/グリッド生成メディアの線のみプリセットとして標準搭載する。'
  },
  {
    id: 'hksy-multi-colour-checker',
    labelJa: 'hksy 複数色チェッカー',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@hksy/@hksy.obj', 'script/@hksy/@hksy.anm'],
    rationaleJa: 'hksyの複数色チェッカー表現を、Rust生成メディアのpalette付きタイル描画として標準搭載する。'
  },
  {
    id: 'hksy-diamond',
    labelJa: 'hksy 菱形',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@hksy/@hksy.obj'],
    rationaleJa: 'hksyの菱形カスタムオブジェクトを、透明背景のRust生成メディアとして標準搭載する。'
  },
  {
    id: 'hksy-measured-grid',
    labelJa: 'hksy グリッド',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@hksy/@hksy.obj'],
    rationaleJa: 'hksyの通常線と区切り線を持つグリッドを、Rust生成の解説背景素材として標準搭載する。'
  },
  {
    id: 'hksy-anchor-line',
    labelJa: 'hksy ライン（アンカー指定）',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/@hksy/@hksy.obj'],
    rationaleJa: 'hksyのアンカー指定ラインを、Rust生成の折れ線素材として標準搭載する。'
  },
  {
    id: '93-sphere-drawpixel',
    labelJa: '93 Sphere(DrawPixel)',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@Sphere.anm'],
    rationaleJa: 'ピクセルを球状点群へ並べる発想を、Rust生成の球状ドット素材として標準搭載する。'
  },
  {
    id: '93-spherical-field',
    labelJa: '93 SphericalField',
    category: 'generated-object',
    phase: 'P1',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/SphericalField.anm'],
    rationaleJa: '球状に押し出すフィールド表現を、Rust生成の力場可視化素材として標準搭載する。'
  },
  {
    id: 'particle-standard',
    labelJa: '標準パーティクル',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/パーティクル/@標準_particle_anime.anm', 'script/パーティクル/@particle_ri_ver3.anm'],
    rationaleJa: '演出力は高いが、決定的再生とGPU instancing設計が必要なのでP2に置く。'
  },
  {
    id: 'tim-aura-emission',
    labelJa: 'オーラ放出',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/オーラ放出.anm'],
    rationaleJa: '立ち絵の強調や演出背景に使いやすく、標準パーティクル基盤で近似しやすい。'
  },
  {
    id: 'tim-bubbles',
    labelJa: '泡',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/泡.obj'],
    rationaleJa: '水中・回想・柔らかい背景演出に使いやすく、標準パーティクル基盤で近似しやすい。'
  },
  {
    id: 'tim-focus-lines',
    labelJa: '集中線T',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/@集中線T.obj'],
    rationaleJa: '注目・ツッコミ・強調の演出で使いやすく、短寿命の高速粒子で近似しやすい。'
  },
  {
    id: 'tim-ink-splash',
    labelJa: 'インクTM',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/インクTM.obj'],
    rationaleJa: '黒い飛沫や汚し表現として使いやすく、標準パーティクル基盤で近似しやすい。'
  },
  {
    id: 'tim-barcode',
    labelJa: 'バーコードT',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/バーコードT.obj'],
    rationaleJa: '暗号化風UI、警告表示、データ演出に使いやすく、Rust側で決定的にラスタ生成できる。'
  },
  {
    id: 'tim-puzzle-piece',
    labelJa: 'パズルピース',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/パズルピース.obj'],
    rationaleJa: '分割・組み合わせ・ゲーム風演出で使いやすく、Rust側で透明背景付きラスタ生成できる。'
  },
  {
    id: 'tim-colour-wheel',
    labelJa: '色相環',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/色相環.obj'],
    rationaleJa: '色選びや解説演出に使いやすく、Rust側で透明背景付きHSVリングを決定的に生成できる。'
  },
  {
    id: 'tim-gourd',
    labelJa: 'ひょうたんTM',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/ひょうたんTM.obj'],
    rationaleJa: 'くびれ付きのシルエットや反復装飾として使いやすく、Rust側で透明背景付きラスタ生成できる。'
  },
  {
    id: 'tim-gear',
    labelJa: '歯車',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/歯車.anm'],
    rationaleJa: '機械風UIや回転演出の素材として使いやすく、Rust側で透明背景付き歯車ラスタを決定的に生成できる。'
  },
  {
    id: 'custom-track-bar',
    labelJa: 'カスタムトラックバー',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/カスタムトラックバー.obj'],
    rationaleJa: '動画内UIやパラメータ可視化に使いやすく、Rust側で4本の進捗バーを決定的に生成できる。'
  },
  {
    id: 'pie-sheet-graph',
    labelJa: 'パイシートグラフ',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/パイシートグラフ.obj'],
    rationaleJa: '割合表示や解説UIに使いやすく、Rust側でドーナツ状の円グラフを決定的に生成できる。'
  },
  {
    id: 'tim-simple-histogram',
    labelJa: '簡易ヒストグラム',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/簡易ヒストグラム.obj'],
    rationaleJa: '色・明度の分布を解説UIとして見せやすく、Rust側で複数チャンネルの棒グラフを決定的に生成できる。'
  },
  {
    id: 'tim-simple-tone-curve',
    labelJa: '簡易トーンカーブ',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/簡易トーンカーブ.obj'],
    rationaleJa: '明るさ補正の説明や調整UI演出に使いやすく、Rust側で透明背景付きのグリッドとカーブを決定的に生成できる。'
  },
  {
    id: 'ssd-sunburst',
    labelJa: '日の出',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/日の出.obj'],
    rationaleJa: '背景や強調演出に使いやすく、Rust側で放射状レイと中心モチーフを決定的に生成できる。'
  },
  {
    id: 'ssd-circular-arrow',
    labelJa: '円矢印',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/円矢印.obj'],
    rationaleJa: '注釈、循環、誘導表示に使いやすく、Rust側で透明背景付きの円弧と矢じりを決定的に生成できる。'
  },
  {
    id: 'ssd-triangle-bracket',
    labelJa: '三角括弧',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/三角括弧.obj'],
    rationaleJa: '注釈対象を挟む強調表示に使いやすく、Rust側で透明背景付きの斜線ブラケットを決定的に生成できる。'
  },
  {
    id: 'ssd-tartan-check',
    labelJa: 'タータンチェック',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/タータンチェック_ISTN.obj'],
    rationaleJa: '解説画面や背景素材に使いやすく、Rust側で不透明な格子パターンを決定的に生成できる。'
  },
  {
    id: 'ssd-houndstooth',
    labelJa: '千鳥格子',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/千鳥格子.obj'],
    rationaleJa: '背景素材や解説画面の装飾に使いやすく、Rust側で不透明な千鳥格子パターンを決定的に生成できる。'
  },
  {
    id: 'ssd-yagasuri',
    labelJa: '矢がすり',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/矢がすり.obj'],
    rationaleJa: '和柄背景や解説画面の装飾に使いやすく、Rust側で不透明な矢羽根パターンを決定的に生成できる。'
  },
  {
    id: 'ssd-paper-airplane',
    labelJa: '紙飛行機',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/紙飛行機.obj'],
    rationaleJa: '注釈や移動演出のモチーフとして使いやすく、Rust側で透明背景付きの紙飛行機形状を決定的に生成できる。'
  },
  {
    id: 'ssd-asanoha-pattern',
    labelJa: '麻の葉模様',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/麻の葉模様.obj'],
    rationaleJa: '和柄背景や装飾枠に使いやすく、Rust側で不透明な幾何学模様を決定的に生成できる。'
  },
  {
    id: 'ssd-focus-lines-plus',
    labelJa: '集中線plus',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/集中線plus.obj'],
    rationaleJa: 'ツッコミや注目演出に使いやすく、Rust側で透明背景付きの放射状ラインを決定的に生成できる。'
  },
  {
    id: 'ssd-random-line-ex',
    labelJa: 'ランダムラインEX',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/ランダムラインEX.obj'],
    rationaleJa: '不穏な背景やノイズ演出に使いやすく、Rust側で透明背景付きのランダム斜線を決定的に生成できる。'
  },
  {
    id: 'ssd-hologram',
    labelJa: 'ホログラム',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/ホログラム.obj'],
    rationaleJa: '近未来風の背景や強調演出に使いやすく、Rust側で不透明な斜めプリズム模様を決定的に生成できる。'
  },
  {
    id: 'ssd-protractor',
    labelJa: '分度器',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/分度器.obj'],
    rationaleJa: '角度説明や図形解説に使いやすく、Rust側で半円目盛りと測定角ラベルを決定的に生成できる。'
  },
  {
    id: 'ssd-shaking-polygon',
    labelJa: '多角形_震える',
    category: 'generated-object',
    phase: 'P2',
    implementationTarget: 'native-generated-object',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/ANM/ANM_ssd/多角形_震える.obj'],
    rationaleJa: '図形の強調や不安定な演出に使いやすく、Rust側で透明背景付きの揺れる多角形を決定的に生成できる。'
  },
  {
    id: 'tim-motion-path',
    labelJa: 'モーションパス',
    category: 'motion',
    phase: 'P2',
    implementationTarget: 'native-motion-preset',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: [
      'script/てぃむ/@モーションパスA-V2.anm',
      'script/てぃむ/@モーションパスB-V2.anm',
      'script/てぃむ/@モーションパスC.anm',
      'script/てぃむ/@モーションパスD.anm',
      'script/てぃむ/ベジェ軌道T.obj',
      'script/てぃむ/ベジェ軌道T.tra'
    ],
    rationaleJa: '既存キーフレーム基盤と接続できるが、タイムライン編集UIの追加が必要。'
  },
  {
    id: 'tim-wind-sway',
    labelJa: '風揺れT',
    category: 'motion',
    phase: 'P2',
    implementationTarget: 'native-motion-preset',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/てぃむ/風揺れT.anm'],
    rationaleJa: '立ち絵や字幕に軽い揺れを付けるボイロ動画向けの定番演出。'
  },
  {
    id: 'camera-target',
    labelJa: 'カメラ目標指定',
    category: 'camera',
    phase: 'P3',
    implementationTarget: 'native-camera-tool',
    bundlingMode: 'native-compatible-reimplementation',
    sourceRelativePaths: ['script/93/@カメラ目標指定.cam', 'script/てぃむ/オートターゲット.cam'],
    rationaleJa: '3D/カメラ制御の本格化後に効くため、先に2D効果を固める。'
  },
  {
    id: 'lua-script-runtime',
    labelJa: 'Luaスクリプト互換ランタイム',
    category: 'compatibility',
    phase: 'P3',
    implementationTarget: 'script-runtime-later',
    bundlingMode: 'metadata-only-reference',
    sourceRelativePaths: ['lua.txt', 'lua51.dll', 'script/**/*.lua'],
    rationaleJa: '互換性は高いが、安全性、性能、ライセンス確認の塊なのでネイティブ効果群の後で扱う。'
  }
];

export const getAviUtlPackV4InventorySummary = (): AviUtlPackV4InventorySummary => ({
  ...inventorySummary,
  fileCounts: { ...inventorySummary.fileCounts },
  notes: [...inventorySummary.notes]
});

export const resolveAviUtlPackV4FeatureCandidates = (): AviUtlPackFeatureCandidate[] =>
  candidates.map((candidate) => ({
    ...candidate,
    sourceRelativePaths: [...candidate.sourceRelativePaths]
  }));

export const getStandardAviUtlNativeEffectRoadmap = (): AviUtlPackFeatureCandidate[] =>
  resolveAviUtlPackV4FeatureCandidates()
    .filter((candidate) => candidate.implementationTarget !== 'script-runtime-later')
    .sort((left, right) => {
      const phaseOrder = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;
      const phaseDelta = phaseOrder[left.phase] - phaseOrder[right.phase];
      if (phaseDelta !== 0) return phaseDelta;
      return candidates.findIndex((candidate) => candidate.id === left.id)
        - candidates.findIndex((candidate) => candidate.id === right.id);
    });
