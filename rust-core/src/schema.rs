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
