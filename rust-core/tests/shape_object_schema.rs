//! R3: `shape` kind の編集モデル正本。`src/types.ts` の `ShapeObject` 固有部分
//! (`ShapeObjectFields`) が Rust 側で定義され、既定値・wire 上の camelCase 命名を
//! 保つことを固定する。

use uxfd_rust_core::{ShapeGradientFill, ShapeGradientKind, ShapeObjectFields, ShapeType};

#[test]
fn shape_object_fields_default_matches_existing_ui_defaults() {
    // Timeline.tsx の addShapeAt が今日生成している既定値
    // (shapeType: 'rect', width: 200, height: 100, fill: '#ff0000') と一致させる。
    let defaults = ShapeObjectFields::default();

    assert_eq!(defaults.shape_type, ShapeType::Rect);
    assert_eq!(defaults.width, 200.0);
    assert_eq!(defaults.height, 100.0);
    assert_eq!(defaults.fill, "#ff0000");
    assert!(defaults.gradient.is_none());
    assert!(defaults.corner_radius.is_none());
}

#[test]
fn shape_object_fields_serialise_with_camel_case_field_names() {
    let fields = ShapeObjectFields {
        shape_type: ShapeType::RoundedRect,
        width: 320.0,
        height: 180.0,
        fill: "#00ff00".to_string(),
        gradient: Some(ShapeGradientFill {
            enabled: true,
            kind: ShapeGradientKind::Linear,
            scope: None,
            colours: vec!["#ffffff".to_string(), "#000000".to_string()],
            stops: vec![0.0, 1.0],
            direction: 45.0,
        }),
        corner_radius: Some(12.0),
    };

    let value = serde_json::to_value(&fields).expect("ShapeObjectFields must serialise");

    // 編集モデルは TS 側の既存命名 (camelCase) をそのまま踏襲する。
    assert_eq!(value["shapeType"], "rounded_rect");
    assert_eq!(value["cornerRadius"], 12.0);
    assert_eq!(value["gradient"]["type"], "linear");
    assert!(value.get("shape_type").is_none());
    assert!(value.get("corner_radius").is_none());
}

#[test]
fn shape_object_fields_omit_absent_optional_fields() {
    let fields = ShapeObjectFields::default();

    let value = serde_json::to_value(&fields).expect("ShapeObjectFields must serialise");

    assert!(
        value.get("gradient").is_none() || value["gradient"].is_null() == false,
        "gradient must be omitted rather than serialised as null when absent"
    );
    assert!(value.get("gradient").is_none());
    assert!(value.get("cornerRadius").is_none());
}
