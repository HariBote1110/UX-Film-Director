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

/// `audio` kind の音素タイミング1件（`.lab` ファイル由来）。編集モデル専用の型で、
/// `src/utils/labParser.ts` の `LabPhoneme` に対応する。`audio` kind 以外では
/// 使われない専用データのため rust-core に新規追加した。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AudioLabPhoneme {
    #[serde(rename = "startTime")]
    #[ts(rename = "startTime")]
    pub start_time: f32,
    #[serde(rename = "endTime")]
    #[ts(rename = "endTime")]
    pub end_time: f32,
    pub phoneme: String,
}

/// `TimelineObject` のうち `BaseObject` の共通フィールド (`id`/`name`/`layer`/...) を
/// 除いた、audio 固有部分。TS 側は `BaseObject & AudioObjectFields & { type: 'audio' }`
/// になる。
///
/// `audio` は `mediaReferenceForObject`（`rustSceneSnapshot.ts`）の対象外
/// （`isVisualSceneObject`/`isSupportedSceneObject` のどちらにも含まれず、
/// `SupportedMediaObject` 系のワイヤー統一とは無関係）。`src`/`filePath` は
/// Timeline.tsx の `handleAudioChange` が選択したファイルの実データから都度決める
/// ため固定既定値が無く、ニュートラルな空値にする。一方 `volume`/`muted` は UI が
/// 常に `1.0`/`false` という固定リテラルで生成しており、video と同じくその実在の
/// 既定値を `Default` にする。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AudioObjectFields {
    pub src: String,
    #[serde(rename = "filePath", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "filePath")]
    pub file_path: Option<String>,
    pub volume: f32,
    pub muted: bool,
    #[serde(rename = "labData", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "labData")]
    pub lab_data: Option<Vec<AudioLabPhoneme>>,
}

impl Default for AudioObjectFields {
    fn default() -> Self {
        Self {
            src: String::new(),
            file_path: None,
            volume: 1.0,
            muted: false,
            lab_data: None,
        }
    }
}

// --- 編集モデル（R3）: 生成系 kind ---
//
// ここから下は `src/types.ts` の生成系オブジェクト種別（AviUtlPackV4 互換の
// 手続き生成オブジェクト）の編集モデル。`mediaReferenceForObject`
// （`rustSceneSnapshot.ts`）に専用の `serialiseGeneratedXxxSource` を持つ kind
// 群で、shape と同じくワイヤー統一（stage 3）まで見据えて移送する。

/// `AudioVisualizationObject`（`src/types.ts`）専用の可視化種別。
/// 現状 `'waveform'` の単一バリアントのみ存在する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum AudioVisualizationType {
    Waveform,
}

impl Default for AudioVisualizationType {
    fn default() -> Self {
        Self::Waveform
    }
}

/// `AudioVisualizationObject`（`src/types.ts`）の `type` / `BaseObject`
/// 由来フィールドを除いた、audio_visualization 固有部分。TS 側は
/// `BaseObject & AudioVisualizationObjectFields & { type: 'audio_visualization' }`
/// として組み立てる。
///
/// `width`/`height` は `TimelineContextMenu.tsx` の `handleAddWaveform` が
/// プロジェクトサイズから都度計算するため固定既定値が無く、ニュートラルな
/// `0.0` にする。`targetAudioId` は `string | null`（常にキーとして存在し
/// null を許容）なので `Option<String>` のまま `skip_serializing_if` を
/// 付けない。`targetLayer` は `number` 型の省略可能フィールド
/// (`targetLayer?: number`) なので `skip_serializing_if` を付ける。
/// `color`（American spelling）は TS 側の既存フィールド名をそのまま踏襲する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AudioVisualizationObjectFields {
    #[serde(rename = "targetAudioId")]
    #[ts(rename = "targetAudioId")]
    pub target_audio_id: Option<String>,
    #[serde(rename = "targetLayer", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "targetLayer")]
    pub target_layer: Option<i32>,
    #[serde(rename = "visualizationType", default)]
    #[ts(rename = "visualizationType")]
    pub visualization_type: AudioVisualizationType,
    pub color: String,
    pub thickness: f32,
    pub width: f32,
    pub height: f32,
    pub amplitude: f32,
}

impl Default for AudioVisualizationObjectFields {
    fn default() -> Self {
        Self {
            target_audio_id: None,
            target_layer: None,
            visualization_type: AudioVisualizationType::Waveform,
            color: "#00ff00".to_string(),
            thickness: 2.0,
            width: 0.0,
            height: 0.0,
            amplitude: 1.0,
        }
    }
}

/// `AudioSphereObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、audio_sphere 固有部分。TS 側は
/// `BaseObject & AudioSphereObjectFields & { type: 'audio_sphere' }` として組み立てる。
///
/// `width`/`height` は `audioSphereObjectFactory.ts` の
/// `buildAviUtlAudioSphereObject` がプロジェクトサイズから都度計算するため
/// 固定既定値が無く、ニュートラルな `0.0` にする。他の数値フィールドは
/// 同ファイルの固定リテラル（columns: 16, rows: 12, baseRadius: 170,
/// audioInfluence: 0.6, pointSize: 5, polygonSize: 0.35, randomAmount: 0.05,
/// colour: '#36c2ff', sampleWindowSeconds: 0.1, seed: 93）をそのまま採用する。
/// `targetAudioId`/`targetLayer` は audio_visualization と同じ規約
/// （前者は常にキーが存在し null 許容、後者は省略可能）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AudioSphereObjectFields {
    pub width: f32,
    pub height: f32,
    pub columns: u32,
    pub rows: u32,
    #[serde(rename = "baseRadius")]
    #[ts(rename = "baseRadius")]
    pub base_radius: f32,
    #[serde(rename = "audioInfluence")]
    #[ts(rename = "audioInfluence")]
    pub audio_influence: f32,
    #[serde(rename = "pointSize")]
    #[ts(rename = "pointSize")]
    pub point_size: f32,
    #[serde(rename = "polygonSize")]
    #[ts(rename = "polygonSize")]
    pub polygon_size: f32,
    #[serde(rename = "randomAmount")]
    #[ts(rename = "randomAmount")]
    pub random_amount: f32,
    pub colour: String,
    #[serde(rename = "targetAudioId")]
    #[ts(rename = "targetAudioId")]
    pub target_audio_id: Option<String>,
    #[serde(rename = "targetLayer", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "targetLayer")]
    pub target_layer: Option<i32>,
    #[serde(rename = "sampleWindowSeconds")]
    #[ts(rename = "sampleWindowSeconds")]
    pub sample_window_seconds: f32,
    pub seed: i64,
}

impl Default for AudioSphereObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            columns: 16,
            rows: 12,
            base_radius: 170.0,
            audio_influence: 0.6,
            point_size: 5.0,
            polygon_size: 0.35,
            random_amount: 0.05,
            colour: "#36c2ff".to_string(),
            target_audio_id: None,
            target_layer: None,
            sample_window_seconds: 0.1,
            seed: 93,
        }
    }
}

/// `ParticleObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、particle 固有部分。TS 側は
/// `BaseObject & ParticleObjectFields & { type: 'particle' }` として組み立てる。
///
/// `width`/`height` は `particleObjectFactory.ts` の各 `build*Object` が
/// プロジェクトサイズやバリアントごとに都度計算するため固定既定値が無く、
/// ニュートラルな `0.0` にする。他の数値フィールドは
/// `TimelineContextMenu.tsx` の `handleAddParticle` が呼ぶ標準パーティクル
/// (`buildDefaultStandardParticleObject`) の固定リテラル
/// （particleCount: 96, seed: 93, spread: 160, speed: 90, size: 4,
/// colour: '#ffffff', lifetimeSeconds: 2）を採用する。
/// オーラ放出/泡/集中線T/インクTM 等の他バリアントは別の固定値を使うが、
/// 「既定値」としては標準パーティクルを正とする（他バリアントは編集後に
/// 都度上書きされる初期値の一種であり、UI 全体の既定値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ParticleObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "particleCount")]
    #[ts(rename = "particleCount")]
    pub particle_count: u32,
    pub seed: i64,
    pub spread: f32,
    pub speed: f32,
    pub size: f32,
    pub colour: String,
    #[serde(rename = "lifetimeSeconds")]
    #[ts(rename = "lifetimeSeconds")]
    pub lifetime_seconds: f32,
}

