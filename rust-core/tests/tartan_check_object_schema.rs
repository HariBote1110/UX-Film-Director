//! R3: `tartan_check` kind の編集モデル正本。`src/types.ts` の
//! `TartanCheckObject` 固有部分 (`TartanCheckObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::TartanCheckObjectFields;

#[test]
fn tartan_check_object_fields_default_matches_existing_ui_defaults() {
    // tartanCheckObjectFactory.ts の buildAviUtlTartanCheckObject が今日
    // 生成している既定値と一致させる。width/height は固定リテラル
    // (800x450) のためニュートラル化せずそのまま採用する。
    let defaults = TartanCheckObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.tile_size, 100.0);
    assert_eq!(defaults.blur_radius, 1.0);
    assert_eq!(defaults.base_colour, "#143e10");
    assert_eq!(defaults.stripe_colour_a, "#a81616");
    assert_eq!(defaults.stripe_colour_b, "#c9c526");
    assert_eq!(defaults.line_colour, "#000000");
}

#[test]
fn tartan_check_object_fields_serialise_with_camel_case_field_names() {
    let fields = TartanCheckObjectFields {
        width: 820.0,
        height: 460.0,
        tile_size: 120.0,
        blur_radius: 2.0,
        base_colour: "#111111".to_string(),
        stripe_colour_a: "#222222".to_string(),
        stripe_colour_b: "#333333".to_string(),
        line_colour: "#444444".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("TartanCheckObjectFields must serialise");

    assert_eq!(value["tileSize"], 120.0);
    assert_eq!(value["blurRadius"], 2.0);
    assert_eq!(value["baseColour"], "#111111");
    assert_eq!(value["stripeColourA"], "#222222");
    assert_eq!(value["stripeColourB"], "#333333");
    assert_eq!(value["lineColour"], "#444444");
    assert!(value.get("tile_size").is_none());
}
