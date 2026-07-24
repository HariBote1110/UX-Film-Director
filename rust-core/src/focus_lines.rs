use serde::Deserialize;

#[derive(Deserialize)]
struct FocusLinesFrameBucketSource {
    keyframe_interval: u64,
}

pub fn focus_lines_frame_bucket(keyframe_interval: u64, source_frame: u64) -> u64 {
    if keyframe_interval == 0 {
        0
    } else {
        source_frame / keyframe_interval
    }
}

pub fn focus_lines_frame_bucket_from_source(
    source: &str,
    source_frame: u64,
) -> Result<u64, String> {
    let parsed: FocusLinesFrameBucketSource =
        serde_json::from_str(source).map_err(|error| error.to_string())?;
    Ok(focus_lines_frame_bucket(
        parsed.keyframe_interval,
        source_frame,
    ))
}
