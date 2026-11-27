//! R3: `audio_visualization` kind の編集モデル正本。`src/types.ts` の
//! `AudioVisualizationObject` 固有部分 (`AudioVisualizationObjectFields`) が
//! Rust 側で定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::{AudioVisualizationObjectFields, AudioVisualizationType};

#[test]
fn audio_visualization_object_fields_default_matches_existing_ui_defaults() {
    // TimelineContextMenu.tsx の handleAddWaveform が今日生成している既定値
    // (color: '#00ff00', thickness: 2, amplitude: 1.0, visualizationType: 'waveform',
    // targetAudioId: null) と一致させる。width/height はプロジェクトサイズから
    // 都度計算されるため固定既定値が無く、ニュートラルな 0 にする。
    let defaults = AudioVisualizationObjectFields::default();

    assert_eq!(defaults.target_audio_id, None);
    assert_eq!(defaults.target_layer, None);
    assert_eq!(defaults.visualization_type, AudioVisualizationType::Waveform);
    assert_eq!(defaults.color, "#00ff00");
    assert_eq!(defaults.thickness, 2.0);
    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.amplitude, 1.0);
}

#[test]
fn audio_visualization_object_fields_serialise_with_camel_case_field_names() {
    let fields = AudioVisualizationObjectFields {
        target_audio_id: Some("audio-1".to_string()),
        target_layer: Some(3),
        visualization_type: AudioVisualizationType::Waveform,
        color: "#123456".to_string(),
        thickness: 4.0,
        width: 960.0,
        height: 160.0,
        amplitude: 1.25,
    };

    let value = serde_json::to_value(&fields).expect("AudioVisualizationObjectFields must serialise");

    assert_eq!(value["targetAudioId"], "audio-1");
    assert_eq!(value["targetLayer"], 3);
    assert_eq!(value["visualizationType"], "waveform");
    assert!(value.get("target_audio_id").is_none());
    assert!(value.get("target_layer").is_none());
}

#[test]
fn audio_visualization_object_fields_null_target_audio_id_is_serialised_not_omitted() {
    // targetAudioId は `string | null`(存在するが null 許容)であり、
    // targetLayer(省略可能な `number`)と挙動を分ける必要がある。
    let fields = AudioVisualizationObjectFields::default();

    let value = serde_json::to_value(&fields).expect("AudioVisualizationObjectFields must serialise");

    assert!(value.get("targetAudioId").is_some());
    assert!(value["targetAudioId"].is_null());
    assert!(value.get("targetLayer").is_none());
}
