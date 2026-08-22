//! R3: `houndstooth` kind の編集モデル正本。`src/types.ts` の
//! `HoundstoothObject` 固有部分 (`HoundstoothObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::HoundstoothObjectFields;

#[test]
fn houndstooth_object_fields_default_matches_existing_ui_defaults() {
    // houndstoothObjectFactory.ts の buildAviUtlHoundstoothObject が今日
    // 生成している既定値と一致させる。width/height は固定リテラル
    // (800x450) のためニュートラル化せずそのまま採用する。
    let defaults = HoundstoothObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.pattern_size, 50.0);
    assert_eq!(defaults.foreground_colour, "#000000");
    assert_eq!(defaults.background_colour, "#ffffff");
}

#[test]
fn houndstooth_object_fields_serialise_with_camel_case_field_names() {
    let fields = HoundstoothObjectFields {
        width: 820.0,
        height: 460.0,
        pattern_size: 60.0,
        foreground_colour: "#111111".to_string(),
        background_colour: "#222222".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("HoundstoothObjectFields must serialise");

    assert_eq!(value["patternSize"], 60.0);
    assert_eq!(value["foregroundColour"], "#111111");
    assert_eq!(value["backgroundColour"], "#222222");
    assert!(value.get("pattern_size").is_none());
}
