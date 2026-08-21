//! R3: `audio_sphere` kind の編集モデル正本。`src/types.ts` の
//! `AudioSphereObject` 固有部分 (`AudioSphereObjectFields`) が Rust 側で
//! 定義され、既定値・wire 上の camelCase 命名を保つことを固定する。

use uxfd_rust_core::AudioSphereObjectFields;

#[test]
fn audio_sphere_object_fields_default_matches_existing_ui_defaults() {
    // TimelineContextMenu.tsx 経由の buildAviUtlAudioSphereObject
    // （src/utils/objectFactories/audioSphereObjectFactory.ts）が今日生成している
    // 既定値と一致させる。width/height はプロジェクトサイズから都度計算されるため
    // 固定既定値が無く、ニュートラルな 0 にする。
    let defaults = AudioSphereObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.columns, 16);
    assert_eq!(defaults.rows, 12);
    assert_eq!(defaults.base_radius, 170.0);
    assert_eq!(defaults.audio_influence, 0.6);
    assert_eq!(defaults.point_size, 5.0);
    assert_eq!(defaults.polygon_size, 0.35);
    assert_eq!(defaults.random_amount, 0.05);
    assert_eq!(defaults.colour, "#36c2ff");
    assert_eq!(defaults.target_audio_id, None);
    assert_eq!(defaults.target_layer, None);
    assert_eq!(defaults.sample_window_seconds, 0.1);
    assert_eq!(defaults.seed, 93);
}

#[test]
fn audio_sphere_object_fields_serialise_with_camel_case_field_names() {
    let fields = AudioSphereObjectFields {
        width: 240.0,
        height: 240.0,
        columns: 20,
        rows: 14,
        base_radius: 100.0,
        audio_influence: 0.8,
        point_size: 6.0,
        polygon_size: 0.4,
        random_amount: 0.1,
        colour: "#ff00ff".to_string(),
        target_audio_id: Some("audio-1".to_string()),
        target_layer: Some(2),
        sample_window_seconds: 0.2,
        seed: 42,
    };

    let value = serde_json::to_value(&fields).expect("AudioSphereObjectFields must serialise");

    assert_eq!(value["baseRadius"], 100.0);
    assert_eq!(value["audioInfluence"], 0.8);
    assert_eq!(value["pointSize"], 6.0);
    assert_eq!(value["polygonSize"], 0.4);
    assert_eq!(value["randomAmount"], 0.1);
    assert_eq!(value["targetAudioId"], "audio-1");
    assert_eq!(value["targetLayer"], 2);
    assert_eq!(value["sampleWindowSeconds"], 0.2);
    assert!(value.get("base_radius").is_none());
    assert!(value.get("target_audio_id").is_none());
}
