//! `.uxfd.json` プロジェクトファイルの読み書き（V1/V2 判定・移行）。
//!
//! `src/utils/projectFile.ts` の `openProjectFileWithDialog` /
//! `parseProjectPayloadV2` / `migrateV1ToV2` に対応する Rust 側の
//! 純粋関数群。IPC・ファイル I/O は含まない（R4-2 以降の範囲）。

use crate::schema::{ProjectFile, ProjectFileV1, PROJECT_FILE_FORMAT};

const PROJECT_FILE_VERSION_V1: u64 = 1;
const PROJECT_FILE_VERSION_V2: u64 = 2;

const UNSUPPORTED_FORMAT_MESSAGE: &str = "対応していないプロジェクトファイル形式です。";

/// JSON 文字列を V1/V2 いずれかとして解釈し、V1 なら V2 へ移行した
/// `ProjectFile` を返す。
///
/// `format`/`version` の妥当性検証は `src/utils/projectFile.ts` の
/// `parseProjectPayloadV2`/`parseProjectPayload`（V1/V2 分岐）のエラー
/// 意味論をそのまま移植している。Rust の `ProjectFile.format`/`version`
/// は素の `String`/`u32`（TS 側の型リテラル `'uxfd-project'`/`1 | 2`
/// 相当のリテラル制約を型では表現できない）なので、この関数がその
/// リテラル値チェックを担う唯一の場所になる。
pub fn project_file_from_json(json: &str) -> Result<ProjectFile, String> {
    let value: serde_json::Value = serde_json::from_str(json)
        .map_err(|err| format!("プロジェクトファイルの JSON 解析に失敗しました: {err}"))?;

    let format = value.get("format").and_then(|v| v.as_str());
    if format != Some(PROJECT_FILE_FORMAT) {
        return Err(UNSUPPORTED_FORMAT_MESSAGE.to_string());
    }

    let version = value.get("version").and_then(|v| v.as_u64());
    match version {
        Some(PROJECT_FILE_VERSION_V1) => {
            let v1: ProjectFileV1 = serde_json::from_value(value)
                .map_err(|err| format!("プロジェクトファイルの解析に失敗しました: {err}"))?;
            Ok(ProjectFile::from(v1))
        }
        Some(PROJECT_FILE_VERSION_V2) => {
            let v2: ProjectFile = serde_json::from_value(value)
                .map_err(|err| format!("プロジェクトファイルの解析に失敗しました: {err}"))?;
            Ok(v2)
        }
        _ => Err(UNSUPPORTED_FORMAT_MESSAGE.to_string()),
    }
}

/// `ProjectFile` を構造化された `serde_json::Value` に変換する。
///
/// **注意: この関数はテストの構造比較専用。** `serde_json::Value` は
/// 数値を `f64` として保持するため、`f32` フィールドを一度 `Value` に
/// 通すと丸め誤差が広がる（例: `1.03_f32` が
/// `1.0299999713897705` として観測される）。ディスクへ書き出す実際の
/// JSON 文字列は必ず `project_file_to_json_string`/
/// `project_file_to_json_pretty`（`ProjectFile` から直接文字列化する
/// パス）を使うこと。
pub fn project_file_to_json_value(project: &ProjectFile) -> serde_json::Value {
    serde_json::to_value(project).expect("ProjectFile の serde_json::Value 変換に失敗しました")
}

/// `ProjectFile` を構造体から直接 JSON 文字列へ変換する（compact）。
///
/// `serde_json::Value` を経由しない直接パスのため、`f32` フィールドは
/// serde_json 内蔵の ryu（最短往復表現）でそのまま文字列化される。
/// `serde_json::Value` 経由（`project_file_to_json_value` → `to_string`）
/// だと f32→f64 拡大により `1.03` が `1.0299999713897705` に化けるが、
/// この関数はその劣化を起こさない。
pub fn project_file_to_json_string(project: &ProjectFile) -> String {
    serde_json::to_string(project).expect("ProjectFile の JSON 文字列変換に失敗しました")
}

/// `ProjectFile` を構造体から直接 pretty-print JSON 文字列へ変換する。
///
/// `serde_json::to_string_pretty` の既定インデントは 2 スペースであり、
/// TS 側の保存処理（`src/utils/projectFile.ts` の
/// `JSON.stringify(projectFile, null, 2)`）と同じ体裁になる。数値精度に
/// 関する注意は `project_file_to_json_string` と同じ。
pub fn project_file_to_json_pretty(project: &ProjectFile) -> String {
    serde_json::to_string_pretty(project).expect("ProjectFile の pretty JSON 文字列変換に失敗しました")
}
