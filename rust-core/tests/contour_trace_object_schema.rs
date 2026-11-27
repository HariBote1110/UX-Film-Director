//! R3: `contour_trace` kind の編集モデル正本。`src/types.ts` の
//! `ContourTraceObject` 固有部分 (`ContourTraceObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::ContourTraceObjectFields;

#[test]
fn contour_trace_object_fields_default_matches_existing_ui_defaults() {
    // contourTraceObjectFactory.ts の buildAviUtlContourTraceObject が
    // 今日生成している既定値と一致させる。width/height は固定リテラル
    // (800x450) のためニュートラル化せずそのまま採用する。
    let defaults = ContourTraceObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.line_width, 3.0);
    assert_eq!(defaults.contour_count, 5);
    assert_eq!(defaults.jitter_amount, 1.5);
    assert_eq!(defaults.trace_colour, "#ffffff");
    assert_eq!(defaults.background_opacity, 0.0);
    assert_eq!(defaults.seed, 93);
}

#[test]
fn contour_trace_object_fields_serialise_with_camel_case_field_names() {
    let fields = ContourTraceObjectFields {
        width: 900.0,
        height: 500.0,
        line_width: 4.0,
        contour_count: 6,
        jitter_amount: 2.0,
        trace_colour: "#111111".to_string(),
        background_opacity: 0.5,
        seed: 42,
    };

    let value = serde_json::to_value(&fields).expect("ContourTraceObjectFields must serialise");

    assert_eq!(value["lineWidth"], 4.0);
    assert_eq!(value["contourCount"], 6);
    assert_eq!(value["jitterAmount"], 2.0);
    assert_eq!(value["traceColour"], "#111111");
    assert_eq!(value["backgroundOpacity"], 0.5);
    assert_eq!(value["seed"], 42);
    assert!(value.get("line_width").is_none());
}
