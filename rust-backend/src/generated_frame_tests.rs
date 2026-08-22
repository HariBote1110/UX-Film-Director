use super::*;
use flate2::{write::ZlibEncoder, Compression};
use std::io::Write;
use uxfd_golden_harness::RgbaFrame;

/// Escapes a filesystem path for embedding as the contents of a JSON string
/// literal built by hand (e.g. inside a `format!(r##"...{}..."##, ...)`
/// template). Windows paths carry backslashes, which are the JSON escape
/// character -- inserting them unescaped produces either invalid JSON or a
/// misinterpreted escape sequence (e.g. `\U` from a `Users` path component).
fn json_escape_path(path: &std::path::Path) -> String {
    path.to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
}

fn write_test_rgba_png(name: &str, width: u32, height: u32, rgba: &[u8]) -> std::path::PathBuf {
    let expected_len = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .expect("test PNG dimensions should fit usize");
    assert_eq!(rgba.len(), expected_len);

    let pid = std::process::id();
    let path = std::env::temp_dir().join(format!("{name}-{pid}.png"));
    let mut png = Vec::new();
    png.extend_from_slice(b"\x89PNG\r\n\x1a\n");

    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    write_png_chunk(&mut png, b"IHDR", &ihdr);

    let row_len = usize::try_from(width).expect("width should fit usize") * 4;
    let mut scanlines = Vec::with_capacity(
        (row_len + 1) * usize::try_from(height).expect("height should fit usize"),
    );
    for row in 0..usize::try_from(height).expect("height should fit usize") {
        scanlines.push(0);
        let start = row * row_len;
        scanlines.extend_from_slice(&rgba[start..start + row_len]);
    }
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&scanlines)
        .expect("test PNG scanlines should encode");
    let compressed = encoder
        .finish()
        .expect("test PNG zlib stream should finish");
    write_png_chunk(&mut png, b"IDAT", &compressed);
    write_png_chunk(&mut png, b"IEND", &[]);

    std::fs::write(&path, png).expect("test PNG should be written");
    path
}

fn write_png_chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    png.extend_from_slice(kind);
    png.extend_from_slice(data);
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(kind);
    hasher.update(data);
    png.extend_from_slice(&hasher.finalize().to_be_bytes());
}

#[test]
fn generated_barcode_source_frame_contains_background_and_bars() {
    let media = SceneMediaReference {
            id: "barcode-1".to_string(),
            kind: MediaKind::GeneratedBarcode,
            source: r##"{"width":96,"height":48,"data":"AviUtl","minimumBarWidth":2,"horizontalMargin":8,"verticalMargin":6,"foregroundColour":"#000000","backgroundColour":"#ffffff"}"##.to_string(),
            width: 96,
            height: 48,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_barcode_source_frame(&media)
        .expect("generated barcode frame should render");
    let has_black_bar = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 255]);
    let has_white_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 255, 255, 255]);

    assert!(has_black_bar);
    assert!(has_white_background);
}

#[test]
fn generated_puzzle_piece_source_frame_contains_shape_and_transparency() {
    let media = SceneMediaReference {
            id: "puzzle-1".to_string(),
            kind: MediaKind::GeneratedPuzzlePiece,
            source: r##"{"width":96,"height":96,"size":48,"shapeVariant":1,"connectorMode":"convex","fillColour":"#ffffff"}"##.to_string(),
            width: 96,
            height: 96,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_puzzle_piece_source_frame(&media)
        .expect("generated puzzle piece frame should render");
    let has_white_shape = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 255, 255, 255]);
    let has_transparent_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);

    assert!(has_white_shape);
    assert!(has_transparent_background);
}

#[test]
fn generated_colour_wheel_source_frame_contains_hues_and_transparency() {
    let media = SceneMediaReference {
            id: "colour-wheel-1".to_string(),
            kind: MediaKind::GeneratedColourWheel,
            source: r##"{"width":96,"height":96,"radius":48,"saturation":100,"brightness":100,"ringWidthPercent":25,"segmentCount":24}"##.to_string(),
            width: 96,
            height: 96,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_colour_wheel_source_frame(&media)
        .expect("generated colour wheel frame should render");
    let has_transparent_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);
    let has_red = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba[0] > 220 && rgba[1] < 80 && rgba[2] < 80 && rgba[3] == 255);
    let has_blue = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba[2] > 220 && rgba[0] < 120 && rgba[1] < 120 && rgba[3] == 255);

    assert!(has_transparent_background);
    assert!(has_red);
    assert!(has_blue);
}

#[test]
fn generated_gourd_source_frame_contains_shape_and_transparency() {
    let media = SceneMediaReference {
            id: "gourd-1".to_string(),
            kind: MediaKind::GeneratedGourd,
            source: r##"{"width":400,"height":400,"bodyRadius":80,"bodyWidth":250,"waistRadius":10,"squashPercent":40,"repeatCount":1,"fillColour":"#ffffff"}"##.to_string(),
            width: 400,
            height: 400,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame =
        build_generated_gourd_source_frame(&media).expect("generated gourd frame should render");
    let has_white_shape = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 255, 255, 255]);
    let has_transparent_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);

    assert!(has_white_shape);
    assert!(has_transparent_background);
}

#[test]
fn generated_gear_source_frame_contains_teeth_hole_and_transparency() {
    let media = SceneMediaReference {
            id: "gear-1".to_string(),
            kind: MediaKind::GeneratedGear,
            source: r##"{"width":320,"height":320,"outerRadius":160,"innerRadiusPercent":45,"toothCount":20,"toothDepthPercent":18,"toothSkewPercent":0,"fillColour":"#ffffff"}"##.to_string(),
            width: 320,
            height: 320,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame =
        build_generated_gear_source_frame(&media).expect("generated gear frame should render");
    let has_white_shape = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 255, 255, 255]);
    let has_transparent_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);
    let centre_offset = ((160 * 320 + 160) * 4) as usize;
    let centre_is_hole = frame.pixels[centre_offset..centre_offset + 4] == [0, 0, 0, 0];

    assert!(has_white_shape);
    assert!(has_transparent_background);
    assert!(centre_is_hole);
}

#[test]
fn generated_track_bar_source_frame_contains_bars_and_background() {
    let media = SceneMediaReference {
            id: "track-bar-1".to_string(),
            kind: MediaKind::GeneratedTrackBar,
            source: r##"{"width":360,"height":120,"trackValues":[0,25,50,-50],"trackRanges":[[0,100],[0,100],[0,100],[-100,100]],"labels":["TrackA","TrackB","TrackC","TrackD"],"barColour":"#ffffff","backgroundOpacity":0.05}"##.to_string(),
            width: 360,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_track_bar_source_frame(&media)
        .expect("generated track bar frame should render");
    let has_solid_bar = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 255, 255, 255]);
    let has_low_alpha_background = frame.pixels.chunks_exact(4).any(|rgba| {
        rgba[0] == 255 && rgba[1] == 255 && rgba[2] == 255 && rgba[3] > 0 && rgba[3] < 32
    });
    let has_transparent_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);

    assert!(has_solid_bar);
    assert!(has_low_alpha_background);
    assert!(has_transparent_background);
}

