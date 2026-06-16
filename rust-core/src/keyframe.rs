use crate::schema::ScalarKeyframe;

pub fn evaluate_scalar_keyframes(
    keyframes: &[ScalarKeyframe],
    frame_offset: u64,
    fallback: f32,
) -> f32 {
    let Some(first) = keyframes.first() else {
        return fallback;
    };

    if frame_offset <= first.frame_offset {
        return first.value;
    }

    for pair in keyframes.windows(2) {
        let left = &pair[0];
        let right = &pair[1];
        if frame_offset <= right.frame_offset {
            if right.frame_offset == left.frame_offset {
                return right.value;
            }
            let span = (right.frame_offset - left.frame_offset) as f32;
            let t = (frame_offset - left.frame_offset) as f32 / span;
            return left.value + (right.value - left.value) * t;
        }
    }

    keyframes.last().map(|k| k.value).unwrap_or(fallback)
}