impl Default for ParticleObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            particle_count: 96,
            seed: 93,
            spread: 160.0,
            speed: 90.0,
            size: 4.0,
            colour: "#ffffff".to_string(),
            lifetime_seconds: 2.0,
        }
    }
}

/// `BarcodeObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、barcode 固有部分。TS 側は
/// `BaseObject & BarcodeObjectFields & { type: 'barcode' }` として組み立てる。
///
/// `width`/`height` は `barcodeObjectFactory.ts` の `buildAviUtlBarcodeObject`
/// がプロジェクトサイズから都度計算するため固定既定値が無く、ニュートラルな
/// `0.0` にする。他のフィールドは同ファイルの固定リテラル
/// （data: 'AviUtl', minimumBarWidth: 2, horizontalMargin: 30,
/// verticalMargin: 20, foregroundColour: '#000000', backgroundColour: '#ffffff'）
/// をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct BarcodeObjectFields {
    pub width: f32,
    pub height: f32,
    pub data: String,
    #[serde(rename = "minimumBarWidth")]
    #[ts(rename = "minimumBarWidth")]
    pub minimum_bar_width: f32,
    #[serde(rename = "horizontalMargin")]
    #[ts(rename = "horizontalMargin")]
    pub horizontal_margin: f32,
    #[serde(rename = "verticalMargin")]
    #[ts(rename = "verticalMargin")]
    pub vertical_margin: f32,
    #[serde(rename = "foregroundColour")]
    #[ts(rename = "foregroundColour")]
    pub foreground_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for BarcodeObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            data: "AviUtl".to_string(),
            minimum_bar_width: 2.0,
            horizontal_margin: 30.0,
            vertical_margin: 20.0,
            foreground_colour: "#000000".to_string(),
            background_colour: "#ffffff".to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum PuzzleConnectorMode {
    Convex,
    Concave,
}

impl Default for PuzzleConnectorMode {
    fn default() -> Self {
        Self::Convex
    }
}

/// `PuzzlePieceObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、puzzle_piece 固有部分。TS 側は
/// `BaseObject & PuzzlePieceObjectFields & { type: 'puzzle_piece' }` として
/// 組み立てる。
///
/// `width`/`height`/`size` は `puzzlePieceObjectFactory.ts` の
/// `buildAviUtlPuzzlePieceObject` がプロジェクトサイズから都度計算するため
/// 固定既定値が無く、ニュートラルな `0.0` にする。`shapeVariant`/
/// `connectorMode`/`fillColour` は同ファイルの固定リテラル
/// （shapeVariant: 1, connectorMode: 'convex', fillColour: '#ffffff'）を
/// そのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct PuzzlePieceObjectFields {
    pub width: f32,
    pub height: f32,
    pub size: f32,
    #[serde(rename = "shapeVariant")]
    #[ts(rename = "shapeVariant")]
    pub shape_variant: u32,
    #[serde(rename = "connectorMode")]
    #[ts(rename = "connectorMode")]
    pub connector_mode: PuzzleConnectorMode,
    #[serde(rename = "fillColour")]
    #[ts(rename = "fillColour")]
    pub fill_colour: String,
}

impl Default for PuzzlePieceObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            size: 0.0,
            shape_variant: 1,
            connector_mode: PuzzleConnectorMode::Convex,
            fill_colour: "#ffffff".to_string(),
        }
    }
}

/// `ColourWheelObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、colour_wheel 固有部分。TS 側は
/// `BaseObject & ColourWheelObjectFields & { type: 'colour_wheel' }` として
/// 組み立てる。
///
/// `width`/`height`/`radius` は `colourWheelObjectFactory.ts` の
/// `buildAviUtlColourWheelObject` がプロジェクトサイズから都度計算するため
/// 固定既定値が無く、ニュートラルな `0.0` にする。他のフィールドは同ファイルの
/// 固定リテラル（saturation: 100, brightness: 100, ringWidthPercent: 25,
/// segmentCount: 24）をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ColourWheelObjectFields {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub saturation: f32,
    pub brightness: f32,
    #[serde(rename = "ringWidthPercent")]
    #[ts(rename = "ringWidthPercent")]
    pub ring_width_percent: f32,
    #[serde(rename = "segmentCount")]
    #[ts(rename = "segmentCount")]
    pub segment_count: u32,
}

impl Default for ColourWheelObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            radius: 0.0,
            saturation: 100.0,
            brightness: 100.0,
            ring_width_percent: 25.0,
            segment_count: 24,
        }
    }
}

/// `GourdObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、gourd 固有部分。TS 側は
/// `BaseObject & GourdObjectFields & { type: 'gourd' }` として組み立てる。
///
/// `width`/`height` は `gourdObjectFactory.ts` の `buildAviUtlGourdObject` が
/// プロジェクトサイズから都度計算するため固定既定値が無く、ニュートラルな
/// `0.0` にする。他のフィールドは同ファイルの固定リテラル（bodyRadius: 80,
/// bodyWidth: 250, waistRadius: 10, squashPercent: 40, repeatCount: 1,
/// fillColour: '#ffffff'）をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct GourdObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "bodyRadius")]
    #[ts(rename = "bodyRadius")]
    pub body_radius: u32,
    #[serde(rename = "bodyWidth")]
    #[ts(rename = "bodyWidth")]
    pub body_width: u32,
    #[serde(rename = "waistRadius")]
    #[ts(rename = "waistRadius")]
    pub waist_radius: u32,
    #[serde(rename = "squashPercent")]
    #[ts(rename = "squashPercent")]
    pub squash_percent: f32,
    #[serde(rename = "repeatCount")]
    #[ts(rename = "repeatCount")]
    pub repeat_count: u32,
    #[serde(rename = "fillColour")]
    #[ts(rename = "fillColour")]
    pub fill_colour: String,
}

impl Default for GourdObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            body_radius: 80,
            body_width: 250,
            waist_radius: 10,
            squash_percent: 40.0,
            repeat_count: 1,
            fill_colour: "#ffffff".to_string(),
        }
    }
}

/// `GearObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、gear 固有部分。TS 側は
/// `BaseObject & GearObjectFields & { type: 'gear' }` として組み立てる。
///
/// `width`/`height`/`outerRadius` は `gearObjectFactory.ts` の
/// `buildAviUtlGearObject` がプロジェクトサイズから都度計算するため固定既定値が
/// 無く、ニュートラルな `0.0` にする。他のフィールドは同ファイルの固定リテラル
/// （innerRadiusPercent: 45, toothCount: 20, toothDepthPercent: 18,
/// toothSkewPercent: 0, fillColour: '#ffffff'）をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct GearObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "outerRadius")]
    #[ts(rename = "outerRadius")]
    pub outer_radius: u32,
    #[serde(rename = "innerRadiusPercent")]
    #[ts(rename = "innerRadiusPercent")]
    pub inner_radius_percent: f32,
    #[serde(rename = "toothCount")]
    #[ts(rename = "toothCount")]
    pub tooth_count: u32,
    #[serde(rename = "toothDepthPercent")]
    #[ts(rename = "toothDepthPercent")]
    pub tooth_depth_percent: f32,
    #[serde(rename = "toothSkewPercent")]
    #[ts(rename = "toothSkewPercent")]
    pub tooth_skew_percent: f32,
    #[serde(rename = "fillColour")]
    #[ts(rename = "fillColour")]
    pub fill_colour: String,
}

impl Default for GearObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            outer_radius: 0,
            inner_radius_percent: 45.0,
            tooth_count: 20,
            tooth_depth_percent: 18.0,
            tooth_skew_percent: 0.0,
            fill_colour: "#ffffff".to_string(),
        }
    }
}

