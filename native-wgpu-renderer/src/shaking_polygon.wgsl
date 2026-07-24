struct ShakingPolygonDimensions {
  dimensions: vec2<f32>,
  padding: vec2<f32>,
};

struct ShakingPolygonTriangle {
  points: array<vec2<f32>, 3>,
  padding: vec2<f32>,
  colour: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: ShakingPolygonDimensions;
@group(0) @binding(1) var<storage, read> triangles: array<ShakingPolygonTriangle>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(flat) colour: vec4<f32>,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
  let triangle = triangles[instance_index];
  var pixel = triangle.points[0];
  switch vertex_index {
    case 1u: { pixel = triangle.points[1]; }
    case 2u: { pixel = triangle.points[2]; }
    default: {}
  }
  let ndc = vec2<f32>(
    pixel.x / params.dimensions.x * 2.0 - 1.0,
    1.0 - pixel.y / params.dimensions.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4<f32>(ndc, 0.0, 1.0);
  output.colour = triangle.colour;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.colour;
}
