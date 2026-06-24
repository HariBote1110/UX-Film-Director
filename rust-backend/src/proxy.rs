use serde::Deserialize;
use serde_json::{json, Value};
use std::process::{Command, Stdio};

use crate::rpc::{response_error, RpcResponse};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyGenerateParams {
    input_path: String,
    output_path: String,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    ffmpeg_path: Option<String>,
}

/// プロキシ生成に使う動画コーデック。GPU を優先し、失敗時に CPU へフォールバックする。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProxyCodec {
    /// macOS の VideoToolbox を用いた GPU エンコード。
    VideotoolboxGpu,
    /// libx264 を用いた CPU エンコード（フォールバック・非 macOS 既定）。
    Libx264Cpu,
}

/// この環境で優先すべきコーデックを返す。macOS では GPU を優先する。
fn preferred_codec() -> ProxyCodec {
    if cfg!(target_os = "macos") {
        ProxyCodec::VideotoolboxGpu
    } else {
        ProxyCodec::Libx264Cpu
    }
}

/// 指定コーデックでの ffmpeg 引数を組み立てる。
///
/// いずれも全 I フレーム（`-g 1`）でスクラブ時の高速シークを担保しつつ、
/// GPU 経路では `-hwaccel videotoolbox` でデコードも GPU に逃がす。
fn build_proxy_args(
    input_path: &str,
    output_path: &str,
    scale_filter: &str,
    codec: ProxyCodec,
) -> Vec<String> {
    let mut args: Vec<String> = vec!["-y".to_string()];

    // デコードのハードウェアアクセラレーション（入力指定より前に置く必要がある）。
    if codec == ProxyCodec::VideotoolboxGpu {
        args.push("-hwaccel".to_string());
        args.push("videotoolbox".to_string());
    }

    args.push("-i".to_string());
    args.push(input_path.to_string());
    args.push("-vf".to_string());
    args.push(scale_filter.to_string());

    match codec {
        ProxyCodec::VideotoolboxGpu => {
            args.push("-c:v".to_string());
            args.push("h264_videotoolbox".to_string());
            // VideoToolbox は CRF 非対応のため固定品質（1-100, 高いほど高品質）を使う。
            args.push("-q:v".to_string());
            args.push("50".to_string());
            args.push("-g".to_string());
            args.push("1".to_string());
            args.push("-keyint_min".to_string());
            args.push("1".to_string());
        }
        ProxyCodec::Libx264Cpu => {
            args.push("-c:v".to_string());
            args.push("libx264".to_string());
            args.push("-preset".to_string());
            args.push("fast".to_string());
            args.push("-crf".to_string());
            args.push("28".to_string());
            args.push("-g".to_string());
            args.push("1".to_string());
            args.push("-keyint_min".to_string());
            args.push("1".to_string());
            args.push("-sc_threshold".to_string());
            args.push("0".to_string());
        }
    }

    args.push("-an".to_string());
    args.push("-movflags".to_string());
    args.push("+faststart".to_string());
    args.push(output_path.to_string());

    args
}

/// 指定コーデックで ffmpeg を実行し、成功したかどうかを返す。
fn run_ffmpeg(ffmpeg_path: &str, args: &[String]) -> Result<bool, String> {
    let status = Command::new(ffmpeg_path)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    match status {
        Ok(s) => Ok(s.success()),
        Err(e) => Err(format!("Failed to start ffmpeg: {e}")),
    }
}

pub(crate) fn handle_proxy_generate(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<ProxyGenerateParams>(params) {
        Ok(v) => v,
        Err(e) => {
            return response_error(id, -32602, &format!("Invalid proxy.generate params: {e}"));
        }
    };

    let ffmpeg_path = parsed
        .ffmpeg_path
        .or_else(|| std::env::var("UXFD_FFMPEG_BIN").ok())
        .unwrap_or_else(|| "ffmpeg".to_string());

    // scale: 指定幅に合わせ高さは偶数を保ちアスペクト維持
    let width = parsed.width.unwrap_or(1280);
    let scale_filter = format!("scale={}:-2", width);

    // GPU を優先しつつ、失敗した場合は CPU（libx264）にフォールバックする。
    let primary = preferred_codec();
    let mut attempts: Vec<ProxyCodec> = vec![primary];
    if primary != ProxyCodec::Libx264Cpu {
        attempts.push(ProxyCodec::Libx264Cpu);
    }

    let mut last_error: Option<String> = None;
    for codec in attempts {
        let args = build_proxy_args(&parsed.input_path, &parsed.output_path, &scale_filter, codec);
        match run_ffmpeg(&ffmpeg_path, &args) {
            Ok(true) => {
                return RpcResponse {
                    id,
                    ok: true,
                    result: Some(json!({
                        "outputPath": parsed.output_path,
                        "codec": match codec {
                            ProxyCodec::VideotoolboxGpu => "h264_videotoolbox",
                            ProxyCodec::Libx264Cpu => "libx264",
                        },
                    })),
                    error: None,
                };
            }
            Ok(false) => {
                last_error = Some(format!("ffmpeg exited with a non-zero status ({codec:?})"));
            }
            Err(e) => {
                last_error = Some(e);
            }
        }
    }

    response_error(
        id,
        -32007,
        &last_error.unwrap_or_else(|| "ffmpeg failed to generate proxy".to_string()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gpu_args_use_videotoolbox_hwaccel_and_encoder() {
        let args = build_proxy_args(
            "/clips/source.mp4",
            "/clips/source.proxy.mp4",
            "scale=640:-2",
            ProxyCodec::VideotoolboxGpu,
        );

        // デコードの hwaccel が入力より前に置かれていること
        let hwaccel_idx = args.iter().position(|a| a == "-hwaccel").expect("hwaccel flag");
        let input_idx = args.iter().position(|a| a == "-i").expect("input flag");
        assert!(hwaccel_idx < input_idx, "hwaccel must precede input");
        assert_eq!(args[hwaccel_idx + 1], "videotoolbox");

        // GPU エンコーダと固定品質が使われ、CRF は使われないこと
        assert!(args.iter().any(|a| a == "h264_videotoolbox"));
        assert!(args.iter().any(|a| a == "-q:v"));
        assert!(!args.iter().any(|a| a == "-crf"));

        // 全 I フレーム設定が維持されていること
        assert!(args.windows(2).any(|w| w[0] == "-g" && w[1] == "1"));
    }

    #[test]
    fn cpu_args_use_libx264_with_crf_and_no_hwaccel() {
        let args = build_proxy_args(
            "/clips/source.mp4",
            "/clips/source.proxy.mp4",
            "scale=640:-2",
            ProxyCodec::Libx264Cpu,
        );

        assert!(!args.iter().any(|a| a == "-hwaccel"), "CPU path must not request hwaccel");
        assert!(args.iter().any(|a| a == "libx264"));
        assert!(args.windows(2).any(|w| w[0] == "-crf" && w[1] == "28"));
        assert!(args.windows(2).any(|w| w[0] == "-g" && w[1] == "1"));
    }

    #[test]
    fn both_paths_disable_audio_and_target_output_last() {
        for codec in [ProxyCodec::VideotoolboxGpu, ProxyCodec::Libx264Cpu] {
            let args = build_proxy_args("in.mp4", "out.proxy.mp4", "scale=640:-2", codec);
            assert!(args.iter().any(|a| a == "-an"), "audio must be disabled");
            assert_eq!(args.last().map(String::as_str), Some("out.proxy.mp4"));
        }
    }
}
