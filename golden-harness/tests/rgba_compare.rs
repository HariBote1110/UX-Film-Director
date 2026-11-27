use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, DifferenceCause, RgbaFrame};

#[test]
fn identical_rgba_frames_pass_with_zero_error() {
    let reference = RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 0, 128, 255, 255])
        .expect("valid reference frame");
    let candidate = reference.clone();

    let comparison = compare_rgba_frames(&reference, &candidate, ComparisonThresholds::exact());

    assert!(comparison.passed);
    assert_eq!(comparison.metrics.max_channel_delta, 0);
    assert_eq!(comparison.metrics.mean_absolute_error, 0.0);
    assert!(comparison.metrics.psnr.is_infinite());
    assert_eq!(comparison.metrics.ssim, 1.0);
    assert_eq!(comparison.cause, None);
}

#[test]
fn channel_delta_above_threshold_fails_with_pixel_delta_cause() {
    let reference =
        RgbaFrame::from_rgba8(1, 1, vec![10, 20, 30, 255]).expect("valid reference frame");
    let candidate =
        RgbaFrame::from_rgba8(1, 1, vec![10, 23, 30, 255]).expect("valid candidate frame");

    let comparison = compare_rgba_frames(&reference, &candidate, ComparisonThresholds::exact());

    assert!(!comparison.passed);
    assert_eq!(comparison.metrics.max_channel_delta, 3);
    assert_eq!(comparison.cause, Some(DifferenceCause::PixelValueDelta));
}

#[test]
fn mismatched_dimensions_fail_with_dimension_cause() {
    let reference =
        RgbaFrame::from_rgba8(1, 1, vec![10, 20, 30, 255]).expect("valid reference frame");
    let candidate = RgbaFrame::from_rgba8(2, 1, vec![10, 20, 30, 255, 10, 20, 30, 255])
        .expect("valid candidate frame");

    let comparison = compare_rgba_frames(&reference, &candidate, ComparisonThresholds::exact());

    assert!(!comparison.passed);
    assert_eq!(comparison.cause, Some(DifferenceCause::DimensionMismatch));
}

#[test]
fn small_delta_can_pass_when_thresholds_allow_noise() {
    let reference =
        RgbaFrame::from_rgba8(1, 1, vec![100, 120, 140, 255]).expect("valid reference frame");
    let candidate =
        RgbaFrame::from_rgba8(1, 1, vec![101, 120, 140, 255]).expect("valid candidate frame");

    let comparison = compare_rgba_frames(
        &reference,
        &candidate,
        ComparisonThresholds {
            max_channel_delta: 1,
            max_mean_absolute_error: 0.25,
            min_psnr: 40.0,
            min_ssim: 0.99,
        },
    );

    assert!(comparison.passed);
    assert!(comparison.metrics.ssim >= 0.99);
}

#[test]
fn structural_similarity_below_threshold_fails_with_ssim_cause() {
    let reference = RgbaFrame::from_rgba8(2, 1, vec![0, 0, 0, 255, 255, 255, 255, 255])
        .expect("valid reference frame");
    let candidate = RgbaFrame::from_rgba8(2, 1, vec![255, 255, 255, 255, 0, 0, 0, 255])
        .expect("valid candidate frame");

    let comparison = compare_rgba_frames(
        &reference,
        &candidate,
        ComparisonThresholds {
            max_channel_delta: 255,
            max_mean_absolute_error: 255.0,
            min_psnr: 0.0,
            min_ssim: 0.99,
        },
    );

    assert!(!comparison.passed);
    assert_eq!(
        comparison.cause,
        Some(DifferenceCause::StructuralSimilarity)
    );
}
