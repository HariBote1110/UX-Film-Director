use uxfd_rust_core::{
    build_video_plane_vertex_scene, CanvasSize, ColourPipeline, EvaluatedClip, MediaKind,
    SamplingMode, SceneMediaReference, SceneSnapshot, Transform,
};

fn video_snapshot() -> SceneSnapshot {
    SceneSnapshot {
        frame_index: 210,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![
            EvaluatedClip {
                clip_id: "shape-1".to_string(),
                track_id: "layer-0".to_string(),
                media_id: "shape-1".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            },
            EvaluatedClip {
                clip_id: "video-1".to_string(),
                track_id: "layer-1".to_string(),
                media_id: "video-1".to_string(),
                source_frame: 90,
                z_index: 1,
                transform: Transform {
                    translation_x: 10.0,
                    translation_y: 20.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation_degrees: 0.0,
                    sampling: SamplingMode::Bilinear,
                },
                opacity: 0.75,
                effects: Vec::new(),
            },
        ],
    }
}

fn scene_media() -> Vec<SceneMediaReference> {
    vec![
        SceneMediaReference {
            id: "shape-1".to_string(),
            kind: MediaKind::SolidColour,
            source: "#ff0000".to_string(),
            width: 200,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        },
        SceneMediaReference {
            id: "video-1".to_string(),
            kind: MediaKind::Video,
            source: "/tmp/video.mp4".to_string(),
            width: 1280,
            height: 720,
            source_rate: None,
            active_layer_ids: Vec::new(),
        },
    ]
}

#[test]
fn rust_core_builds_video_plane_vertices_and_metadata() {
    let scene = build_video_plane_vertex_scene(
        &video_snapshot(),
        &scene_media(),
        CanvasSize {
            width: 1920,
            height: 1080,
        },
    )
    .expect("video plane vertex scene");

    assert_eq!(scene.plane_count, 1);
    assert_eq!(scene.planes[0].clip_id, "video-1");
    assert_eq!(scene.planes[0].media_id, "video-1");
    assert_eq!(scene.planes[0].source_frame, 90);
    assert_eq!(scene.planes[0].opacity, 0.75);
    assert_eq!(scene.planes[0].z_index, 1);
    assert_eq!(scene.vertices.len(), 6 * 8);
    assert_eq!(
        &scene.vertices[0..8],
        &[-0.9895833, 0.962963, 0.0, 0.0, 0.75, 1.0, 0.0, 1.0]
    );
}

#[test]
fn rust_core_reports_empty_video_scene_without_touching_other_media() {
    let mut snapshot = video_snapshot();
    snapshot.clips.retain(|clip| clip.media_id != "video-1");

    let scene = build_video_plane_vertex_scene(
        &snapshot,
        &scene_media(),
        CanvasSize {
            width: 1920,
            height: 1080,
        },
    )
    .expect("empty video plane vertex scene");

    assert_eq!(scene.plane_count, 0);
    assert!(scene.planes.is_empty());
    assert!(scene.vertices.is_empty());
}
