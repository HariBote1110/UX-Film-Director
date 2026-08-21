//! R3: `barcode` kind の編集モデル正本。`src/types.ts` の `BarcodeObject`
//! 固有部分 (`BarcodeObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::BarcodeObjectFields;

#[test]
fn barcode_object_fields_default_matches_existing_ui_defaults() {
    // barcodeObjectFactory.ts の buildAviUtlBarcodeObject が今日生成している
    // 既定値と一致させる。width/height はプロジェクトサイズから都度計算
    // されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = BarcodeObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.data, "AviUtl");
    assert_eq!(defaults.minimum_bar_width, 2.0);
    assert_eq!(defaults.horizontal_margin, 30.0);
    assert_eq!(defaults.vertical_margin, 20.0);
    assert_eq!(defaults.foreground_colour, "#000000");
    assert_eq!(defaults.background_colour, "#ffffff");
}

#[test]
fn barcode_object_fields_serialise_with_camel_case_field_names() {
    let fields = BarcodeObjectFields {
        width: 320.0,
        height: 120.0,
        data: "hello".to_string(),
        minimum_bar_width: 3.0,
        horizontal_margin: 10.0,
        vertical_margin: 5.0,
        foreground_colour: "#111111".to_string(),
        background_colour: "#eeeeee".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("BarcodeObjectFields must serialise");

    assert_eq!(value["minimumBarWidth"], 3.0);
    assert_eq!(value["horizontalMargin"], 10.0);
    assert_eq!(value["verticalMargin"], 5.0);
    assert_eq!(value["foregroundColour"], "#111111");
    assert_eq!(value["backgroundColour"], "#eeeeee");
    assert!(value.get("minimum_bar_width").is_none());
}
