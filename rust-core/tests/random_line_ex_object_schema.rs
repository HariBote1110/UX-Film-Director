//! R3: `random_line_ex` kind の編集モデル正本。`src/types.ts` の
//! `RandomLineExObject` 固有部分 (`RandomLineExObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::RandomLineExObjectFields;

#[test]
fn random_line_ex_object_fields_default_matches_existing_ui_defaults() {
    // randomLineExObjectFactory.ts の buildAviUtlRandomLineExObject が
    // 今日生成している既定値と一致させる。width/height は固定リテラル
    // (800x450) のためニュートラル化せずそのまま採用する。
    let defaults = RandomLineExObjectFields::default();

    assert_eq!(defaults.width, 800.0);
    assert_eq!(defaults.height, 450.0);
    assert_eq!(defaults.line_count, 3);
    assert_eq!(defaults.line_width, 6.0);
    assert_eq!(defaults.threshold, 128.0);
    assert_eq!(defaults.noise_cell_size, 12.0);
    assert_eq!(defaults.width_variance, 0.0);
    assert_eq!(defaults.seed, 0);
    assert_eq!(defaults.line_colour, "#ffffff");
}

#[test]
fn random_line_ex_object_fields_serialise_with_camel_case_field_names() {
    let fields = RandomLineExObjectFields {
        width: 900.0,
        height: 500.0,
        line_count: 5,
        line_width: 7.0,
        threshold: 140.0,
        noise_cell_size: 14.0,
        width_variance: 2.0,
        seed: 9,
        line_colour: "#111111".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("RandomLineExObjectFields must serialise");

    assert_eq!(value["lineCount"], 5);
    assert_eq!(value["lineWidth"], 7.0);
    assert_eq!(value["threshold"], 140.0);
    assert_eq!(value["noiseCellSize"], 14.0);
    assert_eq!(value["widthVariance"], 2.0);
    assert_eq!(value["seed"], 9);
    assert_eq!(value["lineColour"], "#111111");
    assert!(value.get("line_count").is_none());
}
