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
    assert_eq!(source.thickness, Some(2.0));
    assert_eq!(source.amplitude, Some(1.5));
}

#[test]
fn parses_audio_sphere_93_source_without_waveform_only_metadata() {
    let source = AudioWaveformSource::from_json(
        r##"{"generator":"audio-sphere-93","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":0.1,"columns":16,"rows":12,"base_radius":170,"audio_influence":0.6,"point_size":5,"polygon_size":0.35,"random_amount":0.05,"colour":"#36c2ff","seed":93}"##,
    )
    .expect("valid audio sphere source should not require waveform-only metadata");

    assert_eq!(source.generator, "audio-sphere-93");
    assert_eq!(source.target_audio_id, "audio-1");
    assert_eq!(source.target_source, "/tmp/music.wav");
    assert_eq!(source.sample_window_seconds, 0.1);
    assert_eq!(source.colour, "#36c2ff");
    assert_eq!(source.columns, Some(16));
    assert_eq!(source.rows, Some(12));
    assert_eq!(source.base_radius, Some(170.0));
    assert_eq!(source.audio_influence, Some(0.6));
    assert_eq!(source.point_size, Some(5.0));
    assert_eq!(source.polygon_size, Some(0.35));
    assert_eq!(source.random_amount, Some(0.05));
    assert_eq!(source.seed, Some(93));
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
