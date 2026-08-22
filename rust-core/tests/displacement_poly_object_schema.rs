//! R3: `displacement_poly` kind の編集モデル正本。`src/types.ts` の
//! `DisplacementPolyObject` 固有部分 (`DisplacementPolyObjectFields`) が
//! Rust 側で定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::DisplacementPolyObjectFields;

#[test]
fn displacement_poly_object_fields_default_matches_existing_ui_defaults() {
    // displacementPolyObjectFactory.ts の
    // buildAviUtlDisplacementPolyObject が今日生成している既定値と
    // 一致させる。width/height は固定リテラル (800x450) のため
    // ニュートラル化せずそのまま採用する。
    let defaults = DisplacementPolyObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.columns, 14);
    assert_eq!(defaults.rows, 8);
    assert_eq!(defaults.displacement_scale, 42.0);
    assert_eq!(defaults.depth_scale, 18.0);
    assert_eq!(defaults.mesh_opacity, 0.85);
    assert_eq!(defaults.fill_opacity, 0.18);
    assert_eq!(defaults.line_colour, "#36c2ff");
    assert_eq!(defaults.fill_colour, "#0b1020");
    assert_eq!(defaults.seed, 93);
}

#[test]
fn displacement_poly_object_fields_serialise_with_camel_case_field_names() {
    let fields = DisplacementPolyObjectFields {
        width: 900.0,
        height: 500.0,
        columns: 16,
        rows: 9,
        displacement_scale: 50.0,
        depth_scale: 20.0,
        mesh_opacity: 0.9,
        fill_opacity: 0.2,
        line_colour: "#111111".to_string(),
        fill_colour: "#222222".to_string(),
        seed: 5,
    };

    let value =
        serde_json::to_value(&fields).expect("DisplacementPolyObjectFields must serialise");

    assert_eq!(value["columns"], 16);
    assert_eq!(value["rows"], 9);
    assert_eq!(value["displacementScale"], 50.0);
    assert_eq!(value["depthScale"], 20.0);
    assert!((value["meshOpacity"].as_f64().unwrap() - 0.9).abs() < 1e-6);
    assert!((value["fillOpacity"].as_f64().unwrap() - 0.2).abs() < 1e-6);
    assert_eq!(value["lineColour"], "#111111");
    assert_eq!(value["fillColour"], "#222222");
    assert_eq!(value["seed"], 5);
    assert!(value.get("displacement_scale").is_none());
}
