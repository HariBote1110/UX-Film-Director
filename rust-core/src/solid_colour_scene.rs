use crate::schema::{Fps, MediaKind};
use crate::timeline::SceneSnapshot;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanvasSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SceneMediaReference {
    pub id: String,
    pub kind: MediaKind,
    pub source: String,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub source_rate: Option<Fps>,
    #[serde(default)]
    pub active_layer_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct NormalisedColour {
    pub red: f32,
    pub green: f32,
    pub blue: f32,
    pub alpha: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SolidColourRect {
    pub clip_id: String,
    pub z_index: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub colour: NormalisedColour,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SolidColourVertexScene {
    pub rect_count: u32,
    pub vertices: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolidColourSceneError {
    UnsupportedColourSource { media_id: String, detail: String },
    InvalidCanvasSize { width: u32, height: u32 },
}

pub fn build_solid_colour_draw_list(
    snapshot: &SceneSnapshot,
    media: &[SceneMediaReference],
) -> Result<Vec<SolidColourRect>, SolidColourSceneError> {
    let media_by_id: HashMap<&str, &SceneMediaReference> = media
        .iter()
        .map(|reference| (reference.id.as_str(), reference))
        .collect();
    let mut clips = snapshot.clips.clone();
    clips.sort_by_key(|clip| clip.z_index);

    let mut rects = Vec::new();
    for clip in clips {
        let Some(reference) = media_by_id.get(clip.media_id.as_str()) else {
            continue;
        };
        if reference.kind != MediaKind::SolidColour {
            continue;
        }

        let colour = parse_solid_colour(&reference.source).map_err(|detail| {
            SolidColourSceneError::UnsupportedColourSource {
                media_id: reference.id.clone(),
                detail,
            }
        })?;
        let alpha = clamp01(colour.alpha * clip.opacity);
        rects.push(SolidColourRect {
            clip_id: clip.clip_id,
            z_index: clip.z_index,
            x: clip.transform.translation_x,
            y: clip.transform.translation_y,
            width: reference.width as f32 * clip.transform.scale_x,
            height: reference.height as f32 * clip.transform.scale_y,
            colour: NormalisedColour {
                red: colour.red * alpha,
                green: colour.green * alpha,
                blue: colour.blue * alpha,
                alpha,
            },
        });
    }

    Ok(rects)
}

pub fn build_solid_colour_vertex_scene(
    snapshot: &SceneSnapshot,
    media: &[SceneMediaReference],
    canvas: CanvasSize,
) -> Result<SolidColourVertexScene, SolidColourSceneError> {
    if canvas.width == 0 || canvas.height == 0 {
        return Err(SolidColourSceneError::InvalidCanvasSize {
            width: canvas.width,
            height: canvas.height,
        });
    }

    let rects = build_solid_colour_draw_list(snapshot, media)?;
    let mut vertices = Vec::with_capacity(rects.len() * 6 * 6);
    for rect in &rects {
        push_rect_vertices(&mut vertices, rect, canvas);
    }

    Ok(SolidColourVertexScene {
        rect_count: rects.len() as u32,
        vertices,
    })
}

fn parse_solid_colour(source: &str) -> Result<NormalisedColour, String> {
    let source = source.trim();
    let Some(hex) = source.strip_prefix('#') else {
        return Err(unsupported_colour_source_detail());
    };
    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(unsupported_colour_source_detail());
    }

    Ok(NormalisedColour {
        red: hex_channel_to_unit(&hex[0..2])?,
        green: hex_channel_to_unit(&hex[2..4])?,
        blue: hex_channel_to_unit(&hex[4..6])?,
        alpha: 1.0,
    })
}

fn hex_channel_to_unit(hex: &str) -> Result<f32, String> {
    u8::from_str_radix(hex, 16)
        .map(|value| f32::from(value) / 255.0)
        .map_err(|_| unsupported_colour_source_detail())
}

fn unsupported_colour_source_detail() -> String {
    "SolidColour media source must be a #rrggbb hex colour.".to_string()
}

fn push_rect_vertices(vertices: &mut Vec<f32>, rect: &SolidColourRect, canvas: CanvasSize) {
    let left = pixel_x_to_clip(rect.x, canvas.width);
    let right = pixel_x_to_clip(rect.x + rect.width, canvas.width);
    let top = pixel_y_to_clip(rect.y, canvas.height);
    let bottom = pixel_y_to_clip(rect.y + rect.height, canvas.height);
    let points = [
        (left, top),
        (right, top),
        (left, bottom),
        (left, bottom),
        (right, top),
        (right, bottom),
    ];

    for (x, y) in points {
        vertices.extend_from_slice(&[
            x,
            y,
            rect.colour.red,
            rect.colour.green,
            rect.colour.blue,
            rect.colour.alpha,
        ]);
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
