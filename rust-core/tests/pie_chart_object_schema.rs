//! R3: `pie_chart` kind の編集モデル正本。`src/types.ts` の `PieChartObject`
//! 固有部分 (`PieChartObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::PieChartObjectFields;

#[test]
fn pie_chart_object_fields_default_matches_existing_ui_defaults() {
    // pieChartObjectFactory.ts の buildAviUtlPieChartObject が今日生成している
    // 既定値と一致させる。width/height はプロジェクトサイズから都度計算される
    // ため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = PieChartObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.values, vec![10.0, 20.0, 30.0, 40.0]);
    assert_eq!(
        serde_json::to_value(&defaults.sort_mode).unwrap(),
        "descending"
    );
    assert!(defaults.normalise_to_hundred);
    assert_eq!(
        serde_json::to_value(&defaults.label_mode).unwrap(),
        "percentage"
    );
    assert_eq!(defaults.progress_percent, 100.0);
    assert_eq!(defaults.stroke_width, 20.0);
    assert_eq!(
        defaults.slice_colours,
        vec!["#389ba6", "#f2e2c4", "#f29422", "#f27830", "#f24b0f"]
    );
}

#[test]
fn pie_chart_object_fields_serialise_with_camel_case_field_names() {
    let fields = PieChartObjectFields {
        width: 320.0,
        height: 120.0,
        values: vec![1.0, 2.0],
        sort_mode: uxfd_rust_core::PieChartSortMode::Ascending,
        normalise_to_hundred: false,
        label_mode: uxfd_rust_core::PieChartLabelMode::None,
        progress_percent: 50.0,
        stroke_width: 10.0,
        slice_colours: vec!["#111111".to_string()],
    };

    let value = serde_json::to_value(&fields).expect("PieChartObjectFields must serialise");

    assert_eq!(value["sortMode"], "ascending");
    assert_eq!(value["normaliseToHundred"], false);
    assert_eq!(value["labelMode"], "none");
    assert_eq!(value["progressPercent"], 50.0);
    assert_eq!(value["strokeWidth"], 10.0);
    assert_eq!(value["sliceColours"], serde_json::json!(["#111111"]));
    assert!(value.get("sort_mode").is_none());
}
