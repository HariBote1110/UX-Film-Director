use std::cell::UnsafeCell;
use std::ffi::CString;
use std::fs;
use std::io;
use std::mem::{offset_of, size_of};
use std::ptr;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use uxfd_sidecar_protocol::{
    validate_renderer_handoff_descriptor, ChecksumAlgorithm, ControlEvent, CopyOutState,
    DecodeFrameRequest, DescriptorValidationError, FrameChecksum, FrameDescriptor,
    FrameVerificationReport, FrameVerificationStatus, SharedFrame,
};

pub const SHARED_RING_MAGIC: u64 = u64::from_le_bytes(*b"UXFDRNG1");
pub const SHARED_RING_PROTOCOL_VERSION: u32 = 1;
const INIT_PENDING: u32 = 0;
const INIT_READY: u32 = 1;
const FREE: u32 = 0;
const WRITING: u32 = 1;
const READY: u32 = 2;
const READING: u32 = 3;
const MAX_SPINS: usize = 10_000_000;
const ATTACH_RETRY_DELAY: Duration = Duration::from_millis(10);

#[repr(C)]
#[derive(Debug)]
struct SharedSlotHeader {
    state: AtomicU32,
    _padding0: u32,
    sequence: AtomicU64,
    checksum: AtomicU32,
    _padding1: u32,
}

impl SharedSlotHeader {
    fn new() -> Self {
        Self {
            state: AtomicU32::new(FREE),
            _padding0: 0,
            sequence: AtomicU64::new(0),
            checksum: AtomicU32::new(0),
            _padding1: 0,
        }
    }
}

#[repr(C)]
#[derive(Debug)]
pub struct SharedRingHeader {
    pub magic: u64,
    pub layout_hash: u64,
    pub slot_byte_len: u64,
    pub protocol_version: u32,
    pub header_bytes: u32,
    pub slot_count: u32,
    pub init_state: AtomicU32,
}

impl SharedRingHeader {
    pub fn new(slot_count: u32, slot_byte_len: u64) -> Self {
        Self {
            magic: SHARED_RING_MAGIC,
            layout_hash: expected_shared_ring_layout_hash(),
            slot_byte_len,
            protocol_version: SHARED_RING_PROTOCOL_VERSION,
            header_bytes: size_of::<SharedRingHeader>() as u32,
            slot_count,
            init_state: AtomicU32::new(INIT_PENDING),
        }
    }

    pub fn mark_initialised(&self) {
        self.init_state.store(INIT_READY, Ordering::Release);
    }

