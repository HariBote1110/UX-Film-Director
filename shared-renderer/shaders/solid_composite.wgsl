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
    clipping_top: f32,
    clipping_bottom: f32,
    clipping_left: f32,
    clipping_right: f32,
    clipping_angle: f32,
    spot_light_colour_r: f32,
    spot_light_colour_g: f32,
    spot_light_colour_b: f32,
    spot_light_centre_x: f32,
    spot_light_centre_y: f32,
    spot_light_radius: f32,
    spot_light_intensity: f32,
    displacement_amount_x: f32,
    displacement_amount_y: f32,
    displacement_size: f32,
    displacement_strength: f32,
    fake_dof_focus_x: f32,
    fake_dof_focus_y: f32,
    fake_dof_focus_radius: f32,
    fake_dof_blur: f32,
    fake_dof_strength: f32,
    auto_blur_angle: f32,
    auto_blur_radius: f32,
    auto_blur_strength: f32,
    auto_blur_colour_shift: f32,
    stretch_angle: f32,
    stretch_amount: f32,
    stretch_strength: f32,
    multi_slicer_angle: f32,
    multi_slicer_offset: f32,
    multi_slicer_slices: f32,
    multi_slicer_expansion: f32,
    multi_slicer_strength: f32,
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
    _padding6: f32,
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
    if (!passes_clipping(source_position)) {
        return vec4<f32>(0.0);
    }

    let displaced_source_position = displaced_position(stretched_position(multi_sliced_position(source_position)));
    let source = sample_source_with_fake_dof(displaced_source_position);
    let aberration_offset = vec2<f32>(
        params.colour_aberration_offset_x,
        params.colour_aberration_offset_y,
    );
    let red_source = sample_source_with_fake_dof(clamp_source_position(displaced_source_position + aberration_offset)).r;
    let blue_source = sample_source_with_fake_dof(clamp_source_position(displaced_source_position - aberration_offset)).b;
    let alpha = source.a * params.opacity;
    let linear_rgb = vec3<f32>(red_source, source.g, blue_source);
    let premultiplied_rgb = linear_rgb * params.gain * alpha;
    let outline_alpha = outline_alpha_at(source_position, source.a) * params.outline_opacity * params.opacity;
    let outline_rgb = vec3<f32>(
        params.outline_colour_r,
        params.outline_colour_g,
        params.outline_colour_b,
    ) * outline_alpha;
    let spot_rgb = spot_light_rgb(source_position, alpha);

    return vec4<f32>(premultiplied_rgb + outline_rgb * (1.0 - alpha) + spot_rgb, max(alpha, outline_alpha));
}

fn displaced_position(source_position: vec2<f32>) -> vec2<f32> {
    if params.displacement_strength <= 0.0 {
        return source_position;
    }
    let size = max(params.displacement_size, 1.0);
    let phase = (source_position.y / size) * 6.28318530718;
    let wave = select(1.0, 0.5 + 0.5 * sin(phase), size > 1.0);
    let offset = vec2<f32>(
        params.displacement_amount_x,
        params.displacement_amount_y,
    ) * params.displacement_strength * wave;
    return clamp_source_position(source_position - offset);
}

fn stretched_position(source_position: vec2<f32>) -> vec2<f32> {
    if params.stretch_strength <= 0.0 || params.stretch_amount <= 0.0 {
        return source_position;
    }
    let centre = vec2<f32>(params.source_width - 1.0, params.source_height - 1.0) * 0.5;
    let direction = vec2<f32>(cos(params.stretch_angle), sin(params.stretch_angle));
    let perpendicular = vec2<f32>(-direction.y, direction.x);
    let relative = source_position - centre;
    let along = dot(relative, direction);
    let across = dot(relative, perpendicular);
    let scale = 1.0 + params.stretch_amount * params.stretch_strength;
    return clamp_source_position(centre + direction * (along / scale) + perpendicular * across);
}

