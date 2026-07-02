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

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::params::NativeRenderSharedFrameSource;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    use uxfd_sidecar_protocol::{ColourMetadata, FrameFormat, SharedFrame};

    static SHM_NAME_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_shm_name() -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos() as u64;
        let counter = SHM_NAME_COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("/uns{:x}{:x}{:x}", std::process::id(), nanos, counter)
    }

    fn test_descriptor(memory_id: &str, slot_index: u32, byte_len: u64) -> FrameDescriptor {
        FrameDescriptor {
            memory_id: memory_id.to_string(),
            slot_index,
            generation: 1,
            byte_offset: byte_len * u64::from(slot_index),
            byte_len,
            width: 2,
            height: 2,
            stride_bytes: 8,
            format: FrameFormat::Rgba8Srgb,
            colour: ColourMetadata::rec709_srgb(),
        }
    }

    /// Reproduces the "stolen release" hazard recorded in progress.md
    /// 2026-07-02: `read_native_render_source_frame` used to call
    /// `ring.release_frame(...)`, the unqualified variant that frees
    /// "whichever slot is first found READING" rather than the slot it was
    /// actually leased to read. When a second consumer of the same ring
    /// (e.g. the renderer copy bridge) is mid-read of a different slot, the
    /// unqualified release steals that consumer's slot instead of the one
    /// this function actually read from — leaving the intended slot stuck in
    /// READING while an unrelated in-flight read gets its slot yanked out
    /// from under it. This test proves slot 1 (the one this function reads)
    /// is released, while slot 0 (owned by a different, still in-flight
    /// consumer) is left untouched.
    #[test]
    fn read_native_render_source_frame_releases_only_the_slot_it_read_not_the_first_reading_slot()
    {
        let memory_id = unique_shm_name();
        let byte_len = 16u64;
        let producer_ring = PosixSharedRing::create_with_slot_count(&memory_id, 2, 16)
            .expect("create native render source ring");

        // Slot 0: simulates a different, still in-flight consumer (e.g. the
        // renderer copy bridge) that has already moved this slot to READING
        // and has not released it yet.
        producer_ring
            .write_frame(0, &[0x11; 16])
            .expect("write frame occupying slot 0");
        let other_consumer_read = producer_ring
            .read_frame(0)
            .expect("a different consumer reads slot 0 and leaves it in READING");
        assert_eq!(other_consumer_read.slot_index, 0);

        // Slot 1: the frame this function is actually asked to read.
        let pixels = vec![0x22; 16];
        producer_ring
            .write_frame(1, &pixels)
            .expect("write frame occupying slot 1");

        let source = NativeRenderSharedFrameSource {
            media_id: "native-shared-test".to_string(),
            slot_count: 2,
            frame: SharedFrame {
                descriptor: test_descriptor(&memory_id, 1, byte_len),
                pts_frame: 1,
            },
        };

        read_native_render_source_frame(&source)
            .expect("read native render source frame from slot 1");

        // Exactly one slot should now be FREE (the one this function actually
        // read: slot 1). write_frame() takes a sequence number, not a slot
        // number, and scans for the lowest-numbered FREE slot — so the slot
        // it lands in tells us which slot was actually released.
        let written_slot = producer_ring
            .write_frame(99, &[0x33; 16])
            .expect("exactly one slot must have been freed by the release call above");
        assert_eq!(
            written_slot, 1,
            "the slot released must be slot 1 (the one this function actually read), \
             not slot 0 (owned by a different, still in-flight consumer). Releasing \
             slot 0 instead would mean the unqualified release_frame() stole a slot \
             leased to someone else while leaving the slot this function actually read \
             (slot 1) stuck in READING forever."
        );
    }
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
