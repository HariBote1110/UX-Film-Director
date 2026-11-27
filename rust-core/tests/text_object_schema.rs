//! R3: `text` kind の編集モデル正本。`src/types.ts` の `TextObject` 固有部分
//! (`TextObjectFields`) が Rust 側で定義され、既定値・wire 上の camelCase 命名を
//! 保つことを固定する。

use uxfd_rust_core::{TextAlignment, TextObjectFields, TextShadow, TextStroke};

#[test]
fn text_object_fields_default_matches_existing_ui_defaults() {
    // Timeline.tsx の addTextAt が今日生成している既定値
    // (text: 'New Text', fontSize: 48, fontFamily: 'Arial', fill: '#ffffff') と一致させる。
    let defaults = TextObjectFields::default();

    assert_eq!(defaults.text, "New Text");
    assert_eq!(defaults.font_size, 48.0);
    assert_eq!(defaults.font_family, "Arial");
    assert_eq!(defaults.fill, "#ffffff");
    assert!(defaults.measured_width.is_none());
    assert!(defaults.measured_height.is_none());
    assert!(defaults.text_alignment.is_none());
    assert!(defaults.letter_spacing.is_none());
    assert!(defaults.text_stroke.is_none());
    assert!(defaults.text_shadow.is_none());
}

#[test]
fn text_object_fields_serialise_with_camel_case_field_names() {
    let fields = TextObjectFields {
        text: "Hello".to_string(),
        font_family: "Helvetica".to_string(),
        font_size: 32.0,
        fill: "#00ff00".to_string(),
        measured_width: Some(120.0),
        measured_height: Some(40.0),
        text_alignment: Some(TextAlignment::Centre),
        letter_spacing: Some(2.0),
        text_stroke: Some(TextStroke {
            colour: "#000000".to_string(),
            width: 1.5,
        }),
        text_shadow: Some(TextShadow {
            colour: "#111111".to_string(),
            offset_x: 3.0,
            offset_y: 4.0,
            blur: 5.0,
        }),
    };

    let value = serde_json::to_value(&fields).expect("TextObjectFields must serialise");

    // 編集モデルは TS 側の既存命名 (camelCase) をそのまま踏襲する。
    assert_eq!(value["fontFamily"], "Helvetica");
    assert_eq!(value["fontSize"], 32.0);
    assert_eq!(value["measuredWidth"], 120.0);
    assert_eq!(value["measuredHeight"], 40.0);
    assert_eq!(value["textAlignment"], "centre");
    assert_eq!(value["letterSpacing"], 2.0);
    assert_eq!(value["textStroke"]["colour"], "#000000");
    assert_eq!(value["textShadow"]["offsetX"], 3.0);
    assert_eq!(value["textShadow"]["offsetY"], 4.0);
    assert!(value.get("font_family").is_none());
    assert!(value.get("measured_width").is_none());
}

#[test]
fn text_object_fields_omit_absent_optional_fields() {
    let fields = TextObjectFields::default();

    let value = serde_json::to_value(&fields).expect("TextObjectFields must serialise");

    assert!(value.get("measuredWidth").is_none());
    assert!(value.get("measuredHeight").is_none());
    assert!(value.get("textAlignment").is_none());
    assert!(value.get("letterSpacing").is_none());
    assert!(value.get("textStroke").is_none());
    assert!(value.get("textShadow").is_none());
}
