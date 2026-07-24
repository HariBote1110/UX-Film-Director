struct AudioReactiveUniform {
  dimensions: vec2<f32>,
  sample_len: u32,
  sample_step: u32,
  amplitude: f32,
  thickness: f32,
  padding: vec2<f32>,
  colour: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: AudioReactiveUniform;
@group(0) @binding(1) var<storage, read> samples: array<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
  var corner = vec2<f32>(0.0, 0.0);
  switch vertex_index {
    case 1u: { corner = vec2<f32>(1.0, 0.0); }
    case 2u, 3u: { corner = vec2<f32>(0.0, 1.0); }
    case 4u: { corner = vec2<f32>(1.0, 0.0); }
    case 5u: { corner = vec2<f32>(1.0, 1.0); }
    default: {}
  }
  let sample_index = min(instance_index * params.sample_step, params.sample_len - 1u);
  let sample = clamp(samples[sample_index], -1.0, 1.0);
  let centre_y = clamp(
    params.dimensions.y * 0.5 + sample * params.dimensions.y * 0.5 * params.amplitude,
    0.0,
    params.dimensions.y,
  );
  let radius = floor((max(round(params.thickness), 1.0) - 1.0) * 0.5);
  let pixel_position = vec2<f32>(f32(instance_index), round(centre_y) - radius)
    + corner * vec2<f32>(1.0, radius * 2.0 + 1.0);
  let ndc = vec2<f32>(
    pixel_position.x / params.dimensions.x * 2.0 - 1.0,
    1.0 - pixel_position.y / params.dimensions.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4<f32>(ndc, 0.0, 1.0);
  return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return params.colour;
}
