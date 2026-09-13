use serde::Serialize;
use serde_json::Value;

/// 型付き構造体を最短表現の JSON 経由で `Value` に変換する。
///
/// `serde_json::to_value` は `f32` を `Value::Number` 内の `f64` として
/// 保持するため、後続の JSON 化で単精度の内部値を展開してしまう。
pub(crate) fn typed_to_value_preserving_f32<T: Serialize>(value: &T) -> Value {
    let json = serde_json::to_string(value).expect("型付き値の JSON 文字列化に失敗しました");
    serde_json::from_str(&json).expect("型付き値の JSON Value 変換に失敗しました")
}
