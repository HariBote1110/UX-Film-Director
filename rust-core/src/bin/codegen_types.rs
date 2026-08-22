//! `rust-core` の型定義から TypeScript 宣言と JSON Schema を生成する。
//!
//! `npm run codegen:types` から `cargo run --bin codegen_types` として呼ばれる。
//! ここで手動 export する理由は、`#[ts(export)]` 属性を使うと ts-rs が
//! `cargo test` にエクスポート用のテストを自動追加してしまい、
//! `cargo test --manifest-path rust-core/Cargo.toml` の合格件数が
//! ビルドのたびに変動してしまうため（R1 の合格条件は件数一致）。
//! 代わりにここで `TS::export_all` / `schemars::SchemaGenerator` を直接呼び、
//! 通常の `cargo test` には一切影響を与えない。

use std::fs;
use std::path::{Path, PathBuf};

use schemars::{JsonSchema, SchemaGenerator};
use ts_rs::{Config, TS};
use uxfd_rust_core::agent_project::AgentProjectSpec;
use uxfd_rust_core::schema::{
    AsanohaPatternObjectFields, AudioLabPhoneme, AudioObjectFields, AudioSphereObjectFields,
    AudioVisualizationObjectFields, AudioVisualizationType, BarcodeObjectFields, BaseObject,
    CameraState, Clip, ClipKind, ColourPipeline, ContourTraceObjectFields,
    DisplacementPolyObjectFields, Easing, EditorMode, Effect, FocusLinesPlusObjectFields, Fps,
    GearObjectFields, GetColorDotFieldObjectFields,
    GourdObjectFields, GroupControl, GroupControlObjectFields, HksyAnchorPoint, HksyCheckerGridObjectFields,
    HistogramObjectFields, HologramObjectFields, ImageObjectFields,
    LayerState, LipSyncMapping, LipSyncSetting, LipSyncSourceMode,
    PsdLayerNodeFields, PsdObjectFields,
    ColourWheelObjectFields, MediaKind, MediaReference, PaperAirplaneObjectFields,
    ParticleObjectFields, PieChartLabelMode,
    PieChartObjectFields, PieChartSortMode, PlainEffectorLineObjectFields, PositionKeyframe,
    Project, ProjectFile, ProjectSettings, ProjectSize, ProtractorObjectFields, PsdWorldPlacement,
    PuzzleConnectorMode, PuzzlePieceObjectFields, RandomLineExObjectFields,
    RegionFrameObjectFields,
    SamplingMode, SceneData, StageCamera3D,
    ScalarKeyframe, ShakingPolygonObjectFields, ShapeGradientFill, ShapeGradientKind,
    ShapeGradientScope, ShapeObjectFields,
    CircularArrowObjectFields, HoundstoothObjectFields, ShapeType, ShatteredSphereObjectFields,
    SimpleTubeObjectFields,
    SphereDotsObjectFields, SphericalFieldObjectFields, SubjectCropAnimation, SubjectCropKeyframe,
    SubjectCropNormKeyframe, SunburstObjectFields, TartanCheckObjectFields, TextAlignment,
    TextObjectFields, TextShadow, TextStroke, TimelineObject, ToneCurveObjectFields, Track,
    TrackBarObjectFields,
    TriangleBracketObjectFields, Transform, Vec3, VideoObjectFields, WipeAnimation, WipeEdge,
    YagasuriObjectFields,
};
use uxfd_rust_core::timeline::{EvaluatedClip, SceneSnapshot};

fn ts_out_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/generated/rustCore")
}

fn schema_out_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../schema/rust-core")
}

/// `schema/agent-project.schema.json`（トップレベル、`schema/rust-core/` 配下
/// ではない）。エディタ補完・AIエージェントの自己検証で参照される既存パスを
/// 変えないため、他の生成物とは別の出力先にする。
fn agent_project_schema_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../schema/agent-project.schema.json")
}

