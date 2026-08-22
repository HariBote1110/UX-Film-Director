//! R3: `triangle_bracket` kind の編集モデル正本。`src/types.ts` の
//! `TriangleBracketObject` 固有部分 (`TriangleBracketObjectFields`) が
//! Rust 側で定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::TriangleBracketObjectFields;

#[test]
fn triangle_bracket_object_fields_default_matches_existing_ui_defaults() {
    // triangleBracketObjectFactory.ts の buildAviUtlTriangleBracketObject が
    // 今日生成している既定値と一致させる。width/height は固定リテラル
    // (160x100) のためニュートラル化せずそのまま採用する。
    let defaults = TriangleBracketObjectFields::default();

    assert_eq!(defaults.width, 160.0);
    assert_eq!(defaults.height, 100.0);
    assert_eq!(defaults.bracket_width, 100.0);
    assert_eq!(defaults.angle_degrees, 120.0);
    assert_eq!(defaults.arm_length, 50.0);
    assert_eq!(defaults.offset_distance, 0.0);
    assert_eq!(defaults.bracket_colour, "#ffffff");
}

#[test]
fn triangle_bracket_object_fields_serialise_with_camel_case_field_names() {
    let fields = TriangleBracketObjectFields {
        width: 180.0,
        height: 120.0,
        bracket_width: 110.0,
        angle_degrees: 90.0,
        arm_length: 60.0,
        offset_distance: -5.0,
        bracket_colour: "#111111".to_string(),
    };

    let value =
        serde_json::to_value(&fields).expect("TriangleBracketObjectFields must serialise");

    assert_eq!(value["bracketWidth"], 110.0);
    assert_eq!(value["angleDegrees"], 90.0);
    assert_eq!(value["armLength"], 60.0);
    assert_eq!(value["offsetDistance"], -5.0);
    assert_eq!(value["bracketColour"], "#111111");
    assert!(value.get("bracket_width").is_none());
}
