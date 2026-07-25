import { describe, expect, it } from 'vitest';

// 再生中のメインスレッドIPC（Receive mojo reply）の発生源を切り分けるための
// 計測専用オプションである。選択デコレーション送信経路とpresentフレーム本体
// 経路のどちらが主因かを実験的に確定させるため、環境変数で再生直前の選択
// クリアを制御できるようにする。既定値はfalseで、従来どおり選択を維持する。
describe('realistic-heavy-edit-e2e の選択クリアオプションのパース', () => {
  it('UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK が未設定なら既定でfalseを返す', async () => {
    const { parseClearSelectionBeforePlaybackOption } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(parseClearSelectionBeforePlaybackOption({})).toBe(false);
    expect(parseClearSelectionBeforePlaybackOption(undefined)).toBe(false);
  });

  it('値が "1" のときのみtrueを返す', async () => {
    const { parseClearSelectionBeforePlaybackOption } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(parseClearSelectionBeforePlaybackOption({
      UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK: '1',
    })).toBe(true);
    expect(parseClearSelectionBeforePlaybackOption({
      UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK: 'true',
    })).toBe(false);
    expect(parseClearSelectionBeforePlaybackOption({
      UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK: '0',
    })).toBe(false);
  });
});
