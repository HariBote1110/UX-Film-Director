use std::time::Duration;

use uxfd_shared_memory_spike::{PosixSharedRing, PosixShmError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedVideoFrameCopyReport {
    pub sequence: u64,
    pub byte_len: usize,
    pub expected_checksum: u32,
    pub actual_checksum: u32,
}

#[derive(Debug)]
pub enum SharedVideoFrameBridgeError {
    UploadBufferLengthMismatch { expected: usize, actual: usize },
    SharedMemory(PosixShmError),
}

impl From<PosixShmError> for SharedVideoFrameBridgeError {
    fn from(error: PosixShmError) -> Self {
        Self::SharedMemory(error)
    }
}

pub fn copy_shared_frame_into_upload_buffer(
    memory_id: &str,
    slot_count: u32,
    slot_byte_len: usize,
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
    upload_buffer.copy_from_slice(&frame.bytes);

    Ok(SharedVideoFrameCopyReport {
        sequence: frame.sequence,
        byte_len: frame.bytes.len(),
        expected_checksum: frame.expected_checksum,
        actual_checksum: frame.actual_checksum,
    })
}
