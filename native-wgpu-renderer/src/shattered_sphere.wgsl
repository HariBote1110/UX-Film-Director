struct ShatteredSphereUniform {
  dimensions_frame_radius: vec4<f32>,
  fracture_delay_thickness_size: vec4<f32>,
  motion: vec4<f32>,
  gravity_diffusion: vec4<f32>,
  colour: vec4<f32>,
  seed_grid: vec4<u32>,
};

@group(0) @binding(0) var<uniform> params: ShatteredSphereUniform;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(flat) colour: vec4<f32>,
  @location(1) @interpolate(flat) visible: u32,
};

fn add64(left: vec2<u32>, right: vec2<u32>) -> vec2<u32> {
  let low = left.x + right.x;
  let carry = select(0u, 1u, low < left.x);
  return vec2<u32>(low, left.y + right.y + carry);
}

fn multiply_u32_full(left: u32, right: u32) -> vec2<u32> {
  let left_low = left & 0xffffu;
  let left_high = left >> 16u;
  let right_low = right & 0xffffu;
  let right_high = right >> 16u;
  let low_product = left_low * right_low;
  let middle_low = (low_product >> 16u)
    + ((left_high * right_low) & 0xffffu)
    + ((left_low * right_high) & 0xffffu);
  let low = (low_product & 0xffffu) | ((middle_low & 0xffffu) << 16u);
  let high = left_high * right_high
    + ((left_high * right_low) >> 16u)
    + ((left_low * right_high) >> 16u)
    + (middle_low >> 16u);
  return vec2<u32>(low, high);
}

fn multiply64(left: vec2<u32>, right: vec2<u32>) -> vec2<u32> {
  let low_product = multiply_u32_full(left.x, right.x);
  return vec2<u32>(
    low_product.x,
    low_product.y + left.x * right.y + left.y * right.x,
  );
}

fn shift_right64(value: vec2<u32>, shift: u32) -> vec2<u32> {
  return vec2<u32>(
    (value.x >> shift) | (value.y << (32u - shift)),
    value.y >> shift,
  );
}

fn generated_particle_unit(seed: vec2<u32>, index: u32, lane: u32) -> f32 {
  let index_factor = vec2<u32>(0x7f4a7c15u, 0x9e3779b9u);
  let lane_factor = vec2<u32>(0x1ce4e5b9u, 0xbf58476du);
  var value = vec2<u32>(
    seed.x ^ multiply64(vec2<u32>(index, 0u), index_factor).x
      ^ multiply64(vec2<u32>(lane, 0u), lane_factor).x,
    seed.y ^ multiply64(vec2<u32>(index, 0u), index_factor).y
      ^ multiply64(vec2<u32>(lane, 0u), lane_factor).y,
  );
  value = vec2<u32>(value.x ^ shift_right64(value, 30u).x, value.y ^ shift_right64(value, 30u).y);
  value = multiply64(value, lane_factor);
  value = vec2<u32>(value.x ^ shift_right64(value, 27u).x, value.y ^ shift_right64(value, 27u).y);
  value = multiply64(value, vec2<u32>(0x133111ebu, 0x94d049bbu));
  value = vec2<u32>(value.x ^ shift_right64(value, 31u).x, value.y ^ shift_right64(value, 31u).y);
  let numerator = f32(value.y) * 4294967296.0 + f32(value.x);
  return numerator / 18446744073709551615.0;
}

fn fragment_point(index: u32, corner: u32, centre: vec2<f32>, size: f32, rotation: f32, random_shape: f32, seed: vec2<u32>) -> vec2<f32> {
  let angle = rotation + 0.7853981633974483 + f32(corner) * 1.5707963267948966;
  let jitter = clamp(random_shape / 100.0, 0.0, 1.0);
  let radius = size * (0.55 + (generated_particle_unit(seed, index, 51u + corner) - 0.5) * jitter * 0.38);
  return centre + vec2<f32>(cos(angle), sin(angle)) * radius;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
  let dimensions = params.dimensions_frame_radius.xy;
  let frame = params.dimensions_frame_radius.z;
  let radius = params.dimensions_frame_radius.w;
  let fragment_size = params.fracture_delay_thickness_size.w;
  let columns = params.seed_grid.z;
  let row = instance_index / columns;
  let column = instance_index % columns;
  let cell_x = (f32(column) + 0.5) / f32(columns) * 2.0 - 1.0;
  let cell_y = (f32(row) + 0.5) / f32(columns) * 2.0 - 1.0;
  let distance_squared = cell_x * cell_x + cell_y * cell_y;
  let seed = params.seed_grid.xy;
  let time = frame / 60.0;
  let delay_seconds = generated_particle_unit(seed, instance_index, 41u)
    * params.fracture_delay_thickness_size.y / 60.0;
  let local_time = max(time - delay_seconds, 0.0);
  let effect_strength = clamp(params.fracture_delay_thickness_size.x / 100.0, 0.0, 50.0);
  let progress = clamp(
    local_time * (0.55 + params.motion.y / 120.0) * effect_strength,
    0.0,
    1.5,
  );
  let z = sqrt(max(1.0 - distance_squared, 0.0));
  let base = dimensions * 0.5 + vec2<f32>(cell_x, cell_y) * radius;
  let diffusion = params.gravity_diffusion.z / 100.0;
  let random_angle = generated_particle_unit(seed, instance_index, 11u) * 6.283185307179586;
  let random_distance = generated_particle_unit(seed, instance_index, 12u) * diffusion;
  let direction = vec2<f32>(cell_x, cell_y) * 0.72
    + vec2<f32>(cos(random_angle), sin(random_angle)) * random_distance;
  let outward = params.motion.x + params.motion.z * 0.35 + params.motion.y * 0.25;
  let gravity = params.gravity_diffusion.xy * progress * progress * 0.035;
  let centre = base + direction * outward * progress + gravity
    - vec2<f32>(0.0, z * params.fracture_delay_thickness_size.z * 0.12);
  let scale = max(1.0 + z * params.fracture_delay_thickness_size.z / 160.0, 0.2);
  let size = fragment_size * scale
    * (0.45 + generated_particle_unit(seed, instance_index, 13u) * 0.35)
    * (1.0 - min(progress * 0.18, 0.55));
  let rotation = generated_particle_unit(seed, instance_index, 14u) * 6.283185307179586
    + frame * params.motion.w / 6000.0;
  let triangle_index = vertex_index / 3u;
  let corner_index = vertex_index % 3u;
  var pixel = centre;
  if corner_index == 1u {
    pixel = fragment_point(instance_index, triangle_index, centre, size, rotation, params.gravity_diffusion.w, seed);
  } else if corner_index == 2u {
    pixel = fragment_point(instance_index, (triangle_index + 1u) % 4u, centre, size, rotation, params.gravity_diffusion.w, seed);
  }
  let light = clamp(0.58 + z * 0.42 - progress * 0.12, 0.28, 1.15);
  let rgb = round(params.colour.rgb * 255.0 * light) / 255.0;
  let alpha = clamp(round(255.0 * (1.0 - max(progress - 0.75, 0.0) * 0.22)), 64.0, 255.0) / 255.0;
  let ndc = vec2<f32>(
    pixel.x / dimensions.x * 2.0 - 1.0,
    1.0 - pixel.y / dimensions.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4<f32>(ndc, 0.0, 1.0);
  output.colour = vec4<f32>(rgb, alpha);
  output.visible = select(0u, 1u, distance_squared <= 1.0);
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  if input.visible == 0u {
    discard;
  }
  return input.colour;
}
