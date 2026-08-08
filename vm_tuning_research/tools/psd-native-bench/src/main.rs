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
//!         any of the above with a "-visible" suffix (e.g.
//!                       "serial-visible", "8-visible") — lazy (visible-only)
//!                       decode mode for `notes/lazy-visible-only-decode.md`:
//!                       only default-visible leaf layers are decoded, all
//!                       other leaves get `rgba = None` without their
//!                       channel bytes ever being decompressed.
//!                       "serial-visible" is routed through the pool0 path
//!                       (no rayon pool) since `parse_psd_fast` (the
//!                       original serial fn) has no visible_only parameter;
//!                       `parallel-layer-decode-scaling.md` established
//!                       pool0 ≈ serial timing, so this is a faithful
//!                       single-thread comparison point.
//!
//! Every mode prints the phase-timing breakdown (parse / decode / tree) for
//! each measured iteration in addition to the overall wall time, so a
//! single run always yields both the scaling number and the phase split.
//! "-visible" modes additionally print visible_leaf_count and
//! visible_decoded_rgba_bytes each iteration (correctness check: must be
//! stable across iterations/runs).

#[path = "psd_fast.rs"]
mod psd_fast;

use std::time::Instant;

enum Mode {
    Serial,
    Pooled(Option<usize>), // None = pool0 (no pool, range pipeline only)
}

/// One JSON tree node, matching the shape ag-psd side
/// (`vm_tuning_research/tools/dump-psd-tree.mjs`) emits, so
/// `compare-psd-parity.mjs` can diff the two node-by-node.
struct DumpNode {
    path: String,
    name: String,
    is_group: bool,
    top: i32,
    left: i32,
    width: u32,
    height: u32,
    visible: bool,
}

