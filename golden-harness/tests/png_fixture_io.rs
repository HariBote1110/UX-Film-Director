use std::fs;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use uxfd_golden_harness::{load_rgba_png, save_rgba_png, FixtureIoError, RgbaFrame};

#[test]
fn png_fixture_round_trip_preserves_rgba_pixels() {
    let frame = RgbaFrame::from_rgba8(
        2,
        2,
        vec![
            255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 64, 255, 255, 255, 0,
        ],
    )
    .expect("valid RGBA frame");
    let path = unique_temp_path("uxfd-golden-round-trip", "png");

    save_rgba_png(&path, &frame).expect("save PNG fixture");
    let decoded = load_rgba_png(&path).expect("load PNG fixture");
    fs::remove_file(&path).expect("remove PNG fixture");

    assert_eq!(decoded, frame);
}

#[test]
fn loading_missing_fixture_returns_io_error() {
    let path = unique_temp_path("uxfd-golden-missing", "png");

    let error = load_rgba_png(&path).expect_err("missing fixture must fail");

    match error {
        FixtureIoError::Io(_) => {}
        unexpected => panic!("expected IO error, got {unexpected:?}"),
    }
}

#[test]
fn loading_indexed_fixture_expands_palette_to_rgba() {
    let path = unique_temp_path("uxfd-golden-indexed", "png");
    write_indexed_png(&path);

    let decoded = load_rgba_png(&path).expect("load indexed PNG fixture");
    fs::remove_file(&path).expect("remove indexed PNG fixture");

    assert_eq!(decoded.width, 1);
    assert_eq!(decoded.height, 1);
    assert_eq!(decoded.pixels, vec![10, 20, 30, 128]);
}

fn unique_temp_path(prefix: &str, extension: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time must be after epoch")
        .as_nanos();

    std::env::temp_dir().join(format!("{prefix}-{nanos}.{extension}"))
}

fn write_indexed_png(path: &PathBuf) {
    let file = File::create(path).expect("create indexed PNG fixture");
    let mut encoder = png::Encoder::new(BufWriter::new(file), 1, 1);
    encoder.set_color(png::ColorType::Indexed);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_palette(vec![10, 20, 30]);
    encoder.set_trns(vec![128]);

    let mut writer = encoder.write_header().expect("write indexed PNG header");
    writer
        .write_image_data(&[0])
        .expect("write indexed PNG data");
}
