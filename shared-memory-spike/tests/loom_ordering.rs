use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::Ordering as StdOrdering;

const EMPTY: usize = 0;
const FREE: usize = 0;
const READY: usize = 1;
const FRAME_BYTE: usize = 0x5a;
const FIRST_FRAME: usize = 0x11;
const SECOND_FRAME: usize = 0x22;
const INIT_READY: usize = 1;
const PROTOCOL_VERSION: usize = 1;
const LAYOUT_HASH: usize = 0xfeed_beef;

#[test]
fn loom_release_acquire_publishes_frame_bytes() {
    loom::model(|| {
        let slot = loom::sync::Arc::new(ModelSlot::new());

        let producer_slot = loom::sync::Arc::clone(&slot);
        let producer = loom::thread::spawn(move || {
            producer_slot.byte.store(FRAME_BYTE, StdOrdering::Relaxed);
            producer_slot.state.store(READY, StdOrdering::Release);
        });

        let consumer_slot = loom::sync::Arc::clone(&slot);
        let consumer = loom::thread::spawn(move || {
            while consumer_slot.state.load(StdOrdering::Acquire) != READY {
                loom::thread::yield_now();
            }

            assert_eq!(consumer_slot.byte.load(StdOrdering::Relaxed), FRAME_BYTE);
        });

        producer.join().expect("producer should not panic");
        consumer.join().expect("consumer should not panic");
    });
}

#[test]
fn loom_relaxed_ready_state_can_expose_unpublished_frame_bytes() {
    let result = catch_unwind(AssertUnwindSafe(|| {
        loom::model(|| {
            let slot = loom::sync::Arc::new(ModelSlot::new());

            let producer_slot = loom::sync::Arc::clone(&slot);
            let producer = loom::thread::spawn(move || {
                producer_slot.byte.store(FRAME_BYTE, StdOrdering::Relaxed);
                producer_slot.state.store(READY, StdOrdering::Relaxed);
            });

            let consumer_slot = loom::sync::Arc::clone(&slot);
            let consumer = loom::thread::spawn(move || {
                while consumer_slot.state.load(StdOrdering::Relaxed) != READY {
                    loom::thread::yield_now();
                }

                assert_eq!(consumer_slot.byte.load(StdOrdering::Relaxed), FRAME_BYTE);
            });

            producer.join().expect("producer should not panic");
            consumer.join().expect("consumer should not panic");
        });
    }));

    assert!(
        result.is_err(),
        "Relaxed ready publication must be able to fail under loom"
    );
}

#[test]
fn loom_release_acquire_recycles_slot_after_copy_out_completion() {
    loom::model(|| {
        run_recycle_model(StdOrdering::Release, StdOrdering::Acquire);
    });
}

#[test]
fn loom_relaxed_recycle_state_can_expose_incomplete_copy_out() {
    let result = catch_unwind(AssertUnwindSafe(|| {
        loom::model(|| {
            run_recycle_model(StdOrdering::Relaxed, StdOrdering::Relaxed);
        });
    }));

    assert!(
        result.is_err(),
        "Relaxed free publication must be able to fail under loom"
    );
}

#[test]
fn loom_release_acquire_initialisation_publishes_header_fields() {
    loom::model(|| {
        run_initialisation_model(StdOrdering::Release, StdOrdering::Acquire);
    });
}

#[test]
fn loom_relaxed_initialisation_can_expose_unpublished_header_fields() {
    let result = catch_unwind(AssertUnwindSafe(|| {
        loom::model(|| {
            run_initialisation_model(StdOrdering::Relaxed, StdOrdering::Relaxed);
        });
    }));

    assert!(
        result.is_err(),
        "Relaxed init publication must be able to fail under loom"
    );
}

