//! R3: `audio` kind の編集モデル正本。`src/types.ts` の `AudioObject` 固有部分
//! (`AudioObjectFields`) が Rust 側で定義され、既定値・wire 上の camelCase 命名を
//! 保つことを固定する。

use uxfd_rust_core::{AudioObjectFields, AudioLabPhoneme};

#[test]
fn audio_object_fields_default_is_neutral_for_file_derived_values() {
    // `src`/`filePath` は Timeline.tsx の handleAudioChange がファイル選択後の
    // 実データ（生成した blob URL / 選択されたファイルパス）から都度決めるため、
    // 固定既定値が存在しない。ニュートラルな空値にする。
    let defaults = AudioObjectFields::default();

    assert_eq!(defaults.src, "");
    assert!(defaults.file_path.is_none());
    assert!(defaults.lab_data.is_none());
}

#[test]
fn audio_object_fields_default_matches_ui_literal_defaults() {
    // volume/muted は Timeline.tsx の handleAudioChange が常に 1.0/false という
    // 固定リテラルで生成しており（ファイル依存ではない実在の既定値）、
    // shape/text/video と同じくその値を Default にする。
    let defaults = AudioObjectFields::default();

    assert_eq!(defaults.volume, 1.0);
    assert_eq!(defaults.muted, false);
}

#[test]
fn audio_object_fields_serialise_with_camel_case_field_names() {
    let fields = AudioObjectFields {
        src: "blob:http://localhost/voice.wav".to_string(),
        file_path: Some("/tmp/voice.wav".to_string()),
        volume: 0.5,
        muted: true,
        lab_data: Some(vec![AudioLabPhoneme {
            start_time: 0.0,
            end_time: 0.25,
            phoneme: "a".to_string(),
        }]),
    };

    let value = serde_json::to_value(&fields).expect("AudioObjectFields must serialise");

    assert_eq!(value["src"], "blob:http://localhost/voice.wav");
    assert_eq!(value["filePath"], "/tmp/voice.wav");
    assert_eq!(value["volume"], 0.5);
    assert_eq!(value["muted"], true);
    assert_eq!(value["labData"][0]["startTime"], 0.0);
    assert_eq!(value["labData"][0]["endTime"], 0.25);
    assert_eq!(value["labData"][0]["phoneme"], "a");

    assert!(value.get("file_path").is_none());
    assert!(value.get("lab_data").is_none());
}

#[test]
fn audio_object_fields_omit_absent_optional_fields() {
    let fields = AudioObjectFields::default();

    let value = serde_json::to_value(&fields).expect("AudioObjectFields must serialise");

    assert!(value.get("filePath").is_none());
    assert!(value.get("labData").is_none());
}
