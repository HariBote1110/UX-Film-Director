use crate::schema::{Clip, Project};
use crate::validation::{validate_project, ValidationIssue};

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    SetClipOpacity { clip_id: String, opacity: f32 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct AppliedCommand {
    pub project: Project,
    pub undo: Command,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandError {
    ClipNotFound { clip_id: String },
    ValidationFailed(Vec<ValidationIssue>),
}

pub fn apply_command(project: &Project, command: &Command) -> Result<AppliedCommand, CommandError> {
    let mut next_project = project.clone();
    let undo = match command {
        Command::SetClipOpacity { clip_id, opacity } => {
            let clip = find_clip_mut(&mut next_project, clip_id).ok_or_else(|| {
                CommandError::ClipNotFound {
                    clip_id: clip_id.clone(),
                }
            })?;
            let previous_opacity = clip.opacity;
            clip.opacity = *opacity;

            Command::SetClipOpacity {
                clip_id: clip_id.clone(),
                opacity: previous_opacity,
            }
        }
    };

    validate_project(&next_project).map_err(CommandError::ValidationFailed)?;

    Ok(AppliedCommand {
        project: next_project,
        undo,
    })
}

fn find_clip_mut<'a>(project: &'a mut Project, clip_id: &str) -> Option<&'a mut Clip> {
    project
        .tracks
        .iter_mut()
        .flat_map(|track| track.clips.iter_mut())
        .find(|clip| clip.id == clip_id)
}
