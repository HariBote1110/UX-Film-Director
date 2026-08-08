//! Standalone single-thread native benchmark for `psd_fast::parse_psd_fast`.
//!
//! Research code (disposable) for `vm_tuning_research/notes/native-psd-fast-single-thread.md`.
//! Measures wall time of parse + per-layer channel decompression + RGBA
//! interleave (all inside `parse_psd_fast`), matching the work done by the
//! ag-psd `skipCompositeImageData + skipThumbnail` comparison target.

#[path = "psd_fast.rs"]
mod psd_fast;

use std::time::Instant;

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().unwrap_or_else(|| {
        eprintln!("usage: psd-native-bench <path-to-psd> [iterations]");
        std::process::exit(1);
    });
    let iterations: usize = args
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(15);
    let warmup = 3usize.min(iterations.saturating_sub(1));

    let bytes = std::fs::read(&path).unwrap_or_else(|e| {
        eprintln!("failed to read {path}: {e}");
        std::process::exit(1);
    });
    println!("input: {path} ({} bytes)", bytes.len());

    let mut durations_ms: Vec<f64> = Vec::with_capacity(iterations);
    let mut last_layer_count = 0usize;
    let mut last_total_decoded_bytes = 0usize;

    for i in 0..iterations {
        let start = Instant::now();
        let result = psd_fast::parse_psd_fast(&bytes).expect("parse_psd_fast failed");
        let elapsed = start.elapsed();
        let ms = elapsed.as_secs_f64() * 1000.0;

        last_layer_count = result.layers.len();
        last_total_decoded_bytes = result
            .layers
            .iter()
            .filter_map(|l| l.rgba.as_ref())
            .map(|v| v.len())
            .sum();

        let tag = if i < warmup { "warmup" } else { "measured" };
        println!("iter {:>2} [{tag}]: {ms:.3} ms", i + 1);

        if i >= warmup {
            durations_ms.push(ms);
        }
    }

    println!();
    println!("layer_count = {last_layer_count}");
    println!("total_decoded_rgba_bytes = {last_total_decoded_bytes}");

    durations_ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = durations_ms.len();
    let min = durations_ms[0];
    let max = durations_ms[n - 1];
    let median = if n % 2 == 0 {
        (durations_ms[n / 2 - 1] + durations_ms[n / 2]) / 2.0
    } else {
        durations_ms[n / 2]
    };
    let mean = durations_ms.iter().sum::<f64>() / n as f64;
    let variance = durations_ms.iter().map(|d| (d - mean).powi(2)).sum::<f64>() / n as f64;
    let stddev = variance.sqrt();

    println!();
    println!("n = {n} (warmup discarded = {warmup})");
    println!("min    = {min:.3} ms");
    println!("median = {median:.3} ms");
    println!("mean   = {mean:.3} ms");
    println!("max    = {max:.3} ms");
    println!("stddev = {stddev:.3} ms");
}
