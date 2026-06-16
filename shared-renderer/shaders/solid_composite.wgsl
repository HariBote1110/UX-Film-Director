struct RenderParams {
    opacity: f32,
    gain: f32,
    _padding0: f32,
    _padding1: f32,
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
    let pixel = vec2<i32>(position.xy);
    let source = textureLoad(source_texture, pixel, 0);
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
