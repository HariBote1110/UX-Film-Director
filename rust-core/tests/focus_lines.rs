use uxfd_rust_core::{focus_lines_frame_bucket, focus_lines_frame_bucket_from_source};

#[test]
fn focus_lines_frame_bucket_is_static_when_interval_is_zero() {
    assert_eq!(focus_lines_frame_bucket(0, 0), 0);
    assert_eq!(focus_lines_frame_bucket(0, 600), 0);
}

#[test]
fn focus_lines_frame_bucket_changes_at_interval_boundary() {
    assert_eq!(focus_lines_frame_bucket(10, 9), 0);
    assert_eq!(focus_lines_frame_bucket(10, 10), 1);
    assert_eq!(focus_lines_frame_bucket(10, 29), 2);
}

#[test]
fn focus_lines_frame_bucket_can_be_read_from_serialised_source() {
    let source = r#"{"keyframeInterval":12}"#;
    assert_eq!(
        focus_lines_frame_bucket_from_source(source, 23)
            .expect("valid FocusLinesPlus source must expose its frame bucket"),
        1
    );

    let error = focus_lines_frame_bucket_from_source("{}", 0)
        .expect_err("missing keyframeInterval must be rejected");
    assert!(error.contains("keyframeInterval"));
}
