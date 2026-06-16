use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

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
    assert_eq!(response["result"]["memoryId"], "decode-1-ring");
    assert_eq!(response["result"]["slotCount"], 3);
    assert_eq!(response["result"]["sourceRate"]["numerator"], 60);
    assert_eq!(response["result"]["sourceRate"]["denominator"], 1);
    assert_eq!(response["result"]["strideBytes"], 7680);
    assert_eq!(response["result"]["slotByteLen"], 15360);
    assert_no_frame_bytes(&response["result"]);
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
        "decode-actual-ring"
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
    let expected_tight_rgba =
        decode_tight_rgba_frame_with_input_range(&fixture.path, 1, fixture.width, fixture.height, "tv");
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
    backend.start_decode();

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
        .arg(format!("keyint=1:min-keyint=1:scenecut=0:range={x264_range}:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709"))
        .arg("-color_primaries")
        .arg("bt709")
        .arg("-color_trc")
        .arg("iec61966-2-1")
        .arg("-colorspace")
        .arg("bt709")
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

    fn start_decode(&mut self) {
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