fn write_ts_bindings() {
    let out_dir = ts_out_dir();
    let cfg = Config::new()
        .with_out_dir(out_dir.clone())
        // u64 の frame_offset / start_frame 等は手書きミラーでは number として扱っていた。
        // ts-rs の既定 (bigint) に変えると wire format は変わらないが TS 側の型が
        // 大きく変わり手動ミラーからの置き換えにならないため number に固定する。
        .with_large_int("number");

    Project::export_all(&cfg).expect("Project の TS export に失敗しました");
    ProjectFile::export_all(&cfg).expect("ProjectFile の TS export に失敗しました");
    SceneSnapshot::export_all(&cfg).expect("SceneSnapshot の TS export に失敗しました");
    EvaluatedClip::export_all(&cfg).expect("EvaluatedClip の TS export に失敗しました");
    ShapeObjectFields::export_all(&cfg).expect("ShapeObjectFields の TS export に失敗しました");
    TextObjectFields::export_all(&cfg).expect("TextObjectFields の TS export に失敗しました");
    ImageObjectFields::export_all(&cfg).expect("ImageObjectFields の TS export に失敗しました");
    SubjectCropNormKeyframe::export_all(&cfg)
        .expect("SubjectCropNormKeyframe の TS export に失敗しました");
    VideoObjectFields::export_all(&cfg).expect("VideoObjectFields の TS export に失敗しました");
    AudioLabPhoneme::export_all(&cfg).expect("AudioLabPhoneme の TS export に失敗しました");
    AudioObjectFields::export_all(&cfg).expect("AudioObjectFields の TS export に失敗しました");
    AudioVisualizationType::export_all(&cfg)
        .expect("AudioVisualizationType の TS export に失敗しました");
    AudioVisualizationObjectFields::export_all(&cfg)
        .expect("AudioVisualizationObjectFields の TS export に失敗しました");
    AudioSphereObjectFields::export_all(&cfg)
        .expect("AudioSphereObjectFields の TS export に失敗しました");
    ParticleObjectFields::export_all(&cfg).expect("ParticleObjectFields の TS export に失敗しました");
    BarcodeObjectFields::export_all(&cfg).expect("BarcodeObjectFields の TS export に失敗しました");
    PuzzleConnectorMode::export_all(&cfg).expect("PuzzleConnectorMode の TS export に失敗しました");
    PuzzlePieceObjectFields::export_all(&cfg)
        .expect("PuzzlePieceObjectFields の TS export に失敗しました");
    ColourWheelObjectFields::export_all(&cfg)
        .expect("ColourWheelObjectFields の TS export に失敗しました");
    GourdObjectFields::export_all(&cfg).expect("GourdObjectFields の TS export に失敗しました");
    GearObjectFields::export_all(&cfg).expect("GearObjectFields の TS export に失敗しました");
    TrackBarObjectFields::export_all(&cfg)
        .expect("TrackBarObjectFields の TS export に失敗しました");
    PieChartSortMode::export_all(&cfg).expect("PieChartSortMode の TS export に失敗しました");
    PieChartLabelMode::export_all(&cfg).expect("PieChartLabelMode の TS export に失敗しました");
    PieChartObjectFields::export_all(&cfg)
        .expect("PieChartObjectFields の TS export に失敗しました");
    HistogramObjectFields::export_all(&cfg)
        .expect("HistogramObjectFields の TS export に失敗しました");
    ToneCurveObjectFields::export_all(&cfg)
        .expect("ToneCurveObjectFields の TS export に失敗しました");
    HksyAnchorPoint::export_all(&cfg).expect("HksyAnchorPoint の TS export に失敗しました");
    HksyCheckerGridObjectFields::export_all(&cfg)
        .expect("HksyCheckerGridObjectFields の TS export に失敗しました");
    GetColorDotFieldObjectFields::export_all(&cfg)
        .expect("GetColorDotFieldObjectFields の TS export に失敗しました");
    RegionFrameObjectFields::export_all(&cfg)
        .expect("RegionFrameObjectFields の TS export に失敗しました");
    SimpleTubeObjectFields::export_all(&cfg)
        .expect("SimpleTubeObjectFields の TS export に失敗しました");
    SphereDotsObjectFields::export_all(&cfg)
        .expect("SphereDotsObjectFields の TS export に失敗しました");
    SphericalFieldObjectFields::export_all(&cfg)
        .expect("SphericalFieldObjectFields の TS export に失敗しました");
    SunburstObjectFields::export_all(&cfg)
        .expect("SunburstObjectFields の TS export に失敗しました");
    CircularArrowObjectFields::export_all(&cfg)
        .expect("CircularArrowObjectFields の TS export に失敗しました");
    TriangleBracketObjectFields::export_all(&cfg)
        .expect("TriangleBracketObjectFields の TS export に失敗しました");
    TartanCheckObjectFields::export_all(&cfg)
        .expect("TartanCheckObjectFields の TS export に失敗しました");
    HoundstoothObjectFields::export_all(&cfg)
        .expect("HoundstoothObjectFields の TS export に失敗しました");
    YagasuriObjectFields::export_all(&cfg)
        .expect("YagasuriObjectFields の TS export に失敗しました");
    PaperAirplaneObjectFields::export_all(&cfg)
        .expect("PaperAirplaneObjectFields の TS export に失敗しました");
    AsanohaPatternObjectFields::export_all(&cfg)
        .expect("AsanohaPatternObjectFields の TS export に失敗しました");
    FocusLinesPlusObjectFields::export_all(&cfg)
        .expect("FocusLinesPlusObjectFields の TS export に失敗しました");
    RandomLineExObjectFields::export_all(&cfg)
        .expect("RandomLineExObjectFields の TS export に失敗しました");
    ContourTraceObjectFields::export_all(&cfg)
        .expect("ContourTraceObjectFields の TS export に失敗しました");
    DisplacementPolyObjectFields::export_all(&cfg)
        .expect("DisplacementPolyObjectFields の TS export に失敗しました");
    PlainEffectorLineObjectFields::export_all(&cfg)
        .expect("PlainEffectorLineObjectFields の TS export に失敗しました");
    HologramObjectFields::export_all(&cfg)
        .expect("HologramObjectFields の TS export に失敗しました");
    ProtractorObjectFields::export_all(&cfg)
        .expect("ProtractorObjectFields の TS export に失敗しました");
    ShakingPolygonObjectFields::export_all(&cfg)
        .expect("ShakingPolygonObjectFields の TS export に失敗しました");
    ShatteredSphereObjectFields::export_all(&cfg)
        .expect("ShatteredSphereObjectFields の TS export に失敗しました");
    GroupControlObjectFields::export_all(&cfg)
        .expect("GroupControlObjectFields の TS export に失敗しました");
    Vec3::export_all(&cfg).expect("Vec3 の TS export に失敗しました");
    StageCamera3D::export_all(&cfg).expect("StageCamera3D の TS export に失敗しました");
    PsdWorldPlacement::export_all(&cfg).expect("PsdWorldPlacement の TS export に失敗しました");
    LipSyncSourceMode::export_all(&cfg).expect("LipSyncSourceMode の TS export に失敗しました");
    LipSyncMapping::export_all(&cfg).expect("LipSyncMapping の TS export に失敗しました");
    LipSyncSetting::export_all(&cfg).expect("LipSyncSetting の TS export に失敗しました");
    PsdLayerNodeFields::export_all(&cfg).expect("PsdLayerNodeFields の TS export に失敗しました");
    PsdObjectFields::export_all(&cfg).expect("PsdObjectFields の TS export に失敗しました");

    // R4-1a: ファイル形式スキャフォールディング。BaseObject / TimelineObject の
    // export_all が依存するサブ型（PathPoint / ObjectFilter 系 / ShadowEffect 等）
    // も連鎖して書き出す。
    BaseObject::export_all(&cfg).expect("BaseObject の TS export に失敗しました");
    TimelineObject::export_all(&cfg).expect("TimelineObject の TS export に失敗しました");
    EditorMode::export_all(&cfg).expect("EditorMode の TS export に失敗しました");
    ProjectSettings::export_all(&cfg).expect("ProjectSettings の TS export に失敗しました");
    LayerState::export_all(&cfg).expect("LayerState の TS export に失敗しました");
    CameraState::export_all(&cfg).expect("CameraState の TS export に失敗しました");
    SceneData::export_all(&cfg).expect("SceneData の TS export に失敗しました");

    // R4-4: エージェント用プロジェクトレシピ。
    AgentProjectSpec::export_all(&cfg).expect("AgentProjectSpec の TS export に失敗しました");

    write_index(&out_dir);

    println!("codegen:types (TypeScript) 完了 -> {}", out_dir.display());
}

