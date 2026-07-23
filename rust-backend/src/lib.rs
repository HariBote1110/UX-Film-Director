mod generated;
mod psd_fast;

use generated::build_generated_getcolor_dots_source_frame;
use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::{MediaKind, SceneMediaReference};

pub fn build_native_generated_source_frame(
    media: &SceneMediaReference,
    _source_frame: u64,
) -> Result<Option<RgbaFrame>, String> {
    match media.kind {
        MediaKind::GeneratedGetColorDots => {
            build_generated_getcolor_dots_source_frame(media).map(Some)
        }
        _ => Ok(None),
    }
}

pub(crate) fn is_jpeg_source(source: &str) -> bool {
    let lower = source.to_ascii_lowercase();
    lower.ends_with(".jpg") || lower.ends_with(".jpeg")
}

pub(crate) fn is_psd_source(source: &str) -> bool {
    source.to_ascii_lowercase().ends_with(".psd")
}

pub(crate) fn local_media_source_path(
    source: &str,
    media_kind: &str,
) -> Result<String, String> {
    let without_query = strip_query_and_fragment(source);
    let Some(file_url_path) = without_query.strip_prefix("file://") else {
        if has_url_scheme(without_query) {
            return Err(format!(
                "Only local file paths or file URLs are supported for {media_kind} media, got '{source}'"
            ));
        }
        return Ok(without_query.to_string());
    };

    let local_path = if let Some(path) = file_url_path.strip_prefix("localhost/") {
        format!("/{path}")
    } else if file_url_path.starts_with('/') {
        file_url_path.to_string()
    } else {
        return Err(format!(
            "Only local file URLs are supported for {media_kind} media, got '{source}'"
        ));
    };

    percent_decode_utf8(&local_path).map_err(|error| {
        format!("Invalid percent-encoded Image media file URL '{source}': {error}")
    })
}

fn has_url_scheme(source: &str) -> bool {
    let Some(colon_index) = source.find(':') else {
        return false;
    };
    let scheme = &source[..colon_index];
    if scheme.len() == 1 && is_windows_drive_path(source) {
        return false;
    }
    let mut chars = scheme.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphabetic())
        && chars.all(|value| value.is_ascii_alphanumeric() || matches!(value, '+' | '.' | '-'))
}

fn is_windows_drive_path(source: &str) -> bool {
    let bytes = source.as_bytes();
    bytes.len() >= 3
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
        && bytes[0].is_ascii_alphabetic()
}

fn strip_query_and_fragment(source: &str) -> &str {
    let query_index = source.find('?');
    let fragment_index = source.find('#');
    match (query_index, fragment_index) {
        (Some(query), Some(fragment)) => &source[..query.min(fragment)],
        (Some(query), None) => &source[..query],
        (None, Some(fragment)) => &source[..fragment],
        (None, None) => source,
    }
}

fn percent_decode_utf8(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("truncated percent escape".to_string());
            }
            let high =
                hex_value(bytes[index + 1]).ok_or_else(|| "invalid percent escape".to_string())?;
            let low =
                hex_value(bytes[index + 2]).ok_or_else(|| "invalid percent escape".to_string())?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).map_err(|error| error.to_string())
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_generated_source_builder_supports_solid_colour_for_direct_present() {
        let media = SceneMediaReference {
            id: "solid-colour".to_string(),
            kind: MediaKind::SolidColour,
            source: "#123456".to_string(),
            width: 2,
            height: 1,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

        let frame = build_native_generated_source_frame(&media, 0)
            .expect("solid colour generation must succeed")
            .expect("solid colour must be available to direct CAMetalLayer presentation");

        assert_eq!((frame.width, frame.height), (2, 1));
        assert_eq!(
            frame.pixels,
            vec![0x12, 0x34, 0x56, 0xff, 0x12, 0x34, 0x56, 0xff]
        );
    }
}