#[test]
fn generated_pie_chart_source_frame_contains_slices_hole_and_transparency() {
    let media = SceneMediaReference {
            id: "pie-chart-1".to_string(),
            kind: MediaKind::GeneratedPieChart,
            source: r##"{"width":400,"height":400,"values":[10,20,30,40],"sortMode":"descending","normaliseToHundred":true,"labelMode":"percentage","progressPercent":100,"strokeWidth":20,"sliceColours":["#389ba6","#f2e2c4","#f29422","#f27830","#f24b0f"]}"##.to_string(),
            width: 400,
            height: 400,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_pie_chart_source_frame(&media)
        .expect("generated pie chart frame should render");
    let has_first_colour = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0x38, 0x9b, 0xa6, 255]);
    let has_second_colour = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0xf2, 0xe2, 0xc4, 255]);
    let centre_offset = ((200 * 400 + 200) * 4) as usize;
    let centre_is_hole = frame.pixels[centre_offset..centre_offset + 4] == [0, 0, 0, 0];
    let has_transparent_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);

    assert!(has_first_colour);
    assert!(has_second_colour);
    assert!(centre_is_hole);
    assert!(has_transparent_background);
}

#[test]
fn generated_histogram_source_frame_contains_channel_bars_and_background() {
    let media = SceneMediaReference {
            id: "histogram-1".to_string(),
            kind: MediaKind::GeneratedHistogram,
            source: r##"{"width":256,"height":200,"binValues":[0.08,0.18,0.32,0.55,0.78,0.92,0.64,0.36],"heightScalePercent":100,"lineWidth":1,"showLuminance":true,"showRed":true,"showGreen":true,"showBlue":true,"channelColours":["#ffffff","#ff4b4b","#4bff6a","#4b8cff"],"backgroundColour":"#000000"}"##.to_string(),
            width: 256,
            height: 200,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_histogram_source_frame(&media)
        .expect("generated histogram frame should render");
    let has_luminance = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 255, 255, 255]);
    let has_red = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 75, 75, 255]);
    let has_green = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [75, 255, 106, 255]);
    let has_blue = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [75, 140, 255, 255]);
    let has_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 255]);

    assert!(has_luminance);
    assert!(has_red);
    assert!(has_green);
    assert!(has_blue);
    assert!(has_background);
}

#[test]
fn generated_sunburst_source_frame_contains_rays_background_and_motif() {
    let media = SceneMediaReference {
            id: "sunburst-1".to_string(),
            kind: MediaKind::GeneratedSunburst,
            source: r##"{"width":800,"height":450,"rayCount":10,"rayCoveragePercent":50,"rotationOffsetDegrees":0,"centreXPercent":50,"centreYPercent":50,"motifSize":200,"motifShape":"circle","rayColour":"#ff0000","backgroundColour":"#ffff00"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_sunburst_source_frame(&media)
        .expect("generated sunburst frame should render");
    let has_ray = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 0, 0, 255]);
    let has_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [255, 255, 0, 255]);
    let centre_offset = ((225 * 800 + 400) * 4) as usize;
    let centre_is_motif = frame.pixels[centre_offset..centre_offset + 4] == [255, 0, 0, 255];

    assert!(has_ray);
    assert!(has_background);
    assert!(centre_is_motif);
}

#[test]
fn generated_circular_arrow_source_frame_contains_arc_head_and_transparency() {
    let media = SceneMediaReference {
            id: "circular-arrow-1".to_string(),
            kind: MediaKind::GeneratedCircularArrow,
            source: r##"{"width":200,"height":200,"radius":80,"lineWidth":16,"headSize":40,"angleDegrees":260,"centreAngleDegrees":0,"headShape":"triangle","showTailHead":false,"flipVertical":false,"flipHorizontal":false,"arrowColour":"#ffff00"}"##.to_string(),
            width: 200,
            height: 200,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_circular_arrow_source_frame(&media)
        .expect("generated circular arrow frame should render");
    let yellow_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 0, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();

    assert!(yellow_count > 500);
    assert!(transparent_count > 10_000);
}

#[test]
fn generated_triangle_bracket_source_frame_contains_arms_and_transparency() {
    let media = SceneMediaReference {
            id: "triangle-bracket-1".to_string(),
            kind: MediaKind::GeneratedTriangleBracket,
            source: r##"{"width":160,"height":100,"bracketWidth":100,"angleDegrees":120,"armLength":50,"offsetDistance":0,"bracketColour":"#ffffff"}"##.to_string(),
            width: 160,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_triangle_bracket_source_frame(&media)
        .expect("generated triangle bracket frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();

    assert!(white_count > 300);
    assert!(transparent_count > 10_000);
}

#[test]
fn generated_tartan_check_source_frame_contains_all_pattern_colours() {
    let media = SceneMediaReference {
            id: "tartan-check-1".to_string(),
            kind: MediaKind::GeneratedTartanCheck,
            source: r##"{"width":800,"height":450,"tileSize":100,"blurRadius":1,"baseColour":"#143e10","stripeColourA":"#a81616","stripeColourB":"#c9c526","lineColour":"#000000"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_tartan_check_source_frame(&media)
        .expect("generated tartan check frame should render");
    let has_base = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0x14, 0x3e, 0x10, 255]);
    let has_stripe_a = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0xa8, 0x16, 0x16, 255]);
    let has_line = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 255]);
    let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

    assert!(has_base);
    assert!(has_stripe_a);
    assert!(has_line);
    assert!(fully_opaque);
}

#[test]
fn generated_houndstooth_source_frame_contains_foreground_background_and_opacity() {
    let media = SceneMediaReference {
            id: "houndstooth-1".to_string(),
            kind: MediaKind::GeneratedHoundstooth,
            source: r##"{"width":800,"height":450,"patternSize":50,"foregroundColour":"#000000","backgroundColour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_houndstooth_source_frame(&media)
        .expect("generated houndstooth frame should render");
    let foreground_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [0, 0, 0, 255])
        .count();
    let background_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

    assert!(foreground_count > 100_000);
    assert!(background_count > 100_000);
    assert!(fully_opaque);
}

#[test]
fn generated_yagasuri_source_frame_contains_arrow_pattern_and_opacity() {
    let media = SceneMediaReference {
            id: "yagasuri-1".to_string(),
            kind: MediaKind::GeneratedYagasuri,
            source: r##"{"width":800,"height":450,"arrowWidth":15,"arrowHeight":65,"lineWidth":2,"staggered":true,"foregroundColour":"#000000","backgroundColour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_yagasuri_source_frame(&media)
        .expect("generated yagasuri frame should render");
    let foreground_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [0, 0, 0, 255])
        .count();
    let background_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

    assert!(foreground_count > 80_000);
    assert!(background_count > 120_000);
    assert!(fully_opaque);
}

