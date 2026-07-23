use crate::keyframe::{evaluate_position_keyframes, evaluate_scalar_keyframes};
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

            clips.push(EvaluatedClip {
                clip_id: clip.id.clone(),
                track_id: track.id.clone(),
                media_id: clip.media_id.clone(),
                source_frame: frame_offset,
                z_index: clips.len() as u32,
                transform,
                opacity: evaluate_scalar_keyframes(
                    &clip.opacity_keyframes,
                    frame_offset,
                    clip.opacity,
                ),
                effects: clip.effects.clone(),
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
