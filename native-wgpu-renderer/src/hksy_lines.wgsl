struct HksyLineDimensions {
  dimensions: vec2<f32>,
  padding: vec2<f32>,
};

struct HksyLineInstance {
  start: vec2<f32>,
  end: vec2<f32>,
  radius: f32,
  padding_0: f32,
  padding_1: f32,
  padding_2: f32,
  colour: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: HksyLineDimensions;
@group(0) @binding(1) var<storage, read> instances: array<HksyLineInstance>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(flat) start: vec2<f32>,
  @location(1) @interpolate(flat) end: vec2<f32>,
  @location(2) @interpolate(flat) radius: f32,
  @location(3) @interpolate(flat) colour: vec4<f32>,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
  let instance = instances[instance_index];
  let minimum = min(instance.start, instance.end) - vec2<f32>(instance.radius);
  let maximum = max(instance.start, instance.end) + vec2<f32>(instance.radius);
  var corner = vec2<f32>(0.0, 0.0);
  switch vertex_index {
    case 1u: { corner = vec2<f32>(1.0, 0.0); }
    case 2u, 3u: { corner = vec2<f32>(0.0, 1.0); }
    case 4u: { corner = vec2<f32>(1.0, 0.0); }
    case 5u: { corner = vec2<f32>(1.0, 1.0); }
    default: {}
  }
  let pixel = mix(minimum, maximum, corner);
  let ndc = vec2<f32>(
    pixel.x / params.dimensions.x * 2.0 - 1.0,
    1.0 - pixel.y / params.dimensions.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4<f32>(ndc, 0.0, 1.0);
  output.start = instance.start;
  output.end = instance.end;
  output.radius = instance.radius;
  output.colour = instance.colour;
  return output;
}

fn distance_to_segment(point: vec2<f32>, start: vec2<f32>, end: vec2<f32>) -> f32 {
  let segment = end - start;
  let length_squared = dot(segment, segment);
  if length_squared <= 0.000001 {
    return distance(point, start);
  }
  let t = clamp(dot(point - start, segment) / length_squared, 0.0, 1.0);
  return distance(point, start + segment * t);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  if distance_to_segment(input.position.xy, input.start, input.end) > input.radius {
    discard;
  }
  return input.colour;
}
