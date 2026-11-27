//! R3: `sunburst` kind の編集モデル正本。`src/types.ts` の `SunburstObject`
//! 固有部分 (`SunburstObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::SunburstObjectFields;

#[test]
fn sunburst_object_fields_default_matches_existing_ui_defaults() {
    // sunburstObjectFactory.ts の buildAviUtlSunburstObject が今日生成
    // している既定値と一致させる。width/height は固定リテラル (800x450) の
    // ためニュートラル化せずそのまま採用する。
    let defaults = SunburstObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.ray_count, 10);
    assert_eq!(defaults.ray_coverage_percent, 50.0);
    assert_eq!(defaults.rotation_offset_degrees, 0.0);
    assert_eq!(defaults.centre_x_percent, 50.0);
    assert_eq!(defaults.centre_y_percent, 50.0);
    assert_eq!(defaults.motif_size, 200.0);
    assert_eq!(defaults.motif_shape, "circle");
    assert_eq!(defaults.ray_colour, "#ff0000");
    assert_eq!(defaults.background_colour, "#ffff00");
}

#[test]
fn sunburst_object_fields_serialise_with_camel_case_field_names() {
    let fields = SunburstObjectFields {
        width: 900.0,
        height: 500.0,
        ray_count: 20,
        ray_coverage_percent: 60.0,
        rotation_offset_degrees: 15.0,
        centre_x_percent: 40.0,
        centre_y_percent: 45.0,
        motif_size: 150.0,
        motif_shape: "rect".to_string(),
        ray_colour: "#111111".to_string(),
        background_colour: "#222222".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("SunburstObjectFields must serialise");

    assert_eq!(value["rayCount"], 20);
    assert!((value["rayCoveragePercent"].as_f64().unwrap() - 60.0).abs() < 1e-6);
    assert_eq!(value["rotationOffsetDegrees"], 15.0);
    assert_eq!(value["centreXPercent"], 40.0);
    assert_eq!(value["centreYPercent"], 45.0);
    assert_eq!(value["motifSize"], 150.0);
    assert_eq!(value["motifShape"], "rect");
    assert_eq!(value["rayColour"], "#111111");
    assert_eq!(value["backgroundColour"], "#222222");
    assert!(value.get("ray_count").is_none());
}