#[test]
fn generated_paper_airplane_source_frame_contains_wings_shadow_and_transparency() {
    let media = SceneMediaReference {
            id: "paper-airplane-1".to_string(),
            kind: MediaKind::GeneratedPaperAirplane,
            source: r##"{"width":320,"height":240,"bodyLength":200,"wingWidth":80,"foldHeight":50,"gap":50,"followMotionDirection":false,"axisMode":0,"fillColour":"#ffffff"}"##.to_string(),
            width: 320,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_paper_airplane_source_frame(&media)
        .expect("generated paper airplane frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let shadow_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [184, 184, 184, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();

    assert!(white_count > 5_000);
    assert!(shadow_count > 500);
    assert!(transparent_count > 40_000);
}

#[test]
fn generated_asanoha_pattern_source_frame_contains_foreground_background_and_opacity() {
    let media = SceneMediaReference {
            id: "asanoha-pattern-1".to_string(),
            kind: MediaKind::GeneratedAsanohaPattern,
            source: r##"{"width":800,"height":450,"patternSize":50,"lineWidth":2,"foregroundColour":"#000000","backgroundColour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_asanoha_pattern_source_frame(&media)
        .expect("generated asanoha pattern frame should render");
    let foreground_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [0, 0, 0, 255])
        .count();
    let background_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

    assert!(foreground_count > 5_000);
    assert!(background_count > 100_000);
    assert!(fully_opaque);
}

#[test]
fn generated_focus_lines_plus_source_frame_contains_rays_and_centre_hole() {
    let media = SceneMediaReference {
            id: "focus-lines-plus-1".to_string(),
            kind: MediaKind::GeneratedFocusLinesPlus,
            source: r##"{"width":800,"height":450,"rayWidth":1,"gap":5,"centreRadius":100,"rotationDegrees":0,"centreX":400,"centreY":225,"centreJitterPercent":20,"seed":0,"keyframeInterval":0,"lineColour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_focus_lines_plus_source_frame(&media, 0)
        .expect("generated focus lines plus frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();
    let centre_offset = (225_usize * 800 + 400) * 4;
    let centre_is_transparent = frame.pixels[centre_offset + 3] == 0;

    assert!(white_count > 5_000);
    assert!(transparent_count > 150_000);
    assert!(centre_is_transparent);
}

#[test]
fn generated_random_line_ex_source_frame_contains_noisy_lines_and_transparency() {
    let media = SceneMediaReference {
            id: "random-line-ex-1".to_string(),
            kind: MediaKind::GeneratedRandomLineEx,
            source: r##"{"width":800,"height":450,"lineCount":3,"lineWidth":6,"threshold":128,"noiseCellSize":12,"widthVariance":0,"seed":0,"lineColour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_random_line_ex_source_frame(&media)
        .expect("generated random line EX frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();

    assert!(white_count > 1_000);
    assert!(transparent_count > 250_000);
}

#[test]
fn generated_contour_trace_source_frame_contains_contour_lines_and_transparency() {
    let media = SceneMediaReference {
            id: "contour-trace-1".to_string(),
            kind: MediaKind::GeneratedContourTrace,
            source: r##"{"width":800,"height":450,"lineWidth":3,"contourCount":5,"jitterAmount":1.5,"traceColour":"#ffffff","backgroundOpacity":0,"seed":93}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_contour_trace_source_frame(&media)
        .expect("generated contour trace frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();

    assert!(white_count > 2_000);
    assert!(transparent_count > 250_000);
}

#[test]
fn generated_displacement_poly_source_frame_contains_displaced_mesh_and_fill() {
    let media = SceneMediaReference {
            id: "displacement-poly-1".to_string(),
            kind: MediaKind::GeneratedDisplacementPoly,
            source: r##"{"width":800,"height":450,"columns":14,"rows":8,"displacementScale":42,"depthScale":18,"meshOpacity":0.85,"fillOpacity":0.18,"lineColour":"#36c2ff","fillColour":"#0b1020","seed":93}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_displacement_poly_source_frame(&media)
        .expect("generated displacement poly frame should render");
    let mesh_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[0] < 80 && rgba[1] > 150 && rgba[2] > 200 && rgba[3] > 180)
        .count();
    let fill_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[0] < 30 && rgba[1] < 40 && rgba[2] < 80 && rgba[3] > 20)
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();

    assert!(mesh_count > 1_000);
    assert!(fill_count > 10_000);
    assert!(transparent_count > 20_000);
}

#[test]
fn generated_plain_effector_line_source_frame_contains_coloured_field_lines_and_transparency() {
    let media = SceneMediaReference {
            id: "plain-effector-line-1".to_string(),
            kind: MediaKind::GeneratedPlainEffectorLine,
            source: r##"{"width":800,"height":450,"radius":100,"strength":1,"randomness":0,"zoom":1,"invert":false,"lineCount":24,"lineWidth":2,"colour":"#f74d52","colourAmount":1,"seed":93}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_plain_effector_line_source_frame(&media)
        .expect("generated plain effector line frame should render");
    let line_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[0] > 200 && rgba[1] > 50 && rgba[1] < 120 && rgba[2] > 60 && rgba[2] < 120 && rgba[3] > 180)
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();

    assert!(line_count > 3_000);
    assert!(transparent_count > 250_000);
}

#[test]
fn generated_hologram_source_frame_contains_prism_stripes_and_opacity() {
    let media = SceneMediaReference {
            id: "hologram-1".to_string(),
            kind: MediaKind::GeneratedHologram,
            source: r##"{"width":800,"height":450,"tileSize":80,"rotationDegrees":0,"gradientAngleDegrees":-60,"colourMode":1,"tintColour":"#ffffff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_hologram_source_frame(&media)
        .expect("generated hologram frame should render");
    let opaque_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 255)
        .count();
    let bright_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[0] > 210 && rgba[1] > 210 && rgba[2] > 210 && rgba[3] == 255)
        .count();
    let shadow_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[0] < 80 && rgba[1] < 85 && rgba[2] < 95 && rgba[3] == 255)
        .count();
    let coloured_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| {
            rgba[3] == 255
                && ((rgba[0] as i16 - rgba[1] as i16).abs() > 30
                    || (rgba[1] as i16 - rgba[2] as i16).abs() > 30)
        })
        .count();

    assert_eq!(opaque_count, 800 * 450);
    assert!(bright_count > 15_000);
    assert!(shadow_count > 10_000);
    assert!(coloured_count > 40_000);
}

#[test]
fn generated_protractor_source_frame_contains_ticks_angle_line_and_transparency() {
    let media = SceneMediaReference {
            id: "protractor-1".to_string(),
            kind: MediaKind::GeneratedProtractor,
            source: r##"{"width":420,"height":240,"radius":180,"measuredAngleDegrees":90,"tickStepDegrees":10,"majorTickStepDegrees":30,"decimalPlaces":1,"lineColour":"#ffffff","textColour":"#ffffff","shadowColour":"#000000"}"##.to_string(),
            width: 420,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_protractor_source_frame(&media)
        .expect("generated protractor frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let shadow_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [0, 0, 0, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();
    let centre_offset = (216_usize * 420 + 210) * 4;
    let ninety_degree_line_offset = (80_usize * 420 + 210) * 4;

    assert!(white_count > 2_000);
    assert!(shadow_count > 100);
    assert!(transparent_count > 90_000);
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        &[255, 255, 255, 255]
    );
    assert_eq!(
        &frame.pixels[ninety_degree_line_offset..ninety_degree_line_offset + 4],
        &[255, 255, 255, 255]
    );
}

#[test]
fn generated_shaking_polygon_source_frame_contains_jittered_outline_and_transparency() {
    let media = SceneMediaReference {
            id: "shaking-polygon-1".to_string(),
            kind: MediaKind::GeneratedShakingPolygon,
            source: r##"{"generator":"shaking-polygon","line_width":20,"vertex_count":3,"fixed_diameter":260,"vertical_distortion_percent":0,"repeat_count":1,"repeat_frequency":1,"fill":false,"jitter_range":20,"jitter_interval":10,"stepped":false,"colour":"#ffffff","seed":0}"##.to_string(),
            width: 360,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame_a = build_generated_shaking_polygon_source_frame(&media, 0)
        .expect("generated shaking polygon frame should render");
    let frame_b = build_generated_shaking_polygon_source_frame(&media, 60)
        .expect("generated shaking polygon frame should render at a later frame");
    let white_count = frame_a
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let transparent_count = frame_a
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();
    let changed_bytes = frame_a
        .pixels
        .iter()
        .zip(frame_b.pixels.iter())
        .filter(|(left, right)| left != right)
        .count();

    assert!(white_count > 8_000);
    assert!(transparent_count > 90_000);
    assert!(changed_bytes > 2_000);
}

#[test]
fn generated_shattered_sphere_source_frame_animates_fragments_and_transparency() {
    let media = SceneMediaReference {
            id: "shattered-sphere-1".to_string(),
            kind: MediaKind::GeneratedShatteredSphere,
            source: r##"{"generator":"shattered-sphere-93","fracture_amount":100,"delay":100,"radius":160,"limit_distance":150,"thickness":20,"fragment_size":40,"random_shape":100,"speed":100,"impact":100,"gravity":[0,100,0],"spin":100,"direction_diffusion":100,"colour":"#ffffff","seed":93}"##.to_string(),
            width: 360,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame_a = build_generated_shattered_sphere_source_frame(&media, 0)
        .expect("generated shattered sphere frame should render");
    let frame_b = build_generated_shattered_sphere_source_frame(&media, 60)
        .expect("generated shattered sphere frame should render at a later frame");
    let white_count = frame_a
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[0] > 220 && rgba[1] > 220 && rgba[2] > 220 && rgba[3] > 180)
        .count();
    let transparent_count = frame_a
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();
    let changed_bytes = frame_a
        .pixels
        .iter()
        .zip(frame_b.pixels.iter())
        .filter(|(left, right)| left != right)
        .count();

    assert!(white_count > 4_000);
    assert!(transparent_count > 70_000);
    assert!(changed_bytes > 8_000);
}

#[test]
fn generated_tone_curve_source_frame_contains_grid_and_curve() {
    let media = SceneMediaReference {
            id: "tone-curve-1".to_string(),
            kind: MediaKind::GeneratedToneCurve,
            source: r##"{"width":360,"height":360,"gridDivisions":4,"lineWidth":3,"curvePoints":[0,0.16,0.42,0.7,1],"curveColour":"#ffffff","gridColour":"#333333","backgroundColour":"#000000"}"##.to_string(),
            width: 360,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_tone_curve_source_frame(&media)
        .expect("generated tone curve frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let grid_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [51, 51, 51, 255])
        .count();
    let background_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [0, 0, 0, 255])
        .count();

    assert!(white_count > 1_000);
    assert!(grid_count > 2_000);
    assert!(background_count > 100_000);
}

#[test]
fn generated_hksy_checker_grid_source_frame_contains_checker_cells_and_grid() {
    let media = SceneMediaReference {
            id: "hksy-checker-grid-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"width":800,"height":450,"cellSize":50,"lineWidth":2,"checkerEnabled":true,"gridEnabled":true,"foregroundColour":"#ffffff","secondaryColour":"#333333","backgroundColour":"#000000"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_hksy_checker_grid_source_frame(&media)
        .expect("generated hksy checker grid frame should render");
    let foreground_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let grid_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [51, 51, 51, 255])
        .count();
    let background_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [0, 0, 0, 255])
        .count();
    let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

    assert!(foreground_count > 120_000);
    assert!(grid_count > 15_000);
    assert!(background_count > 120_000);
    assert!(fully_opaque);
}

#[test]
fn generated_hksy_checker_grid_source_frame_uses_palette_colours_for_checker_tiles() {
    let media = SceneMediaReference {
            id: "hksy-multi-colour-checker-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"width":120,"height":80,"cellSize":20,"lineWidth":0,"checkerEnabled":true,"gridEnabled":false,"foregroundColour":"#ff5c8a","secondaryColour":"#36c2ff","backgroundColour":"#111111","paletteColours":["#ff5c8a","#36c2ff","#ffd166","#70e000"]}"##.to_string(),
            width: 120,
            height: 80,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_hksy_checker_grid_source_frame(&media)
        .expect("generated hksy multi-colour checker frame should render");
    let pink_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 92, 138, 255])
        .count();
    let blue_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [54, 194, 255, 255])
        .count();
    let yellow_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 209, 102, 255])
        .count();
    let green_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [112, 224, 0, 255])
        .count();

    assert!(pink_count > 0);
    assert!(blue_count > 0);
    assert!(yellow_count > 0);
    assert!(green_count > 0);
}

#[test]
fn generated_hksy_checker_grid_source_frame_renders_diamond_pattern_with_transparency() {
    let media = SceneMediaReference {
            id: "hksy-diamond-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"width":480,"height":360,"pattern":"diamond","cellSize":64,"lineWidth":96,"checkerEnabled":false,"gridEnabled":false,"foregroundColour":"#ffffff","secondaryColour":"#ffffff","backgroundColour":"#000000"}"##.to_string(),
            width: 480,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_hksy_checker_grid_source_frame(&media)
        .expect("generated hksy diamond frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();
    let centre_offset =
        ((media.height as usize / 2) * media.width as usize + (media.width as usize / 2)) * 4;
    let centre_pixel = &frame.pixels[centre_offset..centre_offset + 4];

    assert!(white_count > 20_000);
    assert!(transparent_count > 40_000);
    assert_eq!(centre_pixel, [0, 0, 0, 0]);
}

#[test]
fn generated_hksy_checker_grid_source_frame_renders_measured_grid_lines() {
    let media = SceneMediaReference {
            id: "hksy-measured-grid-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"width":320,"height":240,"pattern":"measured-grid","cellSize":32,"lineWidth":1,"checkerEnabled":false,"gridEnabled":true,"foregroundColour":"#ffffff","secondaryColour":"#bbeeff","backgroundColour":"#10131a","separateInterval":5,"separateLineWidth":3}"##.to_string(),
            width: 320,
            height: 240,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_hksy_checker_grid_source_frame(&media)
        .expect("generated hksy measured grid frame should render");
    let base_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [16, 19, 26, 255])
        .count();
    let line_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [187, 238, 255, 255])
        .count();
    let separate_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();

    assert!(base_count > 60_000);
    assert!(line_count > 1_000);
    assert!(separate_count > 1_000);
}

#[test]
fn generated_hksy_checker_grid_source_frame_renders_anchor_line_pattern() {
    let media = SceneMediaReference {
            id: "hksy-anchor-line-1".to_string(),
            kind: MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"width":480,"height":360,"pattern":"anchor-line","cellSize":64,"lineWidth":20,"checkerEnabled":false,"gridEnabled":false,"foregroundColour":"#ffffff","secondaryColour":"#ffffff","backgroundColour":"#000000","anchorPoints":[{"x":-88,"y":50},{"x":0,"y":-100},{"x":88,"y":50}],"roundCaps":true,"maxJoinDistance":50}"##.to_string(),
            width: 480,
            height: 360,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_hksy_checker_grid_source_frame(&media)
        .expect("generated hksy anchor line frame should render");
    let white_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let transparent_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] == 0)
        .count();
    let apex_offset = ((80_usize * media.width as usize) + 240_usize) * 4;
    let apex_pixel = &frame.pixels[apex_offset..apex_offset + 4];

    assert!(white_count > 6_000);
    assert!(transparent_count > 140_000);
    assert_eq!(apex_pixel, [255, 255, 255, 255]);
}

