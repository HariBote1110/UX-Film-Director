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
