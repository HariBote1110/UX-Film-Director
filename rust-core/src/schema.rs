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
    GeneratedHologram,
    GeneratedProtractor,
    GeneratedShakingPolygon,
    Psd,
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
    GeneratedHologramPlane,
    GeneratedProtractorPlane,
    GeneratedShakingPolygonPlane,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScalarKeyframe {
    pub frame_offset: u64,
    pub value: f32,
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WipeEdge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub media_id: String,
    pub kind: ClipKind,
    pub start_frame: u64,
    pub duration_frames: u64,
    #[serde(default = "Transform::identity")]
    pub transform: Transform,
    pub opacity: f32,
    #[serde(default)]
    pub opacity_keyframes: Vec<ScalarKeyframe>,
    #[serde(default)]
    pub effects: Vec<Effect>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub clips: Vec<Clip>,
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
}
