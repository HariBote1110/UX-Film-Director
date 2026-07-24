struct HksyFillUniform {
  dimensions: vec2<f32>,
  cell_size: f32,
  line_radius: f32,
  pattern: u32,
  checker_enabled: u32,
  grid_enabled: u32,
  palette_count: u32,
  foreground: vec4<f32>,
  secondary: vec4<f32>,
  background: vec4<f32>,
  palette: array<vec4<f32>, 16>,
};

@group(0) @binding(0) var<uniform> params: HksyFillUniform;

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

fn distance_to_segment(point: vec2<f32>, start: vec2<f32>, end: vec2<f32>) -> f32 {
  let segment = end - start;
  let length_squared = dot(segment, segment);
  if length_squared <= 0.000001 {
    return distance(point, start);
  }
  let t = clamp(dot(point - start, segment) / length_squared, 0.0, 1.0);
  return distance(point, start + segment * t);
}

fn checker_grid_line(pixel: vec2<f32>) -> bool {
  if params.grid_enabled == 0u {
    return false;
  }
  let maximum_x_index = floor((params.dimensions.x - 1.0) / params.cell_size);
  let maximum_y_index = floor((params.dimensions.y - 1.0) / params.cell_size);
  let x_index = clamp(round(pixel.x / params.cell_size), 0.0, maximum_x_index);
  let y_index = clamp(round(pixel.y / params.cell_size), 0.0, maximum_y_index);
  let vertical_x = x_index * params.cell_size;
  let horizontal_y = y_index * params.cell_size;
  let vertical_distance = distance_to_segment(
    pixel,
    vec2<f32>(vertical_x, 0.0),
    vec2<f32>(vertical_x, params.dimensions.y - 1.0),
  );
  let horizontal_distance = distance_to_segment(
    pixel,
    vec2<f32>(0.0, horizontal_y),
    vec2<f32>(params.dimensions.x - 1.0, horizontal_y),
  );
  return min(vertical_distance, horizontal_distance) <= params.line_radius;
}

fn inside_asymmetric_diamond(
  pixel: vec2<f32>,
  centre: vec2<f32>,
  left_extent: f32,
  right_extent: f32,
  top_extent: f32,
  bottom_extent: f32,
) -> bool {
  let horizontal_extent = select(left_extent, right_extent, pixel.x >= centre.x);
  let vertical_extent = select(top_extent, bottom_extent, pixel.y >= centre.y);
  if horizontal_extent <= 0.000001 || vertical_extent <= 0.000001 {
    return false;
  }
  return abs(pixel.x - centre.x) / horizontal_extent
    + abs(pixel.y - centre.y) / vertical_extent <= 1.0;
}

fn diamond_pixel(pixel: vec2<f32>) -> vec4<f32> {
  if params.line_radius <= 0.0 {
    discard;
  }
  let centre = params.dimensions * 0.5;
  let longest_side = max(params.dimensions.x, params.dimensions.y);
  let inner_x = max(
    centre.x - (params.dimensions.x / longest_side) * params.line_radius * 2.0,
    0.0,
  );
  let inner_y = max(
    centre.y - (params.dimensions.y / longest_side) * params.line_radius * 2.0,
    0.0,
  );
  let inside_outer = inside_asymmetric_diamond(
    pixel,
    centre,
    centre.x,
    max(params.dimensions.x - 1.0 - centre.x, 0.0),
    centre.y,
    max(params.dimensions.y - 1.0 - centre.y, 0.0),
  );
  if !inside_outer {
    discard;
  }
  if inner_x > 0.000001 && inner_y > 0.000001 {
    let inside_inner = abs(pixel.x - centre.x) / inner_x
      + abs(pixel.y - centre.y) / inner_y <= 1.0;
    if inside_inner {
      discard;
    }
  }
  return params.foreground;
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = position.xy;
  if params.pattern == 1u {
    return diamond_pixel(pixel);
  }
  if checker_grid_line(pixel) {
    return params.secondary;
  }
  if params.checker_enabled == 0u {
    return params.background;
  }
  let tile_x = u32(floor(pixel.x / params.cell_size));
  let tile_y = u32(floor(pixel.y / params.cell_size));
  if params.palette_count > 0u {
    return params.palette[(tile_x + tile_y) % params.palette_count];
  }
  return select(params.background, params.foreground, (tile_x + tile_y) % 2u == 0u);
}
