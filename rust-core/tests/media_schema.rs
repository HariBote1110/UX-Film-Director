use uxfd_rust_core::{MediaKind, SceneMediaReference};

#[test]
fn rust_core_accepts_psd_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "psd-1",
        "kind": "Psd",
        "source": "/tmp/standing.psd",
        "width": 512,
        "height": 768,
        "active_layer_ids": ["face-open", "root"]
    }))
    .expect("Psd media kind should deserialize");

    assert_eq!(media.kind, MediaKind::Psd);
    assert_eq!(media.source_rate, None);
    assert_eq!(
        media.active_layer_ids,
        vec!["face-open".to_string(), "root".to_string()]
    );
}

#[test]
fn rust_core_accepts_generated_gradient_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "gradient-1",
        "kind": "GeneratedGradient",
        "source": "{\"type\":\"linear\",\"colours\":[\"#ff0000\",\"#0000ff\"],\"stops\":[0,1],\"direction\":90}",
        "width": 200,
        "height": 100
    }))
    .expect("GeneratedGradient media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedGradient);
    assert_eq!(media.width, 200);
    assert_eq!(media.height, 100);
}