/// `TrackBarObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、track_bar 固有部分。TS 側は
/// `BaseObject & TrackBarObjectFields & { type: 'track_bar' }` として組み立てる。
///
/// `width`/`height` は `trackBarObjectFactory.ts` の `buildAviUtlTrackBarObject`
/// がプロジェクトサイズから都度計算するため固定既定値が無く、ニュートラルな
/// `0.0` にする。他のフィールドは同ファイルの固定リテラル（trackValues:
/// [0,0,0,0], trackRanges: [[0,100],[0,100],[0,100],[-100,100]], labels:
/// ['TrackA','TrackB','TrackC','TrackD'], barColour: '#ffffff',
/// backgroundOpacity: 0.05）をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct TrackBarObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "trackValues")]
    #[ts(rename = "trackValues")]
    pub track_values: Vec<f32>,
    #[serde(rename = "trackRanges")]
    #[ts(rename = "trackRanges")]
    pub track_ranges: Vec<(f32, f32)>,
    pub labels: Vec<String>,
    #[serde(rename = "barColour")]
    #[ts(rename = "barColour")]
    pub bar_colour: String,
    #[serde(rename = "backgroundOpacity")]
    #[ts(rename = "backgroundOpacity")]
    pub background_opacity: f32,
}

impl Default for TrackBarObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            track_values: vec![0.0, 0.0, 0.0, 0.0],
            track_ranges: vec![(0.0, 100.0), (0.0, 100.0), (0.0, 100.0), (-100.0, 100.0)],
            labels: vec![
                "TrackA".to_string(),
                "TrackB".to_string(),
                "TrackC".to_string(),
                "TrackD".to_string(),
            ],
            bar_colour: "#ffffff".to_string(),
            background_opacity: 0.05,
        }
    }
}

/// `PieChartObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、pie_chart 固有部分。TS 側は
/// `BaseObject & PieChartObjectFields & { type: 'pie_chart' }` として組み立てる。
///
/// `width`/`height` は `pieChartObjectFactory.ts` の `buildAviUtlPieChartObject`
/// がプロジェクトサイズから都度計算するため固定既定値が無く、ニュートラルな
/// `0.0` にする。他のフィールドは同ファイルの固定リテラル（values:
/// [10,20,30,40], sortMode: 'descending', normaliseToHundred: true,
/// labelMode: 'percentage', progressPercent: 100, strokeWidth: 20,
/// sliceColours: ['#389ba6','#f2e2c4','#f29422','#f27830','#f24b0f']）を
/// そのまま採用する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum PieChartSortMode {
    None,
    Descending,
    Ascending,
}

impl Default for PieChartSortMode {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum PieChartLabelMode {
    None,
    Percentage,
    Input,
}

impl Default for PieChartLabelMode {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct PieChartObjectFields {
    pub width: f32,
    pub height: f32,
    pub values: Vec<f32>,
    #[serde(rename = "sortMode")]
    #[ts(rename = "sortMode")]
    pub sort_mode: PieChartSortMode,
    #[serde(rename = "normaliseToHundred")]
    #[ts(rename = "normaliseToHundred")]
    pub normalise_to_hundred: bool,
    #[serde(rename = "labelMode")]
    #[ts(rename = "labelMode")]
    pub label_mode: PieChartLabelMode,
    #[serde(rename = "progressPercent")]
    #[ts(rename = "progressPercent")]
    pub progress_percent: f32,
    #[serde(rename = "strokeWidth")]
    #[ts(rename = "strokeWidth")]
    pub stroke_width: f32,
    #[serde(rename = "sliceColours")]
    #[ts(rename = "sliceColours")]
    pub slice_colours: Vec<String>,
}

impl Default for PieChartObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            values: vec![10.0, 20.0, 30.0, 40.0],
            sort_mode: PieChartSortMode::Descending,
            normalise_to_hundred: true,
            label_mode: PieChartLabelMode::Percentage,
            progress_percent: 100.0,
            stroke_width: 20.0,
            slice_colours: vec![
                "#389ba6".to_string(),
                "#f2e2c4".to_string(),
                "#f29422".to_string(),
                "#f27830".to_string(),
                "#f24b0f".to_string(),
            ],
        }
    }
}

/// `HistogramObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、histogram 固有部分。TS 側は
/// `BaseObject & HistogramObjectFields & { type: 'histogram' }` として組み立てる。
///
/// `width`/`height` は `histogramObjectFactory.ts` の
/// `buildAviUtlHistogramObject` の固定リテラル（256, 200）をそのまま採用する
/// （プロジェクトサイズに依存しない固定値のため、ニュートラル化はしない）。
/// 他のフィールドも同ファイルの固定リテラル（binValues:
/// [0.08,0.18,0.32,0.55,0.78,0.92,0.64,0.36], heightScalePercent: 100,
/// lineWidth: 1, showLuminance/showRed/showGreen/showBlue: true,
/// channelColours: ['#ffffff','#ff4b4b','#4bff6a','#4b8cff'],
/// backgroundColour: '#000000'）をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct HistogramObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "binValues")]
    #[ts(rename = "binValues")]
    pub bin_values: Vec<f32>,
    #[serde(rename = "heightScalePercent")]
    #[ts(rename = "heightScalePercent")]
    pub height_scale_percent: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    #[serde(rename = "showLuminance")]
    #[ts(rename = "showLuminance")]
    pub show_luminance: bool,
    #[serde(rename = "showRed")]
    #[ts(rename = "showRed")]
    pub show_red: bool,
    #[serde(rename = "showGreen")]
    #[ts(rename = "showGreen")]
    pub show_green: bool,
    #[serde(rename = "showBlue")]
    #[ts(rename = "showBlue")]
    pub show_blue: bool,
    #[serde(rename = "channelColours")]
    #[ts(rename = "channelColours")]
    pub channel_colours: Vec<String>,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for HistogramObjectFields {
    fn default() -> Self {
        Self {
            width: 256.0,
            height: 200.0,
            bin_values: vec![0.08, 0.18, 0.32, 0.55, 0.78, 0.92, 0.64, 0.36],
            height_scale_percent: 100.0,
            line_width: 1.0,
            show_luminance: true,
            show_red: true,
            show_green: true,
            show_blue: true,
            channel_colours: vec![
                "#ffffff".to_string(),
                "#ff4b4b".to_string(),
                "#4bff6a".to_string(),
                "#4b8cff".to_string(),
            ],
            background_colour: "#000000".to_string(),
        }
    }
}

/// `ToneCurveObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた、tone_curve 固有部分。TS 側は
/// `BaseObject & ToneCurveObjectFields & { type: 'tone_curve' }` として組み立てる。
///
/// `width`/`height` は `toneCurveObjectFactory.ts` の
/// `buildAviUtlToneCurveObject` の固定リテラル（360, 360）をそのまま採用する
/// （プロジェクトサイズに依存しない固定値のため、ニュートラル化はしない）。
/// 他のフィールドも同ファイルの固定リテラル（gridDivisions: 4, lineWidth: 3,
/// curvePoints: [0,0.16,0.42,0.7,1], curveColour: '#ffffff',
/// gridColour: '#333333', backgroundColour: '#000000'）をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ToneCurveObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "gridDivisions")]
    #[ts(rename = "gridDivisions")]
    pub grid_divisions: u32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: u32,
    #[serde(rename = "curvePoints")]
    #[ts(rename = "curvePoints")]
    pub curve_points: Vec<f32>,
    #[serde(rename = "curveColour")]
    #[ts(rename = "curveColour")]
    pub curve_colour: String,
    #[serde(rename = "gridColour")]
    #[ts(rename = "gridColour")]
    pub grid_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for ToneCurveObjectFields {
    fn default() -> Self {
        Self {
            width: 360.0,
            height: 360.0,
            grid_divisions: 4,
            line_width: 3,
            curve_points: vec![0.0, 0.16, 0.42, 0.7, 1.0],
            curve_colour: "#ffffff".to_string(),
            grid_colour: "#333333".to_string(),
            background_colour: "#000000".to_string(),
        }
    }
}

