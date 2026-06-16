use serde::{Deserialize, Serialize};

const GPU_COPY_BYTES_PER_ROW_ALIGNMENT: u64 = 256;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeFrameRequest {
    pub job_id: String,
    pub frame_index: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameRate {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeStartRequest {
    pub job_id: String,
    pub source: String,
    pub slot_count: u32,
    pub width: u32,
    pub height: u32,
    pub source_rate: FrameRate,
    pub format: FrameFormat,
    pub colour: ColourMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeStartResponse {
    pub job_id: String,
    pub memory_id: String,
    pub slot_count: u32,
    pub slot_byte_len: u64,
    pub width: u32,
    pub height: u32,
    pub stride_bytes: u32,
    pub source_rate: FrameRate,
    pub format: FrameFormat,
    pub colour: ColourMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeReleaseFrameRequest {
    pub job_id: String,
    pub slot_index: u32,
    pub generation: u64,
    pub copy_out_state: CopyOutState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelJobRequest {
    pub job_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ControlEvent {
    JobStarted {
        #[serde(rename = "jobId")]
        job_id: String,
    },
    JobProgress {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "completedFrames")]
        completed_frames: u64,
        #[serde(rename = "totalFrames")]
        total_frames: u64,
    },
    JobCompleted {
        #[serde(rename = "jobId")]
        job_id: String,
    },
    JobCancelled {
        #[serde(rename = "jobId")]
        job_id: String,
        reason: String,
    },
    FrameReady {
        #[serde(rename = "jobId")]
        job_id: String,
        frame: SharedFrame,
    },
    FrameReleased {
        #[serde(rename = "jobId")]
        job_id: String,
        #[serde(rename = "slotIndex")]
        slot_index: u32,
    },
    JobFailed {
        #[serde(rename = "jobId")]
        job_id: String,
        message: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobState {
    Queued,
    Running,
    Cancelling,
    Cancelled,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobLifecycle {
    job_id: String,
    state: JobState,
}

impl JobLifecycle {
    pub fn queued(job_id: impl Into<String>) -> Self {
        Self {
            job_id: job_id.into(),
            state: JobState::Queued,
        }
    }

    pub fn state(&self) -> JobState {
        self.state
    }

    pub fn start(&mut self) -> Result<ControlEvent, JobLifecycleError> {
        self.expect_state(JobState::Queued)?;
        self.state = JobState::Running;
        Ok(ControlEvent::JobStarted {
            job_id: self.job_id.clone(),
        })
    }

    pub fn request_cancel(&mut self) -> Result<(), JobLifecycleError> {
        match self.state {
            JobState::Queued | JobState::Running => {
                self.state = JobState::Cancelling;
                Ok(())
            }
            JobState::Cancelling => Ok(()),
            actual => Err(JobLifecycleError::UnexpectedState {
                expected: JobState::Running,
                actual,
            }),
        }
    }

    pub fn complete(&mut self) -> Result<ControlEvent, JobLifecycleError> {
        if self.state == JobState::Cancelling {
            return Err(JobLifecycleError::CancellationPending);
        }

        self.expect_state(JobState::Running)?;
        self.state = JobState::Completed;
        Ok(ControlEvent::JobCompleted {
            job_id: self.job_id.clone(),
        })
    }

    pub fn mark_cancelled(
        &mut self,
        reason: impl Into<String>,
    ) -> Result<ControlEvent, JobLifecycleError> {
        self.expect_state(JobState::Cancelling)?;
        self.state = JobState::Cancelled;
        Ok(ControlEvent::JobCancelled {
            job_id: self.job_id.clone(),
            reason: reason.into(),
        })
    }

    pub fn fail(&mut self, message: impl Into<String>) -> Result<ControlEvent, JobLifecycleError> {
        if matches!(
            self.state,
            JobState::Cancelled | JobState::Completed | JobState::Failed
        ) {
            return Err(JobLifecycleError::TerminalState { actual: self.state });
        }

        self.state = JobState::Failed;
        Ok(ControlEvent::JobFailed {
            job_id: self.job_id.clone(),
            message: message.into(),
        })
    }

    fn expect_state(&self, expected: JobState) -> Result<(), JobLifecycleError> {
        if self.state == expected {
            Ok(())
        } else {
            Err(JobLifecycleError::UnexpectedState {
                expected,
                actual: self.state,
            })
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobLifecycleError {
    CancellationPending,
    TerminalState {
        actual: JobState,
    },
    UnexpectedState {
        expected: JobState,
        actual: JobState,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedFrame {
    pub descriptor: FrameDescriptor,
    pub pts_frame: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDescriptor {
    pub memory_id: String,
    pub slot_index: u32,
    pub generation: u64,
    pub byte_offset: u64,
    pub byte_len: u64,
    pub width: u32,
    pub height: u32,
    pub stride_bytes: u32,
    pub format: FrameFormat,
    pub colour: ColourMetadata,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FrameFormat {
    Rgba8Srgb,
    Rgba16FloatLinear,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameBufferFootprint {
    pub width: u32,
    pub height: u32,
    pub format: FrameFormat,
    pub bytes_per_pixel: u32,
    pub unpadded_bytes_per_row: u32,
    pub stride_bytes: u32,
    pub slot_byte_len: u64,
}

pub fn frame_buffer_footprint(
    width: u32,
    height: u32,
    format: FrameFormat,
) -> Result<FrameBufferFootprint, FrameBufferFootprintError> {
    if width == 0 {
        return Err(FrameBufferFootprintError::ZeroWidth);
    }

    if height == 0 {
        return Err(FrameBufferFootprintError::ZeroHeight);
    }

    let bytes_per_pixel = bytes_per_pixel(format);
    let unpadded_bytes_per_row = u64::from(width)
        .checked_mul(u64::from(bytes_per_pixel))
        .ok_or(FrameBufferFootprintError::ByteLenOverflow)?;
    let stride_bytes = align_to_gpu_copy_row(unpadded_bytes_per_row)?;
    let slot_byte_len = stride_bytes
        .checked_mul(u64::from(height))
        .ok_or(FrameBufferFootprintError::ByteLenOverflow)?;

    Ok(FrameBufferFootprint {
        width,
        height,
        format,
        bytes_per_pixel,
        unpadded_bytes_per_row: u32::try_from(unpadded_bytes_per_row)
            .map_err(|_| FrameBufferFootprintError::ByteLenOverflow)?,
        stride_bytes: u32::try_from(stride_bytes)
            .map_err(|_| FrameBufferFootprintError::ByteLenOverflow)?,
        slot_byte_len,
    })
}

pub fn rgba8_srgb_ring_layout(
    memory_id: impl Into<String>,
    slot_count: u32,
    width: u32,
    height: u32,
    colour: ColourMetadata,
) -> Result<FrameRingLayout, FrameRingLayoutBuildError> {
    let footprint = frame_buffer_footprint(width, height, FrameFormat::Rgba8Srgb)
        .map_err(FrameRingLayoutBuildError::Footprint)?;

    FrameRingLayout::new(
        memory_id,
        slot_count,
        footprint.slot_byte_len,
        width,
        height,
        footprint.stride_bytes,
        FrameFormat::Rgba8Srgb,
        colour,
    )
    .map_err(FrameRingLayoutBuildError::Layout)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameBufferFootprintError {
    ZeroWidth,
    ZeroHeight,
    ByteLenOverflow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameRingLayoutBuildError {
    Footprint(FrameBufferFootprintError),
    Layout(FrameRingLayoutError),
}

fn bytes_per_pixel(format: FrameFormat) -> u32 {
    match format {
        FrameFormat::Rgba8Srgb => 4,
        FrameFormat::Rgba16FloatLinear => 8,
    }
}

fn align_to_gpu_copy_row(byte_len: u64) -> Result<u64, FrameBufferFootprintError> {
    byte_len
        .checked_add(GPU_COPY_BYTES_PER_ROW_ALIGNMENT - 1)
        .map(|len| len / GPU_COPY_BYTES_PER_ROW_ALIGNMENT * GPU_COPY_BYTES_PER_ROW_ALIGNMENT)
        .ok_or(FrameBufferFootprintError::ByteLenOverflow)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColourMetadata {
    pub primaries: String,
    pub transfer: String,
    pub matrix: String,
    pub range: String,
}

impl ColourMetadata {
    pub fn rec709_srgb() -> Self {
        Self {
            primaries: "bt709".to_string(),
            transfer: "srgb".to_string(),
            matrix: "rgb".to_string(),
            range: "full".to_string(),
        }
    }
}

pub fn validate_renderer_handoff_descriptor(
    descriptor: &FrameDescriptor,
) -> Result<(), DescriptorValidationError> {
    if descriptor.format != FrameFormat::Rgba8Srgb {
        return Err(DescriptorValidationError::UnsupportedFormat {
            format: descriptor.format,
        });
    }

    if descriptor.colour.primaries != "bt709" {
        return Err(DescriptorValidationError::UnsupportedPrimaries {
            primaries: descriptor.colour.primaries.clone(),
        });
    }

    if descriptor.colour.transfer != "srgb" {
        return Err(DescriptorValidationError::UnsupportedTransfer {
            transfer: descriptor.colour.transfer.clone(),
        });
    }

    if descriptor.colour.matrix != "rgb" {
        return Err(DescriptorValidationError::UnsupportedMatrix {
            matrix: descriptor.colour.matrix.clone(),
        });
    }

    if descriptor.colour.range != "full" {
        return Err(DescriptorValidationError::UnsupportedRange {
            range: descriptor.colour.range.clone(),
        });
    }

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DescriptorValidationError {
    UnsupportedFormat { format: FrameFormat },
    UnsupportedPrimaries { primaries: String },
    UnsupportedTransfer { transfer: String },
    UnsupportedMatrix { matrix: String },
    UnsupportedRange { range: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameChecksum {
    pub algorithm: ChecksumAlgorithm,
    pub value_hex: String,
    pub byte_len: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChecksumAlgorithm {
    Crc32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelDiffSummary {
    pub max_channel_delta: u8,
    pub mean_absolute_error: f64,
    pub differing_channels: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameVerificationReport {
    pub frame_index: u64,
    pub checksum: FrameChecksum,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff: Option<PixelDiffSummary>,
    pub status: FrameVerificationStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FrameVerificationStatus {
    WithinTolerance,
    Mismatch,
    VerificationFailed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrameRingLayout {
    memory_id: String,
    slot_count: u32,
    slot_byte_len: u64,
    width: u32,
    height: u32,
    stride_bytes: u32,
    format: FrameFormat,
    colour: ColourMetadata,
}

impl FrameRingLayout {
    pub fn new(
        memory_id: impl Into<String>,
        slot_count: u32,
        slot_byte_len: u64,
        width: u32,
        height: u32,
        stride_bytes: u32,
        format: FrameFormat,
        colour: ColourMetadata,
    ) -> Result<Self, FrameRingLayoutError> {
        let memory_id = memory_id.into();

        if memory_id.is_empty() {
            return Err(FrameRingLayoutError::EmptyMemoryId);
        }

        if slot_count == 0 {
            return Err(FrameRingLayoutError::ZeroSlots);
        }

        if slot_byte_len == 0 {
            return Err(FrameRingLayoutError::ZeroSlotByteLen);
        }

        Ok(Self {
            memory_id,
            slot_count,
            slot_byte_len,
            width,
            height,
            stride_bytes,
            format,
            colour,
        })
    }

    pub fn slot_count(&self) -> u32 {
        self.slot_count
    }

    pub fn descriptor_for_slot(
        &self,
        slot_index: u32,
    ) -> Result<FrameDescriptor, FrameRingLayoutError> {
        self.descriptor_for_slot_generation(slot_index, 0)
    }

    pub fn descriptor_for_slot_generation(
        &self,
        slot_index: u32,
        generation: u64,
    ) -> Result<FrameDescriptor, FrameRingLayoutError> {
        if slot_index >= self.slot_count {
            return Err(FrameRingLayoutError::SlotIndexOutOfBounds {
                slot_index,
                slot_count: self.slot_count,
            });
        }

        let byte_offset = self.slot_byte_len.checked_mul(slot_index as u64).ok_or(
            FrameRingLayoutError::ByteOffsetOverflow {
                slot_index,
                slot_byte_len: self.slot_byte_len,
            },
        )?;

        Ok(FrameDescriptor {
            memory_id: self.memory_id.clone(),
            slot_index,
            generation,
            byte_offset,
            byte_len: self.slot_byte_len,
            width: self.width,
            height: self.height,
            stride_bytes: self.stride_bytes,
            format: self.format,
            colour: self.colour.clone(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameRingLayoutError {
    EmptyMemoryId,
    ZeroSlots,
    ZeroSlotByteLen,
    SlotIndexOutOfBounds { slot_index: u32, slot_count: u32 },
    ByteOffsetOverflow { slot_index: u32, slot_byte_len: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SlotState {
    Free,
    Writing,
    Ready,
    Reading,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CopyOutState {
    Started,
    GpuUploadFenceSignalled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SlotStateStorage {
    AtomicU32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AtomicOrdering {
    Acquire,
    Release,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConsumerTopology {
    SingleProducerSingleConsumer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MultiConsumerPolicy {
    IndependentRingPerConsumer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RingSynchronisationContract {
    pub slot_state_storage: SlotStateStorage,
    pub producer_ready_store: AtomicOrdering,
    pub consumer_ready_load: AtomicOrdering,
    pub consumer_topology: ConsumerTopology,
    pub multi_consumer_policy: MultiConsumerPolicy,
    pub reading_to_free_requires: CopyOutState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WriteSlot {
    pub slot_index: u32,
    pub descriptor: FrameDescriptor,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadyFrame {
    pub slot_index: u32,
    pub frame: SharedFrame,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SlotRecoveryReason {
    ProducerTimeout,
    ConsumerTimeout,
    SidecarCrashed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecoveredSlot {
    pub slot_index: u32,
    pub previous_state: SlotState,
    pub next_generation: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcquireWriteError {
    NoFreeSlot,
    Layout(FrameRingLayoutError),
    LeaseGenerationOverflow { slot_index: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcquireReadError {
    NoReadySlot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlotTransitionError {
    SlotIndexOutOfBounds {
        slot_index: u32,
        slot_count: u32,
    },
    UnexpectedState {
        slot_index: u32,
        expected: SlotState,
        actual: SlotState,
    },
    MissingReadyFrame {
        slot_index: u32,
    },
    CopyOutNotComplete {
        slot_index: u32,
    },
    LeaseGenerationMismatch {
        slot_index: u32,
        expected: u64,
        actual: u64,
    },
    LeaseGenerationOverflow {
        slot_index: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedFrameRing {
    layout: FrameRingLayout,
    slots: Vec<RingSlot>,
}

impl SharedFrameRing {
    pub fn synchronisation_contract() -> RingSynchronisationContract {
        RingSynchronisationContract {
            slot_state_storage: SlotStateStorage::AtomicU32,
            producer_ready_store: AtomicOrdering::Release,
            consumer_ready_load: AtomicOrdering::Acquire,
            consumer_topology: ConsumerTopology::SingleProducerSingleConsumer,
            multi_consumer_policy: MultiConsumerPolicy::IndependentRingPerConsumer,
            reading_to_free_requires: CopyOutState::GpuUploadFenceSignalled,
        }
    }

    pub fn new(layout: FrameRingLayout) -> Self {
        let slots = vec![
            RingSlot {
                state: SlotState::Free,
                frame: None,
                generation: 0,
            };
            layout.slot_count() as usize
        ];

        Self { layout, slots }
    }

    pub fn slot_state(&self, slot_index: u32) -> Option<SlotState> {
        self.slots.get(slot_index as usize).map(|slot| slot.state)
    }

    pub fn acquire_write_slot(&mut self) -> Result<WriteSlot, AcquireWriteError> {
        let slot_index = self
            .slots
            .iter()
            .position(|slot| slot.state == SlotState::Free)
            .ok_or(AcquireWriteError::NoFreeSlot)? as u32;

        let next_generation = self.slots[slot_index as usize]
            .generation
            .checked_add(1)
            .ok_or(AcquireWriteError::LeaseGenerationOverflow { slot_index })?;

        let descriptor = self
            .layout
            .descriptor_for_slot_generation(slot_index, next_generation)
            .map_err(AcquireWriteError::Layout)?;

        let slot = self
            .slots
            .get_mut(slot_index as usize)
            .expect("slot index came from slots vector");
        slot.state = SlotState::Writing;
        slot.frame = None;
        slot.generation = next_generation;

        Ok(WriteSlot {
            slot_index,
            descriptor,
        })
    }

    pub fn mark_slot_ready(
        &mut self,
        write_slot: WriteSlot,
        pts_frame: u64,
    ) -> Result<SharedFrame, SlotTransitionError> {
        let slot = self.slot_mut(write_slot.slot_index)?;
        if slot.state != SlotState::Writing {
            return Err(SlotTransitionError::UnexpectedState {
                slot_index: write_slot.slot_index,
                expected: SlotState::Writing,
                actual: slot.state,
            });
        }

        if write_slot.descriptor.generation != slot.generation {
            return Err(SlotTransitionError::LeaseGenerationMismatch {
                slot_index: write_slot.slot_index,
                expected: slot.generation,
                actual: write_slot.descriptor.generation,
            });
        }

        let frame = SharedFrame {
            descriptor: write_slot.descriptor,
            pts_frame,
        };

        slot.state = SlotState::Ready;
        slot.frame = Some(frame.clone());

        Ok(frame)
    }

    pub fn acquire_ready_slot(&mut self) -> Result<ReadyFrame, AcquireReadError> {
        let slot_index = self
            .slots
            .iter()
            .position(|slot| slot.state == SlotState::Ready)
            .ok_or(AcquireReadError::NoReadySlot)? as u32;

        let slot = self
            .slots
            .get_mut(slot_index as usize)
            .expect("slot index came from slots vector");
        let frame = slot
            .frame
            .clone()
            .expect("ready slot must retain frame descriptor");

        slot.state = SlotState::Reading;

        Ok(ReadyFrame { slot_index, frame })
    }

    pub fn release_read_slot(
        &mut self,
        ready_frame: ReadyFrame,
        copy_out_state: CopyOutState,
    ) -> Result<(), SlotTransitionError> {
        let slot = self.slot_mut(ready_frame.slot_index)?;
        if slot.state != SlotState::Reading {
            return Err(SlotTransitionError::UnexpectedState {
                slot_index: ready_frame.slot_index,
                expected: SlotState::Reading,
                actual: slot.state,
            });
        }

        if ready_frame.frame.descriptor.generation != slot.generation {
            return Err(SlotTransitionError::LeaseGenerationMismatch {
                slot_index: ready_frame.slot_index,
                expected: slot.generation,
                actual: ready_frame.frame.descriptor.generation,
            });
        }

        if copy_out_state != CopyOutState::GpuUploadFenceSignalled {
            return Err(SlotTransitionError::CopyOutNotComplete {
                slot_index: ready_frame.slot_index,
            });
        }

        if slot.frame.is_none() {
            return Err(SlotTransitionError::MissingReadyFrame {
                slot_index: ready_frame.slot_index,
            });
        }

        slot.state = SlotState::Free;
        slot.frame = None;

        Ok(())
    }

    pub fn recover_stuck_slot(
        &mut self,
        slot_index: u32,
        _reason: SlotRecoveryReason,
    ) -> Result<RecoveredSlot, SlotTransitionError> {
        let slot = self.slot_mut(slot_index)?;
        if slot.state == SlotState::Free {
            return Err(SlotTransitionError::UnexpectedState {
                slot_index,
                expected: SlotState::Reading,
                actual: SlotState::Free,
            });
        }

        let next_generation = slot
            .generation
            .checked_add(1)
            .ok_or(SlotTransitionError::LeaseGenerationOverflow { slot_index })?;
        let previous_state = slot.state;

        slot.state = SlotState::Free;
        slot.frame = None;
        slot.generation = next_generation;

        Ok(RecoveredSlot {
            slot_index,
            previous_state,
            next_generation,
        })
    }

    fn slot_mut(&mut self, slot_index: u32) -> Result<&mut RingSlot, SlotTransitionError> {
        let slot_count = self.slots.len() as u32;
        self.slots
            .get_mut(slot_index as usize)
            .ok_or(SlotTransitionError::SlotIndexOutOfBounds {
                slot_index,
                slot_count,
            })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RingSlot {
    state: SlotState,
    frame: Option<SharedFrame>,
    generation: u64,
}
