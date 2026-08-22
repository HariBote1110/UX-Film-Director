//! `shared-renderer/shaders/nv12_composite.wgsl` のパイプライン生成だけを
//! 単体で計測する最小再現ツール。
//!
//! `windows_port_research/notes/w5-attach-hang.md` で、W5 attach スモーク
//! テストの「ハング」が `nv12::create_nv12_pipeline_for_format`
//! （このシェーダを使う）で止まる（10分待っても完了ログが出ない）ことを
//! 突き止めた。本ツールは `native-overlay`/`native-wgpu-renderer` の
//! DirectComposition・overlay window・attach 経路を一切介さず、
//! 「device 作成 → シェーダモジュール作成 → パイプライン作成」の
//! 3段階だけを単体で・段階別タイミング付きで・ハードタイムアウト付きで
//! 実行する。
//!
//! 使い方:
//!   nv12-pipeline-repro [--compiler fxc|dxc] [--timeout-secs N] [--shader nv12|solid]
//!
//! - `--compiler`: Windows の DX12 バックエンドが使う HLSL コンパイラ。
//!   `wgpu::Dx12Compiler` の既定値は `Fxc`（"old, slow and unmaintained"と
//!   wgpu自身のドキュメントコメントに明記されている）。`dxc` は
//!   `DynamicDxc`（システムの `dxcompiler.dll`/`dxil.dll` を動的ロード。
//!   無ければ内部で Fxc へ黙ってフォールバックする）。`static-dxc` cargo
//!   feature を有効にしてビルドした場合のみ `staticdxc`
//!   （`mach-dxcompiler-rs` 静的リンク、追加DLL不要）も選べる。
//!   macOS では無視される（Metal バックエンドのみ）。
//! - `--timeout-secs`: 各段階（シェーダモジュール作成・パイプライン作成）
//!   に許す時間。超えたら "STAGE TIMED OUT" と表示してプロセスを終了する
//!   （別スレッドで実行し、メインスレッドは `recv_timeout` で待つ。Rust の
//!   スレッドは強制キャンセルできないため、タイムアウト後もバック
//!   グラウンドスレッドはリークしたまま残り得るが、計測目的には十分）。
//! - `--shader`: `nv12`（既定、678行）か `solid`（比較対象、598行、
//!   W5 の実測でこちらは1分未満で完了した）を選ぶ。

use std::sync::mpsc;
use std::time::{Duration, Instant};

const NV12_SHADER: &str = include_str!("../../../../shared-renderer/shaders/nv12_composite.wgsl");
const SOLID_SHADER: &str =
    include_str!("../../../../shared-renderer/shaders/solid_composite.wgsl");

struct Args {
    compiler: String,
    timeout_secs: u64,
    shader: String,
}

fn parse_args() -> Args {
    let raw: Vec<String> = std::env::args().collect();
    let mut compiler = "fxc".to_string();
    let mut timeout_secs = 120u64;
    let mut shader = "nv12".to_string();
    let mut i = 1;
    while i < raw.len() {
        match raw[i].as_str() {
            "--compiler" => {
                compiler = raw.get(i + 1).cloned().unwrap_or(compiler);
                i += 2;
            }
            "--timeout-secs" => {
                timeout_secs = raw
                    .get(i + 1)
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(timeout_secs);
                i += 2;
            }
            "--shader" => {
                shader = raw.get(i + 1).cloned().unwrap_or(shader);
                i += 2;
            }
            _ => {
                i += 1;
            }
        }
    }
    Args {
        compiler,
        timeout_secs,
        shader,
    }
}

/// 別スレッドでブロッキング呼び出しを実行し、`timeout` を超えたら
/// メインスレッドへは戻らず "TIMED OUT" 扱いにする。
/// スレッド自体は kill できないため呼び出し元プロセスごと終了させる前提。
fn run_with_timeout<T, F>(label: &str, timeout: Duration, f: F) -> Option<T>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let start = Instant::now();
    std::thread::spawn(move || {
        let value = f();
        let _ = tx.send(value);
    });
    match rx.recv_timeout(timeout) {
        Ok(value) => {
            eprintln!(
                "[nv12-repro] stage={label} status=ok elapsed_ms={}",
                start.elapsed().as_millis()
            );
            Some(value)
        }
        Err(_) => {
            eprintln!(
                "[nv12-repro] stage={label} status=TIMED_OUT elapsed_ms={} (>{} s)",
                start.elapsed().as_millis(),
                timeout.as_secs()
            );
            None
        }
    }
}