/// `hksy_checker_grid` kind (`src/types.ts` の `HksyCheckerGridObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & HksyCheckerGridObjectFields & { type: 'hksy_checker_grid' }`
/// として組み立てる。
///
/// `width`/`height` は `hksyCheckerGridObjectFactory.ts` の
/// `buildHksyCheckerGridObject` がプロジェクトサイズから都度計算するため
/// ニュートラルな `0.0` にする。他のフィールドは同関数の固定リテラル
/// （cellSize: 50, lineWidth: 2, checkerEnabled: true, gridEnabled: true,
/// foregroundColour: '#ffffff', secondaryColour: '#333333',
/// backgroundColour: '#000000'）をそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct HksyCheckerGridObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(rename = "cellSize")]
    #[ts(rename = "cellSize")]
    pub cell_size: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    #[serde(rename = "checkerEnabled")]
    #[ts(rename = "checkerEnabled")]
    pub checker_enabled: bool,
    #[serde(rename = "gridEnabled")]
    #[ts(rename = "gridEnabled")]
    pub grid_enabled: bool,
    #[serde(rename = "foregroundColour")]
    #[ts(rename = "foregroundColour")]
    pub foreground_colour: String,
    #[serde(rename = "secondaryColour")]
    #[ts(rename = "secondaryColour")]
    pub secondary_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
    #[serde(rename = "paletteColours", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "paletteColours")]
    pub palette_colours: Option<Vec<String>>,
    #[serde(rename = "separateInterval", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "separateInterval")]
    pub separate_interval: Option<f32>,
    #[serde(
        rename = "separateLineWidth",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(rename = "separateLineWidth")]
    pub separate_line_width: Option<f32>,
    #[serde(rename = "anchorPoints", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "anchorPoints")]
    pub anchor_points: Option<Vec<HksyAnchorPoint>>,
    #[serde(rename = "roundCaps", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "roundCaps")]
    pub round_caps: Option<bool>,
    #[serde(
        rename = "maxJoinDistance",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(rename = "maxJoinDistance")]
    pub max_join_distance: Option<f32>,
}

impl Default for HksyCheckerGridObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            pattern: None,
            cell_size: 50.0,
            line_width: 2.0,
            checker_enabled: true,
            grid_enabled: true,
            foreground_colour: "#ffffff".to_string(),
            secondary_colour: "#333333".to_string(),
            background_colour: "#000000".to_string(),
            palette_colours: None,
            separate_interval: None,
            separate_line_width: None,
            anchor_points: None,
            round_caps: None,
            max_join_distance: None,
        }
    }
}

/// `src/types.ts` の `HksyCheckerGridObject.anchorPoints` の要素型。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct HksyAnchorPoint {
    pub x: f32,
    pub y: f32,
}

/// `getcolor_dot_field` kind (`src/types.ts` の `GetColorDotFieldObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & GetColorDotFieldObjectFields & { type: 'getcolor_dot_field' }`
/// として組み立てる。
///
/// **wire 統一（stage 4）は見送る**: `serialiseGeneratedGetColorDotsSource`
/// （rustSceneSnapshot.ts）は `sampleSourcePath` が空の場合に他オブジェクト
/// （image/psd）を `sampleSourceObjectId`/`sampleSourceLayer` で解決する
/// クロスオブジェクト参照を行い、解決結果を wire に含める。これは
/// `audio_visualization`/`audio_sphere` と同じ「構造的に想定より複雑」な
/// ケースのため、型移送のみで打ち切る。
///
/// `width`/`height` は `getColorDotFieldObjectFactory.ts` の
/// `buildGetColorDotFieldObject` がプロジェクトサイズから都度計算するため
/// ニュートラルな `0.0` にする。他のフィールドは同関数の固定リテラルを
/// そのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct GetColorDotFieldObjectFields {
    pub width: f32,
    pub height: f32,
    pub columns: u32,
    pub rows: u32,
    #[serde(rename = "dotSize")]
    #[ts(rename = "dotSize")]
    pub dot_size: f32,
    #[serde(rename = "dotShape", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "dotShape")]
    pub dot_shape: Option<String>,
    #[serde(rename = "strokeWidth", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "strokeWidth")]
    pub stroke_width: Option<f32>,
    #[serde(rename = "sizeInfluence")]
    #[ts(rename = "sizeInfluence")]
    pub size_influence: f32,
    #[serde(rename = "luminanceInfluence")]
    #[ts(rename = "luminanceInfluence")]
    pub luminance_influence: f32,
    #[serde(rename = "hueShiftDegrees")]
    #[ts(rename = "hueShiftDegrees")]
    pub hue_shift_degrees: f32,
    #[serde(rename = "alternateRows")]
    #[ts(rename = "alternateRows")]
    pub alternate_rows: bool,
    #[serde(rename = "foregroundColour")]
    #[ts(rename = "foregroundColour")]
    pub foreground_colour: String,
    #[serde(rename = "secondaryColour")]
    #[ts(rename = "secondaryColour")]
    pub secondary_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
    #[serde(rename = "sampleSourcePath", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "sampleSourcePath")]
    pub sample_source_path: Option<String>,
    #[serde(
        rename = "sampleSourceObjectId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(rename = "sampleSourceObjectId")]
    pub sample_source_object_id: Option<String>,
    #[serde(
        rename = "sampleSourceLayer",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(rename = "sampleSourceLayer")]
    pub sample_source_layer: Option<f32>,
    #[serde(rename = "sampleStrength", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "sampleStrength")]
    pub sample_strength: Option<f32>,
    #[serde(
        rename = "sampleHueShiftDegrees",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(rename = "sampleHueShiftDegrees")]
    pub sample_hue_shift_degrees: Option<f32>,
    pub seed: u32,
}

impl Default for GetColorDotFieldObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            columns: 32,
            rows: 18,
            dot_size: 14.0,
            dot_shape: None,
            stroke_width: None,
            size_influence: 0.65,
            luminance_influence: 0.7,
            hue_shift_degrees: 0.0,
            alternate_rows: true,
            foreground_colour: "#ffffff".to_string(),
            secondary_colour: "#36c2ff".to_string(),
            background_colour: "#000000".to_string(),
            sample_source_path: None,
            sample_source_object_id: None,
            sample_source_layer: None,
            sample_strength: None,
            sample_hue_shift_degrees: None,
            seed: 93,
        }
    }
}

/// `region_frame` kind (`src/types.ts` の `RegionFrameObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & RegionFrameObjectFields & { type: 'region_frame' }` として
/// 組み立てる。
///
/// `width`/`height` は `regionFrameObjectFactory.ts` の
/// `buildAviUtlRegionFrameObject` がプロジェクトサイズから都度計算するため
/// ニュートラルな `0.0` にする。他のフィールドは同ファイルの固定リテラル
/// （lineWidth: 10, extraWidth: 0, extraHeight: 0, backgroundOpacity: 0.2,
/// frameColour: '#ffffff', backgroundColour: '#ccccff'）をそのまま採用する。
/// `shape`/`cornerCut` はバリアント（rectangle/ellipse/cut_corner）ごとに
/// 明示されるフィールドで、共通既定値としてはニュートラルな `None` にする。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct RegionFrameObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<String>,
    #[serde(rename = "cornerCut", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "cornerCut")]
    pub corner_cut: Option<f32>,
    #[serde(rename = "extraWidth")]
    #[ts(rename = "extraWidth")]
    pub extra_width: f32,
    #[serde(rename = "extraHeight")]
    #[ts(rename = "extraHeight")]
    pub extra_height: f32,
    #[serde(rename = "backgroundOpacity")]
    #[ts(rename = "backgroundOpacity")]
    pub background_opacity: f32,
    #[serde(rename = "frameColour")]
    #[ts(rename = "frameColour")]
    pub frame_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for RegionFrameObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            line_width: 10.0,
            shape: None,
            corner_cut: None,
            extra_width: 0.0,
            extra_height: 0.0,
            background_opacity: 0.2,
            frame_colour: "#ffffff".to_string(),
            background_colour: "#ccccff".to_string(),
        }
    }
}

