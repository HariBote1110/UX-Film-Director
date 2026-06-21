use uxfd_rust_core::{MediaKind, SceneMediaReference};

#[test]
fn rust_core_accepts_psd_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "psd-1",
        "kind": "Psd",
        "source": "/tmp/standing.psd",
        "width": 512,
        "height": 768,
        "active_layer_ids": ["face-open", "root"]
    }))
    .expect("Psd media kind should deserialize");

    assert_eq!(media.kind, MediaKind::Psd);
    assert_eq!(media.source_rate, None);
    assert_eq!(
        media.active_layer_ids,
        vec!["face-open".to_string(), "root".to_string()]
    );
}

#[test]
fn rust_core_accepts_generated_gradient_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "gradient-1",
        "kind": "GeneratedGradient",
        "source": "{\"type\":\"linear\",\"colours\":[\"#ff0000\",\"#0000ff\"],\"stops\":[0,1],\"direction\":90}",
        "width": 200,
        "height": 100
    }))
    .expect("GeneratedGradient media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedGradient);
    assert_eq!(media.width, 200);
    assert_eq!(media.height, 100);
}

#[test]
fn rust_core_accepts_generated_particle_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "particle-1",
        "kind": "GeneratedParticle",
        "source": "{\"generator\":\"standard-particle\",\"seed\":93,\"particle_count\":16,\"spread\":180,\"speed\":120,\"size\":6,\"colour\":\"#ffffff\",\"lifetime_seconds\":1.5}",
        "width": 640,
        "height": 360
    }))
    .expect("GeneratedParticle media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedParticle);
    assert_eq!(media.width, 640);
    assert_eq!(media.height, 360);
}

#[test]
fn rust_core_accepts_generated_barcode_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "barcode-1",
        "kind": "GeneratedBarcode",
        "source": "{\"generator\":\"barcode-t\",\"data\":\"AviUtl\",\"minimum_bar_width\":2,\"horizontal_margin\":30,\"vertical_margin\":20,\"foreground_colour\":\"#000000\",\"background_colour\":\"#ffffff\"}",
        "width": 420,
        "height": 160
    }))
    .expect("GeneratedBarcode media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedBarcode);
    assert_eq!(media.width, 420);
    assert_eq!(media.height, 160);
}

#[test]
fn rust_core_accepts_generated_puzzle_piece_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "puzzle-1",
        "kind": "GeneratedPuzzlePiece",
        "source": "{\"generator\":\"puzzle-piece\",\"size\":120,\"shape_variant\":1,\"connector_mode\":\"convex\",\"fill_colour\":\"#ffffff\"}",
        "width": 240,
        "height": 240
    }))
    .expect("GeneratedPuzzlePiece media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedPuzzlePiece);
    assert_eq!(media.width, 240);
    assert_eq!(media.height, 240);
}

#[test]
fn rust_core_accepts_generated_colour_wheel_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "colour-wheel-1",
        "kind": "GeneratedColourWheel",
        "source": "{\"generator\":\"colour-wheel\",\"radius\":120,\"saturation\":100,\"brightness\":100,\"ring_width_percent\":25,\"segment_count\":24}",
        "width": 240,
        "height": 240
    }))
    .expect("GeneratedColourWheel media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedColourWheel);
    assert_eq!(media.width, 240);
    assert_eq!(media.height, 240);
}

#[test]
fn rust_core_accepts_generated_gourd_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "gourd-1",
        "kind": "GeneratedGourd",
        "source": "{\"generator\":\"gourd-tm\",\"body_radius\":80,\"body_width\":250,\"waist_radius\":10,\"squash_percent\":40,\"repeat_count\":1,\"fill_colour\":\"#ffffff\"}",
        "width": 400,
        "height": 400
    }))
    .expect("GeneratedGourd media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedGourd);
    assert_eq!(media.width, 400);
    assert_eq!(media.height, 400);
}

#[test]
fn rust_core_accepts_generated_gear_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "gear-1",
        "kind": "GeneratedGear",
        "source": "{\"generator\":\"gear-t\",\"outer_radius\":160,\"inner_radius_percent\":45,\"tooth_count\":20,\"tooth_depth_percent\":18,\"tooth_skew_percent\":0,\"fill_colour\":\"#ffffff\"}",
        "width": 320,
        "height": 320
    }))
    .expect("GeneratedGear media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedGear);
    assert_eq!(media.width, 320);
    assert_eq!(media.height, 320);
}

#[test]
fn rust_core_accepts_generated_track_bar_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "track-bar-1",
        "kind": "GeneratedTrackBar",
        "source": "{\"generator\":\"custom-track-bar\",\"track_values\":[0,25,50,-50],\"track_ranges\":[[0,100],[0,100],[0,100],[-100,100]],\"labels\":[\"TrackA\",\"TrackB\",\"TrackC\",\"TrackD\"],\"bar_colour\":\"#ffffff\",\"background_opacity\":0.05}",
        "width": 360,
        "height": 120
    }))
    .expect("GeneratedTrackBar media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedTrackBar);
    assert_eq!(media.width, 360);
    assert_eq!(media.height, 120);
}