fn run_initialisation_model(init_store: StdOrdering, init_load: StdOrdering) {
    let header = loom::sync::Arc::new(ModelHeader::new());

    let producer_header = loom::sync::Arc::clone(&header);
    let producer = loom::thread::spawn(move || {
        producer_header
            .protocol_version
            .store(PROTOCOL_VERSION, StdOrdering::Relaxed);
        producer_header
            .layout_hash
            .store(LAYOUT_HASH, StdOrdering::Relaxed);
        producer_header.init_state.store(INIT_READY, init_store);
    });

    let consumer_header = loom::sync::Arc::clone(&header);
    let consumer = loom::thread::spawn(move || {
        while consumer_header.init_state.load(init_load) != INIT_READY {
            loom::thread::yield_now();
        }

        assert_eq!(
            consumer_header.protocol_version.load(StdOrdering::Relaxed),
            PROTOCOL_VERSION
        );
        assert_eq!(
            consumer_header.layout_hash.load(StdOrdering::Relaxed),
            LAYOUT_HASH
        );
    });

    producer.join().expect("producer should not panic");
    consumer.join().expect("consumer should not panic");
}

struct ModelHeader {
    init_state: loom::sync::atomic::AtomicUsize,
    protocol_version: loom::sync::atomic::AtomicUsize,
    layout_hash: loom::sync::atomic::AtomicUsize,
}

impl ModelHeader {
    fn new() -> Self {
        Self {
            init_state: loom::sync::atomic::AtomicUsize::new(EMPTY),
            protocol_version: loom::sync::atomic::AtomicUsize::new(0),
            layout_hash: loom::sync::atomic::AtomicUsize::new(0),
        }
    }
}

fn run_recycle_model(free_store: StdOrdering, free_load: StdOrdering) {
    let slot = loom::sync::Arc::new(ReusedSlot::new());

    let producer_slot = loom::sync::Arc::clone(&slot);
    let producer = loom::thread::spawn(move || {
        while producer_slot.state.load(StdOrdering::Acquire) != FREE {
            loom::thread::yield_now();
        }
        producer_slot.byte.store(FIRST_FRAME, StdOrdering::Relaxed);
        producer_slot.state.store(READY, StdOrdering::Release);

        while producer_slot.state.load(free_load) != FREE {
            loom::thread::yield_now();
        }

        assert_eq!(
            producer_slot.copy_out_marker.load(StdOrdering::Relaxed),
            FIRST_FRAME,
            "producer must observe copy-out completion before slot reuse"
        );
        producer_slot.byte.store(SECOND_FRAME, StdOrdering::Relaxed);
        producer_slot.state.store(READY, StdOrdering::Release);
    });

    let consumer_slot = loom::sync::Arc::clone(&slot);
    let consumer = loom::thread::spawn(move || {
        while consumer_slot.state.load(StdOrdering::Acquire) != READY {
            loom::thread::yield_now();
        }
        assert_eq!(consumer_slot.byte.load(StdOrdering::Relaxed), FIRST_FRAME);
        consumer_slot
            .copy_out_marker
            .store(FIRST_FRAME, StdOrdering::Relaxed);
        consumer_slot.state.store(FREE, free_store);

        while consumer_slot.state.load(StdOrdering::Acquire) != READY {
            loom::thread::yield_now();
        }
        assert_eq!(consumer_slot.byte.load(StdOrdering::Relaxed), SECOND_FRAME);
        consumer_slot
            .copy_out_marker
            .store(SECOND_FRAME, StdOrdering::Relaxed);
        consumer_slot.state.store(FREE, free_store);
    });

    producer.join().expect("producer should not panic");
    consumer.join().expect("consumer should not panic");
}

struct ModelSlot {
    state: loom::sync::atomic::AtomicUsize,
    byte: loom::sync::atomic::AtomicUsize,
}

impl ModelSlot {
    fn new() -> Self {
        Self {
            state: loom::sync::atomic::AtomicUsize::new(EMPTY),
            byte: loom::sync::atomic::AtomicUsize::new(0),
        }
    }
}

struct ReusedSlot {
    state: loom::sync::atomic::AtomicUsize,
    byte: loom::sync::atomic::AtomicUsize,
    copy_out_marker: loom::sync::atomic::AtomicUsize,
}

impl ReusedSlot {
    fn new() -> Self {
        Self {
            state: loom::sync::atomic::AtomicUsize::new(FREE),
            byte: loom::sync::atomic::AtomicUsize::new(0),
            copy_out_marker: loom::sync::atomic::AtomicUsize::new(0),
        }
    }
}
