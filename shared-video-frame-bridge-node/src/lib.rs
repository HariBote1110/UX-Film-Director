use std::time::Duration;

use napi::bindgen_prelude::Uint8Array;
use napi_derive::napi;
use uxfd_shared_video_frame_bridge::{
    close_writable_shared_frame_ring, copy_shared_frame_into_upload_buffer,
    create_writable_shared_frame_ring, write_into_writable_shared_frame_ring,
    SharedVideoFrameBridgeError,
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
pub struct WritableSharedFrameRingPayload {
    pub memory_id: String,
    pub slot_count: u32,
    pub slot_byte_len: u32,
}

#[napi(object)]
pub struct WritableSharedFrameRingReport {
    pub memory_id: String,
    pub slot_count: u32,
    pub slot_byte_len: u32,
}

#[napi(object)]
pub struct WritableSharedFrameRingResponse {
    pub success: bool,
    pub result: Option<WritableSharedFrameRingReport>,
    pub error: Option<String>,
}

#[napi(object)]
pub struct WritableSharedFrameWritePayload {
    pub memory_id: String,
    pub pts_frame: f64,
}

#[napi(object)]
pub struct WritableSharedFrameWriteReport {
    pub sequence: f64,
    pub byte_len: u32,
    pub checksum: u32,
}

#[napi(object)]
pub struct WritableSharedFrameWriteResponse {
    pub success: bool,
    pub result: Option<WritableSharedFrameWriteReport>,
    pub error: Option<String>,
}

#[napi(object)]
pub struct WritableSharedFrameClosePayload {
    pub memory_id: String,
}

#[napi(object)]
pub struct WritableSharedFrameCloseReport {
    pub memory_id: String,
}

#[napi(object)]
pub struct WritableSharedFrameCloseResponse {
    pub success: bool,
    pub result: Option<WritableSharedFrameCloseReport>,
    pub error: Option<String>,
}

#[napi(object)]
pub struct PresentedFrameCanvasSize {
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct PresentedFrameHandoffPayload {
    pub encode_session_id: String,
    pub memory_id: String,
    pub frame_index: u32,
    pub timestamp_us: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub format: String,
    pub canvas_size: PresentedFrameCanvasSize,
}

#[napi(object)]
pub struct PresentedFrameHandoffColour {
    pub primaries: String,
    pub transfer: String,
    pub matrix: String,
    pub range: String,
}

#[napi(object)]
pub struct PresentedFrameHandoffDescriptor {
    pub memory_id: String,
    pub slot_index: u32,
    pub generation: u32,
    pub byte_offset: u32,
    pub byte_len: u32,
    pub width: u32,
    pub height: u32,
    pub stride_bytes: u32,
    pub format: String,
    pub colour: PresentedFrameHandoffColour,
}

#[napi(object)]
pub struct PresentedFrameHandoffSharedFrame {
    pub descriptor: PresentedFrameHandoffDescriptor,
    pub pts_frame: f64,
}

#[napi(object)]
pub struct PresentedFrameHandoffReport {
    pub session_id: String,
    pub frame_index: u32,
    pub timestamp_us: f64,
    pub slot_count: u32,
    pub frame: PresentedFrameHandoffSharedFrame,
}

#[napi(object)]
pub struct PresentedFrameHandoffResponse {
    pub success: bool,
    pub result: Option<PresentedFrameHandoffReport>,
    pub error: Option<String>,
}

#[napi(object)]
pub struct DebugFillReport {
    pub byte_len: u32,
    pub fill_value: u32,
}

#[napi(js_name = "createWritableSharedFrameRing")]
pub fn create_writable_shared_frame_ring_node(
    payload: WritableSharedFrameRingPayload,
) -> WritableSharedFrameRingResponse {
    match create_writable_shared_frame_ring(
        &payload.memory_id,
        payload.slot_count,
        payload.slot_byte_len as usize,
    ) {
        Ok(report) => WritableSharedFrameRingResponse {
            success: true,
            result: Some(WritableSharedFrameRingReport {
                memory_id: report.memory_id,
                slot_count: report.slot_count,
                slot_byte_len: report.slot_byte_len as u32,
            }),
            error: None,
        },
        Err(error) => writable_ring_failure(format_bridge_error(error)),
    }
}

#[napi(js_name = "writeIntoSharedFrameRing")]
pub fn write_into_shared_frame_ring_node(
    payload: WritableSharedFrameWritePayload,
    source: Uint8Array,
) -> WritableSharedFrameWriteResponse {
    let sequence = match safe_frame_sequence(payload.pts_frame) {
        Ok(sequence) => sequence,
        Err(error) => return writable_write_failure(error),
    };
    let source_slice = source.as_ref();

    match write_into_writable_shared_frame_ring(&payload.memory_id, sequence, source_slice) {
        Ok(report) => WritableSharedFrameWriteResponse {
            success: true,
            result: Some(WritableSharedFrameWriteReport {
                sequence: report.sequence as f64,
                byte_len: report.byte_len as u32,
                checksum: report.checksum,
            }),
            error: None,
        },
        Err(error) => writable_write_failure(format_bridge_error(error)),
    }
}

#[napi(js_name = "closeWritableSharedFrameRing")]
pub fn close_writable_shared_frame_ring_node(
    payload: WritableSharedFrameClosePayload,
) -> WritableSharedFrameCloseResponse {
    match close_writable_shared_frame_ring(&payload.memory_id) {
        Ok(report) => WritableSharedFrameCloseResponse {
            success: true,
            result: Some(WritableSharedFrameCloseReport {
                memory_id: report.memory_id,
            }),
            error: None,
        },
        Err(error) => writable_close_failure(format_bridge_error(error)),
    }
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

#[napi(js_name = "takePresentedFrameSharedFrame")]
pub fn take_presented_frame_shared_frame(
    _payload: PresentedFrameHandoffPayload,
) -> PresentedFrameHandoffResponse {
    presented_frame_handoff_failure(
        "WebGPU texture handoff is not implemented by the shared video frame native addon yet."
            .to_string(),
    )
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

fn writable_ring_failure(error: String) -> WritableSharedFrameRingResponse {
    WritableSharedFrameRingResponse {
        success: false,
        result: None,
        error: Some(error),
    }
}

fn writable_write_failure(error: String) -> WritableSharedFrameWriteResponse {
    WritableSharedFrameWriteResponse {
        success: false,
        result: None,
        error: Some(error),
    }
}

fn writable_close_failure(error: String) -> WritableSharedFrameCloseResponse {
    WritableSharedFrameCloseResponse {
        success: false,
        result: None,
        error: Some(error),
    }
}

fn presented_frame_handoff_failure(error: String) -> PresentedFrameHandoffResponse {
    PresentedFrameHandoffResponse {
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
        SharedVideoFrameBridgeError::SourceBufferLengthMismatch { expected, actual } => {
            format!("SourceBufferLengthMismatch: expected {expected} bytes, got {actual} bytes")
        }
        SharedVideoFrameBridgeError::WritableRingAlreadyExists { memory_id } => {
            format!("WritableRingAlreadyExists: {memory_id}")
        }
        SharedVideoFrameBridgeError::WritableRingNotFound { memory_id } => {
            format!("WritableRingNotFound: {memory_id}")
        }
        SharedVideoFrameBridgeError::WritableRingRegistryPoisoned => {
            "WritableRingRegistryPoisoned".to_string()
        }
        SharedVideoFrameBridgeError::SharedMemory(error) => {
            format!("SharedMemory: {error:?}")
        }
    }
}
