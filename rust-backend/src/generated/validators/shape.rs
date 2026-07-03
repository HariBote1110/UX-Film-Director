use super::*;

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

const SUPPORTED_GENERATED_SHAPE_TYPES: [&str; 10] = [
    "rounded_rect",
    "circle",
    "ellipse",
    "triangle",
    "star",
    "pentagon",
    "diamond",
    "arrow",
    "heart",
    "cross",
];

pub(crate) fn validate_generated_shape_source(
    source: &GeneratedShapeSource,
) -> Result<(), String> {
    if source.generator != "shape-93" {
        return Err("generator must be shape-93".to_string());
    }
    if !SUPPORTED_GENERATED_SHAPE_TYPES.contains(&source.shape_type.as_str()) {
        return Err(format!(
            "shape_type must be one of {SUPPORTED_GENERATED_SHAPE_TYPES:?}"
        ));
    }
    if !source.corner_radius.is_finite() || source.corner_radius < 0.0 {
        return Err("corner_radius must be a finite non-negative number".to_string());
    }
    parse_hex_colour_source(&source.fill_colour)?;
    if let Some(gradient) = source.gradient.as_ref() {
        normalise_gradient_stops(gradient)?;
    }
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
