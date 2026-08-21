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

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;
use uxfd_rust_core::{evaluate_frame, Project};

/// f32(Rust) と f64(JS) の丸め差を許容する幅。絶対差と相対差のどちらかが
/// これを下回れば丸め差とみなす。相対差を併用するのは、座標のように値が
/// 大きいフィールドでは f32 の相対誤差がそのまま絶対差として出るため。
const TOLERANCE: f64 = 1e-4;

fn is_within_tolerance(left: f64, right: f64) -> bool {
    let delta = (left - right).abs();
    if delta <= TOLERANCE {
        return true;
    }
    let scale = left.abs().max(right.abs());
    scale.is_finite() && delta <= TOLERANCE * scale
}

const KNOWN_DIFFERENCES_FILE: &str = "KNOWN_DIFFERENCES.json";

#[derive(Debug, Deserialize)]
struct KnownDifferences {
    differences: Vec<KnownDifference>,
}

#[derive(Debug, Deserialize)]
struct KnownDifference {
    path: String,
    count: usize,
    category: String,
    #[allow(dead_code)]
    note: String,
}

fn load_known_differences() -> BTreeMap<String, KnownDifference> {
    let path = fixture_dir().join(KNOWN_DIFFERENCES_FILE);
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{} を読めない: {error}", path.display()));
    let parsed: KnownDifferences = serde_json::from_str(&raw)
        .unwrap_or_else(|error| panic!("{} を parse できない: {error}", path.display()));
    parsed
        .differences
        .into_iter()
        .map(|difference| (difference.path.clone(), difference))
        .collect()
}

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
    /// 許容幅に収まる丸め差か。
    rounding: bool,
}

impl Difference {
    fn is_rounding(&self) -> bool {
        self.rounding
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
        if path.file_name().and_then(|name| name.to_str()) == Some(KNOWN_DIFFERENCES_FILE) {
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
            if !is_within_tolerance(left, right) {
                out.push(Difference {
                    path: path.to_string(),
                    expected: left.to_string(),
                    actual: right.to_string(),
                    numeric_delta: Some((left - right).abs()),
                    rounding: false,
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
                    rounding: false,
                });
            }
            for index in 0..left.len().min(right.len()) {
                diff(&format!("{path}[{index}]"), &left[index], &right[index], out);
            }
            // 長さが違うとき、min(len) を超える末尾要素は上のループに入らない。
            // ここを黙って飛ばすと「片側にしか無い要素」が一度も比較されず、
            // 実際にそれで subject crop の重複 Clipping を見落とした
            // （progress/rust-source-of-truth-r2-subject-crop-double-bake.md）。
            // 余った側を明示的に差分として出す。
            for index in right.len()..left.len() {
                out.push(Difference {
                    path: format!("{path}[{index}]"),
                    expected: left[index].to_string(),
                    actual: "(RS 側に対応要素なし)".to_string(),
                    numeric_delta: None,
                    rounding: false,
                });
            }
            for index in left.len()..right.len() {
                out.push(Difference {
                    path: format!("{path}[{index}]"),
                    expected: "(TS 側に対応要素なし)".to_string(),
                    actual: right[index].to_string(),
                    numeric_delta: None,
                    rounding: false,
                });
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
                        rounding: false,
                    }),
                    (None, Some(r)) => out.push(Difference {
                        path: format!("{path}.{key}"),
                        expected: "(missing)".to_string(),
                        actual: r.to_string(),
                        numeric_delta: None,
                        rounding: false,
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
            rounding: false,
        }),
    }
}

/// `snapshot.clips[3].transform.scale_x` を `snapshot.clips[].transform.scale_x` へ畳む。
/// 差分は個々の frame ではなく「どのフィールドがどれだけ食い違うか」で読みたい。
fn normalise_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    let mut in_index = false;
    for ch in path.chars() {
        match ch {
            '[' => {
                in_index = true;
                out.push('[');
            }
            ']' => {
                in_index = false;
                out.push(']');
            }
            _ if in_index => {}
            _ => out.push(ch),
        }
    }
    out
}