    pub fn validate_attach(&self) -> Result<(), SharedRingAttachError> {
        if self.init_state.load(Ordering::Acquire) != INIT_READY {
            return Err(SharedRingAttachError::NotInitialised);
        }

        if self.magic != SHARED_RING_MAGIC {
            return Err(SharedRingAttachError::MagicMismatch {
                expected: SHARED_RING_MAGIC,
                actual: self.magic,
            });
        }
        if self.protocol_version != SHARED_RING_PROTOCOL_VERSION {
            return Err(SharedRingAttachError::ProtocolVersionMismatch {
                expected: SHARED_RING_PROTOCOL_VERSION,
                actual: self.protocol_version,
            });
        }

        let expected_header_bytes = size_of::<SharedRingHeader>() as u32;
        if self.header_bytes != expected_header_bytes {
            return Err(SharedRingAttachError::HeaderSizeMismatch {
                expected: expected_header_bytes,
                actual: self.header_bytes,
            });
        }

        let expected_hash = expected_shared_ring_layout_hash();
        if self.layout_hash != expected_hash {
            return Err(SharedRingAttachError::LayoutHashMismatch {
                expected: expected_hash,
                actual: self.layout_hash,
            });
        }

        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SharedRingAttachError {
    MagicMismatch { expected: u64, actual: u64 },
    ProtocolVersionMismatch { expected: u32, actual: u32 },
    HeaderSizeMismatch { expected: u32, actual: u32 },
    LayoutHashMismatch { expected: u64, actual: u64 },
    NotInitialised,
}

pub fn expected_shared_ring_layout_hash() -> u64 {
    let values = [
        size_of::<SharedRingHeader>() as u64,
        offset_of!(SharedRingHeader, magic) as u64,
        offset_of!(SharedRingHeader, layout_hash) as u64,
        offset_of!(SharedRingHeader, slot_byte_len) as u64,
        offset_of!(SharedRingHeader, protocol_version) as u64,
        offset_of!(SharedRingHeader, header_bytes) as u64,
        offset_of!(SharedRingHeader, slot_count) as u64,
        offset_of!(SharedRingHeader, init_state) as u64,
    ];

    let mut hash = 0xcbf29ce484222325_u64;
    for value in values {
        hash ^= value;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[derive(Debug)]
pub struct PosixSharedRing {
    name: CString,
    fd: i32,
    ptr: *mut u8,
    len: usize,
    slot_count: u32,
    frame_len: usize,
    owner: bool,
}

unsafe impl Send for PosixSharedRing {}
unsafe impl Sync for PosixSharedRing {}

impl PosixSharedRing {
    pub fn create(name: &str, frame_len: usize) -> Result<Self, PosixShmError> {
        Self::create_with_slot_count(name, 1, frame_len)
    }

    pub fn create_with_slot_count(
        name: &str,
        slot_count: u32,
        frame_len: usize,
    ) -> Result<Self, PosixShmError> {
        if slot_count == 0 || frame_len == 0 {
            return Err(PosixShmError::InvalidArgs);
        }

        let name = shm_name(name)?;
        let len = mapping_len(slot_count, frame_len);
        let fd = unsafe {
            libc::shm_open(
                name.as_ptr(),
                libc::O_CREAT | libc::O_EXCL | libc::O_RDWR,
                0o600,
            )
        };
        if fd < 0 {
            return Err(PosixShmError::Io {
                operation: "shm_open(create)",
                source: io::Error::last_os_error(),
            });
        }

        let mut ring = Self {
            name,
            fd,
            ptr: ptr::null_mut(),
            len,
            slot_count,
            frame_len,
            owner: true,
        };

        if unsafe { libc::ftruncate(fd, len as libc::off_t) } != 0 {
            return Err(PosixShmError::Io {
                operation: "ftruncate",
                source: io::Error::last_os_error(),
            });
        }

        ring.map()?;
        ring.initialise_mapping();

        Ok(ring)
    }

    pub fn attach_with_retry(
        name: &str,
        frame_len: usize,
        timeout: Duration,
    ) -> Result<Self, PosixShmError> {
        Self::attach_with_retry_for_layout(name, 1, frame_len, timeout)
    }

    pub fn attach_with_retry_for_layout(
        name: &str,
        slot_count: u32,
        frame_len: usize,
        timeout: Duration,
    ) -> Result<Self, PosixShmError> {
        if slot_count == 0 || frame_len == 0 {
            return Err(PosixShmError::InvalidArgs);
        }

        let name = shm_name(name)?;
        let start = Instant::now();

        loop {
            let fd = unsafe { libc::shm_open(name.as_ptr(), libc::O_RDWR, 0o600) };
            if fd >= 0 {
                let mut ring = Self {
                    name,
                    fd,
                    ptr: ptr::null_mut(),
                    len: mapping_len(slot_count, frame_len),
                    slot_count,
                    frame_len,
                    owner: false,
                };
                ring.map()?;
                ring.wait_for_initialised(start, timeout)?;
                ring.validate_expected_shape(slot_count, frame_len)?;
                return Ok(ring);
            }

            let error = io::Error::last_os_error();
            if error.raw_os_error() != Some(libc::ENOENT) {
                return Err(PosixShmError::Io {
                    operation: "shm_open(attach)",
                    source: error,
                });
            }
            if start.elapsed() >= timeout {
                return Err(PosixShmError::TimedOut {
                    operation: "attach_with_retry",
                });
            }

            thread::sleep(ATTACH_RETRY_DELAY);
        }
    }

    pub fn write_frame(&self, sequence: u64, bytes: &[u8]) -> Result<(), PosixShmError> {
        if bytes.len() != self.frame_len {
            return Err(PosixShmError::FrameLengthMismatch {
                expected: self.frame_len,
                actual: bytes.len(),
            });
        }

        for spin in 0..MAX_SPINS {
            for slot_index in 0..self.slot_count {
                let slot = self.slot(slot_index);
                if slot
                    .state
                    .compare_exchange(FREE, WRITING, Ordering::Acquire, Ordering::Relaxed)
                    .is_ok()
                {
                    unsafe {
                        ptr::copy_nonoverlapping(
                            bytes.as_ptr(),
                            self.bytes_ptr(slot_index),
                            self.frame_len,
                        );
                    }
                    slot.sequence.store(sequence, Ordering::Relaxed);
                    slot.checksum.store(crc32(bytes), Ordering::Relaxed);
                    slot.state.store(READY, Ordering::Release);
                    return Ok(());
                }
            }

            backoff(spin);
        }

        Err(PosixShmError::TimedOut {
            operation: "write_frame",
        })
    }

    pub fn read_frame(&self, sequence: u64) -> Result<MappedReadFrame, PosixShmError> {
        for spin in 0..MAX_SPINS {
            for slot_index in 0..self.slot_count {
                let slot = self.slot(slot_index);
                if slot.state.load(Ordering::Acquire) != READY {
                    continue;
                }
                if slot.sequence.load(Ordering::Relaxed) != sequence {
                    continue;
                }
                if slot
                    .state
                    .compare_exchange(READY, READING, Ordering::Acquire, Ordering::Relaxed)
                    .is_err()
                {
                    continue;
                }

                let expected_checksum = slot.checksum.load(Ordering::Relaxed);
                let mut bytes = vec![0; self.frame_len];
                unsafe {
                    ptr::copy_nonoverlapping(
                        self.bytes_ptr(slot_index),
                        bytes.as_mut_ptr(),
                        self.frame_len,
                    );
                }
                let actual_checksum = crc32(&bytes);
                if expected_checksum != actual_checksum {
                    return Err(PosixShmError::ChecksumMismatch {
                        sequence,
                        expected: expected_checksum,
                        actual: actual_checksum,
                    });
                }

                return Ok(MappedReadFrame {
                    sequence,
                    expected_checksum,
                    actual_checksum,
                    bytes,
                });
            }

            backoff(spin);
        }

        Err(PosixShmError::TimedOut {
            operation: "read_frame",
        })
    }

    pub fn release_frame(&self, copy_out_state: CopyOutState) -> Result<(), PosixShmError> {
        if !copy_out_state.permits_read_slot_release() {
            return Err(PosixShmError::CopyOutNotComplete);
        }

        let mut observed = FREE;
        for slot_index in 0..self.slot_count {
            let slot = self.slot(slot_index);
            observed = slot.state.load(Ordering::Acquire);
            if observed != READING {
                continue;
            }
            if slot
                .state
                .compare_exchange(READING, FREE, Ordering::Release, Ordering::Relaxed)
                .is_ok()
            {
                return Ok(());
            }
        }

        Err(PosixShmError::UnexpectedState {
            expected: READING,
            actual: observed,
        })
    }

    pub fn wait_until_free(&self, timeout: Duration) -> Result<(), PosixShmError> {
        let start = Instant::now();
        while start.elapsed() < timeout {
            if (0..self.slot_count)
                .all(|slot_index| self.slot(slot_index).state.load(Ordering::Acquire) == FREE)
            {
                return Ok(());
            }
            thread::sleep(ATTACH_RETRY_DELAY);
        }
        Err(PosixShmError::TimedOut {
            operation: "wait_until_free",
        })
    }

    pub fn debug_corrupt_layout_hash_for_test(&self) -> u64 {
        let expected = self.header().layout_hash;
        unsafe {
            (*self.header_mut_ptr()).layout_hash ^= 0x01;
        }
        expected
    }

    fn map(&mut self) -> Result<(), PosixShmError> {
        let ptr = unsafe {
            libc::mmap(
                ptr::null_mut(),
                self.len,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_SHARED,
                self.fd,
                0,
            )
        };
        if ptr == libc::MAP_FAILED {
            return Err(PosixShmError::Io {
                operation: "mmap",
                source: io::Error::last_os_error(),
            });
        }
        self.ptr = ptr.cast::<u8>();
        Ok(())
    }

    fn initialise_mapping(&self) {
        unsafe {
            ptr::write(
                self.header_mut_ptr(),
                SharedRingHeader::new(self.slot_count, self.frame_len as u64),
            );
            for slot_index in 0..self.slot_count {
                ptr::write(self.slot_mut_ptr(slot_index), SharedSlotHeader::new());
            }
        }
        self.header().mark_initialised();
    }

    fn wait_for_initialised(&self, start: Instant, timeout: Duration) -> Result<(), PosixShmError> {
        loop {
            match self.header().validate_attach() {
                Ok(()) => return Ok(()),
                Err(SharedRingAttachError::NotInitialised) if start.elapsed() < timeout => {
                    thread::sleep(ATTACH_RETRY_DELAY);
                }
                Err(error) => return Err(PosixShmError::Attach(error)),
            }
        }
    }

    fn validate_expected_shape(
        &self,
        slot_count: u32,
        frame_len: usize,
    ) -> Result<(), PosixShmError> {
        let header = self.header();
        if header.slot_count != slot_count {
            return Err(PosixShmError::SlotCountMismatch {
                expected: slot_count,
                actual: header.slot_count,
            });
        }
        if header.slot_byte_len != frame_len as u64 {
            return Err(PosixShmError::SlotByteLengthMismatch {
                expected: frame_len as u64,
                actual: header.slot_byte_len,
            });
        }
        Ok(())
    }

    fn header(&self) -> &SharedRingHeader {
        unsafe { &*(self.ptr.cast::<SharedRingHeader>()) }
    }

    fn slot(&self, slot_index: u32) -> &SharedSlotHeader {
        unsafe {
            &*(self
                .ptr
                .add(slot_header_offset(slot_index))
                .cast::<SharedSlotHeader>())
        }
    }

    fn header_mut_ptr(&self) -> *mut SharedRingHeader {
        self.ptr.cast::<SharedRingHeader>()
    }

    fn slot_mut_ptr(&self, slot_index: u32) -> *mut SharedSlotHeader {
        unsafe {
            self.ptr
                .add(slot_header_offset(slot_index))
                .cast::<SharedSlotHeader>()
        }
    }

    fn bytes_ptr(&self, slot_index: u32) -> *mut u8 {
        unsafe {
            self.ptr
                .add(bytes_offset(self.slot_count, slot_index, self.frame_len))
        }
    }
}

impl Drop for PosixSharedRing {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe {
                libc::munmap(self.ptr.cast(), self.len);
            }
        }
        if self.fd >= 0 {
            unsafe {
                libc::close(self.fd);
            }
        }
        if self.owner {
            unsafe {
                libc::shm_unlink(self.name.as_ptr());
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SidecarDecodedFrameWrite {
    pub shared_frame: SharedFrame,
    pub verification: FrameVerificationReport,
    pub events: Vec<ControlEvent>,
}

pub fn write_sidecar_decoded_frame_to_ring(
    ring: &PosixSharedRing,
    request: DecodeFrameRequest,
    descriptor: FrameDescriptor,
    rgba_bytes: &[u8],
) -> Result<SidecarDecodedFrameWrite, SidecarDecodeHandoffError> {
    validate_renderer_handoff_descriptor(&descriptor)
        .map_err(SidecarDecodeHandoffError::Descriptor)?;

    if descriptor.byte_len != rgba_bytes.len() as u64 {
        return Err(SidecarDecodeHandoffError::FrameLengthMismatch {
            expected: descriptor.byte_len.min(usize::MAX as u64) as usize,
            actual: rgba_bytes.len(),
        });
    }

    ring.write_frame(request.frame_index, rgba_bytes)?;

    let shared_frame = SharedFrame {
        descriptor,
        pts_frame: request.frame_index,
    };
    let verification = FrameVerificationReport {
        frame_index: request.frame_index,
        checksum: checksum_for_bytes(rgba_bytes),
        diff: None,
        status: FrameVerificationStatus::WithinTolerance,
    };
    let events = vec![
        ControlEvent::JobStarted {
            job_id: request.job_id.clone(),
        },
        ControlEvent::FrameReady {
            job_id: request.job_id.clone(),
            frame: shared_frame.clone(),
        },
        ControlEvent::JobCompleted {
            job_id: request.job_id,
        },
    ];

    Ok(SidecarDecodedFrameWrite {
        shared_frame,
        verification,
        events,
    })
}

#[derive(Debug)]
pub enum SidecarDecodeHandoffError {
    Descriptor(DescriptorValidationError),
    SharedMemory(PosixShmError),
    FrameLengthMismatch { expected: usize, actual: usize },
}

impl From<PosixShmError> for SidecarDecodeHandoffError {
    fn from(error: PosixShmError) -> Self {
        Self::SharedMemory(error)
    }
}

fn checksum_for_bytes(bytes: &[u8]) -> FrameChecksum {
    FrameChecksum {
        algorithm: ChecksumAlgorithm::Crc32,
        value_hex: format!("{:08x}", crc32(bytes)),
        byte_len: bytes.len() as u64,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MappedReadFrame {
    pub sequence: u64,
    pub expected_checksum: u32,
    pub actual_checksum: u32,
    pub bytes: Vec<u8>,
}

#[derive(Debug)]
pub enum PosixShmError {
    InvalidArgs,
    InvalidName,
    Io {
        operation: &'static str,
        source: io::Error,
    },
    Attach(SharedRingAttachError),
    TimedOut {
        operation: &'static str,
    },
    SlotCountMismatch {
        expected: u32,
        actual: u32,
    },
    SlotByteLengthMismatch {
        expected: u64,
        actual: u64,
    },
    FrameLengthMismatch {
        expected: usize,
        actual: usize,
    },
    ChecksumMismatch {
        sequence: u64,
        expected: u32,
        actual: u32,
    },
    UnexpectedState {
        expected: u32,
        actual: u32,
    },
    CopyOutNotComplete,
}

pub fn run_shm_producer_from_args(
    args: impl IntoIterator<Item = String>,
) -> Result<(), PosixShmError> {
    let (name, frame_len, iterations) = parse_runner_args(args)?;
    let ring = PosixSharedRing::create(&name, frame_len)?;
    let mut frame = vec![0; frame_len];

    for sequence in 0..iterations {
        fill_deterministic_frame(sequence, &mut frame);
        ring.write_frame(sequence, &frame)?;
    }

    ring.wait_until_free(Duration::from_secs(5))
}

pub fn run_shm_consumer_from_args(
    args: impl IntoIterator<Item = String>,
) -> Result<(), PosixShmError> {
    let (name, frame_len, iterations) = parse_runner_args(args)?;
    let ring = PosixSharedRing::attach_with_retry(&name, frame_len, Duration::from_secs(5))?;

    for sequence in 0..iterations {
        let frame = ring.read_frame(sequence)?;
        let mut expected = vec![0; frame_len];
        fill_deterministic_frame(sequence, &mut expected);
        if frame.bytes != expected {
            return Err(PosixShmError::ChecksumMismatch {
                sequence,
                expected: crc32(&expected),
                actual: crc32(&frame.bytes),
            });
        }
        ring.release_frame(CopyOutState::GpuUploadFenceSignalled)?;
    }

    Ok(())
}

pub fn run_shm_raw_consumer_from_args(
    args: impl IntoIterator<Item = String>,
) -> Result<(), PosixShmError> {
    let mut args = args.into_iter();
    let name = args.next().ok_or(PosixShmError::InvalidArgs)?;
    let frame_len = args
        .next()
        .ok_or(PosixShmError::InvalidArgs)?
        .parse::<usize>()
        .map_err(|_| PosixShmError::InvalidArgs)?;
    let expected_path = args.next().ok_or(PosixShmError::InvalidArgs)?;
    let expected = fs::read(expected_path).map_err(|source| PosixShmError::Io {
        operation: "read expected raw frame",
        source,
    })?;
    if expected.len() != frame_len {
        return Err(PosixShmError::FrameLengthMismatch {
            expected: frame_len,
            actual: expected.len(),
        });
    }

    let ring = PosixSharedRing::attach_with_retry(&name, frame_len, Duration::from_secs(5))?;
    let frame = ring.read_frame(0)?;
    if frame.bytes != expected {
        return Err(PosixShmError::ChecksumMismatch {
            sequence: 0,
            expected: crc32(&expected),
            actual: crc32(&frame.bytes),
        });
    }
    ring.release_frame(CopyOutState::GpuUploadFenceSignalled)
}

fn parse_runner_args(
    args: impl IntoIterator<Item = String>,
) -> Result<(String, usize, u64), PosixShmError> {
    let mut args = args.into_iter();
    let name = args.next().ok_or(PosixShmError::InvalidArgs)?;
    let frame_len = args
        .next()
        .ok_or(PosixShmError::InvalidArgs)?
        .parse::<usize>()
        .map_err(|_| PosixShmError::InvalidArgs)?;
    let iterations = args
        .next()
        .ok_or(PosixShmError::InvalidArgs)?
        .parse::<u64>()
        .map_err(|_| PosixShmError::InvalidArgs)?;
    Ok((name, frame_len, iterations))
}

fn shm_name(name: &str) -> Result<CString, PosixShmError> {
    if !name.starts_with('/') {
        return Err(PosixShmError::InvalidName);
    }
    CString::new(name).map_err(|_| PosixShmError::InvalidName)
}

fn mapping_len(slot_count: u32, frame_len: usize) -> usize {
    bytes_offset(slot_count, 0, frame_len) + frame_len * slot_count as usize
}

fn slot_header_offset(slot_index: u32) -> usize {
    size_of::<SharedRingHeader>() + size_of::<SharedSlotHeader>() * slot_index as usize
}

fn bytes_offset(slot_count: u32, slot_index: u32, frame_len: usize) -> usize {
    size_of::<SharedRingHeader>()
        + size_of::<SharedSlotHeader>() * slot_count as usize
        + frame_len * slot_index as usize
}

#[derive(Debug)]
pub struct AtomicFrameRing {
    slots: Vec<AtomicSlot>,
    frame_len: usize,
}

impl AtomicFrameRing {
    pub fn new(slot_count: usize, frame_len: usize) -> Result<Self, AtomicFrameRingError> {
        if slot_count == 0 {
            return Err(AtomicFrameRingError::ZeroSlots);
        }
        if frame_len == 0 {
            return Err(AtomicFrameRingError::ZeroFrameLength);
        }

        let slots = (0..slot_count)
            .map(|_| AtomicSlot {
                state: AtomicU32::new(FREE),
                sequence: AtomicU64::new(0),
                checksum: AtomicU32::new(0),
                bytes: UnsafeCell::new(vec![0; frame_len]),
            })
            .collect();

        Ok(Self { slots, frame_len })
    }

    pub fn write_next<F>(&self, sequence: u64, fill: F) -> Result<(), AtomicFrameRingError>
    where
        F: FnOnce(&mut [u8]),
    {
        let slot_index = self.acquire_free_slot()?;
        let slot = &self.slots[slot_index];

        let bytes = unsafe { &mut *slot.bytes.get() };
        fill(bytes);
        let checksum = crc32(bytes);

        slot.sequence.store(sequence, Ordering::Relaxed);
        slot.checksum.store(checksum, Ordering::Relaxed);
        slot.state.store(READY, Ordering::Release);

        Ok(())
    }

    pub fn read_sequence(&self, sequence: u64) -> Result<ReadFrame, AtomicFrameRingError> {
        for spin in 0..MAX_SPINS {
            for (slot_index, slot) in self.slots.iter().enumerate() {
                if slot.state.load(Ordering::Acquire) != READY {
                    continue;
                }
                if slot.sequence.load(Ordering::Relaxed) != sequence {
                    continue;
                }
                if slot
                    .state
                    .compare_exchange(READY, READING, Ordering::Acquire, Ordering::Relaxed)
                    .is_err()
                {
                    continue;
                }

                let expected_checksum = slot.checksum.load(Ordering::Relaxed);
                let bytes = unsafe { (&*slot.bytes.get()).clone() };
                let actual_checksum = crc32(&bytes);

                return Ok(ReadFrame {
                    slot_index,
                    sequence,
                    expected_checksum,
                    actual_checksum,
                    bytes,
                });
            }
            backoff(spin);
        }

        Err(AtomicFrameRingError::TimedOut {
            operation: "read_sequence",
        })
    }

    pub fn release_after_copy_out(
        &self,
        frame: ReadFrame,
        copy_out_state: CopyOutState,
    ) -> Result<(), AtomicFrameRingError> {
        if copy_out_state != CopyOutState::GpuUploadFenceSignalled {
            return Err(AtomicFrameRingError::CopyOutNotComplete {
                slot_index: frame.slot_index,
            });
        }

        let slot =
            self.slots
                .get(frame.slot_index)
                .ok_or(AtomicFrameRingError::SlotIndexOutOfBounds {
                    slot_index: frame.slot_index,
                    slot_count: self.slots.len(),
                })?;

        slot.state
            .compare_exchange(READING, FREE, Ordering::Release, Ordering::Relaxed)
            .map_err(|actual| AtomicFrameRingError::UnexpectedState {
                slot_index: frame.slot_index,
                expected: READING,
                actual,
            })?;

        Ok(())
    }

    pub fn ready_slot_count(&self) -> usize {
        self.slots
            .iter()
            .filter(|slot| slot.state.load(Ordering::Acquire) == READY)
            .count()
    }

    fn acquire_free_slot(&self) -> Result<usize, AtomicFrameRingError> {
        for spin in 0..MAX_SPINS {
            for (slot_index, slot) in self.slots.iter().enumerate() {
                if slot
                    .state
                    .compare_exchange(FREE, WRITING, Ordering::Acquire, Ordering::Relaxed)
                    .is_ok()
                {
                    return Ok(slot_index);
                }
            }
            backoff(spin);
        }

        Err(AtomicFrameRingError::TimedOut {
            operation: "acquire_free_slot",
        })
    }

    pub fn frame_len(&self) -> usize {
        self.frame_len
    }
}

#[derive(Debug)]
struct AtomicSlot {
    state: AtomicU32,
    sequence: AtomicU64,
    checksum: AtomicU32,
    bytes: UnsafeCell<Vec<u8>>,
}

unsafe impl Sync for AtomicSlot {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadFrame {
    pub slot_index: usize,
    pub sequence: u64,
    pub expected_checksum: u32,
    pub actual_checksum: u32,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AtomicFrameRingError {
    ZeroSlots,
    ZeroFrameLength,
    TimedOut {
        operation: &'static str,
    },
    SlotIndexOutOfBounds {
        slot_index: usize,
        slot_count: usize,
    },
    UnexpectedState {
        slot_index: usize,
        expected: u32,
        actual: u32,
    },
    CopyOutNotComplete {
        slot_index: usize,
    },
}

pub fn fill_deterministic_frame(sequence: u64, bytes: &mut [u8]) {
    for (index, byte) in bytes.iter_mut().enumerate() {
        let mixed = sequence
            .wrapping_mul(37)
            .wrapping_add((index as u64).wrapping_mul(17))
            .wrapping_add((index as u64 / 251).wrapping_mul(29));
        *byte = (mixed & 0xff) as u8;
    }
}

pub fn crc32(bytes: &[u8]) -> u32 {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(bytes);
    hasher.finalize()
}

fn backoff(spin: usize) {
    if spin % 64 == 0 {
        thread::yield_now();
    } else {
        std::hint::spin_loop();
    }
}
