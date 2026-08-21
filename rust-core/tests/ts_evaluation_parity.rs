//! TS 側の評価（`src/utils/rustSceneSnapshot.ts`）と rust-core の評価
//! （`timeline::evaluate_frame`）が、同じ project・同じ frame index に対して
//! 同じ結果を返すかを比較する。
//!
//! 現在この 2 つは別実装で、同じ「評価済みシーン」を作る経路が 2 本走っている
//! （`markdown/Rust_Source_Of_Truth_Plan.md` §1.2）。R2 で経路 B を消すまでの間、
//! このテストが差分の見張りになる。
//!
//! fixture は TS 側が生成する。再生成:
//!
//! ```sh
//! npm run fixture:evaluation-parity
//! ```

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;
use uxfd_rust_core::{evaluate_frame, Project};

/// f32 と JS の f64 の丸め差を許容する幅。これを超える差は実装差とみなす。
const TOLERANCE: f64 = 1e-4;

#[derive(Debug, Deserialize)]
struct Fixture {
    name: String,
    project: Project,
    frames: Vec<FixtureFrame>,
}

#[derive(Debug, Deserialize)]
struct FixtureFrame {
    frame_index: u64,
    snapshot: Value,
}

#[derive(Debug)]
struct Difference {
    path: String,
    expected: String,
    actual: String,
    /// 数値どうしの差。`None` なら構造差・型差・欠落。
    numeric_delta: Option<f64>,
}

impl Difference {
    fn is_rounding(&self) -> bool {
        self.numeric_delta.is_some_and(|delta| delta <= TOLERANCE)
    }
}

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ts-evaluation-parity")
}

fn load_fixtures() -> Vec<(String, Fixture)> {
    let dir = fixture_dir();
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) => panic!(
            "fixture ディレクトリを読めない ({}): {error}\n\
             `npm run fixture:evaluation-parity` で生成する",
            dir.display()
        ),
    };
    let mut fixtures = Vec::new();
    for entry in entries {
        let path = entry.expect("read_dir entry").path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("fixture を読めない ({}): {error}", path.display()));
        let fixture: Fixture = serde_json::from_str(&raw)
            .unwrap_or_else(|error| panic!("fixture を parse できない ({}): {error}", path.display()));
        fixtures.push((path.display().to_string(), fixture));
    }
    fixtures.sort_by(|left, right| left.0.cmp(&right.0));
    fixtures
}

fn diff(path: &str, expected: &Value, actual: &Value, out: &mut Vec<Difference>) {
    match (expected, actual) {
        (Value::Null, Value::Null) => {}
        (Value::Bool(left), Value::Bool(right)) if left == right => {}
        (Value::String(left), Value::String(right)) if left == right => {}
        (Value::Number(left), Value::Number(right)) => {
            let (left, right) = (
                left.as_f64().unwrap_or(f64::NAN),
                right.as_f64().unwrap_or(f64::NAN),
            );
            let delta = (left - right).abs();
            if !(delta <= TOLERANCE) {
                out.push(Difference {
                    path: path.to_string(),
                    expected: left.to_string(),
                    actual: right.to_string(),
                    numeric_delta: Some(delta),
                });
            }
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                out.push(Difference {
                    path: format!("{path}.length"),
                    expected: left.len().to_string(),
                    actual: right.len().to_string(),
                    numeric_delta: None,
                });
            }
            for index in 0..left.len().min(right.len()) {
                diff(&format!("{path}[{index}]"), &left[index], &right[index], out);
            }
        }
        (Value::Object(left), Value::Object(right)) => {
            let mut keys: Vec<&String> = left.keys().chain(right.keys()).collect();
            keys.sort();
            keys.dedup();
            for key in keys {
                match (left.get(key), right.get(key)) {
                    (Some(l), Some(r)) => diff(&format!("{path}.{key}"), l, r, out),
                    (Some(l), None) => out.push(Difference {
                        path: format!("{path}.{key}"),
                        expected: l.to_string(),
                        actual: "(missing)".to_string(),
                        numeric_delta: None,
                    }),
                    (None, Some(r)) => out.push(Difference {
                        path: format!("{path}.{key}"),
                        expected: "(missing)".to_string(),
                        actual: r.to_string(),
                        numeric_delta: None,
                    }),
                    (None, None) => {}
                }
            }
        }
        (left, right) => out.push(Difference {
            path: path.to_string(),
            expected: left.to_string(),
            actual: right.to_string(),
            numeric_delta: None,
        }),
    }
}

#[test]
fn ts_and_rust_core_evaluate_the_same_scene_identically() {
    let fixtures = load_fixtures();
    assert!(
        !fixtures.is_empty(),
        "fixture が 1 件も無い。`npm run fixture:evaluation-parity` で生成する ({})",
        fixture_dir().display()
    );

    let mut report = String::new();
    let mut structural = 0usize;
    let mut numeric = 0usize;
    let mut rounding = 0usize;
    let mut compared_frames = 0usize;

    for (source, fixture) in &fixtures {
        for frame in &fixture.frames {
            compared_frames += 1;
            let actual = evaluate_frame(&fixture.project, frame.frame_index);
            let actual = serde_json::to_value(&actual).expect("SceneSnapshot を Value にできない");
            let mut differences = Vec::new();
            diff("snapshot", &frame.snapshot, &actual, &mut differences);
            for difference in &differences {
                if difference.is_rounding() {
                    rounding += 1;
                    continue;
                }
                if difference.numeric_delta.is_some() {
                    numeric += 1;
                } else {
                    structural += 1;
                }
                report.push_str(&format!(
                    "  [{}] {} frame={} {}\n    TS  = {}\n    RS  = {}\n",
                    fixture.name,
                    source,
                    frame.frame_index,
                    difference.path,
                    difference.expected,
                    difference.actual
                ));
            }
        }
    }

    if structural + numeric > 0 {
        panic!(
            "TS 評価と rust-core 評価が一致しない。\n\
             比較フレーム数 = {compared_frames}\n\
             構造差 = {structural} 件 / 数値差 = {numeric} 件 / 丸め差(許容) = {rounding} 件\n\
             許容幅 = {TOLERANCE}\n\n{report}"
        );
    }
}
