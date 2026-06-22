use std::time::Duration;

use crate::params::{NativeRenderReleaseSharedFrameParams, NativeRenderSharedFrameSource};
use crate::rpc::{response_error, RpcResponse};
use crate::state::BackendState;
use serde_json::{json, Value};
use uxfd_golden_harness::RgbaFrame;
#[cfg(unix)]
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::{validate_renderer_handoff_descriptor, CopyOutState, FrameDescriptor};

#[cfg(unix)]
pub(crate) fn handle_release_native_render_shared_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<NativeRenderReleaseSharedFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid render.releaseNativeSharedFrame params: {error}"),
            );
        }
    };
    if parsed.memory_id.is_empty() {
        return response_error(id, -32602, "memoryId must not be empty");
    }

    let released = state
        .native_render_outputs
        .remove(&parsed.memory_id)
        .is_some();

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "released": released,
            "memoryId": parsed.memory_id,
        })),
        error: None,
    }
}

#[cfg(not(unix))]
pub(crate) fn handle_release_native_render_shared_frame(
    id: u64,
    _params: Value,
    _state: &mut BackendState,
) -> RpcResponse {
    response_error(
        id,
        -32070,
        "render.releaseNativeSharedFrame requires POSIX shared memory support",
    )
}

#[cfg(unix)]
pub(crate) fn read_native_render_source_frame(
    source: &NativeRenderSharedFrameSource,
) -> Result<RgbaFrame, String> {
    if source.slot_count == 0 {
        return Err("source slotCount must be greater than zero".to_string());
    }
    let descriptor = &source.frame.descriptor;
    validate_renderer_handoff_descriptor(descriptor)
        .map_err(|error| format!("Unsupported native render source descriptor: {error:?}"))?;
    if descriptor.slot_index >= source.slot_count {
        return Err("Native render source descriptor slotIndex is outside slotCount".to_string());
    }
    let expected_byte_len = u64::from(descriptor.stride_bytes)
        .checked_mul(u64::from(descriptor.height))
        .ok_or_else(|| "Native render source descriptor byte length overflows".to_string())?;
    if descriptor.byte_len != expected_byte_len {
        return Err(
            "Native render source descriptor byteLen does not match strideBytes * height"
                .to_string(),
        );
    }

    let frame_len = usize::try_from(descriptor.byte_len).map_err(|_| {
        format!(
            "Native render source byteLen overflows usize: {}",
            descriptor.byte_len
        )
    })?;
    let ring = PosixSharedRing::attach_with_retry_for_layout(
        &descriptor.memory_id,
        source.slot_count,
        frame_len,
        Duration::from_secs(1),
    )
    .map_err(|error| format!("Failed to attach native render source shared memory: {error:?}"))?;
    let mapped = ring
        .read_frame(source.frame.pts_frame)
        .map_err(|error| format!("Failed to read native render source frame: {error:?}"))?;
    let tight_rgba = tight_rgba_from_padded_descriptor(descriptor, &mapped.bytes)?;
    ring.release_frame(CopyOutState::GpuUploadFenceSignalled)
        .map_err(|error| format!("Failed to release native render source frame: {error:?}"))?;

    RgbaFrame::from_rgba8(descriptor.width, descriptor.height, tight_rgba)
        .map_err(|error| format!("Native render source frame is invalid: {error:?}"))
}

fn tight_rgba_from_padded_descriptor(
    descriptor: &FrameDescriptor,
    shared_frame: &[u8],
) -> Result<Vec<u8>, String> {
    let row_bytes = usize::try_from(descriptor.width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or_else(|| "Native render source row byte length overflows".to_string())?;
    let stride_bytes = usize::try_from(descriptor.stride_bytes)
        .map_err(|_| "Native render source strideBytes overflows usize".to_string())?;
    let height = usize::try_from(descriptor.height)
        .map_err(|_| "Native render source height overflows usize".to_string())?;
    if stride_bytes < row_bytes {
        return Err("Native render source strideBytes is smaller than tight RGBA row".to_string());
    }
    let expected_len = stride_bytes
        .checked_mul(height)
        .ok_or_else(|| "Native render source byte length overflows".to_string())?;
    if shared_frame.len() != expected_len {
        return Err(format!(
            "Native render source byte length mismatch: expected={expected_len}, actual={}",
            shared_frame.len()
        ));
    }

    let mut tight_rgba = Vec::with_capacity(
        row_bytes
            .checked_mul(height)
            .ok_or_else(|| "Native render tight frame byte length overflows".to_string())?,
    );
    for row in 0..height {
        let source_start = row
            .checked_mul(stride_bytes)
            .ok_or_else(|| "Native render source row offset overflows".to_string())?;
        tight_rgba.extend_from_slice(&shared_frame[source_start..source_start + row_bytes]);
    }

    Ok(tight_rgba)
}
