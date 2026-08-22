//! R3: `focus_lines_plus` kind の編集モデル正本。`src/types.ts` の
//! `FocusLinesPlusObject` 固有部分 (`FocusLinesPlusObjectFields`) が Rust
//! 側で定義され、既定値・wire 上の camelCase 命名を保つことを固定する。
//!
//! `rust-core/src/focus_lines.rs` の `focus_lines_frame_bucket` は
//! keyframe interval のバケット計算のみを担う独立関数で、
//! `FocusLinesPlusObjectFields` とクロスオブジェクト参照を持たない
//! （着手前に確認済み）。

use uxfd_rust_core::FocusLinesPlusObjectFields;

#[test]
fn focus_lines_plus_object_fields_default_matches_existing_ui_defaults() {
    // focusLinesPlusObjectFactory.ts の buildAviUtlFocusLinesPlusObject が
    // 今日生成している既定値と一致させる。width/height は固定リテラル
    // (800x450) のためニュートラル化せずそのまま採用する。
    let defaults = FocusLinesPlusObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.ray_width, 1.0);
    assert_eq!(defaults.gap, 5.0);
    assert_eq!(defaults.centre_radius, 100.0);
    assert_eq!(defaults.rotation_degrees, 0.0);
    assert_eq!(defaults.centre_x, 400.0);
    assert_eq!(defaults.centre_y, 225.0);
    assert_eq!(defaults.centre_jitter_percent, 20.0);
    assert_eq!(defaults.seed, 0);
    assert_eq!(defaults.keyframe_interval, 0.0);
    assert_eq!(defaults.line_colour, "#ffffff");
}

#[test]
fn focus_lines_plus_object_fields_serialise_with_camel_case_field_names() {
    let fields = FocusLinesPlusObjectFields {
        width: 900.0,
        height: 500.0,
        ray_width: 2.0,
        gap: 6.0,
        centre_radius: 120.0,
        rotation_degrees: 15.0,
        centre_x: 450.0,
        centre_y: 250.0,
        centre_jitter_percent: 25.0,
        seed: 7,
        keyframe_interval: 12.0,
        line_colour: "#111111".to_string(),
    };

    let value =
        serde_json::to_value(&fields).expect("FocusLinesPlusObjectFields must serialise");

    assert_eq!(value["rayWidth"], 2.0);
    assert_eq!(value["gap"], 6.0);
    assert_eq!(value["centreRadius"], 120.0);
    assert_eq!(value["rotationDegrees"], 15.0);
    assert_eq!(value["centreX"], 450.0);
    assert_eq!(value["centreY"], 250.0);
    assert_eq!(value["centreJitterPercent"], 25.0);
    assert_eq!(value["seed"], 7);
    assert_eq!(value["keyframeInterval"], 12.0);
    assert_eq!(value["lineColour"], "#111111");
    assert!(value.get("ray_width").is_none());
}
