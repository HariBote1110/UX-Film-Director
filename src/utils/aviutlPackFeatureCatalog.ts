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