fn main() {
    let args = parse_args();
    let timeout = Duration::from_secs(args.timeout_secs);

    eprintln!(
        "[nv12-repro] start compiler={} timeout_secs={} shader={}",
        args.compiler, args.timeout_secs, args.shader
    );

    #[cfg(target_os = "windows")]
    let dx12_compiler = match args.compiler.as_str() {
        "dxc" => wgpu::Dx12Compiler::default_dynamic_dxc(),
        #[cfg(feature = "static-dxc")]
        "staticdxc" => wgpu::Dx12Compiler::StaticDxc,
        _ => wgpu::Dx12Compiler::Fxc,
    };

    #[cfg(target_os = "windows")]
    let backends = wgpu::Backends::DX12;
    #[cfg(not(target_os = "windows"))]
    let backends = wgpu::Backends::METAL;

    let mut instance_descriptor = wgpu::InstanceDescriptor::default();
    instance_descriptor.backends = backends;
    #[cfg(target_os = "windows")]
    {
        instance_descriptor.backend_options.dx12.shader_compiler = dx12_compiler;
    }
    let instance = wgpu::Instance::new(&instance_descriptor);

    let adapter_start = Instant::now();
    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: None,
        force_fallback_adapter: false,
    }))
    .expect("no adapter");
    let info = adapter.get_info();
    eprintln!(
        "[nv12-repro] stage=adapter status=ok elapsed_ms={} name={} backend={:?} device_type={:?}",
        adapter_start.elapsed().as_millis(),
        info.name,
        info.backend,
        info.device_type
    );

    let device_start = Instant::now();
    let (device, _queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("nv12-pipeline-repro device"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::default(),
        memory_hints: wgpu::MemoryHints::default(),
        trace: wgpu::Trace::Off,
    }))
    .expect("request_device failed");
    eprintln!(
        "[nv12-repro] stage=device status=ok elapsed_ms={}",
        device_start.elapsed().as_millis()
    );

    let shader_source = match args.shader.as_str() {
        "solid" => SOLID_SHADER,
        _ => NV12_SHADER,
    };
    let shader_label = args.shader.clone();

    // --- シェーダモジュール作成（段階1） ---
    let device_for_shader = device.clone();
    let shader_module = run_with_timeout(
        "create_shader_module",
        timeout,
        move || -> wgpu::ShaderModule {
            device_for_shader.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("nv12-pipeline-repro shader"),
                source: wgpu::ShaderSource::Wgsl(shader_source.into()),
            })
        },
    );
    let Some(shader_module) = shader_module else {
        eprintln!("[nv12-repro] result=TIMED_OUT_AT_SHADER_MODULE shader={shader_label}");
        std::process::exit(2);
    };

    // --- パイプライン作成（段階2） ---
    // nv12 は 4 bindings（Y/CbCr texture + Nv12Params + RenderParams）、
    // solid は 2 bindings（source texture + RenderParams）。
    // `native-wgpu-renderer/src/nv12/pipeline.rs` /
    // `native-wgpu-renderer/src/lib.rs` の bind group layout 定義と
    // 一致させている（binding番号のみ、実データは使わないので中身は空）。
    let bind_group_layout_entries: Vec<wgpu::BindGroupLayoutEntry> = if args.shader == "solid" {
        vec![
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ]
    } else {
        vec![
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 3,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ]
    };

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("nv12-pipeline-repro bind group layout"),
        entries: &bind_group_layout_entries,
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("nv12-pipeline-repro pipeline layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    let device_for_pipeline = device.clone();
    let pipeline = run_with_timeout("create_render_pipeline", timeout, move || {
        device_for_pipeline.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("nv12-pipeline-repro pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Bgra8Unorm,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    });

    match pipeline {
        Some(_pipeline) => {
            eprintln!("[nv12-repro] result=OK shader={shader_label}");
        }
        None => {
            eprintln!("[nv12-repro] result=TIMED_OUT_AT_PIPELINE shader={shader_label}");
            std::process::exit(3);
        }
    }
}
