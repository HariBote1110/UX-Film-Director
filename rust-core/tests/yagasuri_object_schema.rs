//! R3: `yagasuri` kind の編集モデル正本。`src/types.ts` の `YagasuriObject`
//! 固有部分 (`YagasuriObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::YagasuriObjectFields;

#[test]
fn yagasuri_object_fields_default_matches_existing_ui_defaults() {
    // yagasuriObjectFactory.ts の buildAviUtlYagasuriObject が今日生成
    // している既定値と一致させる。width/height は固定リテラル (800x450) の
    // ためニュートラル化せずそのまま採用する。
    let defaults = YagasuriObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.arrow_width, 15.0);
    assert_eq!(defaults.arrow_height, 65.0);
    assert_eq!(defaults.line_width, 2.0);
    assert_eq!(defaults.staggered, true);
    assert_eq!(defaults.foreground_colour, "#000000");
    assert_eq!(defaults.background_colour, "#ffffff");
}

#[test]
fn yagasuri_object_fields_serialise_with_camel_case_field_names() {
    let fields = YagasuriObjectFields {
        width: 820.0,
        height: 460.0,
        arrow_width: 20.0,
        arrow_height: 70.0,
        line_width: 3.0,
        staggered: false,
        foreground_colour: "#111111".to_string(),
        background_colour: "#222222".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("YagasuriObjectFields must serialise");

    assert_eq!(value["arrowWidth"], 20.0);
    assert_eq!(value["arrowHeight"], 70.0);
    assert_eq!(value["lineWidth"], 3.0);
    assert_eq!(value["staggered"], false);
    assert_eq!(value["foregroundColour"], "#111111");
    assert_eq!(value["backgroundColour"], "#222222");
    assert!(value.get("arrow_width").is_none());
}
