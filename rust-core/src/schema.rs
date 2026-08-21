use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
pub struct Fps {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ProjectSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
pub struct MediaReference {
    pub id: String,
    pub kind: MediaKind,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ScalarKeyframe {
    pub frame_offset: u64,
    pub value: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct PositionKeyframe {
    pub frame_offset: u64,
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub easing: Easing,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SubjectCropKeyframe {
    pub frame_offset: u64,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SubjectCropAnimation {
    pub source_width: f32,
    pub source_height: f32,
    pub keyframes: Vec<SubjectCropKeyframe>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub enum WipeEdge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
pub struct WipeAnimation {
    pub effect_index: u32,
    pub edge: WipeEdge,
    pub reverse: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct Track {
    pub id: String,
    pub clips: Vec<Clip>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
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

// --- 編集モデル（R3）: `shape` kind ---
//
// ここから下は `src/types.ts` の編集用オブジェクト種別（`ObjectType`）の
// 正本を Rust 側へ移す R3 フェーズの型。上の型群（`Clip` 等）は評価・描画用の
// ワイヤーフォーマットで snake_case のままだが、編集モデルは TS 側の既存
// 命名（camelCase）をそのまま踏襲するため `rename_all = "camelCase"` を付ける。

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum ShapeType {
    Rect,
    RoundedRect,
    Circle,
    Ellipse,
    Triangle,
    Star,
    Pentagon,
    Diamond,
    Arrow,
    Heart,
    Cross,
}

impl Default for ShapeType {
    fn default() -> Self {
        Self::Rect
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum ShapeGradientKind {
    Linear,
    Radial,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum ShapeGradientScope {
    Group,
    Connected,
}

/** `src/types.ts` の手書き `GradientFill` と構造的に同じ形にした編集モデル用型。
 * `shape` 以外の kind でも同じ形を使うが、共有化は次の kind 移送時に検討する。 */
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ShapeGradientFill {
    pub enabled: bool,
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub kind: ShapeGradientKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<ShapeGradientScope>,
    pub colours: Vec<String>,
    pub stops: Vec<f32>,
    pub direction: f32,
}

/// `ShapeObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、shape 固有部分。TS 側は `BaseObject & ShapeObjectFields & { type: 'shape' }`
/// として組み立てる。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ShapeObjectFields {
    #[serde(rename = "shapeType", default)]
    #[ts(rename = "shapeType")]
    pub shape_type: ShapeType,
    pub width: f32,
    pub height: f32,
    pub fill: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gradient: Option<ShapeGradientFill>,
    #[serde(rename = "cornerRadius", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "cornerRadius")]
    pub corner_radius: Option<f32>,
}

impl Default for ShapeObjectFields {
    fn default() -> Self {
        Self {
            shape_type: ShapeType::Rect,
            width: 200.0,
            height: 100.0,
            fill: "#ff0000".to_string(),
            gradient: None,
            corner_radius: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum TextAlignment {
    Left,
    Centre,
    Right,
}

/** `src/types.ts` の手書き `TextStroke` と構造的に同じ形にした編集モデル用型。 */
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct TextStroke {
    pub colour: String,
    pub width: f32,
}

/** `src/types.ts` の手書き `TextShadow` と構造的に同じ形にした編集モデル用型。 */
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct TextShadow {
    pub colour: String,
    #[serde(rename = "offsetX")]
    #[ts(rename = "offsetX")]
    pub offset_x: f32,
    #[serde(rename = "offsetY")]
    #[ts(rename = "offsetY")]
    pub offset_y: f32,
    pub blur: f32,
}

/// `TextObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、text 固有部分。TS 側は `BaseObject & TextObjectFields & { type: 'text' }`
/// として組み立てる。
///
/// `measured_width` / `measured_height` は PixiJS 側の実測値で、UI がテキストを
/// 描画・編集するたびに更新する。値そのものは UI 都合の測定結果だが、
/// フィールドの所在（編集モデルの一部として保存・往復する）は他の text 固有
/// フィールドと同じなのでここに置く。実際の描画領域の決定ロジック
/// （未測定時のヒューリスティック fallback）は `rustSceneSnapshot.ts` の
/// `textMediaBox` に残す（UI 実測に依存するため Rust 側へは移さない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct TextObjectFields {
    pub text: String,
    #[serde(rename = "fontSize")]
    #[ts(rename = "fontSize")]
    pub font_size: f32,
    #[serde(rename = "fontFamily")]
    #[ts(rename = "fontFamily")]
    pub font_family: String,
    pub fill: String,
    #[serde(rename = "measuredWidth", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "measuredWidth")]
    pub measured_width: Option<f32>,
    #[serde(rename = "measuredHeight", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "measuredHeight")]
    pub measured_height: Option<f32>,
    #[serde(rename = "textAlignment", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "textAlignment")]
    pub text_alignment: Option<TextAlignment>,
    #[serde(rename = "letterSpacing", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "letterSpacing")]
    pub letter_spacing: Option<f32>,
    #[serde(rename = "textStroke", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "textStroke")]
    pub text_stroke: Option<TextStroke>,
    #[serde(rename = "textShadow", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "textShadow")]
    pub text_shadow: Option<TextShadow>,
}

impl Default for TextObjectFields {
    fn default() -> Self {
        Self {
            text: "New Text".to_string(),
            font_size: 48.0,
            font_family: "Arial".to_string(),
            fill: "#ffffff".to_string(),
            measured_width: None,
            measured_height: None,
            text_alignment: None,
            letter_spacing: None,
            text_stroke: None,
            text_shadow: None,
        }
    }
}

/// `ImageObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、image 固有部分。TS 側は `BaseObject & ImageObjectFields & { type: 'image' }`
/// として組み立てる。
///
/// `image` は shape/text と異なり、Timeline.tsx の `handleImageChange` が
/// 選択したファイルから `src` / `filePath` / `width` / `height` を都度決めるため、
/// UI 側に固定既定値が存在しない（`objectFactories/` にも専用ファイルは無い）。
/// `Default` はニュートラルな空値にする。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ImageObjectFields {
    pub src: String,
    #[serde(rename = "filePath", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "filePath")]
    pub file_path: Option<String>,
    pub width: f32,
    pub height: f32,
}

impl Default for ImageObjectFields {
    fn default() -> Self {
        Self {
            src: String::new(),
            file_path: None,
            width: 0.0,
            height: 0.0,
        }
    }
}

/// 動画フレーム内の矩形切り抜き（左上原点・0-1 正規化）を編集モデルとして保持する
/// キーフレーム。`schema::SubjectCropKeyframe`（`frame_offset` ベースの評価用ワイヤー
/// 型）とは別物で、こちらは `id`/`time`（秒）を持つ編集用の型。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SubjectCropNormKeyframe {
    pub id: String,
    pub time: f32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// `VideoObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、video 固有部分。TS 側は `BaseObject & VideoObjectFields & { type: 'video' }`
/// として組み立てる。
///
/// `video` は `image` と同じ media kind（`mediaReferenceForObject` に専用の
/// `serialiseXxxSource` は無く、`source` は生のファイルパス文字列そのもの）。
/// `src`/`filePath`/`proxyFilePath`/`width`/`height`/`sourceWidth`/`sourceHeight` は
/// Timeline.tsx の `handleVideoChange` が選択したファイルの実データから都度決めるため
/// 固定既定値が無く、ニュートラルな空値にする。一方 `volume`/`muted` は UI が常に
/// `1.0`/`false` という固定リテラルで生成しており、shape/text と同じくその実在の
/// 既定値を `Default` にする。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct VideoObjectFields {
    pub src: String,
    #[serde(rename = "filePath", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "filePath")]
    pub file_path: Option<String>,
    #[serde(rename = "proxyFilePath", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "proxyFilePath")]
    pub proxy_file_path: Option<String>,
    #[serde(rename = "sourceWidth", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "sourceWidth")]
    pub source_width: Option<f32>,
    #[serde(rename = "sourceHeight", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "sourceHeight")]
    pub source_height: Option<f32>,
    pub width: f32,
    pub height: f32,
    pub volume: f32,
    pub muted: bool,
    #[serde(rename = "subjectCropEnabled", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "subjectCropEnabled")]
    pub subject_crop_enabled: Option<bool>,
    #[serde(rename = "subjectCropKeyframes", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "subjectCropKeyframes")]
    pub subject_crop_keyframes: Option<Vec<SubjectCropNormKeyframe>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reversed: Option<bool>,
}

impl Default for VideoObjectFields {
    fn default() -> Self {
        Self {
            src: String::new(),
            file_path: None,
            proxy_file_path: None,
            source_width: None,
            source_height: None,
            width: 0.0,
            height: 0.0,
            volume: 1.0,
            muted: false,
            subject_crop_enabled: None,
            subject_crop_keyframes: None,
            reversed: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
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
