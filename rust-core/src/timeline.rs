use crate::keyframe::{
    evaluate_position_keyframes, evaluate_scalar_keyframes, evaluate_subject_crop_keyframes,
};
use crate::schema::{Clip, ClipKind, ColourPipeline, Effect, MediaKind, Project, Transform};
use crate::vibration::evaluate_vibration_offset;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SceneSnapshot {
    pub frame_index: u64,
    pub colour: ColourPipeline,
    pub clips: Vec<EvaluatedClip>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
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

            let mut vibration_filters = Vec::new();
            effects.retain(|effect| {
                if let Effect::Vibration { strength, speed } = effect {
                    vibration_filters.push((f64::from(*strength), f64::from(*speed)));
                    false
                } else {
                    true
                }
            });
            let time_seconds = frame_index as f64 * f64::from(project.fps.denominator)
                / f64::from(project.fps.numerator.max(1));
            let (vibration_x, vibration_y) =
                evaluate_vibration_offset(&vibration_filters, time_seconds);
            transform.translation_x += vibration_x as f32;
            transform.translation_y += vibration_y as f32;

            if clip.kind == ClipKind::TextPlane {
                if let Some((offset_x, offset_y)) = text_render_offset(project, &clip.media_id) {
                    let angle = transform.rotation_degrees.to_radians();
                    let local_x = offset_x * transform.scale_x;
                    let local_y = offset_y * transform.scale_y;
                    transform.translation_x -= local_x * angle.cos() - local_y * angle.sin();
                    transform.translation_y -= local_x * angle.sin() + local_y * angle.cos();
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

fn text_render_offset(project: &Project, media_id: &str) -> Option<(f32, f32)> {
    let media = project
        .media
        .iter()
        .find(|media| media.id == media_id && media.kind == MediaKind::Text)?;
    let source: serde_json::Value = serde_json::from_str(&media.source).ok()?;
    let offset_x = source.get("__renderOffsetX")?.as_f64()? as f32;
    let offset_y = source.get("__renderOffsetY")?.as_f64()? as f32;
    Some((offset_x, offset_y))
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
