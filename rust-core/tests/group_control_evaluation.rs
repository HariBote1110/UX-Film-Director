use uxfd_rust_core::{evaluate_frame, Project};

fn project_with_group_controls() -> Project {
    serde_json::from_str(
        r##"
        {
          "id": "group-control-project",
          "version": 1,
          "size": { "width": 1920, "height": 1080 },
          "fps": { "numerator": 60, "denominator": 1 },
          "colour": {
            "profile": "rec709-sdr",
            "working_space": "linear-light",
            "alpha": "premultiplied"
          },
          "media": [
            { "id": "shape-1", "kind": "SolidColour", "source": "#ffffff" },
            { "id": "shape-2", "kind": "SolidColour", "source": "#000000" }
          ],
          "tracks": [
            {
              "id": "layer-2",
              "clips": [
                {
                  "id": "clip-target",
                  "media_id": "shape-1",
                  "kind": "SolidColourPlane",
                  "start_frame": 0,
                  "duration_frames": 180,
                  "transform": {
                    "translation_x": 10,
                    "translation_y": 20,
                    "scale_x": 2,
                    "scale_y": 3,
                    "rotation_degrees": 5,
                    "sampling": "nearest"
                  },
                  "opacity": 0.8
                }
              ]
            },
            {
              "id": "layer-5",
              "clips": [
                {
                  "id": "clip-outside",
                  "media_id": "shape-2",
                  "kind": "SolidColourPlane",
                  "start_frame": 0,
                  "duration_frames": 180,
                  "opacity": 1
                }
              ]
            }
          ],
          "group_controls": [
            {
              "id": "control-a",
              "start_frame": 30,
              "duration_frames": 120,
              "transform": {
                "translation_x": 4,
                "translation_y": 6,
                "scale_x": 0.5,
                "scale_y": 2,
                "rotation_degrees": 10,
                "sampling": "nearest"
              },
              "opacity": 0.5,
              "position_keyframes": [
                {
                  "frame_offset": 0,
                  "x": 4,
                  "y": 6,
                  "easing": "linear"
                },
                {
                  "frame_offset": 60,
                  "x": 14,
                  "y": 16,
                  "easing": "linear"
                }
              ],
              "target_track_ids": ["layer-2"]
            },
            {
              "id": "control-b",
              "start_frame": 0,
              "duration_frames": 180,
              "transform": {
                "translation_x": 1,
                "translation_y": 2,
                "scale_x": 2,
                "scale_y": 0.5,
                "rotation_degrees": -5,
                "sampling": "nearest"
              },
              "opacity": 0.5,
              "target_track_ids": ["layer-2"]
            }
          ]
        }
        "##,
    )
    .expect("group control project must deserialize")
}

#[test]
fn active_group_controls_are_accumulated_without_becoming_scene_clips() {
    let snapshot = evaluate_frame(&project_with_group_controls(), 60);
    assert_eq!(snapshot.clips.len(), 2);

    let target = snapshot
        .clips
        .iter()
        .find(|clip| clip.clip_id == "clip-target")
        .expect("target clip");
    assert!((target.transform.translation_x - 20.0).abs() < 1e-6);
    assert!((target.transform.translation_y - 33.0).abs() < 1e-6);
    assert!((target.transform.scale_x - 2.0).abs() < 1e-6);
    assert!((target.transform.scale_y - 3.0).abs() < 1e-6);
    assert!((target.transform.rotation_degrees - 10.0).abs() < 1e-6);
    assert!((target.opacity - 0.2).abs() < 1e-6);

    let outside = snapshot
        .clips
        .iter()
        .find(|clip| clip.clip_id == "clip-outside")
        .expect("outside clip");
    assert_eq!(outside.transform.translation_x, 0.0);
    assert_eq!(outside.opacity, 1.0);
}

#[test]
fn group_control_uses_a_half_open_time_range() {
    let project = project_with_group_controls();
    let before = evaluate_frame(&project, 29);
    let at_end = evaluate_frame(&project, 150);

    for snapshot in [before, at_end] {
        let target = snapshot
            .clips
            .iter()
            .find(|clip| clip.clip_id == "clip-target")
            .expect("target clip");
        assert_eq!(target.transform.translation_x, 11.0);
        assert_eq!(target.transform.translation_y, 22.0);
        assert_eq!(target.opacity, 0.4);
    }
}
