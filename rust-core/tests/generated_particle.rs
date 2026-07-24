use uxfd_rust_core::{
    generated_particle_unit, parse_generated_particle_source, GeneratedParticleParams,
};

const VALID_SOURCE: &str = r##"{
  "generator":"standard-particle",
  "seed":93,
  "particle_count":16,
  "spread":180,
  "speed":120,
  "size":6,
  "colour":"#80d8ff",
  "lifetime_seconds":1.5
}"##;

#[test]
fn parses_the_canonical_standard_particle_source() {
    let parsed = parse_generated_particle_source(VALID_SOURCE)
        .expect("the standard particle source must be accepted");

    assert_eq!(
        parsed,
        GeneratedParticleParams {
            seed: 93,
            particle_count: 16,
            spread: 180.0,
            speed: 120.0,
            size: 6.0,
            colour: [0x80, 0xd8, 0xff],
            lifetime_seconds: 1.5,
        }
    );
}

#[test]
fn preserves_the_particle_source_validation_contract() {
    for (source, expected_error) in [
        (
            VALID_SOURCE.replace("standard-particle", "unsupported"),
            "generator must be standard-particle",
        ),
        (
            VALID_SOURCE.replace("\"particle_count\":16", "\"particle_count\":0"),
            "particle_count must be 1..10000",
        ),
        (
            VALID_SOURCE.replace("\"spread\":180", "\"spread\":-1"),
            "spread must be a finite non-negative number",
        ),
        (
            VALID_SOURCE.replace("\"speed\":120", "\"speed\":-1"),
            "speed must be a finite non-negative number",
        ),
        (
            VALID_SOURCE.replace("\"size\":6", "\"size\":0"),
            "size must be a finite positive number",
        ),
        (
            VALID_SOURCE.replace("\"lifetime_seconds\":1.5", "\"lifetime_seconds\":0"),
            "lifetime_seconds must be a finite positive number",
        ),
        (
            VALID_SOURCE.replace("#80d8ff", "not-a-colour"),
            "source must be a #rrggbb hex colour",
        ),
    ] {
        let error = parse_generated_particle_source(&source)
            .expect_err("invalid particle input must be rejected");
        assert_eq!(error, expected_error);
    }
}

#[test]
fn exposes_stable_particle_random_vectors_for_cpu_and_gpu_renderers() {
    for ((seed, index, lane), expected) in [
        ((0, 0, 0), 0.0),
        ((93, 0, 0), 0.995_077_75),
        ((93, 15, 1), 0.510_611_3),
        ((u64::MAX, 10_000, 99), 0.447_185_84),
    ] {
        let actual = generated_particle_unit(seed, index, lane);
        assert!(
            (actual - expected).abs() < 0.000_001,
            "seed={seed}, index={index}, lane={lane}: expected {expected}, got {actual}",
        );
    }
}
