use uxfd_rust_core::{evaluate_frame, Effect, Project, WipeEdge};

fn project_with_wipes() -> Project {
    serde_json::from_str(
        r##"
        {
          "id": "wipe-project",
          "version": 1,
          "size": { "width": 1920, "height": 1080 },
          "fps": { "numerator": 60, "denominator": 1 },
          "colour": {
            "profile": "rec709-sdr",
            "working_space": "linear-light",
            "alpha": "premultiplied"
          },
          "media": [
            { "id": "shape-1", "kind": "SolidColour", "source": "#ffffff" }
          ],
          "tracks": [
            {
              "id": "track-1",
              "clips": [
                {
                  "id": "clip-1",
                  "media_id": "shape-1",
                  "kind": "SolidColourPlane",
                  "start_frame": 60,
                  "duration_frames": 120,
                  "transform": {
                    "translation_x": 0,
                    "translation_y": 0,
                    "scale_x": 1,
                    "scale_y": 1,
                    "rotation_degrees": 0,
                    "sampling": "nearest"
                  },
                  "opacity": 1,
                  "effects": [
                    { "LinearGain": { "gain": 0.8 } }
                  ],
                  "wipe_animations": [
                    {
                      "effect_index": 0,
                      "edge": "left",
                      "reverse": false
                    },
                    {
                      "effect_index": 2,
                      "edge": "right",
                      "reverse": true
                    }
                  ]
                }
              ]
            }
          ]
        }
        "##,
    )
    .expect("wipe project must deserialize")
}

#[test]
fn wipes_are_evaluated_in_rust_and_restored_at_their_effect_order() {
    let snapshot = evaluate_frame(&project_with_wipes(), 90);
    assert_eq!(snapshot.clips[0].effects.len(), 3);
    assert!(matches!(
        snapshot.clips[0].effects[0],
        Effect::Wipe {
            edge: WipeEdge::Left,
            progress
        } if (progress - 0.25).abs() < 1e-6
    ));
    assert!(matches!(
        snapshot.clips[0].effects[1],
        Effect::LinearGain { gain } if (gain - 0.8).abs() < 1e-6
    ));
    assert!(matches!(
        snapshot.clips[0].effects[2],
        Effect::Wipe {
            edge: WipeEdge::Right,
            progress
        } if (progress - 0.75).abs() < 1e-6
    ));
}

#[test]
fn wipe_progress_uses_the_clip_half_open_duration() {
    let project = project_with_wipes();
    let start = evaluate_frame(&project, 60);
    let last = evaluate_frame(&project, 179);

    assert!(matches!(
        start.clips[0].effects[0],
        Effect::Wipe { progress, .. } if progress == 0.0
    ));
    assert!(matches!(
        last.clips[0].effects[0],
        Effect::Wipe { progress, .. }
            if (progress - 119.0 / 120.0).abs() < 1e-6
    ));
}
