use uxfd_rust_core::{
    build_solid_colour_draw_list, build_solid_colour_vertex_scene, CanvasSize, ColourPipeline,
    EvaluatedClip, MediaKind, SamplingMode, SceneMediaReference, SceneSnapshot,
    SolidColourSceneError, Transform,
};

fn solid_colour_snapshot() -> SceneSnapshot {
    SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![
            EvaluatedClip {
                clip_id: "image-1".to_string(),
                track_id: "layer-0".to_string(),
                media_id: "image-1".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            },
            EvaluatedClip {
                clip_id: "shape-1".to_string(),
                track_id: "layer-1".to_string(),
                media_id: "shape-1".to_string(),
                source_frame: 0,
                z_index: 1,
                transform: Transform {
                    translation_x: 300.0,
                    translation_y: 120.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation_degrees: 0.0,
                    sampling: SamplingMode::Nearest,
                },
                opacity: 0.5,
                effects: Vec::new(),
            },
        ],
    }
}

fn solid_colour_media(source: &str) -> Vec<SceneMediaReference> {
    vec![
        SceneMediaReference {
            id: "image-1".to_string(),
            kind: MediaKind::Image,
            source: "/tmp/image.png".to_string(),
            width: 640,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        },
        SceneMediaReference {
            id: "shape-1".to_string(),
            kind: MediaKind::SolidColour,
            source: source.to_string(),
            width: 200,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        },
    ]
}

#[test]
fn rust_core_builds_premultiplied_solid_colour_rectangles() {
    let rects =
        build_solid_colour_draw_list(&solid_colour_snapshot(), &solid_colour_media("#ff0000"))
            .expect("solid colour draw list");

    assert_eq!(rects.len(), 1);
    assert_eq!(rects[0].clip_id, "shape-1");
    assert_eq!(rects[0].z_index, 1);
    assert_eq!(rects[0].x, 300.0);
    assert_eq!(rects[0].y, 120.0);
    assert_eq!(rects[0].width, 200.0);
    assert_eq!(rects[0].height, 100.0);
    assert_eq!(rects[0].colour.red, 0.5);
    assert_eq!(rects[0].colour.green, 0.0);
    assert_eq!(rects[0].colour.blue, 0.0);
    assert_eq!(rects[0].colour.alpha, 0.5);
}

#[test]
fn rust_core_builds_webgpu_vertices_for_solid_colour_rectangles() {
    let scene = build_solid_colour_vertex_scene(
        &solid_colour_snapshot(),
        &solid_colour_media("#ff0000"),
        CanvasSize {
            width: 1920,
            height: 1080,
        },
    )
    .expect("solid colour vertex scene");

    assert_eq!(scene.rect_count, 1);
    assert_eq!(scene.vertices.len(), 36);
    assert_eq!(
        &scene.vertices[0..6],
        &[-0.6875, 0.7777778, 0.5, 0.0, 0.0, 0.5]
    );
}

#[test]
fn rust_core_fails_loud_for_invalid_solid_colour_sources() {
    let error = build_solid_colour_draw_list(&solid_colour_snapshot(), &solid_colour_media("red"))
        .expect_err("invalid colour source must fail");

    assert_eq!(
        error,
        SolidColourSceneError::UnsupportedColourSource {
            media_id: "shape-1".to_string(),
            detail: "SolidColour media source must be a #rrggbb hex colour.".to_string(),
        }
    );
}
