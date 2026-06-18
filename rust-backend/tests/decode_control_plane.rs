use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use uxfd_golden_harness::{save_rgba_png, RgbaFrame};
use uxfd_shared_memory_spike::PosixSharedRing;

#[test]
fn encode_shared_frame_session_tracks_descriptor_without_legacy_base64_fallback() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("encode-shared-frame-session");
    let output_path = temp_dir.path().join("encoded-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 16;
    let height = 16;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * height;
    let tight_rgba = vec![0x7a; width as usize * height as usize * 4];
    let padded_rgba = pad_rgba_rows(&tight_rgba, width, height, stride_bytes as usize);
    let producer_ring = PosixSharedRing::create_with_slot_count(
        &memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create encode source ring");
    producer_ring
        .write_frame(42, &padded_rgba)
        .expect("write encode source frame");

    let start = backend.request(json!({
        "id": 1,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-1",
            "filePath": output_path_string.clone(),
            "width": width,
            "height": height,
            "fps": 60,
            "pixelFormat": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(start["ok"], true, "{start}");
    assert_eq!(start["result"]["sessionId"], "encode-1");
    assert_eq!(start["result"]["filePath"], output_path_string);
    assert_eq!(start["result"]["width"], width);
    assert_eq!(start["result"]["height"], height);
    assert_eq!(start["result"]["fps"], 60);
    assert_no_frame_bytes_recursive(&start["result"]);

    let write_frame = backend.request(json!({
        "id": 2,
        "method": "encode.writeFrame",
        "params": {
            "sessionId": "encode-1",
            "frameIndex": 42,
            "timestampUs": 700000,
            "slotCount": slot_count,
            "frame": {
                "descriptor": {
                    "memoryId": memory_id,
                    "slotIndex": 0,
                    "generation": 3,
                    "byteOffset": 0,
                    "byteLen": slot_byte_len,
                    "width": width,
                    "height": height,
                    "strideBytes": stride_bytes,
                    "format": "rgba8Srgb",
                    "colour": {
                        "primaries": "bt709",
                        "transfer": "srgb",
                        "matrix": "rgb",
                        "range": "full"
                    }
                },
                "ptsFrame": 42
            }
        }
    }));
    assert_eq!(write_frame["ok"], true, "{write_frame}");
    assert_eq!(write_frame["result"]["written"], true);
    assert_eq!(write_frame["result"]["sessionId"], "encode-1");
    assert_eq!(write_frame["result"]["frameIndex"], 42);
    assert_eq!(write_frame["result"]["slotCount"], slot_count);
    assert_eq!(write_frame["result"]["frameCount"], 1);
    assert_no_frame_bytes_recursive(&write_frame["result"]);
    producer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("encode source slot returns to free after Rust reads it");

    let finish = backend.request(json!({
        "id": 3,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-1"
        }
    }));
    assert_eq!(finish["ok"], true, "{finish}");
    assert_eq!(finish["result"]["finished"], true);
    assert_eq!(finish["result"]["sessionId"], "encode-1");
    assert_eq!(finish["result"]["filePath"], output_path_string);
    assert_eq!(finish["result"]["frameCount"], 1);
    assert_no_frame_bytes_recursive(&finish["result"]);
    assert!(
        fs::metadata(&output_path)
            .expect("Rust encode output file exists")
            .len()
            > 0,
        "Rust encode output should contain an MP4 payload"
    );
}

#[test]
fn encode_start_accepts_audio_path_and_muxes_audio_with_shared_frames() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("encode-shared-frame-audio");
    let output_path = temp_dir.path().join("encoded-output-with-audio.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let audio_path = temp_dir.path().join("mixed-audio.wav");
    write_silent_wav_fixture(&audio_path, 48_000, 4_800);
    let audio_path_string = audio_path.to_string_lossy().into_owned();
    let memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 16;
    let height = 16;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * height;
    let tight_rgba = vec![0x9b; width as usize * height as usize * 4];
    let padded_rgba = pad_rgba_rows(&tight_rgba, width, height, stride_bytes as usize);
    let producer_ring = PosixSharedRing::create_with_slot_count(
        &memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create encode source ring");
    producer_ring
        .write_frame(0, &padded_rgba)
        .expect("write encode source frame");

    let start = backend.request(json!({
        "id": 1,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-audio-1",
            "filePath": output_path_string.clone(),
            "audioPath": audio_path_string.clone(),
            "width": width,
            "height": height,
            "fps": 30,
            "pixelFormat": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(start["ok"], true, "{start}");
    assert_eq!(start["result"]["audioPath"], audio_path_string);
    assert_no_frame_bytes_recursive(&start["result"]);

    let write_frame = backend.request(json!({
        "id": 2,
        "method": "encode.writeFrame",
        "params": {
            "sessionId": "encode-audio-1",
            "frameIndex": 0,
            "timestampUs": 0,
            "slotCount": slot_count,
            "frame": {
                "descriptor": {
                    "memoryId": memory_id,
                    "slotIndex": 0,
                    "generation": 1,
                    "byteOffset": 0,
                    "byteLen": slot_byte_len,
                    "width": width,
                    "height": height,
                    "strideBytes": stride_bytes,
                    "format": "rgba8Srgb",
                    "colour": {
                        "primaries": "bt709",
                        "transfer": "srgb",
                        "matrix": "rgb",
                        "range": "full"
                    }
                },
                "ptsFrame": 0
            }
        }
    }));
    assert_eq!(write_frame["ok"], true, "{write_frame}");

    let finish = backend.request(json!({
        "id": 3,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-audio-1"
        }
    }));
    assert_eq!(finish["ok"], true, "{finish}");
    assert_eq!(finish["result"]["audioPath"], audio_path_string);
    assert_no_frame_bytes_recursive(&finish["result"]);
    assert_mp4_has_audio_stream(&output_path);
}

#[test]
fn native_render_shared_frame_consumes_source_shm_and_returns_descriptor_only() {
    let mut backend = BackendProcess::start();
    let source_memory_id = unique_shm_name();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let output_slot_count = 2;
    let width = 4;
    let height = 4;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * height;
    let tight_rgba = test_frame_pixels(width, height, 0);
    let padded_rgba = pad_rgba_rows(&tight_rgba, width, height, stride_bytes as usize);
    let source_ring = PosixSharedRing::create_with_slot_count(
        &source_memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create native render source ring");
    source_ring
        .write_frame(0, &padded_rgba)
        .expect("write native render source frame");

    let response = backend.request(json!({
        "id": 11,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-1",
            "memoryId": output_memory_id,
            "slotCount": output_slot_count,
            "ptsFrame": 0,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-native-render",
                    "track_id": "track-1",
                    "media_id": "source-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "sources": [{
                "mediaId": "source-1",
                "slotCount": slot_count,
                "frame": {
                    "descriptor": {
                        "memoryId": source_memory_id,
                        "slotIndex": 0,
                        "generation": 1,
                        "byteOffset": 0,
                        "byteLen": slot_byte_len,
                        "width": width,
                        "height": height,
                        "strideBytes": stride_bytes,
                        "format": "rgba8Srgb",
                        "colour": {
                            "primaries": "bt709",
                            "transfer": "srgb",
                            "matrix": "rgb",
                            "range": "full"
                        }
                    },
                    "ptsFrame": 0
                }
            }]
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["rendered"], true);
    assert_eq!(response["result"]["renderId"], "native-render-1");
    assert_eq!(response["result"]["slotCount"], output_slot_count);
    assert_eq!(response["result"]["frame"]["ptsFrame"], 0);
    assert_eq!(
        response["result"]["frame"]["descriptor"]["memoryId"],
        output_memory_id
    );
    assert_eq!(
        response["result"]["frame"]["descriptor"]["strideBytes"]
            .as_u64()
            .expect("output stride")
            % 256,
        0
    );
    assert_no_frame_bytes_recursive(&response["result"]);

    source_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("source shared frame slot returns to free after native render");

    let output_slot_byte_len = response["result"]["frame"]["descriptor"]["byteLen"]
        .as_u64()
        .expect("output byte length") as usize;
    let output_ring = PosixSharedRing::attach_with_retry_for_layout(
        response["result"]["frame"]["descriptor"]["memoryId"]
            .as_str()
            .expect("output memory id"),
        output_slot_count,
        output_slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to native render output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native rendered output frame");
    assert_eq!(output_frame.bytes.len(), output_slot_byte_len);
}

#[test]
fn native_render_shared_frame_rejects_duplicate_media_and_shared_sources() {
    let mut backend = BackendProcess::start();
    let source_memory_id = unique_shm_name();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * height;
    let tight_rgba = test_frame_pixels(width, height, 0);
    let padded_rgba = pad_rgba_rows(&tight_rgba, width, height, stride_bytes as usize);
    let source_ring = PosixSharedRing::create_with_slot_count(
        &source_memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create duplicate source ring");
    source_ring
        .write_frame(0, &padded_rgba)
        .expect("write duplicate source frame");

    let response = backend.request(json!({
        "id": 12,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-duplicate-source",
            "memoryId": output_memory_id,
            "slotCount": slot_count,
            "ptsFrame": 0,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-duplicate-source",
                    "track_id": "track-1",
                    "media_id": "duplicate-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "media": [{
                "id": "duplicate-1",
                "kind": "SolidColour",
                "source": "#ff0000",
                "width": 2,
                "height": 2
            }],
            "sources": [{
                "mediaId": "duplicate-1",
                "slotCount": slot_count,
                "frame": {
                    "descriptor": {
                        "memoryId": source_memory_id,
                        "slotIndex": 0,
                        "generation": 1,
                        "byteOffset": 0,
                        "byteLen": slot_byte_len,
                        "width": width,
                        "height": height,
                        "strideBytes": stride_bytes,
                        "format": "rgba8Srgb",
                        "colour": {
                            "primaries": "bt709",
                            "transfer": "srgb",
                            "matrix": "rgb",
                            "range": "full"
                        }
                    },
                    "ptsFrame": 0
                }
            }]
        }
    }));

    assert_eq!(response["ok"], false, "{response}");
    assert_eq!(response["error"]["code"], -32602);
    assert!(
        response["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("Duplicate native render source mediaId 'duplicate-1'"),
        "{response}"
    );
}

#[test]
fn native_render_shared_frame_builds_solid_colour_sources_from_media() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let response = backend.request(json!({
        "id": 31,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-solid-colour",
            "memoryId": output_memory_id,
            "slotCount": slot_count,
            "ptsFrame": 0,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-solid-colour",
                    "track_id": "track-1",
                    "media_id": "solid-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "media": [{
                "id": "solid-1",
                "kind": "SolidColour",
                "source": "#ff0000",
                "width": 2,
                "height": 2
            }],
            "sources": []
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["rendered"], true);
    assert_eq!(response["result"]["frame"]["ptsFrame"], 0);
    assert_no_frame_bytes_recursive(&response["result"]);

    let output_slot_byte_len = response["result"]["frame"]["descriptor"]["byteLen"]
        .as_u64()
        .expect("output byte length") as usize;
    let output_ring = PosixSharedRing::attach_with_retry_for_layout(
        response["result"]["frame"]["descriptor"]["memoryId"]
            .as_str()
            .expect("output memory id"),
        slot_count,
        output_slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to native solid colour output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native solid colour output frame");
    assert_eq!(&output_frame.bytes[0..4], &[255, 0, 0, 255]);
    assert_eq!(&output_frame.bytes[8..12], &[0, 0, 0, 0]);
}

#[test]
fn native_render_shared_frame_builds_png_image_sources_from_media() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-render-image-media");
    let image_path = temp_dir.path().join("red-source.png");
    let image_frame = RgbaFrame::from_rgba8(
        2,
        2,
        vec![
            255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
        ],
    )
    .expect("build PNG source frame");
    save_rgba_png(&image_path, &image_frame).expect("write PNG source fixture");
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let response = backend.request(json!({
        "id": 32,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-image-media",
            "memoryId": output_memory_id,
            "slotCount": slot_count,
            "ptsFrame": 0,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-image-media",
                    "track_id": "track-1",
                    "media_id": "image-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "media": [{
                "id": "image-1",
                "kind": "Image",
                "source": image_path.to_string_lossy(),
                "width": 2,
                "height": 2
            }],
            "sources": []
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["rendered"], true);
    assert_no_frame_bytes_recursive(&response["result"]);

    let output_slot_byte_len = response["result"]["frame"]["descriptor"]["byteLen"]
        .as_u64()
        .expect("output byte length") as usize;
    let output_ring = PosixSharedRing::attach_with_retry_for_layout(
        response["result"]["frame"]["descriptor"]["memoryId"]
            .as_str()
            .expect("output memory id"),
        slot_count,
        output_slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to native image media output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native image media output frame");
    assert_eq!(&output_frame.bytes[0..4], &[255, 0, 0, 255]);
    assert_eq!(&output_frame.bytes[8..12], &[0, 0, 0, 0]);
}

#[test]
fn native_render_shared_frame_builds_jpeg_image_sources_from_media() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-render-jpeg-media");
    let image_path = temp_dir.path().join("red-source.jpg");
    write_solid_jpeg_fixture(&image_path, 2, 2, [255, 0, 0]);
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let response = backend.request(json!({
        "id": 33,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-jpeg-media",
            "memoryId": output_memory_id,
            "slotCount": slot_count,
            "ptsFrame": 0,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-jpeg-media",
                    "track_id": "track-1",
                    "media_id": "image-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "media": [{
                "id": "image-1",
                "kind": "Image",
                "source": image_path.to_string_lossy(),
                "width": 2,
                "height": 2
            }],
            "sources": []
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["rendered"], true);
    assert_no_frame_bytes_recursive(&response["result"]);

    let output_slot_byte_len = response["result"]["frame"]["descriptor"]["byteLen"]
        .as_u64()
        .expect("output byte length") as usize;
    let output_ring = PosixSharedRing::attach_with_retry_for_layout(
        response["result"]["frame"]["descriptor"]["memoryId"]
            .as_str()
            .expect("output memory id"),
        slot_count,
        output_slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to native JPEG media output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native JPEG media output frame");
    assert_red_pixel(&output_frame.bytes[0..4]);
    assert_eq!(&output_frame.bytes[8..12], &[0, 0, 0, 0]);
}

#[test]
fn encode_write_frame_unlinks_native_render_output_after_consuming_it() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("encode-native-render-output-release");
    let output_path = temp_dir.path().join("encoded-native-render-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let source_memory_id = unique_shm_name();
    let render_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * height;
    let tight_rgba = test_frame_pixels(width, height, 0);
    let padded_rgba = pad_rgba_rows(&tight_rgba, width, height, stride_bytes as usize);
    let source_ring = PosixSharedRing::create_with_slot_count(
        &source_memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create native render source ring for encode release");
    source_ring
        .write_frame(0, &padded_rgba)
        .expect("write native render source frame for encode release");

    let render = backend.request(json!({
        "id": 21,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-encode-release",
            "memoryId": render_memory_id,
            "slotCount": slot_count,
            "ptsFrame": 0,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-native-render-encode-release",
                    "track_id": "track-1",
                    "media_id": "source-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "sources": [{
                "mediaId": "source-1",
                "slotCount": slot_count,
                "frame": {
                    "descriptor": {
                        "memoryId": source_memory_id,
                        "slotIndex": 0,
                        "generation": 1,
                        "byteOffset": 0,
                        "byteLen": slot_byte_len,
                        "width": width,
                        "height": height,
                        "strideBytes": stride_bytes,
                        "format": "rgba8Srgb",
                        "colour": {
                            "primaries": "bt709",
                            "transfer": "srgb",
                            "matrix": "rgb",
                            "range": "full"
                        }
                    },
                    "ptsFrame": 0
                }
            }]
        }
    }));
    assert_eq!(render["ok"], true, "{render}");

    let start = backend.request(json!({
        "id": 22,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-native-render-release",
            "filePath": output_path_string,
            "width": width,
            "height": height,
            "fps": 60,
            "pixelFormat": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(start["ok"], true, "{start}");

    let write = backend.request(json!({
        "id": 23,
        "method": "encode.writeFrame",
        "params": {
            "sessionId": "encode-native-render-release",
            "frameIndex": 0,
            "timestampUs": 0,
            "slotCount": render["result"]["slotCount"],
            "frame": render["result"]["frame"]
        }
    }));
    assert_eq!(write["ok"], true, "{write}");

    let render_slot_byte_len = render["result"]["frame"]["descriptor"]["byteLen"]
        .as_u64()
        .expect("native render output byte length") as usize;
    let attach_after_encode = PosixSharedRing::attach_with_retry_for_layout(
        render["result"]["frame"]["descriptor"]["memoryId"]
            .as_str()
            .expect("native render output memory id"),
        slot_count,
        render_slot_byte_len,
        Duration::from_millis(100),
    );
    assert!(
        attach_after_encode.is_err(),
        "native render output shared memory should be unlinked after encode.writeFrame consumes it"
    );

    let finish = backend.request(json!({
        "id": 24,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-native-render-release"
        }
    }));
    assert_eq!(finish["ok"], true, "{finish}");
}

#[test]
fn encode_write_frame_requires_slot_count_for_shared_memory_attach() {
    let mut backend = BackendProcess::start();

    let start = backend.request(json!({
        "id": 1,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-1",
            "filePath": "/tmp/output.mp4",
            "width": 1920,
            "height": 1080,
            "fps": 60,
            "pixelFormat": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(start["ok"], true, "{start}");

    let write_frame = backend.request(json!({
        "id": 2,
        "method": "encode.writeFrame",
        "params": {
            "sessionId": "encode-1",
            "frameIndex": 42,
            "timestampUs": 700000,
            "frame": {
                "descriptor": {
                    "memoryId": "/uxfd-export-frame-ring",
                    "slotIndex": 1,
                    "generation": 3,
                    "byteOffset": 8294400,
                    "byteLen": 8294400,
                    "width": 1920,
                    "height": 1080,
                    "strideBytes": 7680,
                    "format": "rgba8Srgb",
                    "colour": {
                        "primaries": "bt709",
                        "transfer": "srgb",
                        "matrix": "rgb",
                        "range": "full"
                    }
                },
                "ptsFrame": 42
            }
        }
    }));
    assert_eq!(write_frame["ok"], false);
    assert!(
        write_frame["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("slot_count")
            || write_frame["error"]["message"]
                .as_str()
                .expect("error message")
                .contains("slotCount"),
        "{write_frame}"
    );
}

#[test]
fn encode_write_frame_rejects_descriptor_that_does_not_match_session() {
    let mut backend = BackendProcess::start();

    let start = backend.request(json!({
        "id": 1,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-1",
            "filePath": "/tmp/output.mp4",
            "width": 1920,
            "height": 1080,
            "fps": 60,
            "pixelFormat": "rgba8Srgb",
            "colour": {
                "primaries": "bt709",
                "transfer": "srgb",
                "matrix": "rgb",
                "range": "full"
            }
        }
    }));
    assert_eq!(start["ok"], true, "{start}");

    let write_frame = backend.request(json!({
        "id": 2,
        "method": "encode.writeFrame",
        "params": {
            "sessionId": "encode-1",
            "frameIndex": 42,
            "timestampUs": 700000,
            "slotCount": 2,
            "frame": {
                "descriptor": {
                    "memoryId": "/uxfd-export-frame-ring",
                    "slotIndex": 1,
                    "generation": 3,
                    "byteOffset": 0,
                    "byteLen": 512,
                    "width": 2,
                    "height": 2,
                    "strideBytes": 256,
                    "format": "rgba8Srgb",
                    "colour": {
                        "primaries": "bt709",
                        "transfer": "srgb",
                        "matrix": "rgb",
                        "range": "full"
                    }
                },
                "ptsFrame": 42
            }
        }
    }));
    assert_eq!(write_frame["ok"], false);
    assert_eq!(
        write_frame["error"]["message"],
        "Encode frame descriptor does not match active session"
    );
}

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

fn unique_shm_name() -> String {
    static SHM_COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_nanos() as u64;
    let counter = SHM_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("/ue{:x}{:x}{:x}", std::process::id(), nanos, counter)
}

fn run_ffmpeg_command(command: &mut Command, label: &str) {
    let output = command.output().expect(label);
    assert!(
        output.status.success(),
        "{label} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn write_silent_wav_fixture(path: &Path, sample_rate: u32, sample_count: u32) {
    let channels = 1u16;
    let bytes_per_sample = 2u16;
    let block_align = channels * bytes_per_sample;
    let byte_rate = sample_rate * u32::from(block_align);
    let data_size = sample_count * u32::from(block_align);
    let mut bytes = Vec::with_capacity(44 + data_size as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&channels.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&byte_rate.to_le_bytes());
    bytes.extend_from_slice(&block_align.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_size.to_le_bytes());
    bytes.resize(44 + data_size as usize, 0);
    fs::write(path, bytes).expect("write silent wav fixture");
}

fn write_solid_jpeg_fixture(path: &Path, width: u32, height: u32, colour: [u8; 3]) {
    let raw_path = path.with_extension("rgba");
    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
    for _ in 0..width as usize * height as usize {
        rgba.extend([colour[0], colour[1], colour[2], 255]);
    }
    fs::write(&raw_path, rgba).expect("write JPEG source RGBA fixture");

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
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg("1")
        .arg("-q:v")
        .arg("2")
        .arg(path);
    run_ffmpeg_command(&mut command, "encode JPEG fixture");
}

fn assert_red_pixel(pixel: &[u8]) {
    assert_eq!(pixel.len(), 4);
    assert!(
        pixel[0] >= 200 && pixel[1] <= 40 && pixel[2] <= 40 && pixel[3] == 255,
        "expected JPEG decoded pixel to stay near opaque red, got {pixel:?}"
    );
}

fn assert_mp4_has_audio_stream(path: &Path) {
    let ffprobe_path = std::env::var("UXFD_FFPROBE_BIN").unwrap_or_else(|_| "ffprobe".to_string());
    let output = Command::new(&ffprobe_path)
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("stream=codec_type")
        .arg("-of")
        .arg("json")
        .arg(path)
        .output()
        .expect("run ffprobe for encoded output");
    assert!(
        output.status.success(),
        "ffprobe failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let parsed: Value = serde_json::from_slice(&output.stdout).expect("parse ffprobe JSON");
    let has_audio = parsed
        .get("streams")
        .and_then(Value::as_array)
        .is_some_and(|streams| {
            streams
                .iter()
                .any(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("audio"))
        });
    assert!(has_audio, "encoded MP4 should contain an audio stream: {parsed}");
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
