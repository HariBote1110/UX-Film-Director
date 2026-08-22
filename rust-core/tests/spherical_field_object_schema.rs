//! R3: `spherical_field` kind の編集モデル正本。`src/types.ts` の
//! `SphericalFieldObject` 固有部分 (`SphericalFieldObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::SphericalFieldObjectFields;

#[test]
fn spherical_field_object_fields_default_matches_existing_ui_defaults() {
    // sphericalFieldObjectFactory.ts の buildAviUtlSphericalFieldObject が
    // 今日生成している既定値と一致させる。width/height はプロジェクトサイズ
    // から都度計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = SphericalFieldObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.radius, 160.0);
    assert_eq!(defaults.strength, 100.0);
    assert_eq!(defaults.colour_amount, 100.0);
    assert_eq!(defaults.alpha_amount, 0.0);
    assert_eq!(defaults.line_width, 3.0);
    assert_eq!(defaults.ring_count, 4);
    assert_eq!(defaults.vector_count, 16);
    assert_eq!(defaults.field_colour, "#ff3b30");
    assert_eq!(defaults.secondary_colour, "#36c2ff");
    assert_eq!(defaults.background_opacity, 0.08);
    assert_eq!(defaults.container, false);
    assert_eq!(defaults.seed, 93);
}

#[test]
fn spherical_field_object_fields_serialise_with_camel_case_field_names() {
    let fields = SphericalFieldObjectFields {
        width: 320.0,
        height: 120.0,
        radius: 220.0,
        strength: 140.0,
        colour_amount: 70.0,
        alpha_amount: 0.0,
        line_width: 4.0,
        ring_count: 5,
        vector_count: 24,
        field_colour: "#8b5cf6".to_string(),
        secondary_colour: "#22d3ee".to_string(),
        background_opacity: 0.12,
        container: false,
        seed: 930,
    };

    let value = serde_json::to_value(&fields).expect("SphericalFieldObjectFields must serialise");

    assert_eq!(value["colourAmount"], 70.0);
    assert_eq!(value["alphaAmount"], 0.0);
    assert_eq!(value["lineWidth"], 4.0);
    assert_eq!(value["ringCount"], 5);
    assert_eq!(value["vectorCount"], 24);
    assert_eq!(value["fieldColour"], "#8b5cf6");
    assert_eq!(value["secondaryColour"], "#22d3ee");
    assert!((value["backgroundOpacity"].as_f64().unwrap() - 0.12).abs() < 1e-6);
    assert!(value.get("colour_amount").is_none());
}
