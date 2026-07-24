use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fps {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ColourPipeline {
    pub profile: String,
    pub working_space: String,
    pub alpha: String,
}

impl ColourPipeline {
    pub fn rec709_sdr_linear() -> Self {
        Self {
            profile: "rec709-sdr".to_string(),
            working_space: "linear-light".to_string(),
            alpha: "premultiplied".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaKind {
    Video,
    Image,
    SolidColour,
    GeneratedGradient,
    GeneratedAudioWaveform,
    GeneratedAudioSphere,
    GeneratedParticle,
    GeneratedBarcode,
    GeneratedPuzzlePiece,
    GeneratedColourWheel,
    GeneratedGourd,
    GeneratedGear,
    GeneratedTrackBar,
    GeneratedPieChart,
    GeneratedHistogram,
    GeneratedToneCurve,
    GeneratedGetColorDots,
    GeneratedHksyCheckerGrid,
    GeneratedRegionFrame,
    GeneratedSimpleTube,
    GeneratedSphereDots,
    GeneratedSphericalField,
    GeneratedSunburst,
    GeneratedCircularArrow,
    GeneratedTriangleBracket,
    GeneratedTartanCheck,
    GeneratedHoundstooth,
    GeneratedYagasuri,
    GeneratedPaperAirplane,
    GeneratedAsanohaPattern,
    GeneratedFocusLinesPlus,
    GeneratedRandomLineEx,
    GeneratedContourTrace,
    GeneratedDisplacementPoly,
    GeneratedPlainEffectorLine,
    GeneratedHologram,
    GeneratedProtractor,
    GeneratedShakingPolygon,
    GeneratedShatteredSphere,
    GeneratedShape,
    Psd,
    Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediaReference {
    pub id: String,
    pub kind: MediaKind,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClipKind {
    VideoPlane,
    ImagePlane,
    SolidColourPlane,
    GeneratedAudioWaveformPlane,
    GeneratedAudioSpherePlane,
    GeneratedParticlePlane,
    GeneratedBarcodePlane,
    GeneratedPuzzlePiecePlane,
    GeneratedColourWheelPlane,
    GeneratedGourdPlane,
    GeneratedGearPlane,
    GeneratedTrackBarPlane,
    GeneratedPieChartPlane,
    GeneratedHistogramPlane,
    GeneratedToneCurvePlane,
    GeneratedGetColorDotsPlane,
    GeneratedHksyCheckerGridPlane,
    GeneratedRegionFramePlane,
    GeneratedSimpleTubePlane,
    GeneratedSphereDotsPlane,
    GeneratedSphericalFieldPlane,
    GeneratedSunburstPlane,
    GeneratedCircularArrowPlane,
    GeneratedTriangleBracketPlane,
    GeneratedTartanCheckPlane,
    GeneratedHoundstoothPlane,
    GeneratedYagasuriPlane,
    GeneratedPaperAirplanePlane,
    GeneratedAsanohaPatternPlane,
    GeneratedFocusLinesPlusPlane,
    GeneratedRandomLineExPlane,
    GeneratedContourTracePlane,
    GeneratedDisplacementPolyPlane,
    GeneratedPlainEffectorLinePlane,
    GeneratedHologramPlane,
    GeneratedProtractorPlane,
    GeneratedShakingPolygonPlane,
    GeneratedShatteredSpherePlane,
    GeneratedShapePlane,
    TextPlane,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScalarKeyframe {
    pub frame_offset: u64,
    pub value: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Easing {
    Linear,
    EaseInSine,
    EaseOutSine,
    EaseInOutSine,
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
    EaseInCubic,
    EaseOutCubic,
    EaseInOutCubic,
    EaseInQuart,
    EaseOutQuart,
    EaseInOutQuart,
    EaseInQuint,
    EaseOutQuint,
    EaseInOutQuint,
    EaseInExpo,
    EaseOutExpo,
    EaseInOutExpo,
    EaseInCirc,
    EaseOutCirc,
    EaseInOutCirc,
    EaseInBack,
    EaseOutBack,
    EaseInOutBack,
    EaseInElastic,
    EaseOutElastic,
    EaseInOutElastic,
    EaseInBounce,
    EaseOutBounce,
    EaseInOutBounce,
}

impl Default for Easing {
    fn default() -> Self {
        Self::Linear
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PositionKeyframe {
    pub frame_offset: u64,
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub easing: Easing,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubjectCropKeyframe {
    pub frame_offset: u64,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubjectCropAnimation {
    pub source_width: f32,
    pub source_height: f32,
    pub keyframes: Vec<SubjectCropKeyframe>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transform {
    pub translation_x: f32,
    pub translation_y: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub rotation_degrees: f32,
    #[serde(default = "SamplingMode::nearest")]
    pub sampling: SamplingMode,
}

impl Transform {
    pub fn identity() -> Self {
        Self {
            translation_x: 0.0,
            translation_y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation_degrees: 0.0,
            sampling: SamplingMode::Nearest,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SamplingMode {
    Nearest,
    Bilinear,
}

impl SamplingMode {
    pub fn nearest() -> Self {
        Self::Nearest
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Effect {
    LinearGain {
        gain: f32,
    },
    ColourAberration {
        offset_x: f32,
        offset_y: f32,
    },
    Outline {
        colour: [f32; 3],
        thickness: f32,
        opacity: f32,
    },
    Wipe {
        edge: WipeEdge,
        progress: f32,
    },
    Clipping {
        top: f32,
        bottom: f32,
        left: f32,
        right: f32,
        angle_degrees: f32,
    },
    SpotLight {
        centre_x: f32,
        centre_y: f32,
        radius: f32,
        intensity: f32,
        colour: [f32; 3],
    },
    DisplacementMap {
        amount_x: f32,
        amount_y: f32,
        size: f32,
        strength: f32,
    },
    FakeDof {
        focus_x: f32,
        focus_y: f32,
        focus_radius: f32,
        blur: f32,
        strength: f32,
    },
    AutoBlur {
        angle_degrees: f32,
        radius: f32,
        strength: f32,
        colour_shift: f32,
    },
    Stretch {
        angle_degrees: f32,
        amount: f32,
        strength: f32,
    },
    MultiSlicer {
        angle_degrees: f32,
        offset: f32,
        slices: u32,
        expansion: f32,
        strength: f32,
    },
    OctTransform {
        scale: f32,
        rotation_degrees: f32,
        vertex_count: u32,
        warp: f32,
        strength: f32,
    },
    AreaExpand {
        top: f32,
        bottom: f32,
        left: f32,
        right: f32,
        fill: bool,
    },
    /// PIXI.ColorMatrixFilter 互換の色調補正。hue → saturate → contrast →
    /// brightness を multiply 合成した行列を sRGB 符号化空間の straight RGB へ
    /// 適用する（旧 Pixi 全画面フォールバックの見た目を再現する）。
    ColourCorrection {
        brightness: f32,
        contrast: f32,
        saturation: f32,
        hue_degrees: f32,
    },
    /// 一様ぼかし（旧 PIXI.BlurFilter 相当）。radius は source pixel 単位の
    /// タップ間隔、strength はブレンド係数（0..=1）。3x3 ガウシアン近似。
    Blur {
        radius: f32,
        strength: f32,
    },
    /// ドロップシャドウの最小実装。オフセット位置へ source alpha 形状の
    /// 単色シルエットを本体の背後に合成する（ぼかしなし）。
    DropShadow {
        colour: [f32; 3],
        offset_x: f32,
        offset_y: f32,
        opacity: f32,
    },
    /// 旧 PIXI `GroupGradientFilter` 相当。グループ（または連結成分）の
    /// ワールド座標系バウンディングボックスに対する UV 空間で線形/放射
    /// グラデーションを計算し、RGB を上書きしつつ alpha は本体のシルエット
    /// （source alpha）に従わせる（`grad.a * src.a` 合成）。
    /// bounds はクリップ単位ではなく、TS 側で計算したグループ全体（もしくは
    /// bounds が交差しない連結成分ごと）のワールド座標系 AABB。
    GradientOverlay {
        direction_degrees: f32,
        stop_a: f32,
        stop_b: f32,
        is_radial: bool,
        colour_a: [f32; 4],
        colour_b: [f32; 4],
        bounds_x: f32,
        bounds_y: f32,
        bounds_width: f32,
        bounds_height: f32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WipeEdge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WipeAnimation {
    pub effect_index: u32,
    pub edge: WipeEdge,
    pub reverse: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub media_id: String,
    pub kind: ClipKind,
    pub start_frame: u64,
    pub duration_frames: u64,
    #[serde(default)]
    pub source_frame_offset: u64,
    #[serde(default = "Transform::identity")]
    pub transform: Transform,
    pub opacity: f32,
    #[serde(default)]
    pub opacity_keyframes: Vec<ScalarKeyframe>,
    #[serde(default)]
    pub position_keyframes: Vec<PositionKeyframe>,
    #[serde(default)]
    pub subject_crop: Option<SubjectCropAnimation>,
    #[serde(default)]
    pub wipe_animations: Vec<WipeAnimation>,
    #[serde(default)]
    pub effects: Vec<Effect>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub clips: Vec<Clip>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GroupControl {
    pub id: String,
    pub start_frame: u64,
    pub duration_frames: u64,
    #[serde(default = "Transform::identity")]
    pub transform: Transform,
    pub opacity: f32,
    #[serde(default)]
    pub position_keyframes: Vec<PositionKeyframe>,
    #[serde(default)]
    pub target_track_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub version: u32,
    pub size: ProjectSize,
    pub fps: Fps,
    pub colour: ColourPipeline,
    pub media: Vec<MediaReference>,
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub group_controls: Vec<GroupControl>,
}
