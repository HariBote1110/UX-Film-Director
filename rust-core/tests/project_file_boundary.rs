//! `project_file_from_json` の境界値検証と、直列化の数値精度に関するテスト。
//!
//! - `format`/`version` の不正値・不正 JSON を明示的に拒否すること
//!   （`src/utils/projectFile.ts` の `parseProjectPayloadV2` のエラー意味論を移植）。
//! - `project_file_to_json_string`/`project_file_to_json_pretty` は
//!   `serde_json::Value` 経由（f64 に一度拡大される）ではなく
//!   `ProjectFile` の構造体から直接文字列化するため、f32 の最短表現
//!   （ryu）がそのまま出力されること（例: `1.03` が `1.0299999713897705`
//!   に化けない）。

use std::fs;
use std::path::Path;

use uxfd_rust_core::project_file::{
    project_file_from_json, project_file_to_json_pretty, project_file_to_json_string,
};

const FIXTURES_DIR: &str = "tests/fixtures/uxfd";

fn read_fixture(name: &str) -> String {
    let path = Path::new(FIXTURES_DIR).join(name);
    fs::read_to_string(&path).unwrap_or_else(|err| panic!("フィクスチャの読込に失敗: {path:?}: {err}"))
}

#[test]
fn rejects_wrong_format_string() {
    let json = r#"{
        "format": "not-uxfd-project",
        "version": 2,
        "savedAt": "2026-01-01T00:00:00.000Z",
        "projectSettings": {"width": 1920, "height": 1080, "fps": 30, "sampleRate": 48000},
        "activeSceneId": "scene-1",
        "scenes": []
    }"#;
    let err = project_file_from_json(json).expect_err("不正な format は拒否されるべき");
    assert_eq!(err, "対応していないプロジェクトファイル形式です。");
}

#[test]
fn rejects_unsupported_version() {
    let json = r#"{
        "format": "uxfd-project",
        "version": 999,
        "savedAt": "2026-01-01T00:00:00.000Z",
        "projectSettings": {"width": 1920, "height": 1080, "fps": 30, "sampleRate": 48000},
        "activeSceneId": "scene-1",
        "scenes": []
    }"#;
    let err = project_file_from_json(json).expect_err("非対応 version は拒否されるべき");
    assert_eq!(err, "対応していないプロジェクトファイル形式です。");
}

#[test]
fn rejects_malformed_json() {
    let json = "{ this is not valid json";
    let err = project_file_from_json(json).expect_err("壊れた JSON は拒否されるべき");
    assert!(
        err.contains("JSON"),
        "malformed JSON のエラーメッセージに JSON 解析失敗の旨が含まれるべき: {err}"
    );
}

#[test]
fn rejects_missing_format_field() {
    let json = r#"{"version": 2}"#;
    let err = project_file_from_json(json).expect_err("format 欠損は拒否されるべき");
    assert_eq!(err, "対応していないプロジェクトファイル形式です。");
}

#[test]
fn accepts_v1_and_migrates() {
    let json = read_fixture("legacy-v1-sample.uxfd.json");
    let migrated = project_file_from_json(&json).expect("V1 フィクスチャは受理・移行されるべき");
    assert_eq!(migrated.format, "uxfd-project");
    assert_eq!(migrated.version, 2);
}

#[test]
fn to_json_string_preserves_shortest_f32_literal() {
    let json = read_fixture("realistic-heavy-edit-v2.uxfd.json");
    let project = project_file_from_json(&json).expect("V2 フィクスチャの解析に失敗");

    let compact = project_file_to_json_string(&project);
    assert!(
        compact.contains("1.03"),
        "ryu の最短表現で 1.03 がそのまま出力されるべき（f64 拡大による 1.0299999713897705 化を検出）"
    );
    assert!(
        !compact.contains("1.0299999"),
        "f64 拡大由来の丸め誤差が出力に含まれてはならない"
    );

    // 再パースして意味的に同じ値を持つことも確認する。
    let reparsed = project_file_from_json(&compact).expect("直列化結果の再解析に失敗");
    assert_eq!(project, reparsed);
}

#[test]
fn to_json_pretty_preserves_shortest_f32_literal_and_is_two_space_indented() {
    let json = read_fixture("realistic-heavy-edit-v2.uxfd.json");
    let project = project_file_from_json(&json).expect("V2 フィクスチャの解析に失敗");

    let pretty = project_file_to_json_pretty(&project);
    assert!(pretty.contains("1.03"));
    assert!(!pretty.contains("1.0299999"));
    // JSON.stringify(x, null, 2) 相当のインデント（"format": のようなキーの前に
    // スペース2つ）になっていることを確認する。
    assert!(pretty.contains("\n  \""), "2 スペースインデントであるべき");

    let reparsed = project_file_from_json(&pretty).expect("pretty 直列化結果の再解析に失敗");
    assert_eq!(project, reparsed);
}