/// `export_all` は型ごとのファイルは作るが、まとめて import できる index は
/// 作らないので、生成された *.ts を走査して barrel file を組み立てる。
fn write_index(out_dir: &Path) {
    let mut names: Vec<String> = fs::read_dir(out_dir)
        .expect("生成先ディレクトリを読めません")
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let file_name = entry.file_name().into_string().ok()?;
            let stem = file_name.strip_suffix(".ts")?;
            if stem == "index" {
                return None;
            }
            Some(stem.to_string())
        })
        .collect();
    names.sort();

    let mut buffer = String::new();
    buffer.push_str(
        "// This file was generated by rust-core/src/bin/codegen_types.rs. Do not edit this file manually.\n",
    );
    for name in &names {
        buffer.push_str(&format!("export * from './{name}';\n"));
    }

    fs::write(out_dir.join("index.ts"), buffer).expect("index.ts の書き込みに失敗しました");
}

fn write_schema<T: JsonSchema>(dir: &Path, name: &str) {
    let schema = SchemaGenerator::default().into_root_schema_for::<T>();
    let json = serde_json::to_string_pretty(&schema).expect("schema の JSON 化に失敗しました");
    let path = dir.join(format!("{name}.schema.json"));
    fs::write(&path, format!("{json}\n")).unwrap_or_else(|error| {
        panic!("{} の書き込みに失敗しました: {error}", path.display())
    });
}

