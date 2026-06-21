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

#[test]
fn rust_core_accepts_generated_focus_lines_plus_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "focus-lines-plus-1",
        "kind": "GeneratedFocusLinesPlus",
        "source": "{\"generator\":\"focus-lines-plus\",\"ray_width\":1,\"gap\":5,\"centre_radius\":100,\"rotation_degrees\":0,\"centre_x\":400,\"centre_y\":225,\"centre_jitter_percent\":20,\"seed\":0,\"keyframe_interval\":0,\"line_colour\":\"#ffffff\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedFocusLinesPlus media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedFocusLinesPlus);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_random_line_ex_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "random-line-ex-1",
        "kind": "GeneratedRandomLineEx",
        "source": "{\"generator\":\"random-line-ex\",\"line_count\":3,\"line_width\":6,\"threshold\":128,\"noise_cell_size\":12,\"width_variance\":0,\"seed\":0,\"line_colour\":\"#ffffff\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedRandomLineEx media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedRandomLineEx);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_hologram_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "hologram-1",
        "kind": "GeneratedHologram",
        "source": "{\"generator\":\"hologram\",\"tile_size\":80,\"rotation_degrees\":0,\"gradient_angle_degrees\":-60,\"colour_mode\":1,\"tint_colour\":\"#ffffff\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedHologram media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedHologram);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_protractor_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "protractor-1",
        "kind": "GeneratedProtractor",
        "source": "{\"generator\":\"protractor\",\"radius\":180,\"measured_angle_degrees\":90,\"tick_step_degrees\":10,\"major_tick_step_degrees\":30,\"decimal_places\":1,\"line_colour\":\"#ffffff\",\"text_colour\":\"#ffffff\",\"shadow_colour\":\"#000000\"}",
        "width": 420,
        "height": 240
    }))
    .expect("GeneratedProtractor media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedProtractor);
    assert_eq!(media.width, 420);
    assert_eq!(media.height, 240);
}

#[test]
fn rust_core_accepts_generated_shaking_polygon_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "shaking-polygon-1",
        "kind": "GeneratedShakingPolygon",
        "source": "{\"generator\":\"shaking-polygon\",\"line_width\":20,\"vertex_count\":3,\"fixed_diameter\":260,\"vertical_distortion_percent\":0,\"repeat_count\":1,\"repeat_frequency\":1,\"fill\":false,\"jitter_range\":20,\"jitter_interval\":10,\"stepped\":false,\"colour\":\"#ffffff\",\"seed\":0}",
        "width": 360,
        "height": 360
    }))
    .expect("GeneratedShakingPolygon media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedShakingPolygon);
    assert_eq!(media.width, 360);
    assert_eq!(media.height, 360);
}

#[test]
fn rust_core_accepts_generated_tone_curve_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "tone-curve-1",
        "kind": "GeneratedToneCurve",
        "source": "{\"generator\":\"simple-tone-curve\",\"grid_divisions\":4,\"line_width\":3,\"curve_points\":[0,0.16,0.42,0.7,1],\"curve_colour\":\"#ffffff\",\"grid_colour\":\"#333333\",\"background_colour\":\"#000000\"}",
        "width": 360,
        "height": 360
    }))
    .expect("GeneratedToneCurve media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedToneCurve);
    assert_eq!(media.width, 360);
    assert_eq!(media.height, 360);
}

#[test]
fn rust_core_accepts_generated_hksy_checker_grid_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "hksy-checker-grid-1",
        "kind": "GeneratedHksyCheckerGrid",
        "source": "{\"generator\":\"hksy-checker-grid\",\"cell_size\":50,\"line_width\":2,\"checker_enabled\":true,\"grid_enabled\":true,\"foreground_colour\":\"#ffffff\",\"secondary_colour\":\"#333333\",\"background_colour\":\"#000000\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedHksyCheckerGrid media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedHksyCheckerGrid);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_getcolor_dots_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "getcolor-dot-field-1",
        "kind": "GeneratedGetColorDots",
        "source": "{\"generator\":\"getcolor-v2r-dot-field\",\"columns\":32,\"rows\":18,\"dot_size\":14,\"size_influence\":0.65,\"luminance_influence\":0.7,\"hue_shift_degrees\":0,\"alternate_rows\":true,\"foreground_colour\":\"#ffffff\",\"secondary_colour\":\"#36c2ff\",\"background_colour\":\"#000000\",\"seed\":93}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedGetColorDots media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedGetColorDots);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_region_frame_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "region-frame-1",
        "kind": "GeneratedRegionFrame",
        "source": "{\"generator\":\"region-frame-93\",\"line_width\":10,\"extra_width\":0,\"extra_height\":0,\"background_opacity\":0.2,\"frame_colour\":\"#ffffff\",\"background_colour\":\"#ccccff\"}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedRegionFrame media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedRegionFrame);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_simple_tube_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "simple-tube-1",
        "kind": "GeneratedSimpleTube",
        "source": "{\"generator\":\"simple-tube-93\",\"radius\":150,\"depth\":280,\"segments\":16,\"rings\":10,\"twist_degrees\":0,\"random_amount\":0,\"stroke_width\":3,\"colour\":\"#0e769f\",\"secondary_colour\":\"#ffffff\",\"seed\":93,\"torus\":false}",
        "width": 800,
        "height": 450
    }))
    .expect("GeneratedSimpleTube media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedSimpleTube);
    assert_eq!(media.width, 800);
    assert_eq!(media.height, 450);
}

#[test]
fn rust_core_accepts_generated_audio_sphere_media_kind_at_the_json_boundary() {
    let media: SceneMediaReference = serde_json::from_value(serde_json::json!({
        "id": "audio-sphere-1",
        "kind": "GeneratedAudioSphere",
        "source": "{\"generator\":\"audio-sphere-93\",\"target_audio_id\":\"audio-1\",\"target_source\":\"/tmp/music.wav\",\"sample_window_seconds\":0.1,\"columns\":16,\"rows\":12,\"base_radius\":170,\"audio_influence\":0.6,\"point_size\":5,\"polygon_size\":0.35,\"random_amount\":0.05,\"colour\":\"#36c2ff\",\"seed\":93}",
        "width": 480,
        "height": 480
    }))
    .expect("GeneratedAudioSphere media kind should deserialize");

    assert_eq!(media.kind, MediaKind::GeneratedAudioSphere);
    assert_eq!(media.width, 480);
    assert_eq!(media.height, 480);
}
