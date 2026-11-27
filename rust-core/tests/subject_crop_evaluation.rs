use uxfd_rust_core::{evaluate_frame, Effect, Project};

fn project_with_subject_crop() -> Project {
    serde_json::from_str(
        r##"
        {
          "id": "subject-crop-project",
          "version": 1,
          "size": { "width": 1920, "height": 1080 },
          "fps": { "numerator": 60, "denominator": 1 },
          "colour": {
            "profile": "rec709-sdr",
            "working_space": "linear-light",
            "alpha": "premultiplied"
          },
          "media": [
            { "id": "video-1", "kind": "Video", "source": "/tmp/video.mp4" }
          ],
          "tracks": [
            {
              "id": "track-1",
              "clips": [
                {
                  "id": "clip-1",
                  "media_id": "video-1",
                  "kind": "VideoPlane",
                  "start_frame": 60,
                  "duration_frames": 120,
                  "transform": {
                    "translation_x": 0,
                    "translation_y": 0,
                    "scale_x": 1,
                    "scale_y": 1,
                    "rotation_degrees": 0,
                    "sampling": "bilinear"
                  },
                  "opacity": 1,
                  "opacity_keyframes": [],
                  "position_keyframes": [],
                  "effects": [],
                  "subject_crop": {
                    "source_width": 640,
                    "source_height": 360,
                    "keyframes": [
                      {
                        "frame_offset": 0,
                        "x": 0,
                        "y": 0,
                        "width": 1,
                        "height": 1
                      },
                      {
                        "frame_offset": 60,
                        "x": 0.25,
                        "y": 0.1,
                        "width": 0.5,
                        "height": 0.8
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
        "##,
    )
    .expect("subject crop project must deserialize")
}

#[test]
fn subject_crop_is_evaluated_in_rust_from_clip_local_frame_offset() {
    let snapshot = evaluate_frame(&project_with_subject_crop(), 90);
    let effect = snapshot.clips[0]
        .effects
        .last()
        .expect("subject crop must append a clipping effect");

    match effect {
        Effect::Clipping {
            top,
            bottom,
            left,
            right,
            angle_degrees,
        } => {
            assert!((*top - 18.0).abs() < 1e-4);
            assert!((*bottom - 18.0).abs() < 1e-4);
            assert!((*left - 80.0).abs() < 1e-4);
            assert!((*right - 80.0).abs() < 1e-4);
            assert_eq!(*angle_degrees, 0.0);
        }
        other => panic!("expected clipping effect, got {other:?}"),
    }
}

#[test]
fn subject_crop_clamps_before_first_and_after_last_keyframe() {
    let project = project_with_subject_crop();
    let at_start = evaluate_frame(&project, 60);
    let after_last = evaluate_frame(&project, 150);

    assert!(matches!(
        at_start.clips[0].effects.last(),
        Some(Effect::Clipping {
            top,
            bottom,
            left,
            right,
            ..
        }) if *top == 0.0 && *bottom == 0.0 && *left == 0.0 && *right == 0.0
    ));
    assert!(matches!(
        after_last.clips[0].effects.last(),
        Some(Effect::Clipping {
            top,
            bottom,
            left,
            right,
            ..
        }) if (*top - 36.0).abs() < 1e-4
            && (*bottom - 36.0).abs() < 1e-4
            && (*left - 160.0).abs() < 1e-4
            && (*right - 160.0).abs() < 1e-4
    ));
}