/// Minimal JSON string escaper (control chars + `"` + `\`) — good enough for
/// PSD layer names, which may contain arbitrary Unicode (including Shift-JIS
/// mis-decoded mojibake when no `luni` block is present) but essentially
/// never raw control characters in practice.
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// `dump-meta <path>`: runs `psd_fast::parse_psd_meta_only` once and prints
/// a single-line JSON tree to stdout (see module doc). Exits the process
/// directly — this mode does not participate in the iteration/stats
/// machinery the rest of `main` uses for the pixel-decode benchmarks.
fn run_dump_meta(path: &str) -> ! {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            let escaped = json_escape(path);
            println!(
                "{{\"file\":\"{escaped}\",\"ok\":false,\"error\":\"read failed: {}\"}}",
                json_escape(&e.to_string())
            );
            std::process::exit(0);
        }
    };
    let file_size = bytes.len();

    let t0 = Instant::now();
    let result = psd_fast::parse_psd_meta_only(&bytes);
    let ms = t0.elapsed().as_secs_f64() * 1000.0;

    let escaped_path = json_escape(path);
    match result {
        Err(e) => {
            println!(
                "{{\"file\":\"{escaped_path}\",\"fileSizeBytes\":{file_size},\"ok\":false,\"error\":\"{}\"}}",
                json_escape(&e)
            );
        }
        Ok(parsed) => {
            // Rebuild slash-joined paths from the flat pre-order layer list:
            // walk it maintaining a stack of open group paths keyed by
            // own_group_id, mirroring the ag-psd-side recursive walk.
            let mut group_paths: std::collections::HashMap<u32, String> =
                std::collections::HashMap::new();
            let mut nodes: Vec<DumpNode> = Vec::with_capacity(parsed.layers.len());
            for layer in &parsed.layers {
                let parent_path = layer
                    .parent_group_id
                    .and_then(|id| group_paths.get(&id))
                    .cloned()
                    .unwrap_or_default();
                let path = if parent_path.is_empty() {
                    layer.name.clone()
                } else {
                    format!("{parent_path}/{}", layer.name)
                };
                if layer.is_group {
                    if let Some(id) = layer.own_group_id {
                        group_paths.insert(id, path.clone());
                    }
                }
                nodes.push(DumpNode {
                    path,
                    name: layer.name.clone(),
                    is_group: layer.is_group,
                    top: layer.top,
                    left: layer.left,
                    width: layer.width,
                    height: layer.height,
                    visible: layer.visible,
                });
            }

            let nodes_json: Vec<String> = nodes
                .iter()
                .map(|n| {
                    format!(
                        "{{\"path\":\"{}\",\"name\":\"{}\",\"isGroup\":{},\"top\":{},\"left\":{},\"width\":{},\"height\":{},\"visible\":{}}}",
                        json_escape(&n.path),
                        json_escape(&n.name),
                        n.is_group,
                        n.top,
                        n.left,
                        n.width,
                        n.height,
                        n.visible
                    )
                })
                .collect();

            println!(
                "{{\"file\":\"{escaped_path}\",\"fileSizeBytes\":{file_size},\"ok\":true,\"width\":{},\"height\":{},\"nodeCount\":{},\"parseMs\":{ms},\"nodes\":[{}]}}",
                parsed.width,
                parsed.height,
                nodes.len(),
                nodes_json.join(",")
            );
        }
    }
    std::process::exit(0);
}

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().unwrap_or_else(|| {
        eprintln!("usage: psd-native-bench <path-to-psd> [iterations] [mode]");
        eprintln!("       psd-native-bench dump-meta <path-to-psd>");
        std::process::exit(1);
    });

    if path == "dump-meta" {
        let psd_path = args.next().unwrap_or_else(|| {
            eprintln!("usage: psd-native-bench dump-meta <path-to-psd>");
            std::process::exit(1);
        });
        run_dump_meta(&psd_path);
    }
    let iterations: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or(15);
    let warmup = 3usize.min(iterations.saturating_sub(1));

    let mode_arg = args.next().unwrap_or_else(|| "serial".to_string());
    let (mode_core, visible_only) = match mode_arg.strip_suffix("-visible") {
        Some(core) => (core.to_string(), true),
        None => (mode_arg.clone(), false),
    };
    let mode = match mode_core.as_str() {
        "serial" if !visible_only => Mode::Serial,
        "serial" => Mode::Pooled(None), // "serial-visible": no visible_only param on parse_psd_fast, route via pool0
        "pool0" => Mode::Pooled(None),
        n => match n.parse::<usize>() {
            Ok(threads) if threads >= 1 => Mode::Pooled(Some(threads)),
            _ => {
                eprintln!("invalid mode {mode_arg:?}: expected \"serial\", \"pool0\", a positive integer thread count, or one of those with a \"-visible\" suffix");
                std::process::exit(1);
            }
        },
    };
    let mode_label = match &mode {
        Mode::Serial => "serial".to_string(),
        Mode::Pooled(None) => "pool0".to_string(),
        Mode::Pooled(Some(n)) => format!("pool{n}"),
    };
    let mode_label = if visible_only {
        format!("{mode_label}-visible")
    } else {
        mode_label
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
    let mut last_visible_leaf_count = 0usize;
    let mut last_visible_decoded_bytes = 0usize;
    let mut last_total_leaf_count = 0usize;

    for i in 0..iterations {
        let start = Instant::now();
        let (result, timings) = match mode {
            Mode::Serial => {
                let result = psd_fast::parse_psd_fast(&bytes).expect("parse_psd_fast failed");
                (result, None)
            }
            Mode::Pooled(threads) => {
                let (result, t) =
                    psd_fast::parse_psd_fast_instrumented(&bytes, threads, visible_only)
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
        // Correctness check for lazy decode: leaf layers whose own
        // `visible` bit is set AND that actually got decoded (rgba present
        // — excludes zero-size leaves, which stay None regardless).
        last_visible_leaf_count = result
            .layers
            .iter()
            .filter(|l| !l.is_group && l.visible && l.rgba.is_some())
            .count();
        last_visible_decoded_bytes = result
            .layers
            .iter()
            .filter(|l| !l.is_group && l.visible)
            .filter_map(|l| l.rgba.as_ref())
            .map(|v| v.len())
            .sum();
        // Total leaf count (visible or not, decoded or not) — denominator
        // for the "how many of the N layers are default-visible leaves"
        // question. Present regardless of mode/visible_only.
        last_total_leaf_count = result.layers.iter().filter(|l| !l.is_group).count();

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
        if visible_only {
            println!(
                "         visible_leaf_count = {last_visible_leaf_count}, visible_decoded_rgba_bytes = {last_visible_decoded_bytes}"
            );
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
    println!("total_leaf_count = {last_total_leaf_count}");
    println!("total_decoded_rgba_bytes = {last_total_decoded_bytes}");
    if visible_only {
        println!("visible_leaf_count = {last_visible_leaf_count}");
        println!("visible_decoded_rgba_bytes = {last_visible_decoded_bytes}");
    }

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