/// `snapshot.clips[3].transform.translation_x` のような path から
/// 該当 clip の `clip_id` を引く。どの clip が食い違っているのかが
/// 分からないと、原因の当たりを付けようがない。
fn clip_id_for_path(path: &str, snapshot: &Value) -> Option<String> {
    let rest = path.strip_prefix("snapshot.clips[")?;
    let index: usize = rest.split(']').next()?.parse().ok()?;
    snapshot
        .get("clips")?
        .get(index)?
        .get("clip_id")?
        .as_str()
        .map(str::to_owned)
}

#[derive(Default)]
struct Bucket {
    count: usize,
    max_delta: f64,
    example: Option<(String, u64, String, String, String)>,
}

#[test]
fn ts_and_rust_core_evaluate_the_same_scene_identically() {
    let fixtures = load_fixtures();
    assert!(
        !fixtures.is_empty(),
        "fixture が 1 件も無い。`npm run fixture:evaluation-parity` で生成する ({})",
        fixture_dir().display()
    );

    let mut buckets: BTreeMap<String, Bucket> = BTreeMap::new();
    let mut rounding = 0usize;
    let mut compared_frames = 0usize;
    let mut compared_fixtures = 0usize;

    for (_source, fixture) in &fixtures {
        compared_fixtures += 1;
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
                let bucket = buckets.entry(normalise_path(&difference.path)).or_default();
                bucket.count += 1;
                // 例は「いちばん差が大きかったケース」を残す。最初の 1 件より診断に効く。
                let worst = match difference.numeric_delta {
                    Some(delta) => {
                        let worst = delta > bucket.max_delta;
                        if worst {
                            bucket.max_delta = delta;
                        }
                        worst
                    }
                    None => false,
                };
                if bucket.example.is_none() || worst {
                    bucket.example = Some((
                        fixture.name.clone(),
                        frame.frame_index,
                        difference.expected.clone(),
                        difference.actual.clone(),
                        clip_id_for_path(&difference.path, &frame.snapshot)
                            .unwrap_or_else(|| "(clip 不明)".to_string()),
                    ));
                }
            }
        }
    }

    let known = load_known_differences();
    let mut failures = String::new();
    let mut summary = String::new();

    for (path, bucket) in &buckets {
        let (name, frame_index, expected, actual, clip_id) = bucket
            .example
            .as_ref()
            .expect("bucket には必ず例が入る");
        let delta = if bucket.max_delta > 0.0 {
            format!("{:.6}", bucket.max_delta)
        } else {
            "-（構造差）".to_string()
        };
        let detail = format!(
            "  {path}\n    件数 = {} / max_delta = {delta}\n    例: [{name}] frame={frame_index} clip={clip_id}\n         TS = {expected}  RS = {actual}\n",
            bucket.count
        );
        match known.get(path) {
            None => {
                failures.push_str("【新規の差分】\n");
                failures.push_str(&detail);
            }
            Some(entry) if bucket.count > entry.count => {
                failures.push_str(&format!(
                    "【差分が増えた】既知 {} 件 -> {} 件\n",
                    entry.count, bucket.count
                ));
                failures.push_str(&detail);
            }
            Some(entry) if bucket.count < entry.count => {
                failures.push_str(&format!(
                    "【差分が減った。{KNOWN_DIFFERENCES_FILE} の count を {} へ更新する】既知 {} 件\n",
                    bucket.count, entry.count
                ));
                failures.push_str(&detail);
            }
            Some(entry) => {
                summary.push_str(&format!("  [{}] {path} = {} 件\n", entry.category, entry.count));
            }
        }
    }

    for (path, entry) in &known {
        if !buckets.contains_key(path) {
            failures.push_str(&format!(
                "【解消済みの差分が {KNOWN_DIFFERENCES_FILE} に残っている】{path}（既知 {} 件）\n",
                entry.count
            ));
        }
    }

    if !failures.is_empty() {
        panic!(
            "TS 評価と rust-core 評価の差分が既知のベースラインと違う。\n\
             fixture = {compared_fixtures} 件 / 比較フレーム = {compared_frames}\n\
             丸め差(許容 {TOLERANCE}) = {rounding} 件\n\n{failures}\n\
             既知の差分は {} で管理している。R2 でゼロにする。",
            fixture_dir().join(KNOWN_DIFFERENCES_FILE).display()
        );
    }

    println!(
        "比較フレーム = {compared_frames} / 丸め差 = {rounding} 件\n既知の差分（R2 で解消する）:\n{summary}"
    );
}
