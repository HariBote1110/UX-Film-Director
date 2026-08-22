//! R3: `hksy_checker_grid` kind の編集モデル正本。`src/types.ts` の
//! `HksyCheckerGridObject` 固有部分 (`HksyCheckerGridObjectFields`) が Rust
//! 側で定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::{HksyAnchorPoint, HksyCheckerGridObjectFields};

#[test]
fn hksy_checker_grid_object_fields_default_matches_existing_ui_defaults() {
    // hksyCheckerGridObjectFactory.ts の buildHksyCheckerGridObject が今日
    // 生成している既定値と一致させる。width/height はプロジェクトサイズから
    // 都度計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = HksyCheckerGridObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.pattern, None);
    assert_eq!(defaults.cell_size, 50.0);
    assert_eq!(defaults.line_width, 2.0);
    assert_eq!(defaults.checker_enabled, true);
    assert_eq!(defaults.grid_enabled, true);
    assert_eq!(defaults.foreground_colour, "#ffffff");
    assert_eq!(defaults.secondary_colour, "#333333");
    assert_eq!(defaults.background_colour, "#000000");
    assert_eq!(defaults.palette_colours, None);
    assert_eq!(defaults.separate_interval, None);
    assert_eq!(defaults.separate_line_width, None);
    assert_eq!(defaults.anchor_points, None);
    assert_eq!(defaults.round_caps, None);
    assert_eq!(defaults.max_join_distance, None);
}

#[test]
fn hksy_checker_grid_object_fields_serialise_with_camel_case_field_names() {
    let fields = HksyCheckerGridObjectFields {
        width: 320.0,
        height: 120.0,
        pattern: Some("anchor-line".to_string()),
        cell_size: 64.0,
        line_width: 20.0,
        checker_enabled: false,
        grid_enabled: false,
        foreground_colour: "#ffffff".to_string(),
        secondary_colour: "#ffffff".to_string(),
        background_colour: "#000000".to_string(),
        palette_colours: Some(vec!["#ff5c8a".to_string(), "#36c2ff".to_string()]),
        separate_interval: Some(5.0),
        separate_line_width: Some(3.0),
        anchor_points: Some(vec![
            HksyAnchorPoint { x: -88.0, y: 50.0 },
            HksyAnchorPoint { x: 0.0, y: -100.0 },
        ]),
        round_caps: Some(true),
        max_join_distance: Some(50.0),
    };

    let value =
        serde_json::to_value(&fields).expect("HksyCheckerGridObjectFields must serialise");

    assert_eq!(value["cellSize"], 64.0);
    assert_eq!(value["lineWidth"], 20.0);
    assert_eq!(value["checkerEnabled"], false);
    assert_eq!(value["gridEnabled"], false);
    assert_eq!(value["foregroundColour"], "#ffffff");
    assert_eq!(value["secondaryColour"], "#ffffff");
    assert_eq!(value["backgroundColour"], "#000000");
    assert_eq!(
        value["paletteColours"],
        serde_json::json!(["#ff5c8a", "#36c2ff"])
    );
    assert_eq!(value["separateInterval"], 5.0);
    assert_eq!(value["separateLineWidth"], 3.0);
    assert_eq!(
        value["anchorPoints"],
        serde_json::json!([{ "x": -88.0, "y": 50.0 }, { "x": 0.0, "y": -100.0 }])
    );
    assert_eq!(value["roundCaps"], true);
    assert_eq!(value["maxJoinDistance"], 50.0);
    assert!(value.get("cell_size").is_none());
}

#[test]
fn hksy_checker_grid_object_fields_omits_optional_fields_when_absent() {
    let fields = HksyCheckerGridObjectFields::default();
    let value =
        serde_json::to_value(&fields).expect("HksyCheckerGridObjectFields must serialise");

    assert!(value.get("pattern").is_none());
    assert!(value.get("paletteColours").is_none());
    assert!(value.get("separateInterval").is_none());
    assert!(value.get("separateLineWidth").is_none());
    assert!(value.get("anchorPoints").is_none());
    assert!(value.get("roundCaps").is_none());
    assert!(value.get("maxJoinDistance").is_none());
}
