//! R3: `image` kind の編集モデル正本。`src/types.ts` の `ImageObject` 固有部分
//! (`ImageObjectFields`) が Rust 側で定義され、既定値・wire 上の camelCase 命名を
//! 保つことを固定する。

use uxfd_rust_core::ImageObjectFields;

#[test]
fn image_object_fields_default_is_neutral() {
    // `image` は shape/text と違い、Timeline.tsx の handleImageChange が
    // 選択したファイルの実サイズから width/height/src を決めるため、
    // UI 側に固定既定値が存在しない。Default はニュートラルな空値にする。
    let defaults = ImageObjectFields::default();

    assert_eq!(defaults.src, "");
    assert!(defaults.file_path.is_none());
    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
}

#[test]
fn image_object_fields_serialise_with_camel_case_field_names() {
    let fields = ImageObjectFields {
        src: "blob:http://localhost/abc".to_string(),
        file_path: Some("/tmp/photo.png".to_string()),
        width: 640.0,
        height: 480.0,
    };

    let value = serde_json::to_value(&fields).expect("ImageObjectFields must serialise");

    assert_eq!(value["src"], "blob:http://localhost/abc");
    assert_eq!(value["filePath"], "/tmp/photo.png");
    assert_eq!(value["width"], 640.0);
    assert_eq!(value["height"], 480.0);
    assert!(value.get("file_path").is_none());
}

#[test]
fn image_object_fields_omit_absent_file_path() {
    let fields = ImageObjectFields::default();

    let value = serde_json::to_value(&fields).expect("ImageObjectFields must serialise");

    assert!(value.get("filePath").is_none());
}
