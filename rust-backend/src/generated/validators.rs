use crate::local_media_source_path;

use super::*;

mod chart;
mod decorative;
mod pattern;
mod shape;

pub(crate) use chart::*;
pub(crate) use decorative::*;
pub(crate) use pattern::*;
pub(crate) use shape::*;

pub(crate) fn validate_generated_barcode_source(
    source: &BarcodeObjectFields,
) -> Result<(), String> {
    if source.data.is_empty() || source.data.chars().count() > 128 {
        return Err("data length must be 1..128".to_string());
    }
    if !source.minimum_bar_width.is_finite()
        || source.minimum_bar_width < 1.0
        || source.minimum_bar_width > 32.0
    {
        return Err("minimum_bar_width must be 1..32".to_string());
    }
    if !source.horizontal_margin.is_finite()
        || source.horizontal_margin < 0.0
        || source.horizontal_margin > 1000.0
    {
        return Err("horizontal_margin must be 0..1000".to_string());
    }
    if !source.vertical_margin.is_finite()
        || source.vertical_margin < 0.0
        || source.vertical_margin > 1000.0
    {
        return Err("vertical_margin must be 0..1000".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_colour_wheel_source(
    source: &ColourWheelObjectFields,
) -> Result<(), String> {
    if !source.radius.is_finite() || source.radius < 1.0 || source.radius > 2000.0 {
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

pub(crate) fn validate_generated_paper_airplane_source(
    source: &PaperAirplaneObjectFields,
) -> Result<(), String> {
    if !source.body_length.is_finite() || source.body_length <= 0.0 || source.body_length > 2000.0
    {
        return Err("body_length must be 1..2000".to_string());
    }
    if !source.wing_width.is_finite() || source.wing_width < 0.0 || source.wing_width > 1000.0 {
        return Err("wing_width must be 0..1000".to_string());
    }
    if !source.fold_height.is_finite() || source.fold_height < 0.0 || source.fold_height > 1000.0
    {
        return Err("fold_height must be 0..1000".to_string());
    }
    if !source.gap.is_finite() || source.gap < 0.0 || source.gap > 1000.0 {
        return Err("gap must be 0..1000".to_string());
    }
    if !source.axis_mode.is_finite() || source.axis_mode < 0.0 || source.axis_mode > 1.0 {
        return Err("axis_mode must be 0 or 1".to_string());
    }
    let _ = source.follow_motion_direction;
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_focus_lines_plus_source(
    source: &FocusLinesPlusObjectFields,
) -> Result<(), String> {
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
    source: &RandomLineExObjectFields,
) -> Result<(), String> {
    if source.line_count == 0 || source.line_count > 100 {
        return Err("line_count must be 1..100".to_string());
    }
    if !source.line_width.is_finite() || source.line_width < 0.0 || source.line_width > 2000.0 {
        return Err("line_width must be 0..2000".to_string());
    }
    if !source.threshold.is_finite() || source.threshold < 0.0 || source.threshold > 255.0 {
        return Err("threshold must be 0..255".to_string());
    }
    if !source.noise_cell_size.is_finite()
        || source.noise_cell_size < 0.0
        || source.noise_cell_size > 50.0
    {
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

pub(crate) fn validate_generated_contour_trace_source(
    source: &ContourTraceObjectFields,
) -> Result<(), String> {
    if !source.line_width.is_finite() || source.line_width < 1.0 || source.line_width > 200.0 {
        return Err("line_width must be 1..200".to_string());
    }
    if source.contour_count == 0 || source.contour_count > 64 {
        return Err("contour_count must be 1..64".to_string());
    }
    if !source.jitter_amount.is_finite()
        || source.jitter_amount < 0.0
        || source.jitter_amount > 100.0
    {
        return Err("jitter_amount must be 0..100".to_string());
    }
    if !source.background_opacity.is_finite()
        || source.background_opacity < 0.0
        || source.background_opacity > 1.0
    {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.trace_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_displacement_poly_source(
    source: &DisplacementPolyObjectFields,
) -> Result<(), String> {
    if source.columns == 0 || source.columns > 128 {
        return Err("columns must be 1..128".to_string());
    }
    if source.rows == 0 || source.rows > 128 {
        return Err("rows must be 1..128".to_string());
    }
    if !source.displacement_scale.is_finite()
        || source.displacement_scale < 0.0
        || source.displacement_scale > 1000.0
    {
        return Err("displacement_scale must be 0..1000".to_string());
    }
    if !source.depth_scale.is_finite() || source.depth_scale < 0.0 || source.depth_scale > 1000.0 {
        return Err("depth_scale must be 0..1000".to_string());
    }
    if !source.mesh_opacity.is_finite() || source.mesh_opacity < 0.0 || source.mesh_opacity > 1.0 {
        return Err("mesh_opacity must be 0..1".to_string());
    }
    if !source.fill_opacity.is_finite() || source.fill_opacity < 0.0 || source.fill_opacity > 1.0 {
        return Err("fill_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.line_colour)?;
    parse_hex_colour_source(&source.fill_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_plain_effector_line_source(
    source: &GeneratedPlainEffectorLineSource,
) -> Result<(), String> {
    if !source.radius.is_finite() || source.radius < 1.0 || source.radius > 2000.0 {
        return Err("radius must be 1..2000".to_string());
    }
    if !source.strength.is_finite() || source.strength < -10.0 || source.strength > 10.0 {
        return Err("strength must be -10..10".to_string());
    }
    if !source.randomness.is_finite()
        || source.randomness < -1000.0
        || source.randomness > 1000.0
    {
        return Err("randomness must be -1000..1000".to_string());
    }
    if !source.zoom.is_finite() || source.zoom < -2.0 || source.zoom > 5.0 {
        return Err("zoom must be -2..5".to_string());
    }
    if source.line_count == 0 || source.line_count > 128 {
        return Err("line_count must be 1..128".to_string());
    }
    if !source.line_width.is_finite() || source.line_width < 0.25 || source.line_width > 200.0 {
        return Err("line_width must be 0.25..200".to_string());
    }
    if !source.colour_amount.is_finite()
        || source.colour_amount < 0.0
        || source.colour_amount > 1.0
    {
        return Err("colour_amount must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    Ok(())
}

pub(crate) fn validate_generated_hologram_source(
    source: &GeneratedHologramSource,
) -> Result<(), String> {
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

pub(crate) fn validate_generated_shattered_sphere_source(
    source: &GeneratedShatteredSphereSource,
) -> Result<(), String> {
    if !source.fracture_amount.is_finite()
        || source.fracture_amount < 0.0
        || source.fracture_amount > 5000.0
    {
        return Err("fracture_amount must be 0..5000".to_string());
    }
    if !source.delay.is_finite() || source.delay < 0.0 || source.delay > 1000.0 {
        return Err("delay must be 0..1000".to_string());
    }
    if !source.radius.is_finite() || source.radius < 1.0 || source.radius > 10000.0 {
        return Err("radius must be 1..10000".to_string());
    }
    if !source.limit_distance.is_finite()
        || source.limit_distance < 0.0
        || source.limit_distance > 10000.0
    {
        return Err("limit_distance must be 0..10000".to_string());
    }
    if !source.thickness.is_finite() || source.thickness < 0.0 || source.thickness > 1000.0 {
        return Err("thickness must be 0..1000".to_string());
    }
    if !source.fragment_size.is_finite()
        || source.fragment_size < 1.0
        || source.fragment_size > 1000.0
    {
        return Err("fragment_size must be 1..1000".to_string());
    }
    if !source.random_shape.is_finite() || source.random_shape < 0.0 || source.random_shape > 100.0
    {
        return Err("random_shape must be 0..100".to_string());
    }
    if !source.speed.is_finite() || source.speed < 0.0 || source.speed > 1000.0 {
        return Err("speed must be 0..1000".to_string());
    }
    if !source.impact.is_finite() || source.impact < 0.0 || source.impact > 1000.0 {
        return Err("impact must be 0..1000".to_string());
    }
    if [source.gravity_x, source.gravity_y, source.gravity_z]
        .iter()
        .any(|value| !value.is_finite() || *value < -1000.0 || *value > 1000.0)
    {
        return Err("gravity values must be -1000..1000".to_string());
    }
    if !source.spin.is_finite() || source.spin < 0.0 || source.spin > 1000.0 {
        return Err("spin must be 0..1000".to_string());
    }
    if !source.direction_diffusion.is_finite()
        || source.direction_diffusion < 0.0
        || source.direction_diffusion > 1000.0
    {
        return Err("direction_diffusion must be 0..1000".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    Ok(())
}

pub(crate) fn validate_generated_tone_curve_source(
    source: &ToneCurveObjectFields,
) -> Result<(), String> {
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

pub(crate) fn validate_generated_region_frame_source(
    source: &RegionFrameObjectFields,
) -> Result<(), String> {
    if !source.line_width.is_finite() || !(0.0..=5000.0).contains(&source.line_width) {
        return Err("line_width must be 0..5000".to_string());
    }
    if let Some(shape) = source.shape.as_deref() {
        if shape != "rectangle" && shape != "ellipse" && shape != "cut_corner" {
            return Err("shape must be rectangle, ellipse, or cut_corner".to_string());
        }
    }
    if let Some(corner_cut) = source.corner_cut {
        if !corner_cut.is_finite() || !(0.0..=5000.0).contains(&corner_cut) {
            return Err("corner_cut must be 0..5000".to_string());
        }
    }
    if !source.extra_width.is_finite() || !(-5000.0..=5000.0).contains(&source.extra_width) {
        return Err("extra_width must be -5000..5000".to_string());
    }
    if !source.extra_height.is_finite() || !(-5000.0..=5000.0).contains(&source.extra_height) {
        return Err("extra_height must be -5000..5000".to_string());
    }
    if !source.background_opacity.is_finite() || !(0.0..=1.0).contains(&source.background_opacity) {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.frame_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_simple_tube_source(
    source: &SimpleTubeObjectFields,
) -> Result<(), String> {
    if !source.radius.is_finite() || !(0.0..=9000.0).contains(&source.radius) {
        return Err("radius must be 0..9000".to_string());
    }
    if !source.depth.is_finite() || !(-12000.0..=12000.0).contains(&source.depth) {
        return Err("depth must be -12000..12000".to_string());
    }
    if source.segments < 3 || source.segments > 128 {
        return Err("segments must be 3..128".to_string());
    }
    if source.rings < 2 || source.rings > 128 {
        return Err("rings must be 2..128".to_string());
    }
    if !source.twist_degrees.is_finite() || !(-1800.0..=1800.0).contains(&source.twist_degrees) {
        return Err("twist_degrees must be -1800..1800".to_string());
    }
    if !source.random_amount.is_finite() || !(-300.0..=300.0).contains(&source.random_amount) {
        return Err("random_amount must be -300..300".to_string());
    }
    if !source.stroke_width.is_finite() || !(0.0..=200.0).contains(&source.stroke_width) {
        return Err("stroke_width must be 0..200".to_string());
    }
    if let Some(colour_pattern) = source.colour_pattern.as_deref() {
        if colour_pattern != "single" && colour_pattern != "ring" && colour_pattern != "depth" {
            return Err("colour_pattern must be single, ring, or depth".to_string());
        }
    }
    if let Some(fog_strength) = source.fog_strength {
        if !fog_strength.is_finite() || !(0.0..=1.0).contains(&fog_strength) {
            return Err("fog_strength must be 0..1".to_string());
        }
    }
    parse_hex_colour_source(&source.colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(source.fog_colour.as_deref().unwrap_or("#ffffff"))?;
    Ok(())
}

pub(crate) fn validate_generated_sphere_dots_source(
    source: &SphereDotsObjectFields,
) -> Result<(), String> {
    if !source.radius.is_finite() || !(1.0..=5000.0).contains(&source.radius) {
        return Err("radius must be 1..5000".to_string());
    }
    if source.columns < 3 || source.columns > 256 {
        return Err("columns must be 3..256".to_string());
    }
    if source.rows < 2 || source.rows > 256 {
        return Err("rows must be 2..256".to_string());
    }
    if !source.rotation_degrees.is_finite()
        || !(-1000.0..=1000.0).contains(&source.rotation_degrees)
    {
        return Err("rotation_degrees must be -1000..1000".to_string());
    }
    if !source.offset_degrees.is_finite() || !(-360.0..=360.0).contains(&source.offset_degrees) {
        return Err("offset_degrees must be -360..360".to_string());
    }
    if !source.luminance_influence.is_finite()
        || !(-5000.0..=5000.0).contains(&source.luminance_influence)
    {
        return Err("luminance_influence must be -5000..5000".to_string());
    }
    if !source.point_size.is_finite() || !(0.0..=200.0).contains(&source.point_size) {
        return Err("point_size must be 0..200".to_string());
    }
    if !source.latitude_line_width.is_finite()
        || !(0.0..=100.0).contains(&source.latitude_line_width)
    {
        return Err("latitude_line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_spherical_field_source(
    source: &SphericalFieldObjectFields,
) -> Result<(), String> {
    if !source.radius.is_finite() || !(0.0..=5000.0).contains(&source.radius) {
        return Err("radius must be 0..5000".to_string());
    }
    if !source.strength.is_finite() || !(-200.0..=200.0).contains(&source.strength) {
        return Err("strength must be -200..200".to_string());
    }
    if !source.colour_amount.is_finite() || !(-100.0..=100.0).contains(&source.colour_amount) {
        return Err("colour_amount must be -100..100".to_string());
    }
    if !source.alpha_amount.is_finite() || !(-100.0..=100.0).contains(&source.alpha_amount) {
        return Err("alpha_amount must be -100..100".to_string());
    }
    if !source.line_width.is_finite() || !(0.0..=100.0).contains(&source.line_width) {
        return Err("line_width must be 0..100".to_string());
    }
    if source.ring_count == 0 || source.ring_count > 64 {
        return Err("ring_count must be 1..64".to_string());
    }
    if source.vector_count > 256 {
        return Err("vector_count must be 0..256".to_string());
    }
    if !source.background_opacity.is_finite() || !(0.0..=1.0).contains(&source.background_opacity) {
        return Err("background_opacity must be 0..1".to_string());
    }
    parse_hex_colour_source(&source.field_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_hksy_checker_grid_source(
    source: &HksyCheckerGridObjectFields,
) -> Result<(), String> {
    if let Some(pattern) = source.pattern.as_deref() {
        if pattern != "checker-grid"
            && pattern != "diamond"
            && pattern != "measured-grid"
            && pattern != "anchor-line"
        {
            return Err(
                "pattern must be checker-grid, diamond, measured-grid or anchor-line".to_string(),
            );
        }
    }
    if !source.cell_size.is_finite() || !(1.0..=1000.0).contains(&source.cell_size) {
        return Err("cell_size must be 1..1000".to_string());
    }
    if !source.line_width.is_finite() || !(0.0..=100.0).contains(&source.line_width) {
        return Err("line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    if let Some(palette_colours) = &source.palette_colours {
        if palette_colours.len() < 2 || palette_colours.len() > 16 {
            return Err("palette_colours must contain 2..16 colours".to_string());
        }
        for colour in palette_colours {
            parse_hex_colour_source(colour)?;
        }
    }
    if let Some(separate_interval) = source.separate_interval {
        if !separate_interval.is_finite() || !(1.0..=1000.0).contains(&separate_interval) {
            return Err("separate_interval must be 1..1000".to_string());
        }
    }
    if let Some(separate_line_width) = source.separate_line_width {
        if !separate_line_width.is_finite() || !(0.0..=100.0).contains(&separate_line_width) {
            return Err("separate_line_width must be 0..100".to_string());
        }
    }
    if source.pattern.as_deref() == Some("anchor-line") {
        let anchor_points = source
            .anchor_points
            .as_ref()
            .ok_or_else(|| "anchor_points is required for anchor-line".to_string())?;
        if anchor_points.len() < 2 || anchor_points.len() > 16 {
            return Err("anchor_points must contain 2..16 points".to_string());
        }
        if anchor_points.iter().any(|point| {
            !point.x.is_finite()
                || !point.y.is_finite()
                || point.x < -1000.0
                || point.x > 1000.0
                || point.y < -1000.0
                || point.y > 1000.0
        }) {
            return Err("anchor_points must be finite values in -1000..1000".to_string());
        }
        if source.round_caps.is_none() {
            return Err("round_caps is required for anchor-line".to_string());
        }
        let max_join_distance = source
            .max_join_distance
            .ok_or_else(|| "max_join_distance is required for anchor-line".to_string())?;
        if !max_join_distance.is_finite() || !(0.0..=300.0).contains(&max_join_distance) {
            return Err("max_join_distance must be 0..300".to_string());
        }
    }
    Ok(())
}

pub(crate) fn validate_generated_getcolor_dots_source(
    source: &GeneratedGetColorDotsSource,
) -> Result<(), String> {
    if source.generator != "getcolor-v2r-dot-field" {
        return Err("generator must be getcolor-v2r-dot-field".to_string());
    }
    if source.columns == 0 || source.columns > 512 {
        return Err("columns must be 1..512".to_string());
    }
    if source.rows == 0 || source.rows > 512 {
        return Err("rows must be 1..512".to_string());
    }
    if !source.dot_size.is_finite() || source.dot_size < 0.0 || source.dot_size > 2000.0 {
        return Err("dot_size must be 0..2000".to_string());
    }
    if let Some(dot_shape) = source.dot_shape.as_deref() {
        if dot_shape != "circle" && dot_shape != "square" && dot_shape != "diamond" {
            return Err("dot_shape must be circle, square or diamond".to_string());
        }
    }
    if let Some(stroke_width) = source.stroke_width {
        if !stroke_width.is_finite() || !(0.0..=200.0).contains(&stroke_width) {
            return Err("stroke_width must be 0..200".to_string());
        }
    }
    if !source.size_influence.is_finite()
        || source.size_influence < 0.0
        || source.size_influence > 4.0
    {
        return Err("size_influence must be 0..4".to_string());
    }
    if !source.luminance_influence.is_finite()
        || source.luminance_influence < 0.0
        || source.luminance_influence > 4.0
    {
        return Err("luminance_influence must be 0..4".to_string());
    }
    if !source.hue_shift_degrees.is_finite()
        || source.hue_shift_degrees < -720.0
        || source.hue_shift_degrees > 720.0
    {
        return Err("hue_shift_degrees must be -720..720".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.secondary_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    if let Some(source_image) = source.source_image.as_deref() {
        let source_path =
            local_media_source_path(source_image, "GeneratedGetColorDots source_image")?;
        let lower = source_path.to_ascii_lowercase();
        if !(lower.ends_with(".png")
            || lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".psd"))
        {
            return Err("source_image must be PNG, JPEG or PSD".to_string());
        }
    }
    if let Some(active_layer_ids) = source.source_active_layer_ids.as_ref() {
        if active_layer_ids.iter().any(|layer_id| layer_id.is_empty()) {
            return Err("source_active_layer_ids must not contain empty ids".to_string());
        }
    }
    if let Some(sample_strength) = source.sample_strength {
        if !sample_strength.is_finite() || !(0.0..=1.0).contains(&sample_strength) {
            return Err("sample_strength must be 0..1".to_string());
        }
    }
    if let Some(sample_hue_shift_degrees) = source.sample_hue_shift_degrees {
        if !sample_hue_shift_degrees.is_finite()
            || !(-720.0..=720.0).contains(&sample_hue_shift_degrees)
        {
            return Err("sample_hue_shift_degrees must be -720..720".to_string());
        }
    }
    Ok(())
}
