use serde::Deserialize;

#[derive(Deserialize)]
struct FocusLinesFrameBucketSource {
    // R3 バッチ5で `focus_lines_plus` の wire を `FocusLinesPlusObjectFields`
    // (camelCase) へ統一したため、この補助構造体も同じ命名に揃える。
    #[serde(rename = "keyframeInterval")]
    keyframe_interval: f32,
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
    let keyframe_interval = parsed.keyframe_interval.max(0.0).round() as u64;
    Ok(focus_lines_frame_bucket(keyframe_interval, source_frame))
}
