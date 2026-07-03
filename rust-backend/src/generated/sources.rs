use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGradientSource {
    #[serde(rename = "type")]
    pub(crate) gradient_type: String,
    pub(crate) colours: Vec<String>,
    #[serde(default)]
    pub(crate) stops: Vec<f32>,
    #[serde(default)]
    pub(crate) direction: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedParticleSource {
    pub(crate) generator: String,
    pub(crate) seed: u64,
    pub(crate) particle_count: u32,
    pub(crate) spread: f32,
    pub(crate) speed: f32,
    pub(crate) size: f32,
    pub(crate) colour: String,
    pub(crate) lifetime_seconds: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedBarcodeSource {
    pub(crate) generator: String,
    pub(crate) data: String,
    pub(crate) minimum_bar_width: u32,
    pub(crate) horizontal_margin: u32,
    pub(crate) vertical_margin: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPuzzlePieceSource {
    pub(crate) generator: String,
    pub(crate) size: u32,
    pub(crate) shape_variant: u32,
    pub(crate) connector_mode: String,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedColourWheelSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) saturation: f32,
    pub(crate) brightness: f32,
    pub(crate) ring_width_percent: f32,
    pub(crate) segment_count: u32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGourdSource {
    pub(crate) generator: String,
    pub(crate) body_radius: u32,
    pub(crate) body_width: u32,
    pub(crate) waist_radius: u32,
    pub(crate) squash_percent: f32,
    pub(crate) repeat_count: u32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGearSource {
    pub(crate) generator: String,
    pub(crate) outer_radius: u32,
    pub(crate) inner_radius_percent: f32,
    pub(crate) tooth_count: u32,
    pub(crate) tooth_depth_percent: f32,
    pub(crate) tooth_skew_percent: f32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTrackBarSource {
    pub(crate) generator: String,
    pub(crate) track_values: Vec<f32>,
    pub(crate) track_ranges: Vec<[f32; 2]>,
    pub(crate) labels: Vec<String>,
    pub(crate) bar_colour: String,
    pub(crate) background_opacity: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPieChartSource {
    pub(crate) generator: String,
    pub(crate) values: Vec<f32>,
    pub(crate) sort_mode: String,
    pub(crate) normalise_to_hundred: bool,
    pub(crate) label_mode: String,
    pub(crate) progress_percent: f32,
    pub(crate) stroke_width: f32,
    pub(crate) slice_colours: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHistogramSource {
    pub(crate) generator: String,
    pub(crate) bin_values: Vec<f32>,
    pub(crate) height_scale_percent: f32,
    pub(crate) line_width: f32,
    pub(crate) show_luminance: bool,
    pub(crate) show_red: bool,
    pub(crate) show_green: bool,
    pub(crate) show_blue: bool,
    pub(crate) channel_colours: Vec<String>,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSunburstSource {
    pub(crate) generator: String,
    pub(crate) ray_count: u32,
    pub(crate) ray_coverage_percent: f32,
    pub(crate) rotation_offset_degrees: f32,
    pub(crate) centre_x_percent: f32,
    pub(crate) centre_y_percent: f32,
    pub(crate) motif_size: u32,
    pub(crate) motif_shape: String,
    pub(crate) ray_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedCircularArrowSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) line_width: u32,
    pub(crate) head_size: u32,
    pub(crate) angle_degrees: f32,
    pub(crate) centre_angle_degrees: f32,
    pub(crate) head_shape: String,
    pub(crate) show_tail_head: bool,
    pub(crate) flip_vertical: bool,
    pub(crate) flip_horizontal: bool,
    pub(crate) arrow_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTriangleBracketSource {
    pub(crate) generator: String,
    pub(crate) bracket_width: u32,
    pub(crate) angle_degrees: f32,
    pub(crate) arm_length: u32,
    pub(crate) offset_distance: i32,
    pub(crate) bracket_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedTartanCheckSource {
    pub(crate) generator: String,
    pub(crate) tile_size: u32,
    pub(crate) blur_radius: u32,
    pub(crate) base_colour: String,
    pub(crate) stripe_colour_a: String,
    pub(crate) stripe_colour_b: String,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHoundstoothSource {
    pub(crate) generator: String,
    pub(crate) pattern_size: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedYagasuriSource {
    pub(crate) generator: String,
    pub(crate) arrow_width: u32,
    pub(crate) arrow_height: u32,
    pub(crate) line_width: u32,
    pub(crate) staggered: bool,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPaperAirplaneSource {
    pub(crate) generator: String,
    pub(crate) body_length: u32,
    pub(crate) wing_width: u32,
    pub(crate) fold_height: u32,
    pub(crate) gap: u32,
    pub(crate) follow_motion_direction: bool,
    pub(crate) axis_mode: u32,
    pub(crate) fill_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedAsanohaPatternSource {
    pub(crate) generator: String,
    pub(crate) pattern_size: u32,
    pub(crate) line_width: u32,
    pub(crate) foreground_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedFocusLinesPlusSource {
    pub(crate) generator: String,
    pub(crate) ray_width: f32,
    pub(crate) gap: f32,
    pub(crate) centre_radius: f32,
    pub(crate) rotation_degrees: f32,
    pub(crate) centre_x: f32,
    pub(crate) centre_y: f32,
    pub(crate) centre_jitter_percent: f32,
    pub(crate) seed: i64,
    pub(crate) keyframe_interval: u64,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedRandomLineExSource {
    pub(crate) generator: String,
    pub(crate) line_count: u32,
    pub(crate) line_width: f32,
    pub(crate) threshold: u32,
    pub(crate) noise_cell_size: u32,
    pub(crate) width_variance: f32,
    pub(crate) seed: i64,
    pub(crate) line_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedContourTraceSource {
    pub(crate) generator: String,
    pub(crate) line_width: f32,
    pub(crate) contour_count: u32,
    pub(crate) jitter_amount: f32,
    pub(crate) trace_colour: String,
    pub(crate) background_opacity: f32,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedDisplacementPolySource {
    pub(crate) generator: String,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) displacement_scale: f32,
    pub(crate) depth_scale: f32,
    pub(crate) mesh_opacity: f32,
    pub(crate) fill_opacity: f32,
    pub(crate) line_colour: String,
    pub(crate) fill_colour: String,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedPlainEffectorLineSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) strength: f32,
    pub(crate) randomness: f32,
    pub(crate) zoom: f32,
    pub(crate) invert: bool,
    pub(crate) line_count: u32,
    pub(crate) line_width: f32,
    pub(crate) colour: String,
    pub(crate) colour_amount: f32,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHologramSource {
    pub(crate) generator: String,
    pub(crate) tile_size: u32,
    pub(crate) rotation_degrees: f32,
    pub(crate) gradient_angle_degrees: f32,
    pub(crate) colour_mode: u32,
    pub(crate) tint_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedProtractorSource {
    pub(crate) generator: String,
    pub(crate) radius: u32,
    pub(crate) measured_angle_degrees: f32,
    pub(crate) tick_step_degrees: u32,
    pub(crate) major_tick_step_degrees: u32,
    pub(crate) decimal_places: u32,
    pub(crate) line_colour: String,
    pub(crate) text_colour: String,
    pub(crate) shadow_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedShakingPolygonSource {
    pub(crate) generator: String,
    pub(crate) line_width: u32,
    pub(crate) vertex_count: u32,
    pub(crate) fixed_diameter: u32,
    pub(crate) vertical_distortion_percent: f32,
    pub(crate) repeat_count: u32,
    pub(crate) repeat_frequency: u32,
    pub(crate) fill: bool,
    pub(crate) jitter_range: f32,
    pub(crate) jitter_interval: u32,
    pub(crate) stepped: bool,
    pub(crate) colour: String,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedShatteredSphereSource {
    pub(crate) generator: String,
    pub(crate) fracture_amount: f32,
    pub(crate) delay: f32,
    pub(crate) radius: f32,
    pub(crate) limit_distance: f32,
    pub(crate) thickness: f32,
    pub(crate) fragment_size: f32,
    pub(crate) random_shape: f32,
    pub(crate) speed: f32,
    pub(crate) impact: f32,
    pub(crate) gravity: [f32; 3],
    pub(crate) spin: f32,
    pub(crate) direction_diffusion: f32,
    pub(crate) colour: String,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedToneCurveSource {
    pub(crate) generator: String,
    pub(crate) grid_divisions: u32,
    pub(crate) line_width: u32,
    pub(crate) curve_points: Vec<f32>,
    pub(crate) curve_colour: String,
    pub(crate) grid_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedGetColorDotsSource {
    pub(crate) generator: String,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) dot_size: f32,
    pub(crate) dot_shape: Option<String>,
    pub(crate) stroke_width: Option<f32>,
    pub(crate) size_influence: f32,
    pub(crate) luminance_influence: f32,
    pub(crate) hue_shift_degrees: f32,
    pub(crate) alternate_rows: bool,
    pub(crate) foreground_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_colour: String,
    pub(crate) source_image: Option<String>,
    pub(crate) source_active_layer_ids: Option<Vec<String>>,
    pub(crate) sample_strength: Option<f32>,
    pub(crate) sample_hue_shift_degrees: Option<f32>,
    pub(crate) seed: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedHksyCheckerGridSource {
    pub(crate) generator: String,
    pub(crate) pattern: Option<String>,
    pub(crate) cell_size: u32,
    pub(crate) line_width: u32,
    pub(crate) checker_enabled: bool,
    pub(crate) grid_enabled: bool,
    pub(crate) foreground_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_colour: String,
    pub(crate) palette_colours: Option<Vec<String>>,
    pub(crate) separate_interval: Option<u32>,
    pub(crate) separate_line_width: Option<u32>,
    pub(crate) anchor_points: Option<Vec<GeneratedHksyAnchorPoint>>,
    pub(crate) round_caps: Option<bool>,
    pub(crate) max_join_distance: Option<f32>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
pub(crate) struct GeneratedHksyAnchorPoint {
    pub(crate) x: f32,
    pub(crate) y: f32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedRegionFrameSource {
    pub(crate) generator: String,
    pub(crate) line_width: f32,
    #[serde(default = "default_region_frame_shape")]
    pub(crate) shape: String,
    #[serde(default = "default_region_frame_corner_cut")]
    pub(crate) corner_cut: f32,
    pub(crate) extra_width: f32,
    pub(crate) extra_height: f32,
    pub(crate) background_opacity: f32,
    pub(crate) frame_colour: String,
    pub(crate) background_colour: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSimpleTubeSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) depth: f32,
    pub(crate) segments: u32,
    pub(crate) rings: u32,
    pub(crate) twist_degrees: f32,
    pub(crate) random_amount: f32,
    pub(crate) stroke_width: f32,
    pub(crate) colour: String,
    pub(crate) secondary_colour: String,
    #[serde(default = "default_simple_tube_colour_pattern")]
    pub(crate) colour_pattern: String,
    #[serde(default)]
    pub(crate) fog_strength: f32,
    #[serde(default = "default_simple_tube_fog_colour")]
    pub(crate) fog_colour: String,
    pub(crate) seed: i64,
    pub(crate) torus: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSphereDotsSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) rotation_degrees: f32,
    pub(crate) offset_degrees: f32,
    pub(crate) luminance_influence: f32,
    pub(crate) point_size: f32,
    pub(crate) latitude_line_width: f32,
    pub(crate) colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) seed: i64,
    pub(crate) plane_mode: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedSphericalFieldSource {
    pub(crate) generator: String,
    pub(crate) radius: f32,
    pub(crate) strength: f32,
    pub(crate) colour_amount: f32,
    pub(crate) alpha_amount: f32,
    pub(crate) line_width: f32,
    pub(crate) ring_count: u32,
    pub(crate) vector_count: u32,
    pub(crate) field_colour: String,
    pub(crate) secondary_colour: String,
    pub(crate) background_opacity: f32,
    pub(crate) container: bool,
    pub(crate) seed: i64,
}

pub(crate) fn default_simple_tube_colour_pattern() -> String {
    "single".to_string()
}

pub(crate) fn default_simple_tube_fog_colour() -> String {
    "#ffffff".to_string()
}

pub(crate) fn default_region_frame_shape() -> String {
    "rectangle".to_string()
}

pub(crate) fn default_region_frame_corner_cut() -> f32 {
    20.0
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedShapeSource {
    pub(crate) generator: String,
    pub(crate) shape_type: String,
    pub(crate) fill_colour: String,
    #[serde(default)]
    pub(crate) gradient: Option<GeneratedGradientSource>,
    #[serde(default)]
    pub(crate) corner_radius: f32,
}
