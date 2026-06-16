use serde::Serialize;
use uxfd_rust_core::{
    build_solid_colour_vertex_scene as build_vertex_scene, CanvasSize, SceneMediaReference,
    SceneSnapshot, SolidColourSceneError,
};
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct WasmSolidColourVertexSceneSuccess {
    ok: bool,
    rect_count: u32,
    vertices: Vec<f32>,
}

#[derive(Serialize)]
struct WasmSolidColourVertexSceneFailure {
    ok: bool,
    reason: &'static str,
    detail: String,
    media_id: String,
}

#[derive(Serialize)]
#[serde(untagged)]
enum WasmSolidColourVertexSceneResult {
    Success(WasmSolidColourVertexSceneSuccess),
    Failure(WasmSolidColourVertexSceneFailure),
}

#[wasm_bindgen]
pub fn build_solid_colour_vertex_scene(
    snapshot: JsValue,
    media: JsValue,
    canvas_width: u32,
    canvas_height: u32,
) -> JsValue {
    let snapshot: SceneSnapshot = match serde_wasm_bindgen::from_value(snapshot) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return to_js_value(WasmSolidColourVertexSceneResult::Failure(failure(
                "unknown",
                format!("SceneSnapshot payload could not be deserialised: {error}"),
            )));
        }
    };
    let media: Vec<SceneMediaReference> = match serde_wasm_bindgen::from_value(media) {
        Ok(media) => media,
        Err(error) => {
            return to_js_value(WasmSolidColourVertexSceneResult::Failure(failure(
                "unknown",
                format!("Scene media payload could not be deserialised: {error}"),
            )));
        }
    };

    match build_vertex_scene(
        &snapshot,
        &media,
        CanvasSize {
            width: canvas_width,
            height: canvas_height,
        },
    ) {
        Ok(scene) => to_js_value(WasmSolidColourVertexSceneResult::Success(
            WasmSolidColourVertexSceneSuccess {
                ok: true,
                rect_count: scene.rect_count,
                vertices: scene.vertices,
            },
        )),
        Err(SolidColourSceneError::UnsupportedColourSource { media_id, detail }) => to_js_value(
            WasmSolidColourVertexSceneResult::Failure(failure(media_id, detail)),
        ),
        Err(SolidColourSceneError::InvalidCanvasSize { width, height }) => {
            to_js_value(WasmSolidColourVertexSceneResult::Failure(failure(
                "canvas",
                format!("Canvas size must be positive, got {width}x{height}."),
            )))
        }
    }
}

fn failure(
    media_id: impl Into<String>,
    detail: impl Into<String>,
) -> WasmSolidColourVertexSceneFailure {
    WasmSolidColourVertexSceneFailure {
        ok: false,
        reason: "unsupportedColourSource",
        detail: detail.into(),
        media_id: media_id.into(),
    }
}

fn to_js_value(result: WasmSolidColourVertexSceneResult) -> JsValue {
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}
