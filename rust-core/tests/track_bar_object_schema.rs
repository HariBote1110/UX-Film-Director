//! R3: `track_bar` kind の編集モデル正本。`src/types.ts` の `TrackBarObject`
//! 固有部分 (`TrackBarObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::TrackBarObjectFields;

#[test]
fn track_bar_object_fields_default_matches_existing_ui_defaults() {
    // trackBarObjectFactory.ts の buildAviUtlTrackBarObject が今日生成している
    // 既定値と一致させる。width/height はプロジェクトサイズから都度計算される
    // ため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = TrackBarObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.track_values, vec![0.0, 0.0, 0.0, 0.0]);
    assert_eq!(
        defaults.track_ranges,
        vec![(0.0, 100.0), (0.0, 100.0), (0.0, 100.0), (-100.0, 100.0)]
    );
    assert_eq!(
        defaults.labels,
        vec!["TrackA", "TrackB", "TrackC", "TrackD"]
    );
    assert_eq!(defaults.bar_colour, "#ffffff");
    assert_eq!(defaults.background_opacity, 0.05);
}

#[test]
fn track_bar_object_fields_serialise_with_camel_case_field_names() {
    let fields = TrackBarObjectFields {
        width: 320.0,
        height: 120.0,
        track_values: vec![1.0, 2.0, 3.0, 4.0],
        track_ranges: vec![(0.0, 10.0), (0.0, 10.0), (0.0, 10.0), (0.0, 10.0)],
        labels: vec!["A".to_string(), "B".to_string(), "C".to_string(), "D".to_string()],
        bar_colour: "#111111".to_string(),
        background_opacity: 0.2,
    };

    let value = serde_json::to_value(&fields).expect("TrackBarObjectFields must serialise");

    assert_eq!(value["trackValues"], serde_json::json!([1.0, 2.0, 3.0, 4.0]));
    assert_eq!(
        value["trackRanges"],
        serde_json::json!([[0.0, 10.0], [0.0, 10.0], [0.0, 10.0], [0.0, 10.0]])
    );
    assert_eq!(value["barColour"], "#111111");
    assert!((value["backgroundOpacity"].as_f64().unwrap() - 0.2).abs() < 1e-6);
    assert!(value.get("track_values").is_none());
}
