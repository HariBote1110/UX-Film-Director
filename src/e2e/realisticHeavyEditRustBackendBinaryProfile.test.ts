import { describe, expect, it } from 'vitest';

// nativePlaybackActive がRunによって発火有無が分かれる問題を切り分けるため、
// realistic-heavy-edit-e2e が実際にどのRust backendバイナリ（release/debug/
// デフォルトdebug）を使って起動したかを結果JSONへ記録できるようにする。
// パス文字列からprofileを判定する純粋関数として切り出し、単体テストで契約を固定する。
describe('resolveRealisticHeavyEditRustBackendBinaryProfile', () => {
  it('UXFD_RUST_BACKEND_BIN が未設定（null）なら default-debug を返す', async () => {
    const { resolveRealisticHeavyEditRustBackendBinaryProfile } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(resolveRealisticHeavyEditRustBackendBinaryProfile(null)).toBe('default-debug');
  });

  it('パスに /target/release/ を含むなら release を返す', async () => {
    const { resolveRealisticHeavyEditRustBackendBinaryProfile } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(resolveRealisticHeavyEditRustBackendBinaryProfile(
      '/Users/yuki/GitHub/UX-Film-Director/rust-backend/target/release/uxfd_rust_backend',
    )).toBe('release');
  });

  it('パスに /target/debug/ を含むなら debug を返す', async () => {
    const { resolveRealisticHeavyEditRustBackendBinaryProfile } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(resolveRealisticHeavyEditRustBackendBinaryProfile(
      '/Users/yuki/GitHub/UX-Film-Director/rust-backend/target/debug/uxfd_rust_backend',
    )).toBe('debug');
  });

  it('release/debug のどちらでもないパスなら default-debug を返す', async () => {
    const { resolveRealisticHeavyEditRustBackendBinaryProfile } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(resolveRealisticHeavyEditRustBackendBinaryProfile(
      '/opt/custom/uxfd_rust_backend',
    )).toBe('default-debug');
  });
});
