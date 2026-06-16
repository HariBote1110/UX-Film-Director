use proptest::prelude::*;
use proptest::test_runner::{Config as ProptestConfig, FileFailurePersistence};
use uxfd_rust_core::{keyframe::evaluate_scalar_keyframes, ScalarKeyframe};

proptest! {
    #![proptest_config(ProptestConfig {
        failure_persistence: Some(Box::new(FileFailurePersistence::Off)),
        ..ProptestConfig::default()
    })]

    #[test]
    fn scalar_keyframe_interpolation_stays_finite_and_within_endpoints(
        left_value in -10.0f32..10.0,
        right_value in -10.0f32..10.0,
        span in 1u64..240,
        offset in 0u64..240,
    ) {
        let local_offset = offset % (span + 1);
        let keyframes = vec![
            ScalarKeyframe {
                frame_offset: 0,
                value: left_value,
            },
            ScalarKeyframe {
                frame_offset: span,
                value: right_value,
            },
        ];

        let evaluated = evaluate_scalar_keyframes(&keyframes, local_offset, 0.0);
        let lower = left_value.min(right_value);
        let upper = left_value.max(right_value);
        let tolerance = 1.0e-5;

        prop_assert!(evaluated.is_finite());
        prop_assert!(evaluated >= lower - tolerance);
        prop_assert!(evaluated <= upper + tolerance);
    }
}
