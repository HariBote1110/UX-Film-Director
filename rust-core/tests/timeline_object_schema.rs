//! R4-1a: `BaseObject` / `TimelineObject`（file-format scaffolding）の固定。
//!
//! `src/types.ts` の `BaseObject` と `TimelineObject`（42 kind の判別共用体）が
//! Rust 側にミラーされ、`type` タグでの判別デシリアライズ・camelCase 命名・
//! 未知 kind の拒否・代表 kind のラウンドトリップを保つことを固定する。

use uxfd_rust_core::{
    AudioObjectFields, BaseObject, Easing, ImageObjectFields, ParticleObjectFields,
    PsdObjectFields, TextObjectFields, TimelineObject, VideoObjectFields,
};

fn sample_base() -> BaseObject {
    BaseObject {
        id: "obj-1".to_string(),
        group_id: None,
        name: "Sample".to_string(),
        layer: 0.0,
        start_time: 0.0,
        duration: 5.0,
        offset: None,
        x: 0.0,
        y: 0.0,
        rotation: 0.0,
        scale_x: 1.0,
        scale_y: 1.0,
        opacity: 1.0,
        enable_animation: false,
        end_x: 0.0,
        end_y: 0.0,
        easing: Easing::Linear,
        motion_path: None,
        keyframes: None,
        shadow: None,
        filters: None,
        group_gradient: None,
        clipping: None,
        custom_clipping: None,
        color_correction: None,
        vibration: None,
    }
}

#[test]
fn base_object_serialises_with_camel_case_field_names_and_omits_absent_optionals() {
    let base = sample_base();

    let value = serde_json::to_value(&base).expect("BaseObject must serialise");

    assert_eq!(value["id"], "obj-1");
    assert_eq!(value["startTime"], 0.0);
    assert_eq!(value["enableAnimation"], false);
    assert_eq!(value["endX"], 0.0);
    assert_eq!(value["endY"], 0.0);
    assert_eq!(value["scaleX"], 1.0);
    assert_eq!(value["scaleY"], 1.0);

    // `?:` フィールドは値がないとき JSON キー自体を出さない。
    assert!(value.get("groupId").is_none());
    assert!(value.get("offset").is_none());
    assert!(value.get("motionPath").is_none());
    assert!(value.get("keyframes").is_none());
    assert!(value.get("shadow").is_none());
    assert!(value.get("filters").is_none());
    assert!(value.get("groupGradient").is_none());
    assert!(value.get("clipping").is_none());
    assert!(value.get("customClipping").is_none());
    assert!(value.get("colorCorrection").is_none());
    assert!(value.get("vibration").is_none());

    // snake_case のキーは出ない。
    assert!(value.get("group_id").is_none());
    assert!(value.get("start_time").is_none());
    assert!(value.get("enable_animation").is_none());
}

#[test]
fn timeline_object_dispatches_on_type_tag_to_shape_variant() {
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let obj = value.as_object_mut().unwrap();
    obj.insert("type".to_string(), serde_json::json!("shape"));
    obj.insert("shapeType".to_string(), serde_json::json!("rect"));
    obj.insert("width".to_string(), serde_json::json!(200.0));
    obj.insert("height".to_string(), serde_json::json!(100.0));
    obj.insert("fill".to_string(), serde_json::json!("#ff0000"));

    let parsed: TimelineObject =
        serde_json::from_value(value).expect("shape kind must deserialise");

    match parsed {
        TimelineObject::Shape { base, fields } => {
            assert_eq!(base.id, "obj-1");
            assert_eq!(fields.width, 200.0);
        }
        other => panic!("expected Shape variant, got {other:?}"),
    }
}

#[test]
fn timeline_object_rejects_unknown_type_tag() {
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    value
        .as_object_mut()
        .unwrap()
        .insert("type".to_string(), serde_json::json!("not_a_real_kind"));

    let parsed: Result<TimelineObject, _> = serde_json::from_value(value);
    assert!(parsed.is_err(), "unknown `type` tag must be rejected");
}

