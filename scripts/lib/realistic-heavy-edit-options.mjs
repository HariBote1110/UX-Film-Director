// 再生中のIPC発生源（選択デコレーション送信経路 vs. presentフレーム本体経路）を
// 切り分けるための計測オプションをパースするユーティリティである。
// UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK=1 のときのみ、
// 再生計測区間へ入る直前に選択をクリアする（既定値はfalseで従来どおりの挙動）。
export const parseClearSelectionBeforePlaybackOption = (env) => (
  env?.UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK === '1'
);
