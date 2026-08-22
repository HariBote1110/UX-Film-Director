//! R3: `gear` kind の編集モデル正本。`src/types.ts` の `GearObject`
//! 固有部分 (`GearObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::GearObjectFields;

#[test]
fn gear_object_fields_default_matches_existing_ui_defaults() {
    // gearObjectFactory.ts の buildAviUtlGearObject が今日生成している既定値と
    // 一致させる。width/height/outerRadius はプロジェクトサイズから都度計算
    // されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = GearObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.outer_radius, 0);
    assert_eq!(defaults.inner_radius_percent, 45.0);
    assert_eq!(defaults.tooth_count, 20);
    assert_eq!(defaults.tooth_depth_percent, 18.0);
    assert_eq!(defaults.tooth_skew_percent, 0.0);
    assert_eq!(defaults.fill_colour, "#ffffff");
}

#[test]
fn gear_object_fields_serialise_with_camel_case_field_names() {
    let fields = GearObjectFields {
        width: 320.0,
        height: 120.0,
        outer_radius: 64,
        inner_radius_percent: 40.0,
        tooth_count: 24,
        tooth_depth_percent: 20.0,
        tooth_skew_percent: 5.0,
        fill_colour: "#111111".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("GearObjectFields must serialise");

    assert_eq!(value["outerRadius"], 64);
    assert_eq!(value["innerRadiusPercent"], 40.0);
    assert_eq!(value["toothCount"], 24);
    assert_eq!(value["toothDepthPercent"], 20.0);
    assert_eq!(value["toothSkewPercent"], 5.0);
    assert_eq!(value["fillColour"], "#111111");
    assert!(value.get("outer_radius").is_none());
}