#[test]
fn generated_getcolor_dots_source_frame_contains_dot_field_and_background() {
    let media = SceneMediaReference {
            id: "getcolor-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":32,"rows":18,"dot_size":14,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_getcolor_dots_source_frame(&media)
        .expect("generated GetColor dot field frame should render");
    let foreground_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [255, 255, 255, 255])
        .count();
    let secondary_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [54, 194, 255, 255])
        .count();
    let background_count = frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| *rgba == [0, 0, 0, 255])
        .count();
    let fully_opaque = frame.pixels.chunks_exact(4).all(|rgba| rgba[3] == 255);

    assert!(foreground_count > 10_000);
    assert!(secondary_count > 10_000);
    assert!(background_count > 180_000);
    assert!(fully_opaque);
}

#[test]
fn generated_getcolor_dots_source_frame_renders_diamond_dot_shape() {
    let media = SceneMediaReference {
            id: "getcolor-diamond-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":40,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"diamond","stroke_width":0}"##.to_string(),
            width: 100,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_getcolor_dots_source_frame(&media)
        .expect("generated GetColor diamond dot frame should render");
    let centre_offset = ((50_usize * media.width as usize) + 50_usize) * 4;
    let circle_only_corner_offset = ((63_usize * media.width as usize) + 63_usize) * 4;

    assert_ne!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [0, 0, 0, 255]
    );
    assert_eq!(
        &frame.pixels[circle_only_corner_offset..circle_only_corner_offset + 4],
        [0, 0, 0, 255]
    );
}

