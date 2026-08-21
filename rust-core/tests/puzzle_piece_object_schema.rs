//! R3: `puzzle_piece` kind の編集モデル正本。`src/types.ts` の
//! `PuzzlePieceObject` 固有部分 (`PuzzlePieceObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::{PuzzleConnectorMode, PuzzlePieceObjectFields};

#[test]
fn puzzle_piece_object_fields_default_matches_existing_ui_defaults() {
    // puzzlePieceObjectFactory.ts の buildAviUtlPuzzlePieceObject が今日
    // 生成している既定値と一致させる。width/height/size はプロジェクトサイズ
    // から都度計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = PuzzlePieceObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.size, 0.0);
    assert_eq!(defaults.shape_variant, 1);
    assert_eq!(defaults.connector_mode, PuzzleConnectorMode::Convex);
    assert_eq!(defaults.fill_colour, "#ffffff");
}

#[test]
fn puzzle_piece_object_fields_serialise_with_camel_case_field_names() {
    let fields = PuzzlePieceObjectFields {
        width: 200.0,
        height: 200.0,
        size: 100.0,
        shape_variant: 5,
        connector_mode: PuzzleConnectorMode::Concave,
        fill_colour: "#123456".to_string(),
    };

    let value = serde_json::to_value(&fields).expect("PuzzlePieceObjectFields must serialise");

    assert_eq!(value["shapeVariant"], 5);
    assert_eq!(value["connectorMode"], "concave");
    assert_eq!(value["fillColour"], "#123456");
    assert!(value.get("shape_variant").is_none());
    assert!(value.get("fill_colour").is_none());
}
