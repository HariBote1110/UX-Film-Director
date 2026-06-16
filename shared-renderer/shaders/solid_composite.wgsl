struct RenderParams {
    opacity: f32,
    gain: f32,
    source_width: f32,
    source_height: f32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
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
    let source_pixel = floor(
        (output_pixel - vec2<f32>(params.translation_x, params.translation_y))
            / vec2<f32>(params.scale_x, params.scale_y)
    );

    if (
        source_pixel.x < 0.0
        || source_pixel.y < 0.0
        || source_pixel.x >= params.source_width
        || source_pixel.y >= params.source_height
    ) {
        return vec4<f32>(0.0);
    }

    let source = textureLoad(source_texture, vec2<i32>(source_pixel), 0);
    let alpha = source.a * params.opacity;
    let linear_rgb = vec3<f32>(
        srgb_to_linear(source.r),
        srgb_to_linear(source.g),
        srgb_to_linear(source.b),
    );
    let premultiplied_rgb = linear_rgb * params.gain * alpha;

    return vec4<f32>(premultiplied_rgb, alpha);
}

fn srgb_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        return value / 12.92;
    }

    return pow((value + 0.055) / 1.055, 2.4);
}