/// `simple_tube` kind (`src/types.ts` の `SimpleTubeObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & SimpleTubeObjectFields & { type: 'simple_tube' }` として
/// 組み立てる。
///
/// `width`/`height` は `simpleTubeObjectFactory.ts` の
/// `buildAviUtlSimpleTubeObject` がプロジェクトサイズから都度計算するため
/// ニュートラルな `0.0` にする。他のフィールドは同ファイルの固定リテラルを
/// そのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SimpleTubeObjectFields {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub depth: f32,
    pub segments: u32,
    pub rings: u32,
    #[serde(rename = "twistDegrees")]
    #[ts(rename = "twistDegrees")]
    pub twist_degrees: f32,
    #[serde(rename = "randomAmount")]
    #[ts(rename = "randomAmount")]
    pub random_amount: f32,
    #[serde(rename = "strokeWidth")]
    #[ts(rename = "strokeWidth")]
    pub stroke_width: f32,
    pub colour: String,
    #[serde(rename = "secondaryColour")]
    #[ts(rename = "secondaryColour")]
    pub secondary_colour: String,
    #[serde(rename = "colourPattern", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "colourPattern")]
    pub colour_pattern: Option<String>,
    #[serde(rename = "fogStrength", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "fogStrength")]
    pub fog_strength: Option<f32>,
    #[serde(rename = "fogColour", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "fogColour")]
    pub fog_colour: Option<String>,
    pub seed: u32,
    pub torus: bool,
}

impl Default for SimpleTubeObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            radius: 150.0,
            depth: 280.0,
            segments: 16,
            rings: 10,
            twist_degrees: 0.0,
            random_amount: 0.0,
            stroke_width: 3.0,
            colour: "#0e769f".to_string(),
            secondary_colour: "#ffffff".to_string(),
            colour_pattern: None,
            fog_strength: None,
            fog_colour: None,
            seed: 93,
            torus: false,
        }
    }
}

/// `sphere_dots` kind (`src/types.ts` の `SphereDotsObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & SphereDotsObjectFields & { type: 'sphere_dots' }` として
/// 組み立てる。
///
/// `width`/`height` は `sphereDotsObjectFactory.ts` の
/// `buildAviUtlSphereDotsObject` がプロジェクトサイズから都度計算するため
/// ニュートラルな `0.0` にする。他のフィールドは同ファイルの固定リテラルを
/// そのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SphereDotsObjectFields {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub columns: u32,
    pub rows: u32,
    #[serde(rename = "rotationDegrees")]
    #[ts(rename = "rotationDegrees")]
    pub rotation_degrees: f32,
    #[serde(rename = "offsetDegrees")]
    #[ts(rename = "offsetDegrees")]
    pub offset_degrees: f32,
    #[serde(rename = "luminanceInfluence")]
    #[ts(rename = "luminanceInfluence")]
    pub luminance_influence: f32,
    #[serde(rename = "pointSize")]
    #[ts(rename = "pointSize")]
    pub point_size: f32,
    #[serde(rename = "latitudeLineWidth")]
    #[ts(rename = "latitudeLineWidth")]
    pub latitude_line_width: f32,
    pub colour: String,
    #[serde(rename = "secondaryColour")]
    #[ts(rename = "secondaryColour")]
    pub secondary_colour: String,
    pub seed: u32,
    #[serde(rename = "planeMode")]
    #[ts(rename = "planeMode")]
    pub plane_mode: bool,
}

impl Default for SphereDotsObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            radius: 170.0,
            columns: 16,
            rows: 12,
            rotation_degrees: 10.0,
            offset_degrees: 0.0,
            luminance_influence: 0.0,
            point_size: 6.0,
            latitude_line_width: 2.0,
            colour: "#ffffff".to_string(),
            secondary_colour: "#36c2ff".to_string(),
            seed: 93,
            plane_mode: false,
        }
    }
}

/// `spherical_field` kind (`src/types.ts` の `SphericalFieldObject`) の kind
/// 固有フィールド。編集モデル型は
/// `BaseObject & SphericalFieldObjectFields & { type: 'spherical_field' }`
/// として組み立てる。
///
/// `width`/`height` は `sphericalFieldObjectFactory.ts` の
/// `buildAviUtlSphericalFieldObject` がプロジェクトサイズから都度計算する
/// ため ニュートラルな `0.0` にする。他のフィールドは同ファイルの固定
/// リテラルをそのまま採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SphericalFieldObjectFields {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub strength: f32,
    #[serde(rename = "colourAmount")]
    #[ts(rename = "colourAmount")]
    pub colour_amount: f32,
    #[serde(rename = "alphaAmount")]
    #[ts(rename = "alphaAmount")]
    pub alpha_amount: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    #[serde(rename = "ringCount")]
    #[ts(rename = "ringCount")]
    pub ring_count: u32,
    #[serde(rename = "vectorCount")]
    #[ts(rename = "vectorCount")]
    pub vector_count: u32,
    #[serde(rename = "fieldColour")]
    #[ts(rename = "fieldColour")]
    pub field_colour: String,
    #[serde(rename = "secondaryColour")]
    #[ts(rename = "secondaryColour")]
    pub secondary_colour: String,
    #[serde(rename = "backgroundOpacity")]
    #[ts(rename = "backgroundOpacity")]
    pub background_opacity: f32,
    pub container: bool,
    pub seed: u32,
}

impl Default for SphericalFieldObjectFields {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            radius: 160.0,
            strength: 100.0,
            colour_amount: 100.0,
            alpha_amount: 0.0,
            line_width: 3.0,
            ring_count: 4,
            vector_count: 16,
            field_colour: "#ff3b30".to_string(),
            secondary_colour: "#36c2ff".to_string(),
            background_opacity: 0.08,
            container: false,
            seed: 93,
        }
    }
}

/// `sunburst` kind (`src/types.ts` の `SunburstObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & SunburstObjectFields & { type: 'sunburst' }` として組み立てる。
///
/// `width`/`height` は `sunburstObjectFactory.ts` の
/// `buildAviUtlSunburstObject` の固定リテラル (800x450) をそのまま採用する
/// （プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct SunburstObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "rayCount")]
    #[ts(rename = "rayCount")]
    pub ray_count: u32,
    #[serde(rename = "rayCoveragePercent")]
    #[ts(rename = "rayCoveragePercent")]
    pub ray_coverage_percent: f32,
    #[serde(rename = "rotationOffsetDegrees")]
    #[ts(rename = "rotationOffsetDegrees")]
    pub rotation_offset_degrees: f32,
    #[serde(rename = "centreXPercent")]
    #[ts(rename = "centreXPercent")]
    pub centre_x_percent: f32,
    #[serde(rename = "centreYPercent")]
    #[ts(rename = "centreYPercent")]
    pub centre_y_percent: f32,
    #[serde(rename = "motifSize")]
    #[ts(rename = "motifSize")]
    pub motif_size: f32,
    #[serde(rename = "motifShape")]
    #[ts(rename = "motifShape")]
    pub motif_shape: String,
    #[serde(rename = "rayColour")]
    #[ts(rename = "rayColour")]
    pub ray_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for SunburstObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            ray_count: 10,
            ray_coverage_percent: 50.0,
            rotation_offset_degrees: 0.0,
            centre_x_percent: 50.0,
            centre_y_percent: 50.0,
            motif_size: 200.0,
            motif_shape: "circle".to_string(),
            ray_colour: "#ff0000".to_string(),
            background_colour: "#ffff00".to_string(),
        }
    }
}

/// `circular_arrow` kind (`src/types.ts` の `CircularArrowObject`) の kind
/// 固有フィールド。編集モデル型は
/// `BaseObject & CircularArrowObjectFields & { type: 'circular_arrow' }`
/// として組み立てる。
///
/// `width`/`height` は `circularArrowObjectFactory.ts` の
/// `buildAviUtlCircularArrowObject` の固定リテラル (200x200) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct CircularArrowObjectFields {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    #[serde(rename = "headSize")]
    #[ts(rename = "headSize")]
    pub head_size: f32,
    #[serde(rename = "angleDegrees")]
    #[ts(rename = "angleDegrees")]
    pub angle_degrees: f32,
    #[serde(rename = "centreAngleDegrees")]
    #[ts(rename = "centreAngleDegrees")]
    pub centre_angle_degrees: f32,
    #[serde(rename = "headShape")]
    #[ts(rename = "headShape")]
    pub head_shape: String,
    #[serde(rename = "showTailHead")]
    #[ts(rename = "showTailHead")]
    pub show_tail_head: bool,
    #[serde(rename = "flipVertical")]
    #[ts(rename = "flipVertical")]
    pub flip_vertical: bool,
    #[serde(rename = "flipHorizontal")]
    #[ts(rename = "flipHorizontal")]
    pub flip_horizontal: bool,
    #[serde(rename = "arrowColour")]
    #[ts(rename = "arrowColour")]
    pub arrow_colour: String,
}