#[test]
fn rust_core_accepts_generated_pie_chart_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "pie-chart-1",
        "kind": "GeneratedPieChart",
        "source": "{\"generator\":\"pie-sheet-graph\",\"values\":[10,20,30,40],\"sort_mode\":\"descending\",\"normalise_to_hundred\":true,\"label_mode\":\"percentage\",\"progress_percent\":100,\"stroke_width\":20,\"slice_colours\":[\"#389ba6\",\"#f2e2c4\",\"#f29422\",\"#f27830\",\"#f24b0f\"]}",
        "width": 400,
        "height": 400
    }))
    .expect("GeneratedPieChart media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedPieChart);
    assert_eq!(media.width, 400);
    assert_eq!(media.height, 400);
}

#[test]
fn rust_core_accepts_generated_histogram_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "histogram-1",
        "kind": "GeneratedHistogram",
        "source": "{\"generator\":\"simple-histogram\",\"bin_values\":[0.08,0.18,0.32,0.55,0.78,0.92,0.64,0.36],\"height_scale_percent\":100,\"line_width\":1,\"show_luminance\":true,\"show_red\":true,\"show_green\":true,\"show_blue\":true,\"channel_colours\":[\"#ffffff\",\"#ff4b4b\",\"#4bff6a\",\"#4b8cff\"],\"background_colour\":\"#000000\"}",
        "width": 256,
        "height": 200
    }))
    .expect("GeneratedHistogram media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedHistogram);
    assert_eq!(media.width, 256);
    assert_eq!(media.height, 200);
}

#[test]
fn rust_core_accepts_generated_sunburst_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "sunburst-1",
        "kind": "GeneratedSunburst",
        "source": "{\"generator\":\"sunrise\",\"ray_count\":10,\"ray_coverage_percent\":50,\"rotation_offset_degrees\":0,\"centre_x_percent\":50,\"centre_y_percent\":50,\"motif_size\":200,\"motif_shape\":\"circle\",\"ray_colour\":\"#ff0000\",\"background_colour\":\"#ffff00\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedSunburst media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedSunburst);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_circular_arrow_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "circular-arrow-1",
        "kind": "GeneratedCircularArrow",
        "source": "{\"generator\":\"circular-arrow\",\"radius\":100,\"line_width\":20,\"head_size\":50,\"angle_degrees\":260,\"centre_angle_degrees\":0,\"head_shape\":\"triangle\",\"show_tail_head\":false,\"flip_vertical\":false,\"flip_horizontal\":false,\"arrow_colour\":\"#ffff00\"}",
        "width": 200,
        "height": 200
    }))
    .expect("GeneratedCircularArrow media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedCircularArrow);
    assert_eq!(media.width, 200);
    assert_eq!(media.height, 200);
}

#[test]
fn rust_core_accepts_generated_triangle_bracket_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "triangle-bracket-1",
        "kind": "GeneratedTriangleBracket",
        "source": "{\"generator\":\"triangle-bracket\",\"bracket_width\":100,\"angle_degrees\":120,\"arm_length\":50,\"offset_distance\":0,\"bracket_colour\":\"#ffffff\"}",
        "width": 160,
        "height": 100
    }))
    .expect("GeneratedTriangleBracket media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedTriangleBracket);
    assert_eq!(media.width, 160);
    assert_eq!(media.height, 100);
}

#[test]
fn rust_core_accepts_generated_tartan_check_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "tartan-check-1",
        "kind": "GeneratedTartanCheck",
        "source": "{\"generator\":\"tartan-check\",\"tile_size\":100,\"blur_radius\":1,\"base_colour\":\"#143e10\",\"stripe_colour_a\":\"#a81616\",\"stripe_colour_b\":\"#c9c526\",\"line_colour\":\"#000000\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedTartanCheck media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedTartanCheck);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_houndstooth_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "houndstooth-1",
        "kind": "GeneratedHoundstooth",
        "source": "{\"generator\":\"houndstooth\",\"pattern_size\":50,\"foreground_colour\":\"#000000\",\"background_colour\":\"#ffffff\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedHoundstooth media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedHoundstooth);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_yagasuri_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "yagasuri-1",
        "kind": "GeneratedYagasuri",
        "source": "{\"generator\":\"yagasuri\",\"arrow_width\":15,\"arrow_height\":65,\"line_width\":2,\"staggered\":true,\"foreground_colour\":\"#000000\",\"background_colour\":\"#ffffff\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedYagasuri media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedYagasuri);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_paper_airplane_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "paper-airplane-1",
        "kind": "GeneratedPaperAirplane",
        "source": "{\"generator\":\"paper-airplane\",\"body_length\":200,\"wing_width\":80,\"fold_height\":50,\"gap\":50,\"follow_motion_direction\":false,\"axis_mode\":0,\"fill_colour\":\"#ffffff\"}",
        "width": 320,
        "height": 240
    }))
    .expect("GeneratedPaperAirplane media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedPaperAirplane);
    assert_eq!(media.width, 320);
    assert_eq!(media.height, 240);
}

#[test]
fn rust_core_accepts_generated_asanoha_pattern_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "asanoha-pattern-1",
        "kind": "GeneratedAsanohaPattern",
        "source": "{\"generator\":\"asanoha-pattern\",\"pattern_size\":50,\"line_width\":2,\"foreground_colour\":\"#000000\",\"background_colour\":\"#ffffff\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedAsanohaPattern media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedAsanohaPattern);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}
