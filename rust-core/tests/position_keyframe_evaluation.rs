use uxfd_rust_core::{evaluate_frame, Project};

fn project_with_position_keyframes(easing: &str) -> Project {
    let value = serde_json::json!({
        "id": "project-position-keyframes",
        "version": 1,
        "size": { "width": 1920, "height": 1080 },
        "fps": { "numerator": 60, "denominator": 1 },
        "colour": {
            "profile": "rec709-sdr",
            "working_space": "linear-light",
            "alpha": "premultiplied"
        },
        "media": [{
            "id": "media-1",
            "kind": "Image",
            "source": "fixtures/layer-001.png"
        }],
        "tracks": [{
            "id": "track-1",
            "clips": [{
                "id": "clip-1",
                "media_id": "media-1",
                "kind": "ImagePlane",
                "start_frame": 100,
                "duration_frames": 40,
                "transform": {
                    "translation_x": 10.0,
                    "translation_y": 20.0,
                    "scale_x": 1.5,
                    "scale_y": 0.5,
                    "rotation_degrees": 15.0,
                    "sampling": "bilinear"
                },
                "opacity": 1.0,
                "opacity_keyframes": [],
                "position_keyframes": [
                    { "frame_offset": 0, "x": 10.0, "y": 20.0, "easing": easing },
                    { "frame_offset": 10, "x": 110.0, "y": 220.0, "easing": "linear" }
                ],
                "effects": []
            }]
        }]
    });
    serde_json::from_value(value).expect("position keyframe project must deserialise")
}

#[test]
fn position_keyframes_use_left_keyframe_linear_easing_and_keep_non_position_transform_fields() {
    let project = project_with_position_keyframes("linear");

    let clip = &evaluate_frame(&project, 105).clips[0];
    assert_eq!(clip.transform.translation_x, 60.0);
    assert_eq!(clip.transform.translation_y, 120.0);
    assert_eq!(clip.transform.scale_x, 1.5);
    assert_eq!(clip.transform.scale_y, 0.5);
    assert_eq!(clip.transform.rotation_degrees, 15.0);
    assert_eq!(clip.transform.sampling, uxfd_rust_core::SamplingMode::Bilinear);
}

#[test]
fn position_keyframes_use_left_keyframe_ease_in_out_cubic() {
    let project = project_with_position_keyframes("easeInOutCubic");

    let clip = &evaluate_frame(&project, 102).clips[0];
    assert!((clip.transform.translation_x - 13.2).abs() < 0.000_01);
    assert!((clip.transform.translation_y - 26.4).abs() < 0.000_01);
}

#[test]
fn position_keyframes_clamp_before_first_and_after_last_keyframe() {
    let project = project_with_position_keyframes("linear");

    let before = &evaluate_frame(&project, 100).clips[0].transform;
    assert_eq!((before.translation_x, before.translation_y), (10.0, 20.0));

    let after = &evaluate_frame(&project, 130).clips[0].transform;
    assert_eq!((after.translation_x, after.translation_y), (110.0, 220.0));
}

#[test]
fn existing_clip_json_without_position_keyframes_uses_an_empty_default() {
    let value = serde_json::json!({
        "id": "project-existing-json",
        "version": 1,
        "size": { "width": 1920, "height": 1080 },
        "fps": { "numerator": 60, "denominator": 1 },
        "colour": {
            "profile": "rec709-sdr",
            "working_space": "linear-light",
            "alpha": "premultiplied"
        },
        "media": [{ "id": "media-1", "kind": "Image", "source": "fixture.png" }],
        "tracks": [{
            "id": "track-1",
            "clips": [{
                "id": "clip-1",
                "media_id": "media-1",
                "kind": "ImagePlane",
                "start_frame": 0,
                "duration_frames": 10,
                "transform": {
                    "translation_x": 33.0,
                    "translation_y": 44.0,
                    "scale_x": 1.0,
                    "scale_y": 1.0,
                    "rotation_degrees": 0.0,
                    "sampling": "nearest"
                },
                "opacity": 1.0,
                "effects": []
            }]
        }]
    });

    let project: Project = serde_json::from_value(value).expect("existing project JSON must remain valid");
    let clip = &evaluate_frame(&project, 0).clips[0];
    assert_eq!((clip.transform.translation_x, clip.transform.translation_y), (33.0, 44.0));
}
