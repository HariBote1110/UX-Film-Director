//! `.uxfd.json` プロジェクトファイルの読み書き（V1/V2 判定・移行）。
//!
//! `src/utils/projectFile.ts` の `openProjectFileWithDialog` /
//! `parseProjectPayloadV2` / `migrateV1ToV2` に対応する Rust 側の
//! 純粋関数群。IPC・ファイル I/O は含まない（R4-2 以降の範囲）。

use crate::schema::{ProjectFile, ProjectFileVersioned};

/// JSON 文字列を V1/V2 いずれかとして解釈し、V1 なら V2 へ移行した
/// `ProjectFile` を返す。
pub fn project_file_from_json(json: &str) -> Result<ProjectFile, String> {
    let versioned: ProjectFileVersioned =
        serde_json::from_str(json).map_err(|err| format!("プロジェクトファイルの解析に失敗しました: {err}"))?;
    Ok(match versioned {
        ProjectFileVersioned::V2(project) => project,
        ProjectFileVersioned::V1(v1) => ProjectFile::from(v1),
    })
}

/// `ProjectFile` を構造化された `serde_json::Value` に変換する。
/// 整形（pretty print）は TS 側の責務のため、ここでは構造のみを返す。
pub fn project_file_to_json_value(project: &ProjectFile) -> serde_json::Value {
    serde_json::to_value(project).expect("ProjectFile の serde_json::Value 変換に失敗しました")
}
