//! R3: `region_frame` kind の編集モデル正本。`src/types.ts` の `RegionFrameObject`
//! 固有部分 (`RegionFrameObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::RegionFrameObjectFields;

#[test]
fn region_frame_object_fields_default_matches_existing_ui_defaults() {
    // regionFrameObjectFactory.ts の buildAviUtlRegionFrameObject が今日生成
    // している既定値と一致させる。width/height はプロジェクトサイズから都度
    // 計算されるため固定既定値が無く、ニュートラルな 0 にする。
    // shape/cornerCut はニュートラルな Optional 省略とする
    // （rectangle バリアントは shape を明示するが、既定値としては未設定）。
    let defaults = RegionFrameObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.line_width, 10.0);
    assert_eq!(defaults.shape, None);
    assert_eq!(defaults.corner_cut, None);
    assert_eq!(defaults.extra_width, 0.0);
    assert_eq!(defaults.extra_height, 0.0);
    assert_eq!(defaults.background_opacity, 0.2);
    assert_eq!(defaults.frame_colour, "#ffffff");
    assert_eq!(defaults.background_colour, "#ccccff");
}

#[test]
fn region_frame_object_fields_serialise_with_camel_case_field_names() {
    let fields = RegionFrameObjectFields {
        width: 320.0,
        height: 120.0,
        line_width: 18.0,
        shape: Some("cut_corner".to_string()),
        corner_cut: Some(20.0),
        extra_width: 32.0,
        extra_height: 32.0,
        background_opacity: 0.35,
        frame_colour: "#111111".to_string(),
        background_colour: "#0b1020".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("RegionFrameObjectFields must serialise");

    assert_eq!(value["lineWidth"], 18.0);
    assert_eq!(value["shape"], "cut_corner");
    assert_eq!(value["cornerCut"], 20.0);
    assert_eq!(value["extraWidth"], 32.0);
    assert_eq!(value["extraHeight"], 32.0);
    assert!((value["backgroundOpacity"].as_f64().unwrap() - 0.35).abs() < 1e-6);
    assert_eq!(value["frameColour"], "#111111");
    assert_eq!(value["backgroundColour"], "#0b1020");
    assert!(value.get("line_width").is_none());
}

#[test]
fn region_frame_object_fields_omits_optional_fields_when_absent() {
    let fields = RegionFrameObjectFields::default();
    let value = serde_json::to_value(&fields).expect("RegionFrameObjectFields must serialise");

    assert!(value.get("shape").is_none());
    assert!(value.get("cornerCut").is_none());
}
