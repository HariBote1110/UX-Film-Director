struct FocusLinesUniform {
  dimensions: vec2<f32>,
  padding: vec2<f32>,
  colour: vec4<f32>,
};

struct FocusLinesQuad {
  points: array<vec2<f32>, 4>,
};

@group(0) @binding(0) var<uniform> params: FocusLinesUniform;
@group(0) @binding(1) var<storage, read> quads: array<FocusLinesQuad>;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> @builtin(position) vec4<f32> {
  var point_index = 0u;
  switch vertex_index {
    case 1u: { point_index = 1u; }
    case 2u, 4u: { point_index = 2u; }
    case 5u: { point_index = 3u; }
    default: {}
  }
  let pixel = quads[instance_index].points[point_index];
  let ndc = vec2<f32>(
    pixel.x / params.dimensions.x * 2.0 - 1.0,
    1.0 - pixel.y / params.dimensions.y * 2.0,
  );
  return vec4<f32>(ndc, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return params.colour;
}
