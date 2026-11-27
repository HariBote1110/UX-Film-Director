struct AudioReactiveUniform {
  dimensions: vec2<f32>,
  sample_len: u32,
  sample_step: u32,
  amplitude: f32,
  thickness: f32,
  mode: u32,
  columns: u32,
  rows: u32,
  sample_window_len: u32,
  audio_influence: f32,
  point_size: f32,
  random_amount: f32,
  padding: f32,
  seed: u32,
  seed_padding_0: u32,
  seed_padding_1: u32,
  seed_padding_2: u32,
  seed_padding_3: u32,
  seed_padding_4: u32,
  colour: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: AudioReactiveUniform;
@group(0) @binding(1) var<storage, read> samples: array<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) disc_position: vec2<f32>,
  @location(1) mode: f32,
};

fn random_unit(seed: u32, column: u32, row: u32) -> f32 {
  var value = seed ^ (column * 0x9e3779b9u) ^ (row * 0x85ebca6bu);
  value = value ^ (value >> 16u);
  value = value * 0x7feb352du;
  value = value ^ (value >> 15u);
  value = value * 0x846ca68bu;
  value = value ^ (value >> 16u);
  return f32(value) / 4294967295.0;
}

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
  var pixel_position = vec2<f32>(0.0, 0.0);
  var disc_position = vec2<f32>(0.0, 0.0);
  if params.mode == 1u {
    let column = instance_index / params.rows;
    let row = instance_index % params.rows;
    let sample_index = min(
      min(column * params.sample_window_len / params.columns, params.sample_window_len - 1u),
      params.sample_len - 1u,
    );
    let sample = clamp(abs(samples[sample_index]), 0.0, 1.0);
    let theta = 3.14159265359 * (f32(column) + 0.5) / f32(params.columns);
    let phi = 6.28318530718 * f32(row) / f32(params.rows)
      + random_unit(params.seed, column, row) * params.random_amount;
    let expansion = 1.0 + sample * params.audio_influence;
    let sphere_radius = min(params.dimensions.x, params.dimensions.y) * 0.38 * expansion;
    let x3 = sin(theta) * cos(phi);
    let y3 = cos(theta);
    let z3 = sin(theta) * sin(phi);
    let perspective = 0.72 + z3 * 0.28;
    let centre = params.dimensions * 0.5
      + vec2<f32>(x3, y3) * sphere_radius * perspective;
    let radius = max(
      params.point_size * (0.65 + sample * 1.4) * max(perspective, 0.35),
      0.5,
    );
    disc_position = corner * 2.0 - vec2<f32>(1.0, 1.0);
    pixel_position = centre + disc_position * radius;
  } else {
    let sample_index = min(instance_index * params.sample_step, params.sample_len - 1u);
    let sample = clamp(samples[sample_index], -1.0, 1.0);
    let centre_y = clamp(
      params.dimensions.y * 0.5 + sample * params.dimensions.y * 0.5 * params.amplitude,
      0.0,
      params.dimensions.y,
    );
    let radius = floor((max(round(params.thickness), 1.0) - 1.0) * 0.5);
    pixel_position = vec2<f32>(f32(instance_index), round(centre_y) - radius)
      + corner * vec2<f32>(1.0, radius * 2.0 + 1.0);
  }
  let ndc = vec2<f32>(
    pixel_position.x / params.dimensions.x * 2.0 - 1.0,
    1.0 - pixel_position.y / params.dimensions.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4<f32>(ndc, 0.0, 1.0);
  output.disc_position = disc_position;
  output.mode = f32(params.mode);
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  if input.mode > 0.5 && dot(input.disc_position, input.disc_position) > 1.0 {
    discard;
  }
  return params.colour;
}
