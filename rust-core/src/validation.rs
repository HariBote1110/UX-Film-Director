use crate::schema::Project;
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationCode {
    EmptyId,
    DuplicateMediaId,
    DuplicateTrackId,
    DuplicateClipId,
    InvalidFps,
    InvalidCanvasSize,
    MissingMediaReference,
    InvalidDuration,
    NonFiniteNumber,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationIssue {
    pub code: ValidationCode,
    pub path: String,
}

pub fn validate_project(project: &Project) -> Result<(), Vec<ValidationIssue>> {
    let mut issues = Vec::new();

    if project.id.is_empty() {
        issues.push(issue(ValidationCode::EmptyId, "project.id"));
    }
    if project.fps.numerator == 0 || project.fps.denominator == 0 {
        issues.push(issue(ValidationCode::InvalidFps, "project.fps"));
    }
    if project.size.width == 0 || project.size.height == 0 {
        issues.push(issue(ValidationCode::InvalidCanvasSize, "project.size"));
    }

    let mut media_ids = HashSet::new();
    for media in &project.media {
        record_id(
            &mut media_ids,
            &media.id,
            "media.id",
            ValidationCode::DuplicateMediaId,
            &mut issues,
        );
    }

    let mut track_ids = HashSet::new();
    let mut clip_ids = HashSet::new();
    for track in &project.tracks {
        record_id(
            &mut track_ids,
            &track.id,
            "track.id",
            ValidationCode::DuplicateTrackId,
            &mut issues,
        );

        for clip in &track.clips {
            record_id(
                &mut clip_ids,
                &clip.id,
                "clip.id",
                ValidationCode::DuplicateClipId,
                &mut issues,
            );
            if clip.duration_frames == 0 {
                issues.push(issue(
                    ValidationCode::InvalidDuration,
                    "clip.duration_frames",
                ));
            }
            if !media_ids.contains(clip.media_id.as_str()) {
                issues.push(issue(
                    ValidationCode::MissingMediaReference,
                    "clip.media_id",
                ));
            }
            if !clip.opacity.is_finite() {
                issues.push(issue(ValidationCode::NonFiniteNumber, "clip.opacity"));
            }
            if !clip.transform.translation_x.is_finite()
                || !clip.transform.translation_y.is_finite()
                || !clip.transform.scale_x.is_finite()
                || !clip.transform.scale_y.is_finite()
                || !clip.transform.rotation_degrees.is_finite()
            {
                issues.push(issue(ValidationCode::NonFiniteNumber, "clip.transform"));
            }
            for keyframe in &clip.opacity_keyframes {
                if !keyframe.value.is_finite() {
                    issues.push(issue(
                        ValidationCode::NonFiniteNumber,
                        "clip.opacity_keyframes.value",
                    ));
                }
            }
            for effect in &clip.effects {
                if !effect_is_finite(effect) {
                    issues.push(issue(ValidationCode::NonFiniteNumber, "clip.effects"));
                }
            }
        }
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(issues)
    }
}

fn effect_is_finite(effect: &crate::schema::Effect) -> bool {
    match effect {
        crate::schema::Effect::LinearGain { gain } => gain.is_finite(),
        crate::schema::Effect::ColourAberration { offset_x, offset_y } => {
            offset_x.is_finite() && *offset_x >= 0.0 && offset_y.is_finite() && *offset_y >= 0.0
        }
        crate::schema::Effect::Outline {
            colour,
            thickness,
            opacity,
        } => {
            colour
                .iter()
                .all(|component| component.is_finite() && *component >= 0.0 && *component <= 1.0)
                && thickness.is_finite()
                && *thickness >= 0.0
                && opacity.is_finite()
                && *opacity >= 0.0
                && *opacity <= 1.0
        }
        crate::schema::Effect::Wipe { progress, .. } => {
            progress.is_finite() && *progress >= 0.0 && *progress <= 1.0
        }
        crate::schema::Effect::Clipping {
            top,
            bottom,
            left,
            right,
            angle_degrees,
        } => {
            top.is_finite()
                && *top >= 0.0
                && bottom.is_finite()
                && *bottom >= 0.0
                && left.is_finite()
                && *left >= 0.0
                && right.is_finite()
                && *right >= 0.0
                && angle_degrees.is_finite()
        }
        crate::schema::Effect::SpotLight {
            centre_x,
            centre_y,
            radius,
            intensity,
            colour,
        } => {
            centre_x.is_finite()
                && *centre_x >= 0.0
                && *centre_x <= 1.0
                && centre_y.is_finite()
                && *centre_y >= 0.0
                && *centre_y <= 1.0
                && radius.is_finite()
                && *radius >= 0.0
                && intensity.is_finite()
                && *intensity >= 0.0
                && colour
                    .iter()
                    .all(|component| component.is_finite() && *component >= 0.0 && *component <= 1.0)
        }
        crate::schema::Effect::DisplacementMap {
            amount_x,
            amount_y,
            size,
            strength,
        } => {
            amount_x.is_finite()
                && *amount_x >= 0.0
                && amount_y.is_finite()
                && *amount_y >= 0.0
                && size.is_finite()
                && *size > 0.0
                && strength.is_finite()
                && *strength >= 0.0
                && *strength <= 1.0
        }
        crate::schema::Effect::FakeDof {
            focus_x,
            focus_y,
            focus_radius,
            blur,
            strength,
        } => {
            focus_x.is_finite()
                && *focus_x >= 0.0
                && *focus_x <= 1.0
                && focus_y.is_finite()
                && *focus_y >= 0.0
                && *focus_y <= 1.0
                && focus_radius.is_finite()
                && *focus_radius > 0.0
                && blur.is_finite()
                && *blur >= 0.0
                && strength.is_finite()
                && *strength >= 0.0
                && *strength <= 1.0
        }
        crate::schema::Effect::AutoBlur {
            angle_degrees,
            radius,
            strength,
            colour_shift,
        } => {
            angle_degrees.is_finite()
                && radius.is_finite()
                && *radius >= 0.0
                && strength.is_finite()
                && *strength >= 0.0
                && *strength <= 1.0
                && colour_shift.is_finite()
                && *colour_shift >= 0.0
                && *colour_shift <= 1.0
        }
        crate::schema::Effect::Stretch {
            angle_degrees,
            amount,
            strength,
        } => {
            angle_degrees.is_finite()
                && amount.is_finite()
                && *amount >= 0.0
                && strength.is_finite()
                && *strength >= 0.0
                && *strength <= 1.0
        }
        crate::schema::Effect::MultiSlicer {
            angle_degrees,
            offset,
            slices,
            expansion,
            strength,
        } => {
            angle_degrees.is_finite()
                && offset.is_finite()
                && *offset >= 0.0
                && *slices >= 2
                && expansion.is_finite()
                && *expansion >= 0.0
                && strength.is_finite()
                && *strength >= 0.0
                && *strength <= 1.0
        }
    }
}

fn issue(code: ValidationCode, path: &str) -> ValidationIssue {
    ValidationIssue {
        code,
        path: path.to_string(),
    }
}

fn record_id<'a>(
    seen: &mut HashSet<&'a str>,
    id: &'a str,
    path: &str,
    duplicate_code: ValidationCode,
    issues: &mut Vec<ValidationIssue>,
) {
    if id.is_empty() {
        issues.push(issue(ValidationCode::EmptyId, path));
        return;
    }

    if !seen.insert(id) {
        issues.push(issue(duplicate_code, path));
    }
}
