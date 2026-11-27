//! R3: `simple_tube` kind の編集モデル正本。`src/types.ts` の `SimpleTubeObject`
//! 固有部分 (`SimpleTubeObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::SimpleTubeObjectFields;

#[test]
fn simple_tube_object_fields_default_matches_existing_ui_defaults() {
    // simpleTubeObjectFactory.ts の buildAviUtlSimpleTubeObject が今日生成
    // している既定値と一致させる。width/height はプロジェクトサイズから都度
    // 計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = SimpleTubeObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.radius, 150.0);
    assert_eq!(defaults.depth, 280.0);
    assert_eq!(defaults.segments, 16);
    assert_eq!(defaults.rings, 10);
    assert_eq!(defaults.twist_degrees, 0.0);
    assert_eq!(defaults.random_amount, 0.0);
    assert_eq!(defaults.stroke_width, 3.0);
    assert_eq!(defaults.colour, "#0e769f");
    assert_eq!(defaults.secondary_colour, "#ffffff");
    assert_eq!(defaults.colour_pattern, None);
    assert_eq!(defaults.fog_strength, None);
    assert_eq!(defaults.fog_colour, None);
    assert_eq!(defaults.seed, 93);
    assert_eq!(defaults.torus, false);
}

#[test]
fn simple_tube_object_fields_serialise_with_camel_case_field_names() {
    let fields = SimpleTubeObjectFields {
        width: 320.0,
        height: 120.0,
        radius: 170.0,
        depth: 260.0,
        segments: 24,
        rings: 16,
        twist_degrees: 120.0,
        random_amount: 5.0,
        stroke_width: 4.0,
        colour: "#111111".to_string(),
        secondary_colour: "#f9f9f9".to_string(),
        colour_pattern: Some("ring".to_string()),
        fog_strength: Some(0.35),
        fog_colour: Some("#ffffff".to_string()),
        seed: 930,
        torus: true,
    };

    let value = serde_json::to_value(&fields).expect("SimpleTubeObjectFields must serialise");

    assert_eq!(value["twistDegrees"], 120.0);
    assert_eq!(value["randomAmount"], 5.0);
    assert_eq!(value["strokeWidth"], 4.0);
    assert_eq!(value["secondaryColour"], "#f9f9f9");
    assert_eq!(value["colourPattern"], "ring");
    assert!((value["fogStrength"].as_f64().unwrap() - 0.35).abs() < 1e-6);
    assert_eq!(value["fogColour"], "#ffffff");
    assert_eq!(value["torus"], true);
    assert!(value.get("twist_degrees").is_none());
}
