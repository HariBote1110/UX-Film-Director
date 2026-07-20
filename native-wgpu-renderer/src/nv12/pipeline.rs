//! NV12 合成パイプライン（クロスプラットフォームで解析可能な wgpu 標準
//! API のみを使用。実際に NV12 テクスチャを import できるのは macOS だけ
//! だが、パイプライン自体はどのバックエンドでも作成できる）。

use std::borrow::Cow;

use crate::{ClipPipelineKind, PreparedClip, RenderParams};

use super::{Nv12ColourMatrix, Nv12ColourRange};

/// NV12 フラグメントシェーダへ渡す colour range / colour matrix uniform。
/// レイアウトは `shared-renderer/shaders/nv12_composite.wgsl` の
/// `Nv12Params` と一致させること。
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct Nv12Params {
    pub(crate) colour_range: f32,
    pub(crate) colour_matrix: f32,
    pub(crate) _padding0: f32,
    pub(crate) _padding1: f32,
}

impl Nv12Params {
    pub(crate) fn new(colour_range: Nv12ColourRange, colour_matrix: Nv12ColourMatrix) -> Self {
        Self {
            colour_range: match colour_range {
                Nv12ColourRange::Video => 0.0,
                Nv12ColourRange::Full => 1.0,
            },
            colour_matrix: match colour_matrix {
                Nv12ColourMatrix::Bt601 => 0.0,
                // BT.2020 has no distinct coefficient set here (documented
                // approximation, see progress/phase4b-nv12-iosurface-gpu-import.md
                // and progress/phase4c-inprocess-decode-integration.md):
                // treated identically to BT.709.
                Nv12ColourMatrix::Bt709 | Nv12ColourMatrix::Bt2020 => 1.0,
            },
            _padding0: 0.0,
            _padding1: 0.0,
        }
    }
}

/// bind group layout の binding 番号（`nv12_composite.wgsl` と一致させる）。
pub(crate) const BINDING_Y_TEXTURE: u32 = 0;
pub(crate) const BINDING_CBCR_TEXTURE: u32 = 1;
pub(crate) const BINDING_NV12_PARAMS: u32 = 2;
pub(crate) const BINDING_RENDER_PARAMS: u32 = 3;

/// RGBA 用 `create_pipeline_for_format` と同じ blend state / 頂点シェーダ /
/// 出力フォーマットを使う NV12 版パイプラインを作成する。同一レンダーパス内
/// で RGBA パイプラインと NV12 パイプラインを `set_pipeline` で切り替えても
/// 合成結果（premultiplied over ブレンド）が一致することが compositing
/// parity の前提になる。
pub(crate) fn create_nv12_pipeline_for_format(
    device: &wgpu::Device,
    output_format: wgpu::TextureFormat,
) -> (wgpu::BindGroupLayout, wgpu::RenderPipeline) {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("UXFD native wgpu nv12 shader"),
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!(
            "../../../shared-renderer/shaders/nv12_composite.wgsl"
        ))),
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("UXFD native wgpu nv12 bind group layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: BINDING_Y_TEXTURE,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: BINDING_CBCR_TEXTURE,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: BINDING_NV12_PARAMS,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: BINDING_RENDER_PARAMS,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("UXFD native wgpu nv12 pipeline layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("UXFD native wgpu nv12 pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: "vs_main",
            buffers: &[],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format: output_format,
                blend: Some(wgpu::BlendState {
                    color: wgpu::BlendComponent {
                        src_factor: wgpu::BlendFactor::One,
                        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                        operation: wgpu::BlendOperation::Add,
                    },
                    alpha: wgpu::BlendComponent {
                        src_factor: wgpu::BlendFactor::One,
                        dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                        operation: wgpu::BlendOperation::Add,
                    },
                }),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
    });

    (bind_group_layout, pipeline)
}

/// NV12 クリップ 1 枚分の uniform buffer 群と bind group を組み立てる。
/// RGBA 版 `build_prepared_clip_bind_group` と同様、テクスチャ自体
/// （Y/CbCr plane import 結果）は呼び出し側が使い回す前提。
pub(crate) fn build_prepared_nv12_clip_bind_group(
    device: &wgpu::Device,
    bind_group_layout: &wgpu::BindGroupLayout,
    y_view: &wgpu::TextureView,
    cbcr_view: &wgpu::TextureView,
    nv12_params: Nv12Params,
    render_params: RenderParams,
) -> PreparedClip {
    use wgpu::util::DeviceExt;

    let nv12_params_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("UXFD native wgpu nv12 params buffer"),
        contents: bytemuck::bytes_of(&nv12_params),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let render_params_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("UXFD native wgpu nv12 render params buffer"),
        contents: bytemuck::bytes_of(&render_params),
        usage: wgpu::BufferUsages::UNIFORM,
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("UXFD native wgpu nv12 bind group"),
        layout: bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: BINDING_Y_TEXTURE,
                resource: wgpu::BindingResource::TextureView(y_view),
            },
            wgpu::BindGroupEntry {
                binding: BINDING_CBCR_TEXTURE,
                resource: wgpu::BindingResource::TextureView(cbcr_view),
            },
            wgpu::BindGroupEntry {
                binding: BINDING_NV12_PARAMS,
                resource: nv12_params_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: BINDING_RENDER_PARAMS,
                resource: render_params_buffer.as_entire_binding(),
            },
        ],
    });

    PreparedClip {
        bind_group,
        pipeline_kind: ClipPipelineKind::Nv12,
    }
}
