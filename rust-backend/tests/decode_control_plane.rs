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

/// Builds a `file://` URL from a real filesystem path, matching the
/// convention the Electron/TS side already uses for Windows drive paths
/// (`src/utils/mediaMetadata.ts`'s `file:///C:/Users/...`, three slashes:
/// the `file://` scheme separator plus the URL's own root slash). A naive
/// `format!("file://{}", path.display())` is wrong on Windows for two
/// independent reasons: backslash path separators are not valid URL path
/// separators, and a bare drive-letter path (`C:\Users\...`) has no leading
/// `/` for `local_media_source_path` to recognise as a URL path root.
fn file_url_for_path(path: &Path) -> String {
    let with_forward_slashes = path.to_string_lossy().replace('\\', "/").replace(' ', "%20");
    if with_forward_slashes.starts_with('/') {
        format!("file://{with_forward_slashes}")
    } else {
        format!("file:///{with_forward_slashes}")
    }
}

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
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&memory_id, slot_count, slot_byte_len as usize)
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
fn encode_abort_removes_active_session_after_frame_source_failure() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("encode-abort-session");
    let output_path = temp_dir.path().join("aborted-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();

    let start = backend.request(json!({
        "id": 1,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-abort-1",
            "filePath": output_path_string.clone(),
            "width": 16,
            "height": 16,
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

    let abort = backend.request(json!({
        "id": 2,
        "method": "encode.abort",
        "params": {
            "sessionId": "encode-abort-1"
        }
    }));
    assert_eq!(abort["ok"], true, "{abort}");
    assert_eq!(abort["result"]["aborted"], true);
    assert_eq!(abort["result"]["sessionId"], "encode-abort-1");

    let restart = backend.request(json!({
        "id": 3,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-abort-1",
            "filePath": output_path_string,
            "width": 16,
            "height": 16,
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
    assert_eq!(restart["ok"], true, "{restart}");

    let abort_restart = backend.request(json!({
        "id": 4,
        "method": "encode.abort",
        "params": {
            "sessionId": "encode-abort-1"
        }
    }));
    assert_eq!(abort_restart["ok"], true, "{abort_restart}");
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
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&memory_id, slot_count, slot_byte_len as usize)
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
fn audio_waveform_samples_decodes_pcm_for_native_waveform_generation() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("audio-waveform-samples");
    let audio_path = temp_dir.path().join("silent-waveform.wav");
    write_silent_wav_fixture(&audio_path, 4, 4);

    let response = backend.request(json!({
        "id": 301,
        "method": "audio.waveformSamples",
        "params": {
            "source": audio_path.to_string_lossy(),
            "sampleRate": 4,
            "maxSamples": 4
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["sampleRate"], 4);
    assert_eq!(response["result"]["sampleCount"], 4);
    assert_eq!(response["result"]["samples"], json!([0.0, 0.0, 0.0, 0.0]));
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn encode_finish_reports_ffmpeg_stderr_when_muxing_fails() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("encode-ffmpeg-stderr");
    let output_path_string = temp_dir.path().to_string_lossy().into_owned();
    let memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 16;
    let height = 16;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * height;
    let tight_rgba = vec![0x51; width as usize * height as usize * 4];
    let padded_rgba = pad_rgba_rows(&tight_rgba, width, height, stride_bytes as usize);
    let producer_ring =
        PosixSharedRing::create_with_slot_count(&memory_id, slot_count, slot_byte_len as usize)
            .expect("create encode source ring");
    producer_ring
        .write_frame(0, &padded_rgba)
        .expect("write encode source frame");

    let start = backend.request(json!({
        "id": 201,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-stderr",
            "filePath": output_path_string,
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

    let write_frame = backend.request(json!({
        "id": 202,
        "method": "encode.writeFrame",
        "params": {
            "sessionId": "encode-stderr",
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
        "id": 203,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-stderr"
        }
    }));
    assert_eq!(finish["ok"], false, "{finish}");
    let message = finish["error"]["message"]
        .as_str()
        .expect("finish error message");
    assert!(
        message.contains("Rust encode ffmpeg exited with failure status"),
        "{finish}"
    );
    assert!(message.contains("stderr:"), "{finish}");
}

#[test]
fn native_rendered_image_frame_can_feed_audio_muxed_encode() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-render-image-audio-encode");
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
    let audio_path = temp_dir.path().join("mixed-audio.wav");
    write_silent_wav_fixture(&audio_path, 48_000, 4_800);
    let audio_path_string = audio_path.to_string_lossy().into_owned();
    let output_path = temp_dir.path().join("native-rendered-image-with-audio.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let render_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let render = backend.request(json!({
        "id": 101,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-image-audio-encode",
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
                    "clip_id": "clip-native-image",
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
    assert_eq!(render["ok"], true, "{render}");
    assert_no_frame_bytes_recursive(&render["result"]);

    let start = backend.request(json!({
        "id": 102,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-native-image-audio",
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

    let write = backend.request(json!({
        "id": 103,
        "method": "encode.writeFrame",
        "params": {
            "sessionId": "encode-native-image-audio",
            "frameIndex": 0,
            "timestampUs": 0,
            "slotCount": render["result"]["slotCount"],
            "frame": render["result"]["frame"]
        }
    }));
    assert_eq!(write["ok"], true, "{write}");
    assert_eq!(write["result"]["frameCount"], 1);

    let finish = backend.request(json!({
        "id": 104,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-native-image-audio"
        }
    }));
    assert_eq!(finish["ok"], true, "{finish}");
    assert_eq!(finish["result"]["filePath"], output_path_string);
    assert_eq!(finish["result"]["frameCount"], 1);
    assert_eq!(finish["result"]["audioPath"], audio_path_string);
    assert_no_frame_bytes_recursive(&finish["result"]);
    assert_mp4_has_audio_stream(&output_path);
}

#[test]
fn native_rendered_image_frame_can_directly_feed_encode_without_output_shared_memory() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-render-image-direct-encode");
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
    let output_path = temp_dir.path().join("native-rendered-image-direct.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let width = 4;
    let height = 4;

    let start = backend.request(json!({
        "id": 101,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-native-image-direct",
            "filePath": output_path_string.clone(),
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

    let write = backend.request(json!({
        "id": 102,
        "method": "encode.writeNativeFrame",
        "params": {
            "sessionId": "encode-native-image-direct",
            "renderId": "native-render-image-direct-encode",
            "frameIndex": 0,
            "timestampUs": 0,
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
                    "clip_id": "clip-native-image",
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
    assert_eq!(write["ok"], true, "{write}");
    assert_eq!(write["result"]["written"], true);
    assert_eq!(write["result"]["writtenNativeFrame"], true);
    assert_eq!(write["result"]["sessionId"], "encode-native-image-direct");
    assert_eq!(write["result"]["frameIndex"], 0);
    assert_eq!(write["result"]["frameCount"], 1);
    assert!(
        write["result"].get("memoryId").is_none(),
        "direct native encode must not return an output shared memory id: {write}"
    );
    assert!(
        write["result"].get("frame").is_none(),
        "direct native encode must not return a shared frame descriptor: {write}"
    );
    assert_no_frame_bytes_recursive(&write["result"]);

    let finish = backend.request(json!({
        "id": 103,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-native-image-direct"
        }
    }));
    assert_eq!(finish["ok"], true, "{finish}");
    assert_eq!(finish["result"]["filePath"], output_path_string);
    assert_eq!(finish["result"]["frameCount"], 1);
    assert_no_frame_bytes_recursive(&finish["result"]);
    assert!(
        fs::metadata(&output_path)
            .expect("direct Rust encode output file exists")
            .len()
            > 0
    );
}

#[test]
fn native_generated_effects_can_directly_feed_encode_without_output_shared_memory() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-generated-effects-direct-encode");
    let output_path = temp_dir.path().join("native-generated-effects-direct.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let width = 4;
    let height = 4;
    let waveform_source = "{\"generator\":\"audio-waveform-r\",\"target_audio_id\":\"audio-1\",\"target_source\":\"/tmp/dialogue.wav\",\"sample_window_seconds\":1,\"colour\":\"#ff0000\",\"thickness\":1,\"amplitude\":1}";
    let particle_source = format!(
        "{{\"width\":{width},\"height\":{height},\"particleCount\":1,\"seed\":0,\"spread\":0,\"speed\":0,\"size\":1,\"colour\":\"#ffffff\",\"lifetimeSeconds\":1}}"
    );

    let start = backend.request(json!({
        "id": 104,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-native-generated-effects-direct",
            "filePath": output_path_string.clone(),
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

    let write = backend.request(json!({
        "id": 105,
        "method": "encode.writeNativeFrame",
        "params": {
            "sessionId": "encode-native-generated-effects-direct",
            "renderId": "native-generated-effects-direct-encode",
            "frameIndex": 0,
            "timestampUs": 0,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [
                    {
                        "clip_id": "clip-generated-waveform",
                        "track_id": "track-1",
                        "media_id": "waveform-1",
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
                    },
                    {
                        "clip_id": "clip-generated-particle",
                        "track_id": "track-2",
                        "media_id": "particle-1",
                        "source_frame": 0,
                        "z_index": 1,
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
                    }
                ]
            },
            "media": [
                {
                    "id": "waveform-1",
                    "kind": "GeneratedAudioWaveform",
                    "source": waveform_source,
                    "width": width,
                    "height": height
                },
                {
                    "id": "particle-1",
                    "kind": "GeneratedParticle",
                    "source": particle_source,
                    "width": width,
                    "height": height
                }
            ],
            "sources": [],
            "audioWaveforms": [{
                "mediaId": "waveform-1",
                "source": waveform_source,
                "samples": [-1.0, -1.0, -1.0, -1.0],
                "sampleRate": 4,
                "width": width,
                "height": height
            }]
        }
    }));
    assert_eq!(write["ok"], true, "{write}");
    assert_eq!(write["result"]["written"], true);
    assert_eq!(write["result"]["writtenNativeFrame"], true);
    assert_eq!(
        write["result"]["sessionId"],
        "encode-native-generated-effects-direct"
    );
    assert_eq!(
        write["result"]["renderId"],
        "native-generated-effects-direct-encode"
    );
    assert_eq!(write["result"]["frameCount"], 1);
    assert!(
        write["result"]["timings"]["renderMs"].is_number(),
        "{write}"
    );
    assert!(
        write["result"].get("memoryId").is_none(),
        "direct generated-effects encode must not return an output shared memory id: {write}"
    );
    assert!(
        write["result"].get("frame").is_none(),
        "direct generated-effects encode must not return a shared frame descriptor: {write}"
    );
    assert_no_frame_bytes_recursive(&write["result"]);

    let finish = backend.request(json!({
        "id": 106,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-native-generated-effects-direct"
        }
    }));
    assert_eq!(finish["ok"], true, "{finish}");
    assert_eq!(finish["result"]["filePath"], output_path_string);
    assert_eq!(finish["result"]["frameCount"], 1);
    assert_no_frame_bytes_recursive(&finish["result"]);
    assert!(
        fs::metadata(&output_path)
            .expect("direct generated-effects encode output file exists")
            .len()
            > 0
    );
}

#[test]
fn native_rendered_video_frame_direct_encode_uses_cpu_fast_path() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-video-direct-cpu-fast-path");
    let output_path = temp_dir
        .path()
        .join("native-video-direct-cpu-fast-path.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let source_memory_id = unique_shm_name();
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
    .expect("create direct encode source ring");
    source_ring
        .write_frame(0, &padded_rgba)
        .expect("write direct encode source frame");

    let start = backend.request(json!({
        "id": 111,
        "method": "encode.start",
        "params": {
            "sessionId": "encode-native-video-direct-cpu",
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

    let write = backend.request(json!({
        "id": 112,
        "method": "encode.writeNativeFrame",
        "params": {
            "sessionId": "encode-native-video-direct-cpu",
            "renderId": "native-video-direct-cpu-encode",
            "frameIndex": 0,
            "timestampUs": 0,
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
                    "clip_id": "clip-native-video-direct",
                    "track_id": "track-1",
                    "media_id": "video-1",
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
                "id": "video-1",
                "kind": "Video",
                "source": "/tmp/video-source.mp4",
                "width": width,
                "height": height,
                "source_rate": {
                    "numerator": 60,
                    "denominator": 1
                }
            }],
            "sources": [{
                "mediaId": "video-1",
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
    assert_eq!(write["ok"], true, "{write}");
    assert_eq!(write["result"]["written"], true);
    assert_eq!(write["result"]["writtenNativeFrame"], true);
    assert_eq!(write["result"]["renderPath"], "cpuSimpleVideoComposite");
    assert_eq!(write["result"]["frameCount"], 1);
    assert!(
        write["result"].get("memoryId").is_none(),
        "direct native encode must not allocate output shared memory: {write}"
    );
    assert_no_frame_bytes_recursive(&write["result"]);
    source_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("direct native encode returns decoded source slot to free");

    let finish = backend.request(json!({
        "id": 113,
        "method": "encode.finish",
        "params": {
            "sessionId": "encode-native-video-direct-cpu"
        }
    }));
    assert_eq!(finish["ok"], true, "{finish}");
    assert_eq!(finish["result"]["filePath"], output_path_string);
    assert_eq!(finish["result"]["frameCount"], 1);
    assert!(
        fs::metadata(&output_path)
            .expect("direct video encode output file exists")
            .len()
            > 0
    );
}

#[test]
fn encode_transcode_video_writes_single_source_output_without_frame_ipc() {
    let temp_dir = TestTempDir::new("encode-transcode-video");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let output_path = temp_dir.path().join("transcoded-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 121,
        "method": "encode.transcodeVideo",
        "params": {
            "inputPath": fixture.path.to_string_lossy(),
            "outputPath": output_path_string.clone(),
            "width": fixture.width,
            "height": fixture.height,
            "fps": 30,
            "durationSeconds": 2.0
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["outputPath"], output_path_string);
    assert_eq!(response["result"]["frameCount"], 60);
    assert_no_frame_bytes_recursive(&response["result"]);
    assert!(
        fs::metadata(&output_path)
            .expect("transcoded output file exists")
            .len()
            > 0
    );
}

#[test]
fn encode_transcode_video_emits_progress_events() {
    let temp_dir = TestTempDir::new("encode-transcode-video-progress");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let output_path = temp_dir.path().join("transcoded-progress-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let mut backend = BackendProcess::start();

    let (response, events) = backend.request_with_events(json!({
        "id": 124,
        "method": "encode.transcodeVideo",
        "params": {
            "sessionId": "transcode-progress-1",
            "inputPath": fixture.path.to_string_lossy(),
            "outputPath": output_path_string.clone(),
            "width": fixture.width,
            "height": fixture.height,
            "fps": 30,
            "durationSeconds": 2.0
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert!(
        events.iter().any(|event| {
            event["event"] == "encode.transcodeVideo.progress"
                && event["payload"]["sessionId"] == "transcode-progress-1"
                && event["payload"]["totalFrames"] == 60
                && event["payload"]["completedFrames"].as_u64().unwrap_or(0) <= 60
                && event["payload"]["percent"].as_f64().unwrap_or(-1.0) >= 0.0
                && event["payload"]["percent"].as_f64().unwrap_or(-1.0) <= 100.0
        }),
        "transcode progress events should include bounded frame progress: {events:?}"
    );
}

#[test]
fn encode_transcode_video_accepts_speed_quality_size_settings() {
    let temp_dir = TestTempDir::new("encode-transcode-video-quality-settings");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let output_path = temp_dir
        .path()
        .join("transcoded-quality-settings-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 125,
        "method": "encode.transcodeVideo",
        "params": {
            "inputPath": fixture.path.to_string_lossy(),
            "outputPath": output_path_string,
            "width": fixture.width,
            "height": fixture.height,
            "fps": 30,
            "durationSeconds": 1.0,
            "qualityPreset": "quality",
            "videoBitrateKbps": 14000
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(
        response["result"]["encodeSettings"]["qualityPreset"],
        "quality"
    );
    assert_eq!(
        response["result"]["encodeSettings"]["videoBitrateKbps"],
        14000
    );
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn encode_transcode_video_keeps_source_audio_when_requested() {
    let temp_dir = TestTempDir::new("encode-transcode-video-source-audio");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let input_with_audio = temp_dir.path().join("source-with-audio.mp4");
    let audio_path = temp_dir.path().join("tone.wav");
    write_silent_wav_fixture(&audio_path, 48_000, 48_000);
    run_ffmpeg_command(
        Command::new("ffmpeg")
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-y")
            .arg("-i")
            .arg(&fixture.path)
            .arg("-i")
            .arg(&audio_path)
            .arg("-c:v")
            .arg("copy")
            .arg("-c:a")
            .arg("aac")
            .arg("-shortest")
            .arg(&input_with_audio),
        "mux source audio fixture",
    );
    let output_path = temp_dir.path().join("transcoded-source-audio-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 122,
        "method": "encode.transcodeVideo",
        "params": {
            "inputPath": input_with_audio.to_string_lossy(),
            "outputPath": output_path_string,
            "width": fixture.width,
            "height": fixture.height,
            "fps": 30,
            "durationSeconds": 1.0,
            "includeAudio": true
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["includedAudio"], true);
    assert_mp4_has_audio_stream(&output_path);
}

#[test]
fn encode_transcode_video_crops_partially_offscreen_object() {
    let temp_dir = TestTempDir::new("encode-transcode-video-crop");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let output_path = temp_dir.path().join("transcoded-cropped-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 123,
        "method": "encode.transcodeVideo",
        "params": {
            "inputPath": fixture.path.to_string_lossy(),
            "outputPath": output_path_string.clone(),
            "width": fixture.width,
            "height": fixture.height,
            "fps": 30,
            "durationSeconds": 1.0,
            "objectX": -1,
            "objectY": -1,
            "objectWidth": fixture.width * 2,
            "objectHeight": fixture.height * 2
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["outputPath"], output_path_string);
    assert_eq!(response["result"]["frameCount"], 30);
    assert!(
        fs::metadata(&output_path)
            .expect("cropped transcode output file exists")
            .len()
            > 0
    );
}

#[test]
fn encode_transcode_video_accepts_static_overlay_filters() {
    let temp_dir = TestTempDir::new("encode-transcode-video-overlays");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let output_path = temp_dir.path().join("transcoded-overlay-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 126,
        "method": "encode.transcodeVideo",
        "params": {
            "inputPath": fixture.path.to_string_lossy(),
            "outputPath": output_path_string.clone(),
            "width": fixture.width,
            "height": fixture.height,
            "fps": 30,
            "durationSeconds": 1.0,
            "overlays": [{
                "kind": "solidColour",
                "x": 1,
                "y": 1,
                "width": 2,
                "height": 2,
                "colour": "#ff0000",
                "opacity": 0.5
            }]
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["overlayCount"], 1);
    assert_eq!(response["result"]["outputPath"], output_path_string);
    assert!(
        fs::metadata(&output_path)
            .expect("overlay transcode output file exists")
            .len()
            > 0
    );
}

#[test]
fn encode_transcode_video_accepts_static_psd_overlay_filters() {
    let temp_dir = TestTempDir::new("encode-transcode-video-psd-overlay");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let psd_path = temp_dir.path().join("standing.psd");
    write_single_layer_psd_fixture(&psd_path, 2, 2, [0, 255, 0, 255]);
    let output_path = temp_dir.path().join("transcoded-psd-overlay-output.mp4");
    let output_path_string = output_path.to_string_lossy().into_owned();
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 127,
        "method": "encode.transcodeVideo",
        "params": {
            "inputPath": fixture.path.to_string_lossy(),
            "outputPath": output_path_string.clone(),
            "width": fixture.width,
            "height": fixture.height,
            "fps": 30,
            "durationSeconds": 1.0,
            "overlays": [{
                "kind": "psd",
                "path": psd_path.to_string_lossy(),
                "activeLayerIds": ["root", "psd-layer-0"],
                "x": 1,
                "y": 1,
                "width": 2,
                "height": 2,
                "opacity": 1.0
            }]
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["overlayCount"], 1);
    assert_eq!(response["result"]["outputPath"], output_path_string);
    assert!(
        fs::metadata(&output_path)
            .expect("PSD overlay transcode output file exists")
            .len()
            > 0
    );
}

#[test]
fn encode_transcode_video_reuses_static_psd_overlay_cache() {
    let temp_dir = TestTempDir::new("encode-transcode-video-psd-overlay-cache");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let psd_path = temp_dir.path().join("standing.psd");
    write_single_layer_psd_fixture(&psd_path, 2, 2, [0, 255, 0, 255]);
    let mut backend = BackendProcess::start();

    let mut transcode_once = |id: u64, output_name: &str| {
        let output_path = temp_dir.path().join(output_name);
        backend.request(json!({
            "id": id,
            "method": "encode.transcodeVideo",
            "params": {
                "inputPath": fixture.path.to_string_lossy(),
                "outputPath": output_path.to_string_lossy(),
                "width": fixture.width,
                "height": fixture.height,
                "fps": 30,
                "durationSeconds": 1.0,
                "overlays": [{
                    "kind": "psd",
                    "path": psd_path.to_string_lossy(),
                    "activeLayerIds": ["root", "psd-layer-0"],
                    "x": 1,
                    "y": 1,
                    "width": 2,
                    "height": 2,
                    "opacity": 1.0
                }]
            }
        }))
    };

    let first = transcode_once(128, "transcoded-psd-cache-first.mp4");
    assert_eq!(first["ok"], true, "{first}");
    assert_eq!(first["result"]["psdOverlayCacheHits"], 0);

    let second = transcode_once(129, "transcoded-psd-cache-second.mp4");
    assert_eq!(second["ok"], true, "{second}");
    assert_eq!(second["result"]["psdOverlayCacheHits"], 1);
}

#[test]
fn psd_parse_meta_returns_nodes_without_spawning_blob_write() {
    let temp_dir = TestTempDir::new("psd-parse-meta");
    let psd_path = temp_dir.path().join("standing.psd");
    write_single_layer_psd_fixture(&psd_path, 2, 2, [0, 255, 0, 255]);
    let mut backend = BackendProcess::start();

    let response = backend.request(json!({
        "id": 1,
        "method": "psd.parseMeta",
        "params": {
            "filePath": psd_path.to_string_lossy()
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    let nodes = response["result"]["nodes"]
        .as_array()
        .expect("psd.parseMeta returns a nodes array");
    assert!(!nodes.is_empty(), "{response}");
    assert!(
        response["result"].get("tmpFile").is_none(),
        "psd.parseMeta must not hand out a blob temp file: {response}"
    );

    // No blob write was ever scheduled, so awaiting one must fail rather than
    // hang waiting on state left over from psd.parse.
    let await_blob = backend.request(json!({
        "id": 2,
        "method": "psd.await_blob",
        "params": {}
    }));
    assert_eq!(await_blob["ok"], false, "{await_blob}");
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
fn native_render_shared_frame_uses_cpu_fast_path_for_single_translated_video() {
    let mut backend = BackendProcess::start();
    let source_memory_id = unique_shm_name();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let output_slot_count = 2;
    let source_width = 2;
    let source_height = 2;
    let output_width = 4;
    let output_height = 4;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * source_height;
    let tight_rgba = vec![
        10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
    ];
    let padded_rgba = pad_rgba_rows(
        &tight_rgba,
        source_width,
        source_height,
        stride_bytes as usize,
    );
    let source_ring = PosixSharedRing::create_with_slot_count(
        &source_memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create translated video source ring");
    source_ring
        .write_frame(0, &padded_rgba)
        .expect("write translated video source frame");

    let response = backend.request(json!({
        "id": 13,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-cpu-fast-video",
            "memoryId": output_memory_id,
            "slotCount": output_slot_count,
            "ptsFrame": 0,
            "width": output_width,
            "height": output_height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-cpu-fast-video",
                    "track_id": "track-1",
                    "media_id": "video-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 1.0,
                        "translation_y": 1.0,
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
                "id": "video-1",
                "kind": "Video",
                "source": "/tmp/video.mp4",
                "width": source_width,
                "height": source_height,
                "source_rate": { "numerator": 60, "denominator": 1 }
            }],
            "sources": [{
                "mediaId": "video-1",
                "slotCount": slot_count,
                "frame": {
                    "descriptor": {
                        "memoryId": source_memory_id,
                        "slotIndex": 0,
                        "generation": 1,
                        "byteOffset": 0,
                        "byteLen": slot_byte_len,
                        "width": source_width,
                        "height": source_height,
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
    assert_eq!(response["result"]["renderPath"], "cpuSimpleVideoComposite");

    source_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("source shared frame slot returns to free after cpu fast render");

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
    .expect("attach to cpu fast native render output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read cpu fast native rendered output frame");
    assert_eq!(&output_frame.bytes[0..4], &[0, 0, 0, 0]);
    assert_eq!(&output_frame.bytes[256 + 4..256 + 8], &[10, 20, 30, 255]);
    assert_eq!(&output_frame.bytes[256 + 8..256 + 12], &[40, 50, 60, 255]);
    assert_eq!(&output_frame.bytes[512 + 4..512 + 8], &[70, 80, 90, 255]);
    assert_eq!(
        &output_frame.bytes[512 + 8..512 + 12],
        &[100, 110, 120, 255]
    );
}

#[test]
fn native_render_shared_frame_uses_cpu_fast_path_for_single_scaled_video() {
    let mut backend = BackendProcess::start();
    let source_memory_id = unique_shm_name();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let output_slot_count = 2;
    let source_width = 4;
    let source_height = 4;
    let output_width = 4;
    let output_height = 4;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * source_height;
    let mut tight_rgba = Vec::new();
    for index in 0..16 {
        tight_rgba.extend_from_slice(&[index as u8, index as u8, index as u8, 255]);
    }
    let padded_rgba = pad_rgba_rows(
        &tight_rgba,
        source_width,
        source_height,
        stride_bytes as usize,
    );
    let source_ring = PosixSharedRing::create_with_slot_count(
        &source_memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create scaled video source ring");
    source_ring
        .write_frame(0, &padded_rgba)
        .expect("write scaled video source frame");

    let response = backend.request(json!({
        "id": 14,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-cpu-fast-scaled-video",
            "memoryId": output_memory_id,
            "slotCount": output_slot_count,
            "ptsFrame": 0,
            "width": output_width,
            "height": output_height,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-cpu-fast-scaled-video",
                    "track_id": "track-1",
                    "media_id": "video-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 1.0,
                        "translation_y": 1.0,
                        "scale_x": 0.5,
                        "scale_y": 0.5,
                        "rotation_degrees": 0.0,
                        "sampling": "nearest"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "media": [{
                "id": "video-1",
                "kind": "Video",
                "source": "/tmp/video.mp4",
                "width": source_width,
                "height": source_height,
                "source_rate": { "numerator": 60, "denominator": 1 }
            }],
            "sources": [{
                "mediaId": "video-1",
                "slotCount": slot_count,
                "frame": {
                    "descriptor": {
                        "memoryId": source_memory_id,
                        "slotIndex": 0,
                        "generation": 1,
                        "byteOffset": 0,
                        "byteLen": slot_byte_len,
                        "width": source_width,
                        "height": source_height,
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
    assert_eq!(response["result"]["renderPath"], "cpuSimpleVideoComposite");

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
    .expect("attach to scaled cpu fast native render output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read scaled cpu fast native rendered output frame");
    assert_eq!(&output_frame.bytes[0..4], &[0, 0, 0, 0]);
    assert_eq!(&output_frame.bytes[256 + 4..256 + 8], &[0, 0, 0, 255]);
    assert_eq!(&output_frame.bytes[256 + 8..256 + 12], &[2, 2, 2, 255]);
    assert_eq!(&output_frame.bytes[512 + 4..512 + 8], &[8, 8, 8, 255]);
    assert_eq!(&output_frame.bytes[512 + 8..512 + 12], &[10, 10, 10, 255]);
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
fn native_render_shared_frame_builds_generated_gradient_sources_from_media() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let response = backend.request(json!({
        "id": 37,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-generated-gradient",
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
                    "clip_id": "clip-generated-gradient",
                    "track_id": "track-1",
                    "media_id": "gradient-1",
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
                "id": "gradient-1",
                "kind": "GeneratedGradient",
                "source": "{\"type\":\"linear\",\"colours\":[\"#ff0000\",\"#0000ff\"],\"stops\":[0,1],\"direction\":0}",
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
    .expect("attach to native generated gradient output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native generated gradient output frame");
    assert_eq!(&output_frame.bytes[0..4], &[191, 0, 64, 255]);
    assert_eq!(&output_frame.bytes[4..8], &[64, 0, 191, 255]);
    assert_eq!(&output_frame.bytes[8..12], &[0, 0, 0, 0]);
}

#[test]
fn native_render_shared_frame_builds_generated_audio_waveform_from_payload() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 2;
    let waveform_source = "{\"generator\":\"audio-waveform-r\",\"target_audio_id\":\"audio-1\",\"target_source\":\"/tmp/dialogue.wav\",\"sample_window_seconds\":1,\"colour\":\"#00ff00\",\"thickness\":1,\"amplitude\":1}";

    let response = backend.request(json!({
        "id": 38,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-generated-audio-waveform",
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
                    "clip_id": "clip-generated-waveform",
                    "track_id": "track-1",
                    "media_id": "waveform-1",
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
                "id": "waveform-1",
                "kind": "GeneratedAudioWaveform",
                "source": waveform_source,
                "width": width,
                "height": height
            }],
            "sources": [],
            "audioWaveforms": [{
                "mediaId": "waveform-1",
                "source": waveform_source,
                "samples": [0.0, 0.0, 0.0, 0.0],
                "sampleRate": 4,
                "width": width,
                "height": height
            }]
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
    .expect("attach to native generated audio waveform output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native generated audio waveform output frame");
    assert_eq!(&output_frame.bytes[0..4], &[0, 0, 0, 0]);
    assert_eq!(&output_frame.bytes[256..260], &[0, 255, 0, 255]);
}

#[test]
fn native_render_shared_frame_builds_generated_particle_sources_from_media() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;
    let particle_source = format!(
        "{{\"width\":{width},\"height\":{height},\"particleCount\":1,\"seed\":0,\"spread\":0,\"speed\":0,\"size\":1,\"colour\":\"#ffffff\",\"lifetimeSeconds\":1}}"
    );

    let response = backend.request(json!({
        "id": 39,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-generated-particle",
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
                    "clip_id": "clip-generated-particle",
                    "track_id": "track-1",
                    "media_id": "particle-1",
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
                "id": "particle-1",
                "kind": "GeneratedParticle",
                "source": particle_source,
                "width": width,
                "height": height
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
    .expect("attach to native generated particle output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native generated particle output frame");
    assert_eq!(&output_frame.bytes[0..4], &[0, 0, 0, 0]);
    assert_eq!(&output_frame.bytes[520..524], &[255, 255, 255, 255]);
}

#[test]
fn native_render_shared_frame_composites_generated_waveform_and_particle_sources() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;
    let waveform_source = "{\"generator\":\"audio-waveform-r\",\"target_audio_id\":\"audio-1\",\"target_source\":\"/tmp/dialogue.wav\",\"sample_window_seconds\":1,\"colour\":\"#ff0000\",\"thickness\":1,\"amplitude\":1}";
    let particle_source = format!(
        "{{\"width\":{width},\"height\":{height},\"particleCount\":1,\"seed\":0,\"spread\":0,\"speed\":0,\"size\":1,\"colour\":\"#ffffff\",\"lifetimeSeconds\":1}}"
    );

    let response = backend.request(json!({
        "id": 40,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-generated-waveform-and-particle",
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
                "clips": [
                    {
                        "clip_id": "clip-generated-waveform",
                        "track_id": "track-1",
                        "media_id": "waveform-1",
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
                    },
                    {
                        "clip_id": "clip-generated-particle",
                        "track_id": "track-2",
                        "media_id": "particle-1",
                        "source_frame": 0,
                        "z_index": 1,
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
                    }
                ]
            },
            "media": [
                {
                    "id": "waveform-1",
                    "kind": "GeneratedAudioWaveform",
                    "source": waveform_source,
                    "width": width,
                    "height": height
                },
                {
                    "id": "particle-1",
                    "kind": "GeneratedParticle",
                    "source": particle_source,
                    "width": width,
                    "height": height
                }
            ],
            "sources": [],
            "audioWaveforms": [{
                "mediaId": "waveform-1",
                "source": waveform_source,
                "samples": [-1.0, -1.0, -1.0, -1.0],
                "sampleRate": 4,
                "width": width,
                "height": height
            }]
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
    .expect("attach to native generated waveform and particle output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native generated waveform and particle output frame");

    assert_eq!(&output_frame.bytes[0..4], &[255, 0, 0, 255]);
    assert_eq!(&output_frame.bytes[520..524], &[255, 255, 255, 255]);
}

#[test]
fn native_render_generated_particle_uses_clip_source_frame_for_motion() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;
    let particle_source = format!(
        "{{\"width\":{width},\"height\":{height},\"particleCount\":1,\"seed\":0,\"spread\":0,\"speed\":1,\"size\":1,\"colour\":\"#ffffff\",\"lifetimeSeconds\":2}}"
    );

    let response = backend.request(json!({
        "id": 40,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-generated-particle-motion",
            "memoryId": output_memory_id,
            "slotCount": slot_count,
            "ptsFrame": 60,
            "width": width,
            "height": height,
            "snapshot": {
                "frame_index": 60,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-generated-particle-motion",
                    "track_id": "track-1",
                    "media_id": "particle-1",
                    "source_frame": 60,
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
                "id": "particle-1",
                "kind": "GeneratedParticle",
                "source": particle_source,
                "width": width,
                "height": height
            }],
            "sources": []
        }
    }));

    assert_eq!(response["ok"], true, "{response}");

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
    .expect("attach to moving generated particle output ring");
    let output_frame = output_ring
        .read_frame(60)
        .expect("read moving generated particle output frame");
    assert_eq!(&output_frame.bytes[520..524], &[0, 0, 0, 0]);
    assert_eq!(&output_frame.bytes[524..528], &[255, 255, 255, 255]);
}

#[test]
fn native_render_shared_frame_composites_video_source_with_generated_gradient_media() {
    let mut backend = BackendProcess::start();
    let source_memory_id = unique_shm_name();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;
    let stride_bytes = 256;
    let slot_byte_len = stride_bytes * height;
    let mut tight_rgba = Vec::with_capacity(width as usize * height as usize * 4);
    for _ in 0..width * height {
        tight_rgba.extend_from_slice(&[0, 255, 0, 255]);
    }
    let padded_rgba = pad_rgba_rows(&tight_rgba, width, height, stride_bytes as usize);
    let source_ring = PosixSharedRing::create_with_slot_count(
        &source_memory_id,
        slot_count,
        slot_byte_len as usize,
    )
    .expect("create native render video source ring");
    source_ring
        .write_frame(0, &padded_rgba)
        .expect("write native render video source frame");

    let response = backend.request(json!({
        "id": 38,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-video-generated-gradient",
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
                    "clip_id": "clip-video",
                    "track_id": "track-1",
                    "media_id": "video-1",
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
                }, {
                    "clip_id": "clip-generated-gradient",
                    "track_id": "track-2",
                    "media_id": "gradient-1",
                    "source_frame": 0,
                    "z_index": 1,
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
                "id": "video-1",
                "kind": "Video",
                "source": "/tmp/video.mp4",
                "width": 4,
                "height": 4,
                "source_rate": { "numerator": 60, "denominator": 1 }
            }, {
                "id": "gradient-1",
                "kind": "GeneratedGradient",
                "source": "{\"type\":\"linear\",\"colours\":[\"#ff0000\",\"#0000ff\"],\"stops\":[0,1],\"direction\":0}",
                "width": 2,
                "height": 2
            }],
            "sources": [{
                "mediaId": "video-1",
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
    assert_no_frame_bytes_recursive(&response["result"]);
    source_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("video source shared frame slot returns to free after native render");

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
    .expect("attach to native video plus generated gradient output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native video plus generated gradient output frame");
    assert_eq!(&output_frame.bytes[0..4], &[191, 0, 64, 255]);
    assert_eq!(&output_frame.bytes[12..16], &[0, 255, 0, 255]);
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
fn native_render_shared_frame_builds_text_sources_from_media() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 64;
    let height = 32;

    let text_source = json!({
        "text": "Hi",
        "fontFamily": "Arial",
        "fontSize": 24.0,
        "fill": "#ffffff",
        "textAlignment": "left",
        "letterSpacing": 0.0
    })
    .to_string();

    let response = backend.request(json!({
        "id": 33,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-text-media",
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
                    "clip_id": "clip-text-media",
                    "track_id": "track-1",
                    "media_id": "text-1",
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
                "id": "text-1",
                "kind": "Text",
                "source": text_source,
                "width": width,
                "height": height
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
    .expect("attach to native text media output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native text media output frame");

    // cosmic-text で描いた白文字がキャンバスのどこかに不透明画素として
    // 出ていること（グリフが実際にラスタライズされたことの契約）を確認する。
    let has_opaque_glyph_pixel = output_frame
        .bytes
        .chunks_exact(4)
        .any(|pixel| pixel[3] > 0);
    assert!(
        has_opaque_glyph_pixel,
        "expected at least one non-transparent glyph pixel in the rendered Text media output"
    );
}

#[test]
fn native_render_shared_frame_builds_file_url_png_image_sources_from_media() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-render-file-url-image-media");
    let image_path = temp_dir.path().join("red source.png");
    let image_frame = RgbaFrame::from_rgba8(
        2,
        2,
        vec![
            255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
        ],
    )
    .expect("build file URL PNG source frame");
    save_rgba_png(&image_path, &image_frame).expect("write file URL PNG source fixture");
    let image_source = format!("{}?cache=1#still", file_url_for_path(&image_path));
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let response = backend.request(json!({
        "id": 34,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-file-url-image-media",
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
                    "clip_id": "clip-file-url-image-media",
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
                "source": image_source,
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
    .expect("attach to native file URL image media output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native file URL image media output frame");
    assert_eq!(&output_frame.bytes[0..4], &[255, 0, 0, 255]);
    assert_eq!(&output_frame.bytes[8..12], &[0, 0, 0, 0]);
}

#[test]
fn native_render_shared_frame_rejects_remote_image_media_source_before_decode() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();

    let response = backend.request(json!({
        "id": 35,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-remote-image-media",
            "memoryId": output_memory_id,
            "slotCount": 1,
            "ptsFrame": 0,
            "width": 4,
            "height": 4,
            "snapshot": {
                "frame_index": 0,
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "clips": [{
                    "clip_id": "clip-remote-image-media",
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
                "source": "https://example.com/red-source.png",
                "width": 2,
                "height": 2
            }],
            "sources": []
        }
    }));

    assert_eq!(response["ok"], false, "{response}");
    assert_eq!(response["error"]["code"], -32602);
    let message = response["error"]["message"]
        .as_str()
        .expect("remote source error message");
    assert!(
        message.contains("Only local file paths or file URLs are supported for Image media"),
        "{message}"
    );
    assert!(
        message.contains("https://example.com/red-source.png"),
        "{message}"
    );
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
fn native_render_shared_frame_builds_psd_sources_from_media() {
    let mut backend = BackendProcess::start();
    let temp_dir = TestTempDir::new("native-render-psd-media");
    let psd_path = temp_dir.path().join("red-source.psd");
    write_single_layer_psd_fixture(&psd_path, 2, 2, [255, 0, 0, 255]);
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let response = backend.request(json!({
        "id": 36,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-psd-media",
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
                    "clip_id": "clip-psd-media",
                    "track_id": "track-1",
                    "media_id": "psd-1",
                    "source_frame": 0,
                    "z_index": 0,
                    "transform": {
                        "translation_x": 0.0,
                        "translation_y": 0.0,
                        "scale_x": 1.0,
                        "scale_y": 1.0,
                        "rotation_degrees": 0.0,
                        "sampling": "bilinear"
                    },
                    "opacity": 1.0,
                    "effects": []
                }]
            },
            "media": [{
                "id": "psd-1",
                "kind": "Psd",
                "source": psd_path.to_string_lossy(),
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
    .expect("attach to native PSD media output ring");
    let output_frame = output_ring
        .read_frame(0)
        .expect("read native PSD media output frame");
    assert_eq!(output_frame.bytes.len(), output_slot_byte_len);
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
fn native_render_release_shared_frame_unlinks_output_without_encode() {
    let mut backend = BackendProcess::start();
    let output_memory_id = unique_shm_name();
    let slot_count = 1;
    let width = 4;
    let height = 4;

    let render = backend.request(json!({
        "id": 41,
        "method": "render.nativeSharedFrame",
        "params": {
            "renderId": "native-render-preview-release",
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
                    "clip_id": "clip-native-render-preview-release",
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
    assert_eq!(render["ok"], true, "{render}");

    let render_slot_byte_len = render["result"]["frame"]["descriptor"]["byteLen"]
        .as_u64()
        .expect("native render output byte length") as usize;

    let release = backend.request(json!({
        "id": 42,
        "method": "render.releaseNativeSharedFrame",
        "params": {
            "memoryId": render["result"]["frame"]["descriptor"]["memoryId"]
        }
    }));
    assert_eq!(release["ok"], true, "{release}");
    assert_eq!(release["result"]["released"], true);
    assert_eq!(release["result"]["memoryId"], output_memory_id);

    let attach_after_release = PosixSharedRing::attach_with_retry_for_layout(
        render["result"]["frame"]["descriptor"]["memoryId"]
            .as_str()
            .expect("native render output memory id"),
        slot_count,
        render_slot_byte_len,
        Duration::from_millis(100),
    );
    assert!(
        attach_after_release.is_err(),
        "native render output shared memory should be unlinked after render.releaseNativeSharedFrame"
    );
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
fn decode_start_reuses_active_session_for_same_job_id() {
    let mut backend = BackendProcess::start();
    let start_params = json!({
        "jobId": "decode-idempotent-1",
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
    });

    let first = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": start_params.clone()
    }));
    assert_eq!(first["ok"], true, "{first}");

    let second = backend.request(json!({
        "id": 2,
        "method": "decode.start",
        "params": start_params
    }));

    assert_eq!(second["ok"], true, "{second}");
    assert_eq!(second["result"], first["result"]);
    assert_no_frame_bytes_recursive(&second["result"]);
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
fn decode_request_frame_scales_source_frame_to_requested_decode_dimensions() {
    let temp_dir = TestTempDir::new("decode-control-plane-scaled");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();
    let target_width = fixture.width / 2;
    let target_height = fixture.height / 2;

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-scaled",
            "source": fixture.path,
            "slotCount": 2,
            "width": target_width,
            "height": target_height,
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
    let stride_bytes = start_response["result"]["strideBytes"]
        .as_u64()
        .expect("stride bytes") as usize;
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let expected_tight_rgba =
        decode_tight_rgba_frame(&fixture.path, 1, target_width, target_height);
    let expected_padded_rgba = pad_rgba_rows(
        &expected_tight_rgba,
        target_width,
        target_height,
        stride_bytes,
    );

    let response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-scaled",
            "requestId": 12,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(
        response["result"]["frame"]["descriptor"]["width"],
        target_width
    );
    assert_eq!(
        response["result"]["frame"]["descriptor"]["height"],
        target_height
    );
    assert_eq!(
        response["result"]["frame"]["descriptor"]["byteLen"],
        slot_byte_len
    );
    assert_eq!(
        response["result"]["verification"]["checksum"]["valueHex"],
        crc32_hex(&expected_padded_rgba)
    );
    assert_eq!(
        response["result"]["verification"]["checksum"]["byteLen"],
        slot_byte_len
    );
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn decode_release_frame_accepts_source_data_plane_already_consumed_by_native_render() {
    let temp_dir = TestTempDir::new("decode-native-render-source-release");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-native-render-source",
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
            "jobId": "decode-native-render-source",
            "requestId": 12,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));
    assert_eq!(response["ok"], true, "{response}");

    let slot_count = start_response["result"]["slotCount"]
        .as_u64()
        .expect("slot count") as u32;
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let source_ring = PosixSharedRing::attach_with_retry_for_layout(
        start_response["result"]["memoryId"]
            .as_str()
            .expect("memory id"),
        slot_count,
        slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach decode data plane as native render source");
    source_ring
        .read_frame(1)
        .expect("native render source reads the decoded shared frame");
    source_ring
        .release_frame_slot(
            response["result"]["frame"]["descriptor"]["slotIndex"]
                .as_u64()
                .expect("slot index") as u32,
            uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled,
        )
        .expect("native render source releases the data plane slot");

    let release_response = backend.request(json!({
        "id": 3,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "decode-native-render-source",
            "slotIndex": response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));

    assert_eq!(release_response["ok"], true, "{release_response}");
    assert_eq!(release_response["result"]["released"], true);
}

#[test]
fn decode_request_frame_inline_returns_rgba_for_mvp_preview_only() {
    let temp_dir = TestTempDir::new("decode-control-plane-inline");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-inline",
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
    let stride_bytes = start_response["result"]["strideBytes"]
        .as_u64()
        .expect("stride bytes") as usize;
    let expected_tight_rgba =
        decode_tight_rgba_frame(&fixture.path, 0, fixture.width, fixture.height);
    let expected_padded_rgba = pad_rgba_rows(
        &expected_tight_rgba,
        fixture.width,
        fixture.height,
        stride_bytes,
    );

    let response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrameInline",
        "params": {
            "jobId": "decode-inline",
            "requestId": 12,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["accepted"], true);
    assert_eq!(
        response["result"]["verification"]["checksum"]["valueHex"],
        crc32_hex(&expected_padded_rgba)
    );
    let inline_rgba = response["result"]["frame"]["rgbaBytes"]
        .as_str()
        .expect("inline frame rgba base64");
    assert!(!inline_rgba.is_empty());
    assert_eq!(
        inline_rgba.len(),
        ((expected_padded_rgba.len() + 2) / 3) * 4
    );
}

#[test]
fn decode_request_frame_reuses_streaming_decoder_for_sequential_playback_frames() {
    let temp_dir = TestTempDir::new("decode-control-plane-streaming");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-streaming-playback",
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
    assert_eq!(start_response["ok"], true, "{start_response}");
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let consumer_ring =
        PosixSharedRing::attach_with_retry(memory_id, slot_byte_len, Duration::from_secs(1))
            .expect("attach to streaming decode ring");

    let first_frame = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-streaming-playback",
            "requestId": 21,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));
    assert_eq!(first_frame["ok"], true, "{first_frame}");
    assert_eq!(first_frame["result"]["decodePath"], "stream");
    assert_eq!(first_frame["result"]["streamRestarted"], true);
    consumer_ring
        .read_frame(0)
        .expect("consumer reads first streaming frame");
    let first_release = backend.request(json!({
        "id": 3,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "decode-streaming-playback",
            "slotIndex": first_frame["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": first_frame["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(first_release["ok"], true, "{first_release}");
    consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("streaming slot returns to free after first frame");

    let second_frame = backend.request(json!({
        "id": 4,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-streaming-playback",
            "requestId": 22,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));
    assert_eq!(second_frame["ok"], true, "{second_frame}");
    assert_eq!(second_frame["result"]["decodePath"], "stream");
    assert_eq!(second_frame["result"]["streamRestarted"], false);
    assert_eq!(second_frame["result"]["streamSkippedFrameCount"], 0);
    assert_eq!(second_frame["result"]["decodeInvocationCount"], 0);
    assert_no_frame_bytes_recursive(&second_frame["result"]);
}

/// Automated jank metric: replay a realistic preview request sequence — forward
/// playback steps interleaved with the duplicate and ±1 backstep requests the
/// frontend emits in practice — and assert the streaming decoder almost never
/// cold-restarts ffmpeg. Each restart is a ~150-400ms stall (visible flicker),
/// so a smooth pipeline restarts only once (the initial spawn). This replaces
/// eyeballing UXFD_DECODE_TRACE with a CI-enforced threshold.
#[test]
fn decode_streaming_restart_count_stays_low_across_playback_with_repeats_and_backsteps() {
    let temp_dir = TestTempDir::new("decode-restart-metric");
    let fixture = build_n_frame_h264_fixture(temp_dir.path(), 30);
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-restart-metric",
            "source": fixture.path,
            "slotCount": 1,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": { "numerator": 30, "denominator": 1 },
            "format": "rgba8Srgb",
            "colour": { "primaries": "bt709", "transfer": "srgb", "matrix": "rgb", "range": "full" }
        }
    }));
    assert_eq!(start_response["ok"], true, "{start_response}");
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let consumer_ring =
        PosixSharedRing::attach_with_retry(memory_id, slot_byte_len, Duration::from_secs(1))
            .expect("attach to streaming decode ring");

    let mut next_id = 2u64;
    let mut request_frame = |frame_index: u64| -> bool {
        let response = backend.request(json!({
            "id": next_id,
            "method": "decode.requestFrame",
            "params": {
                "jobId": "decode-restart-metric",
                "requestId": next_id,
                "frameIndex": frame_index,
                "mode": "latestWins"
            }
        }));
        assert_eq!(response["ok"], true, "{response}");
        let restarted = response["result"]["streamRestarted"]
            .as_bool()
            .expect("streamRestarted");
        consumer_ring
            .read_frame(frame_index)
            .expect("consumer reads streaming frame");
        let release = backend.request(json!({
            "id": next_id + 10_000,
            "method": "decode.releaseFrame",
            "params": {
                "jobId": "decode-restart-metric",
                "slotIndex": response["result"]["frame"]["descriptor"]["slotIndex"],
                "generation": response["result"]["frame"]["descriptor"]["generation"],
                "copyOutState": "gpuUploadFenceSignalled"
            }
        }));
        assert_eq!(release["ok"], true, "{release}");
        consumer_ring
            .wait_until_free(Duration::from_secs(1))
            .expect("slot returns to free");
        next_id += 1;
        restarted
    };

    // Forward preview cadence with the realistic noise the frontend produces:
    // a duplicate of the just-shown frame, and an occasional ±1 backstep.
    let sequence: [u64; 12] = [0, 5, 5, 10, 9, 10, 15, 20, 20, 25, 24, 25];
    let mut restart_count = 0u32;
    for frame_index in sequence {
        if request_frame(frame_index) {
            restart_count += 1;
        }
    }

    // A smooth pipeline restarts ffmpeg only for the very first frame; duplicates
    // and tiny backsteps must be served from the warm decoder, not a cold respawn.
    assert!(
        restart_count <= 1,
        "streaming decoder cold-restarted {restart_count} times across a playback-with-noise \
         sequence (target <= 1). Duplicate/backstep requests are still respawning ffmpeg."
    );
}

/// Regression contract for the 2x-speed / end-of-source-stall bug: `sourceRate`
/// in `decode.start` is the frame-rate domain of the `frameIndex` values the
/// caller will send with `decode.requestFrame` (the preview tick domain, e.g.
/// 60fps), which is not necessarily the *source* file's native frame rate
/// (e.g. 30fps). When the two differ, each source frame must be presented for
/// `sourceRate / nativeSourceRate` consecutive requested frameIndex values
/// (frame duplication), instead of being consumed 1:1 per requested tick. The
/// previous implementation fed `frameIndex` straight into ffmpeg's decoded
/// frame stream with no `fps` conversion filter, so a 60fps request stream
/// against a 30fps source drained the source at 2x speed and stalled once the
/// source frames ran out (observed as `forwardGapExceeded` restarts on real
/// clips).
#[test]
fn decode_request_frame_duplicates_slower_source_frames_to_match_requested_source_rate() {
    let temp_dir = TestTempDir::new("decode-control-plane-fps-mismatch");
    let source_frame_count = 6u32;
    let fixture =
        build_n_frame_h264_fixture_with_colour_metadata(temp_dir.path(), source_frame_count, Some(30));
    let mut backend = BackendProcess::start();

    // Source is natively 30fps (see build_n_frame_h264_fixture), but the
    // caller declares a 60fps request domain — the preview's tick rate.
    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-fps-mismatch",
            "source": fixture.path,
            "slotCount": 1,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": { "numerator": 60, "denominator": 1 },
            "format": "rgba8Srgb",
            "colour": { "primaries": "bt709", "transfer": "srgb", "matrix": "rgb", "range": "full" }
        }
    }));
    assert_eq!(start_response["ok"], true, "{start_response}");
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let consumer_ring =
        PosixSharedRing::attach_with_retry(memory_id, slot_byte_len, Duration::from_secs(1))
            .expect("attach to streaming decode ring");

    // Every requested (60fps-domain) frameIndex must present source frame
    // floor(frameIndex / 2), i.e. each of the 6 source frames is shown for 2
    // consecutive requested ticks, and every request in this fully-forward
    // sequential sweep must be served without a cold restart (except the very
    // first request, which necessarily starts the decoder).
    let requested_tick_count = source_frame_count * 2;
    let mut next_id = 2u64;
    for requested_frame_index in 0..requested_tick_count {
        let expected_source_frame = (requested_frame_index / 2) as u64;
        let expected_tight_rgba = decode_tight_rgba_frame(
            &fixture.path,
            expected_source_frame,
            fixture.width,
            fixture.height,
        );

        let response = backend.request(json!({
            "id": next_id,
            "method": "decode.requestFrame",
            "params": {
                "jobId": "decode-fps-mismatch",
                "requestId": next_id,
                "frameIndex": requested_frame_index,
                "mode": "latestWins"
            }
        }));
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(
            response["result"]["streamRestartReason"],
            if requested_frame_index == 0 { "firstFrame" } else { "sequential" },
            "requestedFrameIndex={requested_frame_index} unexpectedly needed a decoder restart \
             (reason={:?}); the fps-mismatch conversion must keep the stream sequential",
            response["result"]["streamRestartReason"]
        );

        let stride_bytes = response["result"]["frame"]["descriptor"]["strideBytes"]
            .as_u64()
            .expect("stride bytes") as usize;
        let expected_padded_rgba = pad_rgba_rows(
            &expected_tight_rgba,
            fixture.width,
            fixture.height,
            stride_bytes,
        );
        assert_eq!(
            response["result"]["verification"]["checksum"]["valueHex"],
            crc32_hex(&expected_padded_rgba),
            "requestedFrameIndex={requested_frame_index} should present source frame \
             {expected_source_frame} (60fps request domain duplicating a 30fps source 2x)"
        );

        consumer_ring
            .read_frame(requested_frame_index as u64)
            .expect("consumer reads streaming frame");
        let release = backend.request(json!({
            "id": next_id + 10_000,
            "method": "decode.releaseFrame",
            "params": {
                "jobId": "decode-fps-mismatch",
                "slotIndex": response["result"]["frame"]["descriptor"]["slotIndex"],
                "generation": response["result"]["frame"]["descriptor"]["generation"],
                "copyOutState": "gpuUploadFenceSignalled"
            }
        }));
        assert_eq!(release["ok"], true, "{release}");
        consumer_ring
            .wait_until_free(Duration::from_secs(1))
            .expect("slot returns to free");
        next_id += 1;
    }
}

/// Diagnostic contract: every decode.requestFrame response reports why (or why
/// not) the streaming ffmpeg process was restarted, so the jank caused by
/// process restarts can be measured on a real playback/scrub session.
#[test]
fn decode_request_frame_reports_stream_restart_reason_for_diagnostics() {
    let temp_dir = TestTempDir::new("decode-control-plane-restart-reason");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-restart-reason",
            "source": fixture.path,
            "slotCount": 1,
            "width": fixture.width,
            "height": fixture.height,
            "sourceRate": { "numerator": 30, "denominator": 1 },
            "format": "rgba8Srgb",
            "colour": { "primaries": "bt709", "transfer": "srgb", "matrix": "rgb", "range": "full" }
        }
    }));
    assert_eq!(start_response["ok"], true, "{start_response}");
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let consumer_ring =
        PosixSharedRing::attach_with_retry(memory_id, slot_byte_len, Duration::from_secs(1))
            .expect("attach to streaming decode ring");

    let request_frame = |backend: &mut BackendProcess,
                         consumer_ring: &PosixSharedRing,
                         id: u64,
                         request_id: u64,
                         frame_index: u64| {
        let response = backend.request(json!({
            "id": id,
            "method": "decode.requestFrame",
            "params": {
                "jobId": "decode-restart-reason",
                "requestId": request_id,
                "frameIndex": frame_index,
                "mode": "latestWins"
            }
        }));
        assert_eq!(response["ok"], true, "{response}");
        consumer_ring
            .read_frame(frame_index)
            .expect("consumer reads streaming frame");
        let release = backend.request(json!({
            "id": id + 100,
            "method": "decode.releaseFrame",
            "params": {
                "jobId": "decode-restart-reason",
                "slotIndex": response["result"]["frame"]["descriptor"]["slotIndex"],
                "generation": response["result"]["frame"]["descriptor"]["generation"],
                "copyOutState": "gpuUploadFenceSignalled"
            }
        }));
        assert_eq!(release["ok"], true, "{release}");
        consumer_ring
            .wait_until_free(Duration::from_secs(1))
            .expect("streaming slot returns to free");
        response
    };

    // First frame ever: the streaming decoder must be spawned.
    let first = request_frame(&mut backend, &consumer_ring, 2, 21, 0);
    assert_eq!(first["result"]["streamRestarted"], true);
    assert_eq!(first["result"]["streamRestartReason"], "firstFrame");

    // Sequential forward step: reuses the running process, no restart.
    let second = request_frame(&mut backend, &consumer_ring, 3, 22, 1);
    assert_eq!(second["result"]["streamRestarted"], false);
    assert_eq!(second["result"]["streamRestartReason"], "sequential");

    // Backward re-request (scrub / repeated frame): served from the recent-frame
    // cache so a tiny UI wobble does not respawn ffmpeg.
    let backward = request_frame(&mut backend, &consumer_ring, 4, 23, 0);
    assert_eq!(backward["result"]["decodePath"], "cache");
    assert_eq!(backward["result"]["decodeInvocationCount"], 0);
    assert_eq!(backward["result"]["streamRestarted"], false);
    assert_eq!(backward["result"]["streamRestartReason"], "cacheHit");
}

#[test]
fn decode_request_frame_reads_all_local_video_fixtures_for_preview() {
    let fixtures = [
        (
            "decode-local-20mbps",
            "perf/heavy-media/20000kbps_60fps.mp4",
            1920,
            1080,
            60,
            1,
        ),
        (
            "decode-local-gopro-proxy",
            "perf/heavy-media/GX010052.proxy.mp4",
            1280,
            720,
            120000,
            1001,
        ),
        (
            "decode-local-10mbps",
            "perf/heavy-media/10000kbps_60fps.mp4",
            1920,
            1080,
            60,
            1,
        ),
        (
            "decode-local-gopro-original",
            "perf/heavy-media/GX010052.MP4",
            3840,
            2160,
            120000,
            1001,
        ),
    ];
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repository root");
    let mut backend = BackendProcess::start();

    for (index, (job_id, relative_path, width, height, numerator, denominator)) in
        fixtures.iter().enumerate()
    {
        let source = repo_root.join(relative_path);
        assert!(
            source.exists(),
            "local video fixture is missing: {source:?}"
        );

        let start_response = backend.request(json!({
            "id": 100 + index * 10,
            "method": "decode.start",
            "params": {
                "jobId": job_id,
                "source": source.to_string_lossy(),
                "slotCount": 1,
                "width": width,
                "height": height,
                "sourceRate": {
                    "numerator": numerator,
                    "denominator": denominator
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
        let memory_id = start_response["result"]["memoryId"]
            .as_str()
            .expect("memory id");
        let slot_byte_len = start_response["result"]["slotByteLen"]
            .as_u64()
            .expect("slot byte length") as usize;
        let consumer_ring =
            PosixSharedRing::attach_with_retry(memory_id, slot_byte_len, Duration::from_secs(1))
                .expect("attach to backend-created local fixture decode ring");

        let frame_response = backend.request(json!({
            "id": 101 + index * 10,
            "method": "decode.requestFrame",
            "params": {
                "jobId": job_id,
                "requestId": index,
                "frameIndex": 0,
                "mode": "latestWins"
            }
        }));
        assert_eq!(
            frame_response["ok"], true,
            "Rust video decode should read {relative_path}: {frame_response}"
        );
        assert_eq!(frame_response["result"]["accepted"], true);
        assert_eq!(
            frame_response["result"]["frame"]["descriptor"]["width"],
            json!(width)
        );
        assert_eq!(
            frame_response["result"]["frame"]["descriptor"]["height"],
            json!(height)
        );
        assert_no_frame_bytes_recursive(&frame_response["result"]);
        consumer_ring
            .read_frame(0)
            .expect("consumer reads local fixture decoded frame before release");

        let release_response = backend.request(json!({
            "id": 102 + index * 10,
            "method": "decode.releaseFrame",
            "params": {
                "jobId": job_id,
                "slotIndex": frame_response["result"]["frame"]["descriptor"]["slotIndex"],
                "generation": frame_response["result"]["frame"]["descriptor"]["generation"],
                "copyOutState": "gpuUploadFenceSignalled"
            }
        }));
        assert_eq!(release_response["ok"], true, "{release_response}");
        consumer_ring
            .wait_until_free(Duration::from_secs(1))
            .expect("local fixture decode slot returns to free");

        let stop_response = backend.request(json!({
            "id": 103 + index * 10,
            "method": "decode.stop",
            "params": {
                "jobId": job_id
            }
        }));
        assert_eq!(stop_response["ok"], true, "{stop_response}");
    }
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

    let second_release_response = backend.request(json!({
        "id": 4,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "dms2",
            "slotIndex": second_response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": second_response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(second_release_response["ok"], true);

    let third_response = backend.request(json!({
        "id": 5,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "dms2",
            "requestId": 43,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));
    assert_eq!(third_response["ok"], true);
    assert_eq!(
        third_response["result"]["frame"]["descriptor"]["slotIndex"],
        second_response["result"]["frame"]["descriptor"]["slotIndex"],
        "released second slot should be reused while first remains reading"
    );
    let third_mapped_frame = consumer_ring
        .read_frame(1)
        .expect("consumer reads third decoded frame from the released second slot");
    assert_eq!(
        third_mapped_frame.slot_index,
        second_response["result"]["frame"]["descriptor"]["slotIndex"]
            .as_u64()
            .expect("second slot index") as u32
    );

    let first_release_response = backend.request(json!({
        "id": 6,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "dms2",
            "slotIndex": first_response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": first_response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(first_release_response["ok"], true);

    let third_release_response = backend.request(json!({
        "id": 7,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "dms2",
            "slotIndex": third_response["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": third_response["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(third_release_response["ok"], true);

    consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("both shared memory slots return to free");
}

/// Reproduces the root cause behind "Failed to write decoded frame to shared
/// memory: TimedOut" (see progress.md 2026-07-02): the control-plane
/// `SharedFrameRing` (in-process slot bookkeeping) and the data-plane
/// `PosixSharedRing` (the actual shared-memory slots) each scan for the
/// lowest-numbered FREE slot independently. As long as both are freed in
/// lock-step this happens to line up, but any consumer that frees a
/// data-plane slot behind the control-plane's back (exactly what
/// `native_shared.rs`'s unqualified `release_frame` does when a second
/// consumer reads the same ring) desynchronises the two numbering schemes.
/// This test injects that desync directly via the data-plane consumer ring
/// standing in for that second consumer, then asserts the slotIndex returned
/// to the renderer must still match the slot the bytes actually landed in.
#[test]
fn decode_request_frame_descriptor_slot_index_matches_data_plane_slot_holding_the_sequence() {
    let temp_dir = TestTempDir::new("decode-control-plane-slot-desync");
    let fixture = build_n_frame_h264_fixture(temp_dir.path(), 4);
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "slot-desync",
            "source": fixture.path,
            "slotCount": 3,
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
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length") as usize;
    let consumer_ring = PosixSharedRing::attach_with_retry_for_layout(
        memory_id,
        3,
        slot_byte_len,
        Duration::from_secs(1),
    )
    .expect("attach to backend-created shared frame ring");

    // Fill all three slots: frame 0/1/2 each occupy control-plane slot N and
    // data-plane slot N (they still agree while nothing has freed anything).
    let mut responses = Vec::new();
    for frame_index in 0..3u64 {
        let response = backend.request(json!({
            "id": 2 + frame_index,
            "method": "decode.requestFrame",
            "params": {
                "jobId": "slot-desync",
                "requestId": 100 + frame_index,
                "frameIndex": frame_index,
                "mode": "latestWins"
            }
        }));
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(
            response["result"]["frame"]["descriptor"]["slotIndex"], frame_index,
            "slots fill in order while the ring starts empty"
        );
        let mapped = consumer_ring
            .read_frame(frame_index)
            .expect("consumer keeps every frame in reading state to hold all 3 slots occupied");
        assert_eq!(
            mapped.slot_index, frame_index as u32,
            "data-plane slot must match control-plane slot before any release happens"
        );
        responses.push(response);
    }

    // Simulate a second, independent consumer of the same data-plane ring
    // (this stands in for native_shared.rs's read_native_render_source_frame,
    // which historically released "whatever slot it found reading" rather
    // than the slot it was leased). It frees data-plane slot 0 without the
    // control-plane ever being told slot 0 is free.
    consumer_ring
        .release_frame_slot(0, uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled)
        .expect("simulate a second consumer releasing data-plane slot 0 behind the control-plane's back");

    // Now release frame 1 through the normal control-plane RPC path. This
    // frees control-plane slot 1 (and, because release_decode_data_plane
    // targets slot_index=1, data-plane slot 1 as well).
    let release_response = backend.request(json!({
        "id": 10,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "slot-desync",
            "slotIndex": responses[1]["result"]["frame"]["descriptor"]["slotIndex"],
            "generation": responses[1]["result"]["frame"]["descriptor"]["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(release_response["ok"], true, "{release_response}");

    // Data-plane view: slots 0 and 1 are now FREE (0 via the simulated second
    // consumer, 1 via the normal release), slot 2 is still Reading.
    // Control-plane view: only slot 1 is FREE (it never learned slot 0 was
    // freed), slot 0 and slot 2 are still Reading.
    //
    // Requesting a new frame forces each side to independently scan for the
    // lowest-numbered FREE slot:
    //   - control-plane `acquire_write_slot` picks slot 1 (its lowest FREE).
    //   - data-plane `write_frame` picks slot 0 (its lowest FREE).
    // The renderer must still be told the slot the bytes actually landed in.
    let fourth_response = backend.request(json!({
        "id": 11,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "slot-desync",
            "requestId": 103,
            "frameIndex": 3,
            "mode": "latestWins"
        }
    }));
    assert_eq!(fourth_response["ok"], true, "{fourth_response}");
    let reported_slot_index = fourth_response["result"]["frame"]["descriptor"]["slotIndex"]
        .as_u64()
        .expect("reported slot index") as u32;

    let mapped_fourth = consumer_ring
        .read_frame(3)
        .expect("consumer reads the fourth decoded frame from the data-plane ring");
    assert_eq!(
        mapped_fourth.slot_index, reported_slot_index,
        "decode.requestFrame must report the slotIndex the frame's bytes were actually \
         written to in the data-plane ring, not an independently tracked control-plane slot \
         number that has desynchronised from it"
    );
}

/// Reproduces the residual data-plane leak observed on 0.1.1-Beta-425a: the
/// renderer has several abort paths (stale decode response in
/// sharedRendererViewportNativeRenderSource.ts, copy failure in
/// sharedRendererRustVideoUploadPipeline.ts) that call
/// decode.releaseFrame(copyOutState='rendererUploadAborted') WITHOUT ever
/// copying the frame — so the data-plane slot is still READY, not READING.
/// release_frame_slot() only performs the READING→FREE transition, so every
/// such abort left one READY slot stranded forever; after slot_count aborts
/// the ring starves and every write_frame times out ("Failed to write decoded
/// frame to shared memory: TimedOut"). Repeating request→abort-release more
/// times than there are slots must keep working.
#[test]
fn decode_release_frame_with_renderer_upload_aborted_frees_unread_slot_so_ring_does_not_starve() {
    let temp_dir = TestTempDir::new("decode-control-plane-abort-unread");
    let fixture = build_n_frame_h264_fixture(temp_dir.path(), 6);
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "abort-unread",
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

    // 6 request→abort cycles on a 2-slot ring: if aborting an unread frame
    // leaked its READY slot, the third request would already fail with a
    // write_frame timeout.
    for frame_index in 0..6u64 {
        let response = backend.request(json!({
            "id": 2 + frame_index * 2,
            "method": "decode.requestFrame",
            "params": {
                "jobId": "abort-unread",
                "requestId": 100 + frame_index,
                "frameIndex": frame_index,
                "mode": "latestWins"
            }
        }));
        assert_eq!(
            response["ok"], true,
            "requestFrame {frame_index} must not starve after earlier aborts: {response}"
        );

        // The renderer aborts without reading the frame from shared memory
        // (no bridge copy, no native render read): the data-plane slot is
        // still READY when this release arrives.
        let release_response = backend.request(json!({
            "id": 3 + frame_index * 2,
            "method": "decode.releaseFrame",
            "params": {
                "jobId": "abort-unread",
                "slotIndex": response["result"]["frame"]["descriptor"]["slotIndex"],
                "generation": response["result"]["frame"]["descriptor"]["generation"],
                "copyOutState": "rendererUploadAborted"
            }
        }));
        assert_eq!(
            release_response["ok"], true,
            "aborting an unread decoded frame must release its READY data-plane slot: {release_response}"
        );
    }
}

/// Reproduces a lease-identity collision: when a first decoded frame's
/// data-plane slot is consumed and freed early by the in-backend native
/// render source read, the next decode.requestFrame reuses that same
/// data-plane slot while the first lease is still outstanding on the
/// control-plane. If descriptors are only identified by (slotIndex,
/// generation) derived from two independent slot bookkeepings, both leases
/// can end up with IDENTICAL descriptors (slot 0, generation 1), making the
/// two releases indistinguishable — the first release then frees the wrong
/// control-plane slot and the second fails. Each decode.requestFrame must
/// hand out a lease identity that stays unique while both are in flight.
#[test]
fn decode_release_frame_distinguishes_two_leases_that_reused_the_same_data_plane_slot() {
    let temp_dir = TestTempDir::new("decode-control-plane-lease-identity");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "lease-identity",
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
    .expect("attach to decode data-plane ring");

    // Lease A: first frame, lands in data-plane slot 0.
    let first_response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "lease-identity",
            "requestId": 51,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));
    assert_eq!(first_response["ok"], true, "{first_response}");
    let first_descriptor = first_response["result"]["frame"]["descriptor"].clone();
    assert_eq!(first_descriptor["slotIndex"], 0);

    // The in-backend native render source read consumes frame 0 and frees
    // its data-plane slot immediately (simulated here by a second consumer
    // of the same ring), while lease A is still outstanding.
    let first_mapped = consumer_ring
        .read_frame(0)
        .expect("native render source reads the first decoded frame");
    consumer_ring
        .release_frame_slot(
            first_mapped.slot_index,
            uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled,
        )
        .expect("native render source releases the first data-plane slot");

    // Lease B: second frame reuses the freed data-plane slot 0 while lease A
    // is still unreleased.
    let second_response = backend.request(json!({
        "id": 3,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "lease-identity",
            "requestId": 52,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));
    assert_eq!(second_response["ok"], true, "{second_response}");
    let second_descriptor = second_response["result"]["frame"]["descriptor"].clone();
    assert_eq!(
        second_descriptor["slotIndex"], 0,
        "second lease must reuse the data-plane slot freed by the native read"
    );
    assert_ne!(
        first_descriptor["generation"], second_descriptor["generation"],
        "two in-flight leases on the same data-plane slot must have distinct lease identities, \
         otherwise decode.releaseFrame cannot tell them apart"
    );

    // The renderer copy bridge reads lease B's frame (READY→READING).
    consumer_ring
        .read_frame(1)
        .expect("renderer copy bridge reads the second decoded frame");

    // Releasing lease A (already consumed by the native read) must succeed
    // and must NOT free lease B's control-plane slot or data-plane slot.
    let first_release = backend.request(json!({
        "id": 4,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "lease-identity",
            "slotIndex": first_descriptor["slotIndex"],
            "generation": first_descriptor["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(first_release["ok"], true, "{first_release}");

    // Releasing lease B afterwards must also succeed.
    let second_release = backend.request(json!({
        "id": 5,
        "method": "decode.releaseFrame",
        "params": {
            "jobId": "lease-identity",
            "slotIndex": second_descriptor["slotIndex"],
            "generation": second_descriptor["generation"],
            "copyOutState": "gpuUploadFenceSignalled"
        }
    }));
    assert_eq!(second_release["ok"], true, "{second_release}");

    consumer_ring
        .wait_until_free(Duration::from_secs(1))
        .expect("all data-plane slots return to free after both leases are released");
}

/// Root cause of the "decodedFrameUnavailable → permanently blocked" failure
/// observed on 0.1.1-Beta-425a: the renderer-side validator
/// (isRustBackendDecodedVideoFrameAvailable → isValidSharedFrameDescriptor)
/// and the native overlay upload path both require
/// `byteOffset === slotIndex * byteLen`. When descriptor.slotIndex was
/// re-pointed at the data-plane's real slot, byteOffset stayed derived from
/// the control-plane slot — so the first time the two slot numbers diverged
/// (a native render source read frees the data-plane slot early and the next
/// request reuses it) the response failed renderer validation and the
/// presenter latched into blocked. The whole descriptor must be
/// self-consistent against the data-plane slot.
#[test]
fn decode_request_frame_descriptor_byte_offset_matches_data_plane_slot_index() {
    let temp_dir = TestTempDir::new("decode-control-plane-byte-offset");
    let fixture = build_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "byte-offset",
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
    let memory_id = start_response["result"]["memoryId"]
        .as_str()
        .expect("memory id");
    let slot_byte_len = start_response["result"]["slotByteLen"]
        .as_u64()
        .expect("slot byte length");
    let consumer_ring = PosixSharedRing::attach_with_retry_for_layout(
        memory_id,
        2,
        slot_byte_len as usize,
        Duration::from_secs(1),
    )
    .expect("attach to decode data-plane ring");

    // Desynchronise the control-plane slot from the data-plane slot: the
    // native render source read consumes frame 0 and frees its data-plane
    // slot while the lease stays outstanding on the control-plane, so the
    // next request pairs control-plane slot 1 with data-plane slot 0.
    let first_response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "byte-offset",
            "requestId": 61,
            "frameIndex": 0,
            "mode": "latestWins"
        }
    }));
    assert_eq!(first_response["ok"], true, "{first_response}");
    let first_mapped = consumer_ring
        .read_frame(0)
        .expect("native render source reads the first decoded frame");
    consumer_ring
        .release_frame_slot(
            first_mapped.slot_index,
            uxfd_sidecar_protocol::CopyOutState::GpuUploadFenceSignalled,
        )
        .expect("native render source releases the first data-plane slot");

    let second_response = backend.request(json!({
        "id": 3,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "byte-offset",
            "requestId": 62,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));
    assert_eq!(second_response["ok"], true, "{second_response}");
    let descriptor = &second_response["result"]["frame"]["descriptor"];
    let slot_index = descriptor["slotIndex"].as_u64().expect("slot index");
    let byte_len = descriptor["byteLen"].as_u64().expect("byte len");
    let byte_offset = descriptor["byteOffset"].as_u64().expect("byte offset");
    assert_eq!(
        byte_offset,
        slot_index * byte_len,
        "descriptor.byteOffset must be consistent with the data-plane slotIndex the renderer \
         validates and reads against, not with the internal control-plane slot: {descriptor}"
    );
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

/// Regression contract for `frameDecodeFailed: ffprobe video stream did not
/// include color_range`: real-world mp4s frequently omit the `color_range`
/// stream tag entirely (ffprobe then reports no such field at all, not even
/// "unknown" — verified empirically against a fixture encoded without
/// `-color_range`/`range=`). The previous implementation treated a missing
/// key as a hard decode error via `stream_metadata_string`'s
/// `ok_or_else(...)`, so every such file was entirely unplayable. H.264's
/// conventional default when unspecified is limited (tv) range, so a missing
/// tag must fall back to "tv" and let decoding proceed, exactly like an
/// explicit `color_range=unknown` already does.
#[test]
fn decode_request_frame_falls_back_to_limited_range_when_source_omits_color_range_metadata() {
    let temp_dir = TestTempDir::new("decode-control-plane-missing-range");
    let fixture = build_no_colour_range_metadata_two_frame_h264_fixture(temp_dir.path());
    let mut backend = BackendProcess::start();

    let start_response = backend.request(json!({
        "id": 1,
        "method": "decode.start",
        "params": {
            "jobId": "decode-missing-range",
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
    let stride_bytes = start_response["result"]["strideBytes"]
        .as_u64()
        .expect("stride bytes") as usize;

    let expected_tight_rgba = decode_tight_rgba_frame_with_input_range_and_no_matrix_hint(
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

    let response = backend.request(json!({
        "id": 2,
        "method": "decode.requestFrame",
        "params": {
            "jobId": "decode-missing-range",
            "requestId": 22,
            "frameIndex": 1,
            "mode": "latestWins"
        }
    }));

    assert_eq!(
        response["ok"], true,
        "decode.requestFrame must not fail when the source omits color_range \
         metadata entirely: {response}"
    );
    assert_eq!(
        response["result"]["verification"]["checksum"]["valueHex"],
        crc32_hex(&expected_padded_rgba),
        "missing color_range should decode as if it were tv (limited) range"
    );
    assert_no_frame_bytes_recursive(&response["result"]);
}

#[test]
fn decode_request_frame_accepts_non_srgb_transfer_metadata_for_mvp_video_import() {
    let temp_dir = TestTempDir::new("decode-control-plane-non-srgb-transfer");
    let fixture = build_two_frame_h264_fixture_with_colour_metadata(
        temp_dir.path(),
        "non-srgb-transfer.mp4",
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

    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(
        response["result"]["frame"]["descriptor"]["colour"]["primaries"],
        "bt709"
    );
    assert_no_frame_bytes_recursive(&response["result"]);
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
    assert!(value.get("rgbaBytes").is_none());
}

fn assert_no_frame_bytes_recursive(value: &Value) {
    match value {
        Value::Object(object) => {
            assert!(!object.contains_key("frameBase64"));
            assert!(!object.contains_key("bytes"));
            assert!(!object.contains_key("pixels"));
            assert!(!object.contains_key("rgbaBytes"));
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

/// Build a two-frame H.264 fixture that stamps no colour-range metadata at
/// all (no `-color_range` on the container, no `range=` in `-x264-params`),
/// reproducing real-world mp4s that omit `color_range` entirely — as opposed
/// to `build_limited_range_two_frame_h264_fixture`, which explicitly stamps
/// `tv`. ffprobe reports no `color_range` field whatsoever for this fixture
/// (verified empirically: `{"streams":[{}]}`), which is the case the decoder
/// must tolerate by falling back to the H.264 conventional default (limited
/// range) instead of failing the whole decode.
fn build_no_colour_range_metadata_two_frame_h264_fixture(directory: &Path) -> TestVideoFixture {
    let width = 34;
    let height = 16;
    let raw_path = directory.join("two-frame-source-no-range.rgba");
    let video_path = directory.join("two-frame-source-no-range.mp4");
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
        .arg("2")
        .arg("-pix_fmt")
        .arg("yuv444p")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("0")
        .arg("-x264-params")
        .arg("keyint=1:min-keyint=1:scenecut=0")
        .arg("-video_track_timescale")
        .arg("30")
        .arg(&video_path);
    run_ffmpeg_command(&mut command, "encode no-colour-range fixture");

    TestVideoFixture {
        path: video_path,
        width,
        height,
    }
}

/// Build an N-frame H.264 fixture (every frame a keyframe) for streaming decode
/// measurement tests that need to step across a realistic playback range.
fn build_n_frame_h264_fixture(directory: &Path, frame_count: u32) -> TestVideoFixture {
    build_n_frame_h264_fixture_with_colour_metadata(directory, frame_count, None)
}

/// Same as `build_n_frame_h264_fixture`, but stamps explicit bt709 colour
/// metadata onto the stream so pixel-checksum comparisons against
/// `decode_tight_rgba_frame` (which decodes with `in_color_matrix=bt709`)
/// are exact rather than off by rounding — matching the encoding the
/// `two_frame` fixtures already use for the same reason.
fn build_n_frame_h264_fixture_with_colour_metadata(
    directory: &Path,
    frame_count: u32,
    source_framerate: Option<u32>,
) -> TestVideoFixture {
    let width = 34;
    let height = 16;
    let source_framerate = source_framerate.unwrap_or(30);
    let raw_path = directory.join(format!("n-frame-source-{frame_count}.rgba"));
    let video_path = directory.join(format!("n-frame-source-{frame_count}.mp4"));
    let mut raw_frames = Vec::new();
    for frame_index in 0..frame_count {
        raw_frames.extend(test_frame_pixels(width, height, (frame_index % 256) as u8));
    }
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
        .arg(source_framerate.to_string())
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg(frame_count.to_string())
        .arg("-pix_fmt")
        .arg("yuv444p")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("0")
        .arg("-color_primaries")
        .arg("bt709")
        .arg("-color_trc")
        .arg("iec61966-2-1")
        .arg("-colorspace")
        .arg("bt709")
        .arg("-x264-params")
        .arg("keyint=1:min-keyint=1:scenecut=0:range=pc:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709")
        .arg("-color_range")
        .arg("pc")
        .arg("-video_track_timescale")
        .arg(source_framerate.to_string())
        .arg(&video_path);
    run_ffmpeg_command(&mut command, "encode n-frame fixture");

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
            "select=eq(n\\,{frame_index}),scale=w={width}:h={height}:in_range={input_range}:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgba"
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

/// Same idea as `decode_tight_rgba_frame_with_input_range`, but omits the
/// `in_color_matrix`/`out_color_matrix` filter arguments, matching the
/// production `scale=...,format=rgba` filter used by
/// `start_streaming_decode_process` (which does not pin a colour matrix
/// either). Fixtures with no colour VUI metadata at all (see
/// `build_no_colour_range_metadata_two_frame_h264_fixture`) must be compared
/// against this variant — pinning `bt709` explicitly on one side only would
/// introduce a rounding mismatch unrelated to the range fallback under test.
fn decode_tight_rgba_frame_with_input_range_and_no_matrix_hint(
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
            "select=eq(n\\,{frame_index}),scale=w={width}:h={height}:in_range={input_range}:out_range=pc,format=rgba"
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

fn write_single_layer_psd_fixture(path: &Path, width: u32, height: u32, colour: [u8; 4]) {
    let pixel_count = (width * height) as usize;
    let channel_len = 2 + pixel_count as u32;
    let mut layer_record = Vec::new();
    push_i32_be(&mut layer_record, 0);
    push_i32_be(&mut layer_record, 0);
    push_i32_be(&mut layer_record, height as i32);
    push_i32_be(&mut layer_record, width as i32);
    push_u16_be(&mut layer_record, 4);
    for channel_id in [0i16, 1, 2, -1] {
        push_i16_be(&mut layer_record, channel_id);
        push_u32_be(&mut layer_record, channel_len);
    }
    layer_record.extend_from_slice(b"8BIM");
    layer_record.extend_from_slice(b"norm");
    layer_record.push(255);
    layer_record.push(0);
    layer_record.push(0);
    layer_record.push(0);
    let name = b"Layer 1";
    let name_block_len = 1 + name.len() + ((4 - ((1 + name.len()) & 3)) & 3);
    let extra_len = 4 + 4 + name_block_len;
    push_u32_be(&mut layer_record, extra_len as u32);
    push_u32_be(&mut layer_record, 0);
    push_u32_be(&mut layer_record, 0);
    layer_record.push(name.len() as u8);
    layer_record.extend_from_slice(name);
    while layer_record.len() % 4 != 0 {
        layer_record.push(0);
    }

    let mut channel_data = Vec::new();
    for component in colour {
        push_u16_be(&mut channel_data, 0);
        channel_data.extend(std::iter::repeat(component).take(pixel_count));
    }

    let layer_info_len = 2 + layer_record.len() + channel_data.len();
    let layer_and_mask_len = 4 + layer_info_len;
    let mut psd = Vec::new();
    psd.extend_from_slice(b"8BPS");
    push_u16_be(&mut psd, 1);
    psd.extend_from_slice(&[0; 6]);
    push_u16_be(&mut psd, 4);
    push_u32_be(&mut psd, height);
    push_u32_be(&mut psd, width);
    push_u16_be(&mut psd, 8);
    push_u16_be(&mut psd, 3);
    push_u32_be(&mut psd, 0);
    push_u32_be(&mut psd, 0);
    push_u32_be(&mut psd, layer_and_mask_len as u32);
    push_u32_be(&mut psd, layer_info_len as u32);
    push_i16_be(&mut psd, 1);
    psd.extend_from_slice(&layer_record);
    psd.extend_from_slice(&channel_data);

    fs::write(path, psd).expect("write single-layer PSD fixture");
}

fn push_u16_be(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_be_bytes());
}

fn push_i16_be(bytes: &mut Vec<u8>, value: i16) {
    bytes.extend_from_slice(&value.to_be_bytes());
}

fn push_u32_be(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_be_bytes());
}

fn push_i32_be(bytes: &mut Vec<u8>, value: i32) {
    bytes.extend_from_slice(&value.to_be_bytes());
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
    assert!(
        has_audio,
        "encoded MP4 should contain an audio stream: {parsed}"
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
        self.request_with_events(payload).0
    }

    fn request_with_events(&mut self, payload: Value) -> (Value, Vec<Value>) {
        let request_id = payload["id"]
            .as_u64()
            .expect("request payload has numeric id");
        writeln!(self.stdin, "{payload}").expect("write backend request");
        self.stdin.flush().expect("flush backend request");

        let mut events = Vec::new();
        loop {
            let mut line = String::new();
            self.stdout
                .read_line(&mut line)
                .expect("read backend response");
            let parsed: Value = serde_json::from_str(&line).expect("parse backend response");
            if parsed["id"].as_u64() == Some(request_id) {
                return (parsed, events);
            }
            events.push(parsed);
        }
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
