use uxfd_sidecar_protocol::{
    CancelJobRequest, ControlEvent, JobLifecycle, JobLifecycleError, JobState,
};

#[test]
fn cancel_request_serialises_only_job_identity() {
    let request = CancelJobRequest {
        job_id: "decode-1".to_string(),
    };

    let encoded = serde_json::to_value(request).expect("serialise cancel request");

    assert_eq!(encoded["jobId"], "decode-1");
    assert!(encoded.get("frame").is_none());
    assert!(encoded.get("bytes").is_none());
    assert!(encoded.get("pixels").is_none());
    assert!(encoded.get("frameBase64").is_none());
}

#[test]
fn progress_and_cancel_events_stay_on_control_plane() {
    let progress = ControlEvent::JobProgress {
        job_id: "decode-1".to_string(),
        completed_frames: 7,
        total_frames: 10,
    };
    let cancelled = ControlEvent::JobCancelled {
        job_id: "decode-1".to_string(),
        reason: "userRequested".to_string(),
    };

    let progress_json = serde_json::to_value(progress).expect("serialise progress");
    let cancelled_json = serde_json::to_value(cancelled).expect("serialise cancelled");

    assert_eq!(progress_json["type"], "jobProgress");
    assert_eq!(progress_json["jobId"], "decode-1");
    assert_eq!(progress_json["completedFrames"], 7);
    assert_eq!(progress_json["totalFrames"], 10);
    assert_eq!(cancelled_json["type"], "jobCancelled");
    assert_eq!(cancelled_json["jobId"], "decode-1");
    assert_eq!(cancelled_json["reason"], "userRequested");

    for encoded in [progress_json, cancelled_json] {
        assert!(encoded.to_string().len() < 300);
        assert!(encoded.get("frame").is_none());
        assert!(encoded.get("bytes").is_none());
        assert!(encoded.get("pixels").is_none());
        assert!(encoded.get("frameBase64").is_none());
    }
}

#[test]
fn job_lifecycle_blocks_completion_after_cancel_is_requested() {
    let mut lifecycle = JobLifecycle::queued("decode-1");

    assert_eq!(lifecycle.state(), JobState::Queued);
    assert_eq!(
        lifecycle.start().expect("start queued job"),
        ControlEvent::JobStarted {
            job_id: "decode-1".to_string()
        }
    );
    assert_eq!(lifecycle.state(), JobState::Running);

    lifecycle.request_cancel().expect("request cancellation");
    assert_eq!(lifecycle.state(), JobState::Cancelling);
    assert_eq!(
        lifecycle.complete(),
        Err(JobLifecycleError::CancellationPending)
    );
    assert_eq!(
        lifecycle.mark_cancelled("userRequested"),
        Ok(ControlEvent::JobCancelled {
            job_id: "decode-1".to_string(),
            reason: "userRequested".to_string()
        })
    );
    assert_eq!(lifecycle.state(), JobState::Cancelled);
}
