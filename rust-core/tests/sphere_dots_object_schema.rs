//! R3: `sphere_dots` kind の編集モデル正本。`src/types.ts` の `SphereDotsObject`
//! 固有部分 (`SphereDotsObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::SphereDotsObjectFields;

#[test]
fn sphere_dots_object_fields_default_matches_existing_ui_defaults() {
    // sphereDotsObjectFactory.ts の buildAviUtlSphereDotsObject が今日生成
    // している既定値と一致させる。width/height はプロジェクトサイズから都度
    // 計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = SphereDotsObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.radius, 170.0);
    assert_eq!(defaults.columns, 16);
    assert_eq!(defaults.rows, 12);
    assert_eq!(defaults.rotation_degrees, 10.0);
    assert_eq!(defaults.offset_degrees, 0.0);
    assert_eq!(defaults.luminance_influence, 0.0);
    assert_eq!(defaults.point_size, 6.0);
    assert_eq!(defaults.latitude_line_width, 2.0);
    assert_eq!(defaults.colour, "#ffffff");
    assert_eq!(defaults.secondary_colour, "#36c2ff");
    assert_eq!(defaults.seed, 93);
    assert_eq!(defaults.plane_mode, false);
}

#[test]
fn sphere_dots_object_fields_serialise_with_camel_case_field_names() {
    let fields = SphereDotsObjectFields {
        width: 320.0,
        height: 120.0,
        radius: 200.0,
        columns: 20,
        rows: 14,
        rotation_degrees: 15.0,
        offset_degrees: 5.0,
        luminance_influence: 0.5,
        point_size: 8.0,
        latitude_line_width: 3.0,
        colour: "#111111".to_string(),
        secondary_colour: "#222222".to_string(),
        seed: 42,
        plane_mode: true,
    };

    let value = serde_json::to_value(&fields).expect("SphereDotsObjectFields must serialise");

    assert_eq!(value["rotationDegrees"], 15.0);
    assert_eq!(value["offsetDegrees"], 5.0);
    assert!((value["luminanceInfluence"].as_f64().unwrap() - 0.5).abs() < 1e-6);
    assert_eq!(value["pointSize"], 8.0);
    assert_eq!(value["latitudeLineWidth"], 3.0);
    assert_eq!(value["secondaryColour"], "#222222");
    assert_eq!(value["planeMode"], true);
    assert!(value.get("rotation_degrees").is_none());
}
