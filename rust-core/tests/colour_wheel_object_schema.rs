//! R3: `colour_wheel` kind の編集モデル正本。`src/types.ts` の
//! `ColourWheelObject` 固有部分 (`ColourWheelObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::ColourWheelObjectFields;

#[test]
fn colour_wheel_object_fields_default_matches_existing_ui_defaults() {
    // colourWheelObjectFactory.ts の buildAviUtlColourWheelObject が今日
    // 生成している既定値と一致させる。width/height/radius はプロジェクトサイズ
    // から都度計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = ColourWheelObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.radius, 0.0);
    assert_eq!(defaults.saturation, 100.0);
    assert_eq!(defaults.brightness, 100.0);
    assert_eq!(defaults.ring_width_percent, 25.0);
    assert_eq!(defaults.segment_count, 24);
}

#[test]
fn colour_wheel_object_fields_serialise_with_camel_case_field_names() {
    let fields = ColourWheelObjectFields {
        width: 200.0,
        height: 200.0,
        radius: 100.0,
        saturation: 80.0,
        brightness: 90.0,
        ring_width_percent: 40.0,
        segment_count: 12,
    };

    let value = serde_json::to_value(&fields).expect("ColourWheelObjectFields must serialise");

    assert_eq!(value["ringWidthPercent"], 40.0);
    assert_eq!(value["segmentCount"], 12);
    assert!(value.get("ring_width_percent").is_none());
    assert!(value.get("segment_count").is_none());
}
