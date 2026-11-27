//! R3: `getcolor_dot_field` kind の編集モデル正本。`src/types.ts` の
//! `GetColorDotFieldObject` 固有部分 (`GetColorDotFieldObjectFields`) が Rust
//! 側で定義され、既定値・wire 上の camelCase 命名を保つことを固定する。
//!
//! 注意: このkindは wire 統一（stage 4）を見送っている。
//! `serialiseGeneratedGetColorDotsSource`（rustSceneSnapshot.ts）は
//! `sampleSourcePath` が無い場合に他オブジェクト（image/psd）を
//! `sampleSourceObjectId`/`sampleSourceLayer` で解決するクロスオブジェクト
//! 参照を行い、解決結果（`source_image`/`source_active_layer_ids`）を wire に
//! 含める。これは `GetColorDotFieldObjectFields` 単体のフィールドには存在
//! しないため、audio_visualization/audio_sphere と同じ理由で
//! 型移送のみに留める。
use uxfd_rust_core::GetColorDotFieldObjectFields;

#[test]
fn get_color_dot_field_object_fields_default_matches_existing_ui_defaults() {
    // getColorDotFieldObjectFactory.ts の buildGetColorDotFieldObject が今日
    // 生成している既定値と一致させる。width/height はプロジェクトサイズから
    // 都度計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = GetColorDotFieldObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.columns, 32);
    assert_eq!(defaults.rows, 18);
    assert_eq!(defaults.dot_size, 14.0);
    assert_eq!(defaults.dot_shape, None);
    assert_eq!(defaults.stroke_width, None);
    assert_eq!(defaults.size_influence, 0.65);
    assert_eq!(defaults.luminance_influence, 0.7);
    assert_eq!(defaults.hue_shift_degrees, 0.0);
    assert_eq!(defaults.alternate_rows, true);
    assert_eq!(defaults.foreground_colour, "#ffffff");
    assert_eq!(defaults.secondary_colour, "#36c2ff");
    assert_eq!(defaults.background_colour, "#000000");
    assert_eq!(defaults.sample_source_path, None);
    assert_eq!(defaults.sample_source_object_id, None);
    assert_eq!(defaults.sample_source_layer, None);
    assert_eq!(defaults.sample_strength, None);
    assert_eq!(defaults.sample_hue_shift_degrees, None);
    assert_eq!(defaults.seed, 93);
}

#[test]
fn get_color_dot_field_object_fields_serialise_with_camel_case_field_names() {
    let fields = GetColorDotFieldObjectFields {
        width: 320.0,
        height: 120.0,
        columns: 28,
        rows: 16,
        dot_size: 22.0,
        dot_shape: Some("square".to_string()),
        stroke_width: Some(5.0),
        size_influence: 0.5,
        luminance_influence: 0.6,
        hue_shift_degrees: 10.0,
        alternate_rows: false,
        foreground_colour: "#ffffff".to_string(),
        secondary_colour: "#36c2ff".to_string(),
        background_colour: "#000000".to_string(),
        sample_source_path: Some("file:///sample.png".to_string()),
        sample_source_object_id: Some("obj-1".to_string()),
        sample_source_layer: Some(2.0),
        sample_strength: Some(1.0),
        sample_hue_shift_degrees: Some(0.0),
        seed: 93,
    };

    let value =
        serde_json::to_value(&fields).expect("GetColorDotFieldObjectFields must serialise");

    assert_eq!(value["dotSize"], 22.0);
    assert_eq!(value["dotShape"], "square");
    assert_eq!(value["strokeWidth"], 5.0);
    assert!((value["sizeInfluence"].as_f64().unwrap() - 0.5).abs() < 1e-6);
    assert!((value["luminanceInfluence"].as_f64().unwrap() - 0.6).abs() < 1e-6);
    assert_eq!(value["hueShiftDegrees"], 10.0);
    assert_eq!(value["alternateRows"], false);
    assert_eq!(value["foregroundColour"], "#ffffff");
    assert_eq!(value["sampleSourcePath"], "file:///sample.png");
    assert_eq!(value["sampleSourceObjectId"], "obj-1");
    assert_eq!(value["sampleSourceLayer"], 2.0);
    assert!(value.get("dot_size").is_none());
}

#[test]
fn get_color_dot_field_object_fields_omits_optional_fields_when_absent() {
    let fields = GetColorDotFieldObjectFields::default();
    let value =
        serde_json::to_value(&fields).expect("GetColorDotFieldObjectFields must serialise");

    assert!(value.get("dotShape").is_none());
    assert!(value.get("strokeWidth").is_none());
    assert!(value.get("sampleSourcePath").is_none());
    assert!(value.get("sampleSourceObjectId").is_none());
    assert!(value.get("sampleSourceLayer").is_none());
    assert!(value.get("sampleStrength").is_none());
    assert!(value.get("sampleHueShiftDegrees").is_none());
}
