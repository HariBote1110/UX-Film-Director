use uxfd_rust_core::{build_audio_waveform_line_strip, AudioWaveformSource};

#[test]
fn parses_audio_waveform_r_source_metadata() {
    let source = AudioWaveformSource::from_json(
        r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":2,"amplitude":1.5}"##,
    )
    .expect("valid waveform source");

    assert_eq!(source.generator, "audio-waveform-r");
    assert_eq!(source.target_audio_id, "audio-1");
    assert_eq!(source.target_source, "/tmp/music.wav");
    assert_eq!(source.sample_window_seconds, 1.0);
    assert_eq!(source.colour, "#00ff00");
    assert_eq!(source.thickness, 2.0);
    assert_eq!(source.amplitude, 1.5);
}

#[test]
fn builds_waveform_line_strip_from_pcm_samples() {
    let source = AudioWaveformSource::from_json(
        r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":2,"amplitude":1}"##,
    )
    .expect("valid waveform source");
    let samples = [0.0_f32, 1.0, -1.0, 0.0];

    let line = build_audio_waveform_line_strip(&source, &samples, 4, 0, 60, 4, 100)
        .expect("valid waveform line");

    assert_eq!(line.colour, [0.0, 1.0, 0.0, 1.0]);
    assert_eq!(line.thickness, 2.0);
    assert_eq!(line.points.len(), 4);
    assert_eq!(line.points[0], (0.0, 50.0));
    assert_eq!(line.points[1], (1.0, 100.0));
    assert_eq!(line.points[2], (2.0, 0.0));
    assert_eq!(line.points[3], (3.0, 50.0));
}

