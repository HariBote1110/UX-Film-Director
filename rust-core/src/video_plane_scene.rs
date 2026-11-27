use crate::schema::MediaKind;
use crate::solid_colour_scene::{CanvasSize, SceneMediaReference};
use crate::timeline::SceneSnapshot;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VideoPlane {
    pub clip_id: String,
    pub media_id: String,
    pub source_frame: u64,
    pub z_index: u32,
    pub opacity: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VideoPlaneVertexScene {
    pub plane_count: u32,
    pub planes: Vec<VideoPlane>,
    pub vertices: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum VideoPlaneSceneError {
    InvalidCanvasSize { width: u32, height: u32 },
}

pub fn build_video_plane_vertex_scene(
    snapshot: &SceneSnapshot,
    media: &[SceneMediaReference],
    canvas: CanvasSize,
) -> Result<VideoPlaneVertexScene, VideoPlaneSceneError> {
    if canvas.width == 0 || canvas.height == 0 {
        return Err(VideoPlaneSceneError::InvalidCanvasSize {
            width: canvas.width,
            height: canvas.height,
        });
    }

    let media_by_id: HashMap<&str, &SceneMediaReference> = media
        .iter()
        .map(|reference| (reference.id.as_str(), reference))
        .collect();
    let mut clips = snapshot.clips.clone();
    clips.sort_by_key(|clip| clip.z_index);

    let mut planes = Vec::new();
    let mut vertices = Vec::new();
    for clip in clips {
        let Some(reference) = media_by_id.get(clip.media_id.as_str()) else {
            continue;
        };
        if reference.kind != MediaKind::Video {
            continue;
        }

        planes.push(VideoPlane {
            clip_id: clip.clip_id.clone(),
            media_id: clip.media_id.clone(),
            source_frame: clip.source_frame,
            z_index: clip.z_index,
            opacity: clamp01(clip.opacity),
        });
        push_video_plane_vertices(
            &mut vertices,
            clip.transform.translation_x,
            clip.transform.translation_y,
            reference.width as f32 * clip.transform.scale_x,
            reference.height as f32 * clip.transform.scale_y,
            clamp01(clip.opacity),
            canvas,
        );
    }

    Ok(VideoPlaneVertexScene {
        plane_count: planes.len() as u32,
        planes,
        vertices,
    })
}

fn push_video_plane_vertices(
    vertices: &mut Vec<f32>,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    opacity: f32,
    canvas: CanvasSize,
) {
    let left = pixel_x_to_clip(x, canvas.width);
    let right = pixel_x_to_clip(x + width, canvas.width);
    let top = pixel_y_to_clip(y, canvas.height);
    let bottom = pixel_y_to_clip(y + height, canvas.height);
    let points = [
        (left, top, 0.0, 0.0),
        (right, top, 1.0, 0.0),
        (left, bottom, 0.0, 1.0),
        (left, bottom, 0.0, 1.0),
        (right, top, 1.0, 0.0),
        (right, bottom, 1.0, 1.0),
    ];

    for (clip_x, clip_y, texture_u, texture_v) in points {
        vertices.extend_from_slice(&[clip_x, clip_y, texture_u, texture_v, opacity, 1.0, 0.0, 1.0]);
    }
}

fn pixel_x_to_clip(x: f32, canvas_width: u32) -> f32 {
    (x / canvas_width as f32) * 2.0 - 1.0
}

fn pixel_y_to_clip(y: f32, canvas_height: u32) -> f32 {
    1.0 - (y / canvas_height as f32) * 2.0
}

fn clamp01(value: f32) -> f32 {
    if !value.is_finite() {
        return 0.0;
    }
    value.clamp(0.0, 1.0)
}
