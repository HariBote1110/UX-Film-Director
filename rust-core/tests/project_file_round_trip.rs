//! `.uxfd.json` プロジェクトファイル（`ProjectFile`）のラウンドトリップ検証。
//!
//! - 実プロジェクトファイル（V2）を deserialize → serialize → deserialize して
//!   構造的に一致すること。
//! - serialize(deserialize(x)) の `serde_json::Value` が元の `Value` と
//!   意味的に一致すること（キー順は無視するが、フィールドの有無/null は
//!   区別する）。フィールドが消失/出現した場合はスキーマの不備なので、
//!   型定義側を直す（テストを緩めない）。
//! - V1 フィクスチャが V2 へ移行され、再読込しても安定すること。

use std::fs;
use std::path::Path;

use serde_json::Value;
use uxfd_rust_core::project_file::{project_file_from_json, project_file_to_json_value};
use uxfd_rust_core::schema::ProjectFile;

const FIXTURES_DIR: &str = "tests/fixtures/uxfd";

fn read_fixture(name: &str) -> String {
    let path = Path::new(FIXTURES_DIR).join(name);
    fs::read_to_string(&path).unwrap_or_else(|err| panic!("フィクスチャの読込に失敗: {path:?}: {err}"))
}

fn v2_fixture_names() -> Vec<&'static str> {
    vec![
        "realistic-heavy-edit-v2.uxfd.json",
        "realistic-heavy-edit-pre-change-v2.uxfd.json",
    ]
}

#[test]
fn v2_fixtures_round_trip_structurally() {
    for name in v2_fixture_names() {
        let json = read_fixture(name);
        let project: ProjectFile =
            project_file_from_json(&json).unwrap_or_else(|err| panic!("{name} の解析に失敗: {err}"));

        let encoded =
            serde_json::to_string(&project).unwrap_or_else(|err| panic!("{name} の再直列化に失敗: {err}"));
        let reparsed: ProjectFile = serde_json::from_str(&encoded)
            .unwrap_or_else(|err| panic!("{name} の再直列化結果の再解析に失敗: {err}"));

        assert_eq!(
            project, reparsed,
            "{name}: deserialize→serialize→deserialize で構造が変化した"
        );
    }
}

/// `original` と `round_tripped` が「意味的に一致」することを検証する。
///
/// `rust-core/src/schema.rs` の TimelineObject 系フィールドは（R4-1a 以前から
/// 続く既存方針として）すべて `f32` で表現されている。実プロジェクト
/// フィクスチャの JSON 数値リテラル（f64 精度）はこの f32 往復で最終桁が
/// 丸められる（例: `1.03` → `1.0299999713897705`）ため、数値は
/// 「f32 精度としての近似一致」を semantically-equal の基準とする。
/// これはビット等価ではないが、キーの有無・null・配列長・型の一致は
/// 厳密に検証しており、「フィールドの消失/出現」というテスト本来の目的
/// （型定義側の欠陥検出）は損なわれない。
fn assert_semantically_equal(original: &Value, round_tripped: &Value, path: &str) {
    match (original, round_tripped) {
        (Value::Object(a), Value::Object(b)) => {
            let mut a_keys: Vec<_> = a.keys().collect();
            let mut b_keys: Vec<_> = b.keys().collect();
            a_keys.sort();
            b_keys.sort();
            assert_eq!(
                a_keys, b_keys,
                "{path}: オブジェクトのキー集合が一致しない（フィールドの消失/出現）"
            );
            for key in a.keys() {
                assert_semantically_equal(&a[key], &b[key], &format!("{path}.{key}"));
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{path}: 配列長が一致しない");
            for (i, (av, bv)) in a.iter().zip(b.iter()).enumerate() {
                assert_semantically_equal(av, bv, &format!("{path}[{i}]"));
            }
        }
        (Value::Number(a), Value::Number(b)) => {
            let (fa, fb) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            let diff = (fa as f32 - fb as f32).abs();
            let tolerance = (fa.abs() as f32) * 1e-6 + 1e-4;
            assert!(
                diff <= tolerance,
                "{path}: 数値が f32 精度でも一致しない: {fa} vs {fb}"
            );
        }
        _ => {
            assert_eq!(original, round_tripped, "{path}: 値が一致しない");
        }
    }
}

#[test]
fn v2_fixtures_serialise_to_semantically_equal_json_value() {
    for name in v2_fixture_names() {
        let json = read_fixture(name);
        let original: Value =
            serde_json::from_str(&json).unwrap_or_else(|err| panic!("{name} の Value 解析に失敗: {err}"));

        let project: ProjectFile =
            project_file_from_json(&json).unwrap_or_else(|err| panic!("{name} の解析に失敗: {err}"));
        let round_tripped = project_file_to_json_value(&project);

        assert_semantically_equal(&original, &round_tripped, name);
    }
}

#[test]
fn v1_fixture_migrates_to_v2_and_is_stable_on_reread() {
    let json = read_fixture("legacy-v1-sample.uxfd.json");
    let migrated =
        project_file_from_json(&json).unwrap_or_else(|err| panic!("V1 フィクスチャの移行に失敗: {err}"));

    assert_eq!(migrated.format, "uxfd-project");
    assert_eq!(migrated.version, 2);
    assert_eq!(migrated.active_scene_id, "legacy-scene-1");
    assert_eq!(migrated.scenes.len(), 1);
    assert_eq!(migrated.scenes[0].id, "legacy-scene-1");
    assert_eq!(migrated.scenes[0].name, "Scene 1");
    assert_eq!(migrated.scenes[0].objects.len(), 3);

    // 移行後の V2 を再度 JSON にして読み直しても安定していること。
    let encoded = serde_json::to_string(&migrated).expect("移行後 ProjectFile の直列化に失敗");
    let reread = project_file_from_json(&encoded).expect("移行後 JSON の再読込に失敗");
    assert_eq!(migrated, reread);

    // 再読込した JSON はすでに V2 なので、二重移行は発生しない
    // （scenes の id/objects がそのまま維持される）。
    assert_eq!(reread.scenes[0].id, "legacy-scene-1");
    assert_eq!(reread.scenes[0].objects.len(), 3);
}

#[test]
fn v1_fixture_defaults_layers_when_absent() {
    let json = read_fixture("legacy-v1-sample.uxfd.json");
    let mut value: Value = serde_json::from_str(&json).expect("V1 フィクスチャの Value 解析に失敗");
    value
        .as_object_mut()
        .expect("V1 フィクスチャはオブジェクトである")
        .remove("layers");
    let json_without_layers = serde_json::to_string(&value).expect("layers 除去後の再直列化に失敗");

    let migrated = project_file_from_json(&json_without_layers)
        .expect("layers を欠いた V1 フィクスチャの移行に失敗");

    assert_eq!(migrated.scenes[0].layers.len(), 100, "MAX_LAYERS 分のデフォルトlayersが補完されること");
    assert!(migrated.scenes[0].layers.iter().all(|l| l.visible && !l.locked));
}
