use serde::Serialize;
use uxfd_rust_core::{
    build_solid_colour_vertex_scene as build_solid_colour_scene,
    build_video_plane_vertex_scene as build_video_scene, CanvasSize, SceneMediaReference,
    SceneSnapshot, SolidColourSceneError, VideoPlane, VideoPlaneSceneError,
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

#[derive(Serialize)]
struct WasmVideoPlane {
    clip_id: String,
    media_id: String,
    source_frame: u64,
    z_index: u32,
    opacity: f32,
}

#[derive(Serialize)]
struct WasmVideoPlaneVertexSceneSuccess {
    ok: bool,
    plane_count: u32,
    planes: Vec<WasmVideoPlane>,
    vertices: Vec<f32>,
}

#[derive(Serialize)]
struct WasmVideoPlaneVertexSceneFailure {
    ok: bool,
    reason: &'static str,
    detail: String,
}

#[derive(Serialize)]
#[serde(untagged)]
enum WasmVideoPlaneVertexSceneResult {
    Success(WasmVideoPlaneVertexSceneSuccess),
    Failure(WasmVideoPlaneVertexSceneFailure),
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
            return to_solid_js_value(WasmSolidColourVertexSceneResult::Failure(failure(
                "unknown",
                format!("SceneSnapshot payload could not be deserialised: {error}"),
            )));
        }
    };
    let media: Vec<SceneMediaReference> = match serde_wasm_bindgen::from_value(media) {
        Ok(media) => media,
        Err(error) => {
            return to_solid_js_value(WasmSolidColourVertexSceneResult::Failure(failure(
                "unknown",
                format!("Scene media payload could not be deserialised: {error}"),
            )));
        }
    };

    match build_solid_colour_scene(
        &snapshot,
        &media,
        CanvasSize {
            width: canvas_width,
            height: canvas_height,
        },
    ) {
        Ok(scene) => to_solid_js_value(WasmSolidColourVertexSceneResult::Success(
            WasmSolidColourVertexSceneSuccess {
                ok: true,
                rect_count: scene.rect_count,
                vertices: scene.vertices,
            },
        )),
        Err(SolidColourSceneError::UnsupportedColourSource { media_id, detail }) => {
            to_solid_js_value(WasmSolidColourVertexSceneResult::Failure(failure(
                media_id, detail,
            )))
        }
        Err(SolidColourSceneError::InvalidCanvasSize { width, height }) => {
            to_solid_js_value(WasmSolidColourVertexSceneResult::Failure(failure(
                "canvas",
                format!("Canvas size must be positive, got {width}x{height}."),
            )))
        }
    }
}

#[wasm_bindgen]
pub fn build_video_plane_vertex_scene(
    snapshot: JsValue,
    media: JsValue,
    canvas_width: u32,
    canvas_height: u32,
) -> JsValue {
    let snapshot: SceneSnapshot = match serde_wasm_bindgen::from_value(snapshot) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return to_video_js_value(WasmVideoPlaneVertexSceneResult::Failure(video_failure(
                format!("SceneSnapshot payload could not be deserialised: {error}"),
            )));
        }
    };
    let media: Vec<SceneMediaReference> = match serde_wasm_bindgen::from_value(media) {
        Ok(media) => media,
        Err(error) => {
            return to_video_js_value(WasmVideoPlaneVertexSceneResult::Failure(video_failure(
                format!("Scene media payload could not be deserialised: {error}"),
            )));
        }
    };

    match build_video_scene(
        &snapshot,
        &media,
        CanvasSize {
            width: canvas_width,
            height: canvas_height,
        },
    ) {
        Ok(scene) => to_video_js_value(WasmVideoPlaneVertexSceneResult::Success(
            WasmVideoPlaneVertexSceneSuccess {
                ok: true,
                plane_count: scene.plane_count,
                planes: scene.planes.into_iter().map(wasm_video_plane).collect(),
                vertices: scene.vertices,
            },
        )),
        Err(VideoPlaneSceneError::InvalidCanvasSize { width, height }) => {
            to_video_js_value(WasmVideoPlaneVertexSceneResult::Failure(video_failure(
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

fn to_solid_js_value(result: WasmSolidColourVertexSceneResult) -> JsValue {
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

fn video_failure(detail: impl Into<String>) -> WasmVideoPlaneVertexSceneFailure {
    WasmVideoPlaneVertexSceneFailure {
        ok: false,
        reason: "invalidVideoPlaneScene",
        detail: detail.into(),
    }
}

fn wasm_video_plane(plane: VideoPlane) -> WasmVideoPlane {
    WasmVideoPlane {
        clip_id: plane.clip_id,
        media_id: plane.media_id,
        source_frame: plane.source_frame,
        z_index: plane.z_index,
        opacity: plane.opacity,
    }
}

fn to_video_js_value(result: WasmVideoPlaneVertexSceneResult) -> JsValue {
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}
