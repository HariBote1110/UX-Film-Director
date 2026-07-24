struct GetColorUniform {
  dimensions: vec2<f32>,
  sample_dimensions: vec2<f32>,
  stroke_width: f32,
  dot_shape: u32,
  sample_strength: f32,
  sample_hue_shift_degrees: f32,
  has_sample: u32,
  padding_0: u32,
  padding_1: u32,
  padding_2: u32,
  background: vec4<f32>,
};

struct GetColorInstance {
  centre: vec2<f32>,
  radius: f32,
  u: f32,
  v: f32,
  padding_0: f32,
  padding_1: f32,
  padding_2: f32,
  fallback_colour: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: GetColorUniform;
@group(0) @binding(1) var<storage, read> instances: array<GetColorInstance>;
@group(0) @binding(2) var sample_texture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) local_position: vec2<f32>,
  @location(1) @interpolate(flat) radius: f32,
  @location(2) @interpolate(flat) sample_uv: vec2<f32>,
  @location(3) @interpolate(flat) fallback_colour: vec4<f32>,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
  var corner = vec2<f32>(-1.0, -1.0);
  switch vertex_index {
    case 1u: { corner = vec2<f32>(1.0, -1.0); }
    case 2u, 3u: { corner = vec2<f32>(-1.0, 1.0); }
    case 4u: { corner = vec2<f32>(1.0, -1.0); }
    case 5u: { corner = vec2<f32>(1.0, 1.0); }
    default: {}
  }
  let instance = instances[instance_index];
  let pixel_position = instance.centre + corner * instance.radius;
  let ndc = vec2<f32>(
    pixel_position.x / params.dimensions.x * 2.0 - 1.0,
    1.0 - pixel_position.y / params.dimensions.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4<f32>(ndc, 0.0, 1.0);
  output.local_position = corner;
  output.radius = instance.radius;
  output.sample_uv = vec2<f32>(instance.u, instance.v);
  output.fallback_colour = instance.fallback_colour;
  return output;
}

fn rgb_to_hsv(colour: vec3<f32>) -> vec3<f32> {
  let maximum = max(colour.r, max(colour.g, colour.b));
  let minimum = min(colour.r, min(colour.g, colour.b));
  let delta = maximum - minimum;
  var hue = 0.0;
  if delta > 0.000001 {
    if maximum == colour.r {
      hue = 60.0 * ((colour.g - colour.b) / delta);
    } else if maximum == colour.g {
      hue = 60.0 * (((colour.b - colour.r) / delta) + 2.0);
    } else {
      hue = 60.0 * (((colour.r - colour.g) / delta) + 4.0);
    }
  }
  if hue < 0.0 {
    hue = hue + 360.0;
  }
  let saturation = select(0.0, delta / maximum, maximum > 0.000001);
  return vec3<f32>(hue, saturation, maximum);
}

fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
  let hue = ((hsv.x % 360.0) + 360.0) % 360.0;
  let chroma = hsv.z * hsv.y;
  let x = chroma * (1.0 - abs((hue / 60.0) % 2.0 - 1.0));
  var rgb = vec3<f32>(0.0);
  if hue < 60.0 {
    rgb = vec3<f32>(chroma, x, 0.0);
  } else if hue < 120.0 {
    rgb = vec3<f32>(x, chroma, 0.0);
  } else if hue < 180.0 {
    rgb = vec3<f32>(0.0, chroma, x);
  } else if hue < 240.0 {
    rgb = vec3<f32>(0.0, x, chroma);
  } else if hue < 300.0 {
    rgb = vec3<f32>(x, 0.0, chroma);
  } else {
    rgb = vec3<f32>(chroma, 0.0, x);
  }
  let match_value = hsv.z - chroma;
  return rgb + vec3<f32>(match_value);
}

fn inside_shape(local_position: vec2<f32>, radius: f32) -> bool {
  let delta = local_position * radius;
  if params.dot_shape == 1u {
    return max(abs(delta.x), abs(delta.y)) <= radius;
  }
  if params.dot_shape == 2u {
    return abs(delta.x) + abs(delta.y) <= radius;
  }
  return dot(delta, delta) <= radius * radius;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  if !inside_shape(input.local_position, input.radius) {
    discard;
  }
  let inner_radius = max(
    input.radius - clamp(params.stroke_width, 0.0, input.radius),
    0.0,
  );
  if params.stroke_width > 0.0 && inner_radius > 0.0 {
    let scaled_inner = input.local_position * input.radius / inner_radius;
    if inside_shape(scaled_inner, inner_radius) {
      return vec4<f32>(params.background.rgb, input.fallback_colour.a);
    }
  }

  var colour = input.fallback_colour;
  if params.has_sample == 1u && params.sample_strength > 0.0 {
    let sample_coordinate = vec2<i32>(
      i32(round((params.sample_dimensions.x - 1.0) * clamp(input.sample_uv.x, 0.0, 1.0))),
      i32(round((params.sample_dimensions.y - 1.0) * clamp(input.sample_uv.y, 0.0, 1.0))),
    );
    let sampled = textureLoad(sample_texture, sample_coordinate, 0);
    colour = mix(colour, sampled, params.sample_strength);
    if abs(params.sample_hue_shift_degrees) > 0.000001 {
      var hsv = rgb_to_hsv(colour.rgb);
      hsv.x = hsv.x + params.sample_hue_shift_degrees;
      colour = vec4<f32>(hsv_to_rgb(hsv), colour.a);
    }
  }
  return colour;
}
