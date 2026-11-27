use std::sync::Arc;
use std::thread;

use uxfd_shared_memory_spike::{
    crc32, fill_deterministic_frame, AtomicFrameRing, AtomicFrameRingError,
};
use uxfd_sidecar_protocol::CopyOutState;

#[test]
fn producer_consumer_threads_preserve_frame_checksums() -> Result<(), AtomicFrameRingError> {
    let frame_len = 4096;
    let iterations = 2_000;
    let ring = Arc::new(AtomicFrameRing::new(3, frame_len)?);

    let producer_ring = Arc::clone(&ring);
    let producer = thread::spawn(move || -> Result<(), AtomicFrameRingError> {
        for sequence in 0..iterations {
            producer_ring.write_next(sequence, |bytes| {
                fill_deterministic_frame(sequence, bytes);
            })?;
        }
        Ok(())
    });

    let consumer_ring = Arc::clone(&ring);
    let consumer = thread::spawn(move || -> Result<(), AtomicFrameRingError> {
        for sequence in 0..iterations {
            let frame = consumer_ring.read_sequence(sequence)?;
            let mut expected = vec![0; frame_len];
            fill_deterministic_frame(sequence, &mut expected);

            assert_eq!(frame.sequence, sequence);
            assert_eq!(frame.expected_checksum, crc32(&expected));
            assert_eq!(frame.actual_checksum, crc32(&frame.bytes));
            assert_eq!(frame.bytes, expected);

            consumer_ring.release_after_copy_out(frame, CopyOutState::GpuUploadFenceSignalled)?;
        }
        Ok(())
    });

    producer.join().expect("producer thread should not panic")?;
    consumer.join().expect("consumer thread should not panic")?;

    assert_eq!(ring.ready_slot_count(), 0);

    Ok(())
}
