// 再生中のIPC発生源（選択デコレーション送信経路 vs. presentフレーム本体経路）を
// 切り分けるための計測オプションをパースするユーティリティである。
// UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK=1 のときのみ、
// 再生計測区間へ入る直前に選択をクリアする（既定値はfalseで従来どおりの挙動）。
export const parseClearSelectionBeforePlaybackOption = (env) => (
  env?.UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK === '1'
);

// nativePlaybackActive（ネイティブ再生クロック）がRunによって発火有無が分かれる
// 問題を切り分けるため、realistic-heavy-edit-e2eが実際に使ったRust backend
// バイナリのprofileを結果JSONへ記録する。UXFD_RUST_BACKEND_BIN未設定時は
// electron/main.tsがdebugビルドを優先して探索するため default-debug とする。
// CDPコマンド Emulation.setCPUThrottlingRate へ渡す倍率をUXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE
// から読む。1（既定値）はスロットリングなし、2は2倍遅く、4は4倍遅く……という
// Chromeの定義そのままである。
//
// 重要な制約: このAPIはrenderer processのmain threadのみを遅くする。Electron
// main process・Rust backendプロセス・GPUはまったく遅くならないため、
// 「遅い実機のシミュレーション」ではなく「renderer main threadの余裕度だけを
// 狙い撃ちで測る」ための限定的な手段である。詳しくは呼び出し側
// scripts/run-realistic-heavy-edit-e2e.mjs のコメントを参照。
//
// 受理範囲は 1 以上 20 以下とする。下限の1は「スロットリングなし」を表す
// CDP側の定義そのもの。上限の20はChrome DevTools Performanceパネルの
// 「Low-end mobile」プリセットに合わせた値であり、それを超えると
// renderer main threadが実用上ほぼ停止し計測として意味を持たなくなるため、
// 不正な巨大値をそのままCDPへ渡さないよう防御的に上限を設けている。
const CPU_THROTTLE_RATE_MIN = 1;
const CPU_THROTTLE_RATE_MAX = 20;

export const parseCpuThrottleRateOption = (env) => {
  const raw = env?.UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE;
  if (raw === undefined) return 1;
  const rate = Number(raw);
  if (
    !Number.isFinite(rate)
    || rate < CPU_THROTTLE_RATE_MIN
    || rate > CPU_THROTTLE_RATE_MAX
  ) {
    throw new Error(
      `UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE must be a number in [${CPU_THROTTLE_RATE_MIN}, ${CPU_THROTTLE_RATE_MAX}], got: ${JSON.stringify(raw)}`,
    );
  }
  return rate;
};

export const resolveRealisticHeavyEditRustBackendBinaryProfile = (rustBackendBinPath) => {
  if (!rustBackendBinPath) return 'default-debug';
  if (rustBackendBinPath.includes('/target/release/')) return 'release';
  if (rustBackendBinPath.includes('/target/debug/')) return 'debug';
  return 'default-debug';
};
