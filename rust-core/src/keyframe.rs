use crate::schema::{Easing, PositionKeyframe, ScalarKeyframe};

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

pub fn evaluate_position_keyframes(
    keyframes: &[PositionKeyframe],
    frame_offset: u64,
    fallback_x: f32,
    fallback_y: f32,
) -> (f32, f32) {
    if keyframes.len() < 2 {
        return (fallback_x, fallback_y);
    }

    let first = &keyframes[0];
    if frame_offset <= first.frame_offset {
        return (first.x, first.y);
    }

    for pair in keyframes.windows(2) {
        let left = &pair[0];
        let right = &pair[1];
        if frame_offset <= right.frame_offset {
            if right.frame_offset == left.frame_offset {
                return (right.x, right.y);
            }
            let span = (right.frame_offset - left.frame_offset) as f32;
            let raw_progress = (frame_offset - left.frame_offset) as f32 / span;
            let progress = evaluate_easing(left.easing, raw_progress).clamp(0.0, 1.0);
            return (
                left.x + (right.x - left.x) * progress,
                left.y + (right.y - left.y) * progress,
            );
        }
    }

    let last = keyframes
        .last()
        .expect("position keyframes must not be empty");
    (last.x, last.y)
}

fn evaluate_easing(easing: Easing, t: f32) -> f32 {
    let pi = std::f32::consts::PI;
    match easing {
        Easing::Linear => t,
        Easing::EaseInSine => 1.0 - (t * pi / 2.0).cos(),
        Easing::EaseOutSine => (t * pi / 2.0).sin(),
        Easing::EaseInOutSine => -((pi * t).cos() - 1.0) / 2.0,
        Easing::EaseInQuad => t * t,
        Easing::EaseOutQuad => 1.0 - (1.0 - t) * (1.0 - t),
        Easing::EaseInOutQuad => {
            if t < 0.5 {
                2.0 * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
            }
        }
        Easing::EaseInCubic => t * t * t,
        Easing::EaseOutCubic => 1.0 - (1.0 - t).powi(3),
        Easing::EaseInOutCubic => {
            if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            }
        }
        Easing::EaseInQuart => t.powi(4),
        Easing::EaseOutQuart => 1.0 - (1.0 - t).powi(4),
        Easing::EaseInOutQuart => {
            if t < 0.5 {
                8.0 * t.powi(4)
            } else {
                1.0 - (-2.0 * t + 2.0).powi(4) / 2.0
            }
        }
        Easing::EaseInQuint => t.powi(5),
        Easing::EaseOutQuint => 1.0 - (1.0 - t).powi(5),
        Easing::EaseInOutQuint => {
            if t < 0.5 {
                16.0 * t.powi(5)
            } else {
                1.0 - (-2.0 * t + 2.0).powi(5) / 2.0
            }
        }
        Easing::EaseInExpo => {
            if t == 0.0 {
                0.0
            } else {
                2.0_f32.powf(10.0 * t - 10.0)
            }
        }
        Easing::EaseOutExpo => {
            if t == 1.0 {
                1.0
            } else {
                1.0 - 2.0_f32.powf(-10.0 * t)
            }
        }
        Easing::EaseInOutExpo => {
            if t == 0.0 {
                0.0
            } else if t == 1.0 {
                1.0
            } else if t < 0.5 {
                2.0_f32.powf(20.0 * t - 10.0) / 2.0
            } else {
                (2.0 - 2.0_f32.powf(-20.0 * t + 10.0)) / 2.0
            }
        }
        Easing::EaseInCirc => 1.0 - (1.0 - t.powi(2)).sqrt(),
        Easing::EaseOutCirc => (1.0 - (t - 1.0).powi(2)).sqrt(),
        Easing::EaseInOutCirc => {
            if t < 0.5 {
                (1.0 - (1.0 - (2.0 * t).powi(2)).sqrt()) / 2.0
            } else {
                ((1.0 - (-2.0 * t + 2.0).powi(2)).sqrt() + 1.0) / 2.0
            }
        }
        Easing::EaseInBack => {
            let c1 = 1.70158;
            let c3 = c1 + 1.0;
            c3 * t.powi(3) - c1 * t.powi(2)
        }
        Easing::EaseOutBack => {
            let c1 = 1.70158;
            let c3 = c1 + 1.0;
            1.0 + c3 * (t - 1.0).powi(3) + c1 * (t - 1.0).powi(2)
        }
        Easing::EaseInOutBack => {
            let c1 = 1.70158;
            let c2 = c1 * 1.525;
            if t < 0.5 {
                ((2.0 * t).powi(2) * ((c2 + 1.0) * 2.0 * t - c2)) / 2.0
            } else {
                ((2.0 * t - 2.0).powi(2) * ((c2 + 1.0) * (t * 2.0 - 2.0) + c2) + 2.0) / 2.0
            }
        }
        Easing::EaseInElastic => {
            let c4 = 2.0 * pi / 3.0;
            if t == 0.0 {
                0.0
            } else if t == 1.0 {
                1.0
            } else {
                -2.0_f32.powf(10.0 * t - 10.0) * ((t * 10.0 - 10.75) * c4).sin()
            }
        }
        Easing::EaseOutElastic => {
            let c4 = 2.0 * pi / 3.0;
            if t == 0.0 {
                0.0
            } else if t == 1.0 {
                1.0
            } else {
                2.0_f32.powf(-10.0 * t) * ((t * 10.0 - 0.75) * c4).sin() + 1.0
            }
        }
        Easing::EaseInOutElastic => {
            let c5 = 2.0 * pi / 4.5;
            if t == 0.0 {
                0.0
            } else if t == 1.0 {
                1.0
            } else if t < 0.5 {
                -(2.0_f32.powf(20.0 * t - 10.0) * ((20.0 * t - 11.125) * c5).sin()) / 2.0
            } else {
                (2.0_f32.powf(-20.0 * t + 10.0) * ((20.0 * t - 11.125) * c5).sin()) / 2.0 + 1.0
            }
        }
        Easing::EaseInBounce => 1.0 - ease_out_bounce(1.0 - t),
        Easing::EaseOutBounce => ease_out_bounce(t),
        Easing::EaseInOutBounce => {
            if t < 0.5 {
                (1.0 - ease_out_bounce(1.0 - 2.0 * t)) / 2.0
            } else {
                (1.0 + ease_out_bounce(2.0 * t - 1.0)) / 2.0
            }
        }
    }
}

fn ease_out_bounce(t: f32) -> f32 {
    let n1 = 7.5625;
    let d1 = 2.75;
    if t < 1.0 / d1 {
        n1 * t * t
    } else if t < 2.0 / d1 {
        let adjusted = t - 1.5 / d1;
        n1 * adjusted * adjusted + 0.75
    } else if t < 2.5 / d1 {
        let adjusted = t - 2.25 / d1;
        n1 * adjusted * adjusted + 0.9375
    } else {
        let adjusted = t - 2.625 / d1;
        n1 * adjusted * adjusted + 0.984375
    }
}
