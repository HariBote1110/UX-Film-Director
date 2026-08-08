//! Standalone native benchmark for `psd_fast::parse_psd_fast` /
//! `psd_fast::parse_psd_fast_instrumented`.
//!
//! Research code (disposable) for `vm_tuning_research/notes/native-psd-fast-single-thread.md`
//! and `vm_tuning_research/notes/parallel-layer-decode-scaling.md`.
//! Measures wall time of parse + per-layer channel decompression + RGBA
//! interleave (all inside `parse_psd_fast`), matching the work done by the
//! ag-psd `skipCompositeImageData + skipThumbnail` comparison target.
//!
//! usage: psd-native-bench <path-to-psd> [iterations] [mode]
//!   mode: "serial"   — original single-pass code path (`parse_psd_fast`).
//!                       Default when omitted.
//!         "pool0"     — routed through the byte-range-precompute pipeline,
//!                       decoded serially on the calling thread (no rayon
//!                       pool at all). Isolates the precompute-pass cost
//!                       from thread-pool overhead.
//!         <integer N> — decode layers on a rayon thread pool with N
//!                       threads (N=1 included on purpose, to expose pool
//!                       overhead versus "serial"/"pool0").
//!
//! Every mode prints the phase-timing breakdown (parse / decode / tree) for
//! each measured iteration in addition to the overall wall time, so a
//! single run always yields both the scaling number and the phase split.

#[path = "psd_fast.rs"]
mod psd_fast;

use std::time::Instant;

enum Mode {
    Serial,
    Pooled(Option<usize>), // None = pool0 (no pool, range pipeline only)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().unwrap_or_else(|| {
        eprintln!("usage: psd-native-bench <path-to-psd> [iterations] [mode]");
        std::process::exit(1);
    });
    let iterations: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or(15);
    let warmup = 3usize.min(iterations.saturating_sub(1));

    let mode_arg = args.next().unwrap_or_else(|| "serial".to_string());
    let mode = match mode_arg.as_str() {
        "serial" => Mode::Serial,
        "pool0" => Mode::Pooled(None),
        n => match n.parse::<usize>() {
            Ok(threads) if threads >= 1 => Mode::Pooled(Some(threads)),
            _ => {
                eprintln!("invalid mode {n:?}: expected \"serial\", \"pool0\", or a positive integer thread count");
                std::process::exit(1);
            }
        },
    };
    let mode_label = match &mode {
        Mode::Serial => "serial".to_string(),
        Mode::Pooled(None) => "pool0".to_string(),
        Mode::Pooled(Some(n)) => format!("pool{n}"),
    };

    let bytes = std::fs::read(&path).unwrap_or_else(|e| {
        eprintln!("failed to read {path}: {e}");
        std::process::exit(1);
    });
    println!("input: {path} ({} bytes), mode = {mode_label}", bytes.len());

    let mut durations_ms: Vec<f64> = Vec::with_capacity(iterations);
    let mut parse_ms_samples: Vec<f64> = Vec::with_capacity(iterations);
    let mut decode_ms_samples: Vec<f64> = Vec::with_capacity(iterations);
    let mut tree_ms_samples: Vec<f64> = Vec::with_capacity(iterations);
    let mut last_layer_count = 0usize;
    let mut last_total_decoded_bytes = 0usize;

    for i in 0..iterations {
        let start = Instant::now();
        let (result, timings) = match mode {
            Mode::Serial => {
                let result = psd_fast::parse_psd_fast(&bytes).expect("parse_psd_fast failed");
                (result, None)
            }
            Mode::Pooled(threads) => {
                let (result, t) = psd_fast::parse_psd_fast_instrumented(&bytes, threads)
                    .expect("parse_psd_fast_instrumented failed");
                (result, Some(t))
            }
        };
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
        if let Some(t) = &timings {
            println!(
                "iter {:>2} [{tag}]: {ms:.3} ms  (parse={:.3} decode={:.3} tree={:.3})",
                i + 1,
                t.parse_records_ms,
                t.decode_layers_ms,
                t.tree_build_ms
            );
        } else {
            println!("iter {:>2} [{tag}]: {ms:.3} ms", i + 1);
        }

        if i >= warmup {
            durations_ms.push(ms);
            if let Some(t) = &timings {
                parse_ms_samples.push(t.parse_records_ms);
                decode_ms_samples.push(t.decode_layers_ms);
                tree_ms_samples.push(t.tree_build_ms);
            }
        }
    }

    println!();
    println!("layer_count = {last_layer_count}");
    println!("total_decoded_rgba_bytes = {last_total_decoded_bytes}");

    print_stats("overall", &durations_ms);
    if !parse_ms_samples.is_empty() {
        print_stats("phase:parse_records", &parse_ms_samples);
        print_stats("phase:decode_layers", &decode_ms_samples);
        print_stats("phase:tree_build", &tree_ms_samples);
    }
}

fn print_stats(label: &str, samples_in: &[f64]) {
    let mut durations_ms = samples_in.to_vec();
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
    println!("[{label}] n = {n}");
    println!("[{label}] min    = {min:.3} ms");
    println!("[{label}] median = {median:.3} ms");
    println!("[{label}] mean   = {mean:.3} ms");
    println!("[{label}] max    = {max:.3} ms");
    println!("[{label}] stddev = {stddev:.3} ms");
}
