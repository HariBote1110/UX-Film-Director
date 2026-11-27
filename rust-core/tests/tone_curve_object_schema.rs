//! R3: `tone_curve` kind の編集モデル正本。`src/types.ts` の `ToneCurveObject`
//! 固有部分 (`ToneCurveObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::ToneCurveObjectFields;

#[test]
fn tone_curve_object_fields_default_matches_existing_ui_defaults() {
    // toneCurveObjectFactory.ts の buildAviUtlToneCurveObject が今日生成して
    // いる既定値と一致させる。width/height は同ファイルの固定リテラル
    // （360, 360）で、プロジェクトサイズに依存しないためそのまま採用する。
    let defaults = ToneCurveObjectFields::default();

    assert_eq!(defaults.width, 360.0);
    assert_eq!(defaults.height, 360.0);
    assert_eq!(defaults.grid_divisions, 4);
    assert_eq!(defaults.line_width, 3);
    assert_eq!(defaults.curve_points, vec![0.0, 0.16, 0.42, 0.7, 1.0]);
    assert_eq!(defaults.curve_colour, "#ffffff");
    assert_eq!(defaults.grid_colour, "#333333");
    assert_eq!(defaults.background_colour, "#000000");
}

#[test]
fn tone_curve_object_fields_serialise_with_camel_case_field_names() {
    let fields = ToneCurveObjectFields {
        width: 320.0,
        height: 120.0,
        grid_divisions: 8,
        line_width: 5,
        curve_points: vec![0.0, 1.0],
        curve_colour: "#111111".to_string(),
        grid_colour: "#222222".to_string(),
        background_colour: "#333333".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("ToneCurveObjectFields must serialise");

    assert_eq!(value["gridDivisions"], 8);
    assert_eq!(value["lineWidth"], 5);
    assert_eq!(value["curvePoints"], serde_json::json!([0.0, 1.0]));
    assert_eq!(value["curveColour"], "#111111");
    assert_eq!(value["gridColour"], "#222222");
    assert_eq!(value["backgroundColour"], "#333333");
    assert!(value.get("grid_divisions").is_none());
}
