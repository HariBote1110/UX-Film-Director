use std::time::Duration;

use napi::bindgen_prelude::Uint8Array;
use napi_derive::napi;
use uxfd_shared_video_frame_bridge::{
    copy_shared_frame_into_upload_buffer, SharedVideoFrameBridgeError,
};

const COPY_TIMEOUT: Duration = Duration::from_millis(100);
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

#[napi(object)]
pub struct SharedVideoFrameCopyPayload {
    pub memory_id: String,
    pub slot_count: u32,
    pub slot_byte_len: u32,
    pub pts_frame: f64,
}

#[napi(object)]
pub struct SharedVideoFrameCopyReport {
    pub sequence: f64,
    pub byte_len: u32,
    pub expected_checksum: u32,
    pub actual_checksum: u32,
}

#[napi(object)]
pub struct SharedVideoFrameCopyResponse {
    pub success: bool,
    pub result: Option<SharedVideoFrameCopyReport>,
    pub error: Option<String>,
}

#[napi(object)]
pub struct DebugFillReport {
    pub byte_len: u32,
    pub fill_value: u32,
}

#[napi(js_name = "copyIntoUploadBuffer")]
pub fn copy_into_upload_buffer(
    payload: SharedVideoFrameCopyPayload,
    mut target: Uint8Array,
) -> SharedVideoFrameCopyResponse {
    let sequence = match safe_frame_sequence(payload.pts_frame) {
        Ok(sequence) => sequence,
        Err(error) => return copy_failure(error),
    };
    let target_slice = unsafe { target.as_mut() };
    let slot_byte_len = payload.slot_byte_len as usize;

    match copy_shared_frame_into_upload_buffer(
        &payload.memory_id,
        payload.slot_count,
        slot_byte_len,
        sequence,
        target_slice,
        COPY_TIMEOUT,
    ) {
        Ok(report) => SharedVideoFrameCopyResponse {
            success: true,
            result: Some(SharedVideoFrameCopyReport {
                sequence: report.sequence as f64,
                byte_len: report.byte_len as u32,
                expected_checksum: report.expected_checksum,
                actual_checksum: report.actual_checksum,
            }),
            error: None,
        },
        Err(error) => copy_failure(format_bridge_error(error)),
    }
}

#[napi(js_name = "debugFillForTest")]
pub fn debug_fill_for_test(mut target: Uint8Array, fill_value: u32) -> DebugFillReport {
    let byte = (fill_value & 0xff) as u8;
    let target_slice = unsafe { target.as_mut() };
    target_slice.fill(byte);

    DebugFillReport {
        byte_len: target_slice.len() as u32,
        fill_value: byte as u32,
    }
}

fn safe_frame_sequence(value: f64) -> Result<u64, String> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > MAX_SAFE_INTEGER {
        return Err(format!(
            "ptsFrame must be a safe non-negative integer, got {value}"
        ));
    }

    Ok(value as u64)
}

fn copy_failure(error: String) -> SharedVideoFrameCopyResponse {
    SharedVideoFrameCopyResponse {
        success: false,
        result: None,
        error: Some(error),
    }
}

fn format_bridge_error(error: SharedVideoFrameBridgeError) -> String {
    match error {
        SharedVideoFrameBridgeError::UploadBufferLengthMismatch { expected, actual } => {
            format!("UploadBufferLengthMismatch: expected {expected} bytes, got {actual} bytes")
        }
        SharedVideoFrameBridgeError::SharedMemory(error) => {
            format!("SharedMemory: {error:?}")
        }
    }
}
