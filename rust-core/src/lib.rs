pub mod command;
pub mod keyframe;
pub mod schema;
pub mod solid_colour_scene;
pub mod timeline;
pub mod validation;

pub use command::{apply_command, AppliedCommand, Command, CommandError};
pub use schema::{
    Clip, ClipKind, ColourPipeline, Effect, Fps, MediaKind, MediaReference, Project, ProjectSize,
    SamplingMode, ScalarKeyframe, Track, Transform,
};
pub use solid_colour_scene::{
    build_solid_colour_draw_list, build_solid_colour_vertex_scene, CanvasSize, NormalisedColour,
    SceneMediaReference, SolidColourRect, SolidColourSceneError, SolidColourVertexScene,
};
pub use timeline::{evaluate_frame, EvaluatedClip, SceneSnapshot};
pub use validation::{validate_project, ValidationCode, ValidationIssue};
