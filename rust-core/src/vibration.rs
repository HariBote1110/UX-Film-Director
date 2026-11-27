/// Enabled vibration filters as `(strength, speed)` pairs in their resolved order.
/// Each filter advances the phase by its enabled-filter index, matching the TS editor.
pub fn evaluate_vibration_offset(filters: &[(f64, f64)], time_seconds: f64) -> (f64, f64) {
    filters.iter().enumerate().fold(
        (0.0, 0.0),
        |(offset_x, offset_y), (index, (strength, speed))| {
            if *strength == 0.0 {
                return (offset_x, offset_y);
            }
            let phase = index as f64 * 1.618;
            let time = time_seconds * speed + phase;
            (
                offset_x
                    + (time * 12.9898).sin() * strength
                    + (time * 78.233).cos() * strength * 0.5,
                offset_y
                    + (time * 12.9898).cos() * strength
                    + (time * 78.233).sin() * strength * 0.5,
            )
        },
    )
}

#[cfg(test)]
mod tests {
    use super::evaluate_vibration_offset;

    #[test]
    fn vibration_filters_sum_in_order_using_absolute_seconds_and_enabled_indices() {
        let filters = [(8.0, 1.5), (0.0, 2.0), (2.0, 0.0), (-3.0, 0.5)];
        let actual = evaluate_vibration_offset(&filters, 1.4333333333333333);
        let expected = (2.376_775_481_033_022_6, -9.427_985_710_173_946);
        assert!((actual.0 - expected.0).abs() < 1e-12, "x: {actual:?}");
        assert!((actual.1 - expected.1).abs() < 1e-12, "y: {actual:?}");
    }

    #[test]
    fn vibration_with_zero_strength_or_no_filters_has_no_offset() {
        assert_eq!(evaluate_vibration_offset(&[], 2.0), (0.0, 0.0));
        assert_eq!(evaluate_vibration_offset(&[(0.0, 100.0)], 2.0), (0.0, 0.0));
    }
}
