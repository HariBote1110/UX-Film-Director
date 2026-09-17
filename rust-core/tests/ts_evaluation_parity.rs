//! TS 側の評価（`src/utils/rustSceneSnapshot.ts`）と rust-core の評価
//! （`timeline::evaluate_frame`）が、同じ project・同じ frame index に対して
//! 同じ結果を返すかを比較する。
//!
//! 現在この 2 つは別実装で、同じ「評価済みシーン」を作る経路が 2 本走っている
//! （`markdown/Rust_Source_Of_Truth_Plan.md` §1.2）。R2 で経路 B を消すまでの間、
//! このテストが差分の見張りになる。
//!
//! fixture は TS 側が生成する。再生成:
//!
//! ```sh
//! npm run fixture:evaluation-parity
//! ```

mod common;

use common::{compare_fixtures, fixture_dir, load_fixtures};

#[test]
fn ts_and_rust_core_evaluate_the_same_scene_identically() {
    let fixtures = load_fixtures();
    assert!(
        !fixtures.is_empty(),
        "fixture が 1 件も無い。`npm run fixture:evaluation-parity` で生成する ({})",
        fixture_dir().display()
    );

    let summary = compare_fixtures(&fixtures, |fixture| fixture.project.clone());
    summary.print();
    summary.assert_matches_known_differences("TS 評価と rust-core 評価");
}