impl Default for CircularArrowObjectFields {
    fn default() -> Self {
        Self {
            width: 200.0,
            height: 200.0,
            radius: 100.0,
            line_width: 20.0,
            head_size: 50.0,
            angle_degrees: 260.0,
            centre_angle_degrees: 0.0,
            head_shape: "triangle".to_string(),
            show_tail_head: false,
            flip_vertical: false,
            flip_horizontal: false,
            arrow_colour: "#ffff00".to_string(),
        }
    }
}

/// `triangle_bracket` kind (`src/types.ts` の `TriangleBracketObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & TriangleBracketObjectFields & { type: 'triangle_bracket' }`
/// として組み立てる。
///
/// `width`/`height` は `triangleBracketObjectFactory.ts` の
/// `buildAviUtlTriangleBracketObject` の固定リテラル (160x100) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct TriangleBracketObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "bracketWidth")]
    #[ts(rename = "bracketWidth")]
    pub bracket_width: f32,
    #[serde(rename = "angleDegrees")]
    #[ts(rename = "angleDegrees")]
    pub angle_degrees: f32,
    #[serde(rename = "armLength")]
    #[ts(rename = "armLength")]
    pub arm_length: f32,
    #[serde(rename = "offsetDistance")]
    #[ts(rename = "offsetDistance")]
    pub offset_distance: f32,
    #[serde(rename = "bracketColour")]
    #[ts(rename = "bracketColour")]
    pub bracket_colour: String,
}

impl Default for TriangleBracketObjectFields {
    fn default() -> Self {
        Self {
            width: 160.0,
            height: 100.0,
            bracket_width: 100.0,
            angle_degrees: 120.0,
            arm_length: 50.0,
            offset_distance: 0.0,
            bracket_colour: "#ffffff".to_string(),
        }
    }
}

/// `tartan_check` kind (`src/types.ts` の `TartanCheckObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & TartanCheckObjectFields & { type: 'tartan_check' }` として
/// 組み立てる。
///
/// `width`/`height` は `tartanCheckObjectFactory.ts` の
/// `buildAviUtlTartanCheckObject` の固定リテラル (800x450) をそのまま採用
/// する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct TartanCheckObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "tileSize")]
    #[ts(rename = "tileSize")]
    pub tile_size: f32,
    #[serde(rename = "blurRadius")]
    #[ts(rename = "blurRadius")]
    pub blur_radius: f32,
    #[serde(rename = "baseColour")]
    #[ts(rename = "baseColour")]
    pub base_colour: String,
    #[serde(rename = "stripeColourA")]
    #[ts(rename = "stripeColourA")]
    pub stripe_colour_a: String,
    #[serde(rename = "stripeColourB")]
    #[ts(rename = "stripeColourB")]
    pub stripe_colour_b: String,
    #[serde(rename = "lineColour")]
    #[ts(rename = "lineColour")]
    pub line_colour: String,
}

impl Default for TartanCheckObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            tile_size: 100.0,
            blur_radius: 1.0,
            base_colour: "#143e10".to_string(),
            stripe_colour_a: "#a81616".to_string(),
            stripe_colour_b: "#c9c526".to_string(),
            line_colour: "#000000".to_string(),
        }
    }
}

/// `houndstooth` kind (`src/types.ts` の `HoundstoothObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & HoundstoothObjectFields & { type: 'houndstooth' }` として
/// 組み立てる。
///
/// `width`/`height` は `houndstoothObjectFactory.ts` の
/// `buildAviUtlHoundstoothObject` の固定リテラル (800x450) をそのまま採用
/// する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct HoundstoothObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "patternSize")]
    #[ts(rename = "patternSize")]
    pub pattern_size: f32,
    #[serde(rename = "foregroundColour")]
    #[ts(rename = "foregroundColour")]
    pub foreground_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for HoundstoothObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            pattern_size: 50.0,
            foreground_colour: "#000000".to_string(),
            background_colour: "#ffffff".to_string(),
        }
    }
}

/// `yagasuri` kind (`src/types.ts` の `YagasuriObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & YagasuriObjectFields & { type: 'yagasuri' }` として組み立てる。
///
/// `width`/`height` は `yagasuriObjectFactory.ts` の
/// `buildAviUtlYagasuriObject` の固定リテラル (800x450) をそのまま採用する
/// （プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct YagasuriObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "arrowWidth")]
    #[ts(rename = "arrowWidth")]
    pub arrow_width: f32,
    #[serde(rename = "arrowHeight")]
    #[ts(rename = "arrowHeight")]
    pub arrow_height: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    pub staggered: bool,
    #[serde(rename = "foregroundColour")]
    #[ts(rename = "foregroundColour")]
    pub foreground_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for YagasuriObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            arrow_width: 15.0,
            arrow_height: 65.0,
            line_width: 2.0,
            staggered: true,
            foreground_colour: "#000000".to_string(),
            background_colour: "#ffffff".to_string(),
        }
    }
}

/// `paper_airplane` kind (`src/types.ts` の `PaperAirplaneObject`) の kind
/// 固有フィールド。編集モデル型は
/// `BaseObject & PaperAirplaneObjectFields & { type: 'paper_airplane' }`
/// として組み立てる。
///
/// `width`/`height` は `paperAirplaneObjectFactory.ts` の
/// `buildAviUtlPaperAirplaneObject` の固定リテラル (320x240) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct PaperAirplaneObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "bodyLength")]
    #[ts(rename = "bodyLength")]
    pub body_length: f32,
    #[serde(rename = "wingWidth")]
    #[ts(rename = "wingWidth")]
    pub wing_width: f32,
    #[serde(rename = "foldHeight")]
    #[ts(rename = "foldHeight")]
    pub fold_height: f32,
    pub gap: f32,
    #[serde(rename = "followMotionDirection")]
    #[ts(rename = "followMotionDirection")]
    pub follow_motion_direction: bool,
    #[serde(rename = "axisMode")]
    #[ts(rename = "axisMode")]
    pub axis_mode: f32,
    #[serde(rename = "fillColour")]
    #[ts(rename = "fillColour")]
    pub fill_colour: String,
}

impl Default for PaperAirplaneObjectFields {
    fn default() -> Self {
        Self {
            width: 320.0,
            height: 240.0,
            body_length: 200.0,
            wing_width: 80.0,
            fold_height: 50.0,
            gap: 50.0,
            follow_motion_direction: false,
            axis_mode: 0.0,
            fill_colour: "#ffffff".to_string(),
        }
    }
}

/// `asanoha_pattern` kind (`src/types.ts` の `AsanohaPatternObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & AsanohaPatternObjectFields & { type: 'asanoha_pattern' }`
/// として組み立てる。
///
/// `width`/`height` は `asanohaPatternObjectFactory.ts` の
/// `buildAviUtlAsanohaPatternObject` の固定リテラル (800x450) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AsanohaPatternObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "patternSize")]
    #[ts(rename = "patternSize")]
    pub pattern_size: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    #[serde(rename = "foregroundColour")]
    #[ts(rename = "foregroundColour")]
    pub foreground_colour: String,
    #[serde(rename = "backgroundColour")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: String,
}

impl Default for AsanohaPatternObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            pattern_size: 50.0,
            line_width: 2.0,
            foreground_colour: "#000000".to_string(),
            background_colour: "#ffffff".to_string(),
        }
    }
}

