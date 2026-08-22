use super::*;

pub(crate) fn validate_generated_tartan_check_source(
    source: &TartanCheckObjectFields,
) -> Result<(), String> {
    if source.tile_size < 10.0 || source.tile_size > 800.0 {
        return Err("tile_size must be 10..800".to_string());
    }
    if source.blur_radius > 300.0 {
        return Err("blur_radius must be 0..300".to_string());
    }
    parse_hex_colour_source(&source.base_colour)?;
    parse_hex_colour_source(&source.stripe_colour_a)?;
    parse_hex_colour_source(&source.stripe_colour_b)?;
    parse_hex_colour_source(&source.line_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_houndstooth_source(
    source: &HoundstoothObjectFields,
) -> Result<(), String> {
    if source.pattern_size < 10.0 || source.pattern_size > 200.0 {
        return Err("pattern_size must be 10..200".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
    Ok(())
}

pub(crate) fn validate_generated_yagasuri_source(
    source: &YagasuriObjectFields,
) -> Result<(), String> {
    if source.arrow_width <= 0.0 || source.arrow_width > 500.0 {
        return Err("arrow_width must be 1..500".to_string());
    }
    if source.arrow_height <= 0.0 || source.arrow_height > 500.0 {
        return Err("arrow_height must be 1..500".to_string());
    }
    if source.line_width > 100.0 {
        return Err("line_width must be 0..100".to_string());
    }
    parse_hex_colour_source(&source.foreground_colour)?;
    parse_hex_colour_source(&source.background_colour)?;
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
