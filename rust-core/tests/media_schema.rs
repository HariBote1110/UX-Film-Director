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

#[test]
fn rust_core_accepts_generated_particle_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "particle-1",
        "kind": "GeneratedParticle",
        "source": "{\"generator\":\"standard-particle\",\"seed\":93,\"particle_count\":16,\"spread\":180,\"speed\":120,\"size\":6,\"colour\":\"#ffffff\",\"lifetime_seconds\":1.5}",
        "width": 640,
        "height": 360
    }))
    .expect("GeneratedParticle media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedParticle);
    assert_eq!(media.width, 640);
    assert_eq!(media.height, 360);
}

#[test]
fn rust_core_accepts_generated_barcode_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "barcode-1",
        "kind": "GeneratedBarcode",
        "source": "{\"generator\":\"barcode-t\",\"data\":\"AviUtl\",\"minimum_bar_width\":2,\"horizontal_margin\":30,\"vertical_margin\":20,\"foreground_colour\":\"#000000\",\"background_colour\":\"#ffffff\"}",
        "width": 420,
        "height": 160
    }))
    .expect("GeneratedBarcode media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedBarcode);
    assert_eq!(media.width, 420);
    assert_eq!(media.height, 160);
}
