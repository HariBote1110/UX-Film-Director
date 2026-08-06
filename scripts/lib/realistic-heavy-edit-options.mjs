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
export const resolveRealisticHeavyEditRustBackendBinaryProfile = (rustBackendBinPath) => {
  if (!rustBackendBinPath) return 'default-debug';
  if (rustBackendBinPath.includes('/target/release/')) return 'release';
  if (rustBackendBinPath.includes('/target/debug/')) return 'debug';
  return 'default-debug';
};
