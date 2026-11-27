//! R3: `histogram` kind の編集モデル正本。`src/types.ts` の `HistogramObject`
//! 固有部分 (`HistogramObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::HistogramObjectFields;

#[test]
fn histogram_object_fields_default_matches_existing_ui_defaults() {
    // histogramObjectFactory.ts の buildAviUtlHistogramObject が今日生成して
    // いる既定値と一致させる。width/height は同ファイルの固定リテラル
    // （256, 200）で、プロジェクトサイズに依存しないためそのまま採用する。
    let defaults = HistogramObjectFields::default();

    assert_eq!(defaults.width, 256.0);
    assert_eq!(defaults.height, 200.0);
    assert_eq!(
        defaults.bin_values,
        vec![0.08, 0.18, 0.32, 0.55, 0.78, 0.92, 0.64, 0.36]
    );
    assert_eq!(defaults.height_scale_percent, 100.0);
    assert_eq!(defaults.line_width, 1.0);
    assert!(defaults.show_luminance);
    assert!(defaults.show_red);
    assert!(defaults.show_green);
    assert!(defaults.show_blue);
    assert_eq!(
        defaults.channel_colours,
        vec!["#ffffff", "#ff4b4b", "#4bff6a", "#4b8cff"]
    );
    assert_eq!(defaults.background_colour, "#000000");
}

#[test]
fn histogram_object_fields_serialise_with_camel_case_field_names() {
    let fields = HistogramObjectFields {
        width: 320.0,
        height: 120.0,
        bin_values: vec![0.1, 0.2],
        height_scale_percent: 50.0,
        line_width: 2.0,
        show_luminance: false,
        show_red: true,
        show_green: false,
        show_blue: true,
        channel_colours: vec![
            "#111111".to_string(),
            "#222222".to_string(),
            "#333333".to_string(),
            "#444444".to_string(),
        ],
        background_colour: "#eeeeee".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("HistogramObjectFields must serialise");

    let bin_values = value["binValues"].as_array().unwrap();
    assert!((bin_values[0].as_f64().unwrap() - 0.1).abs() < 1e-6);
    assert!((bin_values[1].as_f64().unwrap() - 0.2).abs() < 1e-6);
    assert_eq!(value["heightScalePercent"], 50.0);
    assert_eq!(value["lineWidth"], 2.0);
    assert_eq!(value["showLuminance"], false);
    assert_eq!(value["showRed"], true);
    assert_eq!(value["showGreen"], false);
    assert_eq!(value["showBlue"], true);
    assert_eq!(value["backgroundColour"], "#eeeeee");
    assert!(value.get("bin_values").is_none());
}
