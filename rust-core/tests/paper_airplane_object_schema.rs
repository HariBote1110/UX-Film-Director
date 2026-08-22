//! R3: `paper_airplane` kind の編集モデル正本。`src/types.ts` の
//! `PaperAirplaneObject` 固有部分 (`PaperAirplaneObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::PaperAirplaneObjectFields;

#[test]
fn paper_airplane_object_fields_default_matches_existing_ui_defaults() {
    // paperAirplaneObjectFactory.ts の buildAviUtlPaperAirplaneObject が
    // 今日生成している既定値と一致させる。width/height は固定リテラル
    // (320x240) のためニュートラル化せずそのまま採用する。
    let defaults = PaperAirplaneObjectFields::default();

    assert_eq!(defaults.width, 320.0);
    assert_eq!(defaults.height, 240.0);
    assert_eq!(defaults.body_length, 200.0);
    assert_eq!(defaults.wing_width, 80.0);
    assert_eq!(defaults.fold_height, 50.0);
    assert_eq!(defaults.gap, 50.0);
    assert_eq!(defaults.follow_motion_direction, false);
    assert_eq!(defaults.axis_mode, 0.0);
    assert_eq!(defaults.fill_colour, "#ffffff");
}

#[test]
fn paper_airplane_object_fields_serialise_with_camel_case_field_names() {
    let fields = PaperAirplaneObjectFields {
        width: 340.0,
        height: 260.0,
        body_length: 220.0,
        wing_width: 90.0,
        fold_height: 60.0,
        gap: 40.0,
        follow_motion_direction: true,
        axis_mode: 1.0,
        fill_colour: "#111111".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("PaperAirplaneObjectFields must serialise");

    assert_eq!(value["bodyLength"], 220.0);
    assert_eq!(value["wingWidth"], 90.0);
    assert_eq!(value["foldHeight"], 60.0);
    assert_eq!(value["gap"], 40.0);
    assert_eq!(value["followMotionDirection"], true);
    assert_eq!(value["axisMode"], 1.0);
    assert_eq!(value["fillColour"], "#111111");
    assert!(value.get("body_length").is_none());
}
