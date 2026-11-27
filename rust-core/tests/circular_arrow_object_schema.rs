//! R3: `circular_arrow` kind の編集モデル正本。`src/types.ts` の
//! `CircularArrowObject` 固有部分 (`CircularArrowObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::CircularArrowObjectFields;

#[test]
fn circular_arrow_object_fields_default_matches_existing_ui_defaults() {
    // circularArrowObjectFactory.ts の buildAviUtlCircularArrowObject が
    // 今日生成している既定値と一致させる。width/height は固定リテラル
    // (200x200) のためニュートラル化せずそのまま採用する。
    let defaults = CircularArrowObjectFields::default();

    assert_eq!(defaults.width, 200.0);
    assert_eq!(defaults.height, 200.0);
    assert_eq!(defaults.radius, 100.0);
    assert_eq!(defaults.line_width, 20.0);
    assert_eq!(defaults.head_size, 50.0);
    assert_eq!(defaults.angle_degrees, 260.0);
    assert_eq!(defaults.centre_angle_degrees, 0.0);
    assert_eq!(defaults.head_shape, "triangle");
    assert_eq!(defaults.show_tail_head, false);
    assert_eq!(defaults.flip_vertical, false);
    assert_eq!(defaults.flip_horizontal, false);
    assert_eq!(defaults.arrow_colour, "#ffff00");
}

#[test]
fn circular_arrow_object_fields_serialise_with_camel_case_field_names() {
    let fields = CircularArrowObjectFields {
        width: 220.0,
        height: 220.0,
        radius: 110.0,
        line_width: 22.0,
        head_size: 55.0,
        angle_degrees: 270.0,
        centre_angle_degrees: 10.0,
        head_shape: "circle".to_string(),
        show_tail_head: true,
        flip_vertical: true,
        flip_horizontal: true,
        arrow_colour: "#111111".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("CircularArrowObjectFields must serialise");

    assert_eq!(value["lineWidth"], 22.0);
    assert_eq!(value["headSize"], 55.0);
    assert_eq!(value["angleDegrees"], 270.0);
    assert_eq!(value["centreAngleDegrees"], 10.0);
    assert_eq!(value["headShape"], "circle");
    assert_eq!(value["showTailHead"], true);
    assert_eq!(value["flipVertical"], true);
    assert_eq!(value["flipHorizontal"], true);
    assert_eq!(value["arrowColour"], "#111111");
    assert!(value.get("line_width").is_none());
}
