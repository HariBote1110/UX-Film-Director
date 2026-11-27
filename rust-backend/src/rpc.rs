use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub(crate) struct RpcRequest {
    pub(crate) id: u64,
    pub(crate) method: String,
    #[serde(default)]
    pub(crate) params: Value,
}

#[derive(Debug, Serialize)]
pub(crate) struct RpcError {
    pub(crate) code: i64,
    pub(crate) message: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct RpcResponse {
    pub(crate) id: u64,
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
pub(crate) struct HealthResult<'a> {
    pub(crate) status: &'a str,
    pub(crate) engine: &'a str,
    pub(crate) version: &'a str,
}

pub(crate) fn response_error(id: u64, code: i64, message: &str) -> RpcResponse {
    RpcResponse {
        id,
        ok: false,
        result: None,
        error: Some(RpcError {
            code,
            message: message.to_string(),
        }),
    }
}
