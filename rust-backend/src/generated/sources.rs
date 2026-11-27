use serde::Deserialize;

// `barcode` kind のワイヤーソースは rust-core の `BarcodeObjectFields`（正本、
// camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::BarcodeObjectFields;

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

// `puzzle_piece` kind のワイヤーソースは rust-core の `PuzzlePieceObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::PuzzlePieceObjectFields;

// `colour_wheel` kind のワイヤーソースは rust-core の `ColourWheelObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::ColourWheelObjectFields;

// `gourd` kind のワイヤーソースは rust-core の `GourdObjectFields`（正本、
// camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::GourdObjectFields;

// `gear` kind のワイヤーソースは rust-core の `GearObjectFields`（正本、
// camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::GearObjectFields;

// `track_bar` kind のワイヤーソースは rust-core の `TrackBarObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::TrackBarObjectFields;

// `pie_chart` kind のワイヤーソースは rust-core の `PieChartObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::{PieChartLabelMode, PieChartObjectFields, PieChartSortMode};

// `histogram` kind のワイヤーソースは rust-core の `HistogramObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::HistogramObjectFields;

// `sunburst` kind のワイヤーソースは rust-core の `SunburstObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::SunburstObjectFields;

// `circular_arrow` kind のワイヤーソースは rust-core の
// `CircularArrowObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::CircularArrowObjectFields;

// `triangle_bracket` kind のワイヤーソースは rust-core の
// `TriangleBracketObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::TriangleBracketObjectFields;

// `tartan_check` kind のワイヤーソースは rust-core の
// `TartanCheckObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::TartanCheckObjectFields;

// `houndstooth` kind のワイヤーソースは rust-core の
// `HoundstoothObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::HoundstoothObjectFields;

// `yagasuri` kind のワイヤーソースは rust-core の `YagasuriObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::YagasuriObjectFields;

// `paper_airplane` kind のワイヤーソースは rust-core の
// `PaperAirplaneObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::PaperAirplaneObjectFields;

// `asanoha_pattern` kind のワイヤーソースは rust-core の
// `AsanohaPatternObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::AsanohaPatternObjectFields;

// `focus_lines_plus` kind のワイヤーソースは rust-core の
// `FocusLinesPlusObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::FocusLinesPlusObjectFields;

// `random_line_ex` kind のワイヤーソースは rust-core の
// `RandomLineExObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::RandomLineExObjectFields;

// `contour_trace` kind のワイヤーソースは rust-core の
// `ContourTraceObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::ContourTraceObjectFields;

// `displacement_poly` kind のワイヤーソースは rust-core の
// `DisplacementPolyObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::DisplacementPolyObjectFields;

// `plain_effector_line` kind のワイヤーソースは rust-core の
// `PlainEffectorLineObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::PlainEffectorLineObjectFields as GeneratedPlainEffectorLineSource;

// `hologram` kind のワイヤーソースは rust-core の `HologramObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::HologramObjectFields as GeneratedHologramSource;

// `protractor` kind のワイヤーソースは rust-core の `ProtractorObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::ProtractorObjectFields as GeneratedProtractorSource;

// `shaking_polygon` kind のワイヤーソースは rust-core の
// `ShakingPolygonObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::ShakingPolygonObjectFields as GeneratedShakingPolygonSource;

// `shattered_sphere` kind のワイヤーソースは rust-core の
// `ShatteredSphereObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。重力は `gravity_x`/`gravity_y`/`gravity_z` の
// 3フィールドに分解されている（旧 `[f32; 3]` 表現は廃止）。
pub(crate) use uxfd_rust_core::ShatteredSphereObjectFields as GeneratedShatteredSphereSource;

// `tone_curve` kind のワイヤーソースは rust-core の `ToneCurveObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::ToneCurveObjectFields;

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

// `hksy_checker_grid` kind のワイヤーソースは rust-core の
// `HksyCheckerGridObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。`anchorPoints` の要素型は `HksyAnchorPoint`。
pub(crate) use uxfd_rust_core::{HksyAnchorPoint, HksyCheckerGridObjectFields};

// `region_frame` kind のワイヤーソースは rust-core の
// `RegionFrameObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::RegionFrameObjectFields;

// `simple_tube` kind のワイヤーソースは rust-core の `SimpleTubeObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::SimpleTubeObjectFields;

// `sphere_dots` kind のワイヤーソースは rust-core の `SphereDotsObjectFields`
// （正本、camelCase、`generator` タグ無し）を直接デシリアライズする。
pub(crate) use uxfd_rust_core::SphereDotsObjectFields;

// `spherical_field` kind のワイヤーソースは rust-core の
// `SphericalFieldObjectFields`（正本、camelCase、`generator` タグ無し）を
// 直接デシリアライズする。
pub(crate) use uxfd_rust_core::SphericalFieldObjectFields;

// `shape` kind のワイヤーソースは rust-core の `ShapeObjectFields`（編集モデルの
// 正本）を camelCase のまま直接デシリアライズする。`GeneratedGradientSource` への
// 変換は `generated/shape.rs` の `From<&ShapeGradientFill>` 実装で行う。
