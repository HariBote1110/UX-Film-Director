use serde_json::json;

use crate::generated::list_font_families;
use crate::rpc::{response_error, RpcResponse};

/// インストール済みフォントファミリー一覧を返す `fonts.list` RPC ハンドラ。
///
/// テキストのラスタライズに使う `FontSystem` を再利用して列挙するため、
/// ここで返る候補は必ずレンダラー側で解決できる（＝UI がラスタライザに
/// 存在しないフォントを提示することはない）。
pub(crate) fn handle_fonts_list(id: u64) -> RpcResponse {
    match list_font_families() {
        Ok(families) => RpcResponse {
            id,
            ok: true,
            result: Some(json!({ "families": families })),
            error: None,
        },
        Err(message) => response_error(id, -32040, &format!("Failed to list fonts: {message}")),
    }
}

#[cfg(test)]
mod tests {
    use super::handle_fonts_list;

    #[test]
    #[cfg(target_os = "macos")]
    fn handle_fonts_list_returns_ok_with_sorted_deduplicated_family_array() {
        let response = handle_fonts_list(1);
        assert!(response.ok, "expected fonts.list to succeed");
        let result = response.result.expect("result should be present");
        let families = result["families"]
            .as_array()
            .expect("families should be an array");
        assert!(
            !families.is_empty(),
            "expected at least one installed font family on macOS"
        );

        let names: Vec<String> = families
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .expect("family name should be a string")
                    .to_string()
            })
            .collect();

        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted, "families must be returned in sorted order");

        let mut deduped = names.clone();
        deduped.dedup();
        assert_eq!(
            names.len(),
            deduped.len(),
            "families must not contain duplicates"
        );
    }
}
