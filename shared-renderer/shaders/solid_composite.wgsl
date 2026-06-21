struct RenderParams {
    opacity: f32,
    gain: f32,
    colour_aberration_offset_x: f32,
    colour_aberration_offset_y: f32,
    outline_colour_r: f32,
    outline_colour_g: f32,
    outline_colour_b: f32,
    outline_thickness: f32,
    outline_opacity: f32,
    wipe_edge: f32,
    wipe_progress: f32,
    _padding0: f32,
    source_width: f32,
    source_height: f32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
    sampling_mode: f32,
    rotation_cos: f32,
    rotation_sin: f32,
    _padding3: f32,
    _padding4: f32,
    _padding5: f32,
}

@group(0) @binding(0)
var source_texture: texture_2d<f32>;

@group(0) @binding(1)
var<uniform> params: RenderParams;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );

    return vec4<f32>(positions[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let output_pixel = vec2<f32>(vec2<i32>(position.xy));
    let translated = output_pixel - vec2<f32>(params.translation_x, params.translation_y);
    let source_position = vec2<f32>(
        translated.x * params.rotation_cos + translated.y * params.rotation_sin,
        -translated.x * params.rotation_sin + translated.y * params.rotation_cos,
    ) / vec2<f32>(params.scale_x, params.scale_y);

    if (
        source_position.x < 0.0
        || source_position.y < 0.0
        || source_position.x >= params.source_width
        || source_position.y >= params.source_height
    ) {
        return vec4<f32>(0.0);
    }

    if (!passes_wipe(source_position)) {
        return vec4<f32>(0.0);
    }

    let source = sample_source_linear(source_position);
    let aberration_offset = vec2<f32>(
        params.colour_aberration_offset_x,
        params.colour_aberration_offset_y,
    );
    let red_source = sample_source_linear(clamp_source_position(source_position + aberration_offset)).r;
    let blue_source = sample_source_linear(clamp_source_position(source_position - aberration_offset)).b;
    let alpha = source.a * params.opacity;
    let linear_rgb = vec3<f32>(red_source, source.g, blue_source);
    let premultiplied_rgb = linear_rgb * params.gain * alpha;
    let outline_alpha = outline_alpha_at(source_position, source.a) * params.outline_opacity * params.opacity;
    let outline_rgb = vec3<f32>(
        params.outline_colour_r,
        params.outline_colour_g,
        params.outline_colour_b,
    ) * outline_alpha;

    return vec4<f32>(premultiplied_rgb + outline_rgb * (1.0 - alpha), max(alpha, outline_alpha));
}

fn passes_wipe(source_position: vec2<f32>) -> bool {
    let progress = clamp(params.wipe_progress, 0.0, 1.0);
    if params.wipe_edge < 0.5 {
        return source_position.x < params.source_width * progress;
    }
    if params.wipe_edge < 1.5 {
        return source_position.x >= params.source_width * (1.0 - progress);
    }
    if params.wipe_edge < 2.5 {
        return source_position.y < params.source_height * progress;
    }
    return source_position.y >= params.source_height * (1.0 - progress);
}

fn clamp_source_position(source_position: vec2<f32>) -> vec2<f32> {
    return clamp(
        source_position,
        vec2<f32>(0.0, 0.0),
        vec2<f32>(params.source_width - 1.0, params.source_height - 1.0),
    );
}

fn sample_source_linear(source_position: vec2<f32>) -> vec4<f32> {
    if params.sampling_mode >= 0.5 {
        return sample_bilinear_linear(source_position);
    }

    return load_source_linear(vec2<i32>(floor(source_position)));
}

fn outline_alpha_at(source_position: vec2<f32>, source_alpha: f32) -> f32 {
    if params.outline_thickness <= 0.0 || params.outline_opacity <= 0.0 {
        return 0.0;
    }
    let t = params.outline_thickness;
    var neighbour_alpha = 0.0;
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position + vec2<f32>(t, 0.0))).a);
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position - vec2<f32>(t, 0.0))).a);
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position + vec2<f32>(0.0, t))).a);
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position - vec2<f32>(0.0, t))).a);
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position + vec2<f32>(t, t))).a);
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position - vec2<f32>(t, t))).a);
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position + vec2<f32>(t, -t))).a);
    neighbour_alpha = max(neighbour_alpha, sample_source_linear(clamp_source_position(source_position + vec2<f32>(-t, t))).a);
    return max(0.0, neighbour_alpha - source_alpha);
}

fn sample_bilinear_linear(source_position: vec2<f32>) -> vec4<f32> {
    let source_floor = floor(source_position);
    let texel_min = vec2<i32>(source_floor);
    let texel_max = vec2<i32>(
        min(source_floor + vec2<f32>(1.0), vec2<f32>(params.source_width - 1.0, params.source_height - 1.0))
    );
    let amount = source_position - source_floor;

    let top = mix(
        load_source_linear(texel_min),
        load_source_linear(vec2<i32>(texel_max.x, texel_min.y)),
        amount.x,
    );
    let bottom = mix(
        load_source_linear(vec2<i32>(texel_min.x, texel_max.y)),
        load_source_linear(texel_max),
        amount.x,
    );

    return mix(top, bottom, amount.y);
}

fn load_source_linear(pixel: vec2<i32>) -> vec4<f32> {
    let source = textureLoad(source_texture, pixel, 0);
    return vec4<f32>(
        srgb_to_linear(source.r),
        srgb_to_linear(source.g),
        srgb_to_linear(source.b),
        source.a,
    );
}

fn srgb_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        return value / 12.92;
    }

    return pow((value + 0.055) / 1.055, 2.4);
}