fn multi_sliced_position(source_position: vec2<f32>) -> vec2<f32> {
    if params.multi_slicer_strength <= 0.0 || params.multi_slicer_offset <= 0.0 || params.multi_slicer_slices < 2.0 {
        return source_position;
    }
    let direction = vec2<f32>(cos(params.multi_slicer_angle), sin(params.multi_slicer_angle));
    let perpendicular = vec2<f32>(-direction.y, direction.x);
    let centre = vec2<f32>(params.source_width - 1.0, params.source_height - 1.0) * 0.5;
    let span = max(abs(dot(vec2<f32>(params.source_width, params.source_height), abs(perpendicular))), 1.0);
    let relative = source_position - centre;
    let slice_coord = dot(relative, perpendicular) + span * 0.5;
    let slice_size = max(span / max(params.multi_slicer_slices, 2.0), 1.0);
    let slice_index = floor(slice_coord / slice_size);
    let sign = select(-1.0, 1.0, (slice_index - floor(slice_index / 2.0) * 2.0) < 0.5);
    let offset = direction * sign * (params.multi_slicer_offset + params.multi_slicer_expansion) * params.multi_slicer_strength;
    return clamp_source_position(source_position + offset);
}

fn sample_source_with_fake_dof(source_position: vec2<f32>) -> vec4<f32> {
    let base = sample_source_with_auto_blur(source_position);
    if params.fake_dof_strength <= 0.0 || params.fake_dof_blur <= 0.0 {
        return base;
    }
    let dimensions = max(vec2<f32>(params.source_width - 1.0, params.source_height - 1.0), vec2<f32>(1.0));
    let normalised = source_position / dimensions;
    let focus = vec2<f32>(params.fake_dof_focus_x, params.fake_dof_focus_y);
    let focus_distance = max(0.0, length(normalised - focus) - max(params.fake_dof_focus_radius, 0.01));
    let factor = clamp(focus_distance * 4.0, 0.0, 1.0) * params.fake_dof_strength;
    if factor <= 0.0 {
        return base;
    }
    let radius = max(params.fake_dof_blur, 0.0);
    let left = sample_source_with_auto_blur(clamp_source_position(source_position - vec2<f32>(radius, 0.0)));
    let right = sample_source_with_auto_blur(clamp_source_position(source_position + vec2<f32>(radius, 0.0)));
    return mix(base, (left + right) * 0.5, factor);
}

fn sample_source_with_auto_blur(source_position: vec2<f32>) -> vec4<f32> {
    let base = sample_source_linear(source_position);
    if params.auto_blur_strength <= 0.0 || params.auto_blur_radius <= 0.0 {
        return base;
    }
    let direction = vec2<f32>(cos(params.auto_blur_angle), sin(params.auto_blur_angle));
    let offset = direction * params.auto_blur_radius;
    let back = sample_source_linear(clamp_source_position(source_position - offset));
    let forward = sample_source_linear(clamp_source_position(source_position + offset));
    let blurred = (back + forward) * 0.5;
    return mix(base, blurred, params.auto_blur_strength);
}

fn spot_light_rgb(source_position: vec2<f32>, source_alpha: f32) -> vec3<f32> {
    if params.spot_light_intensity <= 0.0 || params.spot_light_radius <= 0.0 || source_alpha <= 0.0 {
        return vec3<f32>(0.0);
    }
    let dimensions = max(vec2<f32>(params.source_width, params.source_height), vec2<f32>(1.0));
    let normalised = source_position / dimensions;
    let centre = vec2<f32>(params.spot_light_centre_x, params.spot_light_centre_y);
    let distance_from_centre = length(normalised - centre);
    let radius = max(params.spot_light_radius, 0.0001);
    let falloff = pow(clamp(1.0 - distance_from_centre / radius, 0.0, 1.0), 2.0);
    let colour = vec3<f32>(
        params.spot_light_colour_r,
        params.spot_light_colour_g,
        params.spot_light_colour_b,
    );
    return colour * falloff * params.spot_light_intensity * source_alpha;
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

fn passes_clipping(source_position: vec2<f32>) -> bool {
    let dimensions = vec2<f32>(params.source_width, params.source_height);
    let centre = dimensions * 0.5;
    let p = source_position - centre;
    let c = cos(-params.clipping_angle);
    let s = sin(-params.clipping_angle);
    let p_rot = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
    let p_check = p_rot + centre;
    let top_limit = params.clipping_top;
    let bottom_limit = dimensions.y - params.clipping_bottom;
    let left_limit = params.clipping_left;
    let right_limit = dimensions.x - params.clipping_right;
    return !(
        p_check.y < top_limit
        || p_check.y > bottom_limit
        || p_check.x < left_limit
        || p_check.x > right_limit
    );
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
