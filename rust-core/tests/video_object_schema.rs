//! R3: `video` kind の編集モデル正本。`src/types.ts` の `VideoObject` 固有部分
//! (`VideoObjectFields`) が Rust 側で定義され、既定値・wire 上の camelCase 命名を
//! 保つことを固定する。

use uxfd_rust_core::{SubjectCropNormKeyframe, VideoObjectFields};

#[test]
fn video_object_fields_default_is_neutral_for_file_derived_values() {
    // `video` は `image` と同じ media kind。src/filePath/proxyFilePath/width/height/
    // sourceWidth/sourceHeight は Timeline.tsx の handleVideoChange がファイル選択後の
    // 実データから決めるため、固定既定値が存在しない。ニュートラルな空値にする。
    let defaults = VideoObjectFields::default();

    assert_eq!(defaults.src, "");
    assert!(defaults.file_path.is_none());
    assert!(defaults.proxy_file_path.is_none());
    assert!(defaults.source_width.is_none());
    assert!(defaults.source_height.is_none());
    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
}

#[test]
fn video_object_fields_default_matches_ui_literal_defaults() {
    // volume/muted は Timeline.tsx が常に 1.0/false という固定リテラルで生成しており
    // （ファイル依存ではない実在の既定値）、shape/text と同じくその値を Default にする。
    let defaults = VideoObjectFields::default();

    assert_eq!(defaults.volume, 1.0);
    assert_eq!(defaults.muted, false);
    assert!(defaults.subject_crop_enabled.is_none());
    assert!(defaults.subject_crop_keyframes.is_none());
    assert!(defaults.reversed.is_none());
}

#[test]
fn video_object_fields_serialise_with_camel_case_field_names() {
    let fields = VideoObjectFields {
        src: "blob:http://localhost/clip.mp4".to_string(),
        file_path: Some("/tmp/clip.mp4".to_string()),
        proxy_file_path: Some("/tmp/clip.proxy.mp4".to_string()),
        source_width: Some(1920.0),
        source_height: Some(1080.0),
        width: 960.0,
        height: 540.0,
        volume: 0.5,
        muted: true,
        subject_crop_enabled: Some(true),
        subject_crop_keyframes: Some(vec![SubjectCropNormKeyframe {
            id: "kf-1".to_string(),
            time: 1.5,
            x: 0.1,
            y: 0.2,
            width: 0.5,
            height: 0.6,
        }]),
        reversed: Some(true),
    };

    let value = serde_json::to_value(&fields).expect("VideoObjectFields must serialise");

    assert_eq!(value["src"], "blob:http://localhost/clip.mp4");
    assert_eq!(value["filePath"], "/tmp/clip.mp4");
    assert_eq!(value["proxyFilePath"], "/tmp/clip.proxy.mp4");
    assert_eq!(value["sourceWidth"], 1920.0);
    assert_eq!(value["sourceHeight"], 1080.0);
    assert_eq!(value["width"], 960.0);
    assert_eq!(value["height"], 540.0);
    assert_eq!(value["volume"], 0.5);
    assert_eq!(value["muted"], true);
    assert_eq!(value["subjectCropEnabled"], true);
    assert_eq!(value["subjectCropKeyframes"][0]["id"], "kf-1");
    assert_eq!(value["subjectCropKeyframes"][0]["time"], 1.5);
    assert_eq!(value["reversed"], true);

    assert!(value.get("file_path").is_none());
    assert!(value.get("proxy_file_path").is_none());
    assert!(value.get("source_width").is_none());
    assert!(value.get("source_height").is_none());
    assert!(value.get("subject_crop_enabled").is_none());
    assert!(value.get("subject_crop_keyframes").is_none());
}

#[test]
fn video_object_fields_omit_absent_optional_fields() {
    let fields = VideoObjectFields::default();

    let value = serde_json::to_value(&fields).expect("VideoObjectFields must serialise");

    assert!(value.get("filePath").is_none());
    assert!(value.get("proxyFilePath").is_none());
    assert!(value.get("sourceWidth").is_none());
    assert!(value.get("sourceHeight").is_none());
    assert!(value.get("subjectCropEnabled").is_none());
    assert!(value.get("subjectCropKeyframes").is_none());
    assert!(value.get("reversed").is_none());
}