fn round_trip(value: serde_json::Value) -> TimelineObject {
    let parsed: TimelineObject = serde_json::from_value(value.clone())
        .unwrap_or_else(|e| panic!("failed to deserialise {value}: {e}"));
    let re_serialised = serde_json::to_value(&parsed).expect("must re-serialise");
    let reparsed: TimelineObject =
        serde_json::from_value(re_serialised).expect("must round-trip cleanly");
    assert_eq!(parsed, reparsed);
    parsed
}

#[test]
fn round_trips_shape_kind() {
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let obj = value.as_object_mut().unwrap();
    obj.insert("type".to_string(), serde_json::json!("shape"));
    obj.insert("shapeType".to_string(), serde_json::json!("rect"));
    obj.insert("width".to_string(), serde_json::json!(200.0));
    obj.insert("height".to_string(), serde_json::json!(100.0));
    obj.insert("fill".to_string(), serde_json::json!("#ff0000"));

    assert!(matches!(round_trip(value), TimelineObject::Shape { .. }));
}

#[test]
fn round_trips_text_kind() {
    let fields = TextObjectFields::default();
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let fields_value = serde_json::to_value(&fields).unwrap();
    let obj = value.as_object_mut().unwrap();
    for (k, v) in fields_value.as_object().unwrap() {
        obj.insert(k.clone(), v.clone());
    }
    obj.insert("type".to_string(), serde_json::json!("text"));

    assert!(matches!(round_trip(value), TimelineObject::Text { .. }));
}

#[test]
fn round_trips_image_kind() {
    let fields = ImageObjectFields::default();
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let fields_value = serde_json::to_value(&fields).unwrap();
    let obj = value.as_object_mut().unwrap();
    for (k, v) in fields_value.as_object().unwrap() {
        obj.insert(k.clone(), v.clone());
    }
    obj.insert("type".to_string(), serde_json::json!("image"));
    // `src` is required by ImageObjectFields but absent from its Default; add it.
    obj.entry("src")
        .or_insert_with(|| serde_json::json!("image.png"));

    assert!(matches!(round_trip(value), TimelineObject::Image { .. }));
}

#[test]
fn round_trips_video_kind() {
    let fields = VideoObjectFields::default();
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let fields_value = serde_json::to_value(&fields).unwrap();
    let obj = value.as_object_mut().unwrap();
    for (k, v) in fields_value.as_object().unwrap() {
        obj.insert(k.clone(), v.clone());
    }
    obj.insert("type".to_string(), serde_json::json!("video"));
    obj.entry("src")
        .or_insert_with(|| serde_json::json!("video.mp4"));

    assert!(matches!(round_trip(value), TimelineObject::Video { .. }));
}

#[test]
fn round_trips_audio_kind() {
    let fields = AudioObjectFields::default();
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let fields_value = serde_json::to_value(&fields).unwrap();
    let obj = value.as_object_mut().unwrap();
    for (k, v) in fields_value.as_object().unwrap() {
        obj.insert(k.clone(), v.clone());
    }
    obj.insert("type".to_string(), serde_json::json!("audio"));
    obj.entry("src")
        .or_insert_with(|| serde_json::json!("audio.wav"));

    assert!(matches!(round_trip(value), TimelineObject::Audio { .. }));
}

#[test]
fn round_trips_psd_kind() {
    let fields = PsdObjectFields::default();
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let fields_value = serde_json::to_value(&fields).unwrap();
    let obj = value.as_object_mut().unwrap();
    for (k, v) in fields_value.as_object().unwrap() {
        obj.insert(k.clone(), v.clone());
    }
    obj.insert("type".to_string(), serde_json::json!("psd"));
    obj.entry("src")
        .or_insert_with(|| serde_json::json!("layers.psd"));

    assert!(matches!(round_trip(value), TimelineObject::Psd { .. }));
}

#[test]
fn round_trips_a_generated_kind_particle() {
    let fields = ParticleObjectFields::default();
    let mut value = serde_json::to_value(&sample_base()).unwrap();
    let fields_value = serde_json::to_value(&fields).unwrap();
    let obj = value.as_object_mut().unwrap();
    for (k, v) in fields_value.as_object().unwrap() {
        obj.insert(k.clone(), v.clone());
    }
    obj.insert("type".to_string(), serde_json::json!("particle"));

    assert!(matches!(round_trip(value), TimelineObject::Particle { .. }));
}
