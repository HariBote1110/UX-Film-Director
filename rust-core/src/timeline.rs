use crate::keyframe::{
    evaluate_position_keyframes, evaluate_scalar_keyframes, evaluate_subject_crop_keyframes,
};
use crate::schema::{Clip, ColourPipeline, Effect, Project, Transform};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SceneSnapshot {
    pub frame_index: u64,
    pub colour: ColourPipeline,
    pub clips: Vec<EvaluatedClip>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvaluatedClip {
    pub clip_id: String,
    pub track_id: String,
    pub media_id: String,
    pub source_frame: u64,
    pub z_index: u32,
    pub transform: Transform,
    pub opacity: f32,
    pub effects: Vec<Effect>,
}

pub fn evaluate_frame(project: &Project, frame_index: u64) -> SceneSnapshot {
    let mut clips = Vec::new();

    for track in &project.tracks {
        for clip in &track.clips {
            if !clip_contains_frame(clip, frame_index) {
                continue;
            }

            let frame_offset = frame_index - clip.start_frame;
            let mut transform = clip.transform.clone();
            (transform.translation_x, transform.translation_y) = evaluate_position_keyframes(
                &clip.position_keyframes,
                frame_offset,
                transform.translation_x,
                transform.translation_y,
            );
            let mut opacity =
                evaluate_scalar_keyframes(&clip.opacity_keyframes, frame_offset, clip.opacity);
            for control in &project.group_controls {
                if !group_control_contains_frame(control, frame_index)
                    || !control.target_track_ids.iter().any(|id| id == &track.id)
                {
                    continue;
                }
                let control_frame_offset = frame_index - control.start_frame;
                let (control_x, control_y) = evaluate_position_keyframes(
                    &control.position_keyframes,
                    control_frame_offset,
                    control.transform.translation_x,
                    control.transform.translation_y,
                );
                transform.translation_x += control_x;
                transform.translation_y += control_y;
                transform.scale_x *= control.transform.scale_x;
                transform.scale_y *= control.transform.scale_y;
                transform.rotation_degrees += control.transform.rotation_degrees;
                opacity *= control.opacity;
            }
            opacity = opacity.clamp(0.0, 1.0);

            let mut effects = clip.effects.clone();
            let mut wipe_animations = clip.wipe_animations.iter().collect::<Vec<_>>();
            wipe_animations.sort_by_key(|animation| animation.effect_index);
            for animation in wipe_animations {
                let linear_progress =
                    (frame_offset as f32 / clip.duration_frames as f32).clamp(0.0, 1.0);
                let progress = if animation.reverse {
                    1.0 - linear_progress
                } else {
                    linear_progress
                };
                effects.insert(
                    (animation.effect_index as usize).min(effects.len()),
                    Effect::Wipe {
                        edge: animation.edge,
                        progress,
                    },
                );
            }
            if let Some(subject_crop) = &clip.subject_crop {
                if let Some((x, y, width, height)) =
                    evaluate_subject_crop_keyframes(&subject_crop.keyframes, frame_offset)
                {
                    effects.push(Effect::Clipping {
                        top: y * subject_crop.source_height,
                        bottom: (1.0 - y - height) * subject_crop.source_height,
                        left: x * subject_crop.source_width,
                        right: (1.0 - x - width) * subject_crop.source_width,
                        angle_degrees: 0.0,
                    });
                }
            }

            clips.push(EvaluatedClip {
                clip_id: clip.id.clone(),
                track_id: track.id.clone(),
                media_id: clip.media_id.clone(),
                source_frame: clip.source_frame_offset.saturating_add(frame_offset),
                z_index: clips.len() as u32,
                transform,
                opacity,
                effects,
            });
        }
    }

    SceneSnapshot {
        frame_index,
        colour: project.colour.clone(),
        clips,
    }
}

fn clip_contains_frame(clip: &Clip, frame_index: u64) -> bool {
    if clip.duration_frames == 0 {
        return false;
    }

    let clip_end = clip.start_frame.saturating_add(clip.duration_frames);
    frame_index >= clip.start_frame && frame_index < clip_end
}

fn group_control_contains_frame(control: &crate::schema::GroupControl, frame_index: u64) -> bool {
    if control.duration_frames == 0 {
        return false;
    }
    let end = control.start_frame.saturating_add(control.duration_frames);
    frame_index >= control.start_frame && frame_index < end
}
