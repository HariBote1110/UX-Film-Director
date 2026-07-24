struct HologramUniform {
  dimensions: vec2<f32>,
  tile_size: f32,
  colour_mode: u32,
  rotation: vec2<f32>,
  gradient: vec2<f32>,
  tint: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: HologramUniform;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
  var position = vec2<f32>(-1.0, -1.0);
  switch vertex_index {
    case 1u: { position = vec2<f32>(1.0, -1.0); }
    case 2u, 3u: { position = vec2<f32>(-1.0, 1.0); }
    case 4u: { position = vec2<f32>(1.0, -1.0); }
    case 5u: { position = vec2<f32>(1.0, 1.0); }
    default: {}
  }
  return vec4<f32>(position, 0.0, 1.0);
}

fn blend_colour(left: vec3<f32>, right: vec3<f32>, right_weight: f32) -> vec3<f32> {
  return mix(left, right, right_weight);
}

fn positive_modulo(value: f32, modulus: f32) -> f32 {
  return value - floor(value / modulus) * modulus;
}

fn hsv_to_rgb(hue: f32, saturation: f32, value: f32) -> vec3<f32> {
  let chroma = value * saturation;
  let hue_sector = positive_modulo(hue, 360.0) / 60.0;
  let secondary = chroma * (1.0 - abs(positive_modulo(hue_sector, 2.0) - 1.0));
  var rgb = vec3<f32>(0.0);
  if hue_sector < 1.0 {
    rgb = vec3<f32>(chroma, secondary, 0.0);
  } else if hue_sector < 2.0 {
    rgb = vec3<f32>(secondary, chroma, 0.0);
  } else if hue_sector < 3.0 {
    rgb = vec3<f32>(0.0, chroma, secondary);
  } else if hue_sector < 4.0 {
    rgb = vec3<f32>(0.0, secondary, chroma);
  } else if hue_sector < 5.0 {
    rgb = vec3<f32>(secondary, 0.0, chroma);
  } else {
    rgb = vec3<f32>(chroma, 0.0, secondary);
  }
  return rgb + vec3<f32>(value - chroma);
}

fn band_colour(band: f32, stripe_phase: f32) -> vec3<f32> {
  let base = vec3<f32>(118.0, 122.0, 130.0) / 255.0;
  let cool = vec3<f32>(122.0, 210.0, 255.0) / 255.0;
  let warm = vec3<f32>(255.0, 118.0, 172.0) / 255.0;
  let white = vec3<f32>(242.0, 248.0, 255.0) / 255.0;
  let shadow = vec3<f32>(20.0, 22.0, 28.0) / 255.0;
  let dark = vec3<f32>(48.0, 52.0, 62.0) / 255.0;

  var colour = base;
  if band < 0.10 {
    colour = shadow;
  } else if band < 0.18 {
    colour = cool;
  } else if band < 0.30 {
    colour = white;
  } else if band < 0.43 {
    colour = blend_colour(base, params.tint.rgb, 0.18);
  } else if band < 0.52 {
    colour = dark;
  } else if band < 0.66 {
    colour = warm;
  } else if band < 0.78 {
    colour = blend_colour(base, cool, 0.35);
  } else {
    colour = blend_colour(base, white, 0.30);
  }

  if stripe_phase < 0.045 {
    return blend_colour(colour, vec3<f32>(1.0), 0.55);
  }
  if stripe_phase > 0.455 {
    return blend_colour(colour, vec3<f32>(0.0), 0.35);
  }
  return colour;
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let point = position.xy - params.dimensions * 0.5;
  let rotated = vec2<f32>(
    point.x * params.rotation.x - point.y * params.rotation.y,
    point.x * params.rotation.y + point.y * params.rotation.x,
  );
  let band = positive_modulo(rotated.x + rotated.y * 0.65, params.tile_size)
    / params.tile_size;
  let stripe_phase = abs(
    positive_modulo(rotated.x, params.tile_size) / params.tile_size - 0.5,
  );
  var colour = band_colour(band, stripe_phase);
  if params.colour_mode == 1u {
    colour = blend_colour(colour, params.tint.rgb, 0.18);
  } else if params.colour_mode == 2u {
    let longest_side = max(params.dimensions.x, params.dimensions.y);
    let gradient_position = positive_modulo(
      dot(point, params.gradient) / longest_side + 0.5,
      1.0,
    );
    colour = blend_colour(
      colour,
      hsv_to_rgb(gradient_position * 360.0, 0.72, 1.0),
      0.46,
    );
  }
  return vec4<f32>(colour, 1.0);
}
