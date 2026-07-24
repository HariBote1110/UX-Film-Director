struct ParticleUniform {
  dimensions: vec2<f32>,
  speed: f32,
  lifetime_seconds: f32,
  source_seconds: f32,
  particle_size: f32,
  padding: vec2<f32>,
  colour: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: ParticleUniform;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) particle: vec3<f32>,
) -> VertexOutput {
  var corner = vec2<f32>(0.0, 0.0);
  switch vertex_index {
    case 1u: { corner = vec2<f32>(1.0, 0.0); }
    case 2u, 3u: { corner = vec2<f32>(0.0, 1.0); }
    case 4u: { corner = vec2<f32>(1.0, 0.0); }
    case 5u: { corner = vec2<f32>(1.0, 1.0); }
    default: {}
  }
  let lifetime_position = params.source_seconds % params.lifetime_seconds;
  let motion = params.speed * lifetime_position;
  let centre = params.dimensions * 0.5
    + particle.xy * (particle.z + motion);
  let pixel_centre = round(centre);
  let radius = floor((max(round(params.particle_size), 1.0) - 1.0) * 0.5);
  let top_left = pixel_centre - vec2<f32>(radius);
  let side = radius * 2.0 + 1.0;
  let pixel_position = top_left + corner * side;
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
