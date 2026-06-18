use std::time::Duration;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use uxfd_shared_memory_spike::{crc32, PosixSharedRing, PosixShmError};

static WRITABLE_RINGS: OnceLock<Mutex<HashMap<String, PosixSharedRing>>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedVideoFrameCopyReport {
    pub sequence: u64,
    pub slot_index: u32,
    pub generation: u64,
    pub byte_len: usize,
    pub expected_checksum: u32,
    pub actual_checksum: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WritableSharedFrameRingReport {
    pub memory_id: String,
    pub slot_count: u32,
    pub slot_byte_len: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WritableSharedFrameWriteReport {
    pub sequence: u64,
    pub byte_len: usize,
    pub checksum: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WritableSharedFrameCloseReport {
    pub memory_id: String,
}

#[derive(Debug)]
pub enum SharedVideoFrameBridgeError {
    UploadBufferLengthMismatch { expected: usize, actual: usize },
    SourceBufferLengthMismatch { expected: usize, actual: usize },
    WritableRingAlreadyExists { memory_id: String },
    WritableRingNotFound { memory_id: String },
    WritableRingRegistryPoisoned,
    SlotLeaseMismatch { expected_slot_index: u32, actual_slot_index: u32 },
    SharedMemory(PosixShmError),
}

impl From<PosixShmError> for SharedVideoFrameBridgeError {
    fn from(error: PosixShmError) -> Self {
        Self::SharedMemory(error)
    }
}

pub fn create_writable_shared_frame_ring(
    memory_id: &str,
    slot_count: u32,
    slot_byte_len: usize,
) -> Result<WritableSharedFrameRingReport, SharedVideoFrameBridgeError> {
    let registry = writable_ring_registry();
    let mut registry = registry
        .lock()
        .map_err(|_| SharedVideoFrameBridgeError::WritableRingRegistryPoisoned)?;
    if registry.contains_key(memory_id) {
        return Err(SharedVideoFrameBridgeError::WritableRingAlreadyExists {
            memory_id: memory_id.to_string(),
        });
    }

    let ring = PosixSharedRing::create_with_slot_count(memory_id, slot_count, slot_byte_len)?;
    registry.insert(memory_id.to_string(), ring);

    Ok(WritableSharedFrameRingReport {
        memory_id: memory_id.to_string(),
        slot_count,
        slot_byte_len,
    })
}

pub fn write_into_writable_shared_frame_ring(
    memory_id: &str,
    sequence: u64,
    source_buffer: &[u8],
) -> Result<WritableSharedFrameWriteReport, SharedVideoFrameBridgeError> {
    let registry = writable_ring_registry();
    let registry = registry
        .lock()
        .map_err(|_| SharedVideoFrameBridgeError::WritableRingRegistryPoisoned)?;
    let ring = registry.get(memory_id).ok_or_else(|| {
        SharedVideoFrameBridgeError::WritableRingNotFound {
            memory_id: memory_id.to_string(),
        }
    })?;

    ring.write_frame(sequence, source_buffer)?;

    Ok(WritableSharedFrameWriteReport {
        sequence,
        byte_len: source_buffer.len(),
        checksum: crc32(source_buffer),
    })
}

pub fn close_writable_shared_frame_ring(
    memory_id: &str,
) -> Result<WritableSharedFrameCloseReport, SharedVideoFrameBridgeError> {
    let registry = writable_ring_registry();
    let mut registry = registry
        .lock()
        .map_err(|_| SharedVideoFrameBridgeError::WritableRingRegistryPoisoned)?;
    registry.remove(memory_id).ok_or_else(|| {
        SharedVideoFrameBridgeError::WritableRingNotFound {
            memory_id: memory_id.to_string(),
        }
    })?;

    Ok(WritableSharedFrameCloseReport {
        memory_id: memory_id.to_string(),
    })
}

pub fn copy_shared_frame_into_upload_buffer(
    memory_id: &str,
    slot_count: u32,
    slot_byte_len: usize,
    slot_index: u32,
    generation: u64,
    sequence: u64,
    upload_buffer: &mut [u8],
    timeout: Duration,
) -> Result<SharedVideoFrameCopyReport, SharedVideoFrameBridgeError> {
    if upload_buffer.len() != slot_byte_len {
        return Err(SharedVideoFrameBridgeError::UploadBufferLengthMismatch {
            expected: slot_byte_len,
            actual: upload_buffer.len(),
        });
    }

    let ring = PosixSharedRing::attach_with_retry_for_layout(
        memory_id,
        slot_count,
        slot_byte_len,
        timeout,
    )?;
    let frame = ring.read_frame(sequence)?;
    if frame.slot_index != slot_index {
        return Err(SharedVideoFrameBridgeError::SlotLeaseMismatch {
            expected_slot_index: slot_index,
            actual_slot_index: frame.slot_index,
        });
    }
    upload_buffer.copy_from_slice(&frame.bytes);

    Ok(SharedVideoFrameCopyReport {
        sequence: frame.sequence,
        slot_index: frame.slot_index,
        generation,
        byte_len: frame.bytes.len(),
        expected_checksum: frame.expected_checksum,
        actual_checksum: frame.actual_checksum,
    })
}

fn writable_ring_registry() -> &'static Mutex<HashMap<String, PosixSharedRing>> {
    WRITABLE_RINGS.get_or_init(|| Mutex::new(HashMap::new()))
}