#[test]
fn generated_getcolor_dots_source_frame_renders_outlined_square_dot_shape() {
    let media = SceneMediaReference {
            id: "getcolor-outlined-square-dot-field-1".to_string(),
            kind: MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":40,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"square","stroke_width":8}"##.to_string(),
            width: 100,
            height: 100,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_getcolor_dots_source_frame(&media)
        .expect("generated GetColor outlined square dot frame should render");
    let centre_offset = ((50_usize * media.width as usize) + 50_usize) * 4;
    let edge_offset = ((35_usize * media.width as usize) + 50_usize) * 4;

    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [0, 0, 0, 255]
    );
    assert_ne!(&frame.pixels[edge_offset..edge_offset + 4], [0, 0, 0, 255]);
}

#[test]
fn generated_getcolor_dots_source_frame_samples_source_image_colour_and_alpha() {
    let source_path = write_test_rgba_png(
        "uxfd-getcolor-sampled-source",
        2,
        1,
        &[255, 0, 0, 255, 0, 64, 255, 128],
    );
    let source = format!(
        r##"{{"generator":"getcolor-v2r-dot-field","columns":2,"rows":1,"dot_size":36,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"{}","sample_strength":1}}"##,
        json_escape_path(&source_path)
    );
    let media = SceneMediaReference {
        id: "getcolor-sampled-dot-field-1".to_string(),
        kind: MediaKind::GeneratedGetColorDots,
        source,
        width: 120,
        height: 60,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame = build_generated_getcolor_dots_source_frame(&media)
        .expect("generated GetColor sampled dot frame should render");
    let left_centre_offset = ((30_usize * media.width as usize) + 30_usize) * 4;
    let right_centre_offset = ((30_usize * media.width as usize) + 90_usize) * 4;

    assert_eq!(
        &frame.pixels[left_centre_offset..left_centre_offset + 4],
        [255, 0, 0, 255]
    );
    assert_eq!(
        &frame.pixels[right_centre_offset..right_centre_offset + 4],
        [0, 64, 255, 128]
    );

    let _ = std::fs::remove_file(source_path);
}

#[test]
fn generated_getcolor_dots_source_frame_applies_sample_hue_shift() {
    let source_path = write_test_rgba_png(
        "uxfd-getcolor-sampled-hue-shift-source",
        1,
        1,
        &[255, 0, 0, 255],
    );
    let source = format!(
        r##"{{"generator":"getcolor-v2r-dot-field","columns":1,"rows":1,"dot_size":36,"size_influence":0,"luminance_influence":0,"hue_shift_degrees":0,"alternate_rows":false,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","seed":93,"dot_shape":"circle","stroke_width":0,"source_image":"{}","sample_strength":1,"sample_hue_shift_degrees":120}}"##,
        json_escape_path(&source_path)
    );
    let media = SceneMediaReference {
        id: "getcolor-sampled-hue-shift-dot-field-1".to_string(),
        kind: MediaKind::GeneratedGetColorDots,
        source,
        width: 60,
        height: 60,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame = build_generated_getcolor_dots_source_frame(&media)
        .expect("generated GetColor sampled hue shift frame should render");
    let centre_offset = ((30_usize * media.width as usize) + 30_usize) * 4;

    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [0, 255, 0, 255]
    );

    let _ = std::fs::remove_file(source_path);
}

#[test]
fn generated_getcolor_dots_source_accepts_psd_source_with_active_layer_ids() {
    let source = GeneratedGetColorDotsSource {
        generator: "getcolor-v2r-dot-field".to_string(),
        columns: 2,
        rows: 1,
        dot_size: 36.0,
        dot_shape: Some("circle".to_string()),
        stroke_width: Some(0.0),
        size_influence: 0.0,
        luminance_influence: 0.0,
        hue_shift_degrees: 0.0,
        alternate_rows: false,
        foreground_colour: "#ffffff".to_string(),
        secondary_colour: "#36c2ff".to_string(),
        background_colour: "#000000".to_string(),
        source_image: Some("file:///tmp/standing-source.psd".to_string()),
        source_active_layer_ids: Some(vec![
            "eye-open".to_string(),
            "mouth-open".to_string(),
            "root".to_string(),
        ]),
        sample_strength: Some(0.75),
        sample_hue_shift_degrees: None,
        seed: 93,
    };

    validate_generated_getcolor_dots_source(&source)
        .expect("GetColor PSD sample source should validate");
}

#[test]
fn generated_region_frame_source_frame_renders_border_and_background() {
    let media = SceneMediaReference {
            id: "region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"width":800,"height":450,"lineWidth":10,"shape":"rectangle","extraWidth":0,"extraHeight":0,"backgroundOpacity":0.2,"frameColour":"#ffffff","backgroundColour":"#ccccff"}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_region_frame_source_frame(&media)
        .expect("generated region frame should render");
    let top_border_offset = ((4_usize * media.width as usize) + 400_usize) * 4;
    let centre_offset = ((225_usize * media.width as usize) + 400_usize) * 4;

    assert_eq!(
        &frame.pixels[top_border_offset..top_border_offset + 4],
        [255, 255, 255, 255]
    );
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [204, 204, 255, 51]
    );
}

#[test]
fn generated_region_frame_source_frame_renders_ellipse_variant_with_transparent_corners() {
    let media = SceneMediaReference {
            id: "ellipse-region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"width":200,"height":120,"lineWidth":10,"shape":"ellipse","extraWidth":0,"extraHeight":0,"backgroundOpacity":0.2,"frameColour":"#ffffff","backgroundColour":"#ccccff"}"##.to_string(),
            width: 200,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_region_frame_source_frame(&media)
        .expect("generated ellipse region frame should render");
    let corner_offset = 0_usize;
    let top_border_offset = ((1_usize * media.width as usize) + 100_usize) * 4;
    let centre_offset = ((60_usize * media.width as usize) + 100_usize) * 4;

    assert_eq!(
        &frame.pixels[corner_offset..corner_offset + 4],
        [0, 0, 0, 0]
    );
    assert_eq!(
        &frame.pixels[top_border_offset..top_border_offset + 4],
        [255, 255, 255, 255]
    );
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [204, 204, 255, 51]
    );
}

#[test]
fn generated_region_frame_source_frame_renders_cut_corner_variant() {
    let media = SceneMediaReference {
            id: "cut-region-frame-1".to_string(),
            kind: MediaKind::GeneratedRegionFrame,
            source: r##"{"width":200,"height":120,"lineWidth":8,"shape":"cut_corner","cornerCut":24,"extraWidth":0,"extraHeight":0,"backgroundOpacity":0.2,"frameColour":"#ffffff","backgroundColour":"#ccccff"}"##.to_string(),
            width: 200,
            height: 120,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_region_frame_source_frame(&media)
        .expect("generated cut-corner region frame should render");
    let corner_offset = 0_usize;
    let top_border_offset = ((1_usize * media.width as usize) + 100_usize) * 4;
    let centre_offset = ((60_usize * media.width as usize) + 100_usize) * 4;

    assert_eq!(
        &frame.pixels[corner_offset..corner_offset + 4],
        [0, 0, 0, 0]
    );
    assert_eq!(
        &frame.pixels[top_border_offset..top_border_offset + 4],
        [255, 255, 255, 255]
    );
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [204, 204, 255, 51]
    );
}

#[test]
fn generated_simple_tube_source_frame_renders_tube_lines() {
    let media = SceneMediaReference {
            id: "simple-tube-1".to_string(),
            kind: MediaKind::GeneratedSimpleTube,
            source: r##"{"width":800,"height":450,"radius":150,"depth":280,"segments":16,"rings":10,"twistDegrees":0,"randomAmount":0,"strokeWidth":3,"colour":"#0e769f","secondaryColour":"#ffffff","seed":93,"torus":false}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_simple_tube_source_frame(&media)
        .expect("generated SimpleTube frame should render");
    let centre_line_offset = ((225_usize * media.width as usize) + 400_usize) * 4;
    let edge_line_offset = ((225_usize * media.width as usize) + 260_usize) * 4;
    let empty_corner_offset = 0_usize;

    assert_eq!(
        &frame.pixels[centre_line_offset..centre_line_offset + 4],
        [255, 255, 255, 255]
    );
    assert_eq!(
        &frame.pixels[edge_line_offset..edge_line_offset + 4],
        [14, 118, 159, 255]
    );
    assert_eq!(
        &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
        [0, 0, 0, 0]
    );
}

#[test]
fn generated_simple_tube_source_frame_renders_torus_with_fogged_ring_pattern() {
    let media = SceneMediaReference {
            id: "simple-tube-torus-1".to_string(),
            kind: MediaKind::GeneratedSimpleTube,
            source: r##"{"width":800,"height":450,"radius":170,"depth":260,"segments":24,"rings":16,"twistDegrees":120,"randomAmount":0,"strokeWidth":3,"colour":"#0e769f","secondaryColour":"#f9f9f9","colourPattern":"ring","fogStrength":0.35,"fogColour":"#ffffff","seed":93,"torus":true}"##.to_string(),
            width: 800,
            height: 450,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_simple_tube_source_frame(&media)
        .expect("generated SimpleTube torus frame should render");
    let centre_offset = ((225_usize * media.width as usize) + 400_usize) * 4;
    let right_ring_offset = ((225_usize * media.width as usize) + 553_usize) * 4;
    let empty_corner_offset = 0_usize;

    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [251, 251, 251, 255]
    );
    assert_ne!(
        &frame.pixels[right_ring_offset..right_ring_offset + 4],
        [14, 118, 159, 255]
    );
    assert_eq!(
        &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
        [0, 0, 0, 0]
    );
}

#[test]
fn generated_sphere_dots_source_frame_renders_equator_points() {
    let media = SceneMediaReference {
            id: "sphere-dots-1".to_string(),
            kind: MediaKind::GeneratedSphereDots,
            source: r##"{"width":480,"height":480,"radius":170,"columns":16,"rows":11,"rotationDegrees":0,"offsetDegrees":0,"luminanceInfluence":0,"pointSize":6,"latitudeLineWidth":2,"colour":"#ffffff","secondaryColour":"#36c2ff","seed":93,"planeMode":false}"##.to_string(),
            width: 480,
            height: 480,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_sphere_dots_source_frame(&media)
        .expect("generated Sphere(DrawPixel) frame should render");
    let right_equator_offset = ((240_usize * media.width as usize) + 410_usize) * 4;
    let centre_offset = ((240_usize * media.width as usize) + 240_usize) * 4;
    let empty_corner_offset = 0_usize;

    assert_eq!(
        &frame.pixels[right_equator_offset..right_equator_offset + 4],
        [255, 255, 255, 255]
    );
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [54, 194, 255, 255]
    );
    assert_eq!(
        &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
        [0, 0, 0, 0]
    );
}

#[test]
fn generated_spherical_field_source_frame_renders_force_ring() {
    let media = SceneMediaReference {
            id: "spherical-field-1".to_string(),
            kind: MediaKind::GeneratedSphericalField,
            source: r##"{"width":480,"height":480,"radius":160,"strength":100,"colourAmount":100,"alphaAmount":0,"lineWidth":3,"ringCount":4,"vectorCount":16,"fieldColour":"#ff3b30","secondaryColour":"#36c2ff","backgroundOpacity":0.08,"container":false,"seed":93}"##.to_string(),
            width: 480,
            height: 480,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };

    let frame = build_generated_spherical_field_source_frame(&media)
        .expect("generated SphericalField frame should render");
    let right_ring_offset = ((240_usize * media.width as usize) + 400_usize) * 4;
    let centre_offset = ((240_usize * media.width as usize) + 240_usize) * 4;
    let empty_corner_offset = 0_usize;

    assert_eq!(
        &frame.pixels[right_ring_offset..right_ring_offset + 4],
        [255, 59, 48, 255]
    );
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        [54, 194, 255, 255]
    );
    assert_eq!(
        &frame.pixels[empty_corner_offset..empty_corner_offset + 4],
        [0, 0, 0, 0]
    );
}

#[test]
fn generated_text_source_frame_renders_non_transparent_glyphs_for_latin_text() {
    let media = SceneMediaReference {
        id: "text-1".to_string(),
        kind: MediaKind::Text,
        source: r##"{"text":"Hi","fontFamily":"Arial","fontSize":64,"fill":"#ffffff"}"##.to_string(),
        width: 200,
        height: 100,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame =
        build_generated_text_source_frame(&media).expect("generated Text frame should render");

    assert_eq!(frame.width, media.width);
    assert_eq!(frame.height, media.height);

    let has_visible_glyph_pixel = frame.pixels.chunks_exact(4).any(|rgba| rgba[3] > 0);
    assert!(
        has_visible_glyph_pixel,
        "expected at least one non-transparent glyph pixel for Latin text"
    );

    let has_transparent_background_pixel = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);
    assert!(
        has_transparent_background_pixel,
        "expected the frame background to remain transparent where no glyph is drawn"
    );
}

#[test]
fn generated_text_source_frame_renders_non_empty_output_for_cjk_text() {
    let media = SceneMediaReference {
        id: "text-cjk-1".to_string(),
        kind: MediaKind::Text,
        source: r##"{"text":"こんにちは","fontFamily":"Hiragino Sans","fontSize":48,"fill":"#ffffff"}"##.to_string(),
        width: 320,
        height: 100,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame = build_generated_text_source_frame(&media)
        .expect("generated Text frame should render CJK text");

    let has_visible_glyph_pixel = frame.pixels.chunks_exact(4).any(|rgba| rgba[3] > 0);
    assert!(
        has_visible_glyph_pixel,
        "expected at least one non-transparent glyph pixel for CJK text (Hiragino fallback)"
    );
}

#[test]
fn generated_text_source_frame_rejects_non_positive_dimensions() {
    let media = SceneMediaReference {
        id: "text-invalid-1".to_string(),
        kind: MediaKind::Text,
        source: r##"{"text":"Hi","fontFamily":"Arial","fontSize":32,"fill":"#ffffff"}"##.to_string(),
        width: 0,
        height: 100,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let result = build_generated_text_source_frame(&media);
    assert!(result.is_err());
}

/// `textShadow.blur` の契約テスト用ヘルパー。
///
/// 本体（白 `#ffffff`）と影（赤 `#ff0000`）を色で判別できるようにし、
/// 影のオフセットを大きく取ることで本体グリフと重ならないようにする。
/// こうすることで、フレーム内の「赤みがかった」ピクセルだけを見れば
/// 影の広がり・アルファを本体の影響なしに検証できる。
fn text_shadow_blur_test_media(blur: f32) -> SceneMediaReference {
    SceneMediaReference {
        id: format!("text-shadow-blur-{blur}"),
        kind: MediaKind::Text,
        source: format!(
            r##"{{"text":"l","fontFamily":"Arial","fontSize":64,"fill":"#ffffff","textShadow":{{"colour":"#ff0000","offsetX":120,"offsetY":0,"blur":{blur}}}}}"##
        ),
        width: 400,
        height: 150,
        source_rate: None,
        active_layer_ids: Vec::new(),
    }
}

/// 赤み（影）を帯びたピクセルかどうかを判定する。本体は白（r=g=b）なので
/// 単純な「赤が緑・青より十分強い」判定で影のピクセルだけを拾える。
fn is_shadow_tinted(rgba: &[u8]) -> bool {
    rgba[3] > 0 && rgba[0] > rgba[1].saturating_add(50) && rgba[0] > rgba[2].saturating_add(50)
}

/// 影（赤）ピクセルのバウンディングボックス `(min_x, min_y, max_x, max_y)` を求める。
fn shadow_bounding_box(frame: &RgbaFrame) -> (u32, u32, u32, u32) {
    let mut min_x = u32::MAX;
    let mut min_y = u32::MAX;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    for y in 0..frame.height {
        for x in 0..frame.width {
            let index = ((y * frame.width + x) * 4) as usize;
            if is_shadow_tinted(&frame.pixels[index..index + 4]) {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }
    assert!(min_x <= max_x, "expected at least one shadow pixel");
    (min_x, min_y, max_x, max_y)
}

fn pixel_alpha(frame: &RgbaFrame, x: u32, y: u32) -> u8 {
    let index = ((y * frame.width + x) * 4) as usize;
    frame.pixels[index + 3]
}

fn count_shadow_tinted_pixels(frame: &RgbaFrame) -> usize {
    frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| is_shadow_tinted(rgba))
        .count()
}

#[test]
fn generated_text_source_frame_shadow_without_blur_keeps_sharp_edge() {
    let media = text_shadow_blur_test_media(0.0);
    let frame = build_generated_text_source_frame(&media)
        .expect("generated Text frame with shadow should render");

    let (min_x, min_y, max_x, max_y) = shadow_bounding_box(&frame);
    let centre_y = (min_y + max_y) / 2;
    let centre_x = (min_x + max_x) / 2;

    // ぼかし無しなので、バウンディングボックスの外側1pxは完全に透明のはず。
    assert_eq!(
        pixel_alpha(&frame, min_x - 1, centre_y),
        0,
        "left of the sharp shadow bounding box should stay fully transparent"
    );
    assert_eq!(
        pixel_alpha(&frame, max_x + 1, centre_y),
        0,
        "right of the sharp shadow bounding box should stay fully transparent"
    );
    assert_eq!(
        pixel_alpha(&frame, centre_x, min_y - 1),
        0,
        "above the sharp shadow bounding box should stay fully transparent"
    );
    assert_eq!(
        pixel_alpha(&frame, centre_x, max_y + 1),
        0,
        "below the sharp shadow bounding box should stay fully transparent"
    );
}

#[test]
fn generated_text_source_frame_shadow_with_blur_spreads_beyond_sharp_bounds() {
    let sharp_frame = build_generated_text_source_frame(&text_shadow_blur_test_media(0.0))
        .expect("generated Text frame with sharp shadow should render");
    let (min_x, min_y, _max_x, max_y) = shadow_bounding_box(&sharp_frame);
    let centre_y = (min_y + max_y) / 2;

    let blurred_frame = build_generated_text_source_frame(&text_shadow_blur_test_media(16.0))
        .expect("generated Text frame with blurred shadow should render");

    // ぼかし無しでは透明だった、バウンディングボックスの少し外側の位置が
    // ぼかしありでは非透明になっている（影が外側へ広がった証拠）。
    assert_eq!(pixel_alpha(&sharp_frame, min_x - 2, centre_y), 0);
    assert!(
        pixel_alpha(&blurred_frame, min_x - 2, centre_y) > 0,
        "blurred shadow should spread past the sharp bounding box"
    );
}

#[test]
fn generated_text_source_frame_shadow_blur_reduces_centre_alpha() {
    let sharp_frame = build_generated_text_source_frame(&text_shadow_blur_test_media(0.0))
        .expect("generated Text frame with sharp shadow should render");
    let (min_x, min_y, max_x, max_y) = shadow_bounding_box(&sharp_frame);
    let centre_x = (min_x + max_x) / 2;
    let centre_y = (min_y + max_y) / 2;

    let blurred_frame = build_generated_text_source_frame(&text_shadow_blur_test_media(16.0))
        .expect("generated Text frame with blurred shadow should render");

    let sharp_alpha = pixel_alpha(&sharp_frame, centre_x, centre_y);
    let blurred_alpha = pixel_alpha(&blurred_frame, centre_x, centre_y);

    assert!(
        blurred_alpha < sharp_alpha,
        "blurred shadow centre alpha ({blurred_alpha}) should be lower than sharp shadow centre alpha ({sharp_alpha}) as energy spreads out"
    );
}

#[test]
fn generated_text_source_frame_shadow_blur_spread_increases_monotonically() {
    let small_blur_frame = build_generated_text_source_frame(&text_shadow_blur_test_media(4.0))
        .expect("generated Text frame with small blur should render");
    let large_blur_frame = build_generated_text_source_frame(&text_shadow_blur_test_media(12.0))
        .expect("generated Text frame with large blur should render");

    let small_blur_count = count_shadow_tinted_pixels(&small_blur_frame);
    let large_blur_count = count_shadow_tinted_pixels(&large_blur_frame);

    assert!(
        large_blur_count > small_blur_count,
        "larger blur ({large_blur_count} tinted pixels) should spread the shadow further than a smaller blur ({small_blur_count} tinted pixels)"
    );
}

/// 極端に大きい・非有限な `blur` を与えてもハングせずに完了することを検証する
/// ための共通ヘルパー。フレーム生成を別スレッドで実行し、`timeout_secs` 秒
/// 待っても結果が返らない場合は「ハングした」とみなしてテストを失敗させる
/// （半径に上限が無い実装は、この待ち時間内に戻ってこない）。
fn build_generated_text_source_frame_with_timeout(
    media: SceneMediaReference,
    timeout_secs: u64,
) -> Result<RgbaFrame, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = build_generated_text_source_frame(&media);
        // 受信側が既にタイムアウトで諦めている場合は送信に失敗しうるが、
        // その場合はテストが既に失敗しているため無視してよい。
        let _ = sender.send(result);
    });

    receiver
        .recv_timeout(std::time::Duration::from_secs(timeout_secs))
        .unwrap_or_else(|_| {
            panic!(
                "generated Text frame did not complete within {timeout_secs}s; \
                 an unbounded box-blur radius would loop proportionally to `blur` \
                 regardless of the buffer size and effectively hang"
            )
        })
}

#[test]
fn generated_text_source_frame_shadow_extreme_blur_completes_without_hanging() {
    // 意図的に極端な blur を与える。半径にクランプが無い実装だと、初期窓和
    // ループ（`for x in 0..=radius`）が半径に比例した回数だけ回るため、
    // この規模の半径では現実的な時間内に終わらない（ハングする）。
    let media = text_shadow_blur_test_media(1.0e9);
    let frame = build_generated_text_source_frame_with_timeout(media, 10)
        .expect("generated Text frame with extreme blur should render, not error");

    // クランプ後の半径（プレーン寸法程度）でも window（= 2*radius+1）は
    // プレーン寸法よりなお大きくなり得るため、影の総アルファ質量が
    // ローカルバッファ全体へ極端に希釈され、8bit 量子化で 0 に丸め込まれる
    // ことがある（実測済み）。これは意図した副作用であり、この修正が
    // 保証すべきなのは「ハングも panic もせず、壊れていない寸法のフレームが
    // 有限時間で返ること」であって、極端値での影の可視性そのものではない。
    assert_eq!(frame.width, 400);
    assert_eq!(frame.height, 150);
    assert_eq!(frame.pixels.len(), 400 * 150 * 4);
}

#[test]
fn generated_text_source_frame_shadow_blur_non_positive_and_overflowing_do_not_panic() {
    // "-10.0" と "0.0" は blur <= 0 のフォールバック経路を、"1e40" は
    // JSON としては正当な数値だが f32 へのデシリアライズ時にオーバー
    // フローして無限大になる経路を通す（f32::INFINITY は JSON の数値
    // リテラルとして直接は表現できないため、この形で経路を確保する）。
    for blur_literal in ["-10.0", "0.0", "1e40"] {
        let media = SceneMediaReference {
            id: format!("text-shadow-blur-literal-{blur_literal}"),
            kind: MediaKind::Text,
            source: format!(
                r##"{{"text":"l","fontFamily":"Arial","fontSize":64,"fill":"#ffffff","textShadow":{{"colour":"#ff0000","offsetX":120,"offsetY":0,"blur":{blur_literal}}}}}"##
            ),
            width: 400,
            height: 150,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };
        let result = build_generated_text_source_frame_with_timeout(media, 10);
        assert!(
            result.is_ok(),
            "blur literal {blur_literal} should not panic and should still render a frame"
        );
    }
}

#[test]
fn generated_shape_source_frame_renders_filled_circle_with_transparent_corners() {
    let media = SceneMediaReference {
        id: "shape-circle-1".to_string(),
        kind: MediaKind::GeneratedShape,
        source: r##"{"shapeType":"circle","width":200,"height":200,"fill":"#ff0000"}"##.to_string(),
        width: 200,
        height: 200,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame =
        build_generated_shape_source_frame(&media).expect("generated shape circle should render");

    let centre_offset = ((100 * 200 + 100) * 4) as usize;
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        &[255, 0, 0, 255]
    );

    let corner_offset = 0usize;
    assert_eq!(&frame.pixels[corner_offset..corner_offset + 4], &[0, 0, 0, 0]);
}

#[test]
fn generated_shape_source_frame_renders_star_with_non_transparent_pixels() {
    let media = SceneMediaReference {
        id: "shape-star-1".to_string(),
        kind: MediaKind::GeneratedShape,
        source: r##"{"shapeType":"star","width":200,"height":200,"fill":"#00ff00"}"##.to_string(),
        width: 200,
        height: 200,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame =
        build_generated_shape_source_frame(&media).expect("generated shape star should render");

    let has_fill = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 255, 0, 255]);
    let has_transparent_background = frame
        .pixels
        .chunks_exact(4)
        .any(|rgba| rgba == [0, 0, 0, 0]);
    assert!(has_fill);
    assert!(has_transparent_background);
}