/// `focus_lines_plus` kind (`src/types.ts` の `FocusLinesPlusObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & FocusLinesPlusObjectFields & { type: 'focus_lines_plus' }`
/// として組み立てる。
///
/// `width`/`height` は `focusLinesPlusObjectFactory.ts` の
/// `buildAviUtlFocusLinesPlusObject` の固定リテラル (800x450) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。`rust-core/src/
/// focus_lines.rs` の `focus_lines_frame_bucket` はこの構造体と独立した
/// バケット計算関数であり、クロスオブジェクト参照は持たない。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct FocusLinesPlusObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "rayWidth")]
    #[ts(rename = "rayWidth")]
    pub ray_width: f32,
    pub gap: f32,
    #[serde(rename = "centreRadius")]
    #[ts(rename = "centreRadius")]
    pub centre_radius: f32,
    #[serde(rename = "rotationDegrees")]
    #[ts(rename = "rotationDegrees")]
    pub rotation_degrees: f32,
    #[serde(rename = "centreX")]
    #[ts(rename = "centreX")]
    pub centre_x: f32,
    #[serde(rename = "centreY")]
    #[ts(rename = "centreY")]
    pub centre_y: f32,
    #[serde(rename = "centreJitterPercent")]
    #[ts(rename = "centreJitterPercent")]
    pub centre_jitter_percent: f32,
    pub seed: u32,
    #[serde(rename = "keyframeInterval")]
    #[ts(rename = "keyframeInterval")]
    pub keyframe_interval: f32,
    #[serde(rename = "lineColour")]
    #[ts(rename = "lineColour")]
    pub line_colour: String,
}

impl Default for FocusLinesPlusObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            ray_width: 1.0,
            gap: 5.0,
            centre_radius: 100.0,
            rotation_degrees: 0.0,
            centre_x: 400.0,
            centre_y: 225.0,
            centre_jitter_percent: 20.0,
            seed: 0,
            keyframe_interval: 0.0,
            line_colour: "#ffffff".to_string(),
        }
    }
}

/// `random_line_ex` kind (`src/types.ts` の `RandomLineExObject`) の kind
/// 固有フィールド。編集モデル型は
/// `BaseObject & RandomLineExObjectFields & { type: 'random_line_ex' }`
/// として組み立てる。
///
/// `width`/`height` は `randomLineExObjectFactory.ts` の
/// `buildAviUtlRandomLineExObject` の固定リテラル (800x450) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct RandomLineExObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "lineCount")]
    #[ts(rename = "lineCount")]
    pub line_count: u32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    pub threshold: f32,
    #[serde(rename = "noiseCellSize")]
    #[ts(rename = "noiseCellSize")]
    pub noise_cell_size: f32,
    #[serde(rename = "widthVariance")]
    #[ts(rename = "widthVariance")]
    pub width_variance: f32,
    pub seed: u32,
    #[serde(rename = "lineColour")]
    #[ts(rename = "lineColour")]
    pub line_colour: String,
}

impl Default for RandomLineExObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            line_count: 3,
            line_width: 6.0,
            threshold: 128.0,
            noise_cell_size: 12.0,
            width_variance: 0.0,
            seed: 0,
            line_colour: "#ffffff".to_string(),
        }
    }
}

/// `contour_trace` kind (`src/types.ts` の `ContourTraceObject`) の kind
/// 固有フィールド。編集モデル型は
/// `BaseObject & ContourTraceObjectFields & { type: 'contour_trace' }`
/// として組み立てる。
///
/// `width`/`height` は `contourTraceObjectFactory.ts` の
/// `buildAviUtlContourTraceObject` の固定リテラル (800x450) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ContourTraceObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    #[serde(rename = "contourCount")]
    #[ts(rename = "contourCount")]
    pub contour_count: u32,
    #[serde(rename = "jitterAmount")]
    #[ts(rename = "jitterAmount")]
    pub jitter_amount: f32,
    #[serde(rename = "traceColour")]
    #[ts(rename = "traceColour")]
    pub trace_colour: String,
    #[serde(rename = "backgroundOpacity")]
    #[ts(rename = "backgroundOpacity")]
    pub background_opacity: f32,
    pub seed: u32,
}

impl Default for ContourTraceObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            line_width: 3.0,
            contour_count: 5,
            jitter_amount: 1.5,
            trace_colour: "#ffffff".to_string(),
            background_opacity: 0.0,
            seed: 93,
        }
    }
}

/// `displacement_poly` kind (`src/types.ts` の `DisplacementPolyObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & DisplacementPolyObjectFields & { type: 'displacement_poly' }`
/// として組み立てる。
///
/// `width`/`height` は `displacementPolyObjectFactory.ts` の
/// `buildAviUtlDisplacementPolyObject` の固定リテラル (800x450) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct DisplacementPolyObjectFields {
    pub width: f32,
    pub height: f32,
    pub columns: u32,
    pub rows: u32,
    #[serde(rename = "displacementScale")]
    #[ts(rename = "displacementScale")]
    pub displacement_scale: f32,
    #[serde(rename = "depthScale")]
    #[ts(rename = "depthScale")]
    pub depth_scale: f32,
    #[serde(rename = "meshOpacity")]
    #[ts(rename = "meshOpacity")]
    pub mesh_opacity: f32,
    #[serde(rename = "fillOpacity")]
    #[ts(rename = "fillOpacity")]
    pub fill_opacity: f32,
    #[serde(rename = "lineColour")]
    #[ts(rename = "lineColour")]
    pub line_colour: String,
    #[serde(rename = "fillColour")]
    #[ts(rename = "fillColour")]
    pub fill_colour: String,
    pub seed: u32,
}

impl Default for DisplacementPolyObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            columns: 14,
            rows: 8,
            displacement_scale: 42.0,
            depth_scale: 18.0,
            mesh_opacity: 0.85,
            fill_opacity: 0.18,
            line_colour: "#36c2ff".to_string(),
            fill_colour: "#0b1020".to_string(),
            seed: 93,
        }
    }
}

/// `plain_effector_line` kind (`src/types.ts` の `PlainEffectorLineObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & PlainEffectorLineObjectFields & { type: 'plain_effector_line' }`
/// として組み立てる。
///
/// `width`/`height` は `plainEffectorLineObjectFactory.ts` の
/// `buildAviUtlPlainEffectorLineObject` の固定リテラル (800x450) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct PlainEffectorLineObjectFields {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub strength: f32,
    pub randomness: f32,
    pub zoom: f32,
    pub invert: bool,
    #[serde(rename = "lineCount")]
    #[ts(rename = "lineCount")]
    pub line_count: u32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: f32,
    pub colour: String,
    #[serde(rename = "colourAmount")]
    #[ts(rename = "colourAmount")]
    pub colour_amount: f32,
    pub seed: u32,
}

impl Default for PlainEffectorLineObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            radius: 100.0,
            strength: 1.0,
            randomness: 0.0,
            zoom: 1.0,
            invert: false,
            line_count: 24,
            line_width: 2.0,
            colour: "#f74d52".to_string(),
            colour_amount: 1.0,
            seed: 93,
        }
    }
}

/// `hologram` kind (`src/types.ts` の `HologramObject`) の kind 固有フィールド。
/// 編集モデル型は
/// `BaseObject & HologramObjectFields & { type: 'hologram' }` として組み立てる。
///
/// `width`/`height` は `hologramObjectFactory.ts` の
/// `buildAviUtlHologramObject` の固定リテラル (800x450) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct HologramObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "tileSize")]
    #[ts(rename = "tileSize")]
    pub tile_size: u32,
    #[serde(rename = "rotationDegrees")]
    #[ts(rename = "rotationDegrees")]
    pub rotation_degrees: f32,
    #[serde(rename = "gradientAngleDegrees")]
    #[ts(rename = "gradientAngleDegrees")]
    pub gradient_angle_degrees: f32,
    #[serde(rename = "colourMode")]
    #[ts(rename = "colourMode")]
    pub colour_mode: u32,
    #[serde(rename = "tintColour")]
    #[ts(rename = "tintColour")]
    pub tint_colour: String,
}

impl Default for HologramObjectFields {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 450.0,
            tile_size: 80,
            rotation_degrees: 0.0,
            gradient_angle_degrees: -60.0,
            colour_mode: 1,
            tint_colour: "#ffffff".to_string(),
        }
    }
}

