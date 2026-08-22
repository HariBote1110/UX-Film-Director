//! `npm run agent:validate` の実体。エージェント用プロジェクトレシピ
//! （JSON ファイルパス、または引数省略時は標準入力）を
//! `parse_agent_project_spec` で検証し、結果を終了コードで返す薄い CLI。
//!
//! `scripts/validate-agent-project.mts`（Node 側の薄いラッパ）から
//! 呼ばれる。検証ロジック自体は一切持たない — 唯一の正は
//! `rust-core::agent_project::parse_agent_project_spec`。

use std::env;
use std::fs;
use std::io::{self, Read};
use std::process::ExitCode;

use uxfd_rust_core::agent_project::parse_agent_project_spec;

fn read_input(path: Option<&str>) -> Result<String, String> {
    match path {
        Some(path) => fs::read_to_string(path).map_err(|err| format!("ファイルが見つかりません: {path} ({err})")),
        None => {
            let mut buffer = String::new();
            io::stdin()
                .read_to_string(&mut buffer)
                .map_err(|err| format!("標準入力の読み込みに失敗しました: {err}"))?;
            Ok(buffer)
        }
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let path = args.first().map(String::as_str);

    let json = match read_input(path) {
        Ok(json) => json,
        Err(message) => {
            eprintln!("[agent-project] NG: {message}");
            return ExitCode::FAILURE;
        }
    };

    match parse_agent_project_spec(&json) {
        Ok(spec) => {
            println!(
                "[agent-project] OK: {} layers / {} objects / {}s @ {}fps",
                spec.layers.len(),
                spec.objects.len(),
                spec.project.duration,
                spec.project.fps
            );
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("[agent-project] NG: {message}");
            ExitCode::FAILURE
        }
    }
}
