struct RenderParams {
    opacity: f32,
    gain: f32,
    source_width: f32,
    source_height: f32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
    sampling_mode: f32,
    rotation_cos: f32,
    rotation_sin: f32,
    _padding0: f32,
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

    let source = sample_source_linear(source_position);
    let alpha = source.a * params.opacity;
    let linear_rgb = source.rgb;
    let premultiplied_rgb = linear_rgb * params.gain * alpha;

    return vec4<f32>(premultiplied_rgb, alpha);
}

fn sample_source_linear(source_position: vec2<f32>) -> vec4<f32> {
    if params.sampling_mode >= 0.5 {
        return sample_bilinear_linear(source_position);
    }

    return load_source_linear(vec2<i32>(floor(source_position)));
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