/// `protractor` kind (`src/types.ts` の `ProtractorObject`) の kind 固有
/// フィールド。編集モデル型は
/// `BaseObject & ProtractorObjectFields & { type: 'protractor' }` として
/// 組み立てる。
///
/// `width`/`height` は `protractorObjectFactory.ts` の
/// `buildAviUtlProtractorObject` の固定リテラル (420x240) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ProtractorObjectFields {
    pub width: f32,
    pub height: f32,
    pub radius: u32,
    #[serde(rename = "measuredAngleDegrees")]
    #[ts(rename = "measuredAngleDegrees")]
    pub measured_angle_degrees: f32,
    #[serde(rename = "tickStepDegrees")]
    #[ts(rename = "tickStepDegrees")]
    pub tick_step_degrees: u32,
    #[serde(rename = "majorTickStepDegrees")]
    #[ts(rename = "majorTickStepDegrees")]
    pub major_tick_step_degrees: u32,
    #[serde(rename = "decimalPlaces")]
    #[ts(rename = "decimalPlaces")]
    pub decimal_places: u32,
    #[serde(rename = "lineColour")]
    #[ts(rename = "lineColour")]
    pub line_colour: String,
    #[serde(rename = "textColour")]
    #[ts(rename = "textColour")]
    pub text_colour: String,
    #[serde(rename = "shadowColour")]
    #[ts(rename = "shadowColour")]
    pub shadow_colour: String,
}

impl Default for ProtractorObjectFields {
    fn default() -> Self {
        Self {
            width: 420.0,
            height: 240.0,
            radius: 180,
            measured_angle_degrees: 90.0,
            tick_step_degrees: 10,
            major_tick_step_degrees: 30,
            decimal_places: 1,
            line_colour: "#ffffff".to_string(),
            text_colour: "#ffffff".to_string(),
            shadow_colour: "#000000".to_string(),
        }
    }
}

/// `shaking_polygon` kind (`src/types.ts` の `ShakingPolygonObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & ShakingPolygonObjectFields & { type: 'shaking_polygon' }`
/// として組み立てる。
///
/// `width`/`height` は `shakingPolygonObjectFactory.ts` の
/// `buildAviUtlShakingPolygonObject` の固定リテラル (360x360) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ShakingPolygonObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "lineWidth")]
    #[ts(rename = "lineWidth")]
    pub line_width: u32,
    #[serde(rename = "vertexCount")]
    #[ts(rename = "vertexCount")]
    pub vertex_count: u32,
    #[serde(rename = "fixedDiameter")]
    #[ts(rename = "fixedDiameter")]
    pub fixed_diameter: u32,
    #[serde(rename = "verticalDistortionPercent")]
    #[ts(rename = "verticalDistortionPercent")]
    pub vertical_distortion_percent: f32,
    #[serde(rename = "repeatCount")]
    #[ts(rename = "repeatCount")]
    pub repeat_count: u32,
    #[serde(rename = "repeatFrequency")]
    #[ts(rename = "repeatFrequency")]
    pub repeat_frequency: u32,
    pub fill: bool,
    #[serde(rename = "jitterRange")]
    #[ts(rename = "jitterRange")]
    pub jitter_range: f32,
    #[serde(rename = "jitterInterval")]
    #[ts(rename = "jitterInterval")]
    pub jitter_interval: u32,
    pub stepped: bool,
    pub colour: String,
    pub seed: u32,
}

impl Default for ShakingPolygonObjectFields {
    fn default() -> Self {
        Self {
            width: 360.0,
            height: 360.0,
            line_width: 20,
            vertex_count: 3,
            fixed_diameter: 260,
            vertical_distortion_percent: 0.0,
            repeat_count: 1,
            repeat_frequency: 1,
            fill: false,
            jitter_range: 20.0,
            jitter_interval: 10,
            stepped: false,
            colour: "#ffffff".to_string(),
            seed: 0,
        }
    }
}

/// `shattered_sphere` kind (`src/types.ts` の `ShatteredSphereObject`) の
/// kind 固有フィールド。編集モデル型は
/// `BaseObject & ShatteredSphereObjectFields & { type: 'shattered_sphere' }`
/// として組み立てる。
///
/// `width`/`height` は `shatteredSphereObjectFactory.ts` の
/// `buildAviUtlShatteredSphereObject` の固定リテラル (360x360) をそのまま
/// 採用する（プロジェクトサイズ依存の計算値ではない）。重力は TS 側が
/// `gravityX`/`gravityY`/`gravityZ` の3フィールドで持つため、rust-backend
/// 側の旧 `[f32; 3]` 配列表現はやめ、フィールドをそのままミラーする。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct ShatteredSphereObjectFields {
    pub width: f32,
    pub height: f32,
    #[serde(rename = "fractureAmount")]
    #[ts(rename = "fractureAmount")]
    pub fracture_amount: f32,
    pub delay: f32,
    pub radius: f32,
    #[serde(rename = "limitDistance")]
    #[ts(rename = "limitDistance")]
    pub limit_distance: f32,
    pub thickness: f32,
    #[serde(rename = "fragmentSize")]
    #[ts(rename = "fragmentSize")]
    pub fragment_size: f32,
    #[serde(rename = "randomShape")]
    #[ts(rename = "randomShape")]
    pub random_shape: f32,
    pub speed: f32,
    pub impact: f32,
    #[serde(rename = "gravityX")]
    #[ts(rename = "gravityX")]
    pub gravity_x: f32,
    #[serde(rename = "gravityY")]
    #[ts(rename = "gravityY")]
    pub gravity_y: f32,
    #[serde(rename = "gravityZ")]
    #[ts(rename = "gravityZ")]
    pub gravity_z: f32,
    pub spin: f32,
    #[serde(rename = "directionDiffusion")]
    #[ts(rename = "directionDiffusion")]
    pub direction_diffusion: f32,
    pub colour: String,
    pub seed: u32,
}

impl Default for ShatteredSphereObjectFields {
    fn default() -> Self {
        Self {
            width: 360.0,
            height: 360.0,
            fracture_amount: 100.0,
            delay: 100.0,
            radius: 160.0,
            limit_distance: 150.0,
            thickness: 20.0,
            fragment_size: 40.0,
            random_shape: 100.0,
            speed: 100.0,
            impact: 100.0,
            gravity_x: 0.0,
            gravity_y: 100.0,
            gravity_z: 0.0,
            spin: 100.0,
            direction_diffusion: 100.0,
            colour: "#ffffff".to_string(),
            seed: 93,
        }
    }
}

/// `GroupControlObject`（`src/types.ts`）の `type` / `BaseObject` 由来フィールドを
/// 除いた編集モデルフィールド。`GroupControlObject` は
/// `BaseObject & GroupControlObjectFields & { type: 'group_control' }`
/// として組み立てる。
///
/// **wire 統一（stage 4）は見送る**: `group_control` は他 object を束ねる
/// 制御構造そのもので、`editableRustScene.ts` の
/// `EditableRustGroupControl`/`transformForGroupControl` が
/// `targetLayerCount` を「対象 track を Rust 側 `GroupControl.target_track_ids`
/// に解決する」ためのクロスオブジェクト参照（同一 layer 以下の他オブジェクトを
/// 走査して束ねる）に使っており、既存の評価用 `GroupControl`
/// （本ファイル上部、`Project.group_controls` が保持する別型）へ変換する
/// ロジックを内包する。これは `audio_visualization`/`audio_sphere`/
/// `getcolor_dot_field` と同じ「構造的に想定より複雑」なケースのため、
/// 型移送のみで打ち切る。
///
/// `targetLayerCount` の既定値は `Timeline.tsx` の `addGroupControlAt` が
/// 生成する固定リテラル `0` を採用する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct GroupControlObjectFields {
    #[serde(rename = "targetLayerCount")]
    #[ts(rename = "targetLayerCount")]
    pub target_layer_count: u32,
}

impl Default for GroupControlObjectFields {
    fn default() -> Self {
        Self { target_layer_count: 0 }
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