#[test]
fn generated_shape_source_frame_renders_triangle_with_apex_filled_and_bottom_corners_empty() {
    let media = SceneMediaReference {
        id: "shape-triangle-1".to_string(),
        kind: MediaKind::GeneratedShape,
        source: r##"{"shapeType":"triangle","width":200,"height":200,"fill":"#0000ff"}"##.to_string(),
        width: 200,
        height: 200,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame = build_generated_shape_source_frame(&media)
        .expect("generated shape triangle should render");

    let apex_offset = ((1 * 200 + 100) * 4) as usize;
    assert_eq!(
        &frame.pixels[apex_offset..apex_offset + 4],
        &[0, 0, 255, 255]
    );

    let bottom_left_offset = ((199 * 200 + 0) * 4) as usize;
    assert_eq!(
        &frame.pixels[bottom_left_offset..bottom_left_offset + 4],
        &[0, 0, 0, 0]
    );
}

#[test]
fn generated_shape_source_frame_renders_rounded_rect_with_transparent_corner_and_filled_centre() {
    let media = SceneMediaReference {
        id: "shape-rounded-rect-1".to_string(),
        kind: MediaKind::GeneratedShape,
        source: r##"{"shapeType":"rounded_rect","width":200,"height":200,"fill":"#ffff00","cornerRadius":40}"##.to_string(),
        width: 200,
        height: 200,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame = build_generated_shape_source_frame(&media)
        .expect("generated shape rounded_rect should render");

    let centre_offset = ((100 * 200 + 100) * 4) as usize;
    assert_eq!(
        &frame.pixels[centre_offset..centre_offset + 4],
        &[255, 255, 0, 255]
    );

    let corner_offset = 0usize;
    assert_eq!(&frame.pixels[corner_offset..corner_offset + 4], &[0, 0, 0, 0]);
}

#[test]
fn generated_shape_source_frame_applies_linear_gradient_across_width() {
    let media = SceneMediaReference {
        id: "shape-gradient-1".to_string(),
        kind: MediaKind::GeneratedShape,
        source: r##"{"shapeType":"ellipse","width":200,"height":200,"fill":"#000000","gradient":{"enabled":true,"type":"linear","colours":["#ff0000","#0000ff"],"stops":[0.0,1.0],"direction":0}}"##.to_string(),
        width: 200,
        height: 200,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let frame = build_generated_shape_source_frame(&media)
        .expect("generated shape ellipse with gradient should render");

    let left_offset = ((100 * 200 + 20) * 4) as usize;
    let right_offset = ((100 * 200 + 180) * 4) as usize;
    let left_pixel = &frame.pixels[left_offset..left_offset + 4];
    let right_pixel = &frame.pixels[right_offset..right_offset + 4];

    assert!(left_pixel[3] > 0);
    assert!(right_pixel[3] > 0);
    assert!(left_pixel[0] > right_pixel[0], "left should be more red than right");
    assert!(right_pixel[2] > left_pixel[2], "right should be more blue than left");
}

#[test]
fn generated_shape_source_frame_rejects_unknown_shape_type() {
    let media = SceneMediaReference {
        id: "shape-invalid-1".to_string(),
        kind: MediaKind::GeneratedShape,
        source: r##"{"shapeType":"unknown_shape","width":200,"height":200,"fill":"#ffffff"}"##.to_string(),
        width: 200,
        height: 200,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let result = build_generated_shape_source_frame(&media);
    assert!(result.is_err());
}

#[test]
fn generated_shape_source_frame_rejects_non_positive_dimensions() {
    let media = SceneMediaReference {
        id: "shape-invalid-dims-1".to_string(),
        kind: MediaKind::GeneratedShape,
        source: r##"{"shapeType":"circle","width":200,"height":200,"fill":"#ffffff"}"##.to_string(),
        width: 0,
        height: 200,
        source_rate: None,
        active_layer_ids: Vec::new(),
    };

    let result = build_generated_shape_source_frame(&media);
    assert!(result.is_err());
}
