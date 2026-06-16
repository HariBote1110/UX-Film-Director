use crate::schema::{Fps, MediaKind};
use crate::solid_colour_scene::SceneMediaReference;
use crate::timeline::SceneSnapshot;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DecodedVideoFrameFormat {
    Rgba8Srgb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VideoDecodeColourContract {
    Rec709SrgbFullRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VideoFrameDecodeRequest {
    pub clip_id: String,
    pub media_id: String,
    pub source: String,
    pub source_frame: u64,
    pub source_rate: Fps,
    pub timeline_frame: u64,
    pub width: u32,
    pub height: u32,
    pub format: DecodedVideoFrameFormat,
    pub colour: VideoDecodeColourContract,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VideoFrameDecodeRequestSet {
    pub request_count: u32,
    pub requests: Vec<VideoFrameDecodeRequest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum VideoFrameDecodeRequestError {
    InvalidVideoMediaReference { media_id: String, detail: String },
}

pub fn build_video_frame_decode_requests(
    snapshot: &SceneSnapshot,
    media: &[SceneMediaReference],
) -> Result<VideoFrameDecodeRequestSet, VideoFrameDecodeRequestError> {
    let media_by_id: HashMap<&str, &SceneMediaReference> = media
        .iter()
        .map(|reference| (reference.id.as_str(), reference))
        .collect();
    let mut clips = snapshot.clips.clone();
    clips.sort_by_key(|clip| clip.z_index);

    let mut requests = Vec::new();
    for clip in clips {
        let Some(reference) = media_by_id.get(clip.media_id.as_str()) else {
            continue;
        };
        if reference.kind != MediaKind::Video {
            continue;
        }
        if reference.source.trim().is_empty() {
            return Err(VideoFrameDecodeRequestError::InvalidVideoMediaReference {
                media_id: reference.id.clone(),
                detail: "Video media source must be a non-empty path or URI.".to_string(),
            });
        }
        if reference.width == 0 || reference.height == 0 {
            return Err(VideoFrameDecodeRequestError::InvalidVideoMediaReference {
                media_id: reference.id.clone(),
                detail: format!(
                    "Video media dimensions must be positive, got {}x{}.",
                    reference.width, reference.height
                ),
            });
        }
        let Some(source_rate) = reference.source_rate.clone() else {
            return Err(VideoFrameDecodeRequestError::InvalidVideoMediaReference {
                media_id: reference.id.clone(),
                detail: "Video media source_rate must be present and rational.".to_string(),
            });
        };
        if source_rate.numerator == 0 || source_rate.denominator == 0 {
            return Err(VideoFrameDecodeRequestError::InvalidVideoMediaReference {
                media_id: reference.id.clone(),
                detail: format!(
                    "Video media source_rate must be positive, got {}/{}.",
                    source_rate.numerator, source_rate.denominator
                ),
            });
        }

        requests.push(VideoFrameDecodeRequest {
            clip_id: clip.clip_id,
            media_id: reference.id.clone(),
            source: reference.source.clone(),
            source_frame: clip.source_frame,
            source_rate,
            timeline_frame: snapshot.frame_index,
            width: reference.width,
            height: reference.height,
            format: DecodedVideoFrameFormat::Rgba8Srgb,
            colour: VideoDecodeColourContract::Rec709SrgbFullRange,
        });
    }

    Ok(VideoFrameDecodeRequestSet {
        request_count: requests.len() as u32,
        requests,
    })
}
