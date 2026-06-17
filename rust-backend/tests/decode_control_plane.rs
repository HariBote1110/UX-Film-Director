use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use uxfd_shared_memory_spike::PosixSharedRing;

#[test]
fn decode_start_returns_shared_ring_layout_without_frame_bytes() {
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-1",
            "source": "/media/input.mp4",
            "slotCount": 3,
            "width": 1919,
            "height": 2,
            "sourceRate": {
                "numerator": 60,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["jobId"], "decode-1");
    assert!(response["result"]["memoryId"]
        .as_str()
        .expect("memory id")
        .starts_with("/uxfd-"));
    assert!(
        response["result"]["memoryId"]
            .as_str()
            .expect("memory id")
            .len()
            <= 31,
        "POSIX shm name must stay inside the macOS name limit"
    );
    assert_eq!(response["result"]["slotCount"], 3);
    assert_eq!(response["result"]["sourceRate"]["numerator"], 60);
    assert_eq!(response["result"]["sourceRate"]["denominator"], 1);
    assert_eq!(response["result"]["strideBytes"], 7680);
    assert_eq!(response["result"]["slotByteLen"], 15360);
    assert_no_frame_bytes(&response["result"]);
}

#[test]
fn decode_start_uses_short_shared_memory_name_for_renderer_length_job_id() {
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "shared-renderer-video-video-1-64x32-60over1",
            "source": "/media/input.mp4",
            "slotCount": 2,
            "width": 64,
            "height": 32,
            "sourceRate": {
                "numerator": 60,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    let memory_id = response["result"]["memoryId"].as_str().expect("memory id");
    assert!(
        memory_id.len() <= 31,
        "POSIX shm name must stay inside the macOS name limit: {memory_id}"
    );
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn decode_stop_releases_active_session_so_another_source_can_start() {
    let temp_dir = TestTempDir::new("decode-control-plane-stop");
    let replacement_fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();
    backend.start_decode();

    let stop_response = backend.request(json!({
        "id": 2,
        "method": "decode.stop",
        "params": {
            "jobId": "decode-1"
        }
    }));

    assert_eq!(stop_response["ok"], true);
    assert_eq!(stop_response["result"]["stopped"], true);
    assert_eq!(stop_response["result"]["jobId"], "decode-1");
    assert_no_frame_bytes(&stop_response["result"]);

    let restart_response = backend.request(json!({
        "id": 3,
        "method": "decode.start",
        "params": {
            "jobId": "decode-2",
            "source": replacement_fixture.path,
            "slotCount": 2,
            "width": replacement_fixture.width,
            "height": replacement_fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));

    assert_eq!(restart_response["ok"], true);
    assert_eq!(restart_response["result"]["jobId"], "decode-2");
    assert_no_frame_bytes(&restart_response["result"]);
}

#[test]
fn decode_backend_allows_multiple_video_sessions_by_job_id() {
    let temp_dir = TestTempDir::new("decode-control-plane-multi-session");
    let first_fixture =
        build_two_frame_h264_fixture_with_range(temp_dir.path(), "first.mp4", None, "pc", "pc");
    let second_fixture =
        build_two_frame_h264_fixture_with_range(temp_dir.path(), "second.mp4", None, "pc", "pc");
    let mut backend = BackendProcess::start();

    let first_start = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-a",
            "source": first_fixture.path,
            "slotCount": 1,
            "width": first_fixture.width,
            "height": first_fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(first_start["ok"], true);

    let second_start = backend.request(json!({
        "id": 2,
        "method": "decode.start",
        "params": {
            "jobId": "decode-b",
            "source": second_fixture.path,
            "slotCount": 1,
            "width": second_fixture.width,
            "height": second_fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(second_start["ok"], true);
    assert_ne!(
        first_start["result"]["memoryId"],
        second_start["result"]["memoryId"]
    );
    let first_memory_id = first_start["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let second_memory_id = second_start["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let first_slot_byte_len = first_start["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let second_slot_byte_len = second_start["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let first_consumer_ring = PosixSharedRing::attach_with_retry_for_layout(
        first_memory_id,
        1,
        first_slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to first backend-created shared frame ring");
    let second_consumer_ring = PosixSharedRing::attach_with_retry_for_layout(
        second_memory_id,
        1,
        second_slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to second backend-created shared frame ring");

    let first_frame = backend.request(json!({
        "id": 3,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-a",
            "requestId": 101,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));
    let second_frame = backend.request(json!({
        "id": 4,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-b",
            "requestId": 201,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(first_frame["ok"], true);
    assert_eq!(second_frame["ok"], true);
    assert_eq!(first_frame["result"]["jobId"], "decode-a");
    assert_eq!(second_frame["result"]["jobId"], "decode-b");
    assert_eq!(
        first_frame["result"]["frame"]["descriptor"]["memoryId"],
        first_start["result"]["memoryId"]
    );
    assert_eq!(
        second_frame["result"]["frame"]["descriptor"]["memoryId"],
        second_start["result"]["memoryId"]
    );
    first_consumer_ring
        .read_frame(0)
        .expect("consumer reads first session frame before release");
    second_consumer_ring
        .read_frame(1)
        .expect("consumer reads second session frame before release");

    let first_release = backend.request(json!({
        "id": 5,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "decode-a",
            "slotIndex": first_frame["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": first_frame["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    let second_release = backend.request(json!({
        "id": 6,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "decode-b",
            "slotIndex": second_frame["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": second_frame["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));

    assert_eq!(first_release["ok"], true);
    assert_eq!(second_release["ok"], true);
    assert_no_frame_bytes_recursive(&first_frame["result"]);
    assert_no_frame_bytes_recursive(&second_frame["result"]);
    first_consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("first shared memory slot returns to free");
    second_consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("second shared memory slot returns to free");
}

#[test]
fn decode_request_frame_decodes_requested_source_frame_to_verified_descriptor_without_pixels() {
    let temp_dir = TestTempDir::new("decode-control-plane");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-actual",
            "source": fixture.path,
            "slotCount": 2,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));

    assert_eq!(start_response["ok"], true);
    let stride_bytes = start_response["result"]["strideBytes"]
        .as_u64()
        .expect("stride bytes") as usize;
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    assert_ne!(stride_bytes, fixture.width as usize * 4);

    let expected_tight_rgba =
        decode_tight_rgba_frame(&fixture.path, 1, fixture.width, fixture.height);
    let expected_padded_rgba = pad_rgba_rows(
        &expected_tight_rgba,
        fixture.width,
        fixture.height,
        stride_bytes,
    );
    assert_eq!(expected_padded_rgba.len(), slot_byte_len);

    let response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-actual",
            "requestId": 11,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["accepted"], true);
    assert_eq!(response["result"]["jobId"], "decode-actual");
    assert_eq!(response["result"]["requestId"], 11);
    assert_eq!(response["result"]["frameIndex"], 1);
    assert_eq!(response["result"]["mode"], "latestWins");
    assert_eq!(response["result"]["decodeInvocationCount"], 1);
    assert_eq!(response["result"]["frame"]["ptsFrame"], 1);
    assert_eq!(
        response["result"]["frame"]["descriptor"]["memoryId"],
        start_response["result"]["memoryId"]
    );
    assert_eq!(response["result"]["frame"]["descriptor"]["slotIndex"], 0);
    assert_eq!(response["result"]["frame"]["descriptor"]["generation"], 1);
    assert_eq!(
        response["result"]["frame"]["descriptor"]["byteLen"],
        slot_byte_len
    );
    assert_eq!(
        response["result"]["frame"]["descriptor"]["strideBytes"],
        stride_bytes
    );
    assert_eq!(response["result"]["verification"]["frameIndex"], 1);
    assert_eq!(
        response["result"]["verification"]["checksum"]["algorithm"],
        "crc32"
    );
    assert_eq!(
        response["result"]["verification"]["checksum"]["valueHex"],
        crc32_hex(&expected_padded_rgba)
    );
    assert_eq!(
        response["result"]["verification"]["checksum"]["byteLen"],
        slot_byte_len
    );
    assert_eq!(
        response["result"]["verification"]["status"],
        "withinTolerance"
    );
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn decode_request_frame_writes_decoded_rgba_to_posix_shared_memory() {
    let temp_dir = TestTempDir::new("decode-control-plane-shm");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-shm",
            "source": fixture.path,
            "slotCount": 1,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));

    assert_eq!(start_response["ok"], true);
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let stride_bytes = start_response["result"]["strideBytes"]
        .as_u64()
        .expect("stride bytes") as usize;
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    assert!(
        memory_id.starts_with("/uxfd-"),
        "memoryId must be an attachable POSIX shared memory name"
    );

    let consumer_ring =
        PosixSharedRing::attach_with_retry(memory_id, slot_byte_len, Duration::from_secs(1))
            .expect("attach to backend-created shared frame ring");

    let expected_tight_rgba =
        decode_tight_rgba_frame(&fixture.path, 1, fixture.width, fixture.height);
    let expected_padded_rgba = pad_rgba_rows(
        &expected_tight_rgba,
        fixture.width,
        fixture.height,
        stride_bytes,
    );

    let frame_response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-shm",
            "requestId": 31,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(frame_response["ok"], true);
    let mapped_frame = consumer_ring
        .read_frame(1)
        .expect("consumer reads decoded RGBA from shared memory");
    assert_eq!(mapped_frame.bytes, expected_padded_rgba);
    assert_eq!(
        frame_response["result"]["verification"]["checksum"]["valueHex"],
        crc32_hex(&mapped_frame.bytes)
    );
    assert_no_frame_bytes_recursive(&frame_response["result"]);

    let release_response = backend.request(json!({
        "id": 3,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "decode-shm",
            "slotIndex": frame_response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": frame_response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));

    assert_eq!(release_response["ok"], true);
    consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("backend release returns shared memory slot to free");
}

#[test]
fn decode_request_frame_uses_second_shared_memory_slot_while_first_slot_is_reading() {
    let temp_dir = TestTempDir::new("decode-control-plane-shm-multi-slot");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "dms2",
            "source": fixture.path,
            "slotCount": 2,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));

    assert_eq!(start_response["ok"], true);
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let stride_bytes = start_response["result"]["strideBytes"]
        .as_u64()
        .expect("stride bytes") as usize;
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let consumer_ring = PosixSharedRing::attach_with_retry_for_layout(
        memory_id,
        2,
        slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to backend-created multi-slot shared frame ring");

    let expected_first = pad_rgba_rows(
        &decode_tight_rgba_frame(&fixture.path, 0, fixture.width, fixture.height),
        fixture.width,
        fixture.height,
        stride_bytes,
    );
    let expected_second = pad_rgba_rows(
        &decode_tight_rgba_frame(&fixture.path, 1, fixture.width, fixture.height),
        fixture.width,
        fixture.height,
        stride_bytes,
    );

    let first_response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "dms2",
            "requestId": 41,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));
    assert_eq!(first_response["ok"], true);
    assert_eq!(
        first_response["result"]["frame"]["descriptor"]["slotIndex"],
        0
    );
    let first_mapped_frame = consumer_ring
        .read_frame(0)
        .expect("consumer keeps first decoded frame in reading state");
    assert_eq!(first_mapped_frame.bytes, expected_first);

    let second_response = backend.request(json!({
        "id": 3,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "dms2",
            "requestId": 42,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));
    assert_eq!(second_response["ok"], true);
    assert_eq!(
        second_response["result"]["frame"]["descriptor"]["slotIndex"],
        1
    );
    let second_mapped_frame = consumer_ring
        .read_frame(1)
        .expect("consumer reads second decoded frame from a different shared memory slot");
    assert_eq!(second_mapped_frame.bytes, expected_second);
    assert_no_frame_bytes_recursive(&first_response["result"]);
    assert_no_frame_bytes_recursive(&second_response["result"]);

    let first_release_response = backend.request(json!({
        "id": 4,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "dms2",
            "slotIndex": first_response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": first_response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(first_release_response["ok"], true);

    let second_release_response = backend.request(json!({
        "id": 5,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "dms2",
            "slotIndex": second_response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": second_response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(second_release_response["ok"], true);

    consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("both shared memory slots return to free");
}

#[test]
fn decode_request_frame_uses_limited_range_source_metadata_for_rgba_handoff() {
    let temp_dir = TestTempDir::new("decode-control-plane-limited");
    let fixture = build_limited_range_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-limited",
            "source": fixture.path,
            "slotCount": 2,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));

    assert_eq!(start_response["ok"], true);
    let stride_bytes = start_response["result"]["strideBytes"]
        .as_u64()
        .expect("stride bytes") as usize;
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let expected_tight_rgba = decode_tight_rgba_frame_with_input_range(
        &fixture.path,
        1,
        fixture.width,
        fixture.height,
        "tv",
    );
    let expected_padded_rgba = pad_rgba_rows(
        &expected_tight_rgba,
        fixture.width,
        fixture.height,
        stride_bytes,
    );
    assert_eq!(expected_padded_rgba.len(), slot_byte_len);

    let response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-limited",
            "requestId": 22,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["verification"]["checksum"]["valueHex"],
        crc32_hex(&expected_padded_rgba)
    );
    assert_eq!(
        response["result"]["frame"]["descriptor"]["colour"]["range"],
        "full"
    );
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn decode_request_frame_rejects_unsupported_transfer_metadata() {
    let temp_dir = TestTempDir::new("decode-control-plane-unsupported-transfer");
    let fixture = build_two_frame_h264_fixture_with_colour_metadata(
        temp_dir.path(),
        "unsupported-transfer.mp4",
        None,
        "pc",
        "pc",
        "bt709",
        "bt709",
        "bt709",
    );
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "dtg",
            "source": fixture.path,
            "slotCount": 2,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": {
                "numerator": 30,
                "denominator": 1
            },
            "format": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(start_response["ok"], true, "{start_response}");

    let response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "dtg",
            "requestId": 52,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(response["ok"], false);
    assert!(response["error"]["message"]
        .as_str()
        .expect("error message")
        .contains("unsupported video color_transfer for Rust decode"));
    assert_no_frame_bytes_recursive(&response);
}

#[test]
fn decode_request_frame_accepts_frame_index_without_float_seconds() {
    let mut backend = BackendProcess::start();
    backend.start_decode();

    let response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-1",
            "requestId": 7,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["accepted"], true);
    assert_eq!(response["result"]["jobId"], "decode-1");
    assert_eq!(response["result"]["requestId"], 7);
    assert_eq!(response["result"]["frameIndex"], 1);
    assert_eq!(response["result"]["mode"], "latestWins");
    assert!(response["result"].get("seconds").is_none());
    assert!(response["result"].get("time").is_none());
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn decode_release_frame_requires_completed_gpu_copy_out() {
    let mut backend = BackendProcess::start();
    let start_response = backend.start_decode();
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let consumer_ring = PosixSharedRing::attach_with_retry_for_layout(
        memory_id,
        2,
        slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to backend-created shared frame ring");

    let frame_response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-1",
            "requestId": 8,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));
    assert_eq!(frame_response["ok"], true);
    consumer_ring
        .read_frame(1)
        .expect("consumer reads frame before release");

    let response = backend.request(json!({
        "id": 3,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "decode-1",
            "slotIndex": frame_response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": frame_response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["released"], true);
    assert_eq!(
        response["result"]["slotIndex"],
        frame_response["result"]["frame"]["descriptor"]["slotIndex"]
    );
    assert_eq!(
        response["result"]["generation"],
        frame_response["result"]["frame"]["descriptor"]["generation"]
    );
    assert_no_frame_bytes(&response["result"]);
    consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("backend release returns shared memory slot to free");
}

fn assert_no_frame_bytes(value: &Value) {
    assert!(value.get("frameBase64").is_none());
    assert!(value.get("bytes").is_none());
    assert!(value.get("pixels").is_none());
}

fn assert_no_frame_bytes_recursive(value: &Value) {
    match value {
        Value::Object(object) => {
            assert!(!object.contains_key("frameBase64"));
            assert!(!object.contains_key("bytes"));
            assert!(!object.contains_key("pixels"));
            for child in object.values() {
                assert_no_frame_bytes_recursive(child);
            }
        }
        Value::Array(values) => {
            for child in values {
                assert_no_frame_bytes_recursive(child);
            }
        }
        _ => {}
    }
}

struct TestVideoFixture {
    path: PathBuf,
    width: u32,
    height: u32,
}

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(label: &str) -> Self {
        let micros = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_micros();
        let path =
            std::env::temp_dir().join(format!("uxfd-{label}-{}-{micros}", std::process::id()));
        fs::create_dir_all(&path).expect("create temporary directory");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestTempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn build_two_frame_h264_fixture(directory: &Path) -> TestVideoFixture {
    build_two_frame_h264_fixture_with_range(directory, "two-frame-source.mp4", None, "pc", "pc")
}

fn build_limited_range_two_frame_h264_fixture(directory: &Path) -> TestVideoFixture {
    build_two_frame_h264_fixture_with_range(
        directory,
        "two-frame-source-limited.mp4",
        Some("zscale=primariesin=bt709:transferin=iec61966-2-1:matrixin=gbr:rangein=full:primaries=bt709:transfer=iec61966-2-1:matrix=bt709:range=limited,format=yuv444p"),
        "tv",
        "tv",
    )
}

fn build_two_frame_h264_fixture_with_range(
    directory: &Path,
    file_name: &str,
    video_filter: Option<&'static str>,
    x264_range: &'static str,
    container_range: &'static str,
) -> TestVideoFixture {
    build_two_frame_h264_fixture_with_colour_metadata(
        directory,
        file_name,
        video_filter,
        x264_range,
        container_range,
        "bt709",
        "iec61966-2-1",
        "bt709",
    )
}

fn build_two_frame_h264_fixture_with_colour_metadata(
    directory: &Path,
    file_name: &str,
    video_filter: Option<&'static str>,
    x264_range: &'static str,
    container_range: &'static str,
    color_primaries: &'static str,
    color_trc: &'static str,
    colorspace: &'static str,
) -> TestVideoFixture {
    let width = 34;
    let height = 16;
    let raw_path = directory.join("two-frame-source.rgba");
    let video_path = directory.join(file_name);
    let mut raw_frames = Vec::new();
    raw_frames.extend(test_frame_pixels(width, height, 0));
    raw_frames.extend(test_frame_pixels(width, height, 1));
    fs::write(&raw_path, raw_frames).expect("write raw test frames");

    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pixel_format")
        .arg("rgba")
        .arg("-video_size")
        .arg(format!("{width}x{height}"))
        .arg("-framerate")
        .arg("30")
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg("2");

    if let Some(video_filter) = video_filter {
        command.arg("-vf").arg(video_filter);
    }

    command
        .arg("-pix_fmt")
        .arg("yuv444p")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("0")
        .arg("-x264-params")
        .arg(format!("keyint=1:min-keyint=1:scenecut=0:range={x264_range}:colorprim={color_primaries}:transfer={color_trc}:colormatrix={colorspace}"))
        .arg("-color_primaries")
        .arg(color_primaries)
        .arg("-color_trc")
        .arg(color_trc)
        .arg("-colorspace")
        .arg(colorspace)
        .arg("-color_range")
        .arg(container_range)
        .arg("-video_track_timescale")
        .arg("30")
        .arg(&video_path);
    run_ffmpeg_command(&mut command, "encode two-frame fixture");

    TestVideoFixture {
        path: video_path,
        width,
        height,
    }
}

fn test_frame_pixels(width: u32, height: u32, frame_index: u8) -> Vec<u8> {
    let mut pixels = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            let red = ((x * 7 + y * 3 + u32::from(frame_index) * 41) & 0xff) as u8;
            let green = ((x * 5 + y * 11 + u32::from(frame_index) * 83) & 0xff) as u8;
            let blue = ((x * 13 + y * 17 + u32::from(frame_index) * 29) & 0xff) as u8;
            pixels.extend([red, green, blue, 255]);
        }
    }
    pixels
}

fn decode_tight_rgba_frame(path: &Path, frame_index: u64, width: u32, height: u32) -> Vec<u8> {
    decode_tight_rgba_frame_with_input_range(path, frame_index, width, height, "pc")
}

fn decode_tight_rgba_frame_with_input_range(
    path: &Path,
    frame_index: u64,
    width: u32,
    height: u32,
    input_range: &'static str,
) -> Vec<u8> {
    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(path)
        .arg("-vf")
        .arg(format!(
            "select=eq(n\\,{frame_index}),scale=in_range={input_range}:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgba"
        ))
        .arg("-frames:v")
        .arg("1")
        .arg("-pix_fmt")
        .arg("rgba")
        .arg("-f")
        .arg("rawvideo")
        .arg("pipe:1");

    let output = command.output().expect("run ffmpeg decode");
    assert!(
        output.status.success(),
        "decode fixture frame failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(output.stdout.len(), width as usize * height as usize * 4);
    output.stdout
}

fn pad_rgba_rows(tight_rgba: &[u8], width: u32, height: u32, stride_bytes: usize) -> Vec<u8> {
    let row_bytes = width as usize * 4;
    assert_eq!(tight_rgba.len(), row_bytes * height as usize);
    let mut padded = vec![0; stride_bytes * height as usize];
    for row in 0..height as usize {
        let source_start = row * row_bytes;
        let destination_start = row * stride_bytes;
        padded[destination_start..destination_start + row_bytes]
            .copy_from_slice(&tight_rgba[source_start..source_start + row_bytes]);
    }
    padded
}

fn crc32_hex(bytes: &[u8]) -> String {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(bytes);
    format!("{:08x}", hasher.finalize())
}

fn run_ffmpeg_command(command: &mut Command, label: &str) {
    let output = command.output().expect(label);
    assert!(
        output.status.success(),
        "{label} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

struct BackendProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    temp_dirs: Vec<TestTempDir>,
}

impl BackendProcess {
    fn start() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_uxfd-rust-backend"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("start rust backend");
        let stdin = child.stdin.take().expect("backend stdin");
        let stdout = BufReader::new(child.stdout.take().expect("backend stdout"));

        Self {
            child,
            stdin,
            stdout,
            temp_dirs: Vec::new(),
        }
    }

    fn start_decode(&mut self) -> Value {
        let temp_dir = TestTempDir::new("decode-control-plane-session");
        let fixture = build_two_frame_h264_fixture(temp_dir.path());
        let response = self.request(json!({
            "id": 1,
            "method": "decode.start",
            "params": {
                "jobId": "decode-1",
                "source": fixture.path,
                "slotCount": 2,
                "width": fixture.width,
                "height": fixture.height,
                "sourceRate": {
                    "numerator": 30,
                    "denominator": 1
                },
                "format": "rgba8Srgb",
                "colour": {
                    "primaries": "bt709",
                    "transfer": "srgb",
                    "matrix": "rgb",
                    "range": "full"
                }
            }
        }));

        assert_eq!(response["ok"], true);
        self.temp_dirs.push(temp_dir);
        response
    }

    fn request(&mut self, payload: Value) -> Value {
        writeln!(self.stdin, "{payload}").expect("write backend request");
        self.stdin.flush().expect("flush backend request");

        let mut line = String::new();
        self.stdout
            .read_line(&mut line)
            .expect("read backend response");
        serde_json::from_str(&line).expect("parse backend response")
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
