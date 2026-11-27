//! R3: `asanoha_pattern` kind の編集モデル正本。`src/types.ts` の
//! `AsanohaPatternObject` 固有部分 (`AsanohaPatternObjectFields`) が Rust
//! 側で定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::AsanohaPatternObjectFields;

#[test]
fn asanoha_pattern_object_fields_default_matches_existing_ui_defaults() {
    // asanohaPatternObjectFactory.ts の buildAviUtlAsanohaPatternObject が
    // 今日生成している既定値と一致させる。width/height は固定リテラル
    // (800x450) のためニュートラル化せずそのまま採用する。
    let defaults = AsanohaPatternObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.pattern_size, 50.0);
    assert_eq!(defaults.line_width, 2.0);
    assert_eq!(defaults.foreground_colour, "#000000");
    assert_eq!(defaults.background_colour, "#ffffff");
}

#[test]
fn asanoha_pattern_object_fields_serialise_with_camel_case_field_names() {
    let fields = AsanohaPatternObjectFields {
        width: 900.0,
        height: 500.0,
        pattern_size: 60.0,
        line_width: 3.0,
        foreground_colour: "#111111".to_string(),
        background_colour: "#222222".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("AsanohaPatternObjectFields must serialise");

    assert_eq!(value["patternSize"], 60.0);
    assert_eq!(value["lineWidth"], 3.0);
    assert_eq!(value["foregroundColour"], "#111111");
    assert_eq!(value["backgroundColour"], "#222222");
    assert!(value.get("pattern_size").is_none());
}
