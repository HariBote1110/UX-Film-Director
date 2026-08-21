pub mod audio_waveform_scene;
pub mod command;
pub mod focus_lines;
pub mod generated_particle;
pub mod keyframe;
pub mod nv12_source;
pub mod schema;
pub mod solid_colour_scene;
pub mod timeline;
pub mod validation;
pub mod video_decode_request;
pub mod video_plane_scene;

pub use audio_waveform_scene::{
    build_audio_waveform_line_strip, AudioWaveformLineStrip, AudioWaveformSceneError,
    AudioWaveformSource,
};
pub use command::{apply_command, AppliedCommand, Command, CommandError};
pub use focus_lines::{focus_lines_frame_bucket, focus_lines_frame_bucket_from_source};
pub use generated_particle::{
    generated_particle_unit, parse_generated_particle_source, GeneratedParticleParams,
};
pub use nv12_source::{Nv12ColourMatrix, Nv12ColourRange, Nv12IoSurfaceRef};
pub use schema::{
    AudioLabPhoneme, AudioObjectFields, AudioVisualizationObjectFields, AudioVisualizationType,
    Clip, ClipKind, ColourPipeline, Easing, Effect, Fps, ImageObjectFields, MediaKind,
    MediaReference, PositionKeyframe, Project, ProjectSize, SamplingMode, ScalarKeyframe,
    ShapeGradientFill, ShapeGradientKind, ShapeGradientScope, ShapeObjectFields, ShapeType,
    SubjectCropNormKeyframe, TextAlignment, TextObjectFields, TextShadow, TextStroke, Track,
    Transform, VideoObjectFields, WipeEdge,
};
pub use solid_colour_scene::{
    build_solid_colour_draw_list, build_solid_colour_vertex_scene, CanvasSize, NormalisedColour,
    SceneMediaReference, SolidColourRect, SolidColourSceneError, SolidColourVertexScene,
};
pub use timeline::{evaluate_frame, EvaluatedClip, SceneSnapshot};
pub use validation::{validate_project, ValidationCode, ValidationIssue};
pub use video_decode_request::{
    build_video_frame_decode_requests, DecodedVideoFrameFormat, VideoDecodeColourContract,
    VideoFrameDecodeRequest, VideoFrameDecodeRequestError, VideoFrameDecodeRequestSet,
};
pub use video_plane_scene::{
    build_video_plane_vertex_scene, VideoPlane, VideoPlaneSceneError, VideoPlaneVertexScene,
};