fn write_json_schemas() {
    let dir = schema_out_dir();
    fs::create_dir_all(&dir).expect("schema 出力ディレクトリの作成に失敗しました");

    write_schema::<Fps>(&dir, "Fps");
    write_schema::<ProjectSize>(&dir, "ProjectSize");
    write_schema::<ColourPipeline>(&dir, "ColourPipeline");
    write_schema::<MediaKind>(&dir, "MediaKind");
    write_schema::<MediaReference>(&dir, "MediaReference");
    write_schema::<ClipKind>(&dir, "ClipKind");
    write_schema::<ScalarKeyframe>(&dir, "ScalarKeyframe");
    write_schema::<Easing>(&dir, "Easing");
    write_schema::<PositionKeyframe>(&dir, "PositionKeyframe");
    write_schema::<SubjectCropKeyframe>(&dir, "SubjectCropKeyframe");
    write_schema::<SubjectCropAnimation>(&dir, "SubjectCropAnimation");
    write_schema::<Transform>(&dir, "Transform");
    write_schema::<SamplingMode>(&dir, "SamplingMode");
    write_schema::<Effect>(&dir, "Effect");
    write_schema::<WipeEdge>(&dir, "WipeEdge");
    write_schema::<WipeAnimation>(&dir, "WipeAnimation");
    write_schema::<Clip>(&dir, "Clip");
    write_schema::<Track>(&dir, "Track");
    write_schema::<GroupControl>(&dir, "GroupControl");
    write_schema::<Project>(&dir, "Project");
    write_schema::<ProjectFile>(&dir, "ProjectFile");
    write_schema::<ShapeType>(&dir, "ShapeType");
    write_schema::<ShapeGradientKind>(&dir, "ShapeGradientKind");
    write_schema::<ShapeGradientScope>(&dir, "ShapeGradientScope");
    write_schema::<ShapeGradientFill>(&dir, "ShapeGradientFill");
    write_schema::<ShapeObjectFields>(&dir, "ShapeObjectFields");
    write_schema::<TextAlignment>(&dir, "TextAlignment");
    write_schema::<TextStroke>(&dir, "TextStroke");
    write_schema::<TextShadow>(&dir, "TextShadow");
    write_schema::<TextObjectFields>(&dir, "TextObjectFields");
    write_schema::<ImageObjectFields>(&dir, "ImageObjectFields");
    write_schema::<SubjectCropNormKeyframe>(&dir, "SubjectCropNormKeyframe");
    write_schema::<VideoObjectFields>(&dir, "VideoObjectFields");
    write_schema::<AudioLabPhoneme>(&dir, "AudioLabPhoneme");
    write_schema::<AudioObjectFields>(&dir, "AudioObjectFields");
    write_schema::<AudioVisualizationType>(&dir, "AudioVisualizationType");
    write_schema::<AudioVisualizationObjectFields>(&dir, "AudioVisualizationObjectFields");
    write_schema::<AudioSphereObjectFields>(&dir, "AudioSphereObjectFields");
    write_schema::<ParticleObjectFields>(&dir, "ParticleObjectFields");
    write_schema::<BarcodeObjectFields>(&dir, "BarcodeObjectFields");
    write_schema::<PuzzleConnectorMode>(&dir, "PuzzleConnectorMode");
    write_schema::<PuzzlePieceObjectFields>(&dir, "PuzzlePieceObjectFields");
    write_schema::<ColourWheelObjectFields>(&dir, "ColourWheelObjectFields");
    write_schema::<GourdObjectFields>(&dir, "GourdObjectFields");
    write_schema::<GearObjectFields>(&dir, "GearObjectFields");
    write_schema::<TrackBarObjectFields>(&dir, "TrackBarObjectFields");
    write_schema::<PieChartSortMode>(&dir, "PieChartSortMode");
    write_schema::<PieChartLabelMode>(&dir, "PieChartLabelMode");
    write_schema::<PieChartObjectFields>(&dir, "PieChartObjectFields");
    write_schema::<HistogramObjectFields>(&dir, "HistogramObjectFields");
    write_schema::<ToneCurveObjectFields>(&dir, "ToneCurveObjectFields");
    write_schema::<HksyAnchorPoint>(&dir, "HksyAnchorPoint");
    write_schema::<HksyCheckerGridObjectFields>(&dir, "HksyCheckerGridObjectFields");
    write_schema::<GetColorDotFieldObjectFields>(&dir, "GetColorDotFieldObjectFields");
    write_schema::<RegionFrameObjectFields>(&dir, "RegionFrameObjectFields");
    write_schema::<SimpleTubeObjectFields>(&dir, "SimpleTubeObjectFields");
    write_schema::<SphereDotsObjectFields>(&dir, "SphereDotsObjectFields");
    write_schema::<SphericalFieldObjectFields>(&dir, "SphericalFieldObjectFields");
    write_schema::<SunburstObjectFields>(&dir, "SunburstObjectFields");
    write_schema::<CircularArrowObjectFields>(&dir, "CircularArrowObjectFields");
    write_schema::<TriangleBracketObjectFields>(&dir, "TriangleBracketObjectFields");
    write_schema::<TartanCheckObjectFields>(&dir, "TartanCheckObjectFields");
    write_schema::<HoundstoothObjectFields>(&dir, "HoundstoothObjectFields");
    write_schema::<YagasuriObjectFields>(&dir, "YagasuriObjectFields");
    write_schema::<PaperAirplaneObjectFields>(&dir, "PaperAirplaneObjectFields");
    write_schema::<AsanohaPatternObjectFields>(&dir, "AsanohaPatternObjectFields");
    write_schema::<FocusLinesPlusObjectFields>(&dir, "FocusLinesPlusObjectFields");
    write_schema::<RandomLineExObjectFields>(&dir, "RandomLineExObjectFields");
    write_schema::<ContourTraceObjectFields>(&dir, "ContourTraceObjectFields");
    write_schema::<DisplacementPolyObjectFields>(&dir, "DisplacementPolyObjectFields");
    write_schema::<PlainEffectorLineObjectFields>(&dir, "PlainEffectorLineObjectFields");
    write_schema::<HologramObjectFields>(&dir, "HologramObjectFields");
    write_schema::<ProtractorObjectFields>(&dir, "ProtractorObjectFields");
    write_schema::<ShakingPolygonObjectFields>(&dir, "ShakingPolygonObjectFields");
    write_schema::<ShatteredSphereObjectFields>(&dir, "ShatteredSphereObjectFields");
    write_schema::<GroupControlObjectFields>(&dir, "GroupControlObjectFields");
    write_schema::<SceneSnapshot>(&dir, "SceneSnapshot");
    write_schema::<EvaluatedClip>(&dir, "EvaluatedClip");
    write_schema::<Vec3>(&dir, "Vec3");
    write_schema::<StageCamera3D>(&dir, "StageCamera3D");
    write_schema::<PsdWorldPlacement>(&dir, "PsdWorldPlacement");
    write_schema::<LipSyncSourceMode>(&dir, "LipSyncSourceMode");
    write_schema::<LipSyncMapping>(&dir, "LipSyncMapping");
    write_schema::<LipSyncSetting>(&dir, "LipSyncSetting");
    write_schema::<PsdLayerNodeFields>(&dir, "PsdLayerNodeFields");
    write_schema::<PsdObjectFields>(&dir, "PsdObjectFields");
    write_schema::<BaseObject>(&dir, "BaseObject");
    write_schema::<TimelineObject>(&dir, "TimelineObject");
    write_schema::<EditorMode>(&dir, "EditorMode");
    write_schema::<ProjectSettings>(&dir, "ProjectSettings");
    write_schema::<LayerState>(&dir, "LayerState");
    write_schema::<CameraState>(&dir, "CameraState");
    write_schema::<SceneData>(&dir, "SceneData");

    // R4-4: `schema/agent-project.schema.json`（トップレベル、既存パスを維持）。
    let agent_schema = SchemaGenerator::default().into_root_schema_for::<AgentProjectSpec>();
    let agent_schema_json =
        serde_json::to_string_pretty(&agent_schema).expect("AgentProjectSpec schema の JSON 化に失敗しました");
    fs::write(agent_project_schema_path(), format!("{agent_schema_json}\n"))
        .expect("schema/agent-project.schema.json の書き込みに失敗しました");

    println!("codegen:types (JSON Schema) 完了 -> {}", dir.display());
}

fn main() {
    write_ts_bindings();
    write_json_schemas();
}
