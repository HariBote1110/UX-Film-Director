use uxfd_rust_core::{
    build_video_frame_decode_requests, ColourPipeline, DecodedVideoFrameFormat,
    EvaluatedClip, Fps, MediaKind, SamplingMode, SceneMediaReference, SceneSnapshot,
    VideoDecodeColourContract, Transform,
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
                clip_id: "video-front".to_string(),
                track_id: "layer-2".to_string(),
                media_id: "video-front".to_string(),
                source_frame: 120,
                z_index: 2,
                transform: Transform {
                    translation_x: 0.0,
                    translation_y: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation_degrees: 0.0,
                    sampling: SamplingMode::Bilinear,
                },
                opacity: 1.0,
                effects: Vec::new(),
            },
            EvaluatedClip {
                clip_id: "video-back".to_string(),
                track_id: "layer-1".to_string(),
                media_id: "video-back".to_string(),
                source_frame: 42,
                z_index: 1,
                transform: Transform::identity(),
                opacity: 0.5,
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
            width: 320,
            height: 180,
            source_rate: None,
        },
        SceneMediaReference {
            id: "video-front".to_string(),
            kind: MediaKind::Video,
            source: "/media/front.mp4".to_string(),
            width: 3840,
            height: 2160,
            source_rate: Some(Fps {
                numerator: 60,
                denominator: 1,
            }),
        },
        SceneMediaReference {
            id: "video-back".to_string(),
            kind: MediaKind::Video,
            source: "/media/back.mp4".to_string(),
            width: 1280,
            height: 720,
            source_rate: Some(Fps {
                numerator: 30,
                denominator: 1,
            }),
        },
    ]
}

#[test]
fn rust_core_builds_frame_decode_requests_for_video_clips_in_z_order() {
    let request_set = build_video_frame_decode_requests(&video_snapshot(), &scene_media())
        .expect("video frame decode requests");

    assert_eq!(request_set.request_count, 2);
    assert_eq!(request_set.requests[0].clip_id, "video-back");
    assert_eq!(request_set.requests[0].media_id, "video-back");
    assert_eq!(request_set.requests[0].source, "/media/back.mp4");
    assert_eq!(request_set.requests[0].source_frame, 42);
    assert_eq!(request_set.requests[0].timeline_frame, 210);
    assert_eq!(
        request_set.requests[0].source_rate,
        Fps {
            numerator: 30,
            denominator: 1,
        }
    );
    assert_eq!(request_set.requests[0].width, 1280);
    assert_eq!(request_set.requests[0].height, 720);
    assert_eq!(request_set.requests[0].format, DecodedVideoFrameFormat::Rgba8Srgb);
    assert_eq!(
        request_set.requests[0].colour,
        VideoDecodeColourContract::Rec709SrgbFullRange
    );

    assert_eq!(request_set.requests[1].clip_id, "video-front");
    assert_eq!(request_set.requests[1].source_frame, 120);
}

#[test]
fn rust_core_returns_empty_decode_request_set_when_scene_has_no_video() {
    let mut snapshot = video_snapshot();
    snapshot.clips.retain(|clip| clip.media_id == "shape-1");

    let request_set = build_video_frame_decode_requests(&snapshot, &scene_media())
        .expect("empty video frame decode requests");

    assert_eq!(request_set.request_count, 0);
    assert!(request_set.requests.is_empty());
}
