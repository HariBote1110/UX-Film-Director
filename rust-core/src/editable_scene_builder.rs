//! 編集 graph から評価用 scene を作る、副作用を持たない P1b builder。
//!
//! 常駐経路の TS `buildEditableRustScene` と同じく、生成 media の参照解決時刻は
//! 各 object の `startTime` である。P1c の direct 経路は任意時刻を渡す。

use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use crate::schema::{
    Clip, ClipKind, ColourPipeline, EditableSceneGraph, EditableSceneMediaPurpose, Fps,
    GroupControl, MediaKind, MediaReference, Project, ProjectSize, SamplingMode, TimelineObject,
    Transform,
};
use crate::solid_colour_scene::SceneMediaReference;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct EditableSceneDiagnostic {
    pub object_id: String,
    pub code: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct BuiltEvaluationScene {
    pub project: Project,
    pub media: Vec<SceneMediaReference>,
    pub diagnostics: Vec<EditableSceneDiagnostic>,
}

fn frame(seconds: f32, fps: f32) -> u64 { (seconds * fps).round().max(0.0) as u64 }
fn dimension(value: f32) -> u32 { value.max(0.0).round() as u32 }
fn source_path(src: &str, file_path: &Option<String>) -> String {
    file_path.clone().filter(|path| !path.is_empty()).unwrap_or_else(|| src.to_string())
}
fn base(object: &TimelineObject) -> &crate::schema::BaseObject {
    match object {
        TimelineObject::Text { base, .. } | TimelineObject::Shape { base, .. } |
        TimelineObject::Image { base, .. } | TimelineObject::Video { base, .. } |
        TimelineObject::Audio { base, .. } | TimelineObject::Psd { base, .. } |
        TimelineObject::GroupControl { base, .. } | TimelineObject::AudioVisualization { base, .. } |
        TimelineObject::AudioSphere { base, .. } | TimelineObject::Particle { base, .. } |
        TimelineObject::Barcode { base, .. } | TimelineObject::PuzzlePiece { base, .. } |
        TimelineObject::ColourWheel { base, .. } | TimelineObject::Gourd { base, .. } |
        TimelineObject::Gear { base, .. } | TimelineObject::TrackBar { base, .. } |
        TimelineObject::PieChart { base, .. } | TimelineObject::Histogram { base, .. } |
        TimelineObject::ToneCurve { base, .. } | TimelineObject::HksyCheckerGrid { base, .. } |
        TimelineObject::GetColorDotField { base, .. } | TimelineObject::RegionFrame { base, .. } |
        TimelineObject::SimpleTube { base, .. } | TimelineObject::SphereDots { base, .. } |
        TimelineObject::SphericalField { base, .. } | TimelineObject::Sunburst { base, .. } |
        TimelineObject::CircularArrow { base, .. } | TimelineObject::TriangleBracket { base, .. } |
        TimelineObject::TartanCheck { base, .. } | TimelineObject::Houndstooth { base, .. } |
        TimelineObject::Yagasuri { base, .. } | TimelineObject::PaperAirplane { base, .. } |
        TimelineObject::AsanohaPattern { base, .. } | TimelineObject::FocusLinesPlus { base, .. } |
        TimelineObject::RandomLineEx { base, .. } | TimelineObject::ContourTrace { base, .. } |
        TimelineObject::DisplacementPoly { base, .. } | TimelineObject::PlainEffectorLine { base, .. } |
        TimelineObject::Hologram { base, .. } | TimelineObject::Protractor { base, .. } |
        TimelineObject::ShakingPolygon { base, .. } | TimelineObject::ShatteredSphere { base, .. } => base,
    }
}
fn kind_and_dimensions(object: &TimelineObject) -> Option<(MediaKind, f32, f32, String)> {
    match object {
        TimelineObject::Shape { fields, .. } => {
            if matches!(fields.shape_type, crate::schema::ShapeType::Rect) && fields.gradient.as_ref().map(|g| g.enabled).unwrap_or(false) == false {
                Some((MediaKind::SolidColour, fields.width, fields.height, fields.fill.clone()))
            } else { Some((MediaKind::GeneratedShape, fields.width, fields.height, serde_json::to_string(&json!({"shapeType":fields.shape_type,"width":fields.width,"height":fields.height,"fill":fields.fill,"gradient":fields.gradient,"cornerRadius":fields.corner_radius})).unwrap())) }
        }
        TimelineObject::Image { fields, .. } => Some((MediaKind::Image, fields.width, fields.height, source_path(&fields.src, &fields.file_path))),
        TimelineObject::Video { fields, .. } => Some((MediaKind::Video, fields.width, fields.height, String::new())),
        TimelineObject::Psd { fields, .. } => Some((MediaKind::Psd, fields.width, fields.height, source_path(&fields.src, &fields.file_path))),
        TimelineObject::Text { fields, .. } => {
            let width = fields.measured_width.unwrap_or_else(|| ((fields.text.lines().map(str::len).max().unwrap_or(1).max(1) as f32) * fields.font_size * 0.6).ceil());
            let height = fields.measured_height.unwrap_or_else(|| ((fields.text.lines().count().max(1) as f32) * fields.font_size * 1.25).ceil());
            Some((MediaKind::Text, width, height, serde_json::to_string(&json!({"text":fields.text,"fontSize":fields.font_size,"fontFamily":fields.font_family,"fill":fields.fill,"measuredWidth":fields.measured_width,"measuredHeight":fields.measured_height,"textAlignment":fields.text_alignment,"letterSpacing":fields.letter_spacing,"textStroke":fields.text_stroke,"textShadow":fields.text_shadow})).unwrap()))
        }
        _ => None,
    }
}
fn audio_source(objects: &[TimelineObject], id: &Option<String>, layer: Option<i32>, time: f32) -> (String, String) {
    if let Some(id) = id { if let Some(TimelineObject::Audio { base, fields }) = objects.iter().find(|item| base(item).id == *id) { return (base.id.clone(), source_path(&fields.src, &fields.file_path)); } }
    if let Some(layer) = layer { if let Some(TimelineObject::Audio { base, fields }) = objects.iter().find(|item| { let b=base(item); matches!(item, TimelineObject::Audio{..}) && b.layer == layer as f32 && time >= b.start_time && time < b.start_time + b.duration }) { return (base.id.clone(), source_path(&fields.src, &fields.file_path)); } }
    (String::new(), String::new())
}
fn media_for(object: &TimelineObject, objects: &[TimelineObject], purpose: EditableSceneMediaPurpose) -> Option<SceneMediaReference> {
    let b = base(object);
    if let TimelineObject::AudioVisualization { fields, .. } = object {
        let (target_id, target_source) = audio_source(objects, &fields.target_audio_id, fields.target_layer, b.start_time);
        return Some(SceneMediaReference { id:b.id.clone(), kind:MediaKind::GeneratedAudioWaveform, source:serde_json::to_string(&json!({"generator":"audio-waveform-r","target_audio_id":target_id,"target_source":target_source,"sample_window_seconds":0.05,"colour":if fields.color.is_empty(){"#00ff00"}else{&fields.color},"thickness":fields.thickness.max(1.0),"amplitude":fields.amplitude.max(0.0)})).unwrap(), width:dimension(fields.width), height:dimension(fields.height), source_rate:None, active_layer_ids:vec![] });
    }
    if let TimelineObject::AudioSphere { fields, .. } = object {
        let (target_id, target_source) = audio_source(objects, &fields.target_audio_id, fields.target_layer, b.start_time);
        return Some(SceneMediaReference { id:b.id.clone(), kind:MediaKind::GeneratedAudioSphere, source:serde_json::to_string(&json!({"generator":"audio-sphere-93","target_audio_id":target_id,"target_source":target_source,"sample_window_seconds":fields.sample_window_seconds.clamp(0.001,10.),"columns":fields.columns.clamp(2,64),"rows":fields.rows.clamp(2,64),"base_radius":fields.base_radius.clamp(1.,2000.),"audio_influence":fields.audio_influence.clamp(0.,4.),"point_size":fields.point_size.clamp(0.,200.),"polygon_size":fields.polygon_size.clamp(0.,4.),"random_amount":fields.random_amount.clamp(0.,4.),"colour":fields.colour,"seed":fields.seed})).unwrap(), width:dimension(fields.width), height:dimension(fields.height), source_rate:None, active_layer_ids:vec![] });
    }
    if let TimelineObject::GetColorDotField { fields, .. } = object {
        let mut value=json!({"generator":"getcolor-v2r-dot-field","columns":fields.columns.clamp(1,512),"rows":fields.rows.clamp(1,512),"dot_size":fields.dot_size.clamp(0.,2000.),"size_influence":fields.size_influence.clamp(0.,4.),"luminance_influence":fields.luminance_influence.clamp(0.,4.),"hue_shift_degrees":fields.hue_shift_degrees.clamp(-720.,720.),"alternate_rows":fields.alternate_rows,"foreground_colour":fields.foreground_colour,"secondary_colour":fields.secondary_colour,"background_colour":fields.background_colour,"seed":fields.seed});
        let candidate = fields.sample_source_object_id.as_ref().and_then(|id| objects.iter().find(|o| {let x=base(o); x.id==*id && b.start_time>=x.start_time && b.start_time<x.start_time+x.duration})).or_else(|| fields.sample_source_layer.and_then(|layer| objects.iter().find(|o| {let x=base(o); (x.layer == layer as f32) && b.start_time>=x.start_time && b.start_time<x.start_time+x.duration && sample_path(o).is_some()})));
        let sample = fields.sample_source_path.clone().filter(|s|!s.is_empty()).or_else(|| candidate.and_then(sample_path));
        if let Some(path)=sample { value["source_image"]=json!(path); if let Some(TimelineObject::Psd{fields,..})=candidate { let mut ids:Vec<_>=fields.active_layer_ids.as_ref().into_iter().flat_map(|ids|ids.iter()).filter(|(_,active)|**active).map(|(id,_)|id.clone()).collect();ids.sort();value["source_active_layer_ids"]=json!(ids); } value["sample_strength"]=json!(fields.sample_strength.unwrap_or(1.).clamp(0.,1.)); value["sample_hue_shift_degrees"]=json!(fields.sample_hue_shift_degrees.unwrap_or(0.).clamp(-720.,720.)); }
        return Some(SceneMediaReference { id:b.id.clone(),kind:MediaKind::GeneratedGetColorDots,source:serde_json::to_string(&value).unwrap(),width:dimension(fields.width),height:dimension(fields.height),source_rate:None,active_layer_ids:vec![] });
    }
    let (kind,width,height,mut source)=kind_and_dimensions(object)?;
    if let TimelineObject::Video { fields, .. } = object { source=match purpose { EditableSceneMediaPurpose::PreviewProxy=>fields.proxy_file_path.clone().filter(|p|!p.is_empty()).unwrap_or_else(||source_path(&fields.src,&fields.file_path)), EditableSceneMediaPurpose::ExportOriginal=>source_path(&fields.src,&fields.file_path) }; }
    let active_layer_ids = if let TimelineObject::Psd { fields, .. } = object { let mut ids: Vec<_> = fields.active_layer_ids.as_ref().into_iter().flat_map(|ids| ids.iter()).filter(|(_, active)| **active).map(|(id, _)| id.clone()).collect(); ids.sort(); ids } else { vec![] };
    Some(SceneMediaReference { id:b.id.clone(),kind,source,width:dimension(width),height:dimension(height),source_rate:None,active_layer_ids })
}
fn sample_path(object: &TimelineObject) -> Option<String> { match object { TimelineObject::Image{fields,..}=>Some(source_path(&fields.src,&fields.file_path)), TimelineObject::Psd{fields,..}=>Some(source_path(&fields.src,&fields.file_path)), _=>None } }

/// 42 kind を明示的に走査し、未移植 kind は診断として返す。誤った media を黙って
/// 出力しないため、diagnostic がある場合でも安全に構築できた部分だけを返す。
pub fn build_evaluation_scene(graph: &EditableSceneGraph) -> BuiltEvaluationScene {
    let purpose=graph.media_context.as_ref().map(|c|c.purpose).unwrap_or(EditableSceneMediaPurpose::PreviewProxy);
    let mut diagnostics=Vec::new(); let mut visual:Vec<(usize,&TimelineObject)>=graph.objects.iter().enumerate().filter(|(_,o)| {let b=base(o); graph.layers.get(b.layer.max(0.) as usize).map(|l|l.visible).unwrap_or(true)}).collect();
    visual.sort_by(|a,b| base(a.1).layer.total_cmp(&base(b.1).layer).then(a.0.cmp(&b.0)));
    let mut media=Vec::new(); let mut tracks:Vec<(f32,Vec<Clip>)>=Vec::new();
    for (_, object) in &visual { let b=base(object); if matches!(object,TimelineObject::Audio{..}|TimelineObject::GroupControl{..}) {continue}; let Some(mut reference)=media_for(object,&graph.objects,purpose) else { diagnostics.push(EditableSceneDiagnostic{object_id:b.id.clone(),code:"unsupportedObjectType".into(),detail:"P1b ではこの kind の canonical media serializer は未移植です".into()}); continue;}; if matches!(object, TimelineObject::Video { .. }) { reference.source_rate=Some(Fps { numerator: graph.settings.fps.round() as u32, denominator: 1 }); } let kind=match reference.kind {MediaKind::Video=>ClipKind::VideoPlane,MediaKind::Text=>ClipKind::TextPlane,MediaKind::SolidColour=>ClipKind::SolidColourPlane,MediaKind::GeneratedAudioWaveform=>ClipKind::GeneratedAudioWaveformPlane,MediaKind::GeneratedAudioSphere=>ClipKind::GeneratedAudioSpherePlane,MediaKind::GeneratedGetColorDots=>ClipKind::GeneratedGetColorDotsPlane,MediaKind::GeneratedShape=>ClipKind::GeneratedShapePlane,_=>ClipKind::ImagePlane}; let clip=Clip{id:b.id.clone(),media_id:b.id.clone(),kind,start_frame:frame(b.start_time,graph.settings.fps),duration_frames:frame(b.duration,graph.settings.fps).max(1),source_frame_offset:if matches!(object,TimelineObject::Video{..}){frame(b.offset.unwrap_or(0.),graph.settings.fps)}else{0},transform:Transform{translation_x:b.x,translation_y:b.y,scale_x:b.scale_x,scale_y:b.scale_y,rotation_degrees:b.rotation,sampling:if matches!(object,TimelineObject::Shape{..}){SamplingMode::Nearest}else{SamplingMode::Bilinear}},opacity:b.opacity,opacity_keyframes:vec![],position_keyframes:vec![],subject_crop:None,wipe_animations:vec![],effects:vec![]}; if let Some((_,clips))=tracks.iter_mut().find(|(layer,_)|*layer==b.layer){clips.push(clip)}else{tracks.push((b.layer,vec![clip]));} media.push(reference); }
    tracks.sort_by(|a,b|a.0.total_cmp(&b.0));
    let group_controls=graph.objects.iter().filter_map(|object|if let TimelineObject::GroupControl{base:b,fields}=object { let mut target=Vec::new(); for (_,candidate) in &visual { let c=base(candidate); if c.layer>b.layer && (fields.target_layer_count==0 || c.layer<=b.layer+fields.target_layer_count as f32) {let id=format!("layer-{}",c.layer as i32);if !target.contains(&id){target.push(id)}} } Some(GroupControl{id:b.id.clone(),start_frame:frame(b.start_time,graph.settings.fps),duration_frames:frame(b.duration,graph.settings.fps).max(1),transform:Transform{translation_x:b.x,translation_y:b.y,scale_x:b.scale_x,scale_y:b.scale_y,rotation_degrees:b.rotation,sampling:SamplingMode::Bilinear},opacity:b.opacity,position_keyframes:vec![],target_track_ids:target}) }else{None}).collect();
    let project=Project{id:graph.media_context.as_ref().and_then(|c|c.scene_id.clone()).unwrap_or_else(||"editable-scene".into()),version:1,size:ProjectSize{width:dimension(graph.settings.width),height:dimension(graph.settings.height)},fps:Fps{numerator:graph.settings.fps.round() as u32,denominator:1},colour:ColourPipeline::rec709_sdr_linear(),media:media.iter().map(|m|MediaReference{id:m.id.clone(),kind:m.kind.clone(),source:m.source.clone()}).collect(),tracks:tracks.into_iter().map(|(layer,clips)|crate::schema::Track{id:format!("layer-{}",layer as i32),clips}).collect(),group_controls};
    BuiltEvaluationScene{project,media,diagnostics}
}
