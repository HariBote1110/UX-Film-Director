use serde::Deserialize;

pub(crate) fn parse_hex_colour_source(source: &str) -> Result<[u8; 3], String> {
    let source = source.trim();
    let Some(hex) = source.strip_prefix('#') else {
        return Err("source must be a #rrggbb hex colour".to_string());
    };
    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("source must be a #rrggbb hex colour".to_string());
    }

    let red = u8::from_str_radix(&hex[0..2], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let green = u8::from_str_radix(&hex[2..4], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let blue = u8::from_str_radix(&hex[4..6], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;

    Ok([red, green, blue])
}

pub(crate) fn validate_generated_barcode_source(
    source: &GeneratedBarcodeSource,
) -> Result<(), String> {
    if source.generator != "barcode-t" {
        return Err("generator must be barcode-t".to_string());
    }
    if source.data.is_empty() || source.data.chars().count() > 128 {
        return Err("data length must be 1..128".to_string());
    }
    if source.minimum_bar_width == 0 || source.minimum_bar_width > 32 {
        return Err("minimum_bar_width must be 1..32".to_string());
    }
    if source.horizontal_margin > 1000 {
        return Err("horizontal_margin must be 0..1000".to_string());
    }
    if source.vertical_margin > 1000 {
        return Err("vertical_margin must be 0..1000".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_puzzle_piece_source(
    source: &GeneratedPuzzlePieceSource,
) -> Result<(), String> {
    if source.generator != "puzzle-piece" {
        return Err("generator must be puzzle-piece".to_string());
    }
    if source.size == 0 || source.size > 2000 {
        return Err("size must be 1..2000".to_string());
    }
    if source.shape_variant == 0 || source.shape_variant > 22 {
        return Err("shape_variant must be 1..22".to_string());
    }
    if source.connector_mode != "convex" && source.connector_mode != "concave" {
        return Err("connector_mode must be convex or concave".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_colour_wheel_source(
    source: &GeneratedColourWheelSource,
) -> Result<(), String> {
    if source.generator != "colour-wheel" {
        return Err("generator must be colour-wheel".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if !source.saturation.is_finite() || source.saturation < 0.0 || source.saturation > 100.0 {
        return Err("saturation must be 0..100".to_string());
    }
    if !source.brightness.is_finite() || source.brightness < 0.0 || source.brightness > 100.0 {
        return Err("brightness must be 0..100".to_string());
    }
    if !source.ring_width_percent.is_finite()
        || source.ring_width_percent <= 0.0
        || source.ring_width_percent > 100.0
    {
        return Err("ring_width_percent must be 0..100".to_string());
    }
    if source.segment_count < 3 || source.segment_count > 360 {
        return Err("segment_count must be 3..360".to_string());
    }
    Ok(())
}

pub(crate) fn validate_generated_gourd_source(source: &GeneratedGourdSource) -> Result<(), String> {
    if source.generator != "gourd-tm" {
        return Err("generator must be gourd-tm".to_string());
    }
    if source.body_radius == 0 || source.body_radius > 2000 {
        return Err("body_radius must be 1..2000".to_string());
    }
    if source.body_width == 0 || source.body_width > 4000 {
        return Err("body_width must be 1..4000".to_string());
    }
    if source.waist_radius > 2000 {
        return Err("waist_radius must be 0..2000".to_string());
    }
    if !source.squash_percent.is_finite()
        || source.squash_percent < 0.0
        || source.squash_percent > 100.0
    {
        return Err("squash_percent must be 0..100".to_string());
    }
    if source.repeat_count == 0 || source.repeat_count > 36 {
        return Err("repeat_count must be 1..36".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_gear_source(source: &GeneratedGearSource) -> Result<(), String> {
    if source.generator != "gear-t" {
        return Err("generator must be gear-t".to_string());
    }
    if source.outer_radius == 0 || source.outer_radius > 2000 {
        return Err("outer_radius must be 1..2000".to_string());
    }
    if !source.inner_radius_percent.is_finite()
        || source.inner_radius_percent < 0.0
        || source.inner_radius_percent >= 100.0
    {
        return Err("inner_radius_percent must be 0..<100".to_string());
    }
    if source.tooth_count < 3 || source.tooth_count > 240 {
        return Err("tooth_count must be 3..240".to_string());
    }
    if !source.tooth_depth_percent.is_finite()
        || source.tooth_depth_percent <= 0.0
        || source.tooth_depth_percent > 95.0
    {
        return Err("tooth_depth_percent must be 0..95".to_string());
    }
    if !source.tooth_skew_percent.is_finite()
        || source.tooth_skew_percent < -100.0
        || source.tooth_skew_percent > 100.0
    {
        return Err("tooth_skew_percent must be -100..100".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_track_bar_source(
    source: &GeneratedTrackBarSource,
) -> Result<(), String> {
    if source.generator != "custom-track-bar" {
        return Err("generator must be custom-track-bar".to_string());
    }
    if source.track_values.len() != 4 {
        return Err("track_values must contain 4 values".to_string());
    }
    if source.track_ranges.len() != 4 {
        return Err("track_ranges must contain 4 ranges".to_string());
    }
    if source.labels.len() != 4 {
        return Err("labels must contain 4 values".to_string());
    }
    if source.track_values.iter().any(|value| !value.is_finite()) {
        return Err("track_values must be finite".to_string());
    }
    for range in &source.track_ranges {
        if !range[0].is_finite()
            || !range[1].is_finite()
            || (range[0] - range[1]).abs() < f32::EPSILON
        {
            return Err("track_ranges must be finite non-zero ranges".to_string());
        }
    }
    if source.labels.iter().any(|label| label.chars().count() > 64) {
        return Err("labels must be at most 64 characters".to_string());
    }
    if !source.background_opacity.is_finite()
        || source.background_opacity < 0.0
        || source.background_opacity > 1.0
    {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.bar_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_pie_chart_source(
    source: &GeneratedPieChartSource,
) -> Result<(), String> {
    if source.generator != "pie-sheet-graph" {
        return Err("generator must be pie-sheet-graph".to_string());
    }
    if source.values.is_empty() || source.values.len() > 64 {
        return Err("values must contain 1..64 values".to_string());
    }
    if source
        .values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
    {
        return Err("values must be finite non-negative numbers".to_string());
    }
    if source.values.iter().all(|value| *value <= f32::EPSILON) {
        return Err("values must contain at least one positive value".to_string());
    }
    if source.sort_mode != "none"
        && source.sort_mode != "descending"
        && source.sort_mode != "ascending"
    {
        return Err("sort_mode must be none, descending, or ascending".to_string());
    }
    if source.label_mode != "none"
        && source.label_mode != "percentage"
        && source.label_mode != "input"
    {
        return Err("label_mode must be none, percentage, or input".to_string());
    }
    if !source.progress_percent.is_finite()
        || source.progress_percent < 0.0
        || source.progress_percent > 100.0
    {
        return Err("progress_percent must be 0..100".to_string());
    }
    if !source.stroke_width.is_finite() || source.stroke_width <= 0.0 {
        return Err("stroke_width must be positive".to_string());
    }
    if source.slice_colours.is_empty() || source.slice_colours.len() > 64 {
        return Err("slice_colours must contain 1..64 colours".to_string());
    }
    for colour in &source.slice_colours {
        parse_hex_colour_source(colour)?;
    }
    Ok(())
}

pub(crate) fn validate_generated_histogram_source(
    source: &GeneratedHistogramSource,
) -> Result<(), String> {
    if source.generator != "simple-histogram" {
        return Err("generator must be simple-histogram".to_string());
    }
    if source.bin_values.is_empty() || source.bin_values.len() > 256 {
        return Err("bin_values must contain 1..256 values".to_string());
    }
    if source
        .bin_values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0 || *value > 1.0)
    {
        return Err("bin_values must be finite numbers in 0..1".to_string());
    }
    if !source.height_scale_percent.is_finite()
        || source.height_scale_percent <= 0.0
        || source.height_scale_percent > 1000.0
    {
        return Err("height_scale_percent must be 1..1000".to_string());
    }
    if !source.line_width.is_finite() || source.line_width <= 0.0 {
        return Err("line_width must be positive".to_string());
    }
    if !source.show_luminance && !source.show_red && !source.show_green && !source.show_blue {
        return Err("at least one histogram channel must be visible".to_string());
    }
    if source.channel_colours.len() != 4 {
        return Err("channel_colours must contain 4 colours".to_string());
    }
    for colour in &source.channel_colours {
        parse_hex_colour_source(colour)?;
    }
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_sunburst_source(
    source: &GeneratedSunburstSource,
) -> Result<(), String> {
    if source.generator != "sunrise" {
        return Err("generator must be sunrise".to_string());
    }
    if source.ray_count == 0 || source.ray_count > 360 {
        return Err("ray_count must be 1..360".to_string());
    }
    if !source.ray_coverage_percent.is_finite()
        || source.ray_coverage_percent < 0.0
        || source.ray_coverage_percent > 100.0
    {
        return Err("ray_coverage_percent must be 0..100".to_string());
    }
    if !source.rotation_offset_degrees.is_finite() {
        return Err("rotation_offset_degrees must be finite".to_string());
    }
    if !source.centre_x_percent.is_finite()
        || source.centre_x_percent < -100.0
        || source.centre_x_percent > 200.0
        || !source.centre_y_percent.is_finite()
        || source.centre_y_percent < -100.0
        || source.centre_y_percent > 200.0
    {
        return Err("centre percentages must be -100..200".to_string());
    }
    if source.motif_shape != "circle" && source.motif_shape != "rect" {
        return Err("motif_shape must be circle or rect".to_string());
    }
    parse_hex_colour_source(&source.ray_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_circular_arrow_source(
    source: &GeneratedCircularArrowSource,
) -> Result<(), String> {
    if source.generator != "circular-arrow" {
        return Err("generator must be circular-arrow".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if source.line_width == 0 || source.line_width > 1000 {
        return Err("line_width must be 1..1000".to_string());
    }
    if source.head_size > 1000 {
        return Err("head_size must be 0..1000".to_string());
    }
    if !source.angle_degrees.is_finite()
        || source.angle_degrees < 0.0
        || source.angle_degrees > 360.0
    {
        return Err("angle_degrees must be 0..360".to_string());
    }
    if !source.centre_angle_degrees.is_finite() {
        return Err("centre_angle_degrees must be finite".to_string());
    }
    if source.head_shape != "triangle" && source.head_shape != "circle" {
        return Err("head_shape must be triangle or circle".to_string());
    }
    parse_hex_colour_source(&source.arrow_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_triangle_bracket_source(
    source: &GeneratedTriangleBracketSource,
) -> Result<(), String> {
    if source.generator != "triangle-bracket" {
        return Err("generator must be triangle-bracket".to_string());
    }
    if source.bracket_width == 0 || source.bracket_width > 2000 {
        return Err("bracket_width must be 1..2000".to_string());
    }
    if !source.angle_degrees.is_finite()
        || source.angle_degrees < 1.0
        || source.angle_degrees > 180.0
    {
        return Err("angle_degrees must be 1..180".to_string());
    }
    if source.arm_length > 2000 {
        return Err("arm_length must be 0..2000".to_string());
    }
    if source.offset_distance < -10000 || source.offset_distance > 10000 {
        return Err("offset_distance must be -10000..10000".to_string());
    }
    parse_hex_colour_source(&source.bracket_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_tartan_check_source(
    source: &GeneratedTartanCheckSource,
) -> Result<(), String> {
    if source.generator != "tartan-check" {
        return Err("generator must be tartan-check".to_string());
    }
    if source.tile_size < 10 || source.tile_size > 800 {
        return Err("tile_size must be 10..800".to_string());
    }
    if source.blur_radius > 300 {
        return Err("blur_radius must be 0..300".to_string());
    }
    parse_hex_colour_source(&source.base_colour)?;
    parse_hex_colour_source(&source.stripe_colour_a)?;
    parse_hex_colour_source(&source.stripe_colour_b)?;
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_houndstooth_source(
    source: &GeneratedHoundstoothSource,
) -> Result<(), String> {
    if source.generator != "houndstooth" {
        return Err("generator must be houndstooth".to_string());
    }
    if source.pattern_size < 10 || source.pattern_size > 200 {
        return Err("pattern_size must be 10..200".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_yagasuri_source(
    source: &GeneratedYagasuriSource,
) -> Result<(), String> {
    if source.generator != "yagasuri" {
        return Err("generator must be yagasuri".to_string());
    }
    if source.arrow_width == 0 || source.arrow_width > 500 {
        return Err("arrow_width must be 1..500".to_string());
    }
    if source.arrow_height == 0 || source.arrow_height > 500 {
        return Err("arrow_height must be 1..500".to_string());
    }
    if source.line_width > 100 {
        return Err("line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_paper_airplane_source(
    source: &GeneratedPaperAirplaneSource,
) -> Result<(), String> {
    if source.generator != "paper-airplane" {
        return Err("generator must be paper-airplane".to_string());
    }
    if source.body_length == 0 || source.body_length > 2000 {
        return Err("body_length must be 1..2000".to_string());
    }
    if source.wing_width > 1000 {
        return Err("wing_width must be 0..1000".to_string());
    }
    if source.fold_height > 1000 {
        return Err("fold_height must be 0..1000".to_string());
    }
    if source.gap > 1000 {
        return Err("gap must be 0..1000".to_string());
    }
    if source.axis_mode > 1 {
        return Err("axis_mode must be 0 or 1".to_string());
    }
    let _ = source.follow_motion_direction;
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_asanoha_pattern_source(
    source: &GeneratedAsanohaPatternSource,
) -> Result<(), String> {
    if source.generator != "asanoha-pattern" {
        return Err("generator must be asanoha-pattern".to_string());
    }
    if source.pattern_size < 10 || source.pattern_size > 500 {
        return Err("pattern_size must be 10..500".to_string());
    }
    if source.line_width > 50 {
        return Err("line_width must be 0..50".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_focus_lines_plus_source(
    source: &GeneratedFocusLinesPlusSource,
) -> Result<(), String> {
    if source.generator != "focus-lines-plus" {
        return Err("generator must be focus-lines-plus".to_string());
    }
    if !source.ray_width.is_finite() || source.ray_width < 0.1 || source.ray_width > 10.0 {
        return Err("ray_width must be 0.1..10".to_string());
    }
    if !source.gap.is_finite() || source.gap < 1.0 || source.gap > 20.0 {
        return Err("gap must be 1..20".to_string());
    }
    if !source.centre_radius.is_finite()
        || source.centre_radius < 0.0
        || source.centre_radius > 800.0
    {
        return Err("centre_radius must be 0..800".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || source.rotation_degrees < -720.0
        || source.rotation_degrees > 720.0
    {
        return Err("rotation_degrees must be -720..720".to_string());
    }
    if !source.centre_x.is_finite() || !source.centre_y.is_finite() {
        return Err("centre coordinates must be finite".to_string());
    }
    if !source.centre_jitter_percent.is_finite()
        || source.centre_jitter_percent < 0.0
        || source.centre_jitter_percent > 100.0
    {
        return Err("centre_jitter_percent must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_random_line_ex_source(
    source: &GeneratedRandomLineExSource,
) -> Result<(), String> {
    if source.generator != "random-line-ex" {
        return Err("generator must be random-line-ex".to_string());
    }
    if source.line_count == 0 || source.line_count > 100 {
        return Err("line_count must be 1..100".to_string());
    }
    if !source.line_width.is_finite() || source.line_width < 0.0 || source.line_width > 2000.0 {
        return Err("line_width must be 0..2000".to_string());
    }
    if source.threshold > 255 {
        return Err("threshold must be 0..255".to_string());
    }
    if source.noise_cell_size > 50 {
        return Err("noise_cell_size must be 0..50".to_string());
    }
    if !source.width_variance.is_finite()
        || source.width_variance < 0.0
        || source.width_variance > 2000.0
    {
        return Err("width_variance must be 0..2000".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_hologram_source(
    source: &GeneratedHologramSource,
) -> Result<(), String> {
    if source.generator != "hologram" {
        return Err("generator must be hologram".to_string());
    }
    if source.tile_size < 10 || source.tile_size > 1000 {
        return Err("tile_size must be 10..1000".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || source.rotation_degrees < -720.0
        || source.rotation_degrees > 720.0
    {
        return Err("rotation_degrees must be -720..720".to_string());
    }
    if !source.gradient_angle_degrees.is_finite()
        || source.gradient_angle_degrees < -720.0
        || source.gradient_angle_degrees > 720.0
    {
        return Err("gradient_angle_degrees must be -720..720".to_string());
    }
    if source.colour_mode > 2 {
        return Err("colour_mode must be 0..2".to_string());
    }
    parse_hex_colour_source(&source.tint_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_protractor_source(
    source: &GeneratedProtractorSource,
) -> Result<(), String> {
    if source.generator != "protractor" {
        return Err("generator must be protractor".to_string());
    }
    if source.radius == 0 || source.radius > 2000 {
        return Err("radius must be 1..2000".to_string());
    }
    if !source.measured_angle_degrees.is_finite()
        || source.measured_angle_degrees < 0.0
        || source.measured_angle_degrees > 180.0
    {
        return Err("measured_angle_degrees must be 0..180".to_string());
    }
    if source.tick_step_degrees == 0 || source.tick_step_degrees > 90 {
        return Err("tick_step_degrees must be 1..90".to_string());
    }
    if source.major_tick_step_degrees == 0 || source.major_tick_step_degrees > 180 {
        return Err("major_tick_step_degrees must be 1..180".to_string());
    }
    if source.decimal_places > 5 {
        return Err("decimal_places must be 0..5".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    parse_hex_colour_source(&source.text_colour)?;
    parse_hex_colour_source(&source.shadow_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_shaking_polygon_source(
    source: &GeneratedShakingPolygonSource,
) -> Result<(), String> {
    if source.generator != "shaking-polygon" {
        return Err("generator must be shaking-polygon".to_string());
    }
    if source.line_width == 0 || source.line_width > 100 {
        return Err("line_width must be 1..100".to_string());
    }
    if source.vertex_count < 2 || source.vertex_count > 16 {
        return Err("vertex_count must be 2..16".to_string());
    }
    if source.fixed_diameter > 2000 {
        return Err("fixed_diameter must be 0..2000".to_string());
    }
    if !source.vertical_distortion_percent.is_finite()
        || source.vertical_distortion_percent < -100.0
        || source.vertical_distortion_percent > 100.0
    {
        return Err("vertical_distortion_percent must be -100..100".to_string());
    }
    if source.repeat_count == 0 || source.repeat_count > 100 {
        return Err("repeat_count must be 1..100".to_string());
    }
    if source.repeat_frequency == 0 {
        return Err("repeat_frequency must be at least 1".to_string());
    }
    if !source.jitter_range.is_finite() || source.jitter_range < 0.0 || source.jitter_range > 2000.0
    {
        return Err("jitter_range must be 0..2000".to_string());
    }
    if source.jitter_interval == 0 {
        return Err("jitter_interval must be at least 1".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    Ok(())
}

pub(crate) fn validate_generated_tone_curve_source(
    source: &GeneratedToneCurveSource,
) -> Result<(), String> {
    if source.generator != "simple-tone-curve" {
        return Err("generator must be simple-tone-curve".to_string());
    }
    if source.grid_divisions == 0 || source.grid_divisions > 16 {
        return Err("grid_divisions must be 1..16".to_string());
    }
    if source.line_width == 0 || source.line_width > 100 {
        return Err("line_width must be 1..100".to_string());
    }
    if source.curve_points.len() < 2 || source.curve_points.len() > 64 {
        return Err("curve_points length must be 2..64".to_string());
    }
    if !source
        .curve_points
        .iter()
        .all(|point| point.is_finite() && *point >= 0.0 && *point <= 1.0)
    {
        return Err("curve_points must be finite values in 0..1".to_string());
    }
    parse_hex_colour_source(&source.curve_colour)?;
    parse_hex_colour_source(&source.grid_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGradientSource {
    #[serde(rename = "type")]
    pub(crate) gradient_type: String,
    pub(crate) colours: Vec<String>,
    #[serde(default)]
    pub(crate) stops: Vec<f32>,
    #[serde(default)]
    pub(crate) direction: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedParticleSource {
    pub(crate) generator: String,
    pub(crate) seed: u64,
    pub(crate) particle_count: u32,
    pub(crate) spread: f32,
    pub(crate) speed: f32,
    pub(crate) size: f32,
    pub(crate) colour: String,
    pub(crate) lifetime_seconds: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedBarcodeSource {
    pub(crate) generator: String,
    pub(crate) data: String,
    pub(crate) minimum_bar_width: u32,
    pub(crate) horizontal_margin: u32,
    pub(crate) vertical_margin: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPuzzlePieceSource {
    pub(crate) generator: String,
    pub(crate) size: u32,
    pub(crate) shape_variant: u32,
    pub(crate) connector_mode: String,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedColourWheelSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) saturation: f32,
    pub(crate) brightness: f32,
    pub(crate) ring_width_percent: f32,
    pub(crate) segment_count: u32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGourdSource {
    pub(crate) generator: String,
    pub(crate) body_radius: u32,
    pub(crate) body_width: u32,
    pub(crate) waist_radius: u32,
    pub(crate) squash_percent: f32,
    pub(crate) repeat_count: u32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGearSource {
    pub(crate) generator: String,
    pub(crate) outer_radius: u32,
    pub(crate) inner_radius_percent: f32,
    pub(crate) tooth_count: u32,
    pub(crate) tooth_depth_percent: f32,
    pub(crate) tooth_skew_percent: f32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTrackBarSource {
    pub(crate) generator: String,
    pub(crate) track_values: Vec<f32>,
    pub(crate) track_ranges: Vec<[f32; 2]>,
    pub(crate) labels: Vec<String>,
    pub(crate) bar_colour: String,
    pub(crate) background_opacity: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPieChartSource {
    pub(crate) generator: String,
    pub(crate) values: Vec<f32>,
    pub(crate) sort_mode: String,
    pub(crate) normalise_to_hundred: bool,
    pub(crate) label_mode: String,
    pub(crate) progress_percent: f32,
    pub(crate) stroke_width: f32,
    pub(crate) slice_colours: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHistogramSource {
    pub(crate) generator: String,
    pub(crate) bin_values: Vec<f32>,
    pub(crate) height_scale_percent: f32,
    pub(crate) line_width: f32,
    pub(crate) show_luminance: bool,
    pub(crate) show_red: bool,
    pub(crate) show_green: bool,
    pub(crate) show_blue: bool,
    pub(crate) channel_colours: Vec<String>,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSunburstSource {
    pub(crate) generator: String,
    pub(crate) ray_count: u32,
    pub(crate) ray_coverage_percent: f32,
    pub(crate) rotation_offset_degrees: f32,
    pub(crate) centre_x_percent: f32,
    pub(crate) centre_y_percent: f32,
    pub(crate) motif_size: u32,
    pub(crate) motif_shape: String,
    pub(crate) ray_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedCircularArrowSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) line_width: u32,
    pub(crate) head_size: u32,
    pub(crate) angle_degrees: f32,
    pub(crate) centre_angle_degrees: f32,
    pub(crate) head_shape: String,
    pub(crate) show_tail_head: bool,
    pub(crate) flip_vertical: bool,
    pub(crate) flip_horizontal: bool,
    pub(crate) arrow_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTriangleBracketSource {
    pub(crate) generator: String,
    pub(crate) bracket_width: u32,
    pub(crate) angle_degrees: f32,
    pub(crate) arm_length: u32,
    pub(crate) offset_distance: i32,
    pub(crate) bracket_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTartanCheckSource {
    pub(crate) generator: String,
    pub(crate) tile_size: u32,
    pub(crate) blur_radius: u32,
    pub(crate) base_colour: String,
    pub(crate) stripe_colour_a: String,
    pub(crate) stripe_colour_b: String,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHoundstoothSource {
    pub(crate) generator: String,
    pub(crate) pattern_size: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedYagasuriSource {
    pub(crate) generator: String,
    pub(crate) arrow_width: u32,
    pub(crate) arrow_height: u32,
    pub(crate) line_width: u32,
    pub(crate) staggered: bool,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPaperAirplaneSource {
    pub(crate) generator: String,
    pub(crate) body_length: u32,
    pub(crate) wing_width: u32,
    pub(crate) fold_height: u32,
    pub(crate) gap: u32,
    pub(crate) follow_motion_direction: bool,
    pub(crate) axis_mode: u32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedAsanohaPatternSource {
    pub(crate) generator: String,
    pub(crate) pattern_size: u32,
    pub(crate) line_width: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedFocusLinesPlusSource {
    pub(crate) generator: String,
    pub(crate) ray_width: f32,
    pub(crate) gap: f32,
    pub(crate) centre_radius: f32,
    pub(crate) rotation_degrees: f32,
    pub(crate) centre_x: f32,
    pub(crate) centre_y: f32,
    pub(crate) centre_jitter_percent: f32,
    pub(crate) seed: i64,
    pub(crate) keyframe_interval: u64,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedRandomLineExSource {
    pub(crate) generator: String,
    pub(crate) line_count: u32,
    pub(crate) line_width: f32,
    pub(crate) threshold: u32,
    pub(crate) noise_cell_size: u32,
    pub(crate) width_variance: f32,
    pub(crate) seed: i64,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHologramSource {
    pub(crate) generator: String,
    pub(crate) tile_size: u32,
    pub(crate) rotation_degrees: f32,
    pub(crate) gradient_angle_degrees: f32,
    pub(crate) colour_mode: u32,
    pub(crate) tint_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedProtractorSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) measured_angle_degrees: f32,
    pub(crate) tick_step_degrees: u32,
    pub(crate) major_tick_step_degrees: u32,
    pub(crate) decimal_places: u32,
    pub(crate) line_colour: String,
    pub(crate) text_colour: String,
    pub(crate) shadow_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedShakingPolygonSource {
    pub(crate) generator: String,
    pub(crate) line_width: u32,
    pub(crate) vertex_count: u32,
    pub(crate) fixed_diameter: u32,
    pub(crate) vertical_distortion_percent: f32,
    pub(crate) repeat_count: u32,
    pub(crate) repeat_frequency: u32,
    pub(crate) fill: bool,
    pub(crate) jitter_range: f32,
    pub(crate) jitter_interval: u32,
    pub(crate) stepped: bool,
    pub(crate) colour: String,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedToneCurveSource {
    pub(crate) generator: String,
    pub(crate) grid_divisions: u32,
    pub(crate) line_width: u32,
    pub(crate) curve_points: Vec<f32>,
    pub(crate) curve_colour: String,
    pub(crate) grid_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGetColorDotsSource {
    pub(crate) generator: String,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) dot_size: f32,
    pub(crate) dot_shape: Option<String>,
    pub(crate) stroke_width: Option<f32>,
    pub(crate) size_influence: f32,
    pub(crate) luminance_influence: f32,
    pub(crate) hue_shift_degrees: f32,
    pub(crate) alternate_rows: bool,
    pub(crate) foreground_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_colour: String,
    pub(crate) source_image: Option<String>,
    pub(crate) source_active_layer_ids: Option<Vec<String>>,
    pub(crate) sample_strength: Option<f32>,
    pub(crate) sample_hue_shift_degrees: Option<f32>,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHksyCheckerGridSource {
    pub(crate) generator: String,
    pub(crate) pattern: Option<String>,
    pub(crate) cell_size: u32,
    pub(crate) line_width: u32,
    pub(crate) checker_enabled: bool,
    pub(crate) grid_enabled: bool,
    pub(crate) foreground_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_colour: String,
    pub(crate) palette_colours: Option<Vec<String>>,
    pub(crate) separate_interval: Option<u32>,
    pub(crate) separate_line_width: Option<u32>,
    pub(crate) anchor_points: Option<Vec<GeneratedHksyAnchorPoint>>,
    pub(crate) round_caps: Option<bool>,
    pub(crate) max_join_distance: Option<f32>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
pub(crate) struct GeneratedHksyAnchorPoint {
    pub(crate) x: f32,
    pub(crate) y: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedRegionFrameSource {
    pub(crate) generator: String,
    pub(crate) line_width: f32,
    #[serde(default = "default_region_frame_shape")]
    pub(crate) shape: String,
    #[serde(default = "default_region_frame_corner_cut")]
    pub(crate) corner_cut: f32,
    pub(crate) extra_width: f32,
    pub(crate) extra_height: f32,
    pub(crate) background_opacity: f32,
    pub(crate) frame_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSimpleTubeSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) depth: f32,
    pub(crate) segments: u32,
    pub(crate) rings: u32,
    pub(crate) twist_degrees: f32,
    pub(crate) random_amount: f32,
    pub(crate) stroke_width: f32,
    pub(crate) colour: String,
    pub(crate) secondary_colour: String,
    #[serde(default = "default_simple_tube_colour_pattern")]
    pub(crate) colour_pattern: String,
    #[serde(default)]
    pub(crate) fog_strength: f32,
    #[serde(default = "default_simple_tube_fog_colour")]
    pub(crate) fog_colour: String,
    pub(crate) seed: i64,
    pub(crate) torus: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSphereDotsSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) rotation_degrees: f32,
    pub(crate) offset_degrees: f32,
    pub(crate) luminance_influence: f32,
    pub(crate) point_size: f32,
    pub(crate) latitude_line_width: f32,
    pub(crate) colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) seed: i64,
    pub(crate) plane_mode: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSphericalFieldSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) strength: f32,
    pub(crate) colour_amount: f32,
    pub(crate) alpha_amount: f32,
    pub(crate) line_width: f32,
    pub(crate) ring_count: u32,
    pub(crate) vector_count: u32,
    pub(crate) field_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_opacity: f32,
    pub(crate) container: bool,
    pub(crate) seed: i64,
}

pub(crate) fn default_simple_tube_colour_pattern() -> String {
    "single".to_string()
}

pub(crate) fn default_simple_tube_fog_colour() -> String {
    "#ffffff".to_string()
}

pub(crate) fn default_region_frame_shape() -> String {
    "rectangle".to_string()
}

pub(crate) fn default_region_frame_corner_cut() -> f32 {
    20.0
}
