//! R3: `gourd` kind の編集モデル正本。`src/types.ts` の `GourdObject`
//! 固有部分 (`GourdObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::GourdObjectFields;

#[test]
fn gourd_object_fields_default_matches_existing_ui_defaults() {
    // gourdObjectFactory.ts の buildAviUtlGourdObject が今日生成している
    // 既定値と一致させる。width/height はプロジェクトサイズから都度計算
    // されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = GourdObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.body_radius, 80);
    assert_eq!(defaults.body_width, 250);
    assert_eq!(defaults.waist_radius, 10);
    assert_eq!(defaults.squash_percent, 40.0);
    assert_eq!(defaults.repeat_count, 1);
    assert_eq!(defaults.fill_colour, "#ffffff");
}

#[test]
fn gourd_object_fields_serialise_with_camel_case_field_names() {
    let fields = GourdObjectFields {
        width: 320.0,
        height: 120.0,
        body_radius: 90,
        body_width: 260,
        waist_radius: 12,
        squash_percent: 35.0,
        repeat_count: 2,
        fill_colour: "#111111".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("GourdObjectFields must serialise");

    assert_eq!(value["bodyRadius"], 90);
    assert_eq!(value["bodyWidth"], 260);
    assert_eq!(value["waistRadius"], 12);
    assert_eq!(value["squashPercent"], 35.0);
    assert_eq!(value["repeatCount"], 2);
    assert_eq!(value["fillColour"], "#111111");
    assert!(value.get("body_radius").is_none());
}
